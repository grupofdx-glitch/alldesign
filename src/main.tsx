import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";
import { store } from "./store.ts";
import * as acoes from "./acoes.ts";
import * as arquivo from "./motor/arquivo.ts";
import * as render from "./motor/render.ts";
import * as svg from "./motor/svg.ts";
import { aguardarFontesDaTela, registrarFontes } from "./motor/fontes.ts";
import { recarregarCores } from "./ui/cores.ts";
import "./estilo.css";

// Porta de entrada para testes e, depois, para agentes: o mesmo comando que o mouse usa.
(window as unknown as { alldesign: unknown }).alldesign = { store, exec: store.exec, acoes, arquivo, render, svg };
registrarFontes();
createRoot(document.getElementById("raiz")!).render(<App />);

// o canvas só enxerga a fonte depois de carregada: redesenha quando elas chegam
void aguardarFontesDaTela().then(() => store.tocar());
// Se quem embute o editor trocar as variáveis de cor no <html>, a tela de desenho relê e redesenha.
new MutationObserver(() => {
  recarregarCores();
  store.tocar();
}).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
