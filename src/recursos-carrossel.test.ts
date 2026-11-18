// Recursos de texto e formas do editor: espaço entre letras, itálico, degradê nas letras, retângulo com opacidade do
// preenchimento, borda e degradê, desfoque do fundo (vidro) e imagem reduzida sem serrilhado. Cada teste desenha pelo
// renderizador de verdade (Chrome headless, `bin/design exportar`) e confere os pixels.
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deflateSync, inflateSync } from "node:zlib";

const entrada = mkdtempSync(join(tmpdir(), "alldesign-rec-"));
process.env.ALLDESIGN_ENTRADA = entrada;
const { executarAsync } = await import("./cli.ts");
const { acharChrome } = await import("./exportar-headless.ts");

type R = Record<string, any>;
const semChrome = !acharChrome() && "Chrome não encontrado (instale ou aponte ALLDESIGN_CHROME)";

// PNG RGBA de 8 bits (o Chrome grava assim) → pixels.
function pixels(buf: Buffer) {
  const l = buf.readUInt32BE(16);
  const a = buf.readUInt32BE(20);
  const partes: Buffer[] = [];
  for (let p = 8; p < buf.length; ) {
    const n = buf.readUInt32BE(p);
    if (buf.toString("latin1", p + 4, p + 8) === "IDAT") partes.push(buf.subarray(p + 8, p + 8 + n));
    p += 12 + n;
  }
  const cru = inflateSync(Buffer.concat(partes));
  const linha = l * 4;
  const px = new Uint8Array(linha * a);
  for (let y = 0; y < a; y++) {
    const f = cru[y * (linha + 1)];
    for (let i = 0; i < linha; i++) {
      const v = cru[y * (linha + 1) + 1 + i];
      const esq = i >= 4 ? px[y * linha + i - 4] : 0;
      const cima = y ? px[(y - 1) * linha + i] : 0;
      const diag = y && i >= 4 ? px[(y - 1) * linha + i - 4] : 0;
      const paeth = () => {
        const p = esq + cima - diag;
        const pa = Math.abs(p - esq), pb = Math.abs(p - cima), pc = Math.abs(p - diag);
        return pa <= pb && pa <= pc ? esq : pb <= pc ? cima : diag;
      };
      px[y * linha + i] = (v + [0, esq, cima, (esq + cima) >> 1, paeth()][f]) & 255;
    }
  }
  const rgba = (x: number, y: number) => Array.from(px.subarray(y * linha + x * 4, y * linha + x * 4 + 4));
  // caixa da tinta (alfa > 40) numa faixa
  const tinta = (x0 = 0, y0 = 0, x1 = l, y1 = a) => {
    let mx = Infinity, Mx = -1, my = Infinity, My = -1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (px[y * linha + x * 4 + 3] > 40) {
      mx = Math.min(mx, x); Mx = Math.max(Mx, x); my = Math.min(my, y); My = Math.max(My, y);
    }
    return { x0: mx, x1: Mx, y0: my, y1: My };
  };
  return { l, a, rgba, tinta };
}

// PNG RGB mínimo (para a imagem de teste).
function png(l: number, a: number, cor: (x: number, y: number) => number): Buffer {
  const cru = Buffer.alloc((l * 3 + 1) * a);
  for (let y = 0; y < a; y++) for (let x = 0; x < l; x++) cru.fill(cor(x, y), y * (l * 3 + 1) + 1 + x * 3, y * (l * 3 + 1) + 4 + x * 3);
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo, "latin1"), dados]);
    const b = Buffer.alloc(12 + dados.length);
    b.writeUInt32BE(dados.length, 0);
    t.copy(b, 4);
    b.writeUInt32BE(crc(t), 8 + dados.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(a, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(cru)), bloco("IEND", Buffer.alloc(0))]);
}

const base = { rot: 0, op: 100, oculto: false, travado: false };
const texto = (id: string, slide: string, m: R) => ({ id, slide, tipo: "texto", nome: id, x: 40, y: 200, l: 1000, a: 200, texto: "IIII", fonte: "garamond", peso: 500, tamanho: 160, cor: "#ffffff", alinhar: "left", entrelinha: 1.2, ...base, ...m });
// o modelo "post" é quadrado: 1080 × 1080
const ret = (id: string, slide: string, m: R) => ({ id, slide, tipo: "retangulo", nome: id, x: 0, y: 0, l: 1080, a: 1080, cor: "#000000", raio: 0, ...base, ...m });

// Um documento com um slide transparente por caso; devolve os PNG de cada slide.
async function desenhar(casos: { id: string; fundo?: string | null; nos: R[] }[], extra: R[] = []): Promise<ReturnType<typeof pixels>[]> {
  const r = (await executarAsync(["novo", "--modelo", "post", "--kit", "editorial", "--titulo", "Recursos", "--sem-previas"])) as R;
  const cmds: R[] = [{ id: "documento.continuo", params: { valor: false } }, ...extra];
  for (const c of casos) {
    cmds.push({ id: "slide.criar", params: { id: c.id, fundo: c.fundo ?? null } });
    for (const no of c.nos) cmds.push({ id: "no.criar", params: { no } });
  }
  await executarAsync(["aplicar", r.arquivo, "--sem-previas", "--json", JSON.stringify(cmds)]);
  const saida = mkdtempSync(join(tmpdir(), "alldesign-rec-saida-"));
  const slides = casos.map((_, i) => ["--slide", String(i + 2)]).flat();
  const out = (await executarAsync(["exportar", r.arquivo, ...slides, "--saida", saida])) as R;
  return out.arquivos.map((f: R) => pixels(readFileSync(f.arquivo)));
}

test("texto: espaço entre letras, itálico e degradê nas letras", { skip: semChrome, timeout: 180000 }, async () => {
  const [normal, espacado, italico, degrade] = await desenhar([
    { id: "A", nos: [texto("a", "A", {})] },
    { id: "B", nos: [texto("b", "B", { espacamento: 0.5 })] },
    { id: "C", nos: [texto("c", "C", { italico: true, peso: 400 })] },
    { id: "D", nos: [texto("d", "D", { texto: "HHHH", fonte: "cinzel", peso: 600, degrade: { paradas: [{ pos: 0, cor: "#ff0000" }, { pos: 1, cor: "#0000ff" }], de: -0.72, ate: 0 } })] },
  ]);
  // 4 letras com 0,5 em depois de cada uma: a tinta vai de 3 espaços (a última leva o espaço depois dela, fora da tinta)
  const w0 = normal.tinta().x1 - normal.tinta().x0;
  const w1 = espacado.tinta().x1 - espacado.tinta().x0;
  assert.ok(Math.abs(w1 - w0 - 3 * 0.5 * 160) <= 3, `largura da tinta ${w0} → ${w1}, esperado +240`);
  // itálico: a parte de cima das hastes fica à direita da de baixo
  const t = italico.tinta();
  const topo = italico.tinta(0, t.y0, 1080, t.y0 + 10).x0;
  const pe = italico.tinta(0, t.y1 - 10, 1080, t.y1).x0;
  assert.ok(topo - pe >= 8, `itálico: começo da tinta em cima ${topo}, embaixo ${pe}`);
  const n = normal.tinta();
  assert.ok(Math.abs(normal.tinta(0, n.y0, 1080, n.y0 + 10).x0 - normal.tinta(0, n.y1 - 10, 1080, n.y1).x0) <= 3, "o normal fica em pé");
  // degradê: vermelho no alto da letra, azul no pé
  const g = degrade.tinta();
  // uma coluna na haste do primeiro H (cheia de cima a baixo)
  let x = g.x0;
  while (x < g.x0 + 80 && !(degrade.rgba(x, g.y0 + 4)[3] > 250 && degrade.rgba(x, g.y1 - 4)[3] > 250)) x++;
  const [r1, , b1] = degrade.rgba(x, g.y0 + 4);
  const [r2, , b2] = degrade.rgba(x, g.y1 - 4);
  assert.ok(r1 > 200 && b1 < 60, `alto da letra: ${r1},${b1}`);
  assert.ok(b2 > 200 && r2 < 60, `pé da letra: ${r2},${b2}`);
});


test("retângulo: opacidade do preenchimento, borda por dentro e degradê linear e radial", { skip: semChrome, timeout: 180000 }, async () => {
  const [op, borda, linear, radial] = await desenhar([
    { id: "A", nos: [ret("a", "A", { opCor: 50 })] },
    { id: "B", nos: [ret("b", "B", { x: 100, y: 100, l: 400, a: 300, opCor: 0, borda: { cor: "#ff0000", largura: 10, op: 100 } })] },
    { id: "C", nos: [ret("c", "C", { gradiente: { tipo: "linear", angulo: 180, paradas: [{ pos: 0, cor: "#000000" }, { pos: 1, cor: "#000000", op: 0 }] } })] },
    { id: "D", nos: [ret("d", "D", { x: 0, y: 0, l: 1000, a: 500, gradiente: { tipo: "radial", angulo: 180, paradas: [{ pos: 0, cor: "#000000" }, { pos: 1, cor: "#000000", op: 0 }] } })] },
  ]);
  assert.ok(Math.abs(op.rgba(540, 540)[3] - 128) <= 2, `opCor 50: alfa ${op.rgba(540, 540)[3]}`);
  assert.deepEqual(borda.rgba(105, 250), [255, 0, 0, 255], "borda: dentro da caixa, nos 10 px da beira");
  assert.equal(borda.rgba(95, 250)[3], 0, "borda: nada fora da caixa");
  assert.equal(borda.rgba(300, 250)[3], 0, "borda: o miolo segue vazio (opCor 0)");
  assert.ok(linear.rgba(540, 2)[3] > 250 && linear.rgba(540, 1077)[3] < 5, `linear 180°: alfa no topo ${linear.rgba(540, 2)[3]}, no pé ${linear.rgba(540, 1077)[3]}`);
  assert.ok(Math.abs(linear.rgba(540, 540)[3] - 128) <= 3, `linear: meio ${linear.rgba(540, 540)[3]}`);
  // radial em elipse que toca os lados: meio-alfa a meio caminho do centro até a borda, nos dois eixos
  assert.ok(radial.rgba(500, 250)[3] > 250, "radial: centro cheio");
  assert.ok(Math.abs(radial.rgba(750, 250)[3] - radial.rgba(500, 375)[3]) <= 4, `radial é elipse: ${radial.rgba(750, 250)[3]} × ${radial.rgba(500, 375)[3]}`);
  assert.ok(radial.rgba(999, 250)[3] < 6 && radial.rgba(3, 3)[3] === 0, "radial: some na borda e nos cantos");
});

test("desfoque do fundo (vidro): borra o que está atrás só dentro da forma", { skip: semChrome, timeout: 180000 }, async () => {
  // listras pretas e brancas de 4 px atrás de um vidro transparente
  const listras = Array.from({ length: 108 }, (_, i) => ret(`l${i}`, "A", { x: 0, y: i * 10, l: 1080, a: 5, cor: "#ffffff" }));
  const [v] = await desenhar([{ id: "A", fundo: "#000000", nos: [...listras, ret("vidro", "A", { x: 300, y: 300, l: 480, a: 600, raio: 40, opCor: 0, fx: { vidro: { raio: 8 } } })] }]);
  const faixa = (x: number) => {
    let min = 255, max = 0;
    for (let y = 500; y < 520; y++) { const g = v.rgba(x, y)[0]; min = Math.min(min, g); max = Math.max(max, g); }
    return { min, max };
  };
  const dentro = faixa(540);
  const fora = faixa(150);
  assert.ok(fora.max > 250 && fora.min < 5, `fora do vidro as listras seguem nítidas (${fora.min}–${fora.max})`);
  assert.ok(dentro.max - dentro.min < 40 && dentro.min > 80 && dentro.max < 180, `dentro do vidro as listras viram cinza médio (${dentro.min}–${dentro.max})`);
  // canto arredondado: fora do raio continua nítido
  const canto = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => v.rgba(302, 302 + k)[0]);
  assert.ok(Math.max(...canto) - Math.min(...canto) > 200, "o canto arredondado não é borrado");
});

test("imagem reduzida não serrilha (bug: o medalhão de 1024 px num círculo de 300 saía serrilhado)", { skip: semChrome, timeout: 180000 }, async () => {
  // xadrez de 1 px, 1024 × 1024, desenhado em 300 × 300 (redução de 3,41×, como o medalhão): o certo é um cinza liso
  // (média); serrilhado dá manchas (moiré)
  const arq = join(entrada, "xadrez.png");
  writeFileSync(arq, png(1024, 1024, (x, y) => ((x + y) % 2 ? 255 : 0)));
  const r = (await executarAsync(["novo", "--modelo", "post", "--kit", "editorial", "--titulo", "Xadrez", "--sem-previas"])) as R;
  await executarAsync(["aplicar", r.arquivo, "--sem-previas", "--json", JSON.stringify([
    { id: "slide.criar", params: { id: "A", fundo: "#000000" } },
    { id: "imagem.adicionar", params: { arquivo: arq, slide: "A", x: 100, y: 100, l: 300, a: 300 } },
  ])]);
  const saida = mkdtempSync(join(tmpdir(), "alldesign-xadrez-"));
  const out = (await executarAsync(["exportar", r.arquivo, "--slide", "2", "--saida", saida])) as R;
  const p = pixels(readFileSync(out.arquivos[0].arquivo));
  let min = 255, max = 0;
  for (let y = 120; y < 380; y += 3) for (let x = 120; x < 380; x += 3) { const g = p.rgba(x, y)[0]; min = Math.min(min, g); max = Math.max(max, g); }
  assert.ok(max - min <= 24, `cinza da redução varia de ${min} a ${max} (serrilhado)`);
});
