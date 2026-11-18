// O catálogo dos efeitos do AllDesign: a única lista. O Painel monta os controles a partir dele.
// Efeito novo = uma entrada aqui, com o valor padrão.
import { type No, desfoquePadrao, sombraPadrao, vidroPadrao } from "./modelo.ts";

export interface DefEfeito {
  id: string;
  nome: string;
  raiz: string; // onde o efeito mora na camada: "fx.desfoque"
  padrao: () => object; // o efeito ao ser ligado
  tipos?: No["tipo"][]; // só para estes tipos de camada (sem: todas)
  // o Painel apaga o efeito quando todos os valores são neutros (os ajustes da imagem): ausente = o padrão, não "desligado"
  ausenteEhPadrao?: boolean;
  principais?: string[]; // os valores que resumem o efeito numa linha (sem: todos)
}

export const EFEITOS: DefEfeito[] = [
  { id: "desfoque", nome: "Desfoque", raiz: "fx.desfoque", padrao: desfoquePadrao, principais: ["raio"] },
  { id: "sombra", nome: "Sombra", raiz: "fx.sombra", padrao: sombraPadrao, principais: ["x", "y", "raio", "op"] },
  { id: "vidro", nome: "Desfoque do fundo", raiz: "fx.vidro", padrao: vidroPadrao, tipos: ["retangulo"], principais: ["raio"] },
  { id: "ajustes", nome: "Ajustes", raiz: "ajustes", padrao: () => ({ brilho: 0, contraste: 0, saturacao: 0 }), tipos: ["imagem"], ausenteEhPadrao: true },
];

const COR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
/** Os caminhos relativos ("area.x") dos valores que dá para animar: todo número e toda cor do padrão, em qualquer nível. */
export function folhasAnimaveis(o: object, prefixo = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) => {
    if (typeof v === "number" || (typeof v === "string" && COR.test(v))) return [`${prefixo}${k}`];
    return v && typeof v === "object" ? folhasAnimaveis(v, `${prefixo}${k}.`) : [];
  });
}
