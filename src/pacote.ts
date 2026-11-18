// O pacote .alldesign no disco (Node): pasta (padrão dos agentes — o Finder a mostra como um arquivo só) ou ZIP. Ler os
// dois do mesmo jeito; gravar sem deixar o editor ver meio pacote.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { unzipSync, zipSync } from "fflate";
import type { ArquivosDoPacote } from "./motor/arquivo.ts";

export const ehPasta = (caminho: string): boolean => existsSync(caminho) && statSync(caminho).isDirectory();

/** Os arquivos de um pacote no disco, seja pasta ou ZIP. Pasta: sem atalhos (symlinks) nem ocultos, nada fora dela. */
export function lerDoDisco(caminho: string): ArquivosDoPacote {
  if (!ehPasta(caminho)) return unzipSync(new Uint8Array(readFileSync(caminho)));
  const arquivos: ArquivosDoPacote = {};
  const andar = (pasta: string) => {
    for (const nome of readdirSync(pasta)) {
      if (nome.startsWith(".")) continue;
      const c = join(pasta, nome);
      const s = lstatSync(c);
      if (s.isSymbolicLink()) continue;
      if (s.isDirectory()) andar(c);
      else if (s.isFile()) arquivos[relative(caminho, c).split(sep).join("/")] = new Uint8Array(readFileSync(c));
    }
  };
  andar(caminho);
  return arquivos;
}

/** Tamanho em bytes de um pacote no disco (pasta: a soma dos arquivos). */
export function tamanhoNoDisco(caminho: string): number {
  if (!ehPasta(caminho)) return statSync(caminho).size;
  return Object.values(lerDoDisco(caminho)).reduce((t, b) => t + b.length, 0);
}

/** O pacote como ZIP, venha de pasta ou não (para o navegador, que não recebe pastas). */
export const zipDoDisco = (caminho: string): Uint8Array => (ehPasta(caminho) ? zipSync(lerDoDisco(caminho), { level: 6 }) : new Uint8Array(readFileSync(caminho)));

/**
 * Grava o pacote em `destino` — como pasta ou como ZIP — montando tudo ao lado e trocando no fim por `rename`.
 * O que já existia em `destino` sai inteiro (a troca não mistura arquivos velhos e novos).
 */
export function gravarNoDisco(destino: string, arquivos: ArquivosDoPacote, comoPasta: boolean): void {
  mkdirSync(dirname(destino), { recursive: true });
  const tmp = `${destino}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  if (comoPasta) {
    for (const [rel, bytes] of Object.entries(arquivos)) {
      if (rel.split("/").some((p) => p === ".." || p === "")) throw new Error(`Caminho inválido no pacote: ${rel}`);
      const c = join(tmp, ...rel.split("/"));
      mkdirSync(dirname(c), { recursive: true });
      writeFileSync(c, bytes);
    }
  } else writeFileSync(tmp, zipSync(arquivos, { level: 6 }));
  if (existsSync(destino)) {
    const velho = `${destino}.velho-${process.pid}`;
    renameSync(destino, velho);
    renameSync(tmp, destino);
    rmSync(velho, { recursive: true, force: true });
  } else renameSync(tmp, destino);
}
