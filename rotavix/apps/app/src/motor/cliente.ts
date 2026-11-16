import { type Remote, transfer, wrap } from 'comlink';
import type { ApiMotor } from './worker';

let motor: Remote<ApiMotor> | null = null;

export function obterMotor(): Remote<ApiMotor> {
  motor ??= wrap<ApiMotor>(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'motor' }));
  return motor;
}

export async function carregarRede(buf: ArrayBuffer) {
  return obterMotor().carregar(transfer(buf, [buf]));
}
