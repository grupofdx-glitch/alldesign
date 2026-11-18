// Renderizador único: a tela e a exportação passam por aqui, então o que se vê é o que sai no arquivo.
// `desenharSlide` pinta no espaço do slide (0,0 no canto); quem chama define a escala no contexto.
// Efeitos (desfoque e sombra) são feitos numa camada própria do nó, em resolução de tela, e ficam em cache.
import { type Fonte, type Documento, type FxDesfoque, type No, type NoImagem, type NoRetangulo, type NoTexto, type Parada, type Slide, ajustesNeutros } from "./modelo.ts";
import { comporImagem, dimensoesDeTrabalho } from "./imagem.ts";
import { caixa } from "./geom.ts";
import { midiaDe } from "./midia.ts";
import { borrar, borrarDireto, borrarPequeno, fatorDeReducao, novaCamada } from "./camadas.ts";
import { pilhaCss, temItalico } from "./familias.ts";
import { continuo, origemDoSlide, origemDoSlidePorId } from "./grade.ts";
import { path2D } from "./vetor.ts";

export { borrar };

export const FAMILIAS = new Proxy({} as Record<Fonte, string>, { get: (_, f: string) => pilhaCss(f as Fonte) });

let medidor: CanvasRenderingContext2D | null = null;
function ctxMedidor(): CanvasRenderingContext2D {
  if (!medidor) medidor = document.createElement("canvas").getContext("2d")!;
  return medidor;
}
export const fonteCss = (n: NoTexto) => `${n.italico && temItalico(n.fonte, n.peso) ? "italic " : ""}${n.peso} ${n.tamanho}px ${FAMILIAS[n.fonte]}`;
// Fonte e espaço entre letras no contexto: medir e desenhar usam sempre os dois (senão a quebra de linha não bate).
export function prepararFonte(ctx: CanvasRenderingContext2D, n: NoTexto) {
  ctx.font = fonteCss(n);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(n.espacamento ?? 0) * n.tamanho}px`;
}

// Quebra o texto em linhas que cabem na largura (palavras; respeita quebras manuais).
export function quebrarTexto(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  for (const par of texto.split("\n")) {
    let atual = "";
    for (const palavra of par.split(" ")) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (atual && ctx.measureText(teste).width > largura) {
        linhas.push(atual);
        atual = palavra;
      } else atual = teste;
    }
    linhas.push(atual);
  }
  return linhas;
}
// As linhas do texto como o desenho as quebra (a conversão em contornos usa as mesmas, para sair idêntico).
export function linhasDoTexto(n: NoTexto): string[] {
  const ctx = ctxMedidor();
  prepararFonte(ctx, n);
  return quebrarTexto(ctx, n.texto, n.l);
}
export function alturaDoTexto(n: NoTexto): number {
  const ctx = ctxMedidor();
  prepararFonte(ctx, n);
  return Math.max(n.tamanho, Math.ceil(quebrarTexto(ctx, n.texto, n.l).length * n.tamanho * n.entrelinha));
}

function caminhoRetangulo(ctx: CanvasRenderingContext2D, l: number, a: number, r: number) {
  const raio = Math.max(0, Math.min(r, l / 2, a / 2));
  ctx.beginPath();
  if (raio > 0) ctx.roundRect(0, 0, l, a, raio);
  else ctx.rect(0, 0, l, a);
}

// Cor com opacidade (paradas de degradê, borda): "#rrggbb" + op 0–100 → rgba().
export function rgba(hex: string, op = 100): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1], 16) : 0;
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${op / 100})`;
}
function pararCores(g: CanvasGradient, paradas: Parada[]) {
  for (const p of paradas) g.addColorStop(Math.min(1, Math.max(0, p.pos)), rgba(p.cor, p.op ?? 100));
}
// Linha de base da linha i: meia-entrelinha + ascendente aproximada, para o texto assentar no topo da caixa.
export const baseDaLinha = (n: NoTexto, i: number) => i * n.tamanho * n.entrelinha + (n.tamanho * n.entrelinha + n.tamanho * 0.72) / 2;

function desenharTexto(ctx: CanvasRenderingContext2D, n: NoTexto) {
  prepararFonte(ctx, n);
  ctx.fillStyle = n.cor;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = n.alinhar;
  const x = n.alinhar === "left" ? 0 : n.alinhar === "center" ? n.l / 2 : n.l;
  quebrarTexto(ctx, n.texto, n.l).forEach((linha, i) => {
    const base = baseDaLinha(n, i);
    if (n.degrade?.paradas.length) {
      const g = ctx.createLinearGradient(0, base + n.degrade.de * n.tamanho, 0, base + n.degrade.ate * n.tamanho);
      pararCores(g, n.degrade.paradas);
      ctx.fillStyle = g;
    }
    ctx.fillText(linha, x, base);
  });
}

// Preenchimento do retângulo: cor (com opCor) ou degradê linear (ângulo do CSS) ou radial (elipse que toca os lados).
function preencherRetangulo(ctx: CanvasRenderingContext2D, r: NoRetangulo) {
  const g = r.gradiente;
  if (!g?.paradas.length) {
    ctx.fillStyle = r.opCor === undefined || r.opCor >= 100 ? r.cor : rgba(r.cor, r.opCor);
    ctx.fill();
    return;
  }
  if (g.tipo === "linear") {
    // a linha do degradê do CSS: passa pelo centro, no ângulo dado, com o comprimento que faz os cantos caírem em 0 e 1
    const t = (g.angulo * Math.PI) / 180;
    const dx = Math.sin(t);
    const dy = -Math.cos(t);
    const meio = (Math.abs(r.l * dx) + Math.abs(r.a * dy)) / 2;
    const lg = ctx.createLinearGradient(r.l / 2 - dx * meio, r.a / 2 - dy * meio, r.l / 2 + dx * meio, r.a / 2 + dy * meio);
    pararCores(lg, g.paradas);
    ctx.fillStyle = lg;
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.clip();
  ctx.translate(r.l / 2, r.a / 2);
  const k = r.a / Math.max(1e-6, r.l);
  ctx.scale(1, k);
  const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r.l / 2);
  pararCores(rg, g.paradas);
  ctx.fillStyle = rg;
  ctx.fillRect(-r.l / 2, -r.a / 2 / k, r.l, r.a / k);
  ctx.restore();
}
function bordaDoRetangulo(ctx: CanvasRenderingContext2D, r: NoRetangulo) {
  const b = r.borda;
  if (!b || b.largura <= 0) return;
  const w = Math.min(b.largura, r.l / 2, r.a / 2);
  ctx.save();
  ctx.translate(w / 2, w / 2);
  caminhoRetangulo(ctx, r.l - w, r.a - w, Math.max(0, r.raio - w / 2));
  ctx.restore();
  ctx.lineWidth = w;
  ctx.strokeStyle = rgba(b.cor, b.op ?? 100);
  ctx.stroke();
}

// Durante a edição de uma imagem, quem edita registra aqui como obter o resultado ao vivo (camadas ainda não gravadas).
type Provedor = (n: NoImagem) => HTMLCanvasElement | null;
let provedorDeImagem: Provedor | null = null;
export function definirProvedorDeImagem(p: Provedor | null) {
  provedorDeImagem = p;
}

// Resultado da edição já gravada no nó (pintura, máscara e ajustes), em cache.
const cacheImagem = new Map<string, HTMLCanvasElement>();
function imagemEditada(n: NoImagem): HTMLCanvasElement | null {
  const ed = n.edicao;
  if (!ed?.pintura && !ed?.mascara && ajustesNeutros(n.ajustes)) return null;
  const chave = JSON.stringify([n.hash, ed, n.ajustes]);
  let c = cacheImagem.get(chave);
  if (!c) {
    const o = midiaDe(n.hash);
    if (!o) return null;
    const p = ed?.pintura ? midiaDe(ed.pintura) : undefined;
    const k = ed?.mascara ? midiaDe(ed.mascara) : undefined;
    const ref = p ?? k;
    const { w, h } = ref ? { w: ref.l, h: ref.a } : dimensoesDeTrabalho({ l: o.l, a: o.a });
    c = comporImagem(o.bitmap, p?.bitmap ?? null, k?.bitmap ?? null, w, h, n.ajustes);
    cacheImagem.set(chave, c);
    if (cacheImagem.size > 12) cacheImagem.delete(cacheImagem.keys().next().value as string);
  }
  return c;
}

function desenharImagem(ctx: CanvasRenderingContext2D, n: NoImagem) {
  const m = midiaDe(n.hash);
  if (!m) {
    ctx.fillStyle = "#555";
    ctx.fillRect(0, 0, n.l, n.a);
    return;
  }
  const fonte: { img: CanvasImageSource; l: number; a: number } = { img: m.bitmap, l: m.l, a: m.a };
  const c = provedorDeImagem?.(n) ?? imagemEditada(n);
  if (c) Object.assign(fonte, { img: c, l: c.width, a: c.height });
  // "preencher": cobre a caixa sem distorcer, cortando o que sobra
  const k = Math.max(n.l / fonte.l, n.a / fonte.a);
  const sw = n.l / k;
  const sh = n.a / k;
  // reduzir uma foto grande com a qualidade padrão serrilha (o medalhão de 1024 px num círculo de 300); "high" faz
  // como o navegador faz numa <img> reduzida
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fonte.img, (fonte.l - sw) / 2, (fonte.a - sh) / 2, sw, sh, 0, 0, n.l, n.a);
}

// Conteúdo do nó no espaço local (0,0 = canto da caixa), sem rotação, opacidade nem efeitos.
function desenharConteudo(ctx: CanvasRenderingContext2D, n: No) {
  if (n.tipo === "retangulo") {
    const r = n as NoRetangulo;
    caminhoRetangulo(ctx, r.l, r.a, r.raio);
    preencherRetangulo(ctx, r);
    bordaDoRetangulo(ctx, r);
  } else if (n.tipo === "texto") desenharTexto(ctx, n);
  else if (n.tipo === "vetor") {
    const p = path2D(n.caminhos);
    if (n.cor) {
      ctx.fillStyle = n.cor;
      ctx.fill(p, n.regra);
    }
    if (n.traco && n.traco.largura > 0) {
      ctx.strokeStyle = n.traco.cor;
      ctx.lineWidth = n.traco.largura;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(p);
    }
  } else {
    ctx.save();
    caminhoRetangulo(ctx, n.l, n.a, 0);
    ctx.clip();
    desenharImagem(ctx, n);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- efeitos

const TETO = 4096; // lado máximo de uma camada de efeito

// Reflete as bordas do conteúdo para a margem, para o desfoque não "puxar transparência" para dentro da imagem, e
// desfoca. Tudo na resolução reduzida do desfoque: só a versão desfocada é usada, sempre esticada para o tamanho da base.
// (Cada camada de tela cheia custa caro numa placa de vídeo integrada; por isso o mínimo delas.)
function refletidoBorrado(base: HTMLCanvasElement, pad: number, l: number, a: number, raio: number): HTMLCanvasElement {
  const f = fatorDeReducao(raio);
  const r = novaCamada(base.width / f, base.height / f);
  const c = r.getContext("2d")!;
  c.imageSmoothingQuality = "high";
  c.scale(r.width / base.width, r.height / base.height);
  c.drawImage(base, 0, 0);
  const sc = base.width / (l + 2 * pad);
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      c.save();
      c.translate((pad + (dx === 0 ? 0 : dx < 0 ? 0 : l)) * sc, (pad + (dy === 0 ? 0 : dy < 0 ? 0 : a)) * sc);
      c.scale(dx ? -1 : 1, dy ? -1 : 1);
      // espelhado, o lado direito e o de baixo precisam ser desenhados "para trás" para cair fora da caixa
      c.drawImage(base, pad * sc, pad * sc, l * sc, a * sc, dx > 0 ? -l * sc : 0, dy > 0 ? -a * sc : 0, l * sc, a * sc);
      c.restore();
    }
  }
  return borrarDireto(r, raio / f);
}

// Máscara da área (branco = desfocado), já com a borda suavizada; pode vir reduzida.
function mascaraDaArea(d: FxDesfoque, l: number, a: number, pad: number, sc: number, larg: number, alt: number): HTMLCanvasElement {
  const raio = (d.area.suave * sc) / 2;
  const f = fatorDeReducao(raio);
  const forma = novaCamada(larg / f, alt / f);
  const c = forma.getContext("2d")!;
  c.scale(forma.width / larg, forma.height / alt);
  c.fillStyle = "#fff";
  const x = (pad + d.area.x * l) * sc;
  const y = (pad + d.area.y * a) * sc;
  const w = d.area.l * l * sc;
  const h = d.area.a * a * sc;
  c.beginPath();
  if (d.area.forma === "elipse") c.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
  else c.rect(x, y, w, h);
  c.fill();
  return raio < 0.4 ? forma : borrarDireto(forma, raio / f);
}

// Mistura: base·(1−m) + desfocado·m, certo também para conteúdo semitransparente (texto sobre vazio).
function misturar(base: HTMLCanvasElement, borrado: HTMLCanvasElement, mascara: HTMLCanvasElement): HTMLCanvasElement {
  const W = base.width;
  const H = base.height;
  const fora = novaCamada(W, H);
  const c = fora.getContext("2d")!;
  c.drawImage(base, 0, 0);
  c.globalCompositeOperation = "destination-out";
  c.drawImage(mascara, 0, 0, W, H);
  const dentro = novaCamada(W, H);
  const k = dentro.getContext("2d")!;
  k.drawImage(borrado, 0, 0, W, H);
  k.globalCompositeOperation = "destination-in";
  k.drawImage(mascara, 0, 0, W, H);
  // somar (não sobrepor): fora tem alfa a·(1−m) e dentro a·m; sobrepor dava 1−m+m² e o fundo vazava cinza na transição
  c.globalCompositeOperation = "lighter";
  c.drawImage(dentro, 0, 0);
  return fora;
}

const NIVEIS = 4;
function progressivo(base: HTMLCanvasElement, d: FxDesfoque, l: number, a: number, pad: number, sc: number): HTMLCanvasElement {
  const { dir, ini, fim } = d.prog;
  const W = base.width;
  const H = base.height;
  const horizontal = dir === "direita" || dir === "esquerda";
  const inverso = dir === "cima" || dir === "esquerda";
  const comp = (horizontal ? l : a) * sc;
  const origem = pad * sc;
  const p0 = inverso ? origem + comp : origem;
  const p1 = inverso ? origem : origem + comp;
  const grad = (stops: [number, number][]) => {
    const g = horizontal ? ctxMedidor().createLinearGradient(p0, 0, p1, 0) : ctxMedidor().createLinearGradient(0, p0, 0, p1);
    stops.forEach(([u, al]) => g.addColorStop(Math.min(1, Math.max(0, u)), `rgba(255,255,255,${al})`));
    return g;
  };
  const a0 = Math.min(ini, fim - 0.001);
  const pos = (t: number) => a0 + (fim - a0) * t; // t∈[0,1] → posição ao longo do eixo da caixa
  const saida = novaCamada(W, H);
  const so = saida.getContext("2d")!;
  so.globalCompositeOperation = "lighter";
  const parte = novaCamada(W, H); // reaproveitada a cada nível
  const pc = parte.getContext("2d")!;
  pc.imageSmoothingQuality = "high";
  // pesos em "chapéu" por nível k, em função de t = (u − ini)/(fim − ini)
  const peso = (k: number, t: number) => Math.max(0, 1 - Math.abs(t * NIVEIS - k));
  for (let k = 0; k <= NIVEIS; k++) {
    const r = (d.raio * sc * k) / NIVEIS;
    const nivel = k === 0 ? base : d.prog.firmes ? refletidoBorrado(base, pad, l, a, r) : borrarPequeno(base, r);
    // pontos de quebra da rampa: 0, ini, cada nível, fim, 1
    const us = [0, pos(0), ...Array.from({ length: NIVEIS + 1 }, (_, j) => pos(j / NIVEIS)), pos(1), 1].sort((x, y) => x - y);
    const stops: [number, number][] = us.map((u) => {
      const t = (u - a0) / (fim - a0);
      const tt = Math.min(1, Math.max(0, t));
      return [u, peso(k, tt)];
    });
    pc.globalCompositeOperation = "copy";
    pc.drawImage(nivel, 0, 0, W, H);
    pc.globalCompositeOperation = "destination-in";
    pc.fillStyle = grad(stops); // o gradiente é medido sobre a caixa (origem..origem+comp)
    pc.fillRect(0, 0, W, H);
    so.drawImage(parte, 0, 0);
  }
  return saida;
}

function camadaDeEfeitos(n: No, sc: number): { canvas: HTMLCanvasElement; pad: number; sc: number } {
  const f = n.fx!;
  const raioD = f.desfoque ? f.desfoque.raio : 0;
  const pad = Math.ceil(Math.max(raioD * 3, f.sombra ? f.sombra.raio * 2 + Math.max(Math.abs(f.sombra.x), Math.abs(f.sombra.y)) : 0)) + 2;
  const s = Math.min(sc, TETO / (n.l + 2 * pad), TETO / (n.a + 2 * pad));
  const W = (n.l + 2 * pad) * s;
  const H = (n.a + 2 * pad) * s;
  const base = novaCamada(W, H);
  const bc = base.getContext("2d")!;
  bc.setTransform(s, 0, 0, s, pad * s, pad * s);
  desenharConteudo(bc, n);
  let saida = base;
  const d = f.desfoque;
  if (d && d.raio > 0) {
    if (d.modo === "camada") saida = borrar(base, d.raio * s);
    else {
      if (d.modo === "area") {
        const borrado = refletidoBorrado(base, pad, n.l, n.a, d.raio * s);
        saida = misturar(base, borrado, mascaraDaArea(d, n.l, n.a, pad, s, base.width, base.height));
      } else saida = progressivo(base, d, n.l, n.a, pad, s);
      // área e progressivo de bordas firmes não vazam para fora da caixa (a saída é uma camada nova: recorta nela
      // mesma); o progressivo comum esfuma as bordas para fora, como no Figma
      if (d.modo === "area" || d.prog.firmes) {
        const rc = saida.getContext("2d")!;
        rc.globalCompositeOperation = "destination-in";
        // arredondado para fora: um corte entre pixels deixaria a borda meio transparente
        const x0 = Math.floor(pad * s), y0 = Math.floor(pad * s);
        rc.fillRect(x0, y0, Math.ceil((pad + n.l) * s) - x0, Math.ceil((pad + n.a) * s) - y0);
        rc.globalCompositeOperation = "source-over";
      }
    }
  }
  return { canvas: saida, pad, sc: s };
}

type Camada = { canvas: HTMLCanvasElement; pad: number; sc: number };
const cache = new Map<string, Camada>();
const TETO_DE_PIXELS = 48_000_000; // ~190 MB
let pixelsEmCache = 0;

// Refazer um desfoque custa de dezenas a centenas de ms. No zoom (a escala muda) e ao redimensionar (a caixa muda)
// isso acontecia a cada passo e a tela travava. Na tela, então, quando só a escala ou o tamanho mudaram, desenha-se
// a última camada daquele nó esticada e a exata é feita quando os passos param. Exportar nunca entra aqui.
let aoAssentar: (() => void) | null = null;
let assentando = false; // este desenho faz as camadas exatas
let assentarNaProxima = false;
let espera = 0;
const ultimaConstrucao = new Map<string, number>();
const rapida = new Map<string, { chave: string; camada: Camada }>();
const ultimaDoNo = new Map<string, { camada: Camada; l: number; a: number; forma: string }>();

// A tela chama: desenha com aproximação e avisa (`redesenhar`) quando as camadas exatas devem ser feitas.
// `emGesto`: arrastando algo (controle do painel, alça na tela); aí até a primeira refeita já sai rápida.
let emGesto = false;
export function desenharNaTela(redesenhar: () => void, desenhar: () => void, gesto = false) {
  aoAssentar = redesenhar;
  emGesto = gesto;
  assentando = assentarNaProxima;
  assentarNaProxima = false;
  try {
    desenhar();
  } finally {
    aoAssentar = null;
    assentando = false;
  }
}
function pedirAssentamento(redesenhar: () => void) {
  clearTimeout(espera);
  espera = window.setTimeout(() => {
    assentarNaProxima = true;
    redesenhar();
  }, 160);
}

function camadaEmCache(n: No, sc: number): Camada & { kx: number; ky: number } {
  if (n.tipo === "imagem" && provedorDeImagem?.(n)) return { ...camadaDeEfeitos(n, sc), kx: 1, ky: 1 }; // em edição: o conteúdo muda a cada pincelada
  const { x: _x, y: _y, rot: _r, op: _o, id: _i, slide: _s, nome: _n, oculto: _h, travado: _t, ...conteudo } = n;
  void [_x, _y, _r, _o, _i, _s, _n, _h, _t];
  const chave = JSON.stringify([conteudo, Math.round(sc * 1000)]);
  let c = cache.get(chave);
  if (!c) {
    const u = ultimaDoNo.get(n.id);
    if (aoAssentar && !assentando && u) {
      const { l: _l, a: _a, ...resto } = conteudo as typeof conteudo & { l: number; a: number };
      void [_l, _a];
      if (u.forma === JSON.stringify(resto)) {
        pedirAssentamento(aoAssentar);
        return { ...u.camada, kx: n.l / u.l, ky: n.a / u.a };
      }
    }
    // Refeita de novo em menos de meio segundo (arrastando a intensidade, por exemplo): na tela sai em meia
    // resolução, fora do cache, e a exata vem quando os passos param.
    const agora = performance.now();
    const rajada = aoAssentar && !assentando && (emGesto || agora - (ultimaConstrucao.get(n.id) ?? -1e9) < 450);
    ultimaConstrucao.set(n.id, agora);
    if (rajada) {
      pedirAssentamento(aoAssentar!);
      let r = rapida.get(n.id);
      if (r?.chave !== chave) rapida.set(n.id, (r = { chave, camada: camadaDeEfeitos(n, sc / 2) })); // um nó em dois slides não refaz
      return { ...r.camada, kx: 1, ky: 1 };
    }
    rapida.delete(n.id);
    c = camadaDeEfeitos(n, sc);
    cache.set(chave, c);
    pixelsEmCache += c.canvas.width * c.canvas.height;
    // teto por pixels, não por quantidade: a placa de vídeo integrada divide a memória com o sistema
    while (pixelsEmCache > TETO_DE_PIXELS && cache.size > 1) {
      const k = cache.keys().next().value as string;
      const v = cache.get(k)!;
      pixelsEmCache -= v.canvas.width * v.canvas.height;
      cache.delete(k);
      for (const [id, u] of ultimaDoNo) if (u.camada === v) ultimaDoNo.delete(id);
    }
  }
  if (aoAssentar) {
    const { l: _l, a: _a, ...resto } = conteudo as typeof conteudo & { l: number; a: number };
    void [_l, _a];
    ultimaDoNo.set(n.id, { camada: c, l: n.l, a: n.a, forma: JSON.stringify(resto) });
  }
  return { ...c, kx: 1, ky: 1 };
}

// Quanto o efeito estende o nó para fora da caixa, em px do slide (para exportar a camada sozinha).
export function margemDeEfeitos(n: No): number {
  const f = n.fx;
  if (!f) return 0;
  return Math.ceil(Math.max(f.desfoque ? f.desfoque.raio * 3 : 0, f.sombra ? f.sombra.raio * 2 + Math.max(Math.abs(f.sombra.x), Math.abs(f.sombra.y)) : 0)) + 2;
}

// Vidro fosco: desfoca o que já está pintado atrás da camada e devolve só dentro da forma dela (retângulo com os cantos
// dele; outros tipos, a caixa). Lê os pixels do próprio canvas, então só vale onde há fundo pintado (slide, exportação).
function desenharVidro(ctx: CanvasRenderingContext2D, n: No, raio: number) {
  const m = ctx.getTransform();
  const sc = Math.hypot(m.a, m.b) || 1;
  const r = raio * sc;
  if (r < 0.4) return;
  // a caixa do nó no canvas (com a margem que o desfoque lê), presa à área do canvas
  const cantos = [[0, 0], [n.l, 0], [0, n.a], [n.l, n.a]].map(([x, y]) => m.transformPoint(new DOMPoint(x, y)));
  const marg = Math.ceil(r * 3);
  const x0 = Math.max(0, Math.floor(Math.min(...cantos.map((p) => p.x))) - marg);
  const y0 = Math.max(0, Math.floor(Math.min(...cantos.map((p) => p.y))) - marg);
  const x1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...cantos.map((p) => p.x))) + marg);
  const y1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...cantos.map((p) => p.y))) + marg);
  if (x1 <= x0 || y1 <= y0) return;
  const copia = novaCamada(x1 - x0, y1 - y0);
  copia.getContext("2d")!.drawImage(ctx.canvas as HTMLCanvasElement, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  const borrado = borrarDireto(copia, r);
  ctx.save();
  caminhoRetangulo(ctx, n.l, n.a, n.tipo === "retangulo" ? n.raio : 0);
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // a opacidade da camada (globalAlpha) vale para o vidro também, como no CSS
  ctx.drawImage(borrado, x0, y0);
  ctx.restore();
}

export function desenharNo(ctx: CanvasRenderingContext2D, n: No) {
  ctx.save();
  ctx.globalAlpha = n.op / 100;
  ctx.translate(n.x + n.l / 2, n.y + n.a / 2);
  ctx.rotate((n.rot * Math.PI) / 180);
  ctx.translate(-n.l / 2, -n.a / 2);
  const f = n.fx;
  if (f?.vidro && f.vidro.raio > 0) desenharVidro(ctx, n, f.vidro.raio);
  if (f && (f.desfoque || f.sombra)) {
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b) || 1;
    const c = camadaEmCache(n, sc);
    ctx.save();
    if (f.sombra) {
      ctx.shadowColor = rgba(f.sombra.cor, f.sombra.op);
      ctx.shadowBlur = f.sombra.raio * sc;
      ctx.shadowOffsetX = f.sombra.x * sc;
      ctx.shadowOffsetY = f.sombra.y * sc;
    }
    ctx.drawImage(c.canvas, -c.pad * c.kx, -c.pad * c.ky, (c.canvas.width / c.sc) * c.kx, (c.canvas.height / c.sc) * c.ky);
    ctx.restore();
  } else desenharConteudo(ctx, n);
  ctx.restore();
}

// `pular`: id de um nó que não deve ser pintado (o texto em edição aparece numa caixa de edição por cima).
export function desenharSlide(ctx: CanvasRenderingContext2D, d: Documento, s: Slide, pular?: string | null) {
  const { l, a } = d.formato;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, l, a);
  ctx.clip();
  if (s.fundo) {
    ctx.fillStyle = s.fundo;
    ctx.fillRect(0, 0, l, a);
  }
  for (const { n, dx, dy } of nosQueAparecemNoSlide(d, s)) {
    if (n.id === pular) continue;
    if (dx || dy) {
      ctx.save();
      ctx.translate(dx, dy);
      desenharNo(ctx, n);
      ctx.restore();
    } else desenharNo(ctx, n);
  }
  ctx.restore();
}

// O que aparece num slide, na ordem da pilha, com o deslocamento até as coordenadas dele. Com slides contínuos
// entram também os objetos dos outros slides que invadem este (uma imagem que começa num e termina no outro).
export function nosQueAparecemNoSlide(d: Documento, s: Slide): { n: No; dx: number; dy: number }[] {
  const r: { n: No; dx: number; dy: number }[] = [];
  const cont = continuo(d);
  const i = d.slides.indexOf(s);
  const o = origemDoSlide(d, i);
  const origens = new Map<string, { x: number; y: number }>();
  for (const n of d.nos) {
    if (n.oculto) continue;
    if (n.slide === s.id) {
      r.push({ n, dx: 0, dy: 0 });
      continue;
    }
    if (!cont) continue;
    let on = origens.get(n.slide);
    if (!on) origens.set(n.slide, (on = origemDoSlidePorId(d, n.slide)));
    const dx = on.x - o.x;
    const dy = on.y - o.y;
    const b = caixa(n);
    const m = margemDeEfeitos(n);
    if (b.x1 + m + dx <= 0 || b.x0 - m + dx >= d.formato.l || b.y1 + m + dy <= 0 || b.y0 - m + dy >= d.formato.a) continue;
    r.push({ n, dx, dy });
  }
  return r;
}

function paraBlob(c: HTMLCanvasElement, formato: "png" | "jpg" | "webp"): Promise<Blob> {
  const mime = formato === "png" ? "image/png" : formato === "jpg" ? "image/jpeg" : "image/webp";
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("falha ao exportar"))), mime, 0.92));
}

export async function exportarSlide(d: Documento, s: Slide, formato: "png" | "jpg" | "webp", escala: number): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = Math.round(d.formato.l * escala);
  c.height = Math.round(d.formato.a * escala);
  const ctx = c.getContext("2d")!;
  if (formato === "jpg") {
    ctx.fillStyle = s.fundo ?? "#ffffff"; // JPG não tem transparência
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.scale(escala, escala);
  desenharSlide(ctx, d, s);
  return paraBlob(c, formato);
}

// Exporta uma camada sozinha, em PNG com fundo transparente, do tamanho da caixa (mais a margem dos efeitos).
export async function exportarNo(n: No, escala: number): Promise<Blob> {
  const m = margemDeEfeitos(n);
  const b = caixa(n);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((b.x1 - b.x0 + 2 * m) * escala));
  c.height = Math.max(1, Math.round((b.y1 - b.y0 + 2 * m) * escala));
  const ctx = c.getContext("2d")!;
  ctx.scale(escala, escala);
  ctx.translate(m - b.x0, m - b.y0);
  desenharNo(ctx, { ...n, op: 100 });
  return paraBlob(c, "png");
}
