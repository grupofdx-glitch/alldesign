// Nível Imagem (o "Photoshop" de dentro do objeto): edita os pixels de uma camada de imagem sem tocar no original.
// Duas camadas à parte: `pintura` (pincel, desfoque) e `mascara` (o que a borracha apagou; restaurar devolve).
// O resultado é original + pintura, recortado pela máscara, com os ajustes por cima. Trabalha em resolução limitada
// (LADO_MAX) para o pincel responder bem em fotos grandes.
import { type Ajustes, type NoImagem, ajustesNeutros } from "./modelo.ts";
import { borrar, novaCamada } from "./camadas.ts";
import { midiaDe, registrar } from "./midia.ts";

export const LADO_MAX = 1600;
const PILHA_MAX = 10;

export type FerrImagem = "pincel" | "borracha" | "restaurar" | "desfocar" | "conta" | "retangulo" | "laco";
export interface Pincel {
  tamanho: number; // px do slide
  op: number; // 0–100
  dureza: number; // 0–100
  cor: string;
}
export interface Ponto {
  x: number;
  y: number;
}

// ---------------------------------------------------------------- geometria (pura)

// "preencher": a imagem cobre a caixa do nó sem distorcer, cortando o que sobra. Converte um ponto da caixa (px do slide,
// origem no canto) em pixel da imagem de trabalho (largura `w`), e dá o fator px do slide → px de trabalho.
export function paraTrabalho(no: { l: number; a: number }, orig: { l: number; a: number }, w: number, local: Ponto): Ponto {
  const k = Math.max(no.l / orig.l, no.a / orig.a);
  const sx = (orig.l - no.l / k) / 2;
  const sy = (orig.a - no.a / k) / 2;
  const kw = w / orig.l;
  return { x: (sx + local.x / k) * kw, y: (sy + local.y / k) * kw };
}
export function fatorTrabalho(no: { l: number; a: number }, orig: { l: number; a: number }, w: number): number {
  return w / orig.l / Math.max(no.l / orig.l, no.a / orig.a);
}
export function dimensoesDeTrabalho(orig: { l: number; a: number }): { w: number; h: number } {
  const s = Math.min(1, LADO_MAX / Math.max(orig.l, orig.a));
  return { w: Math.max(1, Math.round(orig.l * s)), h: Math.max(1, Math.round(orig.a * s)) };
}

export function filtroDeAjustes(a: Ajustes): string {
  return `brightness(${1 + a.brilho / 100}) contrast(${1 + a.contraste / 100}) saturate(${1 + a.saturacao / 100})`;
}

// original + pintura, recortado pela máscara, com os ajustes por cima (a ordem do Photoshop: camada ajustada por último)
export function comporImagem(
  orig: CanvasImageSource, pintura: CanvasImageSource | null, mascara: CanvasImageSource | null, w: number, h: number, ajustes?: Ajustes,
): HTMLCanvasElement {
  const c = novaCamada(w, h);
  const x = c.getContext("2d")!;
  x.drawImage(orig, 0, 0, w, h);
  if (pintura) x.drawImage(pintura, 0, 0, w, h);
  if (mascara) {
    x.globalCompositeOperation = "destination-in";
    x.drawImage(mascara, 0, 0, w, h);
  }
  if (ajustes && !ajustesNeutros(ajustes)) {
    const o = novaCamada(w, h);
    const k = o.getContext("2d")!;
    k.filter = filtroDeAjustes(ajustes);
    k.drawImage(c, 0, 0);
    return o;
  }
  return c;
}

function rgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1], 16) : 0;
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
const clonar = (c: HTMLCanvasElement) => {
  const d = novaCamada(c.width, c.height);
  d.getContext("2d")!.drawImage(c, 0, 0);
  return d;
};

// ---------------------------------------------------------------- sessão

interface Snapshot {
  alvo: "pintura" | "mascara";
  canvas: HTMLCanvasElement;
}
export interface Selecao {
  pontos: Ponto[]; // polígono em px de trabalho (o retângulo são 4 pontos)
  invertida: boolean;
}

export class SessaoImagem {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  readonly orig: ImageBitmap;
  readonly origL: number;
  readonly origA: number;
  pintura: HTMLCanvasElement;
  mascara: HTMLCanvasElement;
  selecao: Selecao | null = null;
  suja = { pintura: false, mascara: false };
  private hashes: { pintura?: string; mascara?: string };
  private desfazerPilha: Snapshot[] = [];
  private refazerPilha: Snapshot[] = [];
  private cache: { chave: string; canvas: HTMLCanvasElement } | null = null;
  private versao = 0;
  private ult: Ponto | null = null;
  private ferr: FerrImagem | null = null;
  private desfocado: HTMLCanvasElement | null = null;
  private inicioSel: Ponto | null = null;
  private lacoPts: Ponto[] = [];

  private constructor(no: NoImagem, orig: ImageBitmap, w: number, h: number, pintura: ImageBitmap | null, mascara: ImageBitmap | null) {
    this.id = no.id;
    this.orig = orig;
    this.origL = orig.width;
    this.origA = orig.height;
    this.w = w;
    this.h = h;
    this.hashes = { pintura: no.edicao?.pintura, mascara: no.edicao?.mascara };
    this.pintura = novaCamada(w, h);
    if (pintura) this.pintura.getContext("2d")!.drawImage(pintura, 0, 0, w, h);
    this.mascara = novaCamada(w, h);
    const mc = this.mascara.getContext("2d")!;
    if (mascara) mc.drawImage(mascara, 0, 0, w, h);
    else {
      mc.fillStyle = "#fff";
      mc.fillRect(0, 0, w, h);
    }
  }

  static abrir(no: NoImagem): SessaoImagem | null {
    const m = midiaDe(no.hash);
    if (!m) return null;
    const p = no.edicao?.pintura ? midiaDe(no.edicao.pintura) : undefined;
    const k = no.edicao?.mascara ? midiaDe(no.edicao.mascara) : undefined;
    const ref = p ?? k;
    const { w, h } = ref ? { w: ref.l, h: ref.a } : dimensoesDeTrabalho({ l: m.l, a: m.a });
    return new SessaoImagem(no, m.bitmap, w, h, p?.bitmap ?? null, k?.bitmap ?? null);
  }

  get podeDesfazer() { return this.desfazerPilha.length > 0; }
  get podeRefazer() { return this.refazerPilha.length > 0; }
  get alterada() { return this.suja.pintura || this.suja.mascara; }

  composto(ajustes?: Ajustes): HTMLCanvasElement {
    const chave = `${this.versao}|${JSON.stringify(ajustes ?? null)}`;
    if (this.cache?.chave !== chave) this.cache = { chave, canvas: comporImagem(this.orig, this.pintura, this.mascara, this.w, this.h, ajustes) };
    return this.cache.canvas;
  }
  private mudou() { this.versao++; }

  private guardar(alvo: "pintura" | "mascara") {
    this.desfazerPilha.push({ alvo, canvas: clonar(this[alvo]) });
    if (this.desfazerPilha.length > PILHA_MAX) this.desfazerPilha.shift();
    this.refazerPilha = [];
    this.suja[alvo] = true;
  }
  private trocar(de: Snapshot[], para: Snapshot[]): boolean {
    const s = de.pop();
    if (!s) return false;
    para.push({ alvo: s.alvo, canvas: clonar(this[s.alvo]) });
    const c = this[s.alvo].getContext("2d")!;
    c.globalCompositeOperation = "copy";
    c.drawImage(s.canvas, 0, 0);
    c.globalCompositeOperation = "source-over";
    this.mudou();
    return true;
  }
  desfazer() { return this.trocar(this.desfazerPilha, this.refazerPilha); }
  refazer() { return this.trocar(this.refazerPilha, this.desfazerPilha); }

  // Caminho da seleção em px de trabalho; invertida = tudo menos o polígono (regra par-ímpar com o retângulo todo).
  private caminhoDaSelecao(): { path: Path2D; regra: CanvasFillRule } | null {
    const s = this.selecao;
    if (!s || s.pontos.length < 3) return null;
    const path = new Path2D();
    if (s.invertida) path.rect(0, 0, this.w, this.h);
    s.pontos.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    return { path, regra: s.invertida ? "evenodd" : "nonzero" };
  }

  // ---- gesto de pintura ----
  private estampa(ctx: CanvasRenderingContext2D, p: Ponto, r: number, dureza: number, cor: string, op: number) {
    const interno = Math.min(r * dureza, r - 0.5);
    const g = ctx.createRadialGradient(p.x, p.y, Math.max(0, interno), p.x, p.y, r);
    g.addColorStop(0, rgba(cor, op));
    g.addColorStop(1, rgba(cor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  private estampaDesfoque(ctx: CanvasRenderingContext2D, p: Ponto, r: number, dureza: number, op: number) {
    const lado = Math.ceil(r * 2 + 2);
    const t = novaCamada(lado, lado);
    const c = t.getContext("2d")!;
    const x0 = Math.round(p.x - lado / 2);
    const y0 = Math.round(p.y - lado / 2);
    c.drawImage(this.desfocado!, x0, y0, lado, lado, 0, 0, lado, lado);
    c.globalCompositeOperation = "destination-in";
    this.estampa(c, { x: lado / 2 + (p.x - x0 - lado / 2), y: lado / 2 + (p.y - y0 - lado / 2) }, r, dureza, "#fff", op);
    ctx.drawImage(t, x0, y0);
  }
  private espalhar(a: Ponto, b: Ponto, pincel: Pincel, f: number, ferr: FerrImagem) {
    const r = Math.max(0.5, (pincel.tamanho * f) / 2);
    const dureza = pincel.dureza / 100;
    const op = pincel.op / 100;
    const passo = Math.max(1, r * 0.22);
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / passo));
    const alvo = ferr === "borracha" || ferr === "restaurar" ? this.mascara : this.pintura;
    const ctx = alvo.getContext("2d")!;
    ctx.save();
    const sel = this.caminhoDaSelecao();
    if (sel) ctx.clip(sel.path, sel.regra);
    if (ferr === "borracha") ctx.globalCompositeOperation = "destination-out";
    for (let i = 1; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      if (ferr === "desfocar") this.estampaDesfoque(ctx, p, r, dureza, op);
      else this.estampa(ctx, p, r, dureza, ferr === "pincel" ? pincel.cor : "#ffffff", op);
    }
    ctx.restore();
    this.mudou();
  }

  // Devolve a cor sob o ponto quando a ferramenta é o conta-gotas.
  inicio(ferr: FerrImagem, p: Ponto, pincel: Pincel, f: number): string | null {
    this.ferr = ferr;
    this.ult = p;
    if (ferr === "conta") {
      const c = this.composto();
      const d = c.getContext("2d")!.getImageData(Math.min(this.w - 1, Math.max(0, Math.floor(p.x))), Math.min(this.h - 1, Math.max(0, Math.floor(p.y))), 1, 1).data;
      this.ferr = null;
      return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    }
    if (ferr === "retangulo" || ferr === "laco") {
      this.inicioSel = p;
      this.lacoPts = [p];
      this.selecao = { pontos: [], invertida: false };
      return null;
    }
    this.guardar(ferr === "borracha" || ferr === "restaurar" ? "mascara" : "pintura");
    if (ferr === "desfocar") {
      // um único desfoque do resultado atual por pincelada; a pincelada só "revela" esse desfoque
      this.desfocado = borrar(comporImagem(this.orig, this.pintura, this.mascara, this.w, this.h), Math.max(2, ((pincel.tamanho * f) / 2) * 0.35));
    }
    this.espalhar(p, p, pincel, f, ferr);
    return null;
  }
  mover(p: Ponto, pincel: Pincel, f: number) {
    const ferr = this.ferr;
    if (!ferr || !this.ult) return;
    if (ferr === "retangulo" && this.inicioSel) {
      const a = this.inicioSel;
      this.selecao = { pontos: [a, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }], invertida: false };
    } else if (ferr === "laco") {
      this.lacoPts.push(p);
      this.selecao = { pontos: [...this.lacoPts], invertida: false };
    } else this.espalhar(this.ult, p, pincel, f, ferr);
    this.ult = p;
  }
  fim() {
    if (this.ferr === "retangulo" || this.ferr === "laco") {
      const pts = this.selecao?.pontos ?? [];
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const pequena = pts.length < 3 || Math.max(...xs) - Math.min(...xs) < 3 || Math.max(...ys) - Math.min(...ys) < 3;
      if (pequena) this.selecao = null;
    }
    this.ferr = null;
    this.ult = null;
    this.desfocado = null;
    this.inicioSel = null;
    this.lacoPts = [];
  }

  // ---- operações sobre a seleção ----
  temSelecao() { return !!this.caminhoDaSelecao(); }
  desmarcar() { this.selecao = null; }
  inverter() {
    if (this.selecao && this.selecao.pontos.length >= 3) this.selecao = { ...this.selecao, invertida: !this.selecao.invertida };
    else this.selecao = { pontos: [{ x: 0, y: 0 }, { x: this.w, y: 0 }, { x: this.w, y: this.h }, { x: 0, y: this.h }], invertida: false };
  }
  apagarSelecao() {
    const s = this.caminhoDaSelecao();
    if (!s) return false;
    this.guardar("mascara");
    const c = this.mascara.getContext("2d")!;
    c.save();
    c.globalCompositeOperation = "destination-out";
    c.fill(s.path, s.regra);
    c.restore();
    this.mudou();
    return true;
  }
  preencherSelecao(cor: string, op: number) {
    const s = this.caminhoDaSelecao();
    if (!s) return false;
    this.guardar("pintura");
    const c = this.pintura.getContext("2d")!;
    c.save();
    c.globalAlpha = op / 100;
    c.fillStyle = cor;
    c.fill(s.path, s.regra);
    c.restore();
    this.mudou();
    return true;
  }
  restaurarTudo() {
    this.guardar("pintura");
    this.guardar("mascara");
    this.pintura.getContext("2d")!.clearRect(0, 0, this.w, this.h);
    const m = this.mascara.getContext("2d")!;
    m.globalCompositeOperation = "copy";
    m.fillStyle = "#fff";
    m.fillRect(0, 0, this.w, this.h);
    m.globalCompositeOperation = "source-over";
    this.mudou();
  }

  // PNGs das camadas alteradas, registrados na mídia; as que não mudaram mantêm o hash que já tinham.
  async exportar(): Promise<{ pintura?: string; mascara?: string }> {
    const sai: { pintura?: string; mascara?: string } = { ...this.hashes };
    for (const alvo of ["pintura", "mascara"] as const) {
      if (!this.suja[alvo]) continue;
      const blob = await new Promise<Blob | null>((ok) => this[alvo].toBlob(ok, "image/png"));
      if (!blob) continue;
      const r = await registrar(new Uint8Array(await blob.arrayBuffer()), "image/png");
      sai[alvo] = r.hash;
    }
    return sai;
  }
}
