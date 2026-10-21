import { createMemoryStore } from './memoryStore';
import type { AppStore } from './types';

// Web is for screenshots and development only: no persistence (DECISIONS.md D6).
export async function openPlatformStore(): Promise<AppStore> {
  return createMemoryStore();
}
