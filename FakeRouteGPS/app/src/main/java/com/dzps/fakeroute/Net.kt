package com.dzps.fakeroute

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.osmdroid.util.GeoPoint
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale

/** Serviços online gratuitos do OpenStreetMap (sem chave de API). */
object Net {
    private const val USER_AGENT = "FakeRouteGPS/1.0 (Android)"

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.setRequestProperty("User-Agent", USER_AGENT)
        try {
            val code = conn.responseCode
            if (code !in 200..299) throw IllegalStateException("HTTP $code")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Caminho pelas ruas entre dois pontos usando OSRM (routing.openstreetmap.de).
     * profile: "foot", "bike" ou "car".
     */
    suspend fun route(from: GeoPoint, to: GeoPoint, profile: String): List<GeoPoint> =
        withContext(Dispatchers.IO) {
            val coords = String.format(
                Locale.US, "%.6f,%.6f;%.6f,%.6f",
                from.longitude, from.latitude, to.longitude, to.latitude,
            )
            val url = "https://routing.openstreetmap.de/routed-$profile/route/v1/driving/" +
                "$coords?overview=full&geometries=geojson"
            val json = JSONObject(get(url))
            if (json.optString("code") != "Ok") throw IllegalStateException(json.optString("code"))
            val line = json.getJSONArray("routes").getJSONObject(0)
                .getJSONObject("geometry").getJSONArray("coordinates")
            (0 until line.length()).map { i ->
                val c = line.getJSONArray(i)
                GeoPoint(c.getDouble(1), c.getDouble(0))
            }
        }

    /** Busca de endereço usando Nominatim. */
    suspend fun search(query: String): GeoPoint? = withContext(Dispatchers.IO) {
        val url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
            URLEncoder.encode(query, "UTF-8")
        val arr = JSONArray(get(url))
        if (arr.length() == 0) {
            null
        } else {
            val o = arr.getJSONObject(0)
            GeoPoint(o.getString("lat").toDouble(), o.getString("lon").toDouble())
        }
    }
}
