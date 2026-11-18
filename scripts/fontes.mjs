// Copia as fontes (Fontsource) de node_modules para public/fontes. Rode com `npm run fontes` (predev e prebuild já rodam).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "public", "fontes");
mkdirSync(destino, { recursive: true });

// espelha src/motor/familias.ts (+ Geist Mono, só da interface): [slug, pesos, pesos com itálico]
const lista = [
  ["bricolage-grotesque", [400, 500, 600, 700, 800]],
  ["geist", [400, 500, 600, 700, 800]],
  ["geist-mono", [400, 500]],
  ["raleway", [400, 500, 600, 700, 800]],
  ["eb-garamond", [400, 500, 600, 700, 800], [400, 500]],
  ["cinzel", [400, 500, 600, 700, 800]],
  ["fragment-mono", [400]],
];
let faltou = 0;
let copiadas = 0;
for (const [slug, pesos, italicos = []] of lista) {
  for (const [p, estilo] of [...pesos.map((p) => [p, "normal"]), ...italicos.map((p) => [p, "italic"])]) {
    const nome = `${slug}-latin-${p}-${estilo}.woff`;
    const origem = join(raiz, "node_modules", "@fontsource", slug, "files", nome);
    if (!existsSync(origem)) {
      console.error(`fontes: falta ${nome} (rode npm install)`);
      faltou++;
      continue;
    }
    copyFileSync(origem, join(destino, nome));
    copiadas++;
  }
}
// confere que o registro do app não pede peso que o script não copia
const reg = readFileSync(join(raiz, "src", "motor", "familias.ts"), "utf8");
for (const m of reg.matchAll(/slug: "([^"]+)", pesos: \[([^\]]+)\](?:, italicos: \[([^\]]+)\])?/g)) {
  const num = (t) => (t ? t.split(",").map((x) => Number(x.trim())) : []);
  const l = lista.find(([s]) => s === m[1]);
  if (!l || num(m[2]).some((p) => !l[1].includes(p)) || num(m[3]).some((p) => !(l[2] ?? []).includes(p))) {
    console.error(`fontes: o script não cobre ${m[1]} ${m[2]}${m[3] ? ` (itálico ${m[3]})` : ""} (atualize scripts/fontes.mjs)`);
    faltou++;
  }
}
console.log(`fontes: ${copiadas} arquivos em public/fontes`);
process.exit(faltou ? 1 : 0);
