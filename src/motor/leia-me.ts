// O LEIA-ME que vai dentro de todo pacote .alldesign: o formato explicado para qualquer pessoa ou IA ler e editar o
// documento sem o editor. Gerado aqui (e não copiado de um arquivo) para estar sempre de acordo com o código.
export const LEIA_ME = `# Pacote .alldesign (AllDesign)

Este pacote é um design do AllDesign: um carrossel, post ou story feito de slides e camadas.
Tudo o que define o design está em \`documento.json\`, em texto, para qualquer pessoa ou IA ler e editar.

## O que tem aqui

| Caminho | O que é |
|---|---|
| \`documento.json\` | O design inteiro: slides, camadas, textos, cores, posições, efeitos. **É a fonte da verdade.** |
| \`imagens/\` | As imagens usadas pelas camadas de imagem. O nome do arquivo (sem extensão) é a chave citada no JSON. |
| \`previas/slide-01.png\`… | Como cada slide ficou da última vez que o pacote foi gravado pelo editor ou pelo \`bin/design\`. Só para ver: o editor não lê isto. |
| \`previas/indice.json\` | Qual slide é cada prévia e a assinatura do \`documento.json\` de quando elas foram feitas. |
| \`LEIA-ME.md\` | Este guia. |

O pacote pode estar como **pasta** (no disco; no macOS o Finder mostra como um arquivo só, como um \`.app\`) ou como **um arquivo
ZIP** com o mesmo conteúdo (para baixar, mandar e anexar). O editor e o \`bin/design\` abrem os dois.

**Prévias podem estar velhas.** Se você editar o \`documento.json\` direto, as prévias continuam mostrando o design
antigo até alguém gravar o pacote de novo (\`bin/design previas <pacote>\`, ou abrir e salvar no editor). Compare a
\`assinatura\` em \`previas/indice.json\` com a do documento atual para saber.

## Como editar sem quebrar

1. Edite o \`documento.json\` e mantenha-o JSON válido.
2. Todo \`id\` é único no documento. Para criar uma camada ou um slide novo, invente um id novo (letras e números).
3. Toda camada aponta para um slide existente (\`slide\` = \`id\` do slide).
4. A ordem de \`nos\` é a pilha: o último fica na frente.
5. Para pôr uma imagem: copie o arquivo para \`imagens/<chave>.png\` (ou .jpg, .webp) e crie uma camada
   \`"tipo": "imagem"\` com \`"hash": "<chave>"\`. A chave pode ser qualquer nome simples; o editor a troca pelo código
   do conteúdo quando gravar.
6. Cores em \`#rrggbb\`. Opacidade (\`op\`) de 0 a 100.
7. Para automatizar (scripts ou agentes de IA): prefira \`bin/design aplicar\` — os mesmos comandos do editor, validados, e as
   prévias refeitas no fim.

## documento.json

\`\`\`
{
  "versao": 1,
  "nome": "título do documento",
  "kit": "escuro" | "claro" | "editorial",   (opcional: kit de estilo, cores e fontes sugeridas)
  "formato": { "l": 1080, "a": 1350 },        (largura e altura de cada slide, em px)
  "continuo": true,                            (slides grudados; false = separados, como stories)
  "slides": [ Slide… ],                        (na ordem de leitura, que é a ordem de exportação)
  "nos": [ Camada… ],                          (todas as camadas de todos os slides; a ordem é a pilha)
  "guias": [ { "eixo": "v" | "h", "pos": px, "slide": "<id do slide>" } ]
}
\`\`\`

**Slide**: \`{ "id", "nome", "fundo": "#rrggbb" ou null (transparente), "grade": { "c": coluna, "l": linha } }\`.
Os slides ficam numa grade: o carrossel é uma linha (\`l\` = 0, \`c\` = 0, 1, 2…); um feed tem várias linhas. Com
\`continuo\`, slides vizinhos se tocam e uma camada pode passar de um para o outro.

**Camada** (campos comuns): \`id\`, \`slide\`, \`nome\`, \`tipo\`, \`x\`, \`y\` (canto de cima à esquerda, em px do slide),
\`l\`, \`a\` (largura e altura), \`rot\` (graus, em torno do centro), \`op\` (0–100), \`oculto\`, \`travado\` e, opcional,
\`fx\` (efeitos). Pode ter \`x\` negativo ou passar da borda do slide.

| \`tipo\` | Campos próprios |
|---|---|
| \`texto\` | \`texto\` (\\n quebra a linha), \`fonte\` (display, ui, raleway, garamond, cinzel, mono), \`peso\` (400–800), \`tamanho\` (px), \`cor\`, \`alinhar\` (left, center, right), \`entrelinha\` (ex.: 1.1); opcionais \`espacamento\` (espaço entre letras, em "em", como o letter-spacing do CSS), \`italico\` (só garamond) e \`degrade\` { paradas: [{ pos 0–1, cor, op? }], de, ate } (vertical, refeito em cada linha, de/ate em "em" a partir da linha de base; negativo = acima; quando existe, substitui \`cor\`). A altura \`a\` é recalculada pelo editor ao abrir. |
| \`retangulo\` | \`cor\`, \`raio\` (cantos arredondados, px); opcionais \`opCor\` (opacidade só do preenchimento, 0–100), \`borda\` { cor, largura (px, por dentro da caixa), op? } e \`gradiente\` { tipo: "linear" \\| "radial", angulo (como no CSS: 180 = de cima para baixo), paradas: [{ pos, cor, op? }] } (radial = elipse que toca os lados da caixa) |
| \`imagem\` | \`hash\` (chave do arquivo em \`imagens/\`), opcionais \`ajustes\` { brilho, contraste, saturacao: −100 a 100 } e \`edicao\` { pintura, mascara: chaves de imagens } (edição de pixels feita no editor) |
| \`vetor\` | \`caminhos\`: [{ \`pontos\`: [{ x, y, ein?, eout?, suave? }], \`fechado\` }] em coordenadas da caixa (0,0 = canto); \`ein\`/\`eout\` são as alças da curva, relativas ao ponto; \`cor\` (preenchimento ou null), \`traco\` ({ cor, largura } ou null), \`regra\` (evenodd faz furos, nonzero não) |

**Efeitos** (\`fx\`, opcional):
- \`sombra\`: { x, y, raio, cor, op }
- \`vidro\`: { raio } — desfoca o que está atrás da camada, dentro da forma dela (vidro fosco; só retângulo no painel)
- \`desfoque\`: { modo: "camada" | "area" | "progressivo", raio (px), area: { x, y, l, a (frações de 0 a 1 da caixa), forma:
  "retangulo" | "elipse", suave (px) }, prog: { dir: "baixo" | "cima" | "direita" | "esquerda", ini, fim (frações),
  firmes? } }

Uma imagem não vista pelo editor pode demorar a carregar; textos com fonte que não existe caem numa fonte de reserva.
`;
