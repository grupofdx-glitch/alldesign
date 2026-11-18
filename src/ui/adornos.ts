// Encaixes do Painel para quem usa o editor como base: sozinho, o AllDesign não põe nada aqui. Quem estende o
// editor (por exemplo, uma linha do tempo) pode pôr um controle na frente de cada efeito do catálogo (motor/efeitos.ts).
import type { ReactNode } from "react";
import type { No } from "../motor/modelo.ts";

export const adornos: { efeito: ((efeito: string, n: No) => ReactNode) | null } = { efeito: null };
