import { wsUrl } from './control';
import { SUBPROTOCOL, authSubprotocol, decodeVideoMessage, type VideoMessage } from './protocol';

/** Um WebSocket binário por display. Reconecta sozinho. */
export class VideoSocket {
  private ws: WebSocket | null = null;
  private stopped = false;
  private backoffMs = 500;
  bytesReceived = 0;
  protocolErrors = 0;

  constructor(
    private readonly token: string,
    readonly displayId: number,
    private readonly onMessage: (m: VideoMessage, recvMs: number, bytes: number) => void,
    private readonly onOpen: () => void = () => {},
  ) {}

  connect(): void {
    this.stopped = false;
    const ws = new WebSocket(wsUrl(`/ws/video?display=${this.displayId}`), [SUBPROTOCOL, authSubprotocol(this.token)]);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => { this.backoffMs = 500; this.onOpen(); };
    ws.onmessage = (ev) => {
      const recvMs = performance.now();
      if (!(ev.data instanceof ArrayBuffer)) return;
      this.bytesReceived += ev.data.byteLength;
      try {
        this.onMessage(decodeVideoMessage(ev.data), recvMs, ev.data.byteLength);
      } catch (e) {
        this.protocolErrors++;
        console.warn('video protocol error', e);
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) {
        setTimeout(() => this.connect(), this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, 5000);
      }
    };
  }

  close(): void {
    this.stopped = true;
    this.ws?.close();
  }
}
