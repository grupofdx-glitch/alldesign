// Nome de arquivo seguro a partir do nome do documento (sem acento, minúsculo, hifens). Usado pelo editor e pelo CLI.
export const nomeSeguro = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "design";
