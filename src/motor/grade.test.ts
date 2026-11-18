import { strict as assert } from "node:assert";
import { test } from "node:test";
import { aplicar } from "./comandos.ts";
import { documentoNovo, type Documento, type NoRetangulo } from "./modelo.ts";
import { origemDoSlide, slideSob } from "./grade.ts";
import { nosQueAparecemNoSlide } from "./render.ts";

const retangulo = (slide: string, id: string, x: number, l: number): NoRetangulo => ({
  id, slide, nome: id, tipo: "retangulo", x, y: 100, l, a: 100, rot: 0, op: 100, oculto: false, travado: false, cor: "#fff", raio: 0,
});
const grade = (d: Documento) => d.slides.map((s) => `${s.id}:${s.grade!.c},${s.grade!.l}`).join(" ");

// carrossel A B C numa linha
function linha(): Documento {
  let d = documentoNovo();
  d = { ...d, slides: [{ ...d.slides[0], id: "A" }] };
  d = aplicar(d, "slide.criar", { id: "B" });
  return aplicar(d, "slide.criar", { id: "C" });
}

test("slides novos ficam grudados: origem sem espaço no contínuo, com espaço quando separados", () => {
  const d = linha();
  assert.equal(grade(d), "A:0,0 B:1,0 C:2,0");
  assert.deepEqual(origemDoSlide(d, 2), { x: 2160, y: 0 });
  assert.deepEqual(origemDoSlide({ ...d, continuo: false }, 2), { x: 2 * (1080 + 120), y: 0 });
});

test("+ à direita entra colado e empurra os de depois; + embaixo abre uma linha nova", () => {
  let d = aplicar(linha(), "slide.criar", { id: "X", de: "A", lado: "direita" });
  assert.equal(grade(d), "A:0,0 X:1,0 B:2,0 C:3,0");
  d = aplicar(d, "slide.criar", { id: "Y", de: "A", lado: "abaixo" });
  d = aplicar(d, "slide.criar", { id: "Z", de: "Y", lado: "direita" });
  assert.equal(grade(d), "A:0,0 X:1,0 B:2,0 C:3,0 Y:0,1 Z:1,1"); // ordem de leitura = ordem de exportação
  assert.deepEqual(origemDoSlide(d, d.slides.findIndex((s) => s.id === "Z")), { x: 1080, y: 1350 });
  assert.equal(d.slides[d.slides.length - 1].fundo, d.slides[0].fundo); // herda o fundo do vizinho
});

test("apagar fecha o buraco; reordenar troca os slides de célula", () => {
  let d = aplicar(linha(), "slide.apagar", { id: "B" });
  assert.equal(grade(d), "A:0,0 C:1,0");
  d = aplicar(linha(), "slide.ordem", { id: "C", antesDe: "A" });
  assert.equal(grade(d), "C:0,0 A:1,0 B:2,0");
});

test("documento antigo (sem grade) continua uma linha e ganha grade na primeira mudança", () => {
  const velho = linha();
  const semGrade: Documento = { ...velho, slides: velho.slides.map(({ grade: _g, ...s }) => s), continuo: undefined };
  assert.deepEqual(origemDoSlide(semGrade, 1), { x: 1080, y: 0 });
  const d = aplicar(semGrade, "slide.criar", { id: "D", de: "B", lado: "direita" });
  assert.equal(grade(d), "A:0,0 B:1,0 D:2,0 C:3,0");
});

test("contínuo: o objeto que passa da borda aparece no vizinho, deslocado; separado, não", () => {
  let d = linha();
  d = aplicar(d, "no.criar", { no: retangulo("A", "faixa", 900, 400) }); // vai de 900 a 1300: invade B
  d = aplicar(d, "no.criar", { no: retangulo("A", "dentro", 100, 100) });
  const emB = nosQueAparecemNoSlide(d, d.slides[1]);
  assert.deepEqual(emB.map((x) => [x.n.id, x.dx, x.dy]), [["faixa", -1080, 0]]);
  assert.equal(nosQueAparecemNoSlide(d, d.slides[2]).length, 0);
  assert.equal(nosQueAparecemNoSlide({ ...d, continuo: false }, d.slides[1]).length, 0);
  assert.equal(slideSob(d, 1100, 150), 1);
});
