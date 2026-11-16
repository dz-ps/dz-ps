/** Mapa (carregado sob demanda). Base PMTiles do OPFS; sem pacote de mapa, mostra só pontos e rotas. */
import { layers, namedFlavor } from '@protomaps/basemaps';
import { CORES_SERVICO, criarTemas } from '@rotavix/ui';
import { addProtocol, type GeoJSONSource, LngLatBounds, Map as MapaGL, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import urlWorkerMapa from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FileSource, PMTiles, Protocol } from 'pmtiles';
import { useEffect, useRef } from 'react';
import { brand } from '../brand';
import { temaEfetivo, useEstado } from '../estado';
import { obterMotor } from '../motor/cliente';
import type { OpcaoMapa } from '../motor/worker';

// MapLibre 6 roda o worker como módulo separado; o Vite empacota e o service worker põe no cache.
setWorkerUrl(urlWorkerMapa);
const protocolo = new Protocol();
addProtocol('pmtiles', protocolo.tile);

const VAZIO: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const CENTRO: [number, number] = [-40.3, -20.3];

function estilo(arquivo: File | null, escuro: boolean): StyleSpecification {
  const base = location.origin + '/map-assets';
  const t = escuro ? criarTemas(brand.paleta).escuro : criarTemas(brand.paleta).claro;
  const fundo: StyleSpecification['layers'] = [{ id: 'fundo', type: 'background', paint: { 'background-color': t.fundo } }];
  if (!arquivo) return { version: 8, glyphs: `${base}/fonts/{fontstack}/{range}.pbf`, sources: {}, layers: fundo };
  const p = new PMTiles(new FileSource(arquivo));
  protocolo.add(p);
  return {
    version: 8,
    glyphs: `${base}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${base}/sprites/v4/${escuro ? 'dark' : 'light'}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${p.source.getKey()}`,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    layers: layers('protomaps', namedFlavor(escuro ? 'dark' : 'light'), { lang: 'pt' }),
  };
}

function rotaGeoJSON(o: OpcaoMapa | undefined): GeoJSON.FeatureCollection {
  if (!o) return VAZIO;
  return {
    type: 'FeatureCollection',
    features: o.desenho.map((d, i) => ({
      type: 'Feature',
      id: i,
      properties: {
        modo: d.modo,
        cor: d.servico ? (CORES_SERVICO[d.servico as keyof typeof CORES_SERVICO] ?? CORES_SERVICO.outro) : '#5A6A76',
      },
      geometry: { type: 'LineString', coordinates: d.coords },
    })),
  };
}

function camadas(mapa: MapaGL, pontos: GeoJSON.FeatureCollection, escuro: boolean) {
  const t = escuro ? criarTemas(brand.paleta).escuro : criarTemas(brand.paleta).claro;
  mapa.addSource('rota', { type: 'geojson', data: VAZIO });
  mapa.addSource('pontos', { type: 'geojson', data: pontos });
  mapa.addLayer({
    id: 'rota-borda',
    type: 'line',
    source: 'rota',
    filter: ['!=', ['get', 'modo'], 'a_pe'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': escuro ? t.texto : '#FFFFFF', 'line-width': 9 },
  });
  mapa.addLayer({
    id: 'rota',
    type: 'line',
    source: 'rota',
    filter: ['!=', ['get', 'modo'], 'a_pe'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'cor'], 'line-width': 5 },
  });
  mapa.addLayer({
    id: 'rota-pe',
    type: 'line',
    source: 'rota',
    filter: ['==', ['get', 'modo'], 'a_pe'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': t.estimativa, 'line-width': 3, 'line-dasharray': [0.5, 2] },
  });
  mapa.addLayer({
    id: 'pontos',
    type: 'circle',
    source: 'pontos',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 7],
      'circle-color': ['case', ['==', ['get', 'aquaviario'], 1], CORES_SERVICO.aquaviario, t.superficie],
      'circle-stroke-color': t.mapaPonto,
      'circle-stroke-width': 1.5,
    },
  });
  mapa.addLayer({
    id: 'pontos-nome',
    type: 'symbol',
    source: 'pontos',
    minzoom: 13,
    layout: {
      'text-field': ['get', 'nome'],
      'text-font': ['Noto Sans Medium'],
      'text-size': 12,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': t.texto, 'text-halo-color': t.superficie, 'text-halo-width': 1.5 },
  });
}

export default function Mapa() {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const arquivo = useEstado((s) => s.mapaArquivo);
  const tema = useEstado((s) => s.tema);
  const rede = useEstado((s) => s.rede);
  const opcoes = useEstado((s) => s.opcoes);
  const sel = useEstado((s) => s.selecionada);
  const escuro = temaEfetivo(tema) === 'escuro';

  useEffect(() => {
    if (!div.current || !rede) return;
    let cancelado = false;
    const m = new MapaGL({
      container: div.current,
      style: estilo(arquivo, escuro),
      center: CENTRO,
      zoom: 11,
      attributionControl: { compact: true },
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    mapa.current = m;
    m.on('load', async () => {
      const pontos = await obterMotor().pontos();
      if (cancelado) return;
      camadas(m, pontos, escuro);
      const b = new LngLatBounds();
      for (const f of pontos.features) b.extend(f.geometry.coordinates as [number, number]);
      if (!b.isEmpty()) m.fitBounds(b, { padding: margens(), duration: 0 });
      atualizarRota(m, useEstado.getState().opcoes[useEstado.getState().selecionada]);
    });
    return () => {
      cancelado = true;
      m.remove();
      mapa.current = null;
    };
  }, [arquivo, escuro, rede]);

  useEffect(() => {
    if (mapa.current?.isStyleLoaded()) atualizarRota(mapa.current, opcoes[sel]);
  }, [opcoes, sel]);

  // O CSS do MapLibre põe position: relative no container; por isso o wrapper absoluto.
  return (
    <div className="absolute inset-0" role="region" aria-label="Mapa">
      <div ref={div} className="h-full w-full" />
    </div>
  );
}

function atualizarRota(m: MapaGL, o: OpcaoMapa | undefined) {
  const src = m.getSource<GeoJSONSource>('rota');
  if (!src) return;
  src.setData(rotaGeoJSON(o));
  if (!o) return;
  const b = new LngLatBounds();
  for (const d of o.desenho) for (const c of d.coords) b.extend(c);
  m.fitBounds(b, { padding: margens(), maxZoom: 15, duration: 600 });
}

/** Área livre do mapa: desconta o painel lateral (desktop) ou o bottom sheet (celular). */
function margens() {
  return matchMedia('(min-width: 1024px)').matches
    ? { top: 60, bottom: 60, left: 460, right: 60 }
    : { top: 50, bottom: innerHeight * 0.55 + 20, left: 30, right: 30 };
}
