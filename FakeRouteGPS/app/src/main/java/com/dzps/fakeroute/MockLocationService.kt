package com.dzps.fakeroute

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Criteria
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import java.util.Locale
import kotlin.random.Random

/**
 * Serviço em primeiro plano que "anda" pela rota e publica localizações falsas
 * nos provedores GPS, rede e no Fused Location do Google Play Services.
 */
class MockLocationService : Service() {

    companion object {
        const val ACTION_START = "com.dzps.fakeroute.START"
        const val ACTION_PAUSE = "com.dzps.fakeroute.PAUSE"
        const val ACTION_RESUME = "com.dzps.fakeroute.RESUME"
        const val ACTION_STOP = "com.dzps.fakeroute.STOP"
        const val ACTION_SET_SPEED = "com.dzps.fakeroute.SET_SPEED"

        const val EXTRA_LATS = "lats"
        const val EXTRA_LONS = "lons"
        const val EXTRA_SPEED_KMH = "speed_kmh"
        const val EXTRA_LOOP = "loop"
        const val EXTRA_PING_PONG = "ping_pong"
        const val EXTRA_NATURAL = "natural"

        private const val CHANNEL_ID = "mock_route"
        private const val NOTIFICATION_ID = 42
        private const val TICK_MS = 1000L

        fun send(ctx: Context, action: String, extras: Intent.() -> Unit = {}) {
            val intent = Intent(ctx, MockLocationService::class.java).setAction(action).apply(extras)
            if (action == ACTION_START) {
                androidx.core.content.ContextCompat.startForegroundService(ctx, intent)
            } else {
                ctx.startService(intent)
            }
        }
    }

    private lateinit var locationManager: LocationManager
    private var fused: FusedLocationProviderClient? = null
    private val handler = Handler(Looper.getMainLooper())
    private val providers = mutableListOf<String>()

    // Rota (com distâncias acumuladas em metros)
    private var lats = DoubleArray(0)
    private var lons = DoubleArray(0)
    private var cumulative = DoubleArray(0)
    private var speedMs = 1.4
    private var loop = false
    private var pingPong = false
    private var natural = true

    // Progresso
    private var traveled = 0.0
    private var forward = true
    private var lap = 0
    private var paused = false
    private var finished = false
    private var lastTick = 0L
    private var currentSpeedMs = 0.0
    private var ticks = 0

    private val tick = object : Runnable {
        override fun run() {
            val now = SystemClock.elapsedRealtime()
            val dt = (now - lastTick) / 1000.0
            lastTick = now
            if (!paused && !finished) advance(dt) else currentSpeedMs = 0.0
            publishLocation()
            ticks++
            if (ticks % 5 == 0) updateNotification()
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        fused = try {
            LocationServices.getFusedLocationProviderClient(this)
        } catch (e: Exception) {
            null
        }
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action != ACTION_START && action != ACTION_STOP && providers.isEmpty()) {
            // Nada em execução: ignora comandos de pausa/velocidade.
            stopSelf()
            return START_NOT_STICKY
        }
        when (action) {
            ACTION_START -> start(intent!!)
            ACTION_PAUSE -> {
                paused = true
                publishState()
                updateNotification()
            }
            ACTION_RESUME -> {
                paused = false
                lastTick = SystemClock.elapsedRealtime()
                publishState()
                updateNotification()
            }
            ACTION_SET_SPEED -> {
                val kmh = intent.getDoubleExtra(EXTRA_SPEED_KMH, -1.0)
                if (kmh >= 0) speedMs = kmh / 3.6
            }
            ACTION_STOP -> stopAll()
        }
        return START_NOT_STICKY
    }

    private fun start(intent: Intent) {
        // Precisa entrar em primeiro plano logo no início.
        try {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, buildNotification(),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                } else {
                    0
                },
            )
        } catch (e: Exception) {
            fail("Não foi possível iniciar o serviço: ${e.message}")
            return
        }

        val newLats = intent.getDoubleArrayExtra(EXTRA_LATS) ?: DoubleArray(0)
        val newLons = intent.getDoubleArrayExtra(EXTRA_LONS) ?: DoubleArray(0)
        if (newLats.isEmpty() || newLats.size != newLons.size) {
            fail("Rota vazia")
            return
        }
        speedMs = intent.getDoubleExtra(EXTRA_SPEED_KMH, 5.0) / 3.6
        loop = intent.getBooleanExtra(EXTRA_LOOP, false)
        pingPong = intent.getBooleanExtra(EXTRA_PING_PONG, false)
        natural = intent.getBooleanExtra(EXTRA_NATURAL, true)

        var la = newLats
        var lo = newLons
        // Circuito: fecha a rota voltando ao início (sem teleporte).
        if (loop && !pingPong && la.size > 1 &&
            Geo.distance(la.last(), lo.last(), la.first(), lo.first()) > 1.0
        ) {
            la += la.first()
            lo += lo.first()
        }
        lats = la
        lons = lo
        cumulative = DoubleArray(lats.size)
        for (i in 1 until lats.size) {
            cumulative[i] = cumulative[i - 1] + Geo.distance(lats[i - 1], lons[i - 1], lats[i], lons[i])
        }

        traveled = 0.0
        forward = true
        lap = 0
        paused = false
        finished = cumulative.last() <= 0.0 && lats.size == 1
        ticks = 0

        if (!setupProviders()) {
            fail(
                "O Android recusou a localização falsa.\n\n" +
                    "Ative as Opções do desenvolvedor e em \"Selecionar app de local fictício\" " +
                    "escolha FakeRoute GPS.",
            )
            return
        }

        handler.removeCallbacks(tick)
        lastTick = SystemClock.elapsedRealtime()
        handler.post(tick)
        publishState()
    }

    // ---------------------------------------------------------------- simulação

    private fun advance(dt: Double) {
        val total = cumulative.last()
        if (total <= 0.0) {
            currentSpeedMs = 0.0
            finished = true
            return
        }
        var v = speedMs
        if (natural && v > 0) v *= 0.85 + Random.nextDouble() * 0.3
        currentSpeedMs = v
        var d = v * dt
        while (d > 1e-9 && !finished) {
            if (forward) {
                val remaining = total - traveled
                if (d < remaining) {
                    traveled += d
                    d = 0.0
                } else {
                    traveled = total
                    d -= remaining
                    when {
                        pingPong -> forward = false
                        loop -> {
                            traveled = 0.0
                            lap++
                        }
                        else -> finished = true
                    }
                }
            } else {
                if (d < traveled) {
                    traveled -= d
                    d = 0.0
                } else {
                    d -= traveled
                    traveled = 0.0
                    lap++
                    if (loop) forward = true else finished = true
                }
            }
        }
        if (finished) {
            currentSpeedMs = 0.0
            updateNotification()
        }
    }

    /** Posição e rumo na distância percorrida atual: (lat, lon, rumo). */
    private fun currentPosition(): Triple<Double, Double, Float> {
        if (lats.size == 1) return Triple(lats[0], lons[0], 0f)
        var i = cumulative.binarySearch(traveled)
        if (i < 0) i = -i - 2
        i = i.coerceIn(0, lats.size - 2)
        val segLen = cumulative[i + 1] - cumulative[i]
        val f = if (segLen > 0) ((traveled - cumulative[i]) / segLen).coerceIn(0.0, 1.0) else 0.0
        val lat = lats[i] + (lats[i + 1] - lats[i]) * f
        val lon = lons[i] + (lons[i + 1] - lons[i]) * f
        var bearing = Geo.bearing(lats[i], lons[i], lats[i + 1], lons[i + 1])
        if (!forward) bearing = (bearing + 180f) % 360f
        return Triple(lat, lon, bearing)
    }

    // --------------------------------------------------------------- provedores

    @Suppress("DEPRECATION")
    private fun setupProviders(): Boolean {
        cleanupProviders()
        for (name in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            try {
                try {
                    locationManager.removeTestProvider(name)
                } catch (_: Exception) {
                }
                locationManager.addTestProvider(
                    name, false, false, false, false, true, true, true,
                    Criteria.POWER_LOW, Criteria.ACCURACY_FINE,
                )
                locationManager.setTestProviderEnabled(name, true)
                providers += name
            } catch (e: SecurityException) {
                cleanupProviders()
                return false
            } catch (e: Exception) {
                // Alguns aparelhos não têm o provedor de rede; seguimos com os outros.
            }
        }
        if (providers.isEmpty()) return false
        try {
            fused?.setMockMode(true)
        } catch (_: Exception) {
        }
        return true
    }

    private fun cleanupProviders() {
        for (name in providers) {
            try {
                locationManager.setTestProviderEnabled(name, false)
            } catch (_: Exception) {
            }
            try {
                locationManager.removeTestProvider(name)
            } catch (_: Exception) {
            }
        }
        providers.clear()
        try {
            fused?.setMockMode(false)
        } catch (_: Exception) {
        }
    }

    @SuppressLint("MissingPermission")
    private fun publishLocation() {
        var (lat, lon, bearing) = currentPosition()
        var accuracy = 3f
        if (natural) {
            // Pequeno "ruído" como um GPS de verdade.
            val (nLat, nLon) = Geo.offset(lat, lon, Random.nextDouble(-1.5, 1.5), Random.nextDouble(-1.5, 1.5))
            lat = nLat
            lon = nLon
            accuracy = 3f + Random.nextFloat() * 5f
            bearing = (bearing + Random.nextFloat() * 6f - 3f + 360f) % 360f
        }
        for (name in providers + "fused") {
            val loc = Location(name).apply {
                latitude = lat
                longitude = lon
                altitude = 10.0
                this.accuracy = accuracy
                speed = currentSpeedMs.toFloat()
                if (currentSpeedMs > 0) this.bearing = bearing
                time = System.currentTimeMillis()
                elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    bearingAccuracyDegrees = 5f
                    speedAccuracyMetersPerSecond = 0.5f
                    verticalAccuracyMeters = 3f
                }
            }
            try {
                if (name == "fused") {
                    fused?.setMockLocation(loc)
                } else {
                    locationManager.setTestProviderLocation(name, loc)
                }
            } catch (_: Exception) {
            }
        }
        publishState(lat, lon)
    }

    // ------------------------------------------------------------------- estado

    private fun publishState(lat: Double? = null, lon: Double? = null) {
        val pos = if (lat == null || lon == null) currentPosition() else null
        RouteState.status.value = RouteState.Status(
            mode = when {
                providers.isEmpty() -> RouteState.Mode.IDLE
                finished -> RouteState.Mode.FINISHED
                paused -> RouteState.Mode.PAUSED
                else -> RouteState.Mode.RUNNING
            },
            lat = lat ?: pos!!.first,
            lon = lon ?: pos!!.second,
            traveledM = traveled,
            totalM = cumulative.lastOrNull() ?: 0.0,
            speedKmh = currentSpeedMs * 3.6,
            lap = lap,
        )
    }

    private fun fail(message: String) {
        handler.removeCallbacks(tick)
        cleanupProviders()
        RouteState.status.value = RouteState.Status(error = message)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun stopAll() {
        handler.removeCallbacks(tick)
        cleanupProviders()
        RouteState.status.value = RouteState.Status()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        if (providers.isNotEmpty()) {
            cleanupProviders()
            RouteState.status.value = RouteState.Status()
        }
        super.onDestroy()
    }

    // ------------------------------------------------------------- notificação

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Simulação de rota", NotificationManager.IMPORTANCE_LOW),
            )
        }
    }

    private fun servicePending(action: String, code: Int): PendingIntent =
        PendingIntent.getService(
            this, code,
            Intent(this, MockLocationService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun buildNotification(): android.app.Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val total = cumulative.lastOrNull() ?: 0.0
        val text = when {
            total <= 0 -> "Posição fixa"
            finished -> "Rota concluída — mantendo posição final"
            paused -> "Pausado"
            else -> String.format(
                Locale.getDefault(), "%.2f / %.2f km • %.1f km/h",
                traveled / 1000, total / 1000, speedMs * 3.6,
            )
        }
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Localização falsa ativa")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
        if (total > 0 && !finished) {
            if (paused) {
                builder.addAction(0, "Continuar", servicePending(ACTION_RESUME, 1))
            } else {
                builder.addAction(0, "Pausar", servicePending(ACTION_PAUSE, 2))
            }
        }
        builder.addAction(0, "Parar", servicePending(ACTION_STOP, 3))
        return builder.build()
    }

    @SuppressLint("MissingPermission")
    private fun updateNotification() {
        if (providers.isEmpty()) return
        try {
            androidx.core.app.NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, buildNotification())
        } catch (_: Exception) {
        }
    }
}
