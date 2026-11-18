// Geometria da tela: rotação em torno do centro, teste de clique e alças.
import type { Base } from "./modelo.ts";

export interface Ponto {
  x: number;
  y: number;
}
export const rad = (g: number) => (g * Math.PI) / 180;

export function centro(n: Base): Ponto {
  return { x: n.x + n.l / 2, y: n.y + n.a / 2 };
}
// Leva um ponto do slide para o espaço local do nó (sem rotação, origem no canto superior esquerdo).
export function paraLocal(n: Base, p: Ponto): Ponto {
  const c = centro(n);
  const r = rad(-n.rot);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: dx * Math.cos(r) - dy * Math.sin(r) + n.l / 2, y: dx * Math.sin(r) + dy * Math.cos(r) + n.a / 2 };
}
export function dePonto(n: Base, local: Ponto): Ponto {
  const c = centro(n);
  const r = rad(n.rot);
  const dx = local.x - n.l / 2;
  const dy = local.y - n.a / 2;
  return { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) };
}
export function dentro(n: Base, p: Ponto): boolean {
  const q = paraLocal(n, p);
  return q.x >= 0 && q.y >= 0 && q.x <= n.l && q.y <= n.a;
}
// Caixa alinhada aos eixos que envolve o nó girado (para encaixe nas guias).
export function caixa(n: Base) {
  const cantos = [
    dePonto(n, { x: 0, y: 0 }),
    dePonto(n, { x: n.l, y: 0 }),
    dePonto(n, { x: n.l, y: n.a }),
    dePonto(n, { x: 0, y: n.a }),
  ];
  const xs = cantos.map((c) => c.x);
  const ys = cantos.map((c) => c.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

export type Alca = "nw" | "ne" | "se" | "sw" | "rot";
export const CANTOS: Record<Exclude<Alca, "rot">, Ponto> = {
  nw: { x: 0, y: 0 },
  ne: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  sw: { x: 0, y: 1 },
};
// Posição de cada alça no slide. A alça de rotação fica acima do centro do lado de cima.
export function posicaoDaAlca(n: Base, a: Alca, distanciaRot: number): Ponto {
  if (a === "rot") return dePonto(n, { x: n.l / 2, y: -distanciaRot });
  const c = CANTOS[a];
  return dePonto(n, { x: c.x * n.l, y: c.y * n.a });
}
