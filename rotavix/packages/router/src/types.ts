// Contratos compartilhados (SPEC §5). O motor não depende de UI.
export type Fonte = 'oficial' | 'gtfs_rt' | 'colaborativo' | 'tabela' | 'simulador';

/** Enum OccupancyStatus do GTFS-Realtime. */
export type OccupancyStatus =
  | 'EMPTY' | 'MANY_SEATS_AVAILABLE' | 'FEW_SEATS_AVAILABLE' | 'STANDING_ROOM_ONLY'
  | 'CRUSHED_STANDING_ROOM_ONLY' | 'FULL' | 'NOT_ACCEPTING_PASSENGERS'
  | 'NO_DATA_AVAILABLE' | 'NOT_BOARDABLE';

export type VehicleState = {
  vehicleId: string;
  lineId: string;
  tripId?: string;
  lat: number;
  lon: number;
  bearing?: number;
  speedKmh?: number;
  ts: number; // epoch ms
  source: Fonte;
  confidence: number; // 0..1
  occupancy?: { status: OccupancyStatus; source: string; ts: number };
};

/** Prioridade de fusão (SPEC §3.2): menor índice vence. */
export const PRIORIDADE_FONTE: readonly Fonte[] = ['oficial', 'gtfs_rt', 'colaborativo', 'tabela', 'simulador'];
