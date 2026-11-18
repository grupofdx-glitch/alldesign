/// <reference path="../node_modules/paper/dist/paper.d.ts" />
// O pacote só declara o namespace global `paper`; aqui ligamos a importação do build "core" (sem PaperScript) a ele.
declare module "paper/dist/paper-core.js" {
  const p: typeof paper;
  export default p;
}
