package com.dzps.fakeroute

import kotlinx.coroutines.flow.MutableStateFlow
import org.osmdroid.util.GeoPoint

/** Estado compartilhado entre a tela e o serviço de simulação. */
object RouteState {
    enum class Mode { IDLE, RUNNING, PAUSED, FINISHED }

    data class Status(
        val mode: Mode = Mode.IDLE,
        val lat: Double = 0.0,
        val lon: Double = 0.0,
        val traveledM: Double = 0.0,
        val totalM: Double = 0.0,
        val speedKmh: Double = 0.0,
        val lap: Int = 0,
        val error: String? = null,
    ) {
        val active: Boolean get() = mode != Mode.IDLE
    }

    val status = MutableStateFlow(Status())

    /**
     * Rota em edição. Cada "trecho" termina em um ponto tocado pelo usuário;
     * com "Seguir ruas" o trecho contém o caminho completo pelas ruas.
     */
    val legs = mutableListOf<MutableList<GeoPoint>>()

    fun path(): List<GeoPoint> = legs.flatten()
}
