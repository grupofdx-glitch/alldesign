import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

const entrada = mkdtempSync(join(tmpdir(), "alldesign-exp-"));
process.env.ALLDESIGN_ENTRADA = entrada;
const { executarAsync } = await import("./cli.ts");
const { acharChrome } = await import("./exportar-headless.ts");

type R = Record<string, any>;
const chrome = acharChrome();
const semChrome = !chrome && "Chrome não encontrado (instale ou aponte ALLDESIGN_CHROME)";

test("exportar valida formato, escala e slide antes de subir qualquer coisa", async () => {
  const r = (await executarAsync(["novo", "--modelo", "post", "--kit", "escuro", "--titulo", "Validação"])) as R;
  await assert.rejects(() => executarAsync(["exportar", r.arquivo, "--formato", "gif"]), /Formato desconhecido/);
  await assert.rejects(() => executarAsync(["exportar", r.arquivo, "--escala", "3"]), /escala precisa ser 1 ou 2/);
  await assert.rejects(() => executarAsync(["exportar", r.arquivo, "--slide", "0"]), /inteiros a partir de 1/);
  await assert.rejects(() => executarAsync(["exportar", "nao-existe"]), /Arquivo não encontrado/);
});

test("exportar sem o editor: PNG 2x e SVG saem com o conteúdo do slide", { skip: semChrome, timeout: 120000 }, async () => {
  const r = (await executarAsync(["novo", "--modelo", "carrossel", "--kit", "claro", "--titulo", "Exportação sem editor", "--ponto", "Um|Texto um"])) as R;
  const saida = mkdtempSync(join(tmpdir(), "alldesign-saida-"));
  const png = (await executarAsync(["exportar", r.arquivo, "--escala", "2", "--slide", "1", "--saida", saida])) as R;
  assert.equal(png.arquivos.length, 1);
  const buf = readFileSync(png.arquivos[0].arquivo);
  assert.equal(buf.subarray(1, 4).toString(), "PNG");
  assert.equal(buf.readUInt32BE(16), 2160); // largura do IHDR: 1080 × 2
  assert.equal(buf.readUInt32BE(20), 2700);
  const svg = (await executarAsync(["exportar", r.arquivo, "--formato", "svg", "--saida", saida])) as R;
  assert.equal(svg.arquivos.length, 3); // capa, um ponto e chamada
  const texto = readFileSync(svg.arquivos[0].arquivo, "utf8");
  assert.match(texto, /<svg [^>]*viewBox="0 0 1080 1350"/);
  assert.match(texto, /<path /);
  await assert.rejects(() => executarAsync(["exportar", r.arquivo, "--slide", "9", "--saida", saida]), /Slide 9 não existe/);
  assert.ok(existsSync(png.arquivos[0].arquivo));
});

// PNG RGBA de 8 bits → alfa de cada pixel (o Chrome grava assim; filtros 0–4 do PNG).
function alfas(buf: Buffer): { l: number; a: number; alfa: (x: number, y: number) => number } {
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
  return { l, a, alfa: (x, y) => px[y * linha + x * 4 + 3] };
}

test("desfoque de área e progressivo não deixam o objeto opaco transparente (sem fundo cinza vazando)", { skip: semChrome, timeout: 120000 }, async () => {
  const r = (await executarAsync(["novo", "--modelo", "post", "--kit", "claro", "--titulo", "Opacidade"])) as R;
  const ret = (id: string, fx: unknown) => ({ id, slide: "T", tipo: "retangulo", nome: id, x: 0, y: 0, l: 1080, a: 1080, rot: 0, op: 100, oculto: false, travado: false, cor: "#e8590c", raio: 0, fx });
  const area = { x: 0.2, y: 0.2, l: 0.6, a: 0.6, forma: "elipse", suave: 120 };
  await executarAsync(["aplicar", r.arquivo, "--json", JSON.stringify([
    { id: "slide.criar", params: { id: "T", fundo: null } },
    { id: "slide.criar", params: { id: "U", fundo: null } },
    { id: "documento.continuo", params: { valor: false } },
    { id: "no.criar", params: { no: ret("area", { desfoque: { modo: "area", raio: 60, area, prog: { dir: "baixo", ini: 0, fim: 1 } } }) } },
    { id: "no.criar", params: { no: { ...ret("prog", { desfoque: { modo: "progressivo", raio: 120, area, prog: { dir: "baixo", ini: 0.3, fim: 1, firmes: true } } }), slide: "U" } } },
    { id: "slide.criar", params: { id: "V", fundo: null } },
    { id: "no.criar", params: { no: { ...ret("suave", { desfoque: { modo: "progressivo", raio: 60, area, prog: { dir: "baixo", ini: 0.3, fim: 1 } } }), slide: "V", x: 140, y: 140, l: 800, a: 800 } } },
  ])]);
  const saida = mkdtempSync(join(tmpdir(), "alldesign-alfa-"));
  const out = (await executarAsync(["exportar", r.arquivo, "--slide", "2", "--slide", "3", "--slide", "4", "--saida", saida])) as R;
  // bordas comuns (padrão, como no Figma): o lado desfocado esfuma para fora; o lado nítido segue cheio e com borda viva
  const suave = alfas(readFileSync(out.arquivos[2].arquivo));
  assert.equal(suave.alfa(540, 160), 255, "lado nítido, dentro da caixa");
  assert.equal(suave.alfa(540, 120), 0, "lado nítido, fora da caixa: nada vaza");
  assert.ok(suave.alfa(540, 935) < 200, `lado desfocado, na borda: esfumado (alfa ${suave.alfa(540, 935)})`);
  assert.ok(suave.alfa(540, 980) > 0, "lado desfocado, fora da caixa: o desfoque passa da borda");
  for (const f of out.arquivos.slice(0, 2)) {
    const { l, a, alfa } = alfas(readFileSync(f.arquivo));
    let menor = 255;
    let onde = "";
    for (let y = 0; y < a; y += 3) for (let x = 0; x < l; x += 3) if (alfa(x, y) < menor) { menor = alfa(x, y); onde = `${x},${y}`; }
    // antes da correção: 191 no anel da área e 84–134 nas bordas do progressivo. O Chrome sem placa de vídeo
    // arredonda até ~246 nas laterais do progressivo mais forte (invisível); com placa de vídeo sai 255.
    assert.ok(menor >= 240, `${f.arquivo}: alfa mínimo ${menor} em ${onde}, dentro de um objeto opaco`);
  }
});

test("o pacote sai com as prévias dos slides; editar à mão as deixa velhas até `bin/design previas`", { skip: semChrome, timeout: 180000 }, async () => {
  const { assinatura } = await import("./motor/arquivo.ts");
  const r = (await executarAsync(["novo", "--modelo", "carrossel", "--kit", "escuro", "--titulo", "Com prévias", "--ponto", "Um|Texto um"])) as R;
  assert.deepEqual(r.previas, ["previas/slide-01.png", "previas/slide-02.png", "previas/slide-03.png"]);
  const png = readFileSync(join(r.arquivo, "previas", "slide-01.png"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 540); // metade de 1080
  const indice = () => JSON.parse(readFileSync(join(r.arquivo, "previas", "indice.json"), "utf8"));
  const doc = () => readFileSync(join(r.arquivo, "documento.json"), "utf8");
  assert.equal(indice().assinatura, assinatura(doc()));
  // uma IA edita o documento.json direto: as prévias ficam velhas…
  const d = JSON.parse(doc());
  d.nome = "Editado à mão";
  writeFileSync(join(r.arquivo, "documento.json"), JSON.stringify(d, null, 2));
  assert.notEqual(indice().assinatura, assinatura(doc()));
  // …até refazer
  const p = (await executarAsync(["previas", r.arquivo])) as R;
  assert.equal(p.previas.length, 3);
  assert.equal(indice().assinatura, assinatura(doc()));
});
