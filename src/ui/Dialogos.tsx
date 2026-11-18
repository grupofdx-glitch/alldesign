// Janelas por cima do editor: novo documento a partir de um modelo e lista dos arquivos da CLI.
import { useEffect, useState } from "react";
import { store, useStore } from "../store.ts";
import { IDS_DE_KIT, KITS, type KitId } from "../motor/kits.ts";
import { MODELOS, type ModeloId } from "../motor/modelos.ts";
import { type ArquivoDeAgente, abrirDaEntrada, listarEntrada, novoDeModelo } from "../acoes.ts";

function Janela({ titulo, children, onFechar }: { titulo: string; children: React.ReactNode; onFechar: () => void }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onFechar]);
  return (
    <div className="modal-fundo" onPointerDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal" role="dialog" aria-label={titulo}>
        <div className="modal-topo"><h2>{titulo}</h2><button className="btn ghost" onClick={onFechar} aria-label="Fechar">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Dialogos() {
  const { dialogo } = useStore();
  if (dialogo === "novo") return <DialogoNovo />;
  if (dialogo === "agentes") return <ListaDeAgentes />;
  return null;
}

function DialogoNovo() {
  const { sujo } = useStore();
  const [modelo, setModelo] = useState<ModeloId>("carrossel");
  const [kit, setKit] = useState<KitId>("escuro");
  const [titulo, setTitulo] = useState("Sua mente está no piloto automático?");
  const [subtitulo, setSubtitulo] = useState("Três sinais de que você decide sem perceber");
  const [tema, setTema] = useState("");
  const [pontos, setPontos] = useState([
    { titulo: "Você não lembra do caminho", texto: "Chega ao destino e não recorda nenhuma decisão do trajeto." },
    { titulo: "A rotina manda", texto: "Faz as mesmas coisas, na mesma ordem, sem perguntar por quê." },
    { titulo: "Reage em vez de escolher", texto: "A resposta sai antes do pensamento." },
  ]);
  const [chamada, setChamada] = useState("Salve este post e envie para quem precisa ler.");
  const fechar = () => store.abrirDialogo(null);
  const k = KITS[kit];
  const criar = async () => {
    if (!titulo.trim()) return;
    fechar();
    await novoDeModelo(modelo, kit, {
      titulo: titulo.trim(), subtitulo: subtitulo.trim() || undefined, tema: tema.trim() || undefined,
      pontos: pontos.filter((p) => p.titulo.trim()).map((p) => ({ titulo: p.titulo.trim(), texto: p.texto.trim() })), chamada: chamada.trim() || undefined,
    });
  };
  return (
    <Janela titulo="Novo a partir de um modelo" onFechar={fechar}>
      <div className="modal-corpo">
        <div className="cartoes">
          {(Object.keys(MODELOS) as ModeloId[]).map((m) => (
            <button key={m} className={`cartao${modelo === m ? " on" : ""}`} onClick={() => setModelo(m)}>
              <b>{MODELOS[m].nome}</b><span>{MODELOS[m].descricao}</span>
            </button>
          ))}
        </div>
        <div className="campo-l"><label htmlFor="kit-dialogo">Kit de estilo</label>
          <div className="linha-kit">
            <div className="campo"><select id="kit-dialogo" value={kit} onChange={(e) => setKit(e.target.value as KitId)}>{IDS_DE_KIT.map((id) => <option key={id} value={id}>{KITS[id].nome}</option>)}</select></div>
            <span className="amostras">{Object.values(k.papeis).filter((v, i, a) => a.indexOf(v) === i).map((hex) => <i key={hex} style={{ background: hex }} title={hex} />)}</span>
          </div>
          {k.nota && <div className="nota">{k.nota}</div>}
        </div>
        <div className="campo-l"><label htmlFor="n-titulo">Título</label><div className="campo"><input id="n-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div></div>
        <div className="campo-l"><label htmlFor="n-sub">Subtítulo</label><div className="campo"><input id="n-sub" value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} /></div></div>
        <div className="campo-l"><label htmlFor="n-tema">Etiqueta da capa (opcional)</label><div className="campo"><input id="n-tema" value={tema} placeholder="Autoconhecimento" onChange={(e) => setTema(e.target.value)} /></div></div>
        {modelo === "carrossel" && (
          <>
            <div className="campo-l"><label>Pontos (um slide cada)</label>
              {pontos.map((p, i) => (
                <div key={i} className="ponto-l">
                  <div className="campo"><input aria-label={`Título do ponto ${i + 1}`} value={p.titulo} placeholder={`Ponto ${i + 1}`} onChange={(e) => setPontos(pontos.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} /></div>
                  <div className="campo"><input aria-label={`Texto do ponto ${i + 1}`} value={p.texto} placeholder="Explicação curta" onChange={(e) => setPontos(pontos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} /></div>
                  <button className="btn ghost" aria-label={`Tirar o ponto ${i + 1}`} onClick={() => setPontos(pontos.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {pontos.length < 6 && <button className="btn" onClick={() => setPontos([...pontos, { titulo: "", texto: "" }])}>+ Ponto</button>}
            </div>
            <div className="campo-l"><label htmlFor="n-chamada">Chamada do último slide</label><div className="campo"><input id="n-chamada" value={chamada} onChange={(e) => setChamada(e.target.value)} /></div></div>
          </>
        )}
        {sujo && <div className="nota">Isto substitui o documento aberto, que tem alterações não salvas.</div>}
      </div>
      <div className="modal-rodape">
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn pri" disabled={!titulo.trim()} onClick={() => void criar()}>Criar</button>
      </div>
    </Janela>
  );
}

function ListaDeAgentes() {
  const { sujo } = useStore();
  const [lista, setLista] = useState<ArquivoDeAgente[] | null>(null);
  useEffect(() => { void listarEntrada().then(setLista); }, []);
  const fechar = () => store.abrirDialogo(null);
  return (
    <Janela titulo="Arquivos dos agentes" onFechar={fechar}>
      <div className="modal-corpo">
        {lista === null ? <div className="nota">Procurando…</div> : lista.length === 0 ? (
          <div className="nota">Nada na pasta de entrada ainda. Os agentes criam arquivos aqui com <code>bin/design novo …</code>.</div>
        ) : (
          <div className="lista-arq">
            {lista.map((a) => (
              <button key={a.nome} className="item-arq" onClick={() => { fechar(); void abrirDaEntrada(a.nome); }}>
                <b>{a.nome}</b><span>{new Date(a.modificado).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {Math.max(1, Math.round(a.tamanho / 1024))} KB</span>
              </button>
            ))}
          </div>
        )}
        {sujo && <div className="nota">Abrir um arquivo substitui o documento aberto, que tem alterações não salvas.</div>}
      </div>
    </Janela>
  );
}
