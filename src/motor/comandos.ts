// Comandos: o caminho único para mudar o documento. Mouse, atalho, painel e (depois) agentes chamam o mesmo comando
// pelo id. O histórico guarda documentos imutáveis, então desfazer é trocar de ponteiro (um passo por gesto).
import { type Documento, type No, type Slide, novoId } from "./modelo.ts";
import { escalarCaminhos } from "./vetor.ts";
import { abrirCelula, comGrade, emOrdemDeLeitura, fecharCelula, proximaCelula } from "./grade.ts";

type Params = Record<string, any>;
type Comando = (d: Documento, p: Params) => Documento;

// Mudar largura/altura de um vetor escala os pontos junto (a menos que a mudança já traga os caminhos).
function aplicarMudancas(n: No, m: Params): No {
  const novo = { ...n, ...m } as No;
  if (n.tipo === "vetor" && novo.tipo === "vetor" && !("caminhos" in m) && (novo.l !== n.l || novo.a !== n.a))
    return { ...novo, caminhos: escalarCaminhos(n.caminhos, n.l ? novo.l / n.l : 1, n.a ? novo.a / n.a : 1) };
  return novo;
}
const mapNo = (d: Documento, id: string, f: (n: No) => No): Documento => ({
  ...d,
  nos: d.nos.map((n) => (n.id === id ? f(n) : n)),
});

export const comandos: Record<string, Comando> = {
  "documento.renomear": (d, p) => ({ ...d, nome: String(p.nome) }),
  "documento.kit": (d, p) => ({ ...d, kit: p.kit ?? undefined }),
  "documento.formato": (d, p) => ({ ...d, formato: { l: p.l, a: p.a } }),

  "documento.continuo": (d, p) => ({ ...d, continuo: !!p.valor }),

  // Slide novo. Com `de` (id) e `lado` ("direita" ou "abaixo") entra colado a esse slide, empurrando quem estiver
  // no caminho; sem eles, vai para o fim da última linha. Herda o fundo do vizinho, para o contínuo emendar.
  "slide.criar": (d, p) => {
    const slides = comGrade(d.slides);
    const de = p.de ? slides.find((s) => s.id === p.de) : undefined;
    const lado: "direita" | "abaixo" = p.lado === "abaixo" ? "abaixo" : "direita";
    const alvo = de ? (lado === "direita" ? { c: de.grade!.c + 1, l: de.grade!.l } : { c: de.grade!.c, l: de.grade!.l + 1 }) : proximaCelula(slides);
    const s: Slide = { id: p.id ?? novoId("s"), nome: p.nome ?? `Slide ${d.slides.length + 1}`, fundo: p.fundo !== undefined ? p.fundo : (de?.fundo ?? "#f3eee6"), grade: alvo };
    return { ...d, slides: emOrdemDeLeitura([...abrirCelula(slides, alvo, lado), s]) };
  },
  "slide.atualizar": (d, p) => ({
    ...d,
    slides: d.slides.map((s) => (s.id === p.id ? { ...s, ...p.mudancas } : s)),
  }),
  "slide.apagar": (d, p) => {
    if (d.slides.length <= 1) return d;
    const slides = comGrade(d.slides);
    const vai = slides.find((s) => s.id === p.id);
    if (!vai) return d;
    return {
      ...d,
      slides: emOrdemDeLeitura(fecharCelula(slides.filter((s) => s.id !== p.id), vai.grade!)),
      nos: d.nos.filter((n) => n.slide !== p.id),
      guias: d.guias.filter((g) => g.slide !== p.id),
    };
  },
  // A cópia entra logo à direita do original.
  "slide.duplicar": (d, p) => {
    const slides = comGrade(d.slides);
    const orig = slides.find((s) => s.id === p.id);
    if (!orig) return d;
    const alvo = { c: orig.grade!.c + 1, l: orig.grade!.l };
    const novo: Slide = { ...orig, id: p.novoId ?? novoId("s"), nome: `${orig.nome} cópia`, grade: alvo };
    const copias = d.nos.filter((n) => n.slide === orig.id).map((n) => ({ ...n, id: novoId(), slide: novo.id }));
    const guias = d.guias.filter((g) => g.slide === orig.id).map((g) => ({ ...g, slide: novo.id }));
    return { ...d, slides: emOrdemDeLeitura([...abrirCelula(slides, alvo, "direita"), novo]), nos: [...d.nos, ...copias], guias: [...d.guias, ...guias] };
  },

  // Reordena slides: antesDe = id do slide que vai ficar logo depois; sem antesDe, vai para o fim. As células não
  // mudam de lugar: os slides é que trocam de célula, na ordem de leitura.
  "slide.ordem": (d, p) => {
    const slides = comGrade(d.slides);
    const s = slides.find((x) => x.id === p.id);
    if (!s || p.antesDe === p.id) return d;
    const resto = slides.filter((x) => x.id !== p.id);
    const i = p.antesDe ? resto.findIndex((x) => x.id === p.antesDe) : resto.length;
    if (i < 0) return d;
    resto.splice(i, 0, s);
    const celulas = emOrdemDeLeitura(slides).map((x) => x.grade!);
    return { ...d, slides: resto.map((x, k) => ({ ...x, grade: celulas[k] })) };
  },

  "no.criar": (d, p) => ({ ...d, nos: [...d.nos, p.no as No] }),
  "no.atualizar": (d, p) => mapNo(d, p.id, (n) => aplicarMudancas(n, p.mudancas)),
  // troca um nó inteiro por outro (conversões: texto → contornos, retângulo → vetor, voltar ao texto), mantendo o lugar na pilha
  "no.trocar": (d, p) => ({ ...d, nos: d.nos.map((n) => (n.id === p.id ? (p.no as No) : n)) }),
  // booleanos: remove os nós de `ids` e põe o resultado onde estava o mais baixo da pilha
  "no.combinar": (d, p) => {
    const ids = new Set<string>(p.ids);
    const primeiro = d.nos.findIndex((n) => ids.has(n.id));
    if (primeiro < 0) return d;
    const resto = d.nos.filter((n) => !ids.has(n.id));
    resto.splice(primeiro, 0, p.no as No);
    return { ...d, nos: resto };
  },
  "no.apagar": (d, p) => ({ ...d, nos: d.nos.filter((n) => n.id !== p.id) }),
  "no.duplicar": (d, p) => {
    const n = d.nos.find((x) => x.id === p.id);
    if (!n) return d;
    const c = { ...n, id: p.novoId ?? novoId(), nome: `${n.nome} cópia`, x: n.x + 40, y: n.y + 40 } as No;
    const nos = [...d.nos];
    nos.splice(nos.indexOf(n) + 1, 0, c);
    return { ...d, nos };
  },
  // Ordem (pilha). destino: "frente" | "tras" | "acima" | "abaixo"; ou antesDe: id (arrastar na lista de camadas).
  "no.ordem": (d, p) => {
    const n = d.nos.find((x) => x.id === p.id);
    if (!n) return d;
    const resto = d.nos.filter((x) => x.id !== p.id);
    const doSlide = resto.filter((x) => x.slide === n.slide);
    let alvo: number;
    if (p.antesDe) {
      alvo = resto.findIndex((x) => x.id === p.antesDe);
      if (alvo < 0) return d;
    } else if (p.destino === "frente") alvo = doSlide.length ? resto.indexOf(doSlide[doSlide.length - 1]) + 1 : resto.length;
    else if (p.destino === "tras") alvo = doSlide.length ? resto.indexOf(doSlide[0]) : 0;
    else {
      const i = d.nos.filter((x) => x.slide === n.slide).findIndex((x) => x.id === p.id);
      const grupo = d.nos.filter((x) => x.slide === n.slide);
      const vizinho = grupo[p.destino === "acima" ? i + 1 : i - 1];
      if (!vizinho) return d;
      alvo = resto.indexOf(vizinho) + (p.destino === "acima" ? 1 : 0);
    }
    const nos = [...resto];
    nos.splice(alvo, 0, n);
    return { ...d, nos };
  },

  "guia.criar": (d, p) => ({ ...d, guias: [...d.guias, { eixo: p.eixo, pos: p.pos, slide: p.slide }] }),
  "guia.mover": (d, p) => ({ ...d, guias: d.guias.map((g, i) => (i === p.indice ? { ...g, pos: p.pos } : g)) }),
  "guia.apagar": (d, p) => ({ ...d, guias: d.guias.filter((_, i) => i !== p.indice) }),
};

export function aplicar(d: Documento, id: string, params: Params = {}): Documento {
  const c = comandos[id];
  if (!c) throw new Error(`comando desconhecido: ${id}`);
  return c(d, params);
}

// Histórico de documentos imutáveis. `gesto` agrupa vários ajustes (arrastar, digitar) num único passo de desfazer.
export class Historico {
  atual: Documento;
  passado: Documento[] = [];
  futuro: Documento[] = [];
  private base: Documento | null = null;
  constructor(inicial: Documento) {
    this.atual = inicial;
  }
  exec(id: string, params: Params = {}): Documento {
    const novo = aplicar(this.atual, id, params);
    if (novo === this.atual) return novo;
    if (this.base) {
      this.atual = novo; // dentro de um gesto: só o primeiro estado fica no passado
      return novo;
    }
    this.passado.push(this.atual);
    this.futuro = [];
    this.atual = novo;
    return novo;
  }
  get emGesto(): boolean {
    return this.base !== null;
  }
  iniciarGesto() {
    if (!this.base) this.base = this.atual;
  }
  fimGesto() {
    if (this.base && this.base !== this.atual) {
      this.passado.push(this.base);
      this.futuro = [];
    }
    this.base = null;
  }
  desfazer(): boolean {
    this.fimGesto();
    const d = this.passado.pop();
    if (!d) return false;
    this.futuro.push(this.atual);
    this.atual = d;
    return true;
  }
  refazer(): boolean {
    const d = this.futuro.pop();
    if (!d) return false;
    this.passado.push(this.atual);
    this.atual = d;
    return true;
  }
  substituir(d: Documento) {
    this.atual = d;
    this.passado = [];
    this.futuro = [];
    this.base = null;
  }
}
