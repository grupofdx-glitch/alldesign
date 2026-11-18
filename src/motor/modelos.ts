// Modelos de peça: montam um documento completo (slides e camadas) com as cores e fontes de um kit de estilo.
// Funções puras: no editor a altura dos textos vem da medição real (`medir`); fora dele (agentes, testes) usa-se uma
// estimativa, e o editor corrige as alturas ao abrir o arquivo.
import { type Documento, type No, type NoRetangulo, type NoTexto, type Slide, novoId } from "./modelo.ts";
import { KITS, type Kit, type KitId } from "./kits.ts";

export type ModeloId = "carrossel" | "post" | "story";
export type Medidor = (n: NoTexto) => number;

export interface DadosDoModelo {
  titulo: string;
  subtitulo?: string;
  pontos?: { titulo: string; texto: string }[]; // carrossel: um slide por ponto
  chamada?: string; // carrossel: slide final
  tema?: string; // etiqueta pequena na capa (ex.: "Produtividade")
}

export const MODELOS: Record<ModeloId, { nome: string; descricao: string; formato: { l: number; a: number } }> = {
  carrossel: { nome: "Carrossel educativo", descricao: "Capa, um slide por ponto e uma chamada final. Instagram retrato 1080×1350.", formato: { l: 1080, a: 1350 } },
  post: { nome: "Post quadrado", descricao: "Um slide de título e subtítulo. 1080×1080.", formato: { l: 1080, a: 1080 } },
  story: { nome: "Story", descricao: "Uma frase de destaque em tela cheia. 1080×1920.", formato: { l: 1080, a: 1920 } },
};

// Estimativa de altura sem canvas: ~0,52 em de largura média por caractere.
export const medirEstimado: Medidor = (n) => {
  const porLinha = Math.max(1, Math.floor(n.l / (n.tamanho * (n.fonte === "mono" ? 0.6 : 0.52))));
  let linhas = 0;
  for (const par of n.texto.split("\n")) {
    let atual = 0;
    let l = 1;
    for (const palavra of par.split(" ")) {
      const t = atual ? atual + 1 + palavra.length : palavra.length;
      if (atual && t > porLinha) {
        l++;
        atual = palavra.length;
      } else atual = t;
    }
    linhas += l;
  }
  return Math.max(n.tamanho, Math.ceil(linhas * n.tamanho * n.entrelinha));
};


class Construtor {
  nos: No[] = [];
  private kit: Kit;
  private medir: Medidor;
  constructor(kit: Kit, medir: Medidor) {
    this.kit = kit;
    this.medir = medir;
  }

  texto(slide: string, nome: string, x: number, y: number, l: number, texto: string, o: { papel: "titulo" | "corpo" | "dado"; tamanho: number; cor: string; peso?: number; alinhar?: NoTexto["alinhar"]; entrelinha?: number; maxLinhas?: number; minimo?: number }): NoTexto {
    const fonte = this.kit.fontes[o.papel];
    const peso = o.peso ?? (o.papel === "titulo" ? this.kit.pesoTitulo : o.papel === "dado" ? 400 : 500);
    const entrelinha = o.entrelinha ?? (o.papel === "titulo" ? 1.05 : 1.3);
    let tamanho = o.tamanho;
    const faz = (t: number): NoTexto => ({
      id: novoId(), slide, tipo: "texto", nome, x, y, l, a: 0, rot: 0, op: 100, oculto: false, travado: false,
      texto, fonte, peso, tamanho: t, cor: o.cor, alinhar: o.alinhar ?? "left", entrelinha,
    });
    let n = faz(tamanho);
    n.a = this.medir(n);
    // encolhe o texto até caber no número de linhas pedido (nunca abaixo do mínimo)
    while (o.maxLinhas && n.a > o.maxLinhas * tamanho * entrelinha + 1 && tamanho > (o.minimo ?? o.tamanho * 0.5)) {
      tamanho -= 4;
      n = faz(tamanho);
      n.a = this.medir(n);
    }
    this.nos.push(n);
    return n;
  }
  retangulo(slide: string, nome: string, x: number, y: number, l: number, a: number, cor: string, raio = 0): NoRetangulo {
    const n: NoRetangulo = { id: novoId(), slide, tipo: "retangulo", nome, x, y, l, a, rot: 0, op: 100, oculto: false, travado: false, cor, raio };
    this.nos.push(n);
    return n;
  }
}

const MARGEM = 80;

export function criarDocumento(modelo: ModeloId, kitId: KitId, dados: DadosDoModelo, medir: Medidor = medirEstimado): Documento {
  const kit = KITS[kitId];
  const f = MODELOS[modelo].formato;
  const c = new Construtor(kit, medir);
  const p = kit.papeis;
  const slides: Slide[] = [];
  const novoSlide = (nome: string, fundo: string): string => {
    const s: Slide = { id: novoId("s"), nome, fundo, grade: { c: slides.length, l: 0 } };
    slides.push(s);
    return s.id;
  };
  // cores que dependem do tema: em kit claro, o que fica sobre o `profundo` usa o fundo como texto
  const sobreEscuro = kit.claro ? p.fundo : p.texto;
  const apagadoSobreEscuro = kit.claro ? p.superficie : p.muted;
  const largura = f.l - 2 * MARGEM;
  const etiqueta = (slide: string, y: number, tamanho: number) => {
    if (dados.tema) c.texto(slide, "Etiqueta", MARGEM, y, largura, dados.tema.toUpperCase(), { papel: "dado", tamanho, cor: p.acentoForte });
  };

  if (modelo === "carrossel") {
    const pontos = dados.pontos ?? [];
    const total = pontos.length + 2;
    // capa
    const s1 = novoSlide("Slide 1 · Capa", p.fundo);
    c.retangulo(s1, "Faixa", 0, 0, 16, f.a, p.acento);
    etiqueta(s1, 96, 30);
    const t = c.texto(s1, "Título", MARGEM, 420, largura, dados.titulo, { papel: "titulo", tamanho: 112, cor: p.texto, maxLinhas: 6, minimo: 64 });
    if (dados.subtitulo) c.texto(s1, "Subtítulo", MARGEM, t.y + t.a + 44, largura, dados.subtitulo, { papel: "corpo", tamanho: 46, cor: p.muted, maxLinhas: 4, minimo: 30 });
    c.retangulo(s1, "Barra", MARGEM, f.a - 190, 160, 12, p.acento, 6);
    c.texto(s1, "Deslize", MARGEM, f.a - 150, largura, "DESLIZE  →", { papel: "dado", tamanho: 30, cor: p.acento });
    // um slide por ponto
    pontos.forEach((pt, i) => {
      const s = novoSlide(`Slide ${i + 2} · ${pt.titulo.slice(0, 24)}`, i % 2 === 0 ? p.superficie : p.fundo);
      c.texto(s, "Número", MARGEM, 90, largura, String(i + 1).padStart(2, "0"), { papel: "dado", tamanho: 220, cor: p.acento, entrelinha: 1 });
      const tt = c.texto(s, "Título", MARGEM, 470, largura, pt.titulo, { papel: "titulo", tamanho: 80, cor: p.texto, maxLinhas: 3, minimo: 52 });
      c.texto(s, "Texto", MARGEM, tt.y + tt.a + 36, largura, pt.texto, { papel: "corpo", tamanho: 46, cor: p.muted, maxLinhas: 8, minimo: 32 });
      c.texto(s, "Paginação", MARGEM, f.a - 110, 400, `${i + 2}/${total}`, { papel: "dado", tamanho: 28, cor: p.muted });
    });
    // chamada final
    const sf = novoSlide(`Slide ${total} · Chamada`, p.profundo);
    c.retangulo(sf, "Faixa", 0, 0, 16, f.a, p.acento);
    const ch = c.texto(sf, "Chamada", MARGEM, 380, largura, dados.chamada ?? "Salve este post e envie para quem precisa ler.", { papel: "titulo", tamanho: 96, cor: sobreEscuro, maxLinhas: 6, minimo: 56 });
    const bx = c.retangulo(sf, "Botão", MARGEM, ch.y + ch.a + 70, 440, 96, p.acento, 48);
    c.texto(sf, "Botão (texto)", bx.x, bx.y + 28, bx.l, "SALVE E COMPARTILHE", { papel: "dado", tamanho: 28, cor: p.fundo, alinhar: "center" });
    c.texto(sf, "Paginação", MARGEM, f.a - 110, 400, `${total}/${total}`, { papel: "dado", tamanho: 28, cor: apagadoSobreEscuro });
  } else if (modelo === "post") {
    const s = novoSlide("Slide 1", p.fundo);
    c.retangulo(s, "Faixa", 0, 0, 16, f.a, p.acento);
    etiqueta(s, 90, 28);
    const t = c.texto(s, "Título", MARGEM, 300, largura, dados.titulo, { papel: "titulo", tamanho: 100, cor: p.texto, maxLinhas: 4, minimo: 60 });
    if (dados.subtitulo) c.texto(s, "Subtítulo", MARGEM, t.y + t.a + 40, largura, dados.subtitulo, { papel: "corpo", tamanho: 42, cor: p.muted, maxLinhas: 4, minimo: 28 });
    c.retangulo(s, "Barra", MARGEM, f.a - 130, 140, 10, p.acento, 5);
  } else {
    const s = novoSlide("Story", p.fundo);
    c.retangulo(s, "Faixa", 0, 0, f.l, 14, p.acento);
    etiqueta(s, 150, 30);
    const t = c.texto(s, "Frase", MARGEM, 700, largura, dados.titulo, { papel: "titulo", tamanho: 116, cor: p.texto, maxLinhas: 6, minimo: 64 });
    if (dados.subtitulo) c.texto(s, "Apoio", MARGEM, t.y + t.a + 50, largura, dados.subtitulo, { papel: "corpo", tamanho: 46, cor: p.muted, maxLinhas: 4, minimo: 30 });
    c.retangulo(s, "Barra", MARGEM, f.a - 260, 160, 12, p.acento, 6);
  }

  // story é peça solta: slides separados; carrossel e post nascem contínuos (grudados)
  return { versao: 1, nome: dados.titulo.slice(0, 60) || MODELOS[modelo].nome, kit: kitId, formato: { l: f.l, a: f.a }, slides, nos: c.nos, guias: [], continuo: modelo !== "story" };
}
