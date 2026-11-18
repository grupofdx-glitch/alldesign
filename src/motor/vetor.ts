// Geometria de vetores: caminhos de Bézier com pontos e alças (o "Illustrator" de dentro do objeto).
// Funções puras sobre `Caminho[]` (devolvem dados novos). Paper.js entra só onde a matemática é difícil: ponto mais
// próximo numa curva, divisão de segmento, limites exatos e operações booleanas.
import paper from "paper/dist/paper-core.js";
import type { Caminho, NoVetor, PontoVetor } from "./modelo.ts";

let escopo: paper.PaperScope | null = null;
function P(): typeof paper {
  if (!escopo) {
    escopo = new paper.PaperScope();
    escopo.setup(new paper.Size(10, 10));
  }
  return escopo as unknown as typeof paper;
}

export interface Pt {
  x: number;
  y: number;
}
const KAPPA = 0.5522847498;
const copiarPonto = (p: PontoVetor): PontoVetor => ({ ...p, ein: p.ein && { ...p.ein }, eout: p.eout && { ...p.eout } });
export const copiarCaminhos = (c: Caminho[]): Caminho[] => c.map((k) => ({ fechado: k.fechado, pontos: k.pontos.map(copiarPonto) }));

// ---------------------------------------------------------------- paper ↔ dados

function criarPath(c: Caminho): paper.Path {
  const p = P();
  const segs = c.pontos.map((q) => new p.Segment(new p.Point(q.x, q.y), q.ein ? new p.Point(q.ein.x, q.ein.y) : undefined, q.eout ? new p.Point(q.eout.x, q.eout.y) : undefined));
  return new p.Path({ segments: segs, closed: c.fechado, insert: false });
}
function pontoDoSegmento(s: paper.Segment): PontoVetor {
  const ein = s.handleIn.length > 1e-6 ? { x: s.handleIn.x, y: s.handleIn.y } : undefined;
  const eout = s.handleOut.length > 1e-6 ? { x: s.handleOut.x, y: s.handleOut.y } : undefined;
  const q: PontoVetor = { x: s.point.x, y: s.point.y };
  if (ein) q.ein = ein;
  if (eout) q.eout = eout;
  if (ein && eout) {
    const cruz = (ein.x * eout.y - ein.y * eout.x) / (Math.hypot(ein.x, ein.y) * Math.hypot(eout.x, eout.y));
    const prod = ein.x * eout.x + ein.y * eout.y;
    if (Math.abs(cruz) < 0.02 && prod < 0) q.suave = true;
  }
  return q;
}
function deItem(item: paper.Item): Caminho[] {
  if (item instanceof P().CompoundPath) return item.children.flatMap((c) => deItem(c));
  if (item instanceof P().Path) return item.segments.length ? [{ pontos: item.segments.map(pontoDoSegmento), fechado: item.closed }] : [];
  return [];
}
function composto(cs: Caminho[], regra: "evenodd" | "nonzero"): paper.CompoundPath {
  return new (P().CompoundPath)({ children: cs.map(criarPath), fillRule: regra, insert: false });
}

export type OpBooleana = "unir" | "subtrair" | "interseccao" | "excluir";
// frente OP tras. "subtrair" = tras menos frente (a camada de cima recorta a de baixo, como no Figma).
export function combinar(op: OpBooleana, frente: Caminho[], tras: Caminho[], regraFrente: "evenodd" | "nonzero", regraTras: "evenodd" | "nonzero"): Caminho[] {
  const a = composto(frente, regraFrente);
  const b = composto(tras, regraTras);
  const r = op === "unir" ? b.unite(a, { insert: false }) : op === "subtrair" ? b.subtract(a, { insert: false }) : op === "interseccao" ? b.intersect(a, { insert: false }) : b.exclude(a, { insert: false });
  return deItem(r).filter((c) => c.pontos.length >= 2);
}

// ---------------------------------------------------------------- limites e normalização

export function limites(cs: Caminho[]): { x0: number; y0: number; x1: number; y1: number } {
  if (!cs.some((c) => c.pontos.length)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  const b = composto(cs, "nonzero").bounds;
  return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom };
}

// Reposiciona os pontos para que a caixa do nó coincida com os limites do desenho (a posição visual não muda).
export function normalizarVetor(n: NoVetor): NoVetor {
  const b = limites(n.caminhos);
  const l = Math.max(1, b.x1 - b.x0);
  const a = Math.max(1, b.y1 - b.y0);
  if (Math.abs(b.x0) < 1e-6 && Math.abs(b.y0) < 1e-6 && Math.abs(l - n.l) < 1e-6 && Math.abs(a - n.a) < 1e-6) return n;
  // o ponto local (x0,y0) passa a ser a origem; o centro novo é achado girando o deslocamento pelo ângulo do nó
  const r = (n.rot * Math.PI) / 180;
  const loc = (p: Pt) => {
    const dx = p.x - n.l / 2;
    const dy = p.y - n.a / 2;
    return { x: n.x + n.l / 2 + dx * Math.cos(r) - dy * Math.sin(r), y: n.y + n.a / 2 + dx * Math.sin(r) + dy * Math.cos(r) };
  };
  const centro = loc({ x: b.x0 + l / 2, y: b.y0 + a / 2 });
  const caminhos = n.caminhos.map((c) => ({ fechado: c.fechado, pontos: c.pontos.map((p) => ({ ...copiarPonto(p), x: p.x - b.x0, y: p.y - b.y0 })) }));
  const x = centro.x - l / 2;
  const y = centro.y - a / 2;
  // o texto guardado acompanha só os movimentos de verdade: o deslocamento da caixa por mudança do desenho não conta
  const original = n.original && { ...n.original, x: n.original.x + (x - n.x), y: n.original.y + (y - n.y) };
  return { ...n, caminhos, l, a, x, y, ...(original ? { original } : {}) };
}

// Redimensionar a caixa escala os pontos (as alças são relativas, então escalam junto).
export function escalarCaminhos(cs: Caminho[], sx: number, sy: number): Caminho[] {
  return cs.map((c) => ({
    fechado: c.fechado,
    pontos: c.pontos.map((p) => ({ ...p, x: p.x * sx, y: p.y * sy, ein: p.ein && { x: p.ein.x * sx, y: p.ein.y * sy }, eout: p.eout && { x: p.eout.x * sx, y: p.eout.y * sy } })),
  }));
}

// Aplica uma transformação afim (a ponto, só rotação/escala às alças).
export function transformarCaminhos(cs: Caminho[], pt: (p: Pt) => Pt, vet: (v: Pt) => Pt): Caminho[] {
  return cs.map((c) => ({
    fechado: c.fechado,
    pontos: c.pontos.map((p) => ({ ...p, ...pt(p), ein: p.ein && vet(p.ein), eout: p.eout && vet(p.eout) })),
  }));
}

// ---------------------------------------------------------------- formas e saída

export function retanguloParaCaminhos(l: number, a: number, raio: number): Caminho[] {
  const r = Math.max(0, Math.min(raio, l / 2, a / 2));
  if (r <= 0) return [{ fechado: true, pontos: [{ x: 0, y: 0 }, { x: l, y: 0 }, { x: l, y: a }, { x: 0, y: a }] }];
  const k = r * KAPPA;
  const q = (x: number, y: number, ein?: Pt, eout?: Pt): PontoVetor => ({ x, y, ...(ein ? { ein } : {}), ...(eout ? { eout } : {}) });
  return [{
    fechado: true,
    pontos: [
      q(r, 0, { x: -k, y: 0 }), q(l - r, 0, undefined, { x: k, y: 0 }),
      q(l, r, { x: 0, y: -k }), q(l, a - r, undefined, { x: 0, y: k }),
      q(l - r, a, { x: k, y: 0 }), q(r, a, undefined, { x: -k, y: 0 }),
      q(0, a - r, { x: 0, y: k }), q(0, r, undefined, { x: 0, y: -k }),
    ],
  }];
}

// Comando de caminho SVG ("M … C … Z") — serve ao Path2D da tela e à exportação SVG.
export function dSvg(cs: Caminho[]): string {
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = "";
  for (const c of cs) {
    const n = c.pontos.length;
    if (!n) continue;
    d += `M${f(c.pontos[0].x)} ${f(c.pontos[0].y)}`;
    const total = c.fechado ? n : n - 1;
    for (let i = 0; i < total; i++) {
      const a = c.pontos[i];
      const b = c.pontos[(i + 1) % n];
      if (a.eout || b.ein) d += `C${f(a.x + (a.eout?.x ?? 0))} ${f(a.y + (a.eout?.y ?? 0))} ${f(b.x + (b.ein?.x ?? 0))} ${f(b.y + (b.ein?.y ?? 0))} ${f(b.x)} ${f(b.y)}`;
      else if (!(c.fechado && i === n - 1)) d += `L${f(b.x)} ${f(b.y)}`; // o Z fecha a última reta sozinho
    }
    if (c.fechado) d += "Z";
  }
  return d;
}

const cachePath = new WeakMap<Caminho[], Path2D>();
export function path2D(cs: Caminho[]): Path2D {
  let p = cachePath.get(cs);
  if (!p) {
    p = new Path2D(dSvg(cs));
    cachePath.set(cs, p);
  }
  return p;
}

// ---------------------------------------------------------------- edição de pontos (imutável)

export interface Ref {
  c: number;
  p: number;
}
const trocar = (cs: Caminho[], c: number, f: (k: Caminho) => Caminho): Caminho[] => cs.map((k, i) => (i === c ? f(k) : k));
const trocarPonto = (cs: Caminho[], r: Ref, f: (p: PontoVetor) => PontoVetor): Caminho[] =>
  trocar(cs, r.c, (k) => ({ ...k, pontos: k.pontos.map((p, i) => (i === r.p ? f(p) : p)) }));

export function moverPontos(cs: Caminho[], sels: Ref[], dx: number, dy: number): Caminho[] {
  const set = new Set(sels.map((s) => `${s.c}:${s.p}`));
  return cs.map((k, c) => ({ ...k, pontos: k.pontos.map((p, i) => (set.has(`${c}:${i}`) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) }));
}

// Move uma alça. Num ponto suave a outra alça gira para ficar alinhada (mantendo o comprimento); `quebrar` (Alt) solta o alinhamento.
export function moverAlca(cs: Caminho[], r: Ref, lado: "ein" | "eout", v: Pt, quebrar: boolean): Caminho[] {
  return trocarPonto(cs, r, (p) => {
    const outro = lado === "ein" ? "eout" : "ein";
    const novo: PontoVetor = { ...p, [lado]: { x: v.x, y: v.y } };
    if (quebrar) novo.suave = false;
    else if (p.suave && p[outro]) {
      const len = Math.hypot(v.x, v.y) || 1;
      const lo = Math.hypot(p[outro]!.x, p[outro]!.y);
      novo[outro] = { x: (-v.x / len) * lo, y: (-v.y / len) * lo };
    }
    return novo;
  });
}

// Alterna canto ↔ suave. Para suave sem alças, calcula alças pela direção entre os vizinhos.
export function alternarSuave(cs: Caminho[], r: Ref): Caminho[] {
  const k = cs[r.c];
  const n = k.pontos.length;
  const p = k.pontos[r.p];
  if (p.suave) return trocarPonto(cs, r, (q) => ({ x: q.x, y: q.y }));
  const ant = k.pontos[(r.p - 1 + n) % n];
  const prox = k.pontos[(r.p + 1) % n];
  const extremo = !k.fechado && (r.p === 0 || r.p === n - 1);
  let tx = prox.x - ant.x;
  let ty = prox.y - ant.y;
  if (extremo) {
    const outro = r.p === 0 ? prox : ant;
    tx = r.p === 0 ? outro.x - p.x : p.x - outro.x;
    ty = r.p === 0 ? outro.y - p.y : p.y - outro.y;
  }
  const t = Math.hypot(tx, ty) || 1;
  const din = Math.hypot(p.x - ant.x, p.y - ant.y) / 3;
  const dout = Math.hypot(prox.x - p.x, prox.y - p.y) / 3;
  return trocarPonto(cs, r, (q) => ({
    ...q,
    suave: true,
    ...(extremo && r.p === 0 ? {} : { ein: { x: (-tx / t) * din, y: (-ty / t) * din } }),
    ...(extremo && r.p === n - 1 ? {} : { eout: { x: (tx / t) * dout, y: (ty / t) * dout } }),
  }));
}

// Insere um ponto sobre o segmento mais próximo de `alvo` (a forma não muda). Devolve null se estiver longe demais.
export function inserirPonto(cs: Caminho[], alvo: Pt, tolerancia: number): { caminhos: Caminho[]; novo: Ref } | null {
  const p = P();
  let melhor: { c: number; d: number; loc: paper.CurveLocation } | null = null;
  cs.forEach((c, i) => {
    if (c.pontos.length < 2) return;
    const loc = criarPath(c).getNearestLocation(new p.Point(alvo.x, alvo.y));
    if (loc && (!melhor || loc.distance < melhor.d)) melhor = { c: i, d: loc.distance, loc };
  });
  if (!melhor) return null;
  const m = melhor as { c: number; d: number; loc: paper.CurveLocation };
  if (m.d > tolerancia) return null;
  const path = criarPath(cs[m.c]);
  const loc = path.getNearestLocation(new p.Point(alvo.x, alvo.y));
  const idx = loc.index; // curva (segmento) onde entra o ponto
  const t = loc.time;
  if (t < 0.02 || t > 0.98) return null; // praticamente em cima de um ponto existente
  path.divideAt(loc);
  const novo = deItem(path)[0];
  return { caminhos: cs.map((k, i) => (i === m.c ? { ...novo, fechado: k.fechado } : k)), novo: { c: m.c, p: idx + 1 } };
}

export function apagarPontos(cs: Caminho[], sels: Ref[]): Caminho[] {
  const set = new Set(sels.map((s) => `${s.c}:${s.p}`));
  return cs
    .map((k, c) => ({ ...k, pontos: k.pontos.filter((_, i) => !set.has(`${c}:${i}`)) }))
    .filter((k) => k.pontos.length >= 2);
}

// Caneta: acrescenta um ponto ao caminho aberto `c` (ou abre um novo caminho se c for -1). Devolve o caminho e o índice do caminho.
export function acrescentarPonto(cs: Caminho[], c: number, ponto: PontoVetor): { caminhos: Caminho[]; c: number } {
  if (c < 0 || !cs[c] || cs[c].fechado) return { caminhos: [...cs, { fechado: false, pontos: [ponto] }], c: cs.length };
  return { caminhos: trocar(cs, c, (k) => ({ ...k, pontos: [...k.pontos, ponto] })), c };
}
export function fecharCaminho(cs: Caminho[], c: number): Caminho[] {
  return trocar(cs, c, (k) => {
    if (k.pontos.length < 3) return k;
    return { ...k, fechado: true };
  });
}
// Define as alças do último ponto (caneta arrastando): eout segue o mouse e ein espelha.
export function alcasDoUltimo(cs: Caminho[], c: number, v: Pt): Caminho[] {
  return trocar(cs, c, (k) => ({
    ...k,
    pontos: k.pontos.map((p, i) => (i === k.pontos.length - 1 ? { ...p, suave: true, eout: { x: v.x, y: v.y }, ein: { x: -v.x, y: -v.y } } : p)),
  }));
}
