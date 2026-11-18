// Conversões para vetor: texto → contornos (letra por letra, com os furos do O e do A) e combinação booleana de camadas.
import type { Font } from "opentype.js";
import type { Caminho, No, NoRetangulo, NoTexto, NoVetor, PontoVetor } from "./modelo.ts";
import { novoId } from "./modelo.ts";
import { carregarFonte } from "./fontes.ts";
import { baseDaLinha, linhasDoTexto } from "./render.ts";
import { type OpBooleana, type Pt, combinar, normalizarVetor, retanguloParaCaminhos, transformarCaminhos } from "./vetor.ts";

// Comandos do opentype.js (M L C Q Z) → caminhos de Bézier cúbicos com alças relativas.
export function caminhosDeComandos(cmds: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): Caminho[] {
  const saida: Caminho[] = [];
  let atual: Caminho | null = null;
  const fechar = () => {
    if (!atual) return;
    const ps = atual.pontos;
    if (ps.length > 1) {
      const a = ps[0];
      const b = ps[ps.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-4) {
        if (b.ein) a.ein = b.ein;
        ps.pop();
      }
    }
    if (ps.length >= 2) saida.push({ ...atual, fechado: true });
    atual = null;
  };
  for (const c of cmds) {
    if (c.type === "M") {
      fechar();
      atual = { fechado: true, pontos: [{ x: c.x!, y: c.y! }] };
    } else if (!atual) continue;
    else if (c.type === "L") atual.pontos.push({ x: c.x!, y: c.y! });
    else if (c.type === "C" || c.type === "Q") {
      const a: PontoVetor = atual.pontos[atual.pontos.length - 1];
      const c1 = c.type === "C" ? { x: c.x1!, y: c.y1! } : { x: a.x + (2 / 3) * (c.x1! - a.x), y: a.y + (2 / 3) * (c.y1! - a.y) };
      const c2 = c.type === "C" ? { x: c.x2!, y: c.y2! } : { x: c.x! + (2 / 3) * (c.x1! - c.x!), y: c.y! + (2 / 3) * (c.y1! - c.y!) };
      a.eout = { x: c1.x - a.x, y: c1.y - a.y };
      atual.pontos.push({ x: c.x!, y: c.y!, ein: { x: c2.x - c.x!, y: c2.y - c.y! } });
    } else if (c.type === "Z") fechar();
  }
  fechar();
  return saida;
}

export function contornosDoTexto(n: NoTexto, fonte: Font): Caminho[] {
  const todos: Caminho[] = [];
  // o espaço entre letras entra depois de cada letra, como no canvas e no CSS
  const op = { kerning: true, letterSpacing: n.espacamento || undefined } as Parameters<Font["getPath"]>[4];
  linhasDoTexto(n).forEach((linha, i) => {
    if (!linha.trim()) return;
    const largura = fonte.getAdvanceWidth(linha, n.tamanho, op); // já inclui o espaço depois da última letra, como o canvas
    const x = n.alinhar === "left" ? 0 : n.alinhar === "center" ? (n.l - largura) / 2 : n.l - largura;
    const base = baseDaLinha(n, i); // a mesma linha de base do desenho na tela
    const path = fonte.getPath(linha, x, base, n.tamanho, op);
    todos.push(...caminhosDeComandos(path.commands as never));
  });
  return todos;
}

export async function textoParaVetor(n: NoTexto): Promise<NoVetor> {
  const fonte = await carregarFonte(n.fonte, n.peso, n.italico);
  const v: NoVetor = {
    id: n.id, slide: n.slide, tipo: "vetor", nome: `${n.nome} (contornos)`,
    x: n.x, y: n.y, l: n.l, a: n.a, rot: n.rot, op: n.op, oculto: n.oculto, travado: n.travado,
    caminhos: contornosDoTexto(n, fonte), cor: n.cor, traco: null, regra: "nonzero", fx: n.fx,
  };
  const norm = normalizarVetor(v);
  return { ...norm, original: { texto: n, x: norm.x, y: norm.y } };
}

export function retanguloParaVetor(n: NoRetangulo): NoVetor {
  return {
    id: n.id, slide: n.slide, tipo: "vetor", nome: n.nome, x: n.x, y: n.y, l: n.l, a: n.a, rot: n.rot, op: n.op, oculto: n.oculto, travado: n.travado,
    caminhos: retanguloParaCaminhos(n.l, n.a, n.raio), cor: n.cor, traco: null, regra: "nonzero", fx: n.fx,
  };
}

// Volta ao texto original (as edições nos pontos se perdem), acompanhando o quanto o vetor foi movido.
export function vetorParaTexto(n: NoVetor): NoTexto | null {
  const o = n.original;
  if (!o) return null;
  return { ...o.texto, x: o.texto.x + (n.x - o.x), y: o.texto.y + (n.y - o.y), rot: n.rot, op: n.op, oculto: n.oculto, travado: n.travado, fx: n.fx };
}

// ---------------------------------------------------------------- booleanos entre camadas

async function emCoordenadasLocais(n: No): Promise<{ cs: Caminho[]; regra: "evenodd" | "nonzero" } | null> {
  if (n.tipo === "retangulo") return { cs: retanguloParaCaminhos(n.l, n.a, n.raio), regra: "nonzero" };
  if (n.tipo === "vetor") return { cs: n.caminhos, regra: n.regra };
  if (n.tipo === "texto") return { cs: contornosDoTexto(n, await carregarFonte(n.fonte, n.peso, n.italico)), regra: "nonzero" };
  return null;
}
function paraOSlide(n: No, cs: Caminho[]): Caminho[] {
  const r = (n.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const vet = (v: Pt) => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos });
  return transformarCaminhos(cs, (p) => {
    const q = vet({ x: p.x - n.l / 2, y: p.y - n.a / 2 });
    return { x: n.x + n.l / 2 + q.x, y: n.y + n.a / 2 + q.y };
  }, vet);
}
const corDe = (n: No): string | null => (n.tipo === "imagem" ? null : n.tipo === "vetor" ? n.cor : n.cor);

export const NOME_DA_OPERACAO: Record<OpBooleana, string> = { unir: "União", subtrair: "Subtração", interseccao: "Interseção", excluir: "Exclusão" };

// `frente` OP `tras`; o resultado é um vetor com a cor e a opacidade da camada de trás, no lugar dela.
export async function combinarNos(op: OpBooleana, frente: No, tras: No): Promise<NoVetor | null> {
  const a = await emCoordenadasLocais(frente);
  const b = await emCoordenadasLocais(tras);
  if (!a || !b) return null;
  const cs = combinar(op, paraOSlide(frente, a.cs), paraOSlide(tras, b.cs), a.regra, b.regra);
  if (!cs.length) return null;
  const v: NoVetor = {
    id: novoId(), slide: tras.slide, tipo: "vetor", nome: NOME_DA_OPERACAO[op], x: 0, y: 0, l: 1, a: 1, rot: 0, op: tras.op, oculto: false, travado: false,
    caminhos: cs, cor: corDe(tras) ?? "#ff5c8a", traco: tras.tipo === "vetor" ? tras.traco : null, regra: "evenodd",
  };
  return normalizarVetor(v);
}
