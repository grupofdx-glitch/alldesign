// Estado da aplicação: documento (com histórico), seleção, ferramenta e vista. A interface lê por useStore().
import { useSyncExternalStore } from "react";
import { Historico } from "./motor/comandos.ts";
import { type Documento, type No, documentoNovo, novoId } from "./motor/modelo.ts";
import { alturaDoTexto, definirProvedorDeImagem } from "./motor/render.ts";
import { type FerrImagem, type Pincel, SessaoImagem } from "./motor/imagem.ts";
import { type Ref, apagarPontos, normalizarVetor } from "./motor/vetor.ts";
import { type NoVetor } from "./motor/modelo.ts";
import { combinarNos, retanguloParaVetor, textoParaVetor, vetorParaTexto } from "./motor/texto-vetor.ts";
import type { OpBooleana } from "./motor/vetor.ts";

export type Ferramenta = "mover" | "texto" | "retangulo" | "caneta" | "mao";
export type FerrVetor = "direta" | "caneta";
export type Selecao = { tipo: "carrossel" } | { tipo: "slide"; id: string } | { tipo: "no"; id: string };

export interface Vista {
  zoom: number;
  panX: number;
  panY: number;
}
export interface Estado {
  doc: Documento;
  selecao: Selecao;
  ferramenta: Ferramenta;
  vista: Vista;
  aviso: string | null;
  sujo: boolean;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  editandoTexto: string | null;
  editandoImagem: string | null; // id da camada de imagem aberta no nível Imagem
  ferrImagem: FerrImagem;
  pincel: Pincel;
  dialogo: "novo" | "agentes" | null; // janela aberta por cima do editor
  editandoVetor: string | null; // id da camada de vetor aberta no nível Vetor
  ferrVetor: FerrVetor;
  selVetor: Ref[]; // pontos selecionados
  canetaC: number; // caminho aberto que a caneta está desenhando (−1 = nenhum)
  versao: number;
}

let sessao: SessaoImagem | null = null;
export const sessaoDeImagem = () => sessao;

export { ESPACO_ENTRE_SLIDES, origemDoSlide } from "./motor/grade.ts";

class Store {
  historico = new Historico(documentoNovo("Carrossel sem título"));
  private ouvintes = new Set<() => void>();
  private estado: Estado;
  private avisoTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.estado = {
      doc: this.historico.atual,
      selecao: { tipo: "carrossel" },
      ferramenta: "mover",
      vista: { zoom: 0.32, panX: 60, panY: 70 },
      aviso: null,
      sujo: false,
      podeDesfazer: false,
      podeRefazer: false,
      editandoTexto: null,
      editandoImagem: null,
      ferrImagem: "pincel",
      pincel: { tamanho: 60, op: 100, dureza: 70, cor: "#ff5c8a" },
      dialogo: null,
      editandoVetor: null,
      ferrVetor: "direta",
      selVetor: [],
      canetaC: -1,
      versao: 0,
    };
    definirProvedorDeImagem((n) => (sessao && sessao.id === n.id ? sessao.composto(n.ajustes) : null));
  }
  assinar = (f: () => void) => {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  };
  ler = () => this.estado;

  private publicar(parcial: Partial<Estado> = {}) {
    const h = this.historico;
    this.estado = {
      ...this.estado,
      doc: h.atual,
      podeDesfazer: h.passado.length > 0,
      podeRefazer: h.futuro.length > 0,
      versao: this.estado.versao + 1,
      ...parcial,
    };
    // a seleção some se o nó foi apagado
    const s = this.estado.selecao;
    if (s.tipo === "no" && !h.atual.nos.some((n) => n.id === s.id)) this.estado.selecao = { tipo: "carrossel" };
    if (s.tipo === "slide" && !h.atual.slides.some((x) => x.id === s.id)) this.estado.selecao = { tipo: "carrossel" };
    this.ouvintes.forEach((f) => f());
  }

  exec = (id: string, params: Record<string, any> = {}) => {
    this.historico.exec(id, params);
    this.publicar({ sujo: true });
  };
  gesto = (inicio: boolean) => {
    if (inicio) this.historico.iniciarGesto();
    else {
      this.historico.fimGesto();
      this.publicar();
    }
  };
  desfazer = () => {
    if (sessao) return void (sessao.desfazer() && this.publicar());
    if (this.historico.desfazer()) this.publicar({ sujo: true });
  };
  refazer = () => {
    if (sessao) return void (sessao.refazer() && this.publicar());
    if (this.historico.refazer()) this.publicar({ sujo: true });
  };
  // redesenha sem mexer no documento (pincelada em andamento, seleção)
  tocar = () => this.publicar();
  ferramentaDeImagem = (ferrImagem: FerrImagem) => this.publicar({ ferrImagem });
  pincelDe = (p: Partial<Pincel>) => this.publicar({ pincel: { ...this.estado.pincel, ...p } });

  abrirDialogo = (dialogo: Estado["dialogo"]) => this.publicar({ dialogo });

  // ---- nível Vetor ----
  pontosVetor = (selVetor: Ref[]) => this.publicar({ selVetor });
  ferramentaDeVetor = (ferrVetor: FerrVetor) => this.publicar({ ferrVetor, canetaC: -1 });
  canetaEm = (canetaC: number) => this.publicar({ canetaC });
  caminhos = (id: string, caminhos: NoVetor["caminhos"]) => this.exec("no.atualizar", { id, mudancas: { caminhos } });

  // Abre o nível Vetor. Retângulo vira vetor; texto vira contornos (guardando o texto para voltar).
  entrarVetor = async (id: string) => {
    let n = this.estado.doc.nos.find((x) => x.id === id);
    if (!n || n.travado || n.tipo === "imagem") return;
    if (n.tipo === "retangulo") this.exec("no.trocar", { id, no: retanguloParaVetor(n) });
    else if (n.tipo === "texto") {
      try {
        this.exec("no.trocar", { id, no: await textoParaVetor(n) });
      } catch {
        return this.avisar("Não consegui carregar a fonte para converter o texto.");
      }
    }
    n = this.estado.doc.nos.find((x) => x.id === id);
    if (!n || n.tipo !== "vetor") return;
    this.publicar({ editandoVetor: id, selecao: { tipo: "no", id }, ferrVetor: "direta", selVetor: [], canetaC: -1, editandoTexto: null, ferramenta: "mover" });
  };
  // Cria um vetor vazio no ponto clicado e entra com a caneta, já com o primeiro ponto colocado.
  novoVetorComCaneta = (no: NoVetor) => {
    this.exec("no.criar", { no });
    this.publicar({ editandoVetor: no.id, selecao: { tipo: "no", id: no.id }, ferrVetor: "caneta", selVetor: [{ c: 0, p: 0 }], canetaC: 0, ferramenta: "mover" });
  };
  // Ao sair, a caixa do nó passa a coincidir com o desenho; um vetor sem pontos é descartado.
  sairVetor = () => {
    const id = this.estado.editandoVetor;
    if (!id) return;
    const n = this.estado.doc.nos.find((x) => x.id === id);
    if (n && n.tipo === "vetor") {
      const cs = n.caminhos.filter((c) => c.pontos.length >= 2); // um ponto solto não desenha nada
      if (!cs.length) this.exec("no.apagar", { id });
      else {
        const norm = normalizarVetor({ ...n, caminhos: cs });
        if (norm !== n) this.exec("no.trocar", { id, no: norm });
      }
    }
    this.publicar({ editandoVetor: null, selVetor: [], canetaC: -1 });
  };
  apagarPontosSelecionados = () => {
    const id = this.estado.editandoVetor;
    const n = id ? this.estado.doc.nos.find((x) => x.id === id) : undefined;
    if (!n || n.tipo !== "vetor" || !this.estado.selVetor.length) return;
    const cs = apagarPontos(n.caminhos, this.estado.selVetor);
    if (!cs.length) {
      this.exec("no.apagar", { id: n.id });
      return this.publicar({ editandoVetor: null, selVetor: [], canetaC: -1 });
    }
    this.exec("no.atualizar", { id: n.id, mudancas: { caminhos: cs } });
    this.publicar({ selVetor: [], canetaC: -1 });
  };
  // texto → contornos sem entrar na edição
  converterEmContornos = async (id: string) => {
    const n = this.estado.doc.nos.find((x) => x.id === id);
    if (!n || n.tipo !== "texto") return;
    try {
      this.exec("no.trocar", { id, no: await textoParaVetor(n) });
      this.avisar("Virou vetor. O texto original fica guardado: dá para voltar.");
    } catch {
      this.avisar("Não consegui carregar a fonte para converter o texto.");
    }
  };
  voltarAoTexto = (id: string) => {
    const n = this.estado.doc.nos.find((x) => x.id === id);
    if (!n || n.tipo !== "vetor") return;
    const t = vetorParaTexto(n);
    if (!t) return;
    this.exec("no.trocar", { id, no: t });
    this.publicar({ editandoVetor: null, selVetor: [] });
  };
  // booleanos: a camada selecionada (frente) com a camada logo abaixo dela no mesmo slide
  camadaAbaixo = (id: string) => {
    const d = this.estado.doc;
    const grupo = d.nos.filter((n) => d.nos.find((x) => x.id === id)?.slide === n.slide);
    const i = grupo.findIndex((n) => n.id === id);
    const abaixo = i > 0 ? grupo[i - 1] : undefined;
    return abaixo && abaixo.tipo !== "imagem" ? abaixo : undefined;
  };
  combinarComAbaixo = async (op: OpBooleana) => {
    const sel = this.estado.selecao;
    if (sel.tipo !== "no") return;
    const frente = this.estado.doc.nos.find((n) => n.id === sel.id);
    const tras = frente ? this.camadaAbaixo(frente.id) : undefined;
    if (!frente || !tras || frente.tipo === "imagem") return this.avisar("Precisa de uma forma, texto ou vetor logo abaixo desta camada.");
    const r = await combinarNos(op, frente, tras);
    if (!r) return this.avisar("O resultado ficou vazio (as camadas não se tocam).");
    this.exec("no.combinar", { ids: [frente.id, tras.id], no: r });
    this.publicar({ selecao: { tipo: "no", id: r.id } });
  };

  // ---- nível Imagem ----
  entrarImagem = (id: string) => {
    const n = this.estado.doc.nos.find((x) => x.id === id);
    if (!n || n.tipo !== "imagem" || n.travado) return;
    const s = SessaoImagem.abrir(n);
    if (!s) return this.avisar("Não achei os pixels desta imagem.");
    sessao = s;
    this.publicar({ editandoImagem: id, selecao: { tipo: "no", id }, editandoTexto: null, ferrImagem: "pincel", ferramenta: "mover" });
  };
  // concluir = grava a pintura e a máscara no nó (um passo de desfazer do documento); descartar = joga fora.
  sairImagem = async (gravar: boolean) => {
    const s = sessao;
    const id = this.estado.editandoImagem;
    if (!s || !id) return;
    if (gravar && s.alterada) {
      const edicao = await s.exportar();
      const n = this.estado.doc.nos.find((x) => x.id === id);
      const antes = n && n.tipo === "imagem" ? n.edicao : undefined;
      if (JSON.stringify(antes) !== JSON.stringify(edicao)) this.exec("no.atualizar", { id, mudancas: { edicao } });
    }
    sessao = null;
    this.publicar({ editandoImagem: null });
    if (gravar && s.alterada) this.avisar("Imagem atualizada. O original continua guardado.");
  };
  selecionar = (selecao: Selecao) => this.publicar({ selecao, editandoTexto: null });
  ferramenta = (ferramenta: Ferramenta) => this.publicar({ ferramenta });
  vista = (v: Partial<Vista>) => this.publicar({ vista: { ...this.estado.vista, ...v } });
  editarTexto = (id: string | null) => this.publicar({ editandoTexto: id });
  avisar = (msg: string) => {
    clearTimeout(this.avisoTimer);
    this.publicar({ aviso: msg });
    this.avisoTimer = setTimeout(() => this.publicar({ aviso: null }), 3200);
  };
  abrirDocumento = (d: Documento) => {
    this.historico.substituir(d);
    this.publicar({ selecao: { tipo: "carrossel" }, sujo: false, editandoTexto: null });
  };
  marcarSalvo = () => this.publicar({ sujo: false });
  // quem usa o editor como base pode mudar o documento por fora dos comandos
  marcarSujo = () => this.publicar({ sujo: true });

  // ---- atalhos de alto nível sobre os comandos ----
  slideAlvo(): string {
    const s = this.estado.selecao;
    if (s.tipo === "slide") return s.id;
    if (s.tipo === "no") return this.estado.doc.nos.find((n) => n.id === s.id)?.slide ?? this.estado.doc.slides[0].id;
    return this.estado.doc.slides[0].id;
  }
  criarNo = (no: No) => {
    this.exec("no.criar", { no });
    this.publicar({ selecao: { tipo: "no", id: no.id }, ferramenta: "mover" });
  };
  // Muda um texto mantendo a altura da caixa coerente com o conteúdo.
  atualizarNo = (id: string, mudancas: Record<string, any>) => {
    const n = this.estado.doc.nos.find((x) => x.id === id);
    if (!n) return;
    const novo = { ...n, ...mudancas } as No;
    if (novo.tipo === "texto" && ("texto" in mudancas || "tamanho" in mudancas || "peso" in mudancas || "fonte" in mudancas || "l" in mudancas || "entrelinha" in mudancas))
      mudancas = { ...mudancas, a: alturaDoTexto(novo) };
    this.exec("no.atualizar", { id, mudancas });
  };
}

export const store = new Store();
export const useStore = (): Estado => useSyncExternalStore(store.assinar, store.ler);
export { novoId };
