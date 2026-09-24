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
        /** Segundos restantes de parada (0 = andando). */
        val waitingS: Int = 0,
        /** Número do ponto onde está parado (1 = início). */
        val stopNumber: Int = 0,
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

    /** Tempo de parada (segundos) no ponto final de cada trecho; mesmo tamanho de [legs]. */
    val waits = mutableListOf<Int>()

    fun path(): List<GeoPoint> = legs.flatten()

    fun addLeg(leg: MutableList<GeoPoint>, waitS: Int = 0) {
        legs.add(leg)
        waits.add(waitS)
    }

    fun removeLastLeg() {
        if (legs.isEmpty()) return
        legs.removeAt(legs.size - 1)
        waits.removeAt(waits.size - 1)
    }

    fun clear() {
        legs.clear()
        waits.clear()
    }

    fun setAll(newLegs: List<MutableList<GeoPoint>>, newWaits: List<Int>) {
        clear()
        newLegs.forEachIndexed { i, leg -> addLeg(leg, newWaits.getOrElse(i) { 0 }) }
    }

    /** Índice, no caminho completo, do ponto final de cada trecho. */
    fun waypointPathIndices(): IntArray {
        var idx = -1
        return IntArray(legs.size) { i ->
            idx += legs[i].size
            idx
        }
    }

    fun totalWaitS(): Int = waits.sum()
}
