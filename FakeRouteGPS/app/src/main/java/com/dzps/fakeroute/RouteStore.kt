package com.dzps.fakeroute

import android.content.Context
import org.json.JSONArray
import org.osmdroid.util.GeoPoint

/** Salva rotas nomeadas nas preferências do app. */
object RouteStore {
    private const val PREFS = "saved_routes"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun names(ctx: Context): List<String> =
        prefs(ctx).all.keys.sortedBy { it.lowercase() }

    fun save(ctx: Context, name: String, legs: List<List<GeoPoint>>) {
        val json = JSONArray()
        for (leg in legs) {
            val arr = JSONArray()
            for (p in leg) arr.put(JSONArray().put(p.latitude).put(p.longitude))
            json.put(arr)
        }
        prefs(ctx).edit().putString(name, json.toString()).apply()
    }

    fun load(ctx: Context, name: String): List<MutableList<GeoPoint>>? {
        val raw = prefs(ctx).getString(name, null) ?: return null
        return try {
            val json = JSONArray(raw)
            (0 until json.length()).map { i ->
                val arr = json.getJSONArray(i)
                (0 until arr.length()).map { j ->
                    val p = arr.getJSONArray(j)
                    GeoPoint(p.getDouble(0), p.getDouble(1))
                }.toMutableList()
            }
        } catch (e: Exception) {
            null
        }
    }

    fun delete(ctx: Context, name: String) {
        prefs(ctx).edit().remove(name).apply()
    }
}
