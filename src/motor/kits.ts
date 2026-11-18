// Kits de estilo: conjuntos de cores e fontes para começar um documento. Cada modelo (modelos.ts) é montado a partir de um kit.
// Para criar o seu: acrescente uma entrada em KITS (e o id em KitId, motor/modelo.ts). Só use fontes já listadas em familias.ts.
import type { Fonte } from "./modelo.ts";

export type KitId = "escuro" | "claro" | "editorial";

export interface Papeis {
  fundo: string;
  profundo: string; // slides de destaque (chamada final)
  superficie: string;
  texto: string;
  muted: string;
  acento: string;
  acentoForte: string;
  acentoClaro: string;
}
export interface Kit {
  id: KitId;
  nome: string;
  nota?: string;
  papeis: Papeis;
  // nomes das cores como aparecem na paleta do painel
  nomes: Partial<Record<keyof Papeis, string>>;
  claro?: boolean; // fundo claro: o texto é escuro, e o que fica sobre `profundo` usa o `fundo` como cor de texto
  fontes: { titulo: Fonte; corpo: Fonte; dado: Fonte };
  pesoTitulo: number;
}

const NOMES = { fundo: "fundo", profundo: "profundo", superficie: "superfície", texto: "texto", muted: "texto suave", acento: "acento", acentoForte: "acento forte", acentoClaro: "acento claro" };

export const KITS: Record<KitId, Kit> = {
  escuro: {
    id: "escuro",
    nome: "Escuro",
    papeis: { fundo: "#0b0f17", profundo: "#1b2433", superficie: "#121826", texto: "#f5f7fb", muted: "#aab4c5", acento: "#4f8cff", acentoForte: "#7aa7ff", acentoClaro: "#b5ceff" },
    nomes: NOMES,
    fontes: { titulo: "raleway", corpo: "raleway", dado: "mono" },
    pesoTitulo: 800,
  },
  claro: {
    id: "claro",
    nome: "Claro",
    papeis: { fundo: "#fbfaf7", profundo: "#1f2a44", superficie: "#f0eee8", texto: "#171a21", muted: "#5d6575", acento: "#e0561b", acentoForte: "#f27a3d", acentoClaro: "#f8b48d" },
    nomes: NOMES,
    fontes: { titulo: "display", corpo: "ui", dado: "mono" },
    pesoTitulo: 700,
    claro: true,
  },
  editorial: {
    id: "editorial",
    nome: "Editorial",
    papeis: { fundo: "#0d0c0a", profundo: "#201c16", superficie: "#16130f", texto: "#f3eee3", muted: "#b9b09d", acento: "#c8963a", acentoForte: "#dfb35d", acentoClaro: "#efd49b" },
    nomes: { ...NOMES, acento: "ouro", acentoForte: "ouro forte", acentoClaro: "ouro claro" },
    fontes: { titulo: "cinzel", corpo: "garamond", dado: "mono" },
    pesoTitulo: 600,
  },
};
export const IDS_DE_KIT = Object.keys(KITS) as KitId[];

// Cores do kit para a paleta do painel (sem repetir a mesma cor).
export function paletaDoKit(id: KitId): { nome: string; hex: string }[] {
  const k = KITS[id];
  const vistos = new Set<string>();
  const saida: { nome: string; hex: string }[] = [];
  for (const p of Object.keys(k.papeis) as (keyof Papeis)[]) {
    const hex = k.papeis[p];
    if (!hex || vistos.has(hex)) continue;
    vistos.add(hex);
    saida.push({ nome: k.nomes[p] ?? p, hex });
  }
  return saida;
}
