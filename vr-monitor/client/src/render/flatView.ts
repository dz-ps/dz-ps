import * as THREE from 'three';
import { FrameTexture } from './frameTexture';

/** Fase 1: um display em tela cheia, sem VR, com aspecto preservado. */
export class FlatView {
  readonly renderer: THREE.WebGLRenderer;
  readonly frameTexture: FrameTexture;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly mesh: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x050505);
    this.frameTexture = new FrameTexture(this.renderer, {
      mipmaps: false, // em tela cheia quase 1:1; mipmap só gastaria GPU
      anisotropy: 1,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.visible = false;
    this.camera.position.z = 1;
    this.scene.add(this.mesh);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** Sobe o frame e ajusta o material. O frame é fechado aqui. */
  present(frame: VideoFrame): void {
    try {
      if (this.frameTexture.upload(frame)) {
        this.material.map = this.frameTexture.texture;
        this.material.needsUpdate = true;
        this.mesh.visible = true;
        this.fit();
      }
    } finally {
      frame.close();
    }
  }

  render(): void { this.renderer.render(this.scene, this.camera); }

  private resize(): void {
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.fit();
  }

  private fit(): void {
    const cw = this.frameTexture.width;
    const ch = this.frameTexture.height;
    if (!cw || !ch) return;
    const viewAspect = innerWidth / innerHeight;
    const contentAspect = cw / ch;
    if (contentAspect > viewAspect) this.mesh.scale.set(1, viewAspect / contentAspect, 1);
    else this.mesh.scale.set(contentAspect / viewAspect, 1, 1);
  }
}
