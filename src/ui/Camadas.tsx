// Painel esquerdo: a árvore carrossel › slide › camadas, com olho, cadeado, renomear e arrastar para reordenar.
import { useMemo, useState } from "react";
import { store, useStore } from "../store.ts";
import type { No } from "../motor/modelo.ts";
import { FAMILIAS_DEF } from "../motor/familias.ts";
import { IDS_DE_KIT, KITS, paletaDoKit } from "../motor/kits.ts";

const ICONE: Record<No["tipo"], string> = { texto: "T", retangulo: "▢", imagem: "▨", vetor: "✒" };

export function Camadas() {
  const e = useStore();
  const { doc, selecao } = e;
  const [fechados, setFechados] = useState<Record<string, boolean>>({});
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [aba, setAba] = useState<"camadas" | "recursos">("camadas");
  const [slideArrastado, setSlideArrastado] = useState<string | null>(null);
  const [slideSobre, setSlideSobre] = useState<string | null>(null);

  const nome = (id: string, atual: string, aplicar: (v: string) => void) =>
    renomeando === id ? (
      <input
        className="renomear"
        autoFocus
        defaultValue={atual}
        onFocus={(ev) => ev.target.select()}
        onBlur={(ev) => {
          setRenomeando(null);
          if (ev.target.value.trim() && ev.target.value !== atual) aplicar(ev.target.value.trim());
        }}
        onKeyDown={(ev) => {
          ev.stopPropagation();
          if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
          if (ev.key === "Escape") setRenomeando(null);
        }}
      />
    ) : (
      <span className="nm" onDoubleClick={() => setRenomeando(id)}>{atual}</span>
    );

  const abas = (
    <div className="abas">
      <button className={aba === "camadas" ? "on" : ""} onClick={() => setAba("camadas")}>Camadas</button>
      <button className={aba === "recursos" ? "on" : ""} onClick={() => setAba("recursos")}>Recursos</button>
    </div>
  );
  // Mover, girar ou redimensionar não muda nada nesta lista: a árvore só é refeita quando muda o que ela mostra.
  const assinatura = JSON.stringify([doc.nome, doc.slides.map((s) => [s.id, s.nome]), doc.nos.map((n) => [n.id, n.slide, n.nome, n.tipo, n.oculto, n.travado, !!n.fx?.desfoque, !!n.fx?.sombra])]);
  const arvore = useMemo(() => (
      <div className="arvore" role="tree">
        <div className={`linha carrossel${selecao.tipo === "carrossel" ? " sel" : ""}`} style={{ paddingLeft: 8 }} onClick={() => store.selecionar({ tipo: "carrossel" })}>
          <span className="ic acento">⧉</span>
          {nome("doc", doc.nome, (v) => store.exec("documento.renomear", { nome: v }))}
          <span className="contagem">{doc.slides.length}</span>
        </div>
        {doc.slides.map((s) => {
          const aberto = !fechados[s.id];
          const nos = doc.nos.filter((n) => n.slide === s.id).reverse();
          return (
            <div key={s.id}>
              <div
                className={`linha slide${selecao.tipo === "slide" && selecao.id === s.id ? " sel" : ""}${slideSobre === s.id ? " sobre" : ""}`}
                style={{ paddingLeft: 20 }}
                draggable
                onDragStart={() => setSlideArrastado(s.id)}
                onDragEnd={() => { setSlideArrastado(null); setSlideSobre(null); }}
                onDragOver={(ev) => { if (slideArrastado && slideArrastado !== s.id) { ev.preventDefault(); setSlideSobre(s.id); } }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  if (slideArrastado) store.exec("slide.ordem", { id: slideArrastado, antesDe: s.id });
                  setSlideArrastado(null);
                  setSlideSobre(null);
                }}
                onClick={() => store.selecionar({ tipo: "slide", id: s.id })}
              >
                <span className="car" onClick={(ev) => { ev.stopPropagation(); setFechados({ ...fechados, [s.id]: aberto }); }}>{aberto ? "▾" : "▸"}</span>
                <span className="ic acento">#</span>
                {nome(s.id, s.nome, (v) => store.exec("slide.atualizar", { id: s.id, mudancas: { nome: v } }))}
              </div>
              {aberto && nos.map((n) => (
                <div
                  key={n.id}
                  className={`linha${selecao.tipo === "no" && selecao.id === n.id ? " sel" : ""}${n.oculto ? " oculto" : ""}${sobre === n.id ? " sobre" : ""}`}
                  style={{ paddingLeft: 36 }}
                  draggable
                  onDragStart={() => setArrastando(n.id)}
                  onDragEnd={() => { setArrastando(null); setSobre(null); }}
                  onDragOver={(ev) => { if (arrastando && arrastando !== n.id) { ev.preventDefault(); setSobre(n.id); } }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    // soltar sobre uma camada coloca a arrastada logo acima dela (na lista, acima = mais à frente)
                    const nosAtuais = store.ler().doc.nos;
                    const alvoIdx = nosAtuais.findIndex((x) => x.id === n.id);
                    const prox = nosAtuais[alvoIdx + 1];
                    const mesmoSlide = arrastando && nosAtuais.find((x) => x.id === arrastando)?.slide === n.slide;
                    if (arrastando && mesmoSlide) store.exec("no.ordem", prox && prox.slide === n.slide && prox.id !== arrastando ? { id: arrastando, antesDe: prox.id } : { id: arrastando, destino: "frente" });
                    setArrastando(null);
                    setSobre(null);
                  }}
                  onClick={() => store.selecionar({ tipo: "no", id: n.id })}
                >
                  <span className="ic">{ICONE[n.tipo]}</span>
                  {nome(n.id, n.nome, (v) => store.exec("no.atualizar", { id: n.id, mudancas: { nome: v } }))}
                  {n.fx && (n.fx.desfoque || n.fx.sombra) && <span className="fx" title={[n.fx.desfoque && "Desfoque", n.fx.sombra && "Sombra"].filter(Boolean).join(" + ")}>fx</span>}
                  <button className={`acao${n.travado ? " on" : ""}`} title={n.travado ? "Destravar" : "Travar"} onClick={(ev) => { ev.stopPropagation(); store.exec("no.atualizar", { id: n.id, mudancas: { travado: !n.travado } }); }}>{n.travado ? "🔒" : "🔓"}</button>
                  <button className={`acao${n.oculto ? " on" : ""}`} title={n.oculto ? "Mostrar" : "Ocultar"} onClick={(ev) => { ev.stopPropagation(); store.exec("no.atualizar", { id: n.id, mudancas: { oculto: !n.oculto } }); }}>{n.oculto ? "⊘" : "👁"}</button>
                </div>
              ))}
              {aberto && nos.length === 0 && <div className="vazio-slide">Vazio. T para texto, R para retângulo, ou solte uma imagem aqui.</div>}
            </div>
          );
        })}
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assinatura, selecao, fechados, renomeando, arrastando, sobre, slideArrastado, slideSobre],
  );
  if (e.editandoVetor) {
    const n = doc.nos.find((x) => x.id === e.editandoVetor);
    if (n?.tipo === "vetor")
      return (
        <aside className="esquerda">
          <div className="abas"><button className="on">Pontos</button></div>
          {n.caminhos.map((c, ci) => (
            <div key={ci}>
              <div className="sub-h">Caminho {ci + 1} · {c.fechado ? "fechado" : "aberto"}</div>
              <div className="arvore">
                {c.pontos.map((q, pi) => {
                  const sel = e.selVetor.some((r) => r.c === ci && r.p === pi);
                  return (
                    <div key={pi} className={`linha${sel ? " sel" : ""}`} style={{ paddingLeft: 12 }} onClick={() => store.pontosVetor([{ c: ci, p: pi }])}>
                      <span className="ic">{q.suave ? "◯" : "◇"}</span>
                      <span className="nm" style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>{String(pi + 1).padStart(2, "0")} · {q.suave ? "suave" : q.ein || q.eout ? "alças soltas" : "canto"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="nota" style={{ padding: "8px 12px" }}><b>Arraste</b> um ponto ou uma alça. <b>Duplo clique</b> num ponto alterna canto e suave; num segmento, cria um ponto. <b>Alt</b> solta as alças. Backspace apaga o ponto.</div>
        </aside>
      );
  }
  if (e.editandoImagem) {
    const n = doc.nos.find((x) => x.id === e.editandoImagem);
    return (
      <aside className="esquerda">
        <div className="abas"><button className="on">Camadas da imagem</button></div>
        <div className="arvore">
          <div className="linha sel" style={{ paddingLeft: 12 }}><span className="ic">✎</span><span className="nm">Pintura</span></div>
          <div className="linha" style={{ paddingLeft: 12 }}><span className="ic">◐</span><span className="nm">Máscara (a borracha escreve aqui)</span></div>
          <div className="linha" style={{ paddingLeft: 12 }}><span className="ic">▨</span><span className="nm">Original</span><span className="acao on">🔒</span></div>
        </div>
        <div className="nota" style={{ padding: "8px 12px" }}>Editando <b>{n?.nome}</b>. O original fica guardado; tudo que você faz vai para a pintura e a máscara.</div>
        <div className="nota" style={{ padding: "0 12px" }}>Enter ou Esc concluem. ⌘Z desfaz pinceladas.</div>
      </aside>
    );
  }
  if (aba === "recursos") return <aside className="esquerda">{abas}<Recursos /></aside>;
  return (
    <aside className="esquerda">
      {abas}
      {arvore}
    </aside>
  );
}

// Aba Recursos: kit de estilo do documento (paleta e fontes) e atalhos para modelos e arquivos da CLI.
function Recursos() {
  const e = useStore();
  const { doc, selecao } = e;
  const kit = doc.kit ? KITS[doc.kit] : null;
  const alvo = selecao.tipo === "no" ? doc.nos.find((n) => n.id === selecao.id) : undefined;
  const aplicarCor = (hex: string) => {
    if (selecao.tipo === "slide") return store.exec("slide.atualizar", { id: selecao.id, mudancas: { fundo: hex } });
    if (!alvo || alvo.tipo === "imagem") return store.avisar("Selecione um texto, forma ou slide para aplicar a cor.");
    store.atualizarNo(alvo.id, { cor: hex });
  };
  const aplicarFonte = (papel: "titulo" | "corpo" | "dado") => {
    if (!kit || alvo?.tipo !== "texto") return store.avisar("Selecione um texto para aplicar a fonte do kit.");
    store.atualizarNo(alvo.id, { fonte: kit.fontes[papel], peso: papel === "titulo" ? kit.pesoTitulo : papel === "dado" ? 400 : 500 });
  };
  return (
    <div>
      <div className="sub-h">Kit de estilo</div>
      <div style={{ padding: "0 12px" }}>
        <div className="campo"><select aria-label="Kit de estilo" value={doc.kit ?? ""} onChange={(ev) => store.exec("documento.kit", { kit: ev.target.value || undefined })}>
          <option value="">Nenhum</option>
          {IDS_DE_KIT.map((id) => <option key={id} value={id}>{KITS[id].nome}</option>)}
        </select></div>
      </div>
      {kit ? (
        <>
          <div className="paleta">{paletaDoKit(kit.id).map((c) => <button key={c.hex} className="sw" style={{ background: c.hex }} title={`${c.nome} · ${c.hex}`} aria-label={`${c.nome} ${c.hex}`} onClick={() => aplicarCor(c.hex)} />)}</div>
          <div className="nota">Clique numa cor para aplicar ao texto, forma ou slide selecionado.</div>
          <div className="sub-h">Fontes</div>
          <div style={{ padding: "0 12px", display: "grid", gap: 6 }}>
            {(["titulo", "corpo", "dado"] as const).map((p) => (
              <button key={p} className="btn" style={{ textAlign: "left" }} onClick={() => aplicarFonte(p)}>{{ titulo: "Título", corpo: "Corpo", dado: "Dados" }[p]} · {FAMILIAS_DEF[kit.fontes[p]].rotulo}</button>
            ))}
          </div>
          {kit.nota && <div className="nota">{kit.nota}</div>}
        </>
      ) : <div className="nota">Escolha um kit para ver as cores e fontes dele e usá-las com um clique. Os modelos já vêm com o kit aplicado.</div>}
      <div className="sub-h">Modelos e agentes</div>
      <div style={{ padding: "0 12px", display: "grid", gap: 6 }}>
        <button className="btn pri" onClick={() => store.abrirDialogo("novo")}>Novo a partir de um modelo…</button>
        <button className="btn" onClick={() => store.abrirDialogo("agentes")}>Arquivos dos agentes…</button>
      </div>
    </div>
  );
}
