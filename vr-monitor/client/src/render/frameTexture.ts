import * as THREE from 'three';

export interface FrameTextureOptions {
  mipmaps: boolean;
  anisotropy: number;
}

/**
 * Textura alimentada por VideoFrame direto (sem canvas 2D intermediário).
 *
 * O Three aloca a textura (texStorage2D imutável, sRGB), e a cada frame eu faço `texSubImage2D`
 * com o VideoFrame na própria textura WebGL, gero mipmaps se pedido e fecho o frame na hora.
 * Depois chamo `renderer.resetState()`, porque mexi no estado do GL por fora do cache do Three.
 */
export class FrameTexture {
  private tex: THREE.DataTexture | null = null;
  private w = 0;
  private h = 0;
  uploads = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, private opts: FrameTextureOptions) {}

  get texture(): THREE.Texture | null { return this.tex; }
  get width(): number { return this.w; }
  get height(): number { return this.h; }

  /** Sobe o frame para a GPU. NÃO fecha o frame: quem chama fecha. Retorna true se a textura foi realocada. */
  upload(frame: VideoFrame): boolean {
    const w = frame.displayWidth;
    const h = frame.displayHeight;
    let realloc = false;
    if (!this.tex || w !== this.w || h !== this.h) {
      this.allocate(w, h);
      realloc = true;
    }
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const glTex = (this.renderer.properties.get(this.tex!) as { __webglTexture?: WebGLTexture }).__webglTexture;
    if (!glTex) return realloc;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    if (this.opts.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.renderer.resetState();
    this.uploads++;
    return realloc;
  }

  setOptions(opts: FrameTextureOptions): void {
    this.opts = opts;
    this.tex?.dispose();
    this.tex = null; // realoca no próximo upload com os filtros novos
  }

  dispose(): void {
    this.tex?.dispose();
    this.tex = null;
  }

  private allocate(w: number, h: number): void {
    this.tex?.dispose();
    const t = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.generateMipmaps = this.opts.mipmaps;
    t.minFilter = this.opts.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = this.opts.anisotropy;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    this.renderer.initTexture(t);
    // o buffer de zeros só serviu para alocar; libera os bytes da CPU
    (t.image as { data: Uint8Array | null }).data = null;
    this.tex = t;
    this.w = w;
    this.h = h;
  }
}
