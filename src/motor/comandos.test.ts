import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Historico } from "./comandos.ts";
import { documentoNovo, type NoRetangulo } from "./modelo.ts";

const retangulo = (slide: string, id: string): NoRetangulo => ({
  id, slide, nome: id, tipo: "retangulo", x: 0, y: 0, l: 100, a: 100, rot: 0, op: 100, oculto: false, travado: false, cor: "#fff", raio: 0,
});

test("desfazer e refazer", () => {
  const h = new Historico(documentoNovo());
  const s = h.atual.slides[0].id;
  h.exec("no.criar", { no: retangulo(s, "a") });
  h.exec("no.criar", { no: retangulo(s, "b") });
  assert.equal(h.atual.nos.length, 2);
  h.desfazer();
  assert.equal(h.atual.nos.length, 1);
  h.refazer();
  assert.equal(h.atual.nos.length, 2);
});

test("um gesto vira um só passo", () => {
  const h = new Historico(documentoNovo());
  const s = h.atual.slides[0].id;
  h.exec("no.criar", { no: retangulo(s, "a") });
  h.iniciarGesto();
  for (let i = 1; i <= 20; i++) h.exec("no.atualizar", { id: "a", mudancas: { x: i } });
  h.fimGesto();
  assert.equal(h.atual.nos[0].x, 20);
  h.desfazer();
  assert.equal(h.atual.nos[0].x, 0);
  assert.equal(h.atual.nos.length, 1);
});

test("ordem: frente, trás e arrastar", () => {
  const h = new Historico(documentoNovo());
  const s = h.atual.slides[0].id;
  for (const id of ["a", "b", "c"]) h.exec("no.criar", { no: retangulo(s, id) });
  h.exec("no.ordem", { id: "a", destino: "frente" });
  assert.deepEqual(h.atual.nos.map((n) => n.id), ["b", "c", "a"]);
  h.exec("no.ordem", { id: "a", destino: "tras" });
  assert.deepEqual(h.atual.nos.map((n) => n.id), ["a", "b", "c"]);
  h.exec("no.ordem", { id: "c", antesDe: "a" });
  assert.deepEqual(h.atual.nos.map((n) => n.id), ["c", "a", "b"]);
  h.exec("no.ordem", { id: "c", destino: "acima" });
  assert.deepEqual(h.atual.nos.map((n) => n.id), ["a", "c", "b"]);
});

test("apagar slide leva os nós; o último slide não some", () => {
  const h = new Historico(documentoNovo());
  const s1 = h.atual.slides[0].id;
  h.exec("slide.criar", { id: "s2" });
  h.exec("no.criar", { no: retangulo("s2", "x") });
  h.exec("slide.apagar", { id: "s2" });
  assert.equal(h.atual.nos.length, 0);
  h.exec("slide.apagar", { id: s1 });
  assert.equal(h.atual.slides.length, 1);
});

test("reordenar slides", () => {
  const h = new Historico(documentoNovo());
  h.exec("slide.criar", { id: "b" });
  h.exec("slide.criar", { id: "c" });
  const a = h.atual.slides[0].id;
  h.exec("slide.ordem", { id: "c", antesDe: a });
  assert.deepEqual(h.atual.slides.map((s) => s.id), ["c", a, "b"]);
  h.exec("slide.ordem", { id: "c" });
  assert.deepEqual(h.atual.slides.map((s) => s.id), [a, "b", "c"]);
  assert.equal(h.exec("slide.ordem", { id: "b", antesDe: "b" }), h.atual);
});

test("efeitos viajam no nó e desfazem", () => {
  const h = new Historico(documentoNovo());
  const s = h.atual.slides[0].id;
  h.exec("no.criar", { no: retangulo(s, "a") });
  h.exec("no.atualizar", { id: "a", mudancas: { fx: { sombra: { x: 0, y: 8, raio: 16, cor: "#000000", op: 30 } } } });
  assert.equal(h.atual.nos[0].fx?.sombra?.raio, 16);
  h.desfazer();
  assert.equal(h.atual.nos[0].fx, undefined);
});
