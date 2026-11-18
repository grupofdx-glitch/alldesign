// Ações com efeito fora do documento: importar imagens, salvar/abrir .alldesign e exportar. Tudo passa pelos comandos.
import { strToU8, zipSync } from "fflate";
import { type ArquivosDoPacote, LARGURA_DAS_PREVIAS, type Previa, empacotar, desempacotar } from "./motor/arquivo.ts";
import { aguardarFontesDaTela } from "./motor/fontes.ts";
import { type DadosDoModelo, type ModeloId, criarDocumento } from "./motor/modelos.ts";
import type { KitId } from "./motor/kits.ts";
import { limparMidias } from "./motor/midia.ts";
import { nomeSeguro } from "./motor/nomes.ts";

export { nomeSeguro };
import { type Documento, type NoImagem, novoId } from "./motor/modelo.ts";
import { registrar } from "./motor/midia.ts";
import { alturaDoTexto, exportarNo, exportarSlide } from "./motor/render.ts";
import { slideParaSvg } from "./motor/svg.ts";
import { store } from "./store.ts";

const IMAGENS = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function importarImagens(arquivos: File[], slide: string, onde?: { x: number; y: number }) {
  const imgs = arquivos.filter((f) => IMAGENS.includes(f.type));
  if (!imgs.length) {
    if (arquivos.length) store.avisar("Só imagens PNG, JPG, WebP ou GIF.");
    return;
  }
  const { doc } = store.ler();
  for (const f of imgs) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const { hash, l, a } = await registrar(bytes, f.type);
    const largura = Math.min(l, doc.formato.l * 0.8);
    const altura = Math.round((largura * a) / l);
    const no: NoImagem = {
      id: novoId(), slide, tipo: "imagem", nome: f.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Imagem", hash,
      x: Math.round(onde ? onde.x - largura / 2 : (doc.formato.l - largura) / 2), y: Math.round(onde ? onde.y - altura / 2 : (doc.formato.a - altura) / 2),
      l: Math.round(largura), a: altura, rot: 0, op: 100, oculto: false, travado: false,
    };
    store.criarNo(no);
  }
}

export function escolherImagem() {
  const i = document.createElement("input");
  i.type = "file";
  i.accept = IMAGENS.join(",");
  i.multiple = true;
  i.onchange = () => void importarImagens(Array.from(i.files ?? []), store.slideAlvo());
  i.click();
}

/** Baixa o arquivo pelo navegador. */
export function baixar(blob: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function salvar() {
  await store.sairImagem(true); // grava a edição de imagem em andamento antes de salvar
  store.sairVetor();
  const { doc } = store.ler();
  // o pacote leva as prévias dos slides (PNG de 540 px), para quem abrir o arquivo sem o editor ver o design
  const previas: Previa[] = [];
  for (const s of doc.slides) previas.push({ slide: s.id, bytes: new Uint8Array(await (await exportarSlide(doc, s, "png", LARGURA_DAS_PREVIAS / doc.formato.l)).arrayBuffer()) });
  baixar(new Blob([new Uint8Array(empacotar(doc, previas))], { type: "application/zip" }), `${nomeSeguro(doc.nome)}.alldesign`);
  store.marcarSalvo();
  store.avisar("Arquivo salvo.");
}

// Arquivos feitos fora do editor (agentes) trazem a altura dos textos estimada: aqui ela é medida de verdade.
export function corrigirAlturasDeTexto(d: Documento): Documento {
  return { ...d, nos: d.nos.map((n) => (n.tipo === "texto" ? { ...n, a: alturaDoTexto(n) } : n)) };
}

export async function abrirBytes(bytes: Uint8Array | ArquivosDoPacote, rotulo: string) {
  try {
    await aguardarFontesDaTela();
    store.abrirDocumento(corrigirAlturasDeTexto(await desempacotar(bytes)));
    window.dispatchEvent(new Event("alldesign:ajustar"));
    store.avisar(`Aberto: ${rotulo}`);
  } catch (err) {
    store.avisar(err instanceof Error ? err.message : "Não consegui abrir o arquivo.");
  }
}

export function abrir() {
  const i = document.createElement("input");
  i.type = "file";
  i.accept = ".alldesign";
  i.onchange = async () => {
    const f = i.files?.[0];
    if (f) await abrirBytes(new Uint8Array(await f.arrayBuffer()), f.name);
  };
  i.click();
}

// ---- arquivos criados pela CLI na pasta de entrada (bin/design) ----
export interface ArquivoDeAgente {
  nome: string;
  tamanho: number;
  modificado: number;
}
export async function listarEntrada(): Promise<ArquivoDeAgente[]> {
  try {
    const r = await fetch("/entrada/", { cache: "no-store" });
    return r.ok ? ((await r.json()) as ArquivoDeAgente[]) : [];
  } catch {
    return [];
  }
}
export async function abrirDaEntrada(nome: string) {
  const r = await fetch(`/entrada/${encodeURIComponent(nome)}`, { cache: "no-store" });
  if (!r.ok) return store.avisar(`Não achei ${nome} na pasta de entrada.`);
  await abrirBytes(new Uint8Array(await r.arrayBuffer()), nome);
}

// ---- novo documento a partir de um modelo ----
export async function novoDeModelo(modelo: ModeloId, kit: KitId, dados: DadosDoModelo) {
  await aguardarFontesDaTela();
  limparMidias();
  store.abrirDocumento(criarDocumento(modelo, kit, dados, alturaDoTexto));
  window.dispatchEvent(new Event("alldesign:ajustar"));
  store.avisar("Documento criado a partir do modelo.");
}

export async function exportar(slideId: string | "todos", formato: "png" | "jpg" | "webp" | "svg", escala: number, zip: boolean) {
  await store.sairImagem(true);
  store.sairVetor();
  const { doc } = store.ler();
  const slides = slideId === "todos" ? doc.slides : doc.slides.filter((s) => s.id === slideId);
  const base = nomeSeguro(doc.nome);
  const nomes = slides.map((s, i) => (slides.length === 1 && slideId !== "todos" ? `${base}-${nomeSeguro(s.nome)}.${formato}` : `${base}-${String(i + 1).padStart(2, "0")}.${formato}`));
  const blobs = await Promise.all(slides.map(async (s) => (formato === "svg" ? new Blob([await slideParaSvg(doc, s)], { type: "image/svg+xml" }) : exportarSlide(doc, s, formato, escala))));
  if (blobs.length > 1 && zip) {
    const itens: Record<string, Uint8Array> = {};
    for (let i = 0; i < blobs.length; i++) itens[nomes[i]] = new Uint8Array(await blobs[i].arrayBuffer());
    itens["LEIA-ME.txt"] = strToU8(`${doc.nome}\n${blobs.length} slides, ${doc.formato.l * escala}×${doc.formato.a * escala}\n`);
    baixar(new Blob([new Uint8Array(zipSync(itens))], { type: "application/zip" }), `${base}.zip`);
  } else blobs.forEach((b, i) => baixar(b, nomes[i]));
  store.avisar(blobs.length > 1 && zip ? `${blobs.length} arquivos num ZIP.` : `${blobs.length} arquivo${blobs.length > 1 ? "s" : ""} exportado${blobs.length > 1 ? "s" : ""}.`);
}

export async function exportarCamada(id: string) {
  const n = store.ler().doc.nos.find((x) => x.id === id);
  if (!n) return;
  baixar(await exportarNo(n, 1), `${nomeSeguro(n.nome)}.png`);
  store.avisar("Camada exportada em PNG transparente.");
}
