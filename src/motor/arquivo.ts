// Formato .alldesign: um pacote com `documento.json` (legível, a fonte da verdade), as imagens em `imagens/<chave>.<ext>`,
// as prévias dos slides em `previas/` e um `LEIA-ME.md` que explica o formato a qualquer IA (motor/leia-me.ts).
// O pacote existe como pasta no disco (pacote.ts, só Node) ou como ZIP com o mesmo conteúdo (baixar, mandar, anexar);
// aqui ele é só o conjunto de arquivos, então ler e escrever não dependem do navegador. Só `empacotar`/`desempacotar`
// falam com o registro de mídia da tela.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Documento, No } from "./modelo.ts";
import { LEIA_ME } from "./leia-me.ts";
import { limparMidias, registrar, todasAsMidias } from "./midia.ts";

export interface MidiaBruta {
  bytes: Uint8Array;
  mime: string;
}
/** Os arquivos de um pacote, por caminho relativo ("documento.json", "imagens/ab12.png"…). */
export type ArquivosDoPacote = Record<string, Uint8Array>;
/** Uma prévia já renderizada (PNG) de um slide. */
export interface Previa {
  slide: string;
  bytes: Uint8Array;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
export const LARGURA_DAS_PREVIAS = 540;

export const hashesUsados = (d: Documento): Set<string> =>
  new Set(d.nos.flatMap((n) => (n.tipo === "imagem" ? [n.hash, n.edicao?.pintura, n.edicao?.mascara].filter((h): h is string => !!h) : [])));

/** Assinatura curta do documento.json (FNV-1a 32 bits): diz se as prévias foram feitas desta versão. */
export function assinatura(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const textoDoDocumento = (d: Documento): string => `${JSON.stringify(d, null, 2)}\n`;

/** O conjunto de arquivos do pacote. Sem `previas`, o pacote sai sem a pasta de prévias. */
export function arquivosDoPacote(d: Documento, imagens: Map<string, MidiaBruta>, previas?: Previa[]): ArquivosDoPacote {
  const json = textoDoDocumento(d);
  const arquivos: ArquivosDoPacote = { "LEIA-ME.md": strToU8(LEIA_ME), "documento.json": strToU8(json) };
  const usados = hashesUsados(d);
  for (const [hash, m] of imagens) if (usados.has(hash)) arquivos[`imagens/${hash}.${EXT[m.mime] ?? "bin"}`] = m.bytes;
  if (previas?.length) {
    const indice = { assinatura: assinatura(json), largura: LARGURA_DAS_PREVIAS, slides: [] as { n: number; id: string; nome: string; arquivo: string }[] };
    d.slides.forEach((s, i) => {
      const p = previas.find((x) => x.slide === s.id);
      if (!p) return;
      const arquivo = `previas/slide-${String(i + 1).padStart(2, "0")}.png`;
      arquivos[arquivo] = p.bytes;
      indice.slides.push({ n: i + 1, id: s.id, nome: s.nome, arquivo });
    });
    arquivos["previas/indice.json"] = strToU8(`${JSON.stringify(indice, null, 2)}\n`);
  }
  return arquivos;
}

/** O pacote como um arquivo só (ZIP), para baixar e mandar. */
export function escreverAlldesign(d: Documento, imagens: Map<string, MidiaBruta>, previas?: Previa[]): Uint8Array {
  return zipSync(arquivosDoPacote(d, imagens, previas), { level: 6 });
}

/** Lê o conjunto de arquivos de um pacote (de pasta ou de ZIP). As imagens ficam pela chave do nome do arquivo. */
export function lerArquivosDoPacote(itens: ArquivosDoPacote): { doc: Documento; imagens: Map<string, MidiaBruta> } {
  const json = itens["documento.json"];
  if (!json) throw new Error("Arquivo inválido: falta documento.json.");
  const doc = JSON.parse(strFromU8(json)) as Documento;
  if (doc.versao !== 1) throw new Error(`Versão ${String((doc as { versao: unknown }).versao)} do arquivo não é suportada.`);
  const imagens = new Map<string, MidiaBruta>();
  for (const [caminho, dados] of Object.entries(itens)) {
    const m = /^imagens\/([^/]+)\.(\w+)$/.exec(caminho);
    if (m) imagens.set(m[1], { bytes: dados, mime: MIME[m[2].toLowerCase()] ?? "application/octet-stream" });
  }
  return { doc, imagens };
}

export const lerAlldesign = (bytes: Uint8Array) => lerArquivosDoPacote(unzipSync(bytes));

/** Troca as chaves de imagem citadas pelas camadas (ex.: "foto-praia" → o código do conteúdo). */
export function trocarChaves(d: Documento, troca: Map<string, string>): Documento {
  if (![...troca].some(([a, b]) => a !== b)) return d;
  const t = (h?: string) => (h ? (troca.get(h) ?? h) : h);
  return {
    ...d,
    nos: d.nos.map((n): No => (n.tipo === "imagem" ? { ...n, hash: t(n.hash)!, edicao: n.edicao ? { pintura: t(n.edicao.pintura), mascara: t(n.edicao.mascara) } : undefined } : n)),
  };
}

export const empacotar = (d: Documento, previas?: Previa[]): Uint8Array => escreverAlldesign(d, todasAsMidias(), previas);

/** Abre um pacote no editor: registra as imagens e, se alguma chave não for o código do conteúdo, acerta o documento. */
export async function desempacotar(fonte: Uint8Array | ArquivosDoPacote): Promise<Documento> {
  const { doc, imagens } = fonte instanceof Uint8Array ? lerAlldesign(fonte) : lerArquivosDoPacote(fonte);
  limparMidias();
  const troca = new Map<string, string>();
  for (const [chave, m] of imagens) troca.set(chave, (await registrar(m.bytes, m.mime)).hash);
  return trocarChaves(doc, troca);
}
