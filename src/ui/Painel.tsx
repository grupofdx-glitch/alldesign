// Painel direito: os controles mudam conforme o que está selecionado (carrossel, slide ou camada).
import { useState } from "react";
import { sessaoDeImagem, store, useStore } from "../store.ts";
import { alternarSuave } from "../motor/vetor.ts";
import { paletaDoKit } from "../motor/kits.ts";
import { FAMILIAS_DEF, FONTES, pesoValido, temItalico } from "../motor/familias.ts";
import { type FerrImagem } from "../motor/imagem.ts";
import { FORMATOS, type Fonte, type Ajustes, type NoImagem, ajustesNeutros, type Fx, type FxDesfoque, type ModoDesfoque, type No, type NoRetangulo, type NoTexto, type NoVetor, type Parada } from "../motor/modelo.ts";
import { exportar, exportarCamada, nomeSeguro } from "../acoes.ts";
import { EFEITOS } from "../motor/efeitos.ts";
import { adornos } from "./adornos.ts";

function Num({ rotulo, valor, onChange, min, max, passo = 1, desligado }: { rotulo: string; valor: number; onChange: (v: number) => void; min?: number; max?: number; passo?: number; desligado?: boolean }) {
  return (
    <div className={`campo${desligado ? " desligado" : ""}`}>
      <label>{rotulo}</label>
      <input
        type="number" step={passo} min={min} max={max} disabled={desligado}
        value={Number.isFinite(valor) ? Math.round(valor * 10) / 10 : 0}
        onFocus={() => store.gesto(true)}
        onBlur={() => store.gesto(false)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }}
      />
    </div>
  );
}
function Cor({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [txt, setTxt] = useState<string | null>(null);
  const { doc } = useStore();
  const paleta = doc.kit ? paletaDoKit(doc.kit) : [];
  return (
    <div className="cor-w">
    <div className="campo">
      <input type="color" value={valor} onFocus={() => store.gesto(true)} onBlur={() => store.gesto(false)} onChange={(e) => onChange(e.target.value)} />
      <input
        type="text" spellCheck={false} value={txt ?? valor.toUpperCase()}
        onFocus={() => setTxt(valor.toUpperCase())}
        onChange={(e) => { setTxt(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase()); }}
        onBlur={() => setTxt(null)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </div>
    {paleta.length > 0 && <div className="paleta mini">{paleta.map((c) => <button key={c.hex} className="sw" style={{ background: c.hex }} title={`${c.nome} · ${c.hex}`} aria-label={`${c.nome} ${c.hex}`} onClick={() => { store.gesto(true); onChange(c.hex); store.gesto(false); }} />)}</div>}
    </div>
  );
}
// Liga e desliga os slides grudados (vale para o documento inteiro).
function SlidesContinuos() {
  const { doc } = useStore();
  const ligado = doc.continuo !== false;
  return (
    <div className="slides-continuos">
      <label className="chk"><input type="checkbox" checked={ligado} onChange={(e) => store.exec("documento.continuo", { valor: e.target.checked })} /> Slides contínuos (grudados)</label>
      <div className="nota">{ligado ? "Um objeto pode começar num slide e terminar no outro. Use o + ao lado do slide para crescer à direita ou para baixo (feed em grade)." : "Separados, como stories ou uma apresentação: cada slide corta o que passa da borda."}</div>
    </div>
  );
}

function Deslizante({ rotulo, valor, min, max, passo = 1, unidade = "", onChange }: { rotulo: string; valor: number; min: number; max: number; passo?: number; unidade?: string; onChange: (v: number) => void }) {
  return (
    <div className="linha-c"><span>{rotulo}</span>
      <input type="range" min={min} max={max} step={passo} value={valor} onPointerDown={() => store.gesto(true)} onPointerUp={() => store.gesto(false)} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono">{Math.round(valor * 10) / 10}{unidade}</span></div>
  );
}
const Secao = ({ titulo, children }: { titulo: React.ReactNode; children: React.ReactNode }) => (
  <div className="secao"><div className="secao-t">{titulo}</div>{children}</div>
);

function ExportarSecao({ slideId }: { slideId: string | "todos" }) {
  const { doc } = useStore();
  const [fmt, setFmt] = useState<"png" | "jpg" | "webp" | "svg">("png");
  const [esc, setEsc] = useState(1);
  const [zip, setZip] = useState(true);
  const lista = slideId === "todos" ? doc.slides : doc.slides.filter((s) => s.id === slideId);
  return (
    <Secao titulo="Exportar">
      <div className="grade2">
        <div className="campo"><select value={fmt} onChange={(e) => setFmt(e.target.value as typeof fmt)}><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option><option value="svg">SVG</option></select></div>
        <div className="campo"><select value={esc} onChange={(e) => setEsc(Number(e.target.value))}><option value={1}>1x</option><option value={2}>2x</option></select></div>
      </div>
      {slideId === "todos" && (
        <>
          <div className="arquivos">{lista.map((_, i) => <div key={i}>{`${nomeSeguro(doc.nome)}-${String(i + 1).padStart(2, "0")}.${fmt}`}</div>)}</div>
          <label className="chk"><input type="checkbox" checked={zip} onChange={(e) => setZip(e.target.checked)} /> Juntar num ZIP</label>
        </>
      )}
      {fmt === "jpg" && <div className="nota">JPG não tem transparência: o fundo transparente sai branco.</div>}
      {fmt === "svg" && <div className="nota">SVG: formas e texto viram caminhos; imagens e camadas com desfoque ou sombra entram como imagem. A escala não se aplica.</div>}
      <button className="btn pri cheio" onClick={() => void exportar(slideId, fmt, esc, zip)}>
        {slideId === "todos" ? `Exportar ${lista.length} arquivo${lista.length > 1 ? "s" : ""}` : "Exportar slide"}
      </button>
    </Secao>
  );
}

export function Painel() {
  const { doc, selecao, editandoImagem } = useStore();
  if (editandoImagem) return <PainelEdicaoDeImagem />;
  if (store.ler().editandoVetor) return <PainelEdicaoDeVetor />;

  if (selecao.tipo === "carrossel") {
    const atual = Object.entries(FORMATOS).find(([, f]) => f.l === doc.formato.l && f.a === doc.formato.a)?.[0] ?? "retrato";
    return (
      <aside className="direita">
        <div className="titulo"><span className="ic">⧉</span><div><div className="t">{doc.nome}</div><div className="s">{doc.slides.length} slides</div></div></div>
        <Secao titulo="Formato">
          <div className="campo"><select value={atual} onChange={(e) => { const f = FORMATOS[e.target.value as keyof typeof FORMATOS]; store.exec("documento.formato", { l: f.l, a: f.a }); }}>
            {Object.entries(FORMATOS).map(([k, f]) => <option key={k} value={k}>{f.nome} · {f.l}×{f.a}</option>)}
          </select></div>
          <SlidesContinuos />
        </Secao>
        <ExportarSecao slideId="todos" />
      </aside>
    );
  }

  if (selecao.tipo === "slide") {
    const s = doc.slides.find((x) => x.id === selecao.id);
    if (!s) return null;
    const guias = doc.guias.filter((g) => g.slide === s.id).length;
    return (
      <aside className="direita">
        <div className="titulo"><span className="ic">#</span><div><div className="t">{s.nome}</div><div className="s">Slide · {doc.formato.l} × {doc.formato.a}</div></div></div>
        <Secao titulo="Fundo">
          <label className="chk"><input type="checkbox" checked={s.fundo === null} onChange={(e) => store.exec("slide.atualizar", { id: s.id, mudancas: { fundo: e.target.checked ? null : "#f3eee6" } })} /> Transparente</label>
          {s.fundo === null ? <div className="nota">O xadrez é o vazio. PNG e WebP saem com transparência.</div> : <div style={{ marginTop: 8 }}><Cor valor={s.fundo} onChange={(v) => store.exec("slide.atualizar", { id: s.id, mudancas: { fundo: v } })} /></div>}
        </Secao>
        <Secao titulo="Guias">
          <div className="nota" style={{ padding: 0 }}>{guias ? `${guias} neste slide. Arraste uma guia de volta para a régua para apagar.` : "Arraste das réguas (em cima e à esquerda) para criar."}</div>
        </Secao>
        <Secao titulo="Slide">
          <SlidesContinuos />
          <div className="grade2" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => store.exec("slide.duplicar", { id: s.id })}>Duplicar</button>
            <button className="btn perigo" disabled={doc.slides.length <= 1} onClick={() => store.exec("slide.apagar", { id: s.id })}>Apagar</button>
          </div>
        </Secao>
        <ExportarSecao slideId={s.id} />
      </aside>
    );
  }

  const n = doc.nos.find((x) => x.id === selecao.id);
  if (!n) return null;
  const up = (m: Record<string, unknown>) => store.atualizarNo(n.id, m);
  const nome = { texto: "Texto", retangulo: "Retângulo", imagem: "Imagem", vetor: "Vetor" }[n.tipo];
  const slide = doc.slides.find((s) => s.id === n.slide);
  return (
    <aside className="direita">
      <div className="titulo"><span className="ic">{{ texto: "T", retangulo: "▢", imagem: "▨", vetor: "✒" }[n.tipo]}</span><div><div className="t">{n.nome}</div><div className="s">{nome} · {slide?.nome}</div></div></div>
      <Secao titulo="Posição e tamanho">
        <div className="grade2">
          <Num rotulo="X" valor={n.x} onChange={(v) => up({ x: v })} />
          <Num rotulo="Y" valor={n.y} onChange={(v) => up({ y: v })} />
          <Num rotulo="L" valor={n.l} min={1} onChange={(v) => up({ l: Math.max(1, v) })} />
          <Num rotulo="A" valor={n.a} min={1} desligado={n.tipo === "texto"} onChange={(v) => up({ a: Math.max(1, v) })} />
          <Num rotulo="↻" valor={n.rot} min={-180} max={180} onChange={(v) => up({ rot: v })} />
        </div>
      </Secao>
      <Secao titulo="Camada">
        <div className="linha-c"><span>Opacidade</span>
          <input type="range" min={0} max={100} value={n.op} onPointerDown={() => store.gesto(true)} onPointerUp={() => store.gesto(false)} onChange={(e) => up({ op: Number(e.target.value) })} />
          <span className="mono">{Math.round(n.op)}</span></div>
      </Secao>
      {n.tipo === "texto" && <TextoSecao n={n} up={up} />}
      {n.tipo === "retangulo" && <RetanguloSecao n={n} up={up} />}
      {n.tipo === "imagem" && <ImagemSecao n={n} />}
      {n.tipo === "vetor" && <VetorSecao n={n} up={up} />}
      {n.tipo !== "imagem" && <BooleanosSecao n={n} />}
      <EfeitosSecao n={n} />
      <Secao titulo="Ordem e ações">
        <div className="grade2">
          <button className="btn" onClick={() => store.exec("no.ordem", { id: n.id, destino: "frente" })}>Para frente</button>
          <button className="btn" onClick={() => store.exec("no.ordem", { id: n.id, destino: "tras" })}>Para trás</button>
          <button className="btn" onClick={() => { const id = Math.random().toString(36).slice(2); store.exec("no.duplicar", { id: n.id, novoId: id }); store.selecionar({ tipo: "no", id }); }}>Duplicar</button>
          <button className="btn perigo" onClick={() => store.exec("no.apagar", { id: n.id })}>Apagar</button>
        </div>
        <button className="btn cheio" style={{ marginTop: 6 }} onClick={() => void exportarCamada(n.id)} title="PNG com fundo transparente">Exportar camada (PNG)</button>
      </Secao>
    </aside>
  );
}

function TextoSecao({ n, up }: { n: NoTexto; up: (m: Record<string, unknown>) => void }) {
  return (
    <Secao titulo="Texto">
      <div className="campo"><select value={n.fonte} onChange={(e) => up({ fonte: e.target.value, peso: pesoValido(e.target.value as Fonte, n.peso) })}>{FONTES.map((f) => <option key={f} value={f}>{FAMILIAS_DEF[f].rotulo}</option>)}</select></div>
      <div className="grade2" style={{ marginTop: 6 }}>
        <div className="campo"><select value={pesoValido(n.fonte, n.peso)} onChange={(e) => up({ peso: Number(e.target.value) })}>{FAMILIAS_DEF[n.fonte].pesos.map((p) => <option key={p}>{p}</option>)}</select></div>
        <Num rotulo="Aa" valor={n.tamanho} min={4} onChange={(v) => up({ tamanho: Math.max(4, v) })} />
        <Num rotulo="↕" valor={n.entrelinha} min={0.6} max={3} passo={0.05} onChange={(v) => up({ entrelinha: v })} />
      </div>
      <div className="grade2" style={{ marginTop: 6 }}>
        <Num rotulo="A↔A" valor={Math.round((n.espacamento ?? 0) * 1000) / 10} passo={0.5} min={-20} max={100} onChange={(v) => up({ espacamento: v ? v / 100 : undefined })} />
        {temItalico(n.fonte, n.peso) && <label className="chk" style={{ marginTop: 0 }}><input type="checkbox" checked={!!n.italico} onChange={(e) => up({ italico: e.target.checked || undefined })} /> Itálico</label>}
      </div>
      {!n.degrade && <div className="linha-c"><span>Cor</span><Cor valor={n.cor} onChange={(v) => up({ cor: v })} /></div>}
      <label className="chk"><input type="checkbox" checked={!!n.degrade} onChange={(e) => up({ degrade: e.target.checked ? { paradas: [{ pos: 0, cor: "#ffffff" }, { pos: 1, cor: n.cor }], de: -0.9, ate: 0.25 } : undefined })} /> Degradê nas letras</label>
      {n.degrade && <Paradas paradas={n.degrade.paradas} onChange={(paradas) => up({ degrade: { ...n.degrade!, paradas } })} />}
      <div className="linha-c"><span>Alinhar</span>
        <div className="seg">{(["left", "center", "right"] as const).map((a) => <button key={a} className={n.alinhar === a ? "on" : ""} onClick={() => up({ alinhar: a })}>{{ left: "⇤", center: "↔", right: "⇥" }[a]}</button>)}</div>
      </div>
      <button className="btn cheio" style={{ marginTop: 8 }} onClick={() => { store.selecionar({ tipo: "no", id: n.id }); store.gesto(true); store.editarTexto(n.id); }}>Editar texto</button>
      <button className="btn cheio" style={{ marginTop: 6 }} onClick={() => void store.converterEmContornos(n.id)} title="Cada letra vira um caminho que você pode puxar (⇧⌘O)">Converter em contornos</button>
    </Secao>
  );
}
// As cores de um degradê, de cima (ou do centro) para baixo (ou a borda), com a opacidade de cada uma.
function Paradas({ paradas, onChange }: { paradas: Parada[]; onChange: (p: Parada[]) => void }) {
  const mudar = (i: number, m: Partial<Parada>) => onChange(paradas.map((p, k) => (k === i ? { ...p, ...m } : p)));
  return (
    <>
      {paradas.map((p, i) => (
        <div key={i} style={{ marginTop: 6 }}>
          <Cor valor={p.cor} onChange={(v) => mudar(i, { cor: v })} />
          <div className="grade2" style={{ marginTop: 4 }}>
            <Num rotulo="%" valor={Math.round(p.pos * 100)} min={0} max={100} onChange={(v) => mudar(i, { pos: Math.min(1, Math.max(0, v / 100)) })} />
            <Num rotulo="Op" valor={p.op ?? 100} min={0} max={100} onChange={(v) => mudar(i, { op: v >= 100 ? undefined : Math.max(0, v) })} />
          </div>
        </div>
      ))}
    </>
  );
}
function RetanguloSecao({ n, up }: { n: NoRetangulo; up: (m: Record<string, unknown>) => void }) {
  const g = n.gradiente;
  return (
    <Secao titulo="Preenchimento">
      {!g && <Cor valor={n.cor} onChange={(v) => up({ cor: v })} />}
      {!g && <Deslizante rotulo="Opacidade" valor={n.opCor ?? 100} min={0} max={100} unidade="%" onChange={(v) => up({ opCor: v >= 100 ? undefined : v })} />}
      <label className="chk"><input type="checkbox" checked={!!g} onChange={(e) => up({ gradiente: e.target.checked ? { tipo: "linear", angulo: 180, paradas: [{ pos: 0, cor: n.cor }, { pos: 1, cor: n.cor, op: 0 }] } : undefined })} /> Degradê</label>
      {g && (
        <>
          <div className="seg" style={{ marginTop: 6 }}>{(["linear", "radial"] as const).map((t) => <button key={t} className={g.tipo === t ? "on" : ""} onClick={() => up({ gradiente: { ...g, tipo: t } })}>{t === "linear" ? "Linear" : "Radial"}</button>)}</div>
          {g.tipo === "linear" && <Deslizante rotulo="Ângulo" valor={g.angulo} min={0} max={360} onChange={(v) => up({ gradiente: { ...g, angulo: v } })} />}
          <Paradas paradas={g.paradas} onChange={(paradas) => up({ gradiente: { ...g, paradas } })} />
        </>
      )}
      <label className="chk"><input type="checkbox" checked={!!n.borda} onChange={(e) => up({ borda: e.target.checked ? { cor: "#ffffff", largura: 2 } : undefined })} /> Borda</label>
      {n.borda && (
        <>
          <div style={{ marginTop: 6 }}><Cor valor={n.borda.cor} onChange={(v) => up({ borda: { ...n.borda!, cor: v } })} /></div>
          <Deslizante rotulo="Espessura" valor={n.borda.largura} min={0.5} max={40} passo={0.5} onChange={(v) => up({ borda: { ...n.borda!, largura: v } })} />
          <Deslizante rotulo="Opacidade" valor={n.borda.op ?? 100} min={0} max={100} unidade="%" onChange={(v) => up({ borda: { ...n.borda!, op: v >= 100 ? undefined : v } })} />
        </>
      )}
      <button className="btn cheio" style={{ marginTop: 8 }} onClick={() => void store.entrarVetor(n.id)}>Editar vetor</button>
      <div className="grade2" style={{ marginTop: 6 }}><Num rotulo="◜" valor={n.raio} min={0} onChange={(v) => up({ raio: Math.max(0, v) })} /></div>
    </Secao>
  );
}
function ImagemSecao({ n }: { n: NoImagem }) {
  const editada = !!(n.edicao?.pintura || n.edicao?.mascara);
  return (
    <>
      <Secao titulo="Imagem">
        <div className="nota" style={{ padding: 0, marginBottom: 8 }}>
          {editada ? "Editada: pintura e máscara guardadas à parte. O original continua intacto." : "Preenche a caixa sem distorcer; a proporção é mantida ao redimensionar."}
        </div>
        <button className="btn pri cheio" style={{ marginTop: 0 }} onClick={() => store.entrarImagem(n.id)}>Editar imagem</button>
        {(editada || !ajustesNeutros(n.ajustes)) && (
          <button className="btn cheio" style={{ marginTop: 6 }} onClick={() => store.atualizarNo(n.id, { edicao: undefined, ajustes: undefined })}>Restaurar original</button>
        )}
      </Secao>
      <AjustesSecao n={n} />
    </>
  );
}

function AjustesSecao({ n }: { n: NoImagem }) {
  const a: Ajustes = n.ajustes ?? { brilho: 0, contraste: 0, saturacao: 0 };
  const up = (m: Partial<Ajustes>) => {
    const novo = { ...a, ...m };
    store.atualizarNo(n.id, { ajustes: ajustesNeutros(novo) ? undefined : novo });
  };
  return (
    <Secao titulo={<span className="linha-efeito">{adornos.efeito?.("ajustes", n)}Ajustes</span>}>
      <Deslizante rotulo="Brilho" valor={a.brilho} min={-100} max={100} onChange={(v) => up({ brilho: v })} />
      <Deslizante rotulo="Contraste" valor={a.contraste} min={-100} max={100} onChange={(v) => up({ contraste: v })} />
      <Deslizante rotulo="Saturação" valor={a.saturacao} min={-100} max={100} onChange={(v) => up({ saturacao: v })} />
    </Secao>
  );
}

const FERRAMENTAS_IMAGEM: { id: FerrImagem; nome: string; k: string }[] = [
  { id: "pincel", nome: "Pincel", k: "B" },
  { id: "borracha", nome: "Borracha", k: "E" },
  { id: "restaurar", nome: "Restaurar", k: "X" },
  { id: "desfocar", nome: "Desfocar", k: "R" },
  { id: "conta", nome: "Cor", k: "I" },
];

function PainelEdicaoDeImagem() {
  const e = useStore();
  const n = e.doc.nos.find((x) => x.id === e.editandoImagem) as NoImagem | undefined;
  const sess = sessaoDeImagem();
  if (!n || !sess) return null;
  const sel = e.ferrImagem;
  const ehPincel = sel === "pincel" || sel === "borracha" || sel === "restaurar" || sel === "desfocar";
  const op = (f: () => boolean | void) => { f(); store.tocar(); };
  return (
    <aside className="direita">
      <div className="titulo"><span className="ic">✎</span><div><div className="t">{FERRAMENTAS_IMAGEM.find((f) => f.id === sel)?.nome ?? (sel === "retangulo" ? "Seleção retangular" : "Laço")}</div><div className="s">Nível imagem · {n.nome}</div></div></div>
      <Secao titulo="Ferramenta">
        <div className="seg" style={{ flexWrap: "wrap" }}>
          {FERRAMENTAS_IMAGEM.map((f) => <button key={f.id} className={sel === f.id ? "on" : ""} title={`${f.nome} (${f.k})`} onClick={() => store.ferramentaDeImagem(f.id)}>{f.nome}</button>)}
        </div>
      </Secao>
      <Secao titulo="Pincel">
        <Deslizante rotulo="Tamanho" valor={e.pincel.tamanho} min={2} max={400} onChange={(v) => store.pincelDe({ tamanho: v })} />
        <Deslizante rotulo="Opacidade" valor={e.pincel.op} min={5} max={100} unidade="%" onChange={(v) => store.pincelDe({ op: v })} />
        <Deslizante rotulo="Dureza" valor={e.pincel.dureza} min={0} max={100} unidade="%" onChange={(v) => store.pincelDe({ dureza: v })} />
        {(sel === "pincel" || !ehPincel) && <div className="linha-c"><span>Cor</span><Cor valor={e.pincel.cor} onChange={(v) => store.pincelDe({ cor: v })} /></div>}
        <div className="nota">{sel === "borracha" ? "A borracha apaga na máscara: o original não se perde. Use Restaurar para devolver." : sel === "restaurar" ? "Devolve o que a borracha apagou." : sel === "desfocar" ? "Passe sobre a parte que quer suavizar." : "[ e ] mudam o tamanho."}</div>
      </Secao>
      <Secao titulo="Seleção">
        <div className="seg">
          <button className={sel === "retangulo" ? "on" : ""} title="Seleção retangular (M)" onClick={() => store.ferramentaDeImagem("retangulo")}>Retângulo</button>
          <button className={sel === "laco" ? "on" : ""} title="Laço (L)" onClick={() => store.ferramentaDeImagem("laco")}>Laço</button>
        </div>
        <div className="grade2" style={{ marginTop: 8 }}>
          <button className="btn" disabled={!sess.temSelecao()} onClick={() => op(() => sess.apagarSelecao())}>Apagar</button>
          <button className="btn" disabled={!sess.temSelecao()} onClick={() => op(() => sess.preencherSelecao(e.pincel.cor, e.pincel.op))}>Preencher</button>
          <button className="btn" onClick={() => op(() => sess.inverter())}>Inverter</button>
          <button className="btn" disabled={!sess.selecao} onClick={() => op(() => sess.desmarcar())}>Desmarcar</button>
        </div>
        <div className="nota">Com uma seleção, o pincel só pinta dentro dela.</div>
      </Secao>
      <AjustesSecao n={n} />
      <Secao titulo="Edição">
        <div className="grade2">
          <button className="btn" disabled={!sess.podeDesfazer} onClick={() => store.desfazer()}>↶ Desfazer</button>
          <button className="btn" disabled={!sess.podeRefazer} onClick={() => store.refazer()}>↷ Refazer</button>
        </div>
        <button className="btn cheio" style={{ marginTop: 6 }} onClick={() => op(() => sess.restaurarTudo())}>Restaurar o original</button>
        <button className="btn pri cheio" onClick={() => void store.sairImagem(true)}>Concluir edição</button>
        <button className="btn cheio" style={{ marginTop: 6 }} onClick={() => void store.sairImagem(false)}>Descartar</button>
      </Secao>
    </aside>
  );
}

const MODOS: { id: ModoDesfoque; nome: string }[] = [{ id: "camada", nome: "Camada" }, { id: "area", nome: "Só uma área" }, { id: "progressivo", nome: "Progressivo" }];

function EfeitosSecao({ n }: { n: No }) {
  const f: Fx = n.fx ?? {};
  const d = f.desfoque;
  const sh = f.sombra;
  const aplicar = (novo: Fx) => store.atualizarNo(n.id, { fx: Object.values(novo).some(Boolean) ? novo : undefined });
  const upD = (m: Partial<FxDesfoque>) => d && aplicar({ ...f, desfoque: { ...d, ...m } });
  const upArea = (m: Partial<FxDesfoque["area"]>) => d && aplicar({ ...f, desfoque: { ...d, area: { ...d.area, ...m } } });
  const upProg = (m: Partial<FxDesfoque["prog"]>) => d && aplicar({ ...f, desfoque: { ...d, prog: { ...d.prog, ...m } } });
  const pct = (v: number) => Math.round(v * 100);
  const vd = f.vidro;
  const controles: Record<keyof Fx, () => React.ReactNode> = {
    vidro: () => vd && <Deslizante rotulo="Intensidade" valor={vd.raio} min={0} max={60} onChange={(v) => aplicar({ ...f, vidro: { raio: v } })} />,
    desfoque: () => d && (
        <>
          <div className="seg" style={{ marginTop: 8 }}>{MODOS.map((m) => <button key={m.id} className={d.modo === m.id ? "on" : ""} onClick={() => upD({ modo: m.id })}>{m.nome}</button>)}</div>
          <Deslizante rotulo="Intensidade" valor={d.raio} min={0} max={120} onChange={(v) => upD({ raio: v })} />
          {d.modo === "area" && (
            <>
              <div className="linha-c"><span>Forma</span>
                <div className="seg">{(["retangulo", "elipse"] as const).map((k) => <button key={k} className={d.area.forma === k ? "on" : ""} onClick={() => upArea({ forma: k })}>{k === "retangulo" ? "Retângulo" : "Elipse"}</button>)}</div></div>
              <div className="grade2" style={{ marginTop: 6 }}>
                <Num rotulo="X" valor={pct(d.area.x)} onChange={(v) => upArea({ x: v / 100 })} />
                <Num rotulo="Y" valor={pct(d.area.y)} onChange={(v) => upArea({ y: v / 100 })} />
                <Num rotulo="L" valor={pct(d.area.l)} min={1} onChange={(v) => upArea({ l: Math.max(0.01, v / 100) })} />
                <Num rotulo="A" valor={pct(d.area.a)} min={1} onChange={(v) => upArea({ a: Math.max(0.01, v / 100) })} />
              </div>
              <Deslizante rotulo="Suavizar" valor={d.area.suave} min={0} max={200} onChange={(v) => upArea({ suave: v })} />
              <div className="nota">A área aparece tracejada na tela: arraste para mover, ou os cantos para mudar. Valores em % da caixa.</div>
            </>
          )}
          {d.modo === "progressivo" && (
            <>
              <div className="linha-c"><span>Cresce para</span>
                <div className="campo"><select value={d.prog.dir} onChange={(e) => upProg({ dir: e.target.value as FxDesfoque["prog"]["dir"] })}>
                  <option value="baixo">Baixo</option><option value="cima">Cima</option><option value="direita">Direita</option><option value="esquerda">Esquerda</option></select></div></div>
              <div className="grade2" style={{ marginTop: 6 }}>
                <Num rotulo="De" valor={pct(d.prog.ini)} min={0} max={99} onChange={(v) => upProg({ ini: Math.min(0.98, Math.max(0, v / 100)) })} />
                <Num rotulo="Até" valor={pct(d.prog.fim)} min={1} max={100} onChange={(v) => upProg({ fim: Math.min(1, Math.max(0.02, v / 100)) })} />
              </div>
              <label className="chk"><input type="checkbox" checked={!!d.prog.firmes} onChange={(e) => upProg({ firmes: e.target.checked || undefined })} /> Bordas firmes</label>
              <div className="nota">Sem desfoque em &ldquo;De&rdquo; e desfoque total em &ldquo;Até&rdquo;, em % da caixa. {d.prog.firmes ? "As bordas ficam cheias: bom para uma foto que preenche o slide." : "As bordas esfumam para fora no lado desfocado; marque Bordas firmes para manter a caixa cheia."}</div>
            </>
          )}
        </>
    ),
    sombra: () => sh && (
        <>
          <div className="grade2" style={{ marginTop: 6 }}>
            <Num rotulo="X" valor={sh.x} onChange={(v) => aplicar({ ...f, sombra: { ...sh, x: v } })} />
            <Num rotulo="Y" valor={sh.y} onChange={(v) => aplicar({ ...f, sombra: { ...sh, y: v } })} />
          </div>
          <Deslizante rotulo="Desfoque" valor={sh.raio} min={0} max={120} onChange={(v) => aplicar({ ...f, sombra: { ...sh, raio: v } })} />
          <Deslizante rotulo="Opacidade" valor={sh.op} min={0} max={100} unidade="%" onChange={(v) => aplicar({ ...f, sombra: { ...sh, op: v } })} />
          <div className="linha-c"><span>Cor</span><Cor valor={sh.cor} onChange={(v) => aplicar({ ...f, sombra: { ...sh, cor: v } })} /></div>
        </>
    ),
  };
  // os efeitos de `fx` do catálogo: cada um com a caixa de ligar, o encaixe da frente (ver ui/adornos.ts) e os controles
  return (
    <Secao titulo="Efeitos">
      {EFEITOS.filter((x) => x.raiz.startsWith("fx.") && (!x.tipos || x.tipos.includes(n.tipo))).map((x) => {
        const id = x.id as keyof Fx;
        return (
          <div key={id}>
            <div className="linha-efeito">
              {adornos.efeito?.(id, n)}
              <label className="chk"><input type="checkbox" checked={!!f[id]} onChange={(e) => aplicar({ ...f, [id]: e.target.checked ? x.padrao() : undefined })} /> {x.nome}</label>
            </div>
            {controles[id]()}
          </div>
        );
      })}
    </Secao>
  );
}

function VetorSecao({ n, up }: { n: NoVetor; up: (m: Record<string, unknown>) => void }) {
  const pontos = n.caminhos.reduce((t, c) => t + c.pontos.length, 0);
  return (
    <>
      <Secao titulo="Vetor">
        <div className="nota" style={{ padding: 0, marginBottom: 8 }}>{pontos} pontos em {n.caminhos.length} caminho{n.caminhos.length > 1 ? "s" : ""}{n.original ? " · veio de um texto" : ""}.</div>
        <button className="btn pri cheio" style={{ marginTop: 0 }} onClick={() => void store.entrarVetor(n.id)}>Editar vetor</button>
        {n.original && <button className="btn cheio" style={{ marginTop: 6 }} onClick={() => store.voltarAoTexto(n.id)} title="As edições nos pontos se perdem">Voltar ao texto</button>}
      </Secao>
      <CoresDoVetor n={n} up={up} />
    </>
  );
}
function CoresDoVetor({ n, up }: { n: NoVetor; up: (m: Record<string, unknown>) => void }) {
  return (
    <Secao titulo="Preenchimento e traço">
      <label className="chk" style={{ marginTop: 0 }}><input type="checkbox" checked={n.cor !== null} onChange={(e) => up({ cor: e.target.checked ? "#ff5c8a" : null })} /> Preenchimento</label>
      {n.cor !== null && <div style={{ marginTop: 6 }}><Cor valor={n.cor} onChange={(v) => up({ cor: v })} /></div>}
      <label className="chk"><input type="checkbox" checked={!!n.traco} onChange={(e) => up({ traco: e.target.checked ? { cor: "#121a33", largura: 8 } : null })} /> Traço</label>
      {n.traco && (
        <>
          <div style={{ marginTop: 6 }}><Cor valor={n.traco.cor} onChange={(v) => up({ traco: { ...n.traco!, cor: v } })} /></div>
          <Deslizante rotulo="Espessura" valor={n.traco.largura} min={0.5} max={80} passo={0.5} onChange={(v) => up({ traco: { ...n.traco!, largura: v } })} />
        </>
      )}
      <div className="linha-c"><span>Furos</span>
        <div className="seg"><button className={n.regra === "evenodd" ? "on" : ""} onClick={() => up({ regra: "evenodd" })} title="Par-ímpar: formas dentro de formas viram furo">Par-ímpar</button><button className={n.regra === "nonzero" ? "on" : ""} onClick={() => up({ regra: "nonzero" })} title="Pelo sentido do traçado">Sentido</button></div></div>
    </Secao>
  );
}

function BooleanosSecao({ n }: { n: No }) {
  useStore();
  const abaixo = store.camadaAbaixo(n.id);
  const ops: { id: "unir" | "subtrair" | "interseccao" | "excluir"; nome: string; dica: string }[] = [
    { id: "unir", nome: "Unir", dica: "Junta as duas formas numa só" },
    { id: "subtrair", nome: "Subtrair", dica: "Esta camada recorta a de baixo" },
    { id: "interseccao", nome: "Interseção", dica: "Fica só onde as duas se sobrepõem" },
    { id: "excluir", nome: "Excluir", dica: "Fica tudo, menos onde se sobrepõem" },
  ];
  return (
    <Secao titulo="Booleanos">
      <div className="grade2">{ops.map((o) => <button key={o.id} className="btn" disabled={!abaixo} title={o.dica} onClick={() => void store.combinarComAbaixo(o.id)}>{o.nome}</button>)}</div>
      <div className="nota">{abaixo ? <>Combina esta camada com <b>{abaixo.nome}</b>, logo abaixo dela. O resultado vira um vetor.</> : "Precisa de uma forma, texto ou vetor logo abaixo desta camada."}</div>
    </Secao>
  );
}

function PainelEdicaoDeVetor() {
  const e = useStore();
  const n = e.doc.nos.find((x) => x.id === e.editandoVetor) as NoVetor | undefined;
  if (!n || n.tipo !== "vetor") return null;
  const up = (m: Record<string, unknown>) => store.atualizarNo(n.id, m);
  const ref = e.selVetor.length === 1 ? e.selVetor[0] : null;
  const q = ref ? n.caminhos[ref.c]?.pontos[ref.p] : undefined;
  const setPonto = (m: { x?: number; y?: number }) => {
    if (!ref || !q) return;
    store.caminhos(n.id, n.caminhos.map((c, ci) => (ci !== ref.c ? c : { ...c, pontos: c.pontos.map((p, pi) => (pi === ref.p ? { ...p, ...m } : p)) })));
  };
  return (
    <aside className="direita">
      <div className="titulo"><span className="ic">✒</span><div><div className="t">{ref && q ? `Ponto ${ref.p + 1} de ${n.caminhos[ref.c].pontos.length}` : e.selVetor.length > 1 ? `${e.selVetor.length} pontos` : e.ferrVetor === "caneta" ? "Caneta" : "Seleção direta"}</div><div className="s">Nível vetor · {n.nome}</div></div></div>
      <Secao titulo="Ferramenta">
        <div className="seg">
          <button className={e.ferrVetor === "direta" ? "on" : ""} onClick={() => store.ferramentaDeVetor("direta")} title="Seleção direta (A)">Seleção direta</button>
          <button className={e.ferrVetor === "caneta" ? "on" : ""} onClick={() => store.ferramentaDeVetor("caneta")} title="Caneta (P)">Caneta</button>
        </div>
        <div className="nota">{e.ferrVetor === "caneta" ? "Clique para pôr pontos; clique e arraste para curvas. Clique no primeiro ponto para fechar. Enter termina." : "Arraste pontos e alças. Duplo clique num ponto: canto ↔ suave."}</div>
      </Secao>
      {q && ref && (
        <Secao titulo="Ponto">
          <div className="grade2"><Num rotulo="X" valor={q.x} onChange={(v) => setPonto({ x: v })} /><Num rotulo="Y" valor={q.y} onChange={(v) => setPonto({ y: v })} /></div>
          <div className="linha-c"><span>Tipo</span>
            <div className="seg">
              <button className={!q.suave ? "on" : ""} onClick={() => q.suave && store.caminhos(n.id, alternarSuave(n.caminhos, ref))}>Canto</button>
              <button className={q.suave ? "on" : ""} onClick={() => !q.suave && store.caminhos(n.id, alternarSuave(n.caminhos, ref))}>Suave</button>
            </div></div>
        </Secao>
      )}
      {e.selVetor.length > 0 && (
        <Secao titulo="Pontos selecionados"><button className="btn perigo cheio" onClick={() => store.apagarPontosSelecionados()}>Apagar {e.selVetor.length === 1 ? "o ponto" : `${e.selVetor.length} pontos`}</button></Secao>
      )}
      <CoresDoVetor n={n} up={up} />
      <Secao titulo="Edição">
        <div className="grade2">
          <button className="btn" disabled={!e.podeDesfazer} onClick={() => store.desfazer()}>↶ Desfazer</button>
          <button className="btn" disabled={!e.podeRefazer} onClick={() => store.refazer()}>↷ Refazer</button>
        </div>
        <button className="btn pri cheio" onClick={() => store.sairVetor()}>Concluir edição</button>
      </Secao>
    </aside>
  );
}
