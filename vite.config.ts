import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { tamanhoNoDisco, zipDoDisco } from "./src/pacote.ts";

// Pasta onde a CLI (bin/design) deixa documentos para abrir no editor. Só o servidor local enxerga.
const ENTRADA = process.env.ALLDESIGN_ENTRADA || join(homedir(), ".alldesign", "entrada");

function entradaDosAgentes(): Plugin {
  const atender: NonNullable<Plugin["configureServer"]> = (servidor) => {
    servidor.middlewares.use("/entrada", (req, res) => {
      const caminho = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\//, "");
      if (!caminho) {
        const lista = existsSync(ENTRADA)
          ? readdirSync(ENTRADA).filter((n) => n.endsWith(".alldesign") && !n.startsWith(".")).map((nome) => ({ nome, tamanho: tamanhoNoDisco(join(ENTRADA, nome)), modificado: statSync(join(ENTRADA, nome)).mtimeMs }))
              .sort((a, b) => b.modificado - a.modificado)
          : [];
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        return void res.end(JSON.stringify(lista));
      }
      const nome = basename(caminho); // sem subpastas: nada fora da pasta de entrada
      const arq = join(ENTRADA, nome);
      if (nome !== caminho || !nome.endsWith(".alldesign") || !existsSync(arq)) {
        res.statusCode = 404;
        return void res.end("não encontrado");
      }
      // pacote em pasta ou em ZIP: o navegador recebe sempre ZIP
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Cache-Control", "no-store");
      res.end(zipDoDisco(arq));
    });
  };
  return { name: "entrada-dos-agentes", configureServer: atender, configurePreviewServer: atender as never };
}

// `base: "./"`: o build usa endereços relativos, para o app poder morar numa subpasta.
export default defineConfig({ base: "./", plugins: [react(), entradaDosAgentes()], server: { host: "127.0.0.1", port: 4760 } });
