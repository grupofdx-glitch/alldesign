// Mídia das imagens (bytes e bitmap decodificado), indexada pelo hash do conteúdo. Fica fora do documento: o documento
// guarda só o hash; o arquivo .alldesign leva os bytes numa pasta `imagens/`.

export interface Midia {
  bytes: Uint8Array;
  mime: string;
  bitmap: ImageBitmap;
  l: number;
  a: number;
}
const mapa = new Map<string, Midia>();

export async function hashDe(bytes: Uint8Array): Promise<string> {
  const copia = new Uint8Array(bytes);
  const d = await crypto.subtle.digest("SHA-256", copia.buffer);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function registrar(bytes: Uint8Array, mime: string): Promise<{ hash: string; l: number; a: number }> {
  const hash = await hashDe(bytes);
  let m = mapa.get(hash);
  if (!m) {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }));
    m = { bytes, mime, bitmap, l: bitmap.width, a: bitmap.height };
    mapa.set(hash, m);
  }
  return { hash, l: m.l, a: m.a };
}
export const midiaDe = (hash: string) => mapa.get(hash);
export const todasAsMidias = () => mapa;
export function limparMidias() {
  mapa.clear();
}
