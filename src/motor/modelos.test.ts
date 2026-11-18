import { strict as assert } from "node:assert";
import { test } from "node:test";
import { KITS } from "./kits.ts";
import { caixa } from "./geom.ts";
import { MODELOS, criarDocumento } from "./modelos.ts";

const dados = {
  titulo: "Sua mente está no piloto automático?",
  subtitulo: "Três sinais de que você decide sem perceber",
  tema: "Produtividade",
  pontos: [
    { titulo: "Você não lembra do caminho", texto: "Chega ao trabalho e não recorda nenhuma decisão do trajeto." },
    { titulo: "A rotina manda", texto: "Faz as mesmas coisas, na mesma ordem, sem perguntar por quê." },
    { titulo: "Reage em vez de escolher", texto: "A resposta sai antes do pensamento." },
  ],
  chamada: "Salve este post e envie para quem precisa ler.",
};

test("carrossel: capa + um slide por ponto + chamada, com as cores do kit", () => {
  for (const kit of ["escuro", "claro", "editorial"] as const) {
    const d = criarDocumento("carrossel", kit, dados);
    assert.equal(d.slides.length, 5);
    assert.equal(d.kit, kit);
    assert.deepEqual(d.formato, { l: 1080, a: 1350 });
    assert.equal(d.slides[0].fundo, KITS[kit].papeis.fundo);
    const cores = new Set<string>([...Object.values(KITS[kit].papeis)]);
    for (const n of d.nos) {
      if (n.tipo === "imagem") continue;
      const cor = n.tipo === "vetor" ? n.cor ?? n.traco?.cor ?? "" : n.cor;
      assert.ok(cores.has(cor), `${n.nome} usa cor fora do kit: ${cor}`);
    }
    const fontes = new Set(Object.values(KITS[kit].fontes));
    for (const n of d.nos) if (n.tipo === "texto") assert.ok(fontes.has(n.fonte), `${n.nome} usa fonte fora do kit`);
  }
});

test("tudo cabe no slide (estimativa) e nada nasce fora das bordas", () => {
  for (const m of Object.keys(MODELOS) as (keyof typeof MODELOS)[]) {
    for (const kit of ["escuro", "claro", "editorial"] as const) {
    const d = criarDocumento(m, kit, dados);
    for (const n of d.nos) {
      const b = caixa(n);
      assert.ok(b.x0 >= -0.5 && b.x1 <= d.formato.l + 0.5, `${m}/${n.nome} estoura na largura`);
      assert.ok(b.y0 >= -0.5 && b.y1 <= d.formato.a + 0.5, `${kit}/${m}/${n.nome} estoura na altura (${b.y1} > ${d.formato.a})`);
    }
  }
  }
});

test("texto longo encolhe o título em vez de estourar", () => {
  const longo = criarDocumento("carrossel", "editorial", { ...dados, titulo: "Uma frase muito longa que normalmente não caberia na capa do carrossel em cinco linhas com o tamanho padrão do título" });
  const t = longo.nos.find((n) => n.tipo === "texto" && n.nome === "Título" && n.slide === longo.slides[0].id);
  assert.ok(t && t.tipo === "texto" && t.tamanho < 112);
});

test("sem pontos: capa e chamada; um só ponto: três slides", () => {
  assert.equal(criarDocumento("carrossel", "escuro", { titulo: "x" }).slides.length, 2);
  assert.equal(criarDocumento("carrossel", "escuro", { titulo: "x", pontos: [{ titulo: "a", texto: "b" }] }).slides.length, 3);
});

test("post e story têm um slide e o formato certo", () => {
  const p = criarDocumento("post", "editorial", { titulo: "Olá" });
  const s = criarDocumento("story", "editorial", { titulo: "Olá" });
  assert.deepEqual([p.slides.length, p.formato.a], [1, 1080]);
  assert.deepEqual([s.slides.length, s.formato.a], [1, 1920]);
});

test("cada kit usa as fontes dele nos títulos do post e do story", () => {
  for (const kit of ["escuro", "claro", "editorial"] as const) {
    for (const m of ["post", "story"] as const) {
      const d = criarDocumento(m, kit, { ...dados, titulo: "Um título razoavelmente longo para testar o encaixe da fonte" });
      const t = d.nos.find((n) => n.tipo === "texto" && (n.nome === "Título" || n.nome === "Frase"));
      assert.ok(t && t.tipo === "texto" && t.fonte === KITS[kit].fontes.titulo);
    }
  }
});

test("kit claro: fundo claro, texto escuro e fundo claro como texto sobre o slide de destaque", () => {
  const d = criarDocumento("carrossel", "claro", dados);
  const p = KITS.claro.papeis;
  assert.equal(d.slides[0].fundo, p.fundo);
  const titulo = d.nos.find((n) => n.tipo === "texto" && n.nome === "Título" && n.slide === d.slides[0].id);
  assert.equal(titulo?.tipo === "texto" && titulo.cor, p.texto);
  const ultimo = d.slides[d.slides.length - 1];
  assert.equal(ultimo.fundo, p.profundo);
  const chamada = d.nos.find((n) => n.tipo === "texto" && n.nome === "Chamada");
  assert.equal(chamada?.tipo === "texto" && chamada.cor, p.fundo); // legível sobre o slide escuro
});
