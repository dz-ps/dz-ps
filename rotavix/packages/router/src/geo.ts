const R = 6_371_008.8;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distância haversine em metros (mesma fórmula do pipeline). */
export function distanciaM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dp = rad(lat2 - lat1);
  const dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
