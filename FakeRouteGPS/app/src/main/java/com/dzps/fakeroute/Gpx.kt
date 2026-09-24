package com.dzps.fakeroute

import android.util.Xml
import org.osmdroid.util.GeoPoint
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.io.OutputStream
import java.util.Locale

/** Importação/exportação de arquivos GPX. */
object Gpx {
    /** Lê trilhas (trkpt); se não houver, rotas (rtept); senão, waypoints (wpt). */
    fun parse(input: InputStream): List<GeoPoint> {
        val trk = mutableListOf<GeoPoint>()
        val rte = mutableListOf<GeoPoint>()
        val wpt = mutableListOf<GeoPoint>()
        val parser = Xml.newPullParser()
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        parser.setInput(input, null)
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG) {
                val target = when (parser.name.substringAfter(':')) {
                    "trkpt" -> trk
                    "rtept" -> rte
                    "wpt" -> wpt
                    else -> null
                }
                if (target != null) {
                    val lat = parser.getAttributeValue(null, "lat")?.toDoubleOrNull()
                    val lon = parser.getAttributeValue(null, "lon")?.toDoubleOrNull()
                    if (lat != null && lon != null) target.add(GeoPoint(lat, lon))
                }
            }
            event = parser.next()
        }
        return trk.ifEmpty { rte.ifEmpty { wpt } }
    }

    fun write(output: OutputStream, name: String, points: List<GeoPoint>) {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
        sb.append("<gpx version=\"1.1\" creator=\"FakeRouteGPS\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n")
        sb.append("  <trk><name>").append(escape(name)).append("</name><trkseg>\n")
        for (p in points) {
            sb.append(String.format(Locale.US, "    <trkpt lat=\"%.7f\" lon=\"%.7f\"/>\n", p.latitude, p.longitude))
        }
        sb.append("  </trkseg></trk>\n</gpx>\n")
        output.write(sb.toString().toByteArray(Charsets.UTF_8))
    }

    private fun escape(s: String) =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
}
