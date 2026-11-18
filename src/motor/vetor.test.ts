import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Caminho, NoVetor } from "./modelo.ts";
import { caminhosDeComandos } from "./texto-vetor.ts";
import { acrescentarPonto, alcasDoUltimo, alternarSuave, apagarPontos, combinar, dSvg, escalarCaminhos, fecharCaminho, inserirPonto, limites, moverAlca, moverPontos, normalizarVetor, retanguloParaCaminhos } from "./vetor.ts";

const quadrado = (x: number, y: number, l: number): Caminho[] => [{ fechado: true, pontos: [{ x, y }, { x: x + l, y }, { x: x + l, y: y + l }, { x, y: y + l }] }];
const area = (cs: Caminho[]) => {
  const b = limites(cs);
  return (b.x1 - b.x0) * (b.y1 - b.y0);
};
const base = (caminhos: Caminho[]): NoVetor => ({
  id: "v", slide: "s", tipo: "vetor", nome: "v", x: 100, y: 100, l: 50, a: 50, rot: 0, op: 100, oculto: false, travado: false,
  caminhos, cor: "#000", traco: null, regra: "nonzero",
});

test("dSvg: reta e curva", () => {
  assert.equal(dSvg(quadrado(0, 0, 10)), "M0 0L10 0L10 10L0 10Z");
  const c: Caminho[] = [{ fechado: false, pontos: [{ x: 0, y: 0, eout: { x: 5, y: 0 } }, { x: 10, y: 10, ein: { x: -5, y: 0 } }] }];
  assert.equal(dSvg(c), "M0 0C5 0 5 10 10 10");
});

test("retângulo com raio vira 8 pontos com alças; sem raio, 4", () => {
  assert.equal(retanguloParaCaminhos(100, 60, 0)[0].pontos.length, 4);
  const r = retanguloParaCaminhos(100, 60, 20)[0];
  assert.equal(r.pontos.length, 8);
  const b = limites([r]);
  assert.ok(Math.abs(b.x1 - b.x0 - 100) < 0.01 && Math.abs(b.y1 - b.y0 - 60) < 0.01);
});

test("normalizar: a caixa passa a coincidir com o desenho e a posição visual se mantém", () => {
  const n = normalizarVetor(base(quadrado(20, 30, 40)));
  assert.deepEqual([n.l, n.a], [40, 40]);
  assert.deepEqual([n.x, n.y], [120, 130]); // 100 + 20, 100 + 30
  assert.deepEqual([n.caminhos[0].pontos[0].x, n.caminhos[0].pontos[0].y], [0, 0]);
});

test("normalizar com rotação mantém o centro do desenho no mesmo lugar", () => {
  const n0 = { ...base(quadrado(0, 0, 50)), rot: 90 };
  const mexido = { ...n0, caminhos: quadrado(0, 0, 50).map((c) => ({ ...c, pontos: c.pontos.map((p) => ({ ...p, x: p.x + 50 })) })) }; // desenho andou 50 px para a direita (no espaço local)
  const n = normalizarVetor(mexido);
  // centro local do desenho: (75, 25); com 90°, o deslocamento em relação ao centro da caixa (25,25) vira (0, 50)
  const centro = { x: n.x + n.l / 2, y: n.y + n.a / 2 };
  assert.ok(Math.abs(centro.x - 125) < 1e-6 && Math.abs(centro.y - 175) < 1e-6, JSON.stringify(centro));
});

test("escalar pontos junto com a caixa", () => {
  const c = escalarCaminhos([{ fechado: false, pontos: [{ x: 10, y: 20, eout: { x: 4, y: 2 } }] }], 2, 3);
  assert.deepEqual(c[0].pontos[0], { x: 20, y: 60, eout: { x: 8, y: 6 }, ein: undefined });
});

test("mover pontos e alças; ponto suave espelha a outra alça", () => {
  const cs: Caminho[] = [{ fechado: false, pontos: [{ x: 0, y: 0 }, { x: 50, y: 0, suave: true, ein: { x: -10, y: 0 }, eout: { x: 20, y: 0 } }, { x: 100, y: 0 }] }];
  const m = moverPontos(cs, [{ c: 0, p: 1 }], 5, 7);
  assert.deepEqual([m[0].pontos[1].x, m[0].pontos[1].y], [55, 7]);
  assert.deepEqual(m[0].pontos[0], cs[0].pontos[0]); // o resto não muda
  const h = moverAlca(cs, { c: 0, p: 1 }, "eout", { x: 0, y: 30 }, false);
  assert.deepEqual(h[0].pontos[1].ein, { x: -0, y: -10 }); // oposta, mantendo o comprimento 10
  const solto = moverAlca(cs, { c: 0, p: 1 }, "eout", { x: 0, y: 30 }, true);
  assert.deepEqual(solto[0].pontos[1].ein, { x: -10, y: 0 });
  assert.equal(solto[0].pontos[1].suave, false);
});

test("alternar canto ↔ suave", () => {
  const cs: Caminho[] = [{ fechado: false, pontos: [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }] }];
  const s = alternarSuave(cs, { c: 0, p: 1 });
  const q = s[0].pontos[1];
  assert.equal(q.suave, true);
  assert.ok(q.ein && q.eout && Math.abs(q.ein.x + q.eout.x) < 1e-9 && q.eout.x > 0);
  const volta = alternarSuave(s, { c: 0, p: 1 });
  assert.equal(volta[0].pontos[1].ein, undefined);
});

test("inserir ponto no segmento não muda a forma e respeita a tolerância", () => {
  const cs = quadrado(0, 0, 100);
  const r = inserirPonto(cs, { x: 50, y: 2 }, 8);
  assert.ok(r);
  assert.equal(r!.caminhos[0].pontos.length, 5);
  assert.deepEqual(r!.novo, { c: 0, p: 1 });
  assert.ok(Math.abs(r!.caminhos[0].pontos[1].x - 50) < 0.5);
  assert.equal(inserirPonto(cs, { x: 50, y: 40 }, 8), null); // longe do contorno
});

test("apagar pontos; caminho com menos de 2 pontos some", () => {
  const cs = quadrado(0, 0, 10);
  assert.equal(apagarPontos(cs, [{ c: 0, p: 0 }])[0].pontos.length, 3);
  assert.equal(apagarPontos(cs, [{ c: 0, p: 0 }, { c: 0, p: 1 }, { c: 0, p: 2 }]).length, 0);
});

test("caneta: acrescentar, fechar e alças do último ponto", () => {
  let r = acrescentarPonto([], -1, { x: 0, y: 0 });
  r = acrescentarPonto(r.caminhos, r.c, { x: 10, y: 0 });
  r = acrescentarPonto(r.caminhos, r.c, { x: 10, y: 10 });
  assert.equal(r.caminhos[0].pontos.length, 3);
  const f = fecharCaminho(r.caminhos, 0);
  assert.equal(f[0].fechado, true);
  const a = alcasDoUltimo(r.caminhos, 0, { x: 4, y: 2 });
  assert.deepEqual([a[0].pontos[2].eout, a[0].pontos[2].ein], [{ x: 4, y: 2 }, { x: -4, y: -2 }]);
  assert.equal(fecharCaminho(acrescentarPonto([], -1, { x: 0, y: 0 }).caminhos, 0)[0].fechado, false); // com 1 ponto não fecha
});

test("booleanos: união, subtração, interseção e exclusão de dois quadrados", () => {
  const tras = quadrado(0, 0, 100);
  const frente = quadrado(50, 50, 100);
  assert.ok(Math.abs(area(combinar("unir", frente, tras, "nonzero", "nonzero")) - 150 * 150) < 0.5);
  const sub = combinar("subtrair", frente, tras, "nonzero", "nonzero");
  assert.ok(Math.abs(area(sub) - 100 * 100) < 0.5); // a caixa continua 100×100, com um canto recortado
  assert.ok(sub[0].pontos.length >= 6); // forma em L
  const inter = combinar("interseccao", frente, tras, "nonzero", "nonzero");
  assert.ok(Math.abs(area(inter) - 50 * 50) < 0.5);
  const exc = combinar("excluir", frente, tras, "nonzero", "nonzero");
  assert.ok(exc.length >= 1 && Math.abs(area(exc) - 150 * 150) < 0.5);
});

test("contornos do opentype: quadrática vira cúbica e o contorno fecha sem ponto repetido", () => {
  const cs = caminhosDeComandos([
    { type: "M", x: 0, y: 0 },
    { type: "Q", x1: 50, y1: 0, x: 100, y: 100 },
    { type: "L", x: 0, y: 100 },
    { type: "L", x: 0, y: 0 },
    { type: "Z" },
  ]);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].pontos.length, 3); // o último L voltou ao início: ponto repetido removido
  const p = cs[0].pontos[0];
  assert.ok(p.eout && Math.abs(p.eout.x - (2 / 3) * 50) < 1e-9);
  assert.equal(cs[0].fechado, true);
});

test("normalizar não conta como movimento para o texto guardado", () => {
  const texto = { id: "t", slide: "s", tipo: "texto", nome: "t", x: 50, y: 50, l: 100, a: 100, rot: 0, op: 100, oculto: false, travado: false, texto: "A", fonte: "display", peso: 800, tamanho: 80, cor: "#000", alinhar: "left", entrelinha: 1 } as const;
  const v: NoVetor = { ...base(quadrado(0, 0, 40)), original: { texto, x: 100, y: 100 } };
  const mexido = { ...v, caminhos: quadrado(-30, -20, 70) }; // o desenho cresceu para cima e para a esquerda
  const n = normalizarVetor(mexido);
  assert.deepEqual([n.x, n.y], [70, 80]);
  assert.deepEqual([n.original!.x, n.original!.y], [70, 80]); // continua "sem movimento": n.x − original.x = 0
});
