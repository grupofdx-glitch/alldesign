// Exportação sem abrir o editor: sobe o editor num servidor temporário, abre o documento num Chrome headless e exporta pelo
// mesmo renderizador da tela (o arquivo que sai é o mesmo que o editor geraria). Só Node; usado por `bin/design exportar`.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { zipDoDisco } from "./pacote.ts";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export class ErroDeExportacao extends Error {}

export function acharChrome(): string | null {
  const env = process.env.ALLDESIGN_CHROME;
  if (env && existsSync(env)) return env;
  const candidatos = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidatos.find((c) => existsSync(c)) ?? null;
}

function portaLivre(): Promise<number> {
  return new Promise((ok, erro) => {
    const s = createServer();
    s.once("error", erro);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperar(url: string, ms: number): Promise<Response> {
  const fim = Date.now() + ms;
  let ultimo = "";
  while (Date.now() < fim) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
    await dormir(150);
  }
  throw new ErroDeExportacao(`Não consegui falar com ${url} (${ultimo}).`);
}

// Cliente mínimo do protocolo do Chrome (DevTools) sobre WebSocket.
class Cdp {
  private ws: WebSocket;
  private id = 0;
  private pendentes = new Map<number, { ok: (v: any) => void; erro: (e: Error) => void }>();
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data));
      const p = m.id !== undefined ? this.pendentes.get(m.id) : undefined;
      if (!p) return;
      this.pendentes.delete(m.id);
      m.error ? p.erro(new Error(m.error.message)) : p.ok(m.result);
    });
  }
  static async conectar(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((ok, erro) => {
      ws.addEventListener("open", () => ok());
      ws.addEventListener("error", () => erro(new ErroDeExportacao("O Chrome não aceitou a conexão.")));
    });
    return new Cdp(ws);
  }
  enviar(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((ok, erro) => {
      this.pendentes.set(id, { ok, erro });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  // avalia no navegador e devolve o valor (a expressão pode ser uma promessa)
  async avaliar<T>(expressao: string): Promise<T> {
    const r = await this.enviar("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new ErroDeExportacao(`Erro no editor: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value as T;
  }
  fechar() {
    try { this.ws.close(); } catch { /* já fechado */ }
  }
}

export interface OpcoesDeExportacao {
  formato: "png" | "jpg" | "webp" | "svg";
  escala: number;
  saida?: string;
  slides?: number[]; // números a partir de 1; vazio = todos
}
export interface ResultadoDaExportacao {
  documento: string;
  formato: string;
  escala: number;
  arquivos: { slide: number; arquivo: string; bytes: number }[];
}

export async function exportarDocumento(arquivo: string, op: OpcoesDeExportacao): Promise<ResultadoDaExportacao> {
  const chrome = acharChrome();
  if (!chrome) throw new ErroDeExportacao("Chrome não encontrado. Instale o Google Chrome ou o Chromium, ou aponte ALLDESIGN_CHROME para o executável.");
  const temp = mkdtempSync(join(tmpdir(), "alldesign-exportar-"));
  const filhos: ChildProcess[] = [];
  let cdp: Cdp | null = null;
  try {
    const nome = basename(arquivo);
    mkdirSync(join(temp, "entrada"));
    writeFileSync(join(temp, "entrada", nome), zipDoDisco(arquivo)); // pasta ou ZIP: o editor recebe ZIP
    // as fontes do editor vêm de public/fontes (copiadas de node_modules)
    if (!existsSync(join(RAIZ, "public", "fontes", "geist-latin-400-normal.woff"))) {
      const r = spawnSync(process.execPath, [join(RAIZ, "scripts", "fontes.mjs")], { cwd: RAIZ, encoding: "utf8" });
      if (r.status !== 0) throw new ErroDeExportacao(`Faltam as fontes do editor: ${r.stderr || r.stdout}. Rode npm install e npm run fontes.`);
    }
    const portaVite = await portaLivre();
    const vite = spawn(process.execPath, [join(RAIZ, "node_modules", "vite", "bin", "vite.js"), "--port", String(portaVite), "--host", "127.0.0.1", "--strictPort"], {
      cwd: RAIZ, env: { ...process.env, ALLDESIGN_ENTRADA: join(temp, "entrada") }, stdio: "ignore",
    });
    filhos.push(vite);
    await esperar(`http://127.0.0.1:${portaVite}/entrada/`, 30000);

    const portaChrome = await portaLivre();
    const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${portaChrome}`, "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1400,900", `--user-data-dir=${join(temp, "chrome")}`, "about:blank"], { stdio: "ignore" });
    filhos.push(proc);
    const paginas = (await (await esperar(`http://127.0.0.1:${portaChrome}/json/list`, 20000)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const alvo = paginas.find((p) => p.type === "page");
    if (!alvo) throw new ErroDeExportacao("O Chrome não abriu nenhuma página.");
    cdp = await Cdp.conectar(alvo.webSocketDebuggerUrl);
    await cdp.enviar("Page.enable");
    await cdp.enviar("Page.navigate", { url: `http://127.0.0.1:${portaVite}/` });

    // espera o editor subir, abre o documento (o mesmo caminho do link ?abrir=) e devolve o que há para exportar
    const info = await cdp.avaliar<{ nome: string; slides: number; erro?: string }>(`(async () => {
      for (let i = 0; i < 300 && !(window.alldesign && window.alldesign.acoes); i++) await new Promise((r) => setTimeout(r, 100));
      if (!window.alldesign) return { nome: "", slides: 0, erro: "o editor não carregou" };
      await window.alldesign.acoes.abrirDaEntrada(${JSON.stringify(nome)});
      const d = window.alldesign.store.ler().doc;
      return { nome: d.nome, slides: d.slides.length, erro: d.nos.length || d.slides.length > 1 ? undefined : "o documento não abriu" };
    })()`);
    if (info.erro) throw new ErroDeExportacao(`Não consegui abrir o documento: ${info.erro}.`);
    const { nomeSeguro } = await import("./motor/nomes.ts");
    const base = nomeSeguro(info.nome);
    const pasta = resolve(op.saida ?? join(homedir(), ".alldesign", "saida", base));
    mkdirSync(pasta, { recursive: true });
    const lista = op.slides?.length ? op.slides : Array.from({ length: info.slides }, (_, i) => i + 1);
    const arquivos: ResultadoDaExportacao["arquivos"] = [];
    for (const n of lista) {
      if (n < 1 || n > info.slides) throw new ErroDeExportacao(`Slide ${n} não existe (o documento tem ${info.slides}).`);
      const b64 = await cdp.avaliar<string>(`(async () => {
        const K = window.alldesign; const d = K.store.ler().doc; const s = d.slides[${n - 1}];
        const dados = ${JSON.stringify(op.formato)} === "svg" ? new Blob([await K.svg.slideParaSvg(d, s)], { type: "image/svg+xml" }) : await K.render.exportarSlide(d, s, ${JSON.stringify(op.formato)}, ${op.escala});
        const bytes = new Uint8Array(await dados.arrayBuffer()); let bin = ""; const passo = 0x8000;
        for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo));
        return btoa(bin);
      })()`);
      const buf = Buffer.from(b64, "base64");
      const arq = join(pasta, `${base}-${String(n).padStart(2, "0")}.${op.formato}`);
      writeFileSync(arq, buf);
      arquivos.push({ slide: n, arquivo: arq, bytes: buf.length });
    }
    return { documento: info.nome, formato: op.formato, escala: op.escala, arquivos };
  } finally {
    cdp?.fechar();
    for (const f of filhos) f.kill("SIGKILL");
    await dormir(200);
    rmSync(temp, { recursive: true, force: true });
  }
}
