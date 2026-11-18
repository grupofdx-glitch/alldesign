// Exportação em SVG. Retângulos, vetores e texto (convertido em contornos, para não depender de fonte) saem como formas
// de verdade; imagens e camadas com desfoque ou sombra saem como imagem embutida, já com o efeito aplicado.
import type { Documento, No, Slide } from "./modelo.ts";
import { caixa } from "./geom.ts";
import { carregarFonte } from "./fontes.ts";
import { exportarNo, margemDeEfeitos, nosQueAparecemNoSlide } from "./render.ts";
import { contornosDoTexto } from "./texto-vetor.ts";
import { dSvg, retanguloParaCaminhos } from "./vetor.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const num = (v: number) => String(Math.round(v * 100) / 100);

function dataUrl(b: Blob): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(r.error);
    r.readAsDataURL(b);
  });
}
const transformacao = (n: No) => `translate(${num(n.x)} ${num(n.y)})${n.rot ? ` rotate(${num(n.rot)} ${num(n.l / 2)} ${num(n.a / 2)})` : ""}`;
const opacidade = (n: No) => (n.op < 100 ? ` opacity="${num(n.op / 100)}"` : "");

async function noParaSvg(n: No): Promise<string> {
  // o que o SVG simples não diz igual (efeitos, degradê, borda, vidro, opacidade do preenchimento) sai como imagem
  const comEfeito = !!(n.fx && (n.fx.desfoque || n.fx.sombra || n.fx.vidro)) ||
    (n.tipo === "texto" && !!n.degrade) || (n.tipo === "retangulo" && !!(n.gradiente || n.borda || (n.opCor ?? 100) < 100));
  if (n.tipo === "imagem" || comEfeito) {
    const b = caixa(n);
    const m = margemDeEfeitos(n);
    const url = await dataUrl(await exportarNo(n, 1));
    return `<image x="${num(b.x0 - m)}" y="${num(b.y0 - m)}" width="${num(b.x1 - b.x0 + 2 * m)}" height="${num(b.y1 - b.y0 + 2 * m)}"${opacidade(n)} href="${url}"/>`;
  }
  let d = "";
  let preenchimento = "none";
  let extra = "";
  if (n.tipo === "retangulo") {
    d = dSvg(retanguloParaCaminhos(n.l, n.a, n.raio));
    preenchimento = n.cor;
  } else if (n.tipo === "vetor") {
    d = dSvg(n.caminhos);
    preenchimento = n.cor ?? "none";
    extra = ` fill-rule="${n.regra}"` + (n.traco ? ` stroke="${esc(n.traco.cor)}" stroke-width="${num(n.traco.largura)}" stroke-linejoin="round" stroke-linecap="round"` : "");
  } else {
    d = dSvg(contornosDoTexto(n, await carregarFonte(n.fonte, n.peso, n.italico)));
    preenchimento = n.cor;
  }
  return `<path d="${d}" fill="${esc(preenchimento)}"${extra}${opacidade(n)} transform="${transformacao(n)}"><title>${esc(n.nome)}</title></path>`;
}

export async function slideParaSvg(d: Documento, s: Slide): Promise<string> {
  const { l, a } = d.formato;
  const partes: string[] = [];
  if (s.fundo) partes.push(`<rect width="${l}" height="${a}" fill="${esc(s.fundo)}"/>`);
  // com slides contínuos, os vizinhos que invadem este slide entram deslocados (o viewBox corta o que sobra)
  for (const { n, dx, dy } of nosQueAparecemNoSlide(d, s)) {
    const svg = await noParaSvg(n);
    partes.push(dx || dy ? `<g transform="translate(${dx} ${dy})">${svg}</g>` : svg);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${a}" width="${l}" height="${a}">\n${partes.join("\n")}\n</svg>\n`;
}
