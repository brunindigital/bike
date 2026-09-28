/**
 * Meta Conversions API (server-side Purchase).
 *
 * O funil é PIX: o Purchase do pixel no navegador só sai se o lead ficar com a
 * página aberta até a aprovação. Aqui enviamos o mesmo evento direto do
 * servidor no instante do pagamento, usando o MESMO event_id do navegador para
 * que o Meta faça a deduplicação.
 */

const API_VERSION = "v21.0";

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

async function hashOrNull(value: unknown): Promise<string | undefined> {
  const v = norm(value);
  if (!v) return undefined;
  return sha256(v);
}

export type CapiPurchaseInput = {
  eventId: string;
  amountReais: number;
  paidAtIso: string;
  customer: {
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    document?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    fbp?: string | null;
    fbc?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  };
  eventSourceUrl?: string | null;
  contents?: Array<{ name?: string; quantity?: number; price?: number }> | null;
};

export async function sendMetaPurchase(
  input: CapiPurchaseInput,
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env["META_CAPI_ACCESS_TOKEN"];
  const pixelId = process.env["META_PIXEL_ID"] || "2442971489550167";
  if (!token) return { ok: false, error: "missing_token" };
  if (!(input.amountReais > 0)) return { ok: false, error: "invalid_amount" };

  const c = input.customer;
  const nameParts = norm(c.name).split(/\s+/).filter(Boolean);
  const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const phone = digits(c.phone);

  const userData: Record<string, unknown> = {
    em: await hashOrNull(c.email),
    ph: phone ? await sha256(phone.length <= 11 ? `55${phone}` : phone) : undefined,
    fn: nameParts.length ? await sha256(nameParts[0]) : undefined,
    ln: nameParts.length > 1 ? await sha256(nameParts[nameParts.length - 1]) : undefined,
    external_id: digits(c.document) ? await sha256(digits(c.document)) : undefined,
    ct: await hashOrNull(c.city),
    st: await hashOrNull(c.state),
    zp: digits(c.zip) ? await sha256(digits(c.zip)) : undefined,
    country: await sha256("br"),
    client_ip_address: c.ip || undefined,
    client_user_agent: c.userAgent || undefined,
    fbp: c.fbp || undefined,
    fbc: c.fbc || undefined,
  };
  for (const key of Object.keys(userData)) {
    if (userData[key] === undefined) delete userData[key];
  }

  const eventTime = Math.floor(new Date(input.paidAtIso).getTime() / 1000) || Math.floor(Date.now() / 1000);
  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.eventSourceUrl || undefined,
        user_data: userData,
        custom_data: {
          currency: "BRL",
          value: Number(input.amountReais.toFixed(2)),
          contents: (input.contents || []).map((item) => ({
            id: item.name || "kit-panela",
            quantity: item.quantity || 1,
            item_price: Number(item.price) || undefined,
          })),
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error("Meta CAPI failed", res.status, text.slice(0, 500));
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("Meta CAPI error", e);
    return { ok: false, error: "network" };
  }
}
