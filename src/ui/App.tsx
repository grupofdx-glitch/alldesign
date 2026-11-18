import { useEffect, useRef } from "react";
import { store, useStore } from "../store.ts";
import { Camadas } from "./Camadas.tsx";
import { Painel } from "./Painel.tsx";
import { Tela } from "./Tela.tsx";
import { abrir, abrirDaEntrada, salvar } from "../acoes.ts";
import { Dialogos } from "./Dialogos.tsx";
import { BarraDeFerramentas, Niveis, migalhasDe, useAtalhos, useEnquadrar, useLados } from "./Editor.tsx";

export function App() {
  const e = useStore();
  const centro = useRef<HTMLDivElement>(null);
  const ajustar = useEnquadrar(centro);
  useEffect(() => {
    const t = setTimeout(ajustar, 50);
    window.addEventListener("alldesign:ajustar", ajustar);
    // ?abrir=nome.alldesign: o link que os agentes devolvem abre o arquivo da pasta de entrada
    const nome = new URLSearchParams(location.search).get("abrir");
    if (nome) void abrirDaEntrada(nome).then(() => history.replaceState(null, "", location.pathname));
    return () => { clearTimeout(t); window.removeEventListener("alldesign:ajustar", ajustar); };
  }, []);
  useAtalhos(ajustar);
  const migalhas = migalhasDe(e);
  const lados = useLados("alldesign");

  return (
    <div className={`app${lados.classes}`}>
      <header className="topo">
        <div className="logo"><i />AllDesign</div>
        <div className="migalhas">{migalhas.map((m, i) => <span key={i} className={i === migalhas.length - 1 ? "on" : ""}>{i > 0 && <b>›</b>}{m}</span>)}{e.sujo && <em title="Alterações não salvas">●</em>}</div>
        <Niveis />
        {lados.botoes}
        <button className="btn ghost" disabled={!e.podeDesfazer} onClick={store.desfazer} title="Desfazer (⌘Z)">↶</button>
        <button className="btn ghost" disabled={!e.podeRefazer} onClick={store.refazer} title="Refazer (⇧⌘Z)">↷</button>
        <button className="btn ghost zoom" onClick={ajustar} title="Ajustar à tela (⌘0)">{Math.round(e.vista.zoom * 100)}%</button>
        <button className="btn" onClick={() => store.abrirDialogo("novo")} title="Novo a partir de um modelo">Novo</button>
        <button className="btn" onClick={() => store.abrirDialogo("agentes")} title="Arquivos criados pela linha de comando (bin/design)">Arquivos da CLI</button>
        <button className="btn" onClick={abrir} title="Abrir (⌘O)">Abrir</button>
        <button className="btn pri" onClick={salvar} title="Salvar (⌘S)">Salvar</button>
      </header>
      <Camadas />
      <main className="centro" ref={centro}>
        <Tela />
        <BarraDeFerramentas ajustar={ajustar} />
      </main>
      <Painel />
      <Dialogos />
    </div>
  );
}
