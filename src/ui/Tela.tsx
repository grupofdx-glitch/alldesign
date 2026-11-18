// A tela central: um canvas com todos os slides lado a lado, réguas, guias e as alças da seleção.
// O conteúdo dos slides é desenhado por motor/render.ts (o mesmo que exporta); aqui só entram o chrome e a interação.
import { useEffect, useRef, useState } from "react";
import { origemDoSlide, store, useStore, novoId } from "../store.ts";
import { celula, espacoEntreSlides, slideMaisProximo, slideSob } from "../motor/grade.ts";
import { type Alca, CANTOS, caixa, centro, dentro, dePonto, paraLocal, posicaoDaAlca } from "../motor/geom.ts";
import type { Caminho, Documento, No, NoImagem, NoTexto, NoVetor } from "../motor/modelo.ts";
import { type Ref, acrescentarPonto, alcasDoUltimo, alternarSuave, apagarPontos, fecharCaminho, inserirPonto, moverAlca, moverPontos, path2D } from "../motor/vetor.ts";
import { cor } from "./cores.ts";
import { FAMILIAS, alturaDoTexto, desenharNaTela, desenharNo, desenharSlide } from "../motor/render.ts";
import { exportarCamada, importarImagens } from "../acoes.ts";
import { type Ponto, fatorTrabalho, paraTrabalho } from "../motor/imagem.ts";
import { sessaoDeImagem } from "../store.ts";

const R = 20; // largura das réguas
const COR_NOVA = "#ff5c8a"; // retângulo novo: conteúdo do documento, não segue o tema
const DIST_ROT = 30; // px de tela da alça de rotação acima do nó

type Gesto =
  | { k: "pan"; sx: number; sy: number; px: number; py: number }
  | { k: "mover"; id: string; w0: { x: number; y: number }; orig: No }
  | { k: "alca"; id: string; alca: Alca; orig: No }
  | { k: "imagem" }
  | { k: "pontoV"; refs: Ref[]; w0: Ponto; orig: Caminho[] }
  | { k: "alcaV"; ref: Ref; lado: "ein" | "eout"; orig: Caminho[] }
  | { k: "canetaV"; c: number; p0: Ponto }
  | { k: "guia"; indice: number; slide: string }
  | { k: "area"; id: string; parte: "mov" | "nw" | "ne" | "se" | "sw"; orig: { x: number; y: number; l: number; a: number }; p0: { x: number; y: number } }
  | null;

interface Linha {
  eixo: "v" | "h";
  pos: number;
  slide: number;
}

export function Tela() {
  const e = useStore();
  const { doc, vista } = e;
  const ref = useRef<HTMLCanvasElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ l: 800, a: 600 });
  const gesto = useRef<Gesto>(null);
  const linhas = useRef<Linha[]>([]);
  const espaco = useRef(false);
  const [cursor, setCursor] = useState("default");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const pincelRef = useRef<HTMLDivElement>(null);

  const origem = (i: number) => origemDoSlide(doc, i);
  const paraTela = (wx: number, wy: number) => ({ x: wx * vista.zoom + vista.panX, y: wy * vista.zoom + vista.panY });
  const paraMundo = (sx: number, sy: number) => ({ x: (sx - vista.panX) / vista.zoom, y: (sy - vista.panY) / vista.zoom });
  // ponto do mundo → índice do slide mais próximo e coordenadas dentro dele
  const noSlide = (wx: number, wy: number) => {
    const i = slideMaisProximo(doc, wx, wy);
    const o = origem(i);
    return { i, x: wx - o.x, y: wy - o.y };
  };
  // ponto local de um slide → tela, e ponto do mundo → local de um slide
  const telaDe = (i: number, lx: number, ly: number) => {
    const o = origem(i);
    return paraTela(o.x + lx, o.y + ly);
  };
  const localDe = (i: number, w: { x: number; y: number }) => {
    const o = origem(i);
    return { x: w.x - o.x, y: w.y - o.y };
  };
  const indiceDoSlide = (id: string) => doc.slides.findIndex((s) => s.id === id);
  const slideRef = () => {
    const s = e.selecao;
    if (s.tipo === "slide") return Math.max(0, indiceDoSlide(s.id));
    if (s.tipo === "no") return Math.max(0, indiceDoSlide(doc.nos.find((n) => n.id === s.id)?.slide ?? ""));
    return 0;
  };

  useEffect(() => {
    const el = caixaRef.current!;
    const obs = new ResizeObserver(() => setTam({ l: el.clientWidth, a: el.clientHeight }));
    obs.observe(el);
    setTam({ l: el.clientWidth, a: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  // ---------- desenho ----------
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    // Atribuir width/height realoca o canvas inteiro (dezenas de MB numa tela retina): só quando o tamanho muda.
    const cw = Math.round(tam.l * dpr);
    const ch = Math.round(tam.a * dpr);
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, tam.l, tam.a); // o fundo pode ser translúcido: sem limpar, os quadros se acumulariam
    ctx.fillStyle = cor("tela");
    ctx.fillRect(0, 0, tam.l, tam.a);
    const z = vista.zoom;

    // desfoques e sombras: durante zoom e redimensionamento, versão esticada; a exata vem quando os passos param
    desenharNaTela(store.tocar, () => doc.slides.forEach((s, i) => {
      const { x: ox, y: oy } = telaDe(i, 0, 0);
      const w = doc.formato.l * z;
      const h = doc.formato.a * z;
      if (ox + w < 0 || ox > tam.l) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, w, h);
      ctx.clip();
      if (!s.fundo) xadrez(ctx, ox, oy, w, h);
      ctx.translate(ox, oy);
      ctx.scale(z, z);
      desenharSlide(ctx, doc, s, e.editandoTexto);
      ctx.restore();
      // moldura e nome do slide
      const sel = (e.selecao.tipo === "slide" && e.selecao.id === s.id) || e.selecao.tipo === "carrossel";
      ctx.strokeStyle = sel ? cor("acento") : cor("moldura");
      ctx.lineWidth = sel ? 1.5 : 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, w, h);
      // com um slide logo acima, o nome só aparece se o vão entre eles couber o texto (grudados, nunca)
      const g = celula(doc, i);
      const temAcima = doc.slides.some((_, k) => celula(doc, k).c === g.c && celula(doc, k).l === g.l - 1);
      if (!temAcima || espacoEntreSlides(doc) * vista.zoom >= 18) {
      ctx.font = '500 11px "Geist", system-ui, sans-serif';
      ctx.fillStyle = e.selecao.tipo === "slide" && e.selecao.id === s.id ? cor("acento") : cor("rotulo");
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      // o nome não passa da largura do slide (grudados, invadiria o do vizinho); o tamanho só se couber ao lado
      const medida = `${doc.formato.l}×${doc.formato.a}`;
      const cabeTamanho = espacoEntreSlides(doc) > 0 && ctx.measureText(`${s.nome}  ${medida}`).width + 12 < w;
      ctx.fillText(caber(ctx, s.nome, w - 6), ox, oy - 8);
      if (cabeTamanho) {
        ctx.fillStyle = cor("regua-texto");
        ctx.textAlign = "right";
        ctx.fillText(medida, ox + w, oy - 8);
      }
      }
      // guias
      ctx.strokeStyle = cor("guia");
      ctx.lineWidth = 1;
      doc.guias.forEach((g) => {
        if (g.slide !== s.id) return;
        ctx.beginPath();
        if (g.eixo === "v") {
          const x = Math.round(ox + g.pos * z) + 0.5;
          ctx.moveTo(x, R);
          ctx.lineTo(x, tam.a);
        } else {
          const y = Math.round(oy + g.pos * z) + 0.5;
          ctx.moveTo(R, y);
          ctx.lineTo(tam.l, y);
        }
        ctx.stroke();
      });
    }), store.historico.emGesto);

    if (e.selecao.tipo === "slide") {
      const si = indiceDoSlide(e.selecao.id);
      if (si >= 0) {
        const o = telaDe(si, 0, 0);
        ctx.strokeStyle = cor("acento");
        ctx.lineWidth = 1.5;
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, doc.formato.l * vista.zoom, doc.formato.a * vista.zoom);
      }
    }

    // linhas de encaixe durante o arrasto
    ctx.strokeStyle = cor("acento");
    ctx.setLineDash([4, 3]);
    linhas.current.forEach((l) => {
      ctx.beginPath();
      if (l.eixo === "v") {
        const x = Math.round(telaDe(l.slide, l.pos, 0).x) + 0.5;
        ctx.moveTo(x, R);
        ctx.lineTo(x, tam.a);
      } else {
        const y = Math.round(telaDe(l.slide, 0, l.pos).y) + 0.5;
        ctx.moveTo(R, y);
        ctx.lineTo(tam.l, y);
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    if (e.editandoImagem) desenharModoImagem(ctx);
    else if (e.editandoVetor) desenharModoVetor(ctx);
    // seleção do nó
    else if (e.selecao.tipo === "no") {
      const sid = e.selecao.id;
      const n = doc.nos.find((x) => x.id === sid);
      if (n && !n.oculto) desenharSelecao(ctx, n);
    }
    desenharReguas(ctx);
  });

  // ---------- nível Vetor ----------
  const noAtualDe = (id: string | null) => (id ? (store.ler().doc.nos.find((x) => x.id === id) as NoVetor | undefined) : undefined);
  const localParaTela = (n: No, p: Ponto) => {
    const q = dePonto(n, p);
    return telaDe(indiceDoSlide(n.slide), q.x, q.y);
  };
  const telaParaLocal = (n: No, sx: number, sy: number) => {
    const w = paraMundo(sx, sy);
    return paraLocal(n, localDe(indiceDoSlide(n.slide), w));
  };
  const igual = (a: Ref, b: Ref) => a.c === b.c && a.p === b.p;
  function acharPontoV(n: NoVetor, sx: number, sy: number): Ref | null {
    for (let c = n.caminhos.length - 1; c >= 0; c--)
      for (let p = n.caminhos[c].pontos.length - 1; p >= 0; p--) {
        const t = localParaTela(n, n.caminhos[c].pontos[p]);
        if (Math.hypot(t.x - sx, t.y - sy) <= 8) return { c, p };
      }
    return null;
  }
  function acharAlcaV(n: NoVetor, sx: number, sy: number): { ref: Ref; lado: "ein" | "eout" } | null {
    for (const ref of e.selVetor) {
      const q = n.caminhos[ref.c]?.pontos[ref.p];
      if (!q) continue;
      for (const lado of ["ein", "eout"] as const) {
        const h = q[lado];
        if (!h) continue;
        const t = localParaTela(n, { x: q.x + h.x, y: q.y + h.y });
        if (Math.hypot(t.x - sx, t.y - sy) <= 7) return { ref, lado };
      }
    }
    return null;
  }
  function desenharModoVetor(ctx: CanvasRenderingContext2D) {
    const n = doc.nos.find((x) => x.id === e.editandoVetor) as NoVetor | undefined;
    if (!n) return;
    const z = vista.zoom;
    const O = telaDe(indiceDoSlide(n.slide), 0, 0);
    // contorno do desenho
    ctx.save();
    ctx.translate(O.x + (n.x + n.l / 2) * z, O.y + (n.y + n.a / 2) * z);
    ctx.rotate((n.rot * Math.PI) / 180);
    ctx.translate((-n.l * z) / 2, (-n.a * z) / 2);
    ctx.scale(z, z);
    ctx.lineWidth = 1.5 / z;
    ctx.strokeStyle = cor("acento");
    ctx.stroke(path2D(n.caminhos));
    ctx.restore();
    // alças dos pontos selecionados e âncoras
    n.caminhos.forEach((c, ci) => {
      c.pontos.forEach((q, pi) => {
        const sel = e.selVetor.some((r) => r.c === ci && r.p === pi);
        const t = localParaTela(n, q);
        if (sel) {
          for (const lado of ["ein", "eout"] as const) {
            const h = q[lado];
            if (!h) continue;
            const ht = localParaTela(n, { x: q.x + h.x, y: q.y + h.y });
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(t.x, t.y);
            ctx.lineTo(ht.x, ht.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ht.x, ht.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.strokeStyle = cor("acento");
            ctx.stroke();
          }
        }
        ctx.beginPath();
        if (q.suave) ctx.arc(t.x, t.y, 4.5, 0, Math.PI * 2);
        else ctx.rect(t.x - 4, t.y - 4, 8, 8);
        ctx.fillStyle = sel ? cor("acento") : "#fff";
        ctx.fill();
        ctx.strokeStyle = sel ? "#fff" : cor("acento");
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });
  }

  // Nível Imagem: escurece o resto, mostra a imagem sobre xadrez (para ver o que a borracha apagou) e a seleção em formigas.
  function desenharModoImagem(ctx: CanvasRenderingContext2D) {
    const n = doc.nos.find((x) => x.id === e.editandoImagem) as NoImagem | undefined;
    const sess = sessaoDeImagem();
    if (!n || !sess) return;
    const z = vista.zoom;
    const O = telaDe(indiceDoSlide(n.slide), 0, 0);
    ctx.fillStyle = cor("escurecer");
    ctx.fillRect(0, 0, tam.l, tam.a);
    ctx.save();
    ctx.translate(O.x + (n.x + n.l / 2) * z, O.y + (n.y + n.a / 2) * z);
    ctx.rotate((n.rot * Math.PI) / 180);
    ctx.translate((-n.l * z) / 2, (-n.a * z) / 2);
    ctx.beginPath();
    ctx.rect(0, 0, n.l * z, n.a * z);
    ctx.save();
    ctx.clip();
    xadrez(ctx, 0, 0, n.l * z, n.a * z);
    ctx.restore();
    ctx.strokeStyle = cor("acento");
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(O.x, O.y);
    ctx.scale(z, z);
    desenharNo(ctx, { ...n, fx: undefined });
    ctx.restore();
    // seleção
    const s = sess.selecao;
    if (s && s.pontos.length >= 2) {
      const orig = { l: sess.origL, a: sess.origA };
      const k = Math.max(n.l / orig.l, n.a / orig.a);
      const kw = sess.w / orig.l;
      const sx = (orig.l - n.l / k) / 2;
      const sy = (orig.a - n.a / k) / 2;
      const pt = (p: Ponto) => {
        const q = dePonto(n, { x: (p.x / kw - sx) * k, y: (p.y / kw - sy) * k });
        return telaDe(indiceDoSlide(n.slide), q.x, q.y);
      };
      const caminho = () => {
        ctx.beginPath();
        if (s.invertida) {
          const c = [pt({ x: 0, y: 0 }), pt({ x: sess.w, y: 0 }), pt({ x: sess.w, y: sess.h }), pt({ x: 0, y: sess.h })];
          c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
        }
        s.pontos.forEach((p, i) => {
          const q = pt(p);
          i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
        });
        ctx.closePath();
      };
      ctx.save();
      caminho();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#000";
      ctx.setLineDash([]);
      ctx.stroke();
      caminho();
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = 0;
      ctx.stroke();
      ctx.restore();
    }
  }

  function desenharSelecao(ctx: CanvasRenderingContext2D, n: No) {
    const i = indiceDoSlide(n.slide);
    const pt = (lx: number, ly: number) => {
      const p = dePonto(n, { x: lx, y: ly });
      return telaDe(i, p.x, p.y);
    };
    const cantos = [pt(0, 0), pt(n.l, 0), pt(n.l, n.a), pt(0, n.a)];
    ctx.strokeStyle = cor("acento");
    ctx.lineWidth = 1.5;
    ctx.setLineDash(n.travado ? [5, 4] : []);
    ctx.beginPath();
    cantos.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    const area = areaDoNo(n);
    if (area) {
      ctx.save();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const ax = area.x * n.l;
      const ay = area.y * n.a;
      const aw = area.l * n.l;
      const ah = area.a * n.a;
      if (area.forma === "elipse") {
        for (let k = 0; k <= 48; k++) {
          const t = (k / 48) * Math.PI * 2;
          const p = pt(ax + aw / 2 + (Math.cos(t) * aw) / 2, ay + ah / 2 + (Math.sin(t) * ah) / 2);
          k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        }
      } else {
        [pt(ax, ay), pt(ax + aw, ay), pt(ax + aw, ay + ah), pt(ax, ay + ah)].forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const c of CANTOS_AREA) {
        const p = pt(ax + c.x * aw, ay + c.y * ah);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = cor("acento");
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      }
      ctx.restore();
    }
    if (n.travado) return;
    const topo = pt(n.l / 2, 0);
    const rot = alcaTela(n, "rot");
    ctx.beginPath();
    ctx.moveTo(topo.x, topo.y);
    ctx.lineTo(rot.x, rot.y);
    ctx.stroke();
    for (const a of ["nw", "ne", "se", "sw", "rot"] as Alca[]) {
      const p = a === "rot" ? rot : alcaTela(n, a);
      ctx.beginPath();
      if (a === "rot") ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      else ctx.rect(p.x - 4, p.y - 4, 8, 8);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();
    }
    // etiqueta de tamanho
    const base = pt(n.l / 2, n.a);
    const txt = `${Math.round(n.l)} × ${Math.round(n.a)}`;
    ctx.font = '500 10px "Geist Mono", ui-monospace, monospace';
    const w = ctx.measureText(txt).width + 10;
    ctx.fillStyle = cor("acento");
    ctx.fillRect(base.x - w / 2, base.y + 8, w, 16);
    ctx.fillStyle = cor("sobre-acento");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, base.x, base.y + 16.5);
  }
  function alcaTela(n: No, a: Alca) {
    const p = posicaoDaAlca(n, a, DIST_ROT / vista.zoom);
    return telaDe(indiceDoSlide(n.slide), p.x, p.y);
  }

  function desenharReguas(ctx: CanvasRenderingContext2D) {
    const z = vista.zoom;
    const ri = slideRef();
    const { x: O, y: OY } = telaDe(ri, 0, 0);
    const passos = [10, 20, 50, 100, 200, 500, 1000];
    if (!(z > 0) || !Number.isFinite(z)) return; // zoom inválido faria os laços abaixo nunca terminarem
    const passo = passos.find((p) => p * z >= 56) ?? 1000;
    ctx.fillStyle = cor("regua");
    ctx.fillRect(0, 0, tam.l, R);
    ctx.fillRect(0, 0, R, tam.a);
    ctx.strokeStyle = cor("regua-linha");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, R + 0.5);
    ctx.lineTo(tam.l, R + 0.5);
    ctx.moveTo(R + 0.5, 0);
    ctx.lineTo(R + 0.5, tam.a);
    ctx.stroke();
    ctx.font = '9.5px "Geist Mono", ui-monospace, monospace';
    ctx.fillStyle = cor("regua-texto");
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.strokeStyle = cor("regua-marca");
    const v0 = Math.floor((R - O) / z / passo) * passo;
    for (let v = v0; ; v += passo) {
      const x = Math.round(O + v * z) + 0.5;
      if (x > tam.l) break;
      if (x < R) continue;
      ctx.beginPath();
      ctx.moveTo(x, R - 7);
      ctx.lineTo(x, R);
      ctx.stroke();
      ctx.fillText(String(v), x + 3, 3);
    }
    const h0 = Math.floor((R - OY) / z / passo) * passo;
    for (let v = h0; ; v += passo) {
      const y = Math.round(OY + v * z) + 0.5;
      if (y > tam.a) break;
      if (y < R) continue;
      ctx.beginPath();
      ctx.moveTo(R - 7, y);
      ctx.lineTo(R, y);
      ctx.stroke();
      ctx.save();
      ctx.translate(3, y - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(v), 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = cor("regua");
    ctx.fillRect(0, 0, R, R);
  }

  // ---------- interação ----------
  const pos = (ev: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const nosDoSlideVisiveis = () => [...doc.nos].reverse().filter((n) => !n.oculto);
  function acharNo(wx: number, wy: number): No | undefined {
    for (const n of nosDoSlideVisiveis()) {
      if (dentro(n, localDe(indiceDoSlide(n.slide), { x: wx, y: wy }))) return n;
    }
  }
  function acharAlca(sx: number, sy: number): { n: No; alca: Alca } | undefined {
    if (e.selecao.tipo !== "no") return;
    const sid = e.selecao.id;
    const n = doc.nos.find((x) => x.id === sid);
    if (!n || n.travado || n.oculto) return;
    for (const a of ["rot", "nw", "ne", "se", "sw"] as Alca[]) {
      const p = alcaTela(n, a);
      if (Math.hypot(p.x - sx, p.y - sy) <= 8) return { n, alca: a };
    }
  }
  // A área do desfoque do nó selecionado: cantos redimensionam, o miolo move.
  function acharArea(sx: number, sy: number, w: { x: number; y: number }): Gesto {
    if (e.selecao.tipo !== "no") return null;
    const sid = e.selecao.id;
    const n = doc.nos.find((x) => x.id === sid);
    const area = n && !n.travado ? areaDoNo(n) : null;
    if (!n || !area) return null;
    const si = indiceDoSlide(n.slide);
    const loc = paraLocal(n, localDe(si, w));
    const ax = area.x * n.l, ay = area.y * n.a, aw = area.l * n.l, ah = area.a * n.a;
    const orig = { x: area.x, y: area.y, l: area.l, a: area.a };
    for (const [parte, c] of [["nw", { x: 0, y: 0 }], ["ne", { x: 1, y: 0 }], ["se", { x: 1, y: 1 }], ["sw", { x: 0, y: 1 }]] as const) {
      const q = dePonto(n, { x: ax + c.x * aw, y: ay + c.y * ah });
      const p = telaDe(si, q.x, q.y);
      if (Math.hypot(p.x - sx, p.y - sy) <= 9) return { k: "area", id: n.id, parte, orig, p0: loc };
    }
    if (loc.x >= ax && loc.x <= ax + aw && loc.y >= ay && loc.y <= ay + ah) return { k: "area", id: n.id, parte: "mov", orig, p0: loc };
    return null;
  }
  function acharGuia(sx: number, sy: number): number {
    const z = vista.zoom;
    return doc.guias.findIndex((g) => {
      const i = indiceDoSlide(g.slide);
      return g.eixo === "v" ? Math.abs(telaDe(i, g.pos, 0).x - sx) < 4 : Math.abs(telaDe(i, 0, g.pos).y - sy) < 4 && z > 0;
    });
  }

  // Ponto da imagem de trabalho sob o cursor (e o fator px do slide → px de trabalho).
  function pontoDaImagem(sx: number, sy: number) {
    const n = doc.nos.find((x) => x.id === e.editandoImagem) as NoImagem | undefined;
    const sess = sessaoDeImagem();
    if (!n || !sess) return null;
    const w = paraMundo(sx, sy);
    const orig = { l: sess.origL, a: sess.origA };
    const local = paraLocal(n, localDe(indiceDoSlide(n.slide), w));
    return { sess, p: paraTrabalho(n, orig, sess.w, local), f: fatorTrabalho(n, orig, sess.w) };
  }
  const ferramentaDePincel = () => ["pincel", "borracha", "restaurar", "desfocar"].includes(e.ferrImagem);

  function aoApertar(ev: React.PointerEvent) {
    if (e.editandoTexto) return;
    setMenu(null);
    const { x: sx, y: sy } = pos(ev);
    ref.current!.setPointerCapture(ev.pointerId);
    if (e.editandoVetor && ev.button === 0 && !espaco.current && e.ferramenta !== "mao") {
      const n = noAtualDe(e.editandoVetor);
      if (!n || sx < R || sy < R) return;
      const loc = telaParaLocal(n, sx, sy);
      const alca = acharAlcaV(n, sx, sy);
      if (alca) {
        store.gesto(true);
        gesto.current = { k: "alcaV", ref: alca.ref, lado: alca.lado, orig: n.caminhos };
        return;
      }
      if (e.ferrVetor === "caneta") {
        const aberto = e.canetaC >= 0 ? n.caminhos[e.canetaC] : undefined;
        if (aberto && !aberto.fechado && aberto.pontos.length >= 3) {
          const t = localParaTela(n, aberto.pontos[0]);
          if (Math.hypot(t.x - sx, t.y - sy) < 9) {
            store.exec("no.atualizar", { id: n.id, mudancas: { caminhos: fecharCaminho(n.caminhos, e.canetaC) } });
            store.canetaEm(-1);
            return;
          }
        }
        store.gesto(true);
        const r = acrescentarPonto(n.caminhos, e.canetaC, { x: loc.x, y: loc.y });
        store.caminhos(n.id, r.caminhos);
        store.canetaEm(r.c);
        store.pontosVetor([{ c: r.c, p: r.caminhos[r.c].pontos.length - 1 }]);
        gesto.current = { k: "canetaV", c: r.c, p0: loc };
        return;
      }
      const hit = acharPontoV(n, sx, sy);
      if (hit) {
        let sel = e.selVetor;
        if (ev.shiftKey) sel = sel.some((r) => igual(r, hit)) ? sel.filter((r) => !igual(r, hit)) : [...sel, hit];
        else if (!sel.some((r) => igual(r, hit))) sel = [hit];
        store.pontosVetor(sel);
        if (sel.some((r) => igual(r, hit))) {
          store.gesto(true);
          gesto.current = { k: "pontoV", refs: sel, w0: loc, orig: n.caminhos };
        }
      } else if (!ev.shiftKey) store.pontosVetor([]);
      return;
    }
    if (e.editandoImagem && ev.button === 0 && !espaco.current && e.ferramenta !== "mao") {
      const a = pontoDaImagem(sx, sy);
      if (!a) return;
      const cor = a.sess.inicio(e.ferrImagem, a.p, e.pincel, a.f);
      if (cor) {
        store.pincelDe({ cor });
        store.ferramentaDeImagem("pincel");
      } else gesto.current = { k: "imagem" };
      store.tocar();
      return;
    }
    if (e.ferramenta === "texto") ev.preventDefault();
    const w = paraMundo(sx, sy);
    if (ev.button === 1 || espaco.current || e.ferramenta === "mao") {
      gesto.current = { k: "pan", sx, sy, px: vista.panX, py: vista.panY };
      setCursor("grabbing");
      return;
    }
    // réguas: criar guia arrastando
    if (sx < R || sy < R) {
      if (sx < R && sy < R) return;
      const alvo = noSlide(w.x, w.y);
      const slide = doc.slides[alvo.i];
      const eixo = sx < R ? "v" : "h";
      store.gesto(true);
      store.exec("guia.criar", { eixo, pos: eixo === "v" ? alvo.x : alvo.y, slide: slide.id });
      gesto.current = { k: "guia", indice: store.ler().doc.guias.length - 1, slide: slide.id };
      return;
    }
    const alvo = noSlide(w.x, w.y);
    if (e.ferramenta === "caneta") {
      const s = doc.slides[alvo.i];
      const claro = !s.fundo || luminosidade(s.fundo) > 0.5;
      const no: NoVetor = {
        id: novoId(), slide: s.id, tipo: "vetor", nome: "Vetor", x: Math.round(alvo.x), y: Math.round(alvo.y), l: 1, a: 1, rot: 0, op: 100, oculto: false, travado: false,
        caminhos: [{ fechado: false, pontos: [{ x: 0, y: 0 }] }], cor: null, traco: { cor: claro ? "#121a33" : "#ffffff", largura: 8 }, regra: "nonzero",
      };
      store.novoVetorComCaneta(no);
      return;
    }
    if (e.ferramenta === "texto" || e.ferramenta === "retangulo") {
      const s = doc.slides[alvo.i];
      const base = { id: novoId(), slide: s.id, rot: 0, op: 100, oculto: false, travado: false };
      if (e.ferramenta === "texto") {
        const claro = !s.fundo || luminosidade(s.fundo) > 0.5;
        const n: NoTexto = {
          ...base, tipo: "texto", nome: "Texto", x: Math.round(alvo.x), y: Math.round(alvo.y), l: 640, a: 0,
          texto: "Escreva aqui", fonte: "display", peso: 700, tamanho: 80, cor: claro ? "#121a33" : "#ffffff", alinhar: "left", entrelinha: 1.1,
        };
        n.a = alturaDoTexto(n);
        store.criarNo(n);
        store.gesto(true);
        store.editarTexto(n.id);
      } else {
        store.criarNo({ ...base, tipo: "retangulo", nome: "Retângulo", x: Math.round(alvo.x), y: Math.round(alvo.y), l: 400, a: 260, cor: COR_NOVA, raio: 0 });
      }
      return;
    }
    const alca = acharAlca(sx, sy);
    if (alca) {
      store.gesto(true);
      gesto.current = { k: "alca", id: alca.n.id, alca: alca.alca, orig: alca.n };
      return;
    }
    const ar = acharArea(sx, sy, w);
    if (ar) {
      store.gesto(true);
      gesto.current = ar;
      return;
    }
    const gi = acharGuia(sx, sy);
    if (gi >= 0) {
      store.gesto(true);
      gesto.current = { k: "guia", indice: gi, slide: doc.guias[gi].slide };
      return;
    }
    const n = acharNo(w.x, w.y);
    if (n) {
      store.selecionar({ tipo: "no", id: n.id });
      if (!n.travado) {
        store.gesto(true);
        if (ev.altKey) {
          // Alt + arrastar: duplica e arrasta a cópia (a original fica onde está)
          const copia = novoId();
          store.exec("no.duplicar", { id: n.id, novoId: copia });
          store.exec("no.atualizar", { id: copia, mudancas: { x: n.x, y: n.y } });
          store.selecionar({ tipo: "no", id: copia });
          gesto.current = { k: "mover", id: copia, w0: w, orig: { ...n, id: copia, nome: `${n.nome} cópia` } };
        } else gesto.current = { k: "mover", id: n.id, w0: w, orig: n };
      }
      return;
    }
    const dentroDoSlide = alvo.y >= 0 && alvo.y <= doc.formato.a && alvo.x >= 0 && alvo.x <= doc.formato.l;
    store.selecionar(dentroDoSlide ? { tipo: "slide", id: doc.slides[alvo.i].id } : { tipo: "carrossel" });
  }

  function aoMover(ev: React.PointerEvent) {
    const { x: sx, y: sy } = pos(ev);
    const g = gesto.current;
    const z = vista.zoom;
    if (e.editandoVetor) {
      const n = noAtualDe(e.editandoVetor);
      if (n && g?.k === "pontoV") {
        const loc = telaParaLocal(n, sx, sy);
        let dx = loc.x - g.w0.x;
        let dy = loc.y - g.w0.y;
        if (ev.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
        store.caminhos(n.id, moverPontos(g.orig, g.refs, dx, dy));
        return;
      }
      if (n && g?.k === "alcaV") {
        const q = g.orig[g.ref.c].pontos[g.ref.p];
        const loc = telaParaLocal(n, sx, sy);
        store.caminhos(n.id, moverAlca(g.orig, g.ref, g.lado, { x: loc.x - q.x, y: loc.y - q.y }, ev.altKey));
        return;
      }
      if (n && g?.k === "canetaV") {
        const loc = telaParaLocal(n, sx, sy);
        const v = { x: loc.x - g.p0.x, y: loc.y - g.p0.y };
        if (Math.hypot(v.x, v.y) * z > 4) store.caminhos(n.id, alcasDoUltimo(n.caminhos, g.c, v));
        return;
      }
      if (!g && n) {
        if (e.ferrVetor === "caneta") return setCursor("crosshair");
        return setCursor(acharAlcaV(n, sx, sy) || acharPontoV(n, sx, sy) ? "move" : "default");
      }
    }
    if (e.editandoImagem) {
      const c = pincelRef.current;
      if (c) {
        const ver = ferramentaDePincel() && !espaco.current;
        c.hidden = !ver;
        const d = e.pincel.tamanho * z;
        c.style.cssText = `left:${sx - d / 2}px;top:${sy - d / 2}px;width:${d}px;height:${d}px`;
      }
      if (g?.k === "imagem") {
        const a = pontoDaImagem(sx, sy);
        if (a) {
          a.sess.mover(a.p, e.pincel, a.f);
          store.tocar();
        }
        return;
      }
      if (!g) return setCursor(espaco.current || e.ferramenta === "mao" ? "grab" : ferramentaDePincel() ? "none" : "crosshair");
    }
    if (g?.k === "imagem" || g?.k === "pontoV" || g?.k === "alcaV" || g?.k === "canetaV") return;
    if (!g) {
      if (e.editandoTexto) return setCursor("text");
      if (e.ferramenta === "texto" || e.ferramenta === "retangulo") return setCursor("crosshair");
      if (espaco.current || e.ferramenta === "mao") return setCursor("grab");
      if (sx < R || sy < R) return setCursor(sx < R ? "col-resize" : "row-resize");
      const alca = acharAlca(sx, sy);
      if (alca) return setCursor(alca.alca === "rot" ? "grab" : alca.alca === "nw" || alca.alca === "se" ? "nwse-resize" : "nesw-resize");
      if (acharGuia(sx, sy) >= 0) return setCursor("move");
      const w = paraMundo(sx, sy);
      if (acharArea(sx, sy, w)) return setCursor("move");
      return setCursor(acharNo(w.x, w.y) ? "move" : "default");
    }
    if (g.k === "pan") return store.vista({ panX: g.px + (sx - g.sx), panY: g.py + (sy - g.sy) });
    const w = paraMundo(sx, sy);
    if (g.k === "guia") {
      const i = indiceDoSlide(g.slide);
      const gu = store.ler().doc.guias[g.indice];
      if (!gu) return;
      const loc = localDe(i, w);
      store.exec("guia.mover", { indice: g.indice, pos: Math.round(gu.eixo === "v" ? loc.x : loc.y) });
      return;
    }
    const n = doc.nos.find((x) => x.id === g.id);
    if (!n) return;
    const i = indiceDoSlide(n.slide);
    const wl = localDe(i, w); // o ponteiro nas coordenadas do slide do nó
    if (g.k === "area") {
      const d = n.fx?.desfoque;
      if (!d) return;
      const loc = paraLocal(n, wl);
      const dx = (loc.x - g.p0.x) / n.l;
      const dy = (loc.y - g.p0.y) / n.a;
      const o = g.orig;
      let { x, y, l: aw, a: ah } = o;
      if (g.parte === "mov") {
        x = clamp(o.x + dx, 0, 1 - o.l);
        y = clamp(o.y + dy, 0, 1 - o.a);
      } else {
        const oeste = g.parte === "nw" || g.parte === "sw";
        const norte = g.parte === "nw" || g.parte === "ne";
        const x0 = clamp(oeste ? o.x + dx : o.x, 0, 1);
        const x1 = clamp(oeste ? o.x + o.l : o.x + o.l + dx, 0, 1);
        const y0 = clamp(norte ? o.y + dy : o.y, 0, 1);
        const y1 = clamp(norte ? o.y + o.a : o.y + o.a + dy, 0, 1);
        x = Math.min(x0, x1 - 0.02);
        aw = Math.max(0.02, x1 - x0);
        y = Math.min(y0, y1 - 0.02);
        ah = Math.max(0.02, y1 - y0);
      }
      store.exec("no.atualizar", { id: n.id, mudancas: { fx: { ...n.fx, desfoque: { ...d, area: { ...d.area, x, y, l: aw, a: ah } } } } });
      return;
    }
    if (g.k === "mover") {
      let dx = w.x - g.w0.x;
      let dy = w.y - g.w0.y;
      if (ev.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      const prov = { ...g.orig, x: g.orig.x + dx, y: g.orig.y + dy };
      const enc = encaixar(prov, doc, n.slide, 7 / z);
      linhas.current = enc.linhas.map((l) => ({ ...l, slide: i }));
      store.exec("no.atualizar", { id: n.id, mudancas: { x: Math.round(prov.x + enc.dx), y: Math.round(prov.y + enc.dy) } });
    } else if (g.alca === "rot") {
      const c = centro(g.orig);
      const ang = (Math.atan2(wl.y - c.y, wl.x - c.x) * 180) / Math.PI + 90;
      let r = ang;
      if (ev.shiftKey) r = Math.round(r / 15) * 15;
      r = ((r % 360) + 540) % 360 - 180;
      store.exec("no.atualizar", { id: n.id, mudancas: { rot: Math.round(r * 10) / 10 } });
    } else {
      redimensionar(g, wl, ev.shiftKey);
    }
  }

  function redimensionar(g: { id: string; alca: Alca; orig: No }, p: { x: number; y: number }, shift: boolean) {
    const o = g.orig;
    const c = CANTOS[g.alca as Exclude<Alca, "rot">];
    const fixo = { x: (1 - c.x) * o.l, y: (1 - c.y) * o.a };
    const q = paraLocal(o, p);
    let nl = Math.max(24, Math.abs(q.x - fixo.x));
    let na = Math.max(24, Math.abs(q.y - fixo.y));
    if (o.tipo === "imagem" || shift) {
      const razao = o.l / o.a;
      if (nl / razao > na) na = nl / razao;
      else nl = na * razao;
    }
    if (o.tipo === "texto") {
      // texto: a largura reflui o texto e a altura segue o conteúdo; o canto fixo (do lado oposto) não se mexe
      const novo = { ...o, l: nl } as NoTexto;
      const nh = alturaDoTexto(novo);
      const lx0 = c.x === 0 ? fixo.x - nl : fixo.x;
      const ly0 = c.y === 0 ? fixo.y - nh : fixo.y;
      const cc = dePonto(o, { x: lx0 + nl / 2, y: ly0 + nh / 2 });
      store.exec("no.atualizar", { id: o.id, mudancas: { l: Math.round(nl), a: nh, x: Math.round(cc.x - nl / 2), y: Math.round(cc.y - nh / 2) } });
      return;
    }
    const lx0 = c.x === 0 ? fixo.x - nl : fixo.x;
    const ly0 = c.y === 0 ? fixo.y - na : fixo.y;
    const cc = dePonto(o, { x: lx0 + nl / 2, y: ly0 + na / 2 });
    store.exec("no.atualizar", { id: o.id, mudancas: { l: Math.round(nl), a: Math.round(na), x: Math.round(cc.x - nl / 2), y: Math.round(cc.y - na / 2) } });
  }

  // O trackpad manda 120+ movimentos por segundo e cada um refaz documento, painéis e tela. Durante um gesto
  // (exceto o pincel, que precisa de todos os pontos) só o último movimento de cada quadro é aplicado.
  const movPendente = useRef<React.PointerEvent | null>(null);
  const quadro = useRef(0);
  const aoMoverAtual = useRef(aoMover);
  aoMoverAtual.current = aoMover;
  const aplicarPendente = () => {
    cancelAnimationFrame(quadro.current);
    quadro.current = 0;
    const ev = movPendente.current;
    movPendente.current = null;
    if (ev) aoMoverAtual.current(ev);
  };
  function aoMoverPorQuadro(ev: React.PointerEvent) {
    if (!gesto.current || gesto.current.k === "imagem") return aoMover(ev);
    movPendente.current = ev;
    if (!quadro.current) quadro.current = requestAnimationFrame(aplicarPendente);
  }
  useEffect(() => () => cancelAnimationFrame(quadro.current), []);

  function aoSoltar(ev: React.PointerEvent) {
    aplicarPendente(); // o último movimento antes de soltar não pode se perder
    const g = gesto.current;
    if (g?.k === "imagem") {
      gesto.current = null;
      sessaoDeImagem()?.fim();
      store.tocar();
      return;
    }
    gesto.current = null;
    linhas.current = [];
    if (g?.k === "guia") {
      const { x: sx, y: sy } = pos(ev);
      if (sx < R || sy < R) store.exec("guia.apagar", { indice: g.indice }); // soltar de volta na régua apaga
    }
    if (g?.k === "mover") levarParaOSlideSob(g.id);
    if (g && g.k !== "pan") store.gesto(false);
    else store.vista({});
    setCursor("default");
  }

  // O centro do objeto caiu noutro slide: ele muda de slide sem sair do lugar (mesmo gesto, um desfazer só).
  function levarParaOSlideSob(id: string) {
    const d = store.ler().doc;
    const n = d.nos.find((x) => x.id === id);
    if (!n) return;
    const i = d.slides.findIndex((s) => s.id === n.slide);
    const o = origemDoSlide(d, i);
    const j = slideSob(d, o.x + n.x + n.l / 2, o.y + n.y + n.a / 2);
    if (j < 0 || j === i) return;
    const p = origemDoSlide(d, j);
    store.exec("no.atualizar", { id, mudancas: { slide: d.slides[j].id, x: n.x + o.x - p.x, y: n.y + o.y - p.y } });
  }

  function aoDuploClique(ev: React.MouseEvent) {
    const { x: sx, y: sy } = pos(ev);
    const w = paraMundo(sx, sy);
    if (e.editandoVetor) {
      const nv = noAtualDe(e.editandoVetor);
      if (!nv) return;
      if (e.ferrVetor === "caneta") {
        // duplo clique termina o caminho (o segundo clique acrescentou um ponto repetido)
        if (e.canetaC >= 0) {
          const c = nv.caminhos[e.canetaC];
          if (c && c.pontos.length > 2) store.caminhos(nv.id, apagarPontos(nv.caminhos, [{ c: e.canetaC, p: c.pontos.length - 1 }]));
        }
        store.canetaEm(-1);
        return;
      }
      const hit = acharPontoV(nv, sx, sy);
      if (hit) {
        store.caminhos(nv.id, alternarSuave(nv.caminhos, hit));
        store.pontosVetor([hit]);
        return;
      }
      const loc = telaParaLocal(nv, sx, sy);
      const r = inserirPonto(nv.caminhos, loc, 8 / vista.zoom);
      if (r) {
        store.caminhos(nv.id, r.caminhos);
        store.pontosVetor([r.novo]);
      }
      return;
    }
    if (e.editandoImagem) return;
    const n = acharNo(w.x, w.y);
    if ((n?.tipo === "vetor" || n?.tipo === "retangulo") && !n.travado) return void store.entrarVetor(n.id);
    if (n?.tipo === "imagem" && !n.travado) return store.entrarImagem(n.id);
    if (n?.tipo === "texto" && !n.travado) {
      store.selecionar({ tipo: "no", id: n.id });
      store.gesto(true);
      store.editarTexto(n.id);
    }
  }

  // roda do mouse: rolar ou dar zoom (⌘/Ctrl ou pinça), com o cursor como âncora
  useEffect(() => {
    const el = ref.current!;
    const roda = (ev: WheelEvent) => {
      ev.preventDefault();
      const v = store.ler().vista;
      if (ev.ctrlKey || ev.metaKey) {
        const r = el.getBoundingClientRect();
        const sx = ev.clientX - r.left;
        const sy = ev.clientY - r.top;
        const z = Math.min(4, Math.max(0.05, v.zoom * Math.exp(-ev.deltaY * 0.01)));
        const k = z / v.zoom;
        store.vista({ zoom: z, panX: sx - (sx - v.panX) * k, panY: sy - (sy - v.panY) * k });
      } else {
        store.vista({ panX: v.panX - (ev.shiftKey && !ev.deltaX ? ev.deltaY : ev.deltaX), panY: v.panY - (ev.shiftKey ? 0 : ev.deltaY) });
      }
    };
    el.addEventListener("wheel", roda, { passive: false });
    const baixo = (ev: KeyboardEvent) => {
      if (ev.code === "Space" && !(ev.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) {
        espaco.current = true;
        setCursor("grab");
        ev.preventDefault();
      }
    };
    const cima = (ev: KeyboardEvent) => {
      if (ev.code === "Space") {
        espaco.current = false;
        setCursor("default");
      }
    };
    window.addEventListener("keydown", baixo);
    window.addEventListener("keyup", cima);
    return () => {
      el.removeEventListener("wheel", roda);
      window.removeEventListener("keydown", baixo);
      window.removeEventListener("keyup", cima);
    };
  }, []);

  function aoLargar(ev: React.DragEvent) {
    ev.preventDefault();
    const w = paraMundo(pos(ev).x, pos(ev).y);
    const a = noSlide(w.x, w.y);
    void importarImagens(Array.from(ev.dataTransfer.files), doc.slides[a.i].id, { x: a.x, y: a.y });
  }

  // Botões + do slide atual (o selecionado, o do objeto selecionado ou, sem seleção, o último).
  const iMais = e.editandoImagem || e.editandoVetor || e.editandoTexto ? -1 : e.selecao.tipo === "carrossel" ? doc.slides.length - 1 : slideRef();
  const mais = iMais >= 0 ? { ...telaDe(iMais, 0, 0), l: doc.formato.l * vista.zoom, a: doc.formato.a * vista.zoom } : null;
  function novoSlide(lado: "direita" | "abaixo") {
    const de = doc.slides[iMais];
    if (!de) return;
    const id = novoId("s");
    store.exec("slide.criar", { id, de: de.id, lado });
    store.selecionar({ tipo: "slide", id });
    // se o novo caiu fora da vista, anda com a vista só o necessário para mostrá-lo
    const d = store.ler().doc;
    const o = origemDoSlide(d, d.slides.findIndex((x) => x.id === id));
    const v = store.ler().vista;
    const x0 = o.x * v.zoom + v.panX;
    const y0 = o.y * v.zoom + v.panY;
    const x1 = x0 + d.formato.l * v.zoom;
    const y1 = y0 + d.formato.a * v.zoom;
    const dx = x1 > tam.l - 40 ? tam.l - 40 - x1 : x0 < R + 40 ? R + 40 - x0 : 0;
    const dy = y1 > tam.a - 80 ? tam.a - 80 - y1 : y0 < R + 40 ? R + 40 - y0 : 0;
    if (dx || dy) store.vista({ panX: v.panX + dx, panY: v.panY + dy });
  }

  const nEdit = e.editandoTexto ? (doc.nos.find((n) => n.id === e.editandoTexto) as NoTexto | undefined) : undefined;
  return (
    <div className="tela" ref={caixaRef} onDragOver={(ev) => ev.preventDefault()} onDrop={aoLargar}>
      <canvas
        ref={ref}
        style={{ width: tam.l, height: tam.a, cursor }}
        onPointerDown={aoApertar}
        onPointerMove={aoMoverPorQuadro}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onDoubleClick={aoDuploClique}
        onPointerLeave={() => { if (pincelRef.current) pincelRef.current.hidden = true; }}
        onContextMenu={(ev) => {
          ev.preventDefault();
          if (e.editandoImagem || e.editandoVetor || e.editandoTexto) return;
          const { x: sx, y: sy } = pos(ev);
          if (sx < R || sy < R) return;
          const w = paraMundo(sx, sy);
          const n = acharNo(w.x, w.y);
          if (!n) return setMenu(null);
          store.selecionar({ tipo: "no", id: n.id });
          setMenu({ x: sx, y: sy, id: n.id });
        }}
      />
      <div ref={pincelRef} className="cursor-pincel" hidden />
      {menu && <MenuDoNo menu={menu} onFechar={() => setMenu(null)} larg={tam.l} alt={tam.a} />}
      {nEdit && <EditorDeTexto n={nEdit} doc={doc} topo={telaDe(indiceDoSlide(nEdit.slide), nEdit.x, nEdit.y)} z={vista.zoom} />}
      {mais && (
        <>
          <button className="mais-slide" style={{ left: mais.x + mais.l + 8, top: mais.y }} title="Novo slide à direita, grudado neste" onClick={() => novoSlide("direita")}>+</button>
          <button className="mais-slide" style={{ left: mais.x, top: mais.y + mais.a + 8 }} title="Novo slide embaixo, grudado neste (para montar um feed em grade)" onClick={() => novoSlide("abaixo")}>+</button>
        </>
      )}
      {e.aviso && <div className="aviso">{e.aviso}</div>}
    </div>
  );
}

// Menu do botão direito sobre uma camada.
function MenuDoNo({ menu, onFechar, larg, alt }: { menu: { x: number; y: number; id: string }; onFechar: () => void; larg: number; alt: number }) {
  const { doc } = useStore();
  const n = doc.nos.find((x) => x.id === menu.id);
  useEffect(() => {
    const fechar = (ev: PointerEvent) => { if (!(ev.target as HTMLElement).closest(".menu-ctx")) onFechar(); };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") onFechar(); };
    window.addEventListener("pointerdown", fechar, true);
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("pointerdown", fechar, true); window.removeEventListener("keydown", tecla); };
  }, []);
  if (!n) return null;
  const itens: ({ t: string; k?: string; f: () => void; destaque?: boolean } | "-")[] = [];
  if (n.tipo === "imagem") itens.push({ t: "Editar imagem", k: "↵", destaque: true, f: () => store.entrarImagem(n.id) });
  if (n.tipo === "vetor" || n.tipo === "retangulo") itens.push({ t: "Editar vetor", k: "↵", destaque: true, f: () => void store.entrarVetor(n.id) });
  if (n.tipo === "texto") itens.push({ t: "Converter em contornos", k: "⇧⌘O", destaque: true, f: () => void store.converterEmContornos(n.id) });
  if (n.tipo === "vetor" && n.original) itens.push({ t: "Voltar ao texto", f: () => store.voltarAoTexto(n.id) });
  if (n.tipo === "texto") itens.push({ t: "Editar texto", k: "↵", destaque: true, f: () => { store.gesto(true); store.editarTexto(n.id); } });
  itens.push(
    "-",
    { t: "Duplicar", k: "⌘D", f: () => { const id = novoId(); store.exec("no.duplicar", { id: n.id, novoId: id }); store.selecionar({ tipo: "no", id }); } },
    { t: "Trazer para frente", k: "⇧⌘]", f: () => store.exec("no.ordem", { id: n.id, destino: "frente" }) },
    { t: "Enviar para trás", k: "⇧⌘[", f: () => store.exec("no.ordem", { id: n.id, destino: "tras" }) },
    "-",
    { t: n.oculto ? "Mostrar" : "Ocultar", k: "⇧⌘H", f: () => store.exec("no.atualizar", { id: n.id, mudancas: { oculto: !n.oculto } }) },
    { t: n.travado ? "Destravar" : "Travar", k: "⇧⌘L", f: () => store.exec("no.atualizar", { id: n.id, mudancas: { travado: !n.travado } }) },
    { t: "Exportar camada (PNG)", f: () => void exportarCamada(n.id) },
    "-",
    { t: "Apagar", k: "⌫", f: () => store.exec("no.apagar", { id: n.id }) },
  );
  return (
    <div className="menu-ctx" style={{ left: Math.min(menu.x, larg - 230), top: Math.min(menu.y, alt - 300) }}>
      {itens.map((i, k) => i === "-" ? <hr key={k} /> : (
        <div key={k} className={i.destaque ? "dest" : ""} onClick={() => { onFechar(); i.f(); }}>{i.t}<span>{i.k}</span></div>
      ))}
    </div>
  );
}

// Caixa de edição por cima do canvas. Fica fora de Tela para não ser recriada a cada tecla (perderia o foco).
function EditorDeTexto({ n, topo, z }: { n: NoTexto; doc: Documento; topo: { x: number; y: number }; z: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // foca já, e de novo logo depois: o mousedown do clique que criou o texto pode tirar o foco para o corpo da página
    ref.current?.focus();
    ref.current?.select();
    const t = setTimeout(() => {
      if (document.activeElement !== ref.current) {
        ref.current?.focus();
        ref.current?.select();
      }
    }, 40);
    return () => clearTimeout(t);
  }, []);
  return (
    <textarea
      ref={ref}
      className="editor-texto"
      defaultValue={n.texto}
      style={{
        left: topo.x,
        top: topo.y,
        width: n.l * z,
        height: Math.max(n.a * z, 24),
        transformOrigin: `${(n.l * z) / 2}px ${(n.a * z) / 2}px`,
        transform: `rotate(${n.rot}deg)`,
        font: `${n.peso} ${n.tamanho * z}px ${FAMILIAS[n.fonte]}`,
        lineHeight: `${n.tamanho * n.entrelinha * z}px`,
        color: n.cor,
        textAlign: n.alinhar,
      }}
      onInput={(t) => store.atualizarNo(n.id, { texto: (t.target as HTMLTextAreaElement).value })}
      onBlur={() => {
        store.editarTexto(null);
        store.gesto(false);
      }}
      onKeyDown={(k) => {
        k.stopPropagation();
        if (k.key === "Escape" || (k.key === "Enter" && (k.metaKey || k.ctrlKey))) (k.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}

// Encaixe: aproxima as bordas e o centro do nó das guias e das bordas e do centro do slide.
function encaixar(n: No, d: Documento, slide: string, limite: number) {
  const b = caixa(n);
  const xs = [0, d.formato.l / 2, d.formato.l, ...d.guias.filter((g) => g.slide === slide && g.eixo === "v").map((g) => g.pos)];
  const ys = [0, d.formato.a / 2, d.formato.a, ...d.guias.filter((g) => g.slide === slide && g.eixo === "h").map((g) => g.pos)];
  const melhor = (alvos: number[], pontos: number[]) => {
    let r: { d: number; alvo: number } | null = null;
    for (const p of pontos) for (const t of alvos) if (Math.abs(t - p) <= limite && (!r || Math.abs(t - p) < Math.abs(r.d))) r = { d: t - p, alvo: t };
    return r;
  };
  const bx = melhor(xs, [b.x0, (b.x0 + b.x1) / 2, b.x1]);
  const by = melhor(ys, [b.y0, (b.y0 + b.y1) / 2, b.y1]);
  const linhas: { eixo: "v" | "h"; pos: number }[] = [];
  if (bx) linhas.push({ eixo: "v", pos: bx.alvo });
  if (by) linhas.push({ eixo: "h", pos: by.alvo });
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, linhas };
}

// Corta o texto com reticências para caber na largura.
function caber(ctx: CanvasRenderingContext2D, t: string, larg: number): string {
  if (ctx.measureText(t).width <= larg) return t;
  let k = t.length;
  while (k > 1 && ctx.measureText(`${t.slice(0, k)}…`).width > larg) k--;
  return k <= 1 ? "" : `${t.slice(0, k)}…`;
}

const CANTOS_AREA = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
// Área do desfoque localizada (só o modo "area" tem uma).
function areaDoNo(n: No) {
  const d = n.fx?.desfoque;
  return d && d.modo === "area" ? d.area : null;
}

let padraoXadrez: CanvasPattern | null = null;
function xadrez(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  if (!padraoXadrez) {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const k = c.getContext("2d")!;
    k.fillStyle = "#fff";
    k.fillRect(0, 0, 16, 16);
    k.fillStyle = "#d9d9de";
    k.fillRect(0, 0, 8, 8);
    k.fillRect(8, 8, 8, 8);
    padraoXadrez = ctx.createPattern(c, "repeat");
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = padraoXadrez!;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function luminosidade(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
