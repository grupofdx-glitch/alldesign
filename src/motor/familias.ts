// Famílias de fonte do editor. Os arquivos (Fontsource, licença OFL) são copiados de node_modules para public/fontes
// por `npm run fontes` (as fontes ficam fora do Git). A tela e os contornos usam os mesmos arquivos.
import type { Fonte } from "./modelo.ts";

export interface Familia {
  rotulo: string; // nome mostrado no painel
  nome: string; // nome CSS
  slug: string; // nome do pacote e dos arquivos
  pesos: number[];
  italicos?: number[]; // pesos que têm arquivo itálico
  fallback: string;
}

export const FAMILIAS_DEF: Record<Fonte, Familia> = {
  display: { rotulo: "Bricolage Grotesque", nome: "Bricolage Grotesque", slug: "bricolage-grotesque", pesos: [400, 500, 600, 700, 800], fallback: '"Geist", system-ui, sans-serif' },
  ui: { rotulo: "Geist", nome: "Geist", slug: "geist", pesos: [400, 500, 600, 700, 800], fallback: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif" },
  raleway: { rotulo: "Raleway", nome: "Raleway", slug: "raleway", pesos: [400, 500, 600, 700, 800], fallback: "-apple-system, sans-serif" },
  garamond: { rotulo: "EB Garamond", nome: "EB Garamond", slug: "eb-garamond", pesos: [400, 500, 600, 700, 800], italicos: [400, 500], fallback: "Georgia, serif" },
  cinzel: { rotulo: "Cinzel", nome: "Cinzel", slug: "cinzel", pesos: [400, 500, 600, 700, 800], fallback: "Georgia, serif" },
  mono: { rotulo: "Fragment Mono (dados)", nome: "Fragment Mono", slug: "fragment-mono", pesos: [400], fallback: "Menlo, monospace" },
};
export const FONTES = Object.keys(FAMILIAS_DEF) as Fonte[];

export const pesoValido = (fonte: Fonte, peso: number): number =>
  FAMILIAS_DEF[fonte].pesos.reduce((a, b) => (Math.abs(b - peso) < Math.abs(a - peso) ? b : a));
export const temItalico = (fonte: Fonte, peso: number): boolean => !!FAMILIAS_DEF[fonte].italicos?.includes(pesoValido(fonte, peso));
export const arquivoDaFonte = (fonte: Fonte, peso: number, italico = false): string =>
  `${FAMILIAS_DEF[fonte].slug}-latin-${pesoValido(fonte, peso)}-${italico && temItalico(fonte, peso) ? "italic" : "normal"}.woff`;
// Se o editor morar numa subpasta, quem o embute marca o <html> com `data-base` e os endereços ficam relativos a ela.
// Sozinho (localhost:4760), é a raiz.
export const ondeMora = (): string => (typeof document !== "undefined" && document.documentElement.dataset.base) || "/";
export const urlDaFonte = (fonte: Fonte, peso: number, italico = false): string => `${ondeMora()}fontes/${arquivoDaFonte(fonte, peso, italico)}`;
export const pilhaCss = (fonte: Fonte): string => `"${FAMILIAS_DEF[fonte].nome}", ${FAMILIAS_DEF[fonte].fallback}`;
