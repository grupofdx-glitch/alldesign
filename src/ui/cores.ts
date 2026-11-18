// Cores da interface pintadas no canvas (réguas, molduras, guias, seleção), lidas das variáveis do CSS: sozinho, são
// as do editor; quando o editor é embutido, as do tema de quem o embute. Lidas uma vez e guardadas — `recarregarCores` quando o
// tema muda (main.tsx observa o <html>).
type NomeDeCor = "tela" | "regua" | "regua-linha" | "regua-marca" | "regua-texto" | "rotulo" | "moldura" | "guia" | "escurecer" | "acento" | "sobre-acento";

let lidas: Partial<Record<NomeDeCor, string>> = {};

export function cor(nome: NomeDeCor): string {
  let c = lidas[nome];
  if (!c) {
    c = getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim() || "#ff00ff";
    lidas[nome] = c;
  }
  return c;
}

export function recarregarCores(): void {
  lidas = {};
}
