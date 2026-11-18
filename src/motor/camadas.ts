// Utilitários de canvas compartilhados pelo renderizador e pela edição de imagem.

export const temFiltro = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;

export function novaCamada(l: number, a: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(l));
  c.height = Math.max(1, Math.ceil(a));
  return c;
}

// Desfoque gaussiano (raio em px do canvas). Raio grande é feito numa cópia reduzida: o resultado é o mesmo a olho
// (o desfoque já apagou os detalhes que a redução perderia) e custa uma fração. `borrarPequeno` devolve a cópia
// reduzida, para quem vai desenhá-la esticada de qualquer jeito; `borrar` devolve no tamanho da origem.
// Sem `ctx.filter` (Safari antigo) cai num desfoque de caixa em 3 passadas.
export const fatorDeReducao = (raio: number) => {
  const f = Math.min(8, raio / 4);
  return f < 1.5 ? 1 : f;
};
export function borrarPequeno(origem: HTMLCanvasElement, raio: number): HTMLCanvasElement {
  if (raio < 0.4) return origem;
  const f = fatorDeReducao(raio);
  if (f === 1) return borrarDireto(origem, raio);
  const w = Math.max(1, Math.round(origem.width / f));
  const h = Math.max(1, Math.round(origem.height / f));
  const pequena = novaCamada(w, h);
  const pc = pequena.getContext("2d")!;
  pc.imageSmoothingQuality = "high";
  pc.drawImage(origem, 0, 0, w, h);
  return borrarDireto(pequena, (raio * w) / origem.width);
}
export function borrar(origem: HTMLCanvasElement, raio: number): HTMLCanvasElement {
  const b = borrarPequeno(origem, raio);
  if (b === origem || b.width === origem.width) return b;
  const d = novaCamada(origem.width, origem.height);
  const dc = d.getContext("2d")!;
  dc.imageSmoothingQuality = "high";
  dc.drawImage(b, 0, 0, origem.width, origem.height);
  return d;
}
export function borrarDireto(origem: HTMLCanvasElement, raio: number): HTMLCanvasElement {
  const d = novaCamada(origem.width, origem.height);
  const c = d.getContext("2d")!;
  if (temFiltro) {
    c.filter = `blur(${raio}px)`;
    c.drawImage(origem, 0, 0);
    return d;
  }
  c.drawImage(origem, 0, 0);
  const img = c.getImageData(0, 0, d.width, d.height);
  const px = img.data;
  // ImageData vem com a cor separada do alfa: desfocar assim mistura o preto dos pixels vazios na cor (borda
  // cinza). Pré-multiplica pelo alfa, desfoca e desfaz.
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    px[i] *= a;
    px[i + 1] *= a;
    px[i + 2] *= a;
  }
  const r = Math.max(1, Math.round(raio / 1.7));
  for (let i = 0; i < 3; i++) {
    passada(px, d.width, d.height, r, true);
    passada(px, d.width, d.height, r, false);
  }
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a > 0) {
      const k = 255 / a;
      px[i] = Math.min(255, px[i] * k);
      px[i + 1] = Math.min(255, px[i + 1] * k);
      px[i + 2] = Math.min(255, px[i + 2] * k);
    }
  }
  c.putImageData(img, 0, 0);
  return d;
}
function passada(px: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean) {
  const n = horizontal ? w : h;
  const linhas = horizontal ? h : w;
  const passo = horizontal ? 4 : w * 4;
  const buf = new Float32Array(n * 4);
  for (let l = 0; l < linhas; l++) {
    const ini = horizontal ? l * w * 4 : l * 4;
    for (let c = 0; c < 4; c++) {
      let soma = 0;
      for (let k = -r; k <= r; k++) soma += px[ini + Math.min(n - 1, Math.max(0, k)) * passo + c];
      for (let i = 0; i < n; i++) {
        buf[i * 4 + c] = soma / (2 * r + 1);
        soma += px[ini + Math.min(n - 1, i + r + 1) * passo + c] - px[ini + Math.max(0, i - r) * passo + c];
      }
    }
    for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) px[ini + i * passo + c] = buf[i * 4 + c];
  }
}
