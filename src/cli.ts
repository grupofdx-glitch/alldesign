// CLI do AllDesign para quem prefere a linha de comando ou automatiza (scripts, agentes de IA). Usa os mesmos comandos (motor/comandos.ts) que o mouse e o painel
// usam, então o resultado abre no editor como se a pessoa tivesse feito. Saída sempre em JSON.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { LARGURA_DAS_PREVIAS, arquivosDoPacote, lerArquivosDoPacote, type MidiaBruta, type Previa } from "./motor/arquivo.ts";
import { ehPasta, gravarNoDisco, lerDoDisco } from "./pacote.ts";
import { aplicar, comandos } from "./motor/comandos.ts";
import { KITS, IDS_DE_KIT, paletaDoKit } from "./motor/kits.ts";
import { type DadosDoModelo, MODELOS, type ModeloId, criarDocumento } from "./motor/modelos.ts";
import { type NoImagem, type Documento, novoId } from "./motor/modelo.ts";
import { nomeSeguro } from "./motor/nomes.ts";
import { ErroDeExportacao, exportarDocumento } from "./exportar-headless.ts";

export const PASTA_DE_ENTRADA = process.env.ALLDESIGN_ENTRADA || join(homedir(), ".alldesign", "entrada");
const URL_DO_EDITOR = process.env.ALLDESIGN_URL || "http://127.0.0.1:4760";

class ErroDeUso extends Error {}

function opcoes(args: string[]): { pos: string[]; op: Record<string, string[]> } {
  const pos: string[] = [];
  const op: Record<string, string[]> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const nome = a.slice(2);
      const v = args[i + 1] !== undefined && !args[i + 1].startsWith("--") ? args[++i] : "true";
      (op[nome] ??= []).push(v);
    } else pos.push(a);
  }
  return { pos, op };
}
const um = (op: Record<string, string[]>, k: string) => op[k]?.[op[k].length - 1];

function caminhoDoArquivo(arg: string): string {
  const nome = arg.endsWith(".alldesign") ? arg : `${arg}.alldesign`;
  const direto = resolve(nome);
  if (existsSync(direto)) return direto;
  const naEntrada = join(PASTA_DE_ENTRADA, basename(nome));
  if (existsSync(naEntrada)) return naEntrada;
  throw new ErroDeUso(`Arquivo não encontrado: ${arg} (procurei em ${direto} e em ${naEntrada})`);
}
// O pacote é gravado inteiro ao lado e trocado no fim (pacote.ts): o editor nunca lê um pacote pela metade.
const lerPacote = (caminho: string) => lerArquivosDoPacote(lerDoDisco(caminho));
const urlDe = (arquivo: string) => `${URL_DO_EDITOR}/?abrir=${encodeURIComponent(basename(arquivo))}`;
const resumo = (d: Documento) => ({
  nome: d.nome, kit: d.kit ?? null, formato: d.formato,
  slides: d.slides.map((s, i) => ({ n: i + 1, id: s.id, nome: s.nome, fundo: s.fundo, camadas: d.nos.filter((x) => x.slide === s.id).length })),
  camadas: d.nos.length, imagens: d.nos.filter((n) => n.tipo === "imagem").length,
});

const AJUDA = `AllDesign — linha de comando. Saída em JSON.

  bin/design kits                      kits de estilo (cores e fontes)
  bin/design modelos                   modelos de peça e os dados que aceitam
  bin/design comandos                  ids dos comandos do editor (os mesmos do mouse)
  bin/design novo --modelo carrossel --kit escuro --titulo "…" [--subtitulo "…"] [--tema "…"]
                  [--ponto "Título|Texto" …] [--chamada "…"] [--dados dados.json] [--saida nome]
                  [--zip] [--sem-previas]
                                       cria um pacote .alldesign na pasta de entrada do editor (uma pasta; --zip: um arquivo só),
                                       com as prévias dos slides em previas/ (uns 10 s; --sem-previas pula), e devolve a URL
  bin/design info <arquivo>            resumo do documento (slides, camadas, ids)
  bin/design aplicar <arquivo> --json '[{"id":"no.atualizar","params":{…}}]' | --arquivo cmds.json [--saida nome] [--sem-previas]
                                       aplica comandos em ordem (tudo ou nada), regrava o pacote e refaz as prévias
  bin/design previas <arquivo>         refaz as prévias (previas/slide-NN.png) — depois de editar o documento.json à mão
  bin/design abrir <arquivo>           devolve a URL que abre o arquivo no editor (url)
  bin/design exportar <arquivo> [--formato png|jpg|webp|svg] [--escala 1|2] [--slide N …] [--saida pasta]
                                       exporta os slides SEM abrir o editor (Chrome headless + o mesmo renderizador da tela);
                                       padrão: png 1x, todos os slides, em ~/.alldesign/saida/<nome>/. Leva uns 10 s.

O pacote: documento.json (o design, legível e editável), imagens/, previas/ e LEIA-ME.md (o formato explicado).
Pasta de entrada: ${PASTA_DE_ENTRADA} (mude com ALLDESIGN_ENTRADA). Editor: ${URL_DO_EDITOR}.
Extra em "aplicar": {"id":"imagem.adicionar","params":{"arquivo":"/caminho.png","slide":1,"x":0,"y":0,"l":1080}}  (slide por número ou id).
`;

function dadosDoNovo(op: Record<string, string[]>): DadosDoModelo {
  let dados: DadosDoModelo = { titulo: "" };
  if (um(op, "dados")) dados = JSON.parse(readFileSync(resolve(um(op, "dados")!), "utf8"));
  if (um(op, "titulo")) dados.titulo = um(op, "titulo")!;
  if (um(op, "subtitulo")) dados.subtitulo = um(op, "subtitulo");
  if (um(op, "tema")) dados.tema = um(op, "tema");
  if (um(op, "chamada")) dados.chamada = um(op, "chamada");
  if (op.ponto) dados.pontos = op.ponto.map((p) => {
    const [titulo, ...resto] = p.split("|");
    return { titulo: titulo.trim(), texto: resto.join("|").trim() };
  });
  if (!dados.titulo?.trim()) throw new ErroDeUso("Falta o título (--titulo ou \"titulo\" no --dados).");
  return dados;
}

function adicionarImagem(doc: Documento, imagens: Map<string, MidiaBruta>, p: Record<string, unknown>) {
  const arq = String(p.arquivo ?? "");
  if (!existsSync(arq)) throw new ErroDeUso(`imagem.adicionar: arquivo não encontrado: ${arq}`);
  const ext = extname(arq).slice(1).toLowerCase();
  const mime = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[ext];
  if (!mime) throw new ErroDeUso("imagem.adicionar: só PNG, JPG, WebP ou GIF.");
  const bytes = new Uint8Array(readFileSync(arq));
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  imagens.set(hash, { bytes, mime });
  const s = typeof p.slide === "number" ? doc.slides[p.slide - 1] : doc.slides.find((x) => x.id === p.slide) ?? doc.slides[Number(p.slide) - 1];
  if (!s) throw new ErroDeUso(`imagem.adicionar: slide inexistente: ${String(p.slide)}`);
  const l = Number(p.l ?? doc.formato.l);
  const a = Number(p.a ?? Math.round(l * 0.75));
  const no: NoImagem = { id: novoId(), slide: s.id, tipo: "imagem", nome: String(p.nome ?? basename(arq, extname(arq))), hash, x: Number(p.x ?? 0), y: Number(p.y ?? 0), l, a, rot: 0, op: 100, oculto: false, travado: false };
  return aplicar(doc, "no.criar", { no });
}

export function executar(argv: string[]): unknown {
  const [cmd, ...resto] = argv;
  const { pos, op } = opcoes(resto);
  switch (cmd) {
    case undefined:
    case "ajuda":
    case "--help":
      return { ajuda: AJUDA };
    case "kits":
      return IDS_DE_KIT.map((id) => ({ id, nome: KITS[id].nome, nota: KITS[id].nota ?? null, fontes: KITS[id].fontes, cores: paletaDoKit(id), papeis: KITS[id].papeis }));
    case "modelos":
      return Object.entries(MODELOS).map(([id, m]) => ({ id, ...m, dados: id === "carrossel" ? { titulo: "obrigatório", subtitulo: "opcional", tema: "opcional", pontos: "[{titulo, texto}] — um slide por ponto", chamada: "opcional" } : { titulo: "obrigatório", subtitulo: "opcional", tema: "opcional" } }));
    case "comandos":
      return { comandos: Object.keys(comandos), extra: ["imagem.adicionar"], dica: "no.atualizar {id, mudancas}, no.criar {no}, slide.criar {nome, fundo, de, lado: direita|abaixo} (grudado ao slide `de`), documento.continuo {valor}, no.apagar {id}…; use `info` para os ids." };
    case "novo": {
      const modelo = (um(op, "modelo") ?? "carrossel") as ModeloId;
      const kit = (um(op, "kit") ?? "escuro") as (typeof IDS_DE_KIT)[number];
      if (!(modelo in MODELOS)) throw new ErroDeUso(`Modelo desconhecido: ${modelo}. Use: ${Object.keys(MODELOS).join(", ")}.`);
      if (!IDS_DE_KIT.includes(kit)) throw new ErroDeUso(`Kit desconhecido: ${kit}. Use: ${IDS_DE_KIT.join(", ")}.`);
      const doc = criarDocumento(modelo, kit, dadosDoNovo(op));
      const nome = `${nomeSeguro(um(op, "saida") ?? doc.nome)}.alldesign`;
      const destino = um(op, "saida")?.includes("/") ? resolve(um(op, "saida")!.endsWith(".alldesign") ? um(op, "saida")! : `${um(op, "saida")}.alldesign`) : join(PASTA_DE_ENTRADA, nome);
      gravarNoDisco(destino, arquivosDoPacote(doc, new Map()), !op.zip);
      return { arquivo: destino, url: urlDe(destino), nota_do_kit: KITS[kit].nota ?? undefined, ...resumo(doc) };
    }
    case "info": {
      const f = caminhoDoArquivo(pos[0] ?? "");
      return { arquivo: f, forma: ehPasta(f) ? "pasta" : "zip", url: urlDe(f), ...resumo(lerPacote(f).doc) };
    }
    case "abrir": {
      const f = caminhoDoArquivo(pos[0] ?? "");
      return { url: urlDe(f) };
    }
    case "aplicar": {
      const f = caminhoDoArquivo(pos[0] ?? "");
      const bruto = um(op, "json") ?? (um(op, "arquivo") ? readFileSync(resolve(um(op, "arquivo")!), "utf8") : null);
      if (!bruto) throw new ErroDeUso("Falta --json '[...]' ou --arquivo comandos.json.");
      const lista = JSON.parse(bruto) as { id: string; params?: Record<string, unknown> }[];
      if (!Array.isArray(lista)) throw new ErroDeUso("Os comandos precisam ser uma lista: [{\"id\":\"…\",\"params\":{…}}].");
      let { doc, imagens } = lerPacote(f);
      lista.forEach((c, i) => {
        try {
          doc = c.id === "imagem.adicionar" ? adicionarImagem(doc, imagens, c.params ?? {}) : aplicar(doc, c.id, c.params ?? {});
        } catch (e) {
          throw new ErroDeUso(`Comando ${i + 1} (${c.id}) falhou: ${e instanceof Error ? e.message : String(e)}. Nada foi gravado.`);
        }
      });
      const destino = um(op, "saida") ? join(PASTA_DE_ENTRADA, `${nomeSeguro(um(op, "saida")!)}.alldesign`) : f;
      // mantém a forma do pacote de origem (pasta ou ZIP); as prévias antigas saem e são refeitas no fim
      gravarNoDisco(destino, arquivosDoPacote(doc, imagens), destino === f ? ehPasta(f) : !op.zip);
      return { arquivo: destino, url: urlDe(destino), aplicados: lista.length, ...resumo(doc) };
    }
    default:
      throw new ErroDeUso(`Comando desconhecido: ${cmd}. Use \`bin/design ajuda\`.`);
  }
}

/**
 * Refaz as prévias do pacote: exporta cada slide em PNG pela metade (540 px de largura, o mesmo renderizador do editor,
 * via Chrome sem tela) e regrava o pacote com elas, na mesma forma (pasta ou ZIP).
 */
export async function refazerPrevias(arquivo: string): Promise<{ arquivos: string[] }> {
  const temp = mkdtempSync(join(tmpdir(), "alldesign-previas-"));
  try {
    const { doc, imagens } = lerPacote(arquivo);
    const r = await exportarDocumento(arquivo, { formato: "png", escala: LARGURA_DAS_PREVIAS / doc.formato.l, saida: temp });
    const previas: Previa[] = r.arquivos.map((a) => ({ slide: doc.slides[a.slide - 1].id, bytes: new Uint8Array(readFileSync(a.arquivo)) }));
    const arquivos = arquivosDoPacote(doc, imagens, previas);
    gravarNoDisco(arquivo, arquivos, ehPasta(arquivo));
    return { arquivos: Object.keys(arquivos).filter((c) => c.startsWith("previas/") && c.endsWith(".png")) };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// `exportar` e `previas` são assíncronos (sobem servidor e Chrome); `novo` e `aplicar` gravam e depois refazem as
// prévias (a não ser com --sem-previas). Sem o Chrome, o pacote sai sem prévias e a resposta diz por quê.
export async function executarAsync(argv: string[]): Promise<unknown> {
  if (argv[0] === "previas") {
    const f = caminhoDoArquivo(opcoes(argv.slice(1)).pos[0] ?? "");
    return { arquivo: f, previas: (await refazerPrevias(f)).arquivos };
  }
  if (argv[0] === "novo" || argv[0] === "aplicar") {
    const r = executar(argv) as { arquivo: string };
    if (opcoes(argv.slice(1)).op["sem-previas"]) return r;
    try {
      return { ...r, previas: (await refazerPrevias(r.arquivo)).arquivos };
    } catch (e) {
      return { ...r, previas: [], previas_nao_feitas: e instanceof Error ? e.message : String(e) };
    }
  }
  if (argv[0] !== "exportar") return executar(argv);
  const { pos, op } = opcoes(argv.slice(1));
  const formato = (um(op, "formato") ?? "png") as "png" | "jpg" | "webp" | "svg";
  if (!["png", "jpg", "webp", "svg"].includes(formato)) throw new ErroDeUso(`Formato desconhecido: ${formato}. Use png, jpg, webp ou svg.`);
  const escala = Number(um(op, "escala") ?? 1);
  if (![1, 2].includes(escala)) throw new ErroDeUso("A escala precisa ser 1 ou 2.");
  const slides = (op.slide ?? []).map(Number);
  if (slides.some((n) => !Number.isInteger(n) || n < 1)) throw new ErroDeUso("--slide recebe números inteiros a partir de 1.");
  const f = caminhoDoArquivo(pos[0] ?? "");
  return exportarDocumento(f, { formato, escala, saida: um(op, "saida"), slides });
}

// só roda quando chamado como programa (não quando os testes importam `executar`)
if (process.argv[1] && /cli\.ts$/.test(process.argv[1])) {
  try {
    const r = (await executarAsync(process.argv.slice(2))) as { ajuda?: string };
    if (r && typeof r === "object" && "ajuda" in r && r.ajuda) process.stdout.write(r.ajuda);
    else process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(JSON.stringify({ erro: msg }) + "\n");
    process.exit(e instanceof ErroDeUso ? 2 : e instanceof ErroDeExportacao ? 3 : 1);
  }
}

