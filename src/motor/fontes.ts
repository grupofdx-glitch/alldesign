// Fontes do editor: os mesmos arquivos servem à tela (@font-face em estilo.css) e aos contornos de texto (opentype.js),
// então o que se vê e o que vira vetor são a mesma letra. Os arquivos estão em public/fontes.
import opentype from "opentype.js";
import type { Fonte } from "./modelo.ts";
import { FAMILIAS_DEF, FONTES, ondeMora, urlDaFonte } from "./familias.ts";

const cache = new Map<string, Promise<opentype.Font>>();

export function carregarFonte(fonte: Fonte, peso: number, italico = false): Promise<opentype.Font> {
  const url = urlDaFonte(fonte, peso, italico);
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`Fonte não encontrada: ${url}`);
      return opentype.parse(await r.arrayBuffer());
    });
    cache.set(url, p);
  }
  return p;
}

// Registra todas as famílias no navegador (a tela usa o mesmo arquivo que os contornos).
export function registrarFontes(): void {
  for (const f of FONTES) {
    const def = FAMILIAS_DEF[f];
    const faces = [...def.pesos.map((p) => [p, false] as const), ...(def.italicos ?? []).map((p) => [p, true] as const)];
    for (const [peso, italico] of faces) {
      const face = new FontFace(def.nome, `url(${urlDaFonte(f, peso, italico)}) format("woff")`, { weight: String(peso), style: italico ? "italic" : "normal", display: "block" });
      document.fonts.add(face);
      void face.load().catch(() => undefined);
    }
  }
  // a mono da interface (números do painel e das réguas)
  for (const peso of [400, 500]) {
    const face = new FontFace("Geist Mono", `url(${ondeMora()}fontes/geist-mono-latin-${peso}-normal.woff) format("woff")`, { weight: String(peso), style: "normal", display: "block" });
    document.fonts.add(face);
    void face.load().catch(() => undefined);
  }
}

// Garante que o canvas já enxerga as fontes antes de desenhar texto (senão a primeira pintura sai com fonte de reserva).
export async function aguardarFontesDaTela(): Promise<void> {
  const faces = FONTES.flatMap((f) => [
    ...FAMILIAS_DEF[f].pesos.map((p) => `${p} 40px "${FAMILIAS_DEF[f].nome}"`),
    ...(FAMILIAS_DEF[f].italicos ?? []).map((p) => `italic ${p} 40px "${FAMILIAS_DEF[f].nome}"`),
  ]);
  await Promise.all([...faces, '400 14px "Geist Mono"', '500 14px "Geist Mono"'].map((x) => document.fonts.load(x).catch(() => [])));
}
