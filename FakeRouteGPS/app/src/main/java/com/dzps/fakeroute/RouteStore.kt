package com.dzps.fakeroute

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import org.osmdroid.util.GeoPoint

/** Salva rotas nomeadas nas preferências do app. */
object RouteStore {
    private const val PREFS = "saved_routes"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun names(ctx: Context): List<String> =
        prefs(ctx).all.keys.sortedBy { it.lowercase() }

    class Saved(val legs: List<MutableList<GeoPoint>>, val waits: List<Int>)

    fun save(ctx: Context, name: String, legs: List<List<GeoPoint>>, waits: List<Int>) {
        val legsJson = JSONArray()
        for (leg in legs) {
            val arr = JSONArray()
            for (p in leg) arr.put(JSONArray().put(p.latitude).put(p.longitude))
            legsJson.put(arr)
        }
        val json = JSONObject()
            .put("legs", legsJson)
            .put("waits", JSONArray(waits))
        prefs(ctx).edit().putString(name, json.toString()).apply()
    }

    fun load(ctx: Context, name: String): Saved? {
        val raw = prefs(ctx).getString(name, null) ?: return null
        return try {
            // Formato antigo: só a lista de trechos, sem paradas.
            val obj = if (raw.trimStart().startsWith("[")) null else JSONObject(raw)
            val legsJson = obj?.getJSONArray("legs") ?: JSONArray(raw)
            val legs = (0 until legsJson.length()).map { i ->
                val arr = legsJson.getJSONArray(i)
                (0 until arr.length()).map { j ->
                    val p = arr.getJSONArray(j)
                    GeoPoint(p.getDouble(0), p.getDouble(1))
                }.toMutableList()
            }
            val waitsJson = obj?.optJSONArray("waits")
            val waits = legs.indices.map { i -> waitsJson?.optInt(i, 0) ?: 0 }
            Saved(legs, waits)
        } catch (e: Exception) {
            null
        }
    }

    fun delete(ctx: Context, name: String) {
        prefs(ctx).edit().remove(name).apply()
    }
}
