// Onde cada slide fica no mundo. Os slides ocupam células de uma grade (coluna, linha): o carrossel é uma linha,
// um feed estético é uma grade de várias linhas. No modo contínuo (padrão) eles ficam grudados, sem espaço, e um
// objeto pode começar num slide e terminar no vizinho; desligado, ficam separados (stories, apresentação).
import type { Documento, Slide } from "./modelo.ts";

export const ESPACO_ENTRE_SLIDES = 120;
export type Celula = { c: number; l: number };

export const continuo = (d: Documento) => d.continuo !== false;
export const espacoEntreSlides = (d: Documento) => (continuo(d) ? 0 : ESPACO_ENTRE_SLIDES);

// Documento antigo (sem grade em nenhum slide) = uma linha na ordem da lista.
export const celula = (d: Documento, i: number): Celula => d.slides[i]?.grade ?? { c: i, l: 0 };

export function origemDoSlide(d: Documento, i: number): { x: number; y: number } {
  const g = celula(d, i);
  const e = espacoEntreSlides(d);
  return { x: g.c * (d.formato.l + e), y: g.l * (d.formato.a + e) };
}
export const origemDoSlidePorId = (d: Documento, id: string) => origemDoSlide(d, Math.max(0, d.slides.findIndex((s) => s.id === id)));

// Retângulo que contém todos os slides (para enquadrar a vista).
export function limitesDaGrade(d: Documento) {
  let x1 = 0;
  let y1 = 0;
  d.slides.forEach((_, i) => {
    const o = origemDoSlide(d, i);
    x1 = Math.max(x1, o.x + d.formato.l);
    y1 = Math.max(y1, o.y + d.formato.a);
  });
  return { x0: 0, y0: 0, x1, y1 };
}

// Slide sob o ponto do mundo ou, fora de todos, o mais próximo.
export function slideMaisProximo(d: Documento, wx: number, wy: number): number {
  let melhor = 0;
  let dist = Infinity;
  d.slides.forEach((_, i) => {
    const o = origemDoSlide(d, i);
    const dx = Math.max(o.x - wx, 0, wx - (o.x + d.formato.l));
    const dy = Math.max(o.y - wy, 0, wy - (o.y + d.formato.a));
    const k = Math.hypot(dx, dy);
    if (k < dist) {
      dist = k;
      melhor = i;
    }
  });
  return melhor;
}

// Índice do slide exatamente sob o ponto, ou -1.
export function slideSob(d: Documento, wx: number, wy: number): number {
  return d.slides.findIndex((_, i) => {
    const o = origemDoSlide(d, i);
    return wx >= o.x && wx < o.x + d.formato.l && wy >= o.y && wy < o.y + d.formato.a;
  });
}

// ---------------------------------------------------------------- mudanças na grade (usadas pelos comandos)

// Põe a célula em todos os slides (documento antigo vira uma linha) e mantém a lista na ordem de leitura
// (linha a linha, da esquerda para a direita), que é a ordem de exportação.
export function comGrade(slides: Slide[]): Slide[] {
  return slides.map((s, i) => (s.grade ? s : { ...s, grade: { c: i, l: 0 } }));
}
export function emOrdemDeLeitura(slides: Slide[]): Slide[] {
  return [...slides].sort((a, b) => a.grade!.l - b.grade!.l || a.grade!.c - b.grade!.c);
}

// Abre espaço na célula `alvo`: empurra para a direita (ou para baixo) quem estiver nela e depois dela.
export function abrirCelula(slides: Slide[], alvo: Celula, sentido: "direita" | "abaixo"): Slide[] {
  const ocupada = slides.some((s) => s.grade!.c === alvo.c && s.grade!.l === alvo.l);
  if (!ocupada) return slides;
  return slides.map((s) => {
    const g = s.grade!;
    if (sentido === "direita" && g.l === alvo.l && g.c >= alvo.c) return { ...s, grade: { ...g, c: g.c + 1 } };
    if (sentido === "abaixo" && g.c === alvo.c && g.l >= alvo.l) return { ...s, grade: { ...g, l: g.l + 1 } };
    return s;
  });
}

// Fecha o buraco deixado por um slide apagado: a linha anda para a esquerda; linha vazia sobe as de baixo.
export function fecharCelula(slides: Slide[], vaga: Celula): Slide[] {
  let r = slides.map((s) => (s.grade!.l === vaga.l && s.grade!.c > vaga.c ? { ...s, grade: { ...s.grade!, c: s.grade!.c - 1 } } : s));
  if (!r.some((s) => s.grade!.l === vaga.l)) r = r.map((s) => (s.grade!.l > vaga.l ? { ...s, grade: { ...s.grade!, l: s.grade!.l - 1 } } : s));
  return r;
}

// Célula para um slide novo sem vizinho indicado: no fim da última linha.
export function proximaCelula(slides: Slide[]): Celula {
  if (!slides.length) return { c: 0, l: 0 };
  const l = Math.max(...slides.map((s) => s.grade!.l));
  const c = Math.max(...slides.filter((s) => s.grade!.l === l).map((s) => s.grade!.c)) + 1;
  return { c, l };
}
