// Modelo do documento do AllDesign. Dados puros e imutáveis: toda mudança cria um documento novo (comandos.ts).
// Coordenadas em pixels do slide (o slide padrão é 1080 × 1350). Rotação em graus, em torno do centro do nó.

export type Fonte = "display" | "ui" | "raleway" | "garamond" | "cinzel" | "mono";
export type Alinhamento = "left" | "center" | "right";

export type ModoDesfoque = "camada" | "area" | "progressivo";
export interface FxDesfoque {
  modo: ModoDesfoque;
  raio: number; // px do slide
  // "area": região (frações da caixa do nó) onde o desfoque vale; as bordas esmaecem em `suave` px
  area: { x: number; y: number; l: number; a: number; forma: "retangulo" | "elipse"; suave: number };
  // "progressivo": o desfoque cresce de 0 (em `ini`) até o raio cheio (em `fim`), na direção `dir`. As bordas
  // esfumam para fora, como no Figma; `firmes` mantém a caixa cheia (foto que preenche o slide)
  prog: { dir: "baixo" | "cima" | "direita" | "esquerda"; ini: number; fim: number; firmes?: boolean };
}
export interface FxSombra {
  x: number;
  y: number;
  raio: number;
  cor: string;
  op: number; // 0–100
}
// Desfoque do que está atrás da camada, dentro da forma dela (o "vidro fosco" do CSS backdrop-filter)
export interface FxVidro {
  raio: number; // px do slide
}
export interface Fx {
  desfoque?: FxDesfoque;
  sombra?: FxSombra;
  vidro?: FxVidro;
}
export const desfoquePadrao = (): FxDesfoque => ({
  modo: "camada",
  raio: 24,
  area: { x: 0.1, y: 0.5, l: 0.8, a: 0.4, forma: "retangulo", suave: 40 },
  prog: { dir: "baixo", ini: 0.35, fim: 0.9 },
});
export const vidroPadrao = (): FxVidro => ({ raio: 8 });
export const sombraPadrao = (): FxSombra => ({ x: 0, y: 12, raio: 24, cor: "#000000", op: 40 });

export interface Base {
  id: string;
  slide: string;
  nome: string;
  x: number;
  y: number;
  l: number;
  a: number;
  rot: number;
  op: number; // 0–100
  oculto: boolean;
  travado: boolean;
  fx?: Fx;
}
// Uma parada de cor de degradê: posição de 0 a 1 e opacidade de 0 a 100 (ausente = 100).
export interface Parada {
  pos: number;
  cor: string;
  op?: number;
}
// Degradê vertical do texto, refeito em cada linha: vai de `de` a `ate`, medidos em "em" a partir da linha de base
// (negativo = acima). O ouro do título do carrossel: de −0,94 a 0,24 (o topo e o pé da caixa da linha).
export interface DegradeTexto {
  paradas: Parada[];
  de: number;
  ate: number;
}
export interface NoTexto extends Base {
  tipo: "texto";
  texto: string;
  fonte: Fonte;
  peso: number;
  tamanho: number;
  cor: string;
  alinhar: Alinhamento;
  entrelinha: number;
  espacamento?: number; // espaço entre letras, em "em" (como o letter-spacing do CSS); ausente = 0
  italico?: boolean; // só nas famílias que têm itálico (familias.ts)
  degrade?: DegradeTexto; // quando existe, pinta o texto no lugar de `cor`
}
// Degradê do retângulo. Linear: `angulo` como no CSS (180 = de cima para baixo). Radial: elipse que toca os lados da
// caixa (o "ellipse closest-side" do CSS), do centro (pos 0) para a borda (pos 1).
export interface Gradiente {
  tipo: "linear" | "radial";
  angulo: number;
  paradas: Parada[];
}
export interface Borda {
  cor: string;
  largura: number; // px, para dentro da caixa (como o border do CSS com box-sizing: border-box)
  op?: number; // 0–100; ausente = 100
}
export interface NoRetangulo extends Base {
  tipo: "retangulo";
  cor: string;
  raio: number;
  opCor?: number; // opacidade só do preenchimento, 0–100 (ausente = 100); `op` vale para a camada inteira
  gradiente?: Gradiente; // quando existe, pinta o preenchimento no lugar de `cor`
  borda?: Borda;
}
export interface Ajustes {
  brilho: number; // −100 a 100
  contraste: number;
  saturacao: number;
}
// Edição de pixels não destrutiva: a pintura e a máscara são imagens à parte (por hash); o original nunca muda.
// A máscara guarda o que a borracha apagou (alfa), então dá para restaurar.
export interface EdicaoImagem {
  pintura?: string;
  mascara?: string;
}
export interface NoImagem extends Base {
  tipo: "imagem";
  hash: string; // chave da mídia (midia.ts); os bytes vão no arquivo, fora do JSON
  edicao?: EdicaoImagem;
  ajustes?: Ajustes;
}
export const ajustesNeutros = (a?: Ajustes) => !a || (!a.brilho && !a.contraste && !a.saturacao);
// Vetor: pontos e alças (alças relativas ao ponto). Coordenadas no espaço local do nó (0,0 = canto da caixa).
export interface PontoVetor {
  x: number;
  y: number;
  ein?: { x: number; y: number }; // alça de entrada, relativa ao ponto
  eout?: { x: number; y: number }; // alça de saída, relativa ao ponto
  suave?: boolean; // alças alinhadas: mexer numa gira a outra
}
export interface Caminho {
  pontos: PontoVetor[];
  fechado: boolean;
}
export interface NoVetor extends Base {
  tipo: "vetor";
  caminhos: Caminho[];
  cor: string | null; // preenchimento; null = nenhum
  traco: { cor: string; largura: number } | null;
  regra: "evenodd" | "nonzero"; // evenodd faz os furos do O, do A…
  // se veio de "Converter em contornos", o texto fica guardado para voltar; x,y = posição do vetor logo após a conversão
  original?: { texto: NoTexto; x: number; y: number };
}
export type No = NoTexto | NoRetangulo | NoImagem | NoVetor;

export interface Slide {
  id: string;
  nome: string;
  fundo: string | null; // null = transparente
  grade?: { c: number; l: number }; // coluna e linha na grade de slides (sem grade: uma linha, na ordem da lista)
}
export interface Guia {
  eixo: "v" | "h";
  pos: number; // em coordenadas do slide
  slide: string;
}
export interface Documento {
  versao: 1;
  nome: string;
  kit?: "escuro" | "claro" | "editorial"; // kit de estilo do documento (paleta e fontes sugeridas)
  formato: { l: number; a: number };
  slides: Slide[];
  nos: No[]; // ordem = pilha (o último fica na frente)
  guias: Guia[];
  continuo?: boolean; // slides grudados (padrão); false = separados, como stories ou apresentação
}

export const FORMATOS = {
  retrato: { nome: "Instagram retrato", l: 1080, a: 1350 },
  quadrado: { nome: "Quadrado", l: 1080, a: 1080 },
  story: { nome: "Story", l: 1080, a: 1920 },
} as const;

let contador = 0;
export function novoId(prefixo = "n"): string {
  contador += 1;
  return `${prefixo}${Date.now().toString(36)}${contador.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function documentoNovo(nome = "Sem título"): Documento {
  const s1 = novoId("s");
  return {
    versao: 1,
    nome,
    formato: { l: FORMATOS.retrato.l, a: FORMATOS.retrato.a },
    slides: [{ id: s1, nome: "Slide 1", fundo: "#f3eee6", grade: { c: 0, l: 0 } }],
    nos: [],
    guias: [],
  };
}

export function noPorId(d: Documento, id: string): No | undefined {
  return d.nos.find((n) => n.id === id);
}
