import type { CSSProperties } from "react";

/**
 * Tokens do projeto de referência das ofertas (HSL do index.css original),
 * aplicados apenas no escopo das páginas de upsell para não afetar o resto
 * do site.
 */
export const upsellTokens = {
  "--background": "hsl(0 0% 100%)",
  "--foreground": "hsl(222 47% 11%)",
  "--card": "hsl(0 0% 100%)",
  "--card-foreground": "hsl(222 47% 11%)",
  "--primary": "hsl(347 100% 62%)",
  "--primary-foreground": "hsl(0 0% 100%)",
  "--secondary": "hsl(210 40% 96%)",
  "--secondary-foreground": "hsl(222 47% 11%)",
  "--muted": "hsl(210 40% 96%)",
  "--muted-foreground": "hsl(215 16% 47%)",
  "--border": "hsl(214 32% 91%)",
} as CSSProperties;

/** shadow-card do projeto original: 0 8px 24px rgba(0,0,0,.08) */
export const shadowCard = "shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

export const PINK = "#ff3870";
