/**
 * Armazenamento dos pacotes offline. PWA e WebView do Android usam OPFS.
 * TODO(Fase 1): implementação com Capacitor Filesystem para o Android (SPEC §6).
 */
export interface DataStore {
  readonly tipo: 'opfs' | 'memoria';
  ler(nome: string): Promise<File | null>;
  gravar(nome: string, dados: ArrayBuffer): Promise<void>;
  apagar(nome: string): Promise<void>;
}

class OpfsStore implements DataStore {
  readonly tipo = 'opfs' as const;
  constructor(private raiz: FileSystemDirectoryHandle) {}
  async ler(nome: string): Promise<File | null> {
    try {
      return await (await this.raiz.getFileHandle(nome)).getFile();
    } catch {
      return null;
    }
  }
  async gravar(nome: string, dados: ArrayBuffer): Promise<void> {
    // Escreve em arquivo temporário e só depois troca: o pacote anterior nunca fica pela metade.
    const tmp = await this.raiz.getFileHandle(`${nome}.tmp`, { create: true });
    const w = await tmp.createWritable();
    await w.write(dados);
    await w.close();
    const final = await this.raiz.getFileHandle(nome, { create: true });
    const w2 = await final.createWritable();
    await w2.write(await tmp.getFile());
    await w2.close();
    await this.raiz.removeEntry(`${nome}.tmp`);
  }
  async apagar(nome: string): Promise<void> {
    await this.raiz.removeEntry(nome).catch(() => undefined);
  }
}

class MemoriaStore implements DataStore {
  readonly tipo = 'memoria' as const;
  private m = new Map<string, File>();
  async ler(nome: string) {
    return this.m.get(nome) ?? null;
  }
  async gravar(nome: string, dados: ArrayBuffer) {
    this.m.set(nome, new File([dados], nome));
  }
  async apagar(nome: string) {
    this.m.delete(nome);
  }
}

let store: Promise<DataStore> | null = null;

export function abrirStore(): Promise<DataStore> {
  store ??= (async () => {
    try {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('pacotes', { create: true });
      navigator.storage.persist?.().catch(() => undefined);
      return new OpfsStore(dir);
    } catch {
      return new MemoriaStore();
    }
  })();
  return store;
}
