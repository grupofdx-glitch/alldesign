import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const entrada = mkdtempSync(join(tmpdir(), "alldesign-"));
process.env.ALLDESIGN_ENTRADA = entrada;
const { executar } = await import("./cli.ts");
const { lerArquivosDoPacote } = await import("./motor/arquivo.ts");
const { lerDoDisco, ehPasta } = await import("./pacote.ts");
const lerAlldesignDoDisco = (c: string) => lerArquivosDoPacote(lerDoDisco(c));

type R = Record<string, any>;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const run = (...a: string[]) => executar(a) as R;

test("novo cria o arquivo na pasta de entrada e devolve a URL do editor", () => {
  const r = run("novo", "--modelo", "carrossel", "--kit", "escuro", "--titulo", "Teste do carrossel", "--ponto", "Um|Texto um", "--ponto", "Dois|Texto dois");
  assert.ok(r.arquivo.startsWith(entrada));
  assert.match(r.url, /\?abrir=teste-do-carrossel\.alldesign$/);
  assert.equal(r.slides.length, 4);
  const { doc } = lerAlldesignDoDisco(r.arquivo);
  assert.equal(doc.kit, "escuro");
  assert.equal(doc.slides.length, 4);
});

test("kits lista os três kits com paleta e fontes", () => {
  const kits = executar(["kits"]) as { id: string; cores: { nome: string }[]; fontes: object }[];
  assert.deepEqual(kits.map((k) => k.id), ["escuro", "claro", "editorial"]);
  assert.ok(kits.every((k) => k.cores.length > 3 && k.fontes));
});

test("kit desconhecido: erro claro", () => {
  assert.throws(() => run("novo", "--modelo", "post", "--kit", "inexistente", "--titulo", "x"), /Kit desconhecido/);
});

test("aplicar muda o documento pelos mesmos comandos e regrava o arquivo", () => {
  const r = run("novo", "--modelo", "post", "--kit", "editorial", "--titulo", "Antes");
  const info = run("info", r.arquivo);
  const slide = info.slides[0].id;
  const out = run("aplicar", r.arquivo, "--json", JSON.stringify([
    { id: "slide.atualizar", params: { id: slide, mudancas: { fundo: "#ffffff" } } },
    { id: "slide.criar", params: { nome: "Extra" } },
    { id: "documento.renomear", params: { nome: "Depois" } },
  ]));
  assert.equal(out.aplicados, 3);
  const { doc } = lerAlldesignDoDisco(r.arquivo);
  assert.equal(doc.nome, "Depois");
  assert.equal(doc.slides.length, 2);
  assert.equal(doc.slides[0].fundo, "#ffffff");
});

test("comando inválido: erro claro e nada é gravado", () => {
  const r = run("novo", "--modelo", "post", "--kit", "escuro", "--titulo", "Intacto");
  const antes = readFileSync(join(r.arquivo, "documento.json"));
  assert.throws(() => run("aplicar", r.arquivo, "--json", JSON.stringify([{ id: "documento.renomear", params: { nome: "x" } }, { id: "nao.existe" }])), /Comando 2 \(nao\.existe\) falhou.*Nada foi gravado/);
  assert.deepEqual(readFileSync(join(r.arquivo, "documento.json")), antes);
});

test("imagem.adicionar embute o arquivo no .alldesign", () => {
  const png = join(entrada, "pixel.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const r = run("novo", "--modelo", "post", "--kit", "escuro", "--titulo", "Com imagem");
  run("aplicar", r.arquivo, "--json", JSON.stringify([{ id: "imagem.adicionar", params: { arquivo: png, slide: 1, x: 100, y: 100, l: 400, a: 300 } }]));
  const { doc, imagens } = lerAlldesignDoDisco(r.arquivo);
  const img = doc.nos.find((n) => n.tipo === "imagem");
  assert.ok(img && img.tipo === "imagem" && imagens.has(img.hash));
});

test("erros de uso", () => {
  assert.throws(() => run("novo", "--kit", "xyz", "--titulo", "a"), /Kit desconhecido/);
  assert.throws(() => run("novo", "--modelo", "carrossel"), /Falta o título/);
  assert.throws(() => run("info", "nao-existe"), /Arquivo não encontrado/);
  assert.throws(() => run("foo"), /Comando desconhecido/);
});

test("o pacote é uma pasta legível: documento.json formatado, LEIA-ME e imagens; --zip grava um arquivo só", () => {
  const r = run("novo", "--modelo", "post", "--kit", "claro", "--titulo", "Pacote legível") as R;
  assert.ok(ehPasta(r.arquivo));
  const json = readFileSync(join(r.arquivo, "documento.json"), "utf8");
  assert.match(json, /^\{\n  "versao": 1,/); // indentado, uma chave por linha
  assert.match(readFileSync(join(r.arquivo, "LEIA-ME.md"), "utf8"), /# Pacote \.alldesign/);
  assert.equal((run("info", r.arquivo) as R).forma, "pasta");
  const z = run("novo", "--modelo", "post", "--kit", "claro", "--titulo", "Pacote em zip", "--zip") as R;
  assert.ok(!ehPasta(z.arquivo));
  assert.equal((run("info", z.arquivo) as R).forma, "zip");
  // aplicar mantém a forma de cada um
  for (const a of [r.arquivo, z.arquivo]) {
    const antes = ehPasta(a);
    run("aplicar", a, "--json", JSON.stringify([{ id: "documento.renomear", params: { nome: "Renomeado" } }]));
    assert.equal(ehPasta(a), antes);
    assert.equal(lerAlldesignDoDisco(a).doc.nome, "Renomeado");
  }
});

test("uma IA edita o documento.json à mão e põe uma imagem com nome qualquer: o pacote continua abrindo", () => {
  const r = run("novo", "--modelo", "post", "--kit", "escuro", "--titulo", "Editado à mão") as R;
  const caminho = join(r.arquivo, "documento.json");
  const doc = JSON.parse(readFileSync(caminho, "utf8"));
  doc.nos.push({ id: "foto1", slide: doc.slides[0].id, nome: "Foto", tipo: "imagem", hash: "foto-praia", x: 0, y: 0, l: 100, a: 100, rot: 0, op: 100, oculto: false, travado: false });
  writeFileSync(caminho, JSON.stringify(doc, null, 2));
  mkdirSync(join(r.arquivo, "imagens"), { recursive: true });
  writeFileSync(join(r.arquivo, "imagens", "foto-praia.png"), Buffer.from(PNG, "base64"));
  const lido = lerAlldesignDoDisco(r.arquivo);
  assert.ok(lido.imagens.has("foto-praia"));
  assert.equal((lido.doc.nos.find((n: { id: string }) => n.id === "foto1") as { hash?: string } | undefined)?.hash, "foto-praia");
});
