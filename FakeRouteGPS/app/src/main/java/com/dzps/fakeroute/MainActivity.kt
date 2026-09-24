package com.dzps.fakeroute

import android.Manifest
import android.annotation.SuppressLint
import android.app.AppOpsManager
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.provider.Settings
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.dzps.fakeroute.databinding.ActivityMainBinding
import kotlinx.coroutines.launch
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private data class TravelMode(val label: String, val kmh: Double, val profile: String)

    private val modes = listOf(
        TravelMode("Caminhada", 5.0, "foot"),
        TravelMode("Corrida", 10.0, "foot"),
        TravelMode("Bicicleta", 18.0, "bike"),
        TravelMode("Carro", 40.0, "car"),
    )

    private lateinit var b: ActivityMainBinding
    private val legs get() = RouteState.legs
    private val routeLine = Polyline()
    private val waypointMarkers = mutableListOf<Marker>()
    private lateinit var positionMarker: Marker
    private var routingBusy = false
    private var centeredOnUser = false
    private var lastMode = RouteState.Mode.IDLE

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            centerOnLastKnownLocation()
        }

    private val importGpx =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(::importGpxFrom) }

    private val exportGpx =
        registerForActivityResult(ActivityResultContracts.CreateDocument("application/gpx+xml")) { uri ->
            uri?.let(::exportGpxTo)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Configuration.getInstance().load(this, getSharedPreferences("osmdroid", MODE_PRIVATE))
        Configuration.getInstance().userAgentValue = packageName

        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        setupMap()
        setupControls()
        redrawRoute()

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                RouteState.status.collect { render(it) }
            }
        }

        requestPermissionsIfNeeded()
    }

    override fun onResume() {
        super.onResume()
        b.map.onResume()
    }

    override fun onPause() {
        b.map.onPause()
        super.onPause()
    }

    // ---------------------------------------------------------------------- mapa

    private fun setupMap() {
        val map = b.map
        map.setTileSource(TileSourceFactory.MAPNIK)
        map.setMultiTouchControls(true)
        map.zoomController.setVisibility(CustomZoomButtonsController.Visibility.SHOW_AND_FADEOUT)
        map.controller.setZoom(16.0)
        val path = RouteState.path()
        map.controller.setCenter(path.firstOrNull() ?: GeoPoint(-23.5505, -46.6333))

        map.overlays.add(
            MapEventsOverlay(object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean {
                    p?.let(::onMapTap)
                    return true
                }

                override fun longPressHelper(p: GeoPoint?): Boolean {
                    p?.let(::onMapLongPress)
                    return true
                }
            }),
        )

        routeLine.outlinePaint.color = 0xFF1E88E5.toInt()
        routeLine.outlinePaint.strokeWidth = 10f
        map.overlays.add(routeLine)

        positionMarker = Marker(map).apply {
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            icon = ContextCompat.getDrawable(this@MainActivity, R.drawable.ic_position)
            setInfoWindow(null)
            setOnMarkerClickListener { _, _ -> true }
        }
    }

    private fun onMapTap(p: GeoPoint) {
        if (RouteState.status.value.active) {
            toast("Pare a simulação para editar a rota")
            return
        }
        if (routingBusy) return
        if (legs.isEmpty() || !b.cbSnap.isChecked) {
            legs.add(mutableListOf(p))
            redrawRoute()
            return
        }
        val from = legs.last().last()
        setBusy(true)
        lifecycleScope.launch {
            val leg = try {
                Net.route(from, p, currentMode().profile).toMutableList()
            } catch (e: Exception) {
                toast("Não consegui buscar as ruas (${e.message}). Usando linha reta.")
                mutableListOf(p)
            }
            if (leg.isNotEmpty() &&
                Geo.distance(leg[0].latitude, leg[0].longitude, from.latitude, from.longitude) < 0.5
            ) {
                leg.removeAt(0)
            }
            if (leg.isEmpty()) leg.add(p)
            legs.add(leg)
            setBusy(false)
            redrawRoute()
        }
    }

    private fun onMapLongPress(p: GeoPoint) {
        AlertDialog.Builder(this)
            .setTitle("Teleportar")
            .setMessage(String.format(Locale.US, "Fixar a localização em\n%.6f, %.6f ?", p.latitude, p.longitude))
            .setPositiveButton("Teleportar") { _, _ -> startSimulation(listOf(p), 0.0) }
            .setNeutralButton("Adicionar à rota") { _, _ -> onMapTap(p) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun redrawRoute() {
        val map = b.map
        val path = RouteState.path()
        routeLine.setPoints(path)
        waypointMarkers.forEach { map.overlays.remove(it) }
        waypointMarkers.clear()
        legs.forEachIndexed { i, leg ->
            val m = Marker(map).apply {
                position = leg.last()
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                icon = ContextCompat.getDrawable(
                    this@MainActivity,
                    if (i == 0) R.drawable.ic_start else R.drawable.ic_waypoint,
                )
                title = if (i == 0) "Início" else "Ponto ${i + 1}"
                setInfoWindow(null)
                setOnMarkerClickListener { marker, _ ->
                    toast(marker.title)
                    true
                }
            }
            waypointMarkers += m
            map.overlays.add(m)
        }
        // Mantém o marcador de posição por cima de tudo.
        if (map.overlays.remove(positionMarker)) map.overlays.add(positionMarker)
        map.invalidate()
        updateInfo()
    }

    // ------------------------------------------------------------------ controles

    private fun setupControls() {
        b.spMode.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item, modes.map { it.label },
        )
        b.spMode.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                b.etSpeed.setText(formatNumber(modes[position].kmh))
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
        b.etSpeed.setText(formatNumber(modes[0].kmh))
        b.etSpeed.doAfterTextChanged {
            updateInfo()
            val speed = speedKmh()
            if (speed != null && RouteState.status.value.active) {
                MockLocationService.send(this, MockLocationService.ACTION_SET_SPEED) {
                    putExtra(MockLocationService.EXTRA_SPEED_KMH, speed)
                }
            }
        }

        b.btnUndo.setOnClickListener {
            if (RouteState.status.value.active) return@setOnClickListener toast("Pare a simulação primeiro")
            if (legs.isNotEmpty()) {
                legs.removeAt(legs.size - 1)
                redrawRoute()
            }
        }
        b.btnClear.setOnClickListener {
            if (RouteState.status.value.active) return@setOnClickListener toast("Pare a simulação primeiro")
            if (legs.isEmpty()) return@setOnClickListener
            AlertDialog.Builder(this)
                .setMessage("Apagar todos os pontos da rota?")
                .setPositiveButton("Apagar") { _, _ ->
                    legs.clear()
                    redrawRoute()
                }
                .setNegativeButton("Cancelar", null)
                .show()
        }

        b.btnStart.setOnClickListener {
            val path = RouteState.path()
            if (path.isEmpty()) return@setOnClickListener toast("Toque no mapa para criar a rota")
            val speed = speedKmh() ?: return@setOnClickListener toast("Velocidade inválida")
            startSimulation(path, speed)
        }
        b.btnPause.setOnClickListener {
            val action = if (RouteState.status.value.mode == RouteState.Mode.PAUSED) {
                MockLocationService.ACTION_RESUME
            } else {
                MockLocationService.ACTION_PAUSE
            }
            MockLocationService.send(this, action)
        }
        b.btnStop.setOnClickListener { MockLocationService.send(this, MockLocationService.ACTION_STOP) }

        b.btnSearch.setOnClickListener { search() }
        b.etSearch.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                search()
                true
            } else {
                false
            }
        }
    }

    private fun currentMode() = modes[b.spMode.selectedItemPosition.coerceIn(0, modes.size - 1)]

    private fun speedKmh(): Double? =
        b.etSpeed.text.toString().replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 && it < 1000 }

    private fun startSimulation(points: List<GeoPoint>, speedKmh: Double) {
        if (!hasLocationPermission()) {
            requestPermissionsIfNeeded()
            toast("Permita o acesso à localização")
            return
        }
        if (!isMockLocationAppSelected()) {
            showMockSetupDialog()
            return
        }
        MockLocationService.send(this, MockLocationService.ACTION_START) {
            putExtra(MockLocationService.EXTRA_LATS, points.map { it.latitude }.toDoubleArray())
            putExtra(MockLocationService.EXTRA_LONS, points.map { it.longitude }.toDoubleArray())
            putExtra(MockLocationService.EXTRA_SPEED_KMH, speedKmh)
            putExtra(MockLocationService.EXTRA_LOOP, b.cbLoop.isChecked)
            putExtra(MockLocationService.EXTRA_PING_PONG, b.cbPingPong.isChecked)
            putExtra(MockLocationService.EXTRA_NATURAL, b.cbNatural.isChecked)
        }
    }

    private fun search() {
        val query = b.etSearch.text.toString().trim()
        if (query.isEmpty()) return
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
            .hideSoftInputFromWindow(b.etSearch.windowToken, 0)
        setBusy(true)
        lifecycleScope.launch {
            try {
                val p = Net.search(query)
                if (p == null) {
                    toast("Nada encontrado")
                } else {
                    b.map.controller.setZoom(17.0)
                    b.map.controller.animateTo(p)
                }
            } catch (e: Exception) {
                toast("Falha na busca: ${e.message}")
            }
            setBusy(false)
        }
    }

    private fun setBusy(busy: Boolean) {
        routingBusy = busy
        b.progress.visibility = if (busy) View.VISIBLE else View.GONE
    }

    // --------------------------------------------------------------------- estado

    private fun render(s: RouteState.Status) {
        s.error?.let { msg ->
            RouteState.status.value = s.copy(error = null)
            if (msg.contains("local fictício")) showMockSetupDialog() else showMessage("Erro", msg)
        }

        val active = s.active
        b.btnStart.isEnabled = !active
        b.btnPause.isEnabled = active && s.mode != RouteState.Mode.FINISHED && s.totalM > 0
        b.btnPause.text = if (s.mode == RouteState.Mode.PAUSED) "Continuar" else "Pausar"
        b.btnStop.isEnabled = active
        b.btnUndo.isEnabled = !active
        b.btnClear.isEnabled = !active
        b.cbLoop.isEnabled = !active
        b.cbPingPong.isEnabled = !active
        b.cbNatural.isEnabled = !active
        b.cbSnap.isEnabled = !active

        val map = b.map
        if (active) {
            positionMarker.position = GeoPoint(s.lat, s.lon)
            if (!map.overlays.contains(positionMarker)) map.overlays.add(positionMarker)
            if (lastMode == RouteState.Mode.IDLE) map.controller.animateTo(positionMarker.position)
        } else {
            map.overlays.remove(positionMarker)
        }
        map.invalidate()
        lastMode = s.mode
        updateInfo()
    }

    private fun updateInfo() {
        val s = RouteState.status.value
        b.tvInfo.text = when {
            s.active && s.totalM <= 0 -> String.format(
                Locale.US, "📍 Posição fixa: %.6f, %.6f", s.lat, s.lon,
            )
            s.active -> {
                val state = when (s.mode) {
                    RouteState.Mode.PAUSED -> "⏸ Pausado"
                    RouteState.Mode.FINISHED -> "✅ Concluído"
                    else -> "▶ Andando"
                }
                val lap = if (s.lap > 0) " • volta ${s.lap + 1}" else ""
                String.format(
                    Locale.getDefault(), "%s • %.2f / %.2f km • %.1f km/h%s",
                    state, s.traveledM / 1000, s.totalM / 1000, s.speedKmh, lap,
                )
            }
            else -> {
                val path = RouteState.path()
                if (path.isEmpty()) {
                    "Toque no mapa para adicionar pontos da rota"
                } else {
                    var dist = 0.0
                    for (i in 1 until path.size) {
                        dist += Geo.distance(
                            path[i - 1].latitude, path[i - 1].longitude,
                            path[i].latitude, path[i].longitude,
                        )
                    }
                    val speed = speedKmh()
                    val eta = if (speed != null) " • ~${formatDuration(dist / (speed / 3.6))}" else ""
                    String.format(
                        Locale.getDefault(), "%d pontos • %.2f km%s", legs.size, dist / 1000, eta,
                    )
                }
            }
        }
    }

    // ----------------------------------------------------------------------- menu

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.action_save -> saveRouteDialog()
            R.id.action_open -> openRouteDialog()
            R.id.action_import -> importGpx.launch(arrayOf("*/*"))
            R.id.action_export -> {
                if (RouteState.path().isEmpty()) toast("A rota está vazia") else exportGpx.launch("rota.gpx")
            }
            R.id.action_help -> showHelp()
            else -> return super.onOptionsItemSelected(item)
        }
        return true
    }

    private fun saveRouteDialog() {
        if (legs.isEmpty()) return toast("A rota está vazia")
        val input = EditText(this).apply { hint = "Nome da rota" }
        AlertDialog.Builder(this)
            .setTitle("Salvar rota")
            .setView(input)
            .setPositiveButton("Salvar") { _, _ ->
                val name = input.text.toString().trim().ifEmpty { "Rota ${RouteStore.names(this).size + 1}" }
                RouteStore.save(this, name, legs)
                toast("Rota \"$name\" salva")
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun openRouteDialog() {
        if (RouteState.status.value.active) return toast("Pare a simulação primeiro")
        val names = RouteStore.names(this)
        if (names.isEmpty()) return toast("Nenhuma rota salva")
        AlertDialog.Builder(this)
            .setTitle("Rotas salvas")
            .setItems(names.toTypedArray()) { _, which ->
                val name = names[which]
                AlertDialog.Builder(this)
                    .setTitle(name)
                    .setPositiveButton("Abrir") { _, _ ->
                        val loaded = RouteStore.load(this, name)
                        if (loaded == null) {
                            toast("Não foi possível ler a rota")
                        } else {
                            legs.clear()
                            legs.addAll(loaded)
                            redrawRoute()
                            zoomToRoute()
                        }
                    }
                    .setNeutralButton("Excluir") { _, _ ->
                        RouteStore.delete(this, name)
                        toast("Rota excluída")
                    }
                    .setNegativeButton("Cancelar", null)
                    .show()
            }
            .show()
    }

    private fun importGpxFrom(uri: Uri) {
        if (RouteState.status.value.active) return toast("Pare a simulação primeiro")
        val points = try {
            contentResolver.openInputStream(uri)?.use { Gpx.parse(it) } ?: emptyList()
        } catch (e: Exception) {
            return toast("GPX inválido: ${e.message}")
        }
        if (points.isEmpty()) return toast("Nenhum ponto encontrado no GPX")
        legs.clear()
        legs.add(mutableListOf(points.first()))
        if (points.size > 1) legs.add(points.drop(1).toMutableList())
        redrawRoute()
        zoomToRoute()
        toast("${points.size} pontos importados")
    }

    private fun exportGpxTo(uri: Uri) {
        try {
            contentResolver.openOutputStream(uri)?.use { Gpx.write(it, "FakeRoute", RouteState.path()) }
            toast("GPX exportado")
        } catch (e: Exception) {
            toast("Falha ao exportar: ${e.message}")
        }
    }

    private fun zoomToRoute() {
        val path = RouteState.path()
        if (path.isEmpty()) return
        if (path.size == 1) {
            b.map.controller.animateTo(path[0])
            return
        }
        b.map.post {
            b.map.zoomToBoundingBox(
                org.osmdroid.util.BoundingBox.fromGeoPointsSafe(path).increaseByScale(1.3f),
                true,
            )
        }
    }

    // ------------------------------------------------------ permissões / ajuda

    private fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun requestPermissionsIfNeeded() {
        val needed = mutableListOf<String>()
        if (!hasLocationPermission()) {
            needed += Manifest.permission.ACCESS_FINE_LOCATION
            needed += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            needed += Manifest.permission.POST_NOTIFICATIONS
        }
        if (needed.isEmpty()) centerOnLastKnownLocation() else permissionLauncher.launch(needed.toTypedArray())
    }

    @SuppressLint("MissingPermission")
    private fun centerOnLastKnownLocation() {
        if (centeredOnUser || legs.isNotEmpty() || !hasLocationPermission()) return
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        val loc = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .maxByOrNull { it.time }
        if (loc != null) {
            centeredOnUser = true
            b.map.controller.setCenter(GeoPoint(loc.latitude, loc.longitude))
        }
    }

    private fun isMockLocationAppSelected(): Boolean = try {
        val ops = getSystemService(APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_MOCK_LOCATION, Process.myUid(), packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_MOCK_LOCATION, Process.myUid(), packageName)
        }
        mode == AppOpsManager.MODE_ALLOWED
    } catch (e: Exception) {
        true // Não dá para verificar; o serviço avisa se falhar.
    }

    private fun showMockSetupDialog() {
        AlertDialog.Builder(this)
            .setTitle("Configuração necessária")
            .setMessage(
                "Para o Android aceitar a localização falsa:\n\n" +
                    "1. Ative as Opções do desenvolvedor (Configurações › Sobre o telefone › " +
                    "toque 7 vezes em \"Número da versão\").\n" +
                    "2. Em Opções do desenvolvedor, toque em \"Selecionar app de local fictício\" " +
                    "e escolha FakeRoute GPS.\n" +
                    "3. Volte aqui e toque em Iniciar.",
            )
            .setPositiveButton("Abrir opções do desenvolvedor") { _, _ ->
                try {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
                } catch (e: Exception) {
                    startActivity(Intent(Settings.ACTION_SETTINGS))
                }
            }
            .setNegativeButton("Fechar", null)
            .show()
    }

    private fun showHelp() {
        showMessage(
            "Como usar",
            "• Toque no mapa para adicionar pontos. Com \"Seguir ruas\" ligado, o caminho " +
                "segue as ruas (precisa de internet).\n" +
                "• Segure o dedo no mapa para teleportar para um ponto fixo.\n" +
                "• Escolha o modo (caminhada, corrida…) ou digite a velocidade em km/h. " +
                "Dá para mudar a velocidade durante a simulação.\n" +
                "• Repetir (circuito): ao chegar no fim, volta ao início e continua.\n" +
                "• Ida e volta: ao chegar no fim, faz o caminho de volta.\n" +
                "• Variação natural: pequenas variações de velocidade e precisão, como um GPS real.\n" +
                "• Salve rotas ou importe/exporte arquivos GPX pelo menu.\n\n" +
                "Antes do primeiro uso, selecione este app em Opções do desenvolvedor › " +
                "\"Selecionar app de local fictício\".\n\n" +
                "Ao tocar em Parar, o GPS real volta a funcionar.",
        )
    }

    private fun showMessage(title: String, msg: String) {
        AlertDialog.Builder(this).setTitle(title).setMessage(msg).setPositiveButton("OK", null).show()
    }

    // ---------------------------------------------------------------- utilidades

    private fun toast(msg: String?) {
        Toast.makeText(this, msg ?: "", Toast.LENGTH_SHORT).show()
    }

    private fun formatNumber(v: Double) =
        if (v % 1.0 == 0.0) v.toInt().toString() else String.format(Locale.US, "%.1f", v)

    private fun formatDuration(seconds: Double): String {
        val total = seconds.toLong()
        val h = total / 3600
        val m = (total % 3600) / 60
        return when {
            h > 0 -> "${h}h ${m}min"
            m > 0 -> "$m min"
            else -> "${total}s"
        }
    }
}
