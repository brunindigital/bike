/**
 * Envio de vendas para a Utmify.
 * Docs: https://docs.utmify.com.br/envio-de-vendas
 * POST https://api.utmify.com.br/api-credentials/orders  (header x-api-token)
 */
import { productExternalRef } from "@/lib/pix/products";

const UTMIFY_URL = "https://api.utmify.com.br/api-credentials/orders";

/** O envio direto é opcional para não duplicar uma integração nativa do gateway. */
const UTMIFY_ENABLED = process.env.UTMIFY_DIRECT_SEND_ENABLED === "true";


export type UtmifyTracking = {
  src?: string | null;
  sck?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
};

export type UtmifyItem = { name: string; quantity: number; price: number };

/** Formata data como "YYYY-MM-DD HH:MM:SS" em UTC 0 (exigido pela Utmify). */
function utcStamp(value?: string | Date | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function cents(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + 0.0001);
}

function cleanTracking(t?: UtmifyTracking | null) {
  const keys: (keyof UtmifyTracking)[] = [
    "src",
    "sck",
    "utm_source",
    "utm_campaign",
    "utm_medium",
    "utm_content",
    "utm_term",
  ];
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    const raw = t?.[k];
    // "nome|id" do Meta pode passar de 200 caracteres; cortar quebrava a
    // identificação da campanha na Utmify.
    out[k] = raw == null || raw === "" ? null : String(raw).slice(0, 600);
  }
  return out;
}

export async function sendUtmifyOrder(input: {
  orderId: string;
  status: "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback";
  amountReais: number;
  createdAt?: string | Date | null;
  approvedDate?: string | Date | null;
  customer: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    document?: string | null;
    ip?: string | null;
  };
  items?: UtmifyItem[] | null;
  tracking?: UtmifyTracking | null;
}): Promise<{ ok: boolean; status: number; body?: string }> {
  // Desativado a pedido: a IronPay já envia as vendas (geradas e aprovadas)
  // direto para a Utmify. Enviar daqui também causava duplicação de métricas.
  if (!UTMIFY_ENABLED) return { ok: false, status: 0 };

  const token = process.env.UTMIFY_API_TOKEN;
  if (!token) {
    console.warn("UTMIFY_API_TOKEN not configured; skipping Utmify send");
    return { ok: false, status: 0 };
  }


  const items = (input.items && input.items.length ? input.items : null) || [
    { name: "Bike Ergométrica Spinning Profissional 120kg", quantity: 1, price: input.amountReais },
  ];

  const totalInCents = cents(input.amountReais);

  const payload = {
    orderId: input.orderId,
    platform: "InoxHomeOnline",
    paymentMethod: "pix" as const,
    status: input.status,
    createdAt: utcStamp(input.createdAt) || utcStamp(new Date())!,
    approvedDate: input.status === "paid" ? utcStamp(input.approvedDate) || utcStamp(new Date()) : null,
    refundedAt: null,
    customer: {
      name: input.customer.name || "Cliente",
      email: input.customer.email || "",
      phone: input.customer.phone || null,
      document: input.customer.document || null,
      country: "BR",
      ...(input.customer.ip ? { ip: input.customer.ip } : {}),
    },
    products: items.map((p) => ({
      id: productExternalRef(p.name),
      name: p.name,
      planId: null,
      planName: null,
      quantity: p.quantity || 1,
      priceInCents: cents(p.price),
    })),
    trackingParameters: cleanTracking(input.tracking),
    commission: {
      totalPriceInCents: totalInCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: totalInCents,
      currency: "BRL" as const,
    },
    isTest: false,
  };

  try {
    const res = await fetch(UTMIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-token": token },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (!res.ok) console.error("Utmify send failed", res.status, body.slice(0, 500));
    else
      console.log(
        "Utmify sent",
        input.status,
        input.orderId,
        JSON.stringify(payload.trackingParameters),
      );
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    console.error("Utmify send error", e);
    return { ok: false, status: 0 };
  }
}
