/** Sincroniza os pacotes offline com o manifest do servidor (sha256 + troca atômica). */
import { abrirStore } from './armazenamento';

export type EntradaManifest = { id: string; arquivo: string; sha256: string; bytes: number; descricao: string; obrigatorio: boolean; sintetica?: boolean };
export type Manifest = { versao: number; gerado_em: string; pacotes: EntradaManifest[] };
export type Progresso = { pacote: string; recebidos: number; total: number };

const LOCAL = 'manifest.json';

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function baixar(url: string, total: number, aoProgredir: (r: number) => void): Promise<ArrayBuffer> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok || !r.body) throw new Error(`falha ao baixar ${url} (${r.status})`);
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let recebidos = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    recebidos += value.length;
    aoProgredir(Math.min(recebidos, total));
  }
  const out = new Uint8Array(recebidos);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

export async function manifestLocal(): Promise<Manifest | null> {
  const f = await (await abrirStore()).ler(LOCAL);
  return f ? (JSON.parse(await f.text()) as Manifest) : null;
}

/**
 * Garante os pacotes no aparelho. Sem rede, usa o que já foi baixado.
 * Retorna o manifest em uso e se houve atualização.
 */
export async function sincronizar(aoProgredir: (p: Progresso) => void): Promise<{ manifest: Manifest | null; atualizou: boolean; erro?: string | undefined }> {
  const store = await abrirStore();
  const local = await manifestLocal();
  let remoto: Manifest;
  try {
    const r = await fetch('/pacotes/manifest.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    remoto = (await r.json()) as Manifest;
  } catch (e) {
    return { manifest: local, atualizou: false, erro: local ? undefined : String(e) };
  }
  let atualizou = false;
  const emUso: EntradaManifest[] = [];
  for (const p of remoto.pacotes) {
    const atual = local?.pacotes.find((x) => x.id === p.id);
    const arquivo = await store.ler(p.arquivo);
    if (atual?.sha256 === p.sha256 && arquivo && arquivo.size === p.bytes) {
      emUso.push(p);
      continue;
    }
    try {
      const dados = await baixar(`/pacotes/${p.arquivo}`, p.bytes, (recebidos) => aoProgredir({ pacote: p.descricao, recebidos, total: p.bytes }));
      if ((await sha256(dados)) !== p.sha256) throw new Error(`sha256 não confere: ${p.arquivo}`);
      await store.gravar(p.arquivo, dados);
      emUso.push(p);
      atualizou = true;
    } catch (e) {
      if (atual && arquivo) emUso.push(atual); // mantém a versão anterior (rollback)
      else if (p.obrigatorio) return { manifest: local, atualizou: false, erro: String(e) };
    }
  }
  const manifest: Manifest = { ...remoto, pacotes: emUso };
  await store.gravar(LOCAL, new TextEncoder().encode(JSON.stringify(manifest)).buffer as ArrayBuffer);
  return { manifest, atualizou };
}

export async function lerPacote(arquivo: string): Promise<File | null> {
  return (await abrirStore()).ler(arquivo);
}
