package com.dzps.fakeroute

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Cálculos geográficos simples (esfera). */
object Geo {
    private const val EARTH_RADIUS_M = 6_371_000.0

    /** Distância em metros entre dois pontos (haversine). */
    fun distance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * EARTH_RADIUS_M * atan2(sqrt(a), sqrt(1 - a))
    }

    /** Rumo em graus (0 = norte, sentido horário) de 1 para 2. */
    fun bearing(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
        val phi1 = Math.toRadians(lat1)
        val phi2 = Math.toRadians(lat2)
        val dLon = Math.toRadians(lon2 - lon1)
        val y = sin(dLon) * cos(phi2)
        val x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dLon)
        return ((Math.toDegrees(atan2(y, x)) + 360.0) % 360.0).toFloat()
    }

    /** Desloca um ponto alguns metros para norte/leste. Retorna (lat, lon). */
    fun offset(lat: Double, lon: Double, northM: Double, eastM: Double): Pair<Double, Double> {
        val dLat = northM / EARTH_RADIUS_M
        val dLon = eastM / (EARTH_RADIUS_M * cos(Math.toRadians(lat)))
        return Pair(lat + Math.toDegrees(dLat), lon + Math.toDegrees(dLon))
    }
}
