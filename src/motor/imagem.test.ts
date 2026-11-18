import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LADO_MAX, dimensoesDeTrabalho, fatorTrabalho, filtroDeAjustes, paraTrabalho } from "./imagem.ts";

test("caixa com a mesma proporção: ponto da caixa vira ponto da imagem de trabalho", () => {
  const no = { l: 960, a: 720 };
  const orig = { l: 1200, a: 900 };
  const p = paraTrabalho(no, orig, 600, { x: 480, y: 360 }); // centro da caixa
  assert.deepEqual([p.x, p.y], [300, 225]);
  assert.equal(fatorTrabalho(no, orig, 600), 600 / 1200 / (960 / 1200));
});

test("preencher corta o que sobra: caixa mais larga que a imagem mostra só o miolo vertical", () => {
  const no = { l: 1000, a: 500 };
  const orig = { l: 1000, a: 1000 };
  const topo = paraTrabalho(no, orig, 1000, { x: 0, y: 0 });
  assert.deepEqual([topo.x, topo.y], [0, 250]); // o canto da caixa cai no meio da imagem, 250 px abaixo do topo
});

test("resolução de trabalho tem teto e mantém a proporção", () => {
  const d = dimensoesDeTrabalho({ l: 6400, a: 3200 });
  assert.equal(d.w, LADO_MAX);
  assert.equal(d.h, LADO_MAX / 2);
  assert.deepEqual(dimensoesDeTrabalho({ l: 800, a: 600 }), { w: 800, h: 600 });
});

test("filtro dos ajustes", () => {
  assert.equal(filtroDeAjustes({ brilho: 10, contraste: -20, saturacao: -100 }), "brightness(1.1) contrast(0.8) saturate(0)");
});
