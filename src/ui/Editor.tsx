// Peças do editor que não dependem da moldura: enquadrar, atalhos de teclado e a barra de ferramentas. Ficam
// separadas do App para outro projeto poder montar a mesma edição com outra moldura.
import { type RefObject, useEffect, useRef, useState } from "react";
import { store, sessaoDeImagem, useStore } from "../store.ts";
import { abrir, escolherImagem, importarImagens, salvar } from "../acoes.ts";
import { limitesDaGrade } from "../motor/grade.ts";
import { type No, novoId } from "../motor/modelo.ts";
import type { FerrImagem } from "../motor/imagem.ts";
import { moverPontos } from "../motor/vetor.ts";

const FERR_IMAGEM: { id: FerrImagem; g: string; k: string; t: string }[] = [
  { id: "pincel", g: "✎", k: "B", t: "Pincel" },
  { id: "borracha", g: "⌫", k: "E", t: "Borracha" },
  { id: "restaurar", g: "↺", k: "X", t: "Restaurar o que a borracha apagou" },
  { id: "desfocar", g: "◌", k: "R", t: "Pincel de desfoque" },
  { id: "conta", g: "⌖", k: "I", t: "Conta-gotas" },
  { id: "retangulo", g: "▭", k: "M", t: "Seleção retangular" },
  { id: "laco", g: "➰", k: "L", t: "Laço" },
];

let copiado: No | null = null; // área de transferência interna (⌘C / ⌘V de camadas)

const FERRAMENTAS = [
  { id: "mover", g: "➤", k: "V", t: "Mover" },
  { id: "retangulo", g: "▢", k: "R", t: "Retângulo" },
  { id: "texto", g: "T", k: "T", t: "Texto" },
  { id: "imagem", g: "▨", k: "I", t: "Subir imagem" },
  { id: "caneta", g: "✒", k: "P", t: "Caneta: desenha um vetor novo" },
  { id: "slide", g: "+", k: "F", t: "Novo slide (ou S)" },
  { id: "mao", g: "✋", k: "H", t: "Mão (ou segure Espaço)" },
] as const;

/** Enquadra os slides na área central. Devolve a função de enquadrar (⌘0, botão de zoom). */
export function useEnquadrar(centro: RefObject<HTMLDivElement>) {
  // Escondido (embutido e escondido), a área mede zero: o zoom saía negativo e as réguas entravam em
  // laço infinito, congelando a janela . Então espera a área aparecer.
  const ajustarPendente = useRef(false);
  const ajustar = () => {
    const el = centro.current;
    if (!el) return;
    if (el.clientWidth < 200 || el.clientHeight < 200) {
      ajustarPendente.current = true;
      return;
    }
    ajustarPendente.current = false;
    const { doc } = store.ler();
    const g = limitesDaGrade(doc);
    const z = Math.max(0.02, Math.min((el.clientWidth - 100) / g.x1, (el.clientHeight - 160) / g.y1, 1));
    store.vista({ zoom: z, panX: (el.clientWidth - g.x1 * z) / 2, panY: Math.max(50, (el.clientHeight - g.y1 * z) / 2 - 10) });
  };
  useEffect(() => {
    const el = centro.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (ajustarPendente.current) ajustar();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ajustar;
}

/** Cria um slide no fim e o seleciona. */
export function novoSlide(ajustar: () => void) {
  store.exec("slide.criar", {});
  const { doc } = store.ler();
  store.selecionar({ tipo: "slide", id: doc.slides[doc.slides.length - 1].id });
  setTimeout(ajustar, 0);
}

/** Atalhos de teclado do editor, colar imagem e o aviso de sair sem salvar. `semSlides`: S e F não criam slide. */
export function useAtalhos(ajustar: () => void, { semSlides = false } = {}) {
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement;
      if (alvo.closest("input,textarea,select,[contenteditable]")) return;
      const cmd = ev.metaKey || ev.ctrlKey;
      const k = ev.key.toLowerCase();
      const s = store.ler();
      if (s.editandoVetor) {
        if (cmd && k === "z") { ev.preventDefault(); ev.shiftKey ? store.refazer() : store.desfazer(); return; }
        if (cmd && k === "y") { ev.preventDefault(); store.refazer(); return; }
        if (cmd && k === "s") { ev.preventDefault(); salvar(); return; }
        if (cmd) return;
        if (k === "enter" || k === "escape") { ev.preventDefault(); if (s.canetaC >= 0) store.canetaEm(-1); else store.sairVetor(); return; }
        if (k === "backspace" || k === "delete") { ev.preventDefault(); store.apagarPontosSelecionados(); return; }
        if (k === "a" || k === "v") { store.ferramentaDeVetor("direta"); return; }
        if (k === "p") { store.ferramentaDeVetor("caneta"); return; }
        if (k.startsWith("arrow") && s.selVetor.length) {
          ev.preventDefault();
          const n = s.doc.nos.find((x) => x.id === s.editandoVetor);
          if (n?.tipo !== "vetor") return;
          const p = ev.shiftKey ? 10 : 1;
          store.caminhos(n.id, moverPontos(n.caminhos, s.selVetor, k === "arrowright" ? p : k === "arrowleft" ? -p : 0, k === "arrowdown" ? p : k === "arrowup" ? -p : 0));
        }
        return;
      }
      if (s.editandoImagem) {
        const sess = sessaoDeImagem();
        if (cmd && k === "z") { ev.preventDefault(); ev.shiftKey ? store.refazer() : store.desfazer(); return; }
        if (cmd && k === "y") { ev.preventDefault(); store.refazer(); return; }
        if (cmd && k === "s") { ev.preventDefault(); salvar(); return; }
        if (cmd && k === "d") { ev.preventDefault(); sess?.desmarcar(); store.tocar(); return; }
        if (cmd && ev.shiftKey && k === "i") { ev.preventDefault(); sess?.inverter(); store.tocar(); return; }
        if (cmd) return;
        if (k === "enter" || k === "escape") { ev.preventDefault(); void store.sairImagem(true); return; }
        if (k === "backspace" || k === "delete") { ev.preventDefault(); sess?.apagarSelecao(); store.tocar(); return; }
        if (k === "[" || k === "]") { store.pincelDe({ tamanho: Math.min(400, Math.max(2, s.pincel.tamanho + (k === "]" ? 8 : -8) * (s.pincel.tamanho > 100 ? 2 : 1))) }); return; }
        const tecla = FERR_IMAGEM.find((f) => f.k.toLowerCase() === k);
        if (tecla) store.ferramentaDeImagem(tecla.id);
        return;
      }
      if (cmd && k === "z") { ev.preventDefault(); ev.shiftKey ? store.refazer() : store.desfazer(); return; }
      if (cmd && k === "y") { ev.preventDefault(); store.refazer(); return; }
      if (cmd && k === "s") { ev.preventDefault(); salvar(); return; }
      if (cmd && k === "o") { ev.preventDefault(); abrir(); return; }
      if (cmd && k === "0") { ev.preventDefault(); ajustar(); return; }
      if (cmd && (k === "=" || k === "+" || k === "-")) {
        ev.preventDefault();
        const z = Math.min(4, Math.max(0.05, s.vista.zoom * (k === "-" ? 0.8 : 1.25)));
        store.vista({ zoom: z });
        return;
      }
      if (cmd && ev.shiftKey && k === "o" && s.selecao.tipo === "no") {
        ev.preventDefault();
        void store.converterEmContornos(s.selecao.id);
        return;
      }
      if (cmd && k === "c" && s.selecao.tipo === "no") {
        const sid = s.selecao.id;
        copiado = s.doc.nos.find((n) => n.id === sid) ?? null;
        if (copiado) store.avisar("Camada copiada.");
        return;
      }
      if (cmd && k === "v" && copiado) {
        ev.preventDefault();
        const slide = store.slideAlvo();
        const mesmo = copiado.slide === slide;
        const id = novoId();
        store.criarNo({ ...copiado, id, slide, nome: mesmo ? `${copiado.nome} cópia` : copiado.nome, x: copiado.x + (mesmo ? 40 : 0), y: copiado.y + (mesmo ? 40 : 0) });
        return;
      }
      if (cmd && ev.shiftKey && (k === "h" || k === "l") && s.selecao.tipo === "no") {
        ev.preventDefault();
        const sid = s.selecao.id;
        const n = s.doc.nos.find((x) => x.id === sid);
        if (n) store.exec("no.atualizar", { id: sid, mudancas: k === "h" ? { oculto: !n.oculto } : { travado: !n.travado } });
        return;
      }
      if (cmd && k === "d" && s.selecao.tipo === "no") {
        ev.preventDefault();
        const id = Math.random().toString(36).slice(2);
        store.exec("no.duplicar", { id: s.selecao.id, novoId: id });
        store.selecionar({ tipo: "no", id });
        return;
      }
      if (cmd && (k === "]" || k === "[") && s.selecao.tipo === "no") {
        ev.preventDefault();
        store.exec("no.ordem", { id: s.selecao.id, destino: ev.shiftKey ? (k === "]" ? "frente" : "tras") : k === "]" ? "acima" : "abaixo" });
        return;
      }
      if (cmd) return;
      if (ev.shiftKey && (ev.code === "Digit1" || ev.code === "Digit0")) {
        ev.preventDefault();
        if (ev.code === "Digit1") ajustar();
        else store.vista({ zoom: 1 });
        return;
      }
      if (k === "escape") {
        if (s.selecao.tipo === "no") store.selecionar({ tipo: "slide", id: s.doc.nos.find((n) => n.id === (s.selecao as { id: string }).id)?.slide ?? s.doc.slides[0].id });
        else if (s.selecao.tipo === "slide") store.selecionar({ tipo: "carrossel" });
        store.ferramenta("mover");
        return;
      }
      if ((k === "backspace" || k === "delete") && s.selecao.tipo === "no") { ev.preventDefault(); store.exec("no.apagar", { id: s.selecao.id }); return; }
      if (s.selecao.tipo === "no" && k.startsWith("arrow")) {
        ev.preventDefault();
        const n = s.doc.nos.find((x) => x.id === (s.selecao as { id: string }).id);
        if (!n || n.travado) return;
        const p = ev.shiftKey ? 10 : 1;
        store.exec("no.atualizar", { id: n.id, mudancas: { x: n.x + (k === "arrowright" ? p : k === "arrowleft" ? -p : 0), y: n.y + (k === "arrowdown" ? p : k === "arrowup" ? -p : 0) } });
        return;
      }
      if (k === "enter" && s.selecao.tipo === "no") {
        const n = s.doc.nos.find((x) => x.id === (s.selecao as { id: string }).id);
        if (n?.tipo === "texto" && !n.travado) { ev.preventDefault(); store.gesto(true); store.editarTexto(n.id); }
        if (n?.tipo === "imagem" && !n.travado) { ev.preventDefault(); store.entrarImagem(n.id); }
        if ((n?.tipo === "vetor" || n?.tipo === "retangulo") && !n.travado) { ev.preventDefault(); void store.entrarVetor(n.id); }
        return;
      }
      if (k === "v") store.ferramenta("mover");
      else if (k === "r") store.ferramenta("retangulo");
      else if (k === "t") store.ferramenta("texto");
      else if (k === "h") store.ferramenta("mao");
      else if (k === "p") store.ferramenta("caneta");
      else if (k === "i") escolherImagem();
      else if ((k === "s" || k === "f") && !semSlides) novoSlide(ajustar);
    };
    const colar = (ev: ClipboardEvent) => {
      if ((ev.target as HTMLElement).closest("input,textarea")) return;
      const arqs = Array.from(ev.clipboardData?.files ?? []);
      if (arqs.length) { ev.preventDefault(); void importarImagens(arqs, store.slideAlvo()); }
    };
    const sair = (ev: BeforeUnloadEvent) => { if (store.ler().sujo) { ev.preventDefault(); ev.returnValue = ""; } };
    window.addEventListener("keydown", tecla);
    window.addEventListener("paste", colar);
    window.addEventListener("beforeunload", sair);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("paste", colar);
      window.removeEventListener("beforeunload", sair);
    };
  }, []);
}

/** A barra de ferramentas embaixo da tela: a do Layout, a do nível Imagem ou a do nível Vetor. `semSlides`: sem o + Slide. */
export function BarraDeFerramentas({ ajustar, semSlides = false }: { ajustar: () => void; semSlides?: boolean }) {
  const e = useStore();
  const usar = (id: string) => (id === "imagem" ? escolherImagem() : id === "slide" ? novoSlide(ajustar) : store.ferramenta(id as "mover"));
  return (
    <div className="barra">
      {e.editandoVetor ? (
        <>
          <button className={`ferr${e.ferrVetor === "direta" ? " on" : ""}`} onClick={() => store.ferramentaDeVetor("direta")} title="Seleção direta (A)" aria-label="Seleção direta">➤<span>A</span></button>
          <button className={`ferr${e.ferrVetor === "caneta" ? " on" : ""}`} onClick={() => store.ferramentaDeVetor("caneta")} title="Caneta (P)" aria-label="Caneta">✒<span>P</span></button>
          <span className="sep-barra" />
          <button className="ferr larga" onClick={() => store.sairVetor()}>Concluir ↵</button>
        </>
      ) : e.editandoImagem ? (
        <>
          {FERR_IMAGEM.map((f) => (
            <button key={f.id} className={`ferr${e.ferrImagem === f.id ? " on" : ""}`} onClick={() => store.ferramentaDeImagem(f.id)} title={`${f.t} (${f.k})`} aria-label={f.t}>{f.g}<span>{f.k}</span></button>
          ))}
          <span className="sep-barra" />
          <button className="ferr larga" onClick={() => void store.sairImagem(true)}>Concluir ↵</button>
        </>
      ) : FERRAMENTAS.filter((f) => !semSlides || f.id !== "slide").map((f) => (
        <button key={f.id} className={`ferr${e.ferramenta === f.id ? " on" : ""}`} onClick={() => usar(f.id)} title={`${f.t} (${f.k})`} aria-label={f.t}>{f.g}<span>{f.k}</span></button>
      ))}
    </div>
  );
}

/** As migalhas do topo: documento › slide › camada (› nível aberto). */
export function migalhasDe(e: ReturnType<typeof useStore>): string[] {
  const sel = e.selecao;
  const migalhas = [e.doc.nome];
  if (sel.tipo === "slide") migalhas.push(e.doc.slides.find((s) => s.id === sel.id)?.nome ?? "");
  if (e.editandoVetor) { const n = e.doc.nos.find((x) => x.id === e.editandoVetor); if (n) migalhas.push(e.doc.slides.find((s) => s.id === n.slide)?.nome ?? "", n.nome, "✒ Editar vetor"); }
  else if (e.editandoImagem) { const n = e.doc.nos.find((x) => x.id === e.editandoImagem); if (n) migalhas.push(e.doc.slides.find((s) => s.id === n.slide)?.nome ?? "", n.nome, "✎ Editar imagem"); }
  else if (sel.tipo === "no") { const n = e.doc.nos.find((x) => x.id === sel.id); if (n) migalhas.push(e.doc.slides.find((s) => s.id === n.slide)?.nome ?? "", n.nome); }
  return migalhas;
}

/** Os três níveis do editor no topo: Layout (a base), Imagem (pixels da camada) e Vetor (pontos). */
export function Niveis() {
  const e = useStore();
  return (
    <div className="niveis" title="Layout é a base; Imagem abre os pixels da camada selecionada; Vetor abre os pontos (botão direito › Editar imagem / Editar vetor)">
      <span className={e.editandoImagem || e.editandoVetor ? "" : "on"} onClick={() => { void store.sairImagem(true); store.sairVetor(); }}>Layout</span>
      <span className={e.editandoImagem ? "on" : ""} onClick={() => { if (!e.editandoImagem && e.selecao.tipo === "no") store.entrarImagem(e.selecao.id); else if (!e.editandoImagem) store.avisar("Selecione uma imagem (ou botão direito nela › Editar imagem)."); }}>Imagem</span>
      <span className={e.editandoVetor ? "on" : ""} onClick={() => {
        if (e.editandoVetor) return;
        const n = e.selecao.tipo === "no" ? e.doc.nos.find((x) => x.id === (e.selecao as { id: string }).id) : undefined;
        if (n && n.tipo !== "imagem") void store.entrarVetor(n.id);
        else store.avisar("Selecione um texto, retângulo ou vetor (ou botão direito › Editar vetor).");
      }}>Vetor</span>
    </div>
  );
}

/**
 * Recolher as barras da esquerda (Camadas) e da direita (Painel): o estado é lembrado entre sessões. Devolve as classes
 * do `.app` e os botões do topo; ao mudar, a tela se enquadra de novo na área que sobrou.
 */
export function useLados(chave: string) {
  const ler = (l: string) => { try { return localStorage.getItem(`${chave}:${l}`) === "1"; } catch { return false; } };
  const [fechado, setFechado] = useState({ esq: ler("esq"), dir: ler("dir") });
  const alternar = (lado: "esq" | "dir") => {
    setFechado((antes) => {
      const novo = { ...antes, [lado]: !antes[lado] };
      try { localStorage.setItem(`${chave}:${lado}`, novo[lado] ? "1" : "0"); } catch { /* sem armazenamento: vale só nesta sessão */ }
      return novo;
    });
    setTimeout(() => window.dispatchEvent(new Event("alldesign:ajustar")), 60);
  };
  const classes = `${fechado.esq ? " sem-esq" : ""}${fechado.dir ? " sem-dir" : ""}`;
  const botoes = (
    <>
      <button className={`btn ghost btn-lado${fechado.esq ? "" : " on"}`} onClick={() => alternar("esq")} title={fechado.esq ? "Mostrar a barra da esquerda" : "Recolher a barra da esquerda"} aria-pressed={!fechado.esq} aria-label="Barra da esquerda">◧</button>
      <button className={`btn ghost btn-lado${fechado.dir ? "" : " on"}`} onClick={() => alternar("dir")} title={fechado.dir ? "Mostrar a barra da direita" : "Recolher a barra da direita"} aria-pressed={!fechado.dir} aria-label="Barra da direita">◨</button>
    </>
  );
  return { classes, botoes };
}
