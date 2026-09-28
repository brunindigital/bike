/**
 * Parâmetros de rastreamento no lado do cliente.
 *
 * Os UTMs/src/sck são capturados por /js/utm.js (localStorage LV_UTM) e aqui
 * são lidos de volta para acompanhar TODA a jornada — checkout e upsells — até
 * a chamada de criação do PIX, que é quem envia a venda para a Utmify.
 */

const STORE = "LV_UTM";
const KEYS = [
  "src",
  "sck",
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "utm_content",
  "utm_term",
] as const;

export type Tracking = Partial<Record<(typeof KEYS)[number], string>>;

export interface FbData {
  fbp: string | null;
  fbc: string | null;
  url: string | null;
}

function fromStorage(): Tracking {
  try {
    const raw = localStorage.getItem(STORE);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function fromUrl(): Tracking {
  const out: Tracking = {};
  try {
    const q = new URLSearchParams(window.location.search);
    KEYS.forEach((k) => {
      const v = q.get(k);
      if (v) out[k] = String(v).slice(0, 600);
    });
  } catch {
    // ignora
  }
  return out;
}

/** UTMs do pedido: prioriza o que veio na URL atual, com fallback no storage. */
export function getTracking(): Tracking | null {
  if (typeof window === "undefined") return null;
  const merged = { ...fromStorage(), ...fromUrl() };
  // Persiste para as próximas etapas do funil.
  try {
    if (Object.keys(merged).length) localStorage.setItem(STORE, JSON.stringify(merged));
  } catch {
    // ignora
  }
  return Object.keys(merged).length ? merged : null;
}

function cookie(name: string): string {
  try {
    const m = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[2]) : "";
  } catch {
    return "";
  }
}

/** Dados de atribuição do Meta (_fbp/_fbc) para a API de Conversões. */
export function getFbData(): FbData | null {
  if (typeof window === "undefined") return null;
  let fbc = cookie("_fbc");
  if (!fbc) {
    try {
      const clid = localStorage.getItem("LV_FBCLID");
      if (clid) fbc = `fb.1.${Date.now()}.${clid}`;
    } catch {
      // ignora
    }
  }
  return {
    fbp: cookie("_fbp") || null,
    fbc: fbc || null,
    url: window.location.href.slice(0, 500),
  };
}

/** Acrescenta os parâmetros de rastreamento a um caminho interno. */
export function withTracking(path: string): string {
  if (typeof window === "undefined") return path;
  const t = getTracking();
  if (!t) return path;
  const [base, hash = ""] = path.split("#");
  const [p, existing = ""] = base.split("?");
  const q = new URLSearchParams(existing);
  Object.entries(t).forEach(([k, v]) => {
    if (v && !q.has(k)) q.set(k, v);
  });
  const qs = q.toString();
  return p + (qs ? `?${qs}` : "") + (hash ? `#${hash}` : "");
}

/** Navega para a próxima etapa do funil mantendo os parâmetros. */
export function goWithTracking(path: string) {
  const url = withTracking(path);
  try {
    if (window.top && window.top !== window) {
      window.top.location.assign(url);
      return;
    }
  } catch {
    // ignora
  }
  window.location.assign(url);
}
