# Contribuindo com o AllDesign

Obrigado por querer ajudar! Qualquer contribuição conta: código, testes, documentação, tradução, ideias e relatos de bugs.

## Antes de começar

- **Bug ou ideia?** Abra uma issue descrevendo o que aconteceu (ou o que você quer), os passos para reproduzir e, se der, uma captura de tela.
- **Quer pegar uma tarefa?** Procure issues com a etiqueta `good first issue` ou comente na issue dizendo que vai trabalhar nela, para não duplicarmos esforço.
- **Mudança grande?** Abra uma issue antes e converse. Assim você não gasta tempo num PR que não combina com o rumo do projeto.

## Preparando o ambiente

Precisa de Node.js 22.6 ou mais novo.

```sh
git clone https://github.com/grupofdx-glitch/alldesign.git
cd alldesign
npm install
npm run dev        # http://127.0.0.1:4760
```

Comandos úteis:

```sh
npm run typecheck  # checagem de tipos (TypeScript)
npm test           # testes
npm run build      # build de produção
```

Os testes de exportação e de renderização usam o Google Chrome ou o Chromium instalado. Sem ele, esses testes são pulados;
se o Chrome estiver num lugar incomum, aponte o executável com `ALLDESIGN_CHROME`.

## Como o código é organizado

| Pasta | O que tem |
|---|---|
| `src/motor/` | O motor, sem interface: modelo do documento, comandos, renderização, vetores, imagem, efeitos, kits e modelos |
| `src/ui/` | A interface em React |
| `src/cli.ts` | A linha de comando (`bin/design`) |
| `src/exportar-headless.ts` | Exportação sem abrir o editor |

Regras que mantêm o projeto simples:

- **Toda mudança no documento passa por um comando** (`src/motor/comandos.ts`). O mouse, o painel e a CLI usam os mesmos comandos. Não altere o documento por outro caminho.
- **O documento é imutável.** Cada comando devolve um documento novo.
- **O motor não depende da interface.** Código em `src/motor/` não importa React nem o DOM, para continuar rodando na CLI e nos testes.

### Receitas rápidas

- **Novo kit de estilo:** acrescente uma entrada em `KITS` (`src/motor/kits.ts`) e o id em `KitId`. Use só fontes já listadas em `src/motor/familias.ts`.
- **Nova fonte:** adicione o pacote `@fontsource/...`, uma entrada em `src/motor/familias.ts` e a mesma fonte em `scripts/fontes.mjs` (o script confere se os dois estão de acordo).
- **Novo efeito:** uma entrada em `src/motor/efeitos.ts`, com o valor padrão. O painel monta os controles a partir do catálogo.
- **Novo modelo de peça:** `src/motor/modelos.ts`.

## Enviando um pull request

1. Faça um fork e crie uma branch a partir de `main` (por exemplo, `fix/zoom-negativo` ou `feat/kit-pastel`).
2. Faça mudanças pequenas e focadas: um PR, um assunto.
3. **Escreva ou ajuste testes.** Um bug corrigido sem teste pode voltar. Os testes ficam ao lado do código (`*.test.ts`).
4. Rode `npm run typecheck` e `npm test`. Os dois precisam passar.
5. Abra o PR explicando o que mudou e por quê. Para mudanças visuais, anexe antes e depois.

Mensagens de commit: uma linha curta no imperativo ("Corrige o zoom negativo ao esconder o editor"), e um parágrafo se precisar explicar o motivo.

## Idioma

Hoje a interface e os comentários estão em português. Pode escrever issues e PRs em português ou em inglês. Contribuições para
traduzir a interface (por exemplo, extrair os textos para um arquivo de idiomas) são muito bem-vindas.

## Segurança e licença

- Nunca envie chaves, senhas ou tokens, nem em exemplos ou testes.
- Para relatar uma vulnerabilidade, **não abra uma issue pública**: use a aba *Security* do repositório (*Report a vulnerability*).
- Ao contribuir, você concorda que seu código será distribuído sob a licença [MIT](LICENSE) do projeto.

## Conduta

Seja respeitoso e paciente. Críticas são sobre o código, não sobre as pessoas. Quem estiver começando é bem-vindo para perguntar.
