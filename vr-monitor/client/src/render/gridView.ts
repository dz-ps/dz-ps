import * as THREE from 'three';
import { FrameTexture } from './frameTexture';

interface Tile {
  id: number;
  frameTexture: FrameTexture;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  border: THREE.LineSegments;
}

/** Modo plano (Fases 1–2): um ou mais displays em grade, aspecto preservado. */
export class GridView {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  private readonly tiles = new Map<number, Tile>();
  private order: number[] = [];
  private readonly planeGeo = new THREE.PlaneGeometry(2, 2);
  private readonly borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2, 2));

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x050505);
    this.camera.position.z = 1;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** Define quais displays aparecem e em que ordem. */
  setTiles(ids: number[]): void {
    for (const [id, t] of this.tiles) {
      if (!ids.includes(id)) {
        this.scene.remove(t.mesh, t.border);
        t.frameTexture.dispose();
        t.material.dispose();
        this.tiles.delete(id);
      }
    }
    for (const id of ids) {
      if (this.tiles.has(id)) continue;
      const material = new THREE.MeshBasicMaterial({ color: 0x202020 });
      const mesh = new THREE.Mesh(this.planeGeo, material);
      const border = new THREE.LineSegments(this.borderGeo, new THREE.LineBasicMaterial({ color: 0x333333 }));
      this.scene.add(mesh, border);
      this.tiles.set(id, {
        id, material, mesh, border,
        // com vários displays cada um ocupa menos tela: mipmap ajuda na minificação
        frameTexture: new FrameTexture(this.renderer, { mipmaps: ids.length > 1, anisotropy: 1 }),
      });
    }
    this.order = [...ids];
    this.layout();
  }

  /** Sobe o frame do display `id` e o fecha. */
  present(id: number, frame: VideoFrame): void {
    const t = this.tiles.get(id);
    try {
      if (!t) return;
      if (t.frameTexture.upload(frame)) {
        t.material.map = t.frameTexture.texture;
        t.material.color.set(0xffffff);
        t.material.needsUpdate = true;
        this.layout();
      }
    } finally {
      frame.close();
    }
  }

  render(): void { this.renderer.render(this.scene, this.camera); }

  private resize(): void {
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.layout();
  }

  /** Grade: até 3 numa linha (paisagem), depois quadrada. Coordenadas da câmera em [-1, 1]. */
  private layout(): void {
    const n = this.order.length;
    if (!n) return;
    const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const viewAspect = innerWidth / innerHeight;
    const gap = n > 1 ? 0.02 : 0;
    const cellW = (2 - gap * (cols - 1)) / cols;
    const cellH = (2 - gap * (rows - 1)) / rows;
    this.order.forEach((id, i) => {
      const t = this.tiles.get(id)!;
      const c = i % cols;
      const r = Math.floor(i / cols);
      const cx = -1 + cellW / 2 + c * (cellW + gap);
      const cy = 1 - cellH / 2 - r * (cellH + gap);
      const w = t.frameTexture.width || 16;
      const h = t.frameTexture.height || 10;
      // tamanho do conteúdo dentro da célula, preservando o aspecto em pixels de tela
      const cellAspectPx = (cellW / cellH) * viewAspect;
      const contentAspect = w / h;
      const sx = contentAspect > cellAspectPx ? cellW / 2 : (cellH / 2) * (contentAspect / viewAspect);
      const sy = contentAspect > cellAspectPx ? (cellW / 2) * (viewAspect / contentAspect) : cellH / 2;
      t.mesh.position.set(cx, cy, 0);
      t.mesh.scale.set(sx, sy, 1);
      t.border.position.copy(t.mesh.position);
      t.border.scale.copy(t.mesh.scale);
      t.border.visible = n > 1;
    });
  }
}
