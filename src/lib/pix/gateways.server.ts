/**
 * Camada única de gateway PIX.
 *
 * Para trocar de gateway, mude APENAS a constante ACTIVE_GATEWAY abaixo.
 * Todo o resto do projeto (create / status / webhook) usa esta interface.
 */

import { productExternalRef } from "./products";

export type ActiveGateway =
  | "ironpay"
  | "codefy"
  | "duck"
  | "plowf"
  | "flevopay"
  | "veno"
  | "clownpay";
export const ACTIVE_GATEWAY: ActiveGateway = "clownpay";

export type PixCreateInput = {
  externalId: string;
  amountReais: number;
  callbackUrl: string;
  description: string;
  /** Nome do produto principal (usado para derivar o external_ref fixo). */
  productName?: string;
  items?: { name: string; quantity: number; price: number }[];
  client: { name: string; email: string; document: string; phone: string };
  shipping?: {
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
  };
};

export type PixCreateResult = {
  ok: boolean;
  status?: number;
  message?: string;
  copyPaste: string | null;
  image: string | null;
  gatewayTransactionId: string | null;
  gatewayExternalId: string | null;
};


const PAID = [
  "PAID",
  "PAGO",
  "APPROVED",
  "APROVADO",
  "COMPLETED",
  "SUCCESS",
  "SUCCEEDED",
];

/* ------------------------------- IRONPAY -------------------------------- */

/* --------------------------------- PLOWF --------------------------------- */

const PLOWF_BASE = "https://app.plowf.com/api/v1";

async function plowfCreate(input: PixCreateInput): Promise<PixCreateResult> {
  const token = process.env.PLOWF_API_TOKEN || "";
  const fail = (status?: number): PixCreateResult => ({
    ok: false,
    status,
    copyPaste: null,
    image: null,
    gatewayTransactionId: null,
    gatewayExternalId: null,
  });
  if (!token) return fail(500);

  const value = Math.round(input.amountReais * 100 + 0.0001) / 100;
  const items = (input.items && input.items.length
    ? input.items
    : [{ name: input.productName || input.description, quantity: 1, price: input.amountReais }]
  ).map((it) => ({
    // external_ref é FIXO por produto (ID do produto no nosso catálogo).
    external_ref: productExternalRef(it.name),
    name: it.name.slice(0, 200),
    price: Math.round(it.price * 100 + 0.0001) / 100,
    quantity: it.quantity,
  }));
  // A Plowf exige que a soma dos produtos bata exatamente com `value`.
  const sum = Math.round(items.reduce((t, i) => t + i.price * i.quantity, 0) * 100) / 100;
  const products = sum === value ? items : undefined;

  const res = await fetch(`${PLOWF_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      value,
      type: "PIX",
      external_ref: input.externalId,
      customer: {
        name: input.client.name,
        document: input.client.document,
        email: input.client.email,
        phone: input.client.phone,
      },
      ...(process.env.PLOWF_FINAL_BENEFICIARY_DOCUMENT
        ? {
            final_beneficiary: {
              name: process.env.PLOWF_FINAL_BENEFICIARY_NAME || input.client.name,
              document: process.env.PLOWF_FINAL_BENEFICIARY_DOCUMENT,
            },
          }
        : {}),
      ...(products ? { products } : {}),
    }),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    console.error("Plowf PIX error", res.status, text.slice(0, 600));
    return fail(res.status);
  }
  const data = json?.data && typeof json.data === "object" ? json.data : json;
  const copyPaste = data?.payment?.payload || data?.payload || null;
  if (typeof copyPaste !== "string" || copyPaste.trim().length < 20) {
    console.error("Plowf PIX response without payload", res.status, text.slice(0, 600));
    return fail(502);
  }
  return {
    ok: true,
    copyPaste,
    image: null,
    gatewayTransactionId: data?.uuid ? String(data.uuid) : null,
    gatewayExternalId: input.externalId,
  };
}

async function plowfStatus(id: string) {
  const token = process.env.PLOWF_API_TOKEN || "";
  if (!token) return { paid: false, paidAt: null as string | null };
  try {
    const res = await fetch(`${PLOWF_BASE}/payments/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { paid: false, paidAt: null };
    const json: any = await res.json();
    const data = json?.data && typeof json.data === "object" ? json.data : json;
    const status = String(data?.status || "").toUpperCase();
    if (!PAID.includes(status)) return { paid: false, paidAt: null };
    const paidAt =
      data?.payment?.pix?.transaction?.settled_at ||
      data?.payment?.pix?.transaction?.updated_at ||
      data?.updated_at ||
      null;
    return { paid: true, paidAt };
  } catch {
    return { paid: false, paidAt: null };
  }
}

const IRON_BASE = "https://api.ironpayapp.com.br/api/public/v1";

function ironToken() {
  return process.env.IRONPAY_API_TOKEN || "";
}

// Cache de ofertas por valor (evita recriar oferta a cada tentativa e bater
// no rate limit "Too Many Attempts" da IronPay).
const ironOfferCache = new Map<number, string>();
const ironOfferRequests = new Map<number, Promise<{ hash: string | null; status?: number; body?: string }>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ironCreateOffer(
  token: string,
  productHash: string,
  cents: number,
  title: string,
): Promise<{ hash: string | null; status?: number; body?: string }> {
  let lastStatus: number | undefined;
  let lastBody = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${IRON_BASE}/products/${productHash}/offers?api_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // IronPay's offer endpoint expects `amount` (in cents), not `price`.
      body: JSON.stringify({ title: title.slice(0, 100), amount: cents }),
    });
    const text = await res.text();
    lastStatus = res.status;
    lastBody = text;
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const hash: string | null = json?.hash || json?.data?.hash || json?.offer?.hash || null;
    if (res.ok && hash) {
      ironOfferCache.set(cents, hash);
      return { hash };
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(900 * (attempt + 1));
      continue;
    }
    break;
  }
  const fallback = process.env.IRONPAY_OFFER_HASH || null;
  return { hash: fallback, status: lastStatus, body: lastBody };
}

async function ironGetOfferHash(
  token: string,
  productHash: string,
  cents: number,
  title: string,
): Promise<{ hash: string | null; status?: number; body?: string }> {
  const cached = ironOfferCache.get(cents);
  if (cached) return { hash: cached };

  // Coalesce simultaneous checkout requests for the same amount. Besides
  // avoiding duplicate offers, this prevents IronPay's per-account rate limit.
  const pending = ironOfferRequests.get(cents);
  if (pending) return pending;

  const request = ironCreateOffer(token, productHash, cents, title).finally(() => {
    ironOfferRequests.delete(cents);
  });
  ironOfferRequests.set(cents, request);
  return request;
}

async function ironCreate(input: PixCreateInput): Promise<PixCreateResult> {
  const token = ironToken();
  const productHash = process.env.IRONPAY_PRODUCT_HASH || "";
  const fail = (status?: number): PixCreateResult => ({
    ok: false,
    status,
    copyPaste: null,
    image: null,
    gatewayTransactionId: null,
    gatewayExternalId: null,
  });
  if (!token || !productHash) return fail(500);

  const cents = Math.round(input.amountReais * 100 + 0.0001);

  // IronPay cobra sempre o preço da oferta, então criamos (ou reaproveitamos)
  // uma oferta com o valor exato do pedido.
  const { hash: offerHash, status: offerStatus, body: offerBody } = await ironGetOfferHash(
    token,
    productHash,
    cents,
    input.description,
  );
  if (!offerHash) {
    console.error("IronPay offer error", offerStatus, (offerBody || "").slice(0, 400));
    return fail(offerStatus);
  }

  const res = await fetch(`${IRON_BASE}/transactions?api_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      amount: cents,
      offer_hash: offerHash,
      payment_method: "pix",
      installments: 1,
      expire_in_days: 1,
      transaction_origin: "api",
      postback_url: input.callbackUrl,
      customer: {
        name: input.client.name,
        email: input.client.email,
        phone_number: input.client.phone,
        document: input.client.document,
        street_name: input.shipping?.logradouro || "Rua",
        number: String(input.shipping?.numero || "0"),
        complement: input.shipping?.complemento || "",
        neighborhood: input.shipping?.bairro || "Centro",
        city: input.shipping?.cidade || "Sao Paulo",
        state: (input.shipping?.uf || "SP").slice(0, 2),
        zip_code: (input.shipping?.cep || "00000000").replace(/\D/g, "") || "00000000",
      },
      cart: (() => {
        const items =
          input.items && input.items.length
            ? input.items
            : [{ name: input.productName || input.description, quantity: 1, price: input.amountReais }];
        // O external_ref é FIXO por produto (id do produto no nosso catálogo),
        // nunca um id novo por transação.
        const cart = items.map((it) => ({
          product_hash: productHash,
          external_ref: productExternalRef(it.name),
          title: it.name.slice(0, 120),
          cover: null,
          price: Math.round(it.price * 100 + 0.0001),
          quantity: it.quantity,
          operation_type: 1,
          tangible: true,
        }));
        const sum = cart.reduce((t, i) => t + i.price * i.quantity, 0);
        if (sum !== cents && cart.length === 1) cart[0]!.price = cents;
        return cart;
      })(),
    }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok || data?.success === false) {
    console.error("IronPay PIX error", res.status, text.slice(0, 600));
    return fail(res.status);
  }
  const tx = data?.data && typeof data.data === "object" ? data.data : data;
  const copyPaste =
    tx?.pix?.pix_qr_code ||
    tx?.pix?.qrcode ||
    tx?.pix_qr_code ||
    tx?.qr_code ||
    null;
  if (typeof copyPaste !== "string" || copyPaste.trim().length < 20) {
    console.error("IronPay PIX response without QR code", res.status, text.slice(0, 600));
    return fail(502);
  }
  return {
    ok: true,
    copyPaste,
    image: tx?.pix?.qr_code_base64 || tx?.pix?.pix_url || null,
    gatewayTransactionId: tx?.hash ? String(tx.hash) : null,
    gatewayExternalId: tx?.transaction ? String(tx.transaction) : null,
  };
}

async function ironStatus(id: string) {
  const token = ironToken();
  if (!token) return { paid: false, paidAt: null as string | null };
  try {
    const res = await fetch(`${IRON_BASE}/transactions/${encodeURIComponent(id)}?api_token=${token}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { paid: false, paidAt: null };
    const json: any = await res.json();
    const tx = json?.data && typeof json.data === "object" ? json.data : json;
    const status = String(tx?.payment_status || tx?.status || "").toUpperCase();
    if (!PAID.includes(status)) return { paid: false, paidAt: null };
    return { paid: true, paidAt: tx?.paid_at || tx?.updated_at || null };
  } catch {
    return { paid: false, paidAt: null };
  }
}

/* -------------------------------- CODEFY -------------------------------- */

async function codefyCreate(input: PixCreateInput): Promise<PixCreateResult> {
  const publicKey = process.env.CODEFY_PUBLIC_KEY || "";
  const secretKey = process.env.CODEFY_SECRET_KEY || "";
  const fail = (status?: number): PixCreateResult => ({
    ok: false,
    status,
    copyPaste: null,
    image: null,
    gatewayTransactionId: null,
    gatewayExternalId: null,
  });
  if (!publicKey || !secretKey) return fail(500);
  const res = await fetch("https://usecodefy.com/api/v1/gateway/pix/receive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-public-key": publicKey,
      "x-secret-key": secretKey,
    },
    body: JSON.stringify({
      identifier: input.externalId,
      amount: input.amountReais,
      callbackUrl: input.callbackUrl,
      client: input.client,
      products: (
        input.items && input.items.length
          ? input.items
          : [{ name: input.productName || input.description, quantity: 1, price: input.amountReais }]
      ).map((it) => ({
        id: productExternalRef(it.name),
        external_ref: productExternalRef(it.name),
        name: it.name.slice(0, 120),
        quantity: it.quantity,
        price: it.price,
      })),
      metadata: { external_id: input.externalId },
    }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok || data?.success === false) {
    console.error("Codefy PIX error", res.status, text.slice(0, 600));
    return fail(res.status);
  }
  const tx = data?.transaction || data?.data?.transaction || data?.data || data || {};
  return {
    ok: true,
    copyPaste: tx?.pix_code || tx?.qr_code || tx?.brcode || null,
    image: tx?.qr_code_url || tx?.qr_code_base64 || null,
    gatewayTransactionId: tx?.id ? String(tx.id) : null,
    gatewayExternalId: tx?.external_id ? String(tx.external_id) : null,
  };
}

async function codefyStatus(id: string) {
  const publicKey = process.env.CODEFY_PUBLIC_KEY;
  const secretKey = process.env.CODEFY_SECRET_KEY;
  if (!publicKey || !secretKey) return { paid: false, paidAt: null as string | null };
  try {
    const res = await fetch(
      `https://usecodefy.com/api/v1/gateway/transactions/${encodeURIComponent(id)}`,
      {
        headers: { Accept: "application/json", "x-public-key": publicKey, "x-secret-key": secretKey },
      },
    );
    if (!res.ok) return { paid: false, paidAt: null };
    const json: any = await res.json();
    const tx = Array.isArray(json) ? json[0] : json?.transaction || json?.data || json;
    const status = String(tx?.status || tx?.payment_status || "").toUpperCase();
    if (!PAID.includes(status)) return { paid: false, paidAt: null };
    return { paid: true, paidAt: tx?.paid_at || tx?.paidAt || tx?.updated_at || null };
  } catch {
    return { paid: false, paidAt: null };
  }
}

/* ------------------------------- dispatch -------------------------------- */

/* --------------------------------- DUCK ---------------------------------- */

async function duckCreate(input: PixCreateInput): Promise<PixCreateResult> {
  const publicKey = process.env.DUCK_PUBLIC_KEY || "";
  const secretKey = process.env.DUCK_SECRET_KEY || "";
  const fail = (status?: number): PixCreateResult => ({
    ok: false,
    status,
    copyPaste: null,
    image: null,
    gatewayTransactionId: null,
    gatewayExternalId: null,
  });
  if (!publicKey || !secretKey) return fail(500);

  // A Duck recusa o payload quando `products` é enviado — mantenha apenas
  // identifier / amount / callbackUrl / client.
  const res = await fetch("https://app.duckoficial.com/api/v1/gateway/pix/receive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "x-public-key": publicKey,
      "x-secret-key": secretKey,
    },
    body: JSON.stringify({
      identifier: input.externalId,
      amount: input.amountReais,
      callbackUrl: input.callbackUrl,
      client: {
        name: input.client.name,
        email: input.client.email,
        document: input.client.document,
        phone: input.client.phone,
      },
    }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok || !data || data?.success === false) {
    console.error("Duck PIX error", res.status, text.slice(0, 600));
    return fail(res.status);
  }
  const pix = data?.pix || data?.data?.pix || {};
  const txId = data?.transactionId || data?.order?.id || data?.data?.transactionId || null;
  return {
    ok: true,
    copyPaste: pix?.code || pix?.payload || pix?.qrcode || null,
    image: pix?.base64 || pix?.image || null,
    gatewayTransactionId: txId ? String(txId) : null,
    gatewayExternalId: input.externalId,
  };
}

/* ------------------------------- FLEVOPAY -------------------------------- */

const FLEVO_BASE = "https://app.flevopay.com.br/api/v1";

function flevoKey() {
  return process.env.FLEVOPAY_API_KEY || process.env.FLEVOPAY_SECRET_KEY || "";
}

async function flevopayCreate(input: PixCreateInput): Promise<PixCreateResult> {
  const key = flevoKey();
  const fail = (status?: number): PixCreateResult => ({
    ok: false,
    status,
    copyPaste: null,
    image: null,
    gatewayTransactionId: null,
    gatewayExternalId: null,
  });
  if (!key) {
    console.error("FlevoPay: FLEVOPAY_API_KEY ausente");
    return fail(500);
  }

  const cents = Math.round(input.amountReais * 100 + 0.0001);
  const productName = input.productName || input.items?.[0]?.name || input.description;
  const productHash = process.env.FLEVOPAY_PRODUCT_HASH || "";

  const payload: Record<string, unknown> = {
    amount: cents,
    description: String(productName).slice(0, 120),
    // reference é o nosso id único da transação; external_ref fixo por produto
    // continua registrado nos nossos próprios dados.
    reference: input.externalId,
    postback_url: input.callbackUrl,
    // Sem productHash cadastrado, a FlevoPay exige source = api_externa.
    ...(productHash ? { productHash } : { source: "api_externa" }),
    customer: {
      name: input.client.name,
      email: input.client.email,
      document: input.client.document.replace(/\D/g, ""),
      phone: input.client.phone.replace(/\D/g, ""),
    },
    metadata: { external_id: input.externalId, product_ref: productExternalRef(productName) },
  };

  let res: Response;
  try {
    res = await fetch(`${FLEVO_BASE}/transaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": key,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("FlevoPay PIX network error", e);
    return fail(502);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok || json?.status === "error" || json?.success === false) {
    console.error("FlevoPay PIX error", res.status, text.slice(0, 600));
    return fail(res.status);
  }
  const data = json?.data && typeof json.data === "object" ? json.data : json;
  const copyPaste = data?.qr_code || data?.pix_code || data?.payload || null;
  if (typeof copyPaste !== "string" || copyPaste.trim().length < 20) {
    console.error("FlevoPay PIX response without qr_code", res.status, text.slice(0, 600));
    return fail(502);
  }
  return {
    ok: true,
    copyPaste,
    image: data?.qr_code_base64 || data?.qr_code_image || null,
    gatewayTransactionId: data?.transaction_id ? String(data.transaction_id) : null,
    gatewayExternalId: input.externalId,
  };
}

async function flevopayStatus(id: string) {
  const key = flevoKey();
  const none = { paid: false, paidAt: null as string | null };
  if (!key) return none;
  const headers = { Accept: "application/json", "X-API-Key": key };
  const isOwnRef = id.startsWith("pix_");
  const urls = isOwnRef
    ? [`${FLEVO_BASE}/query?action=list_transactions&external_id=${encodeURIComponent(id)}`]
    : [
        `${FLEVO_BASE}/query?action=get_transaction&id=${encodeURIComponent(id)}`,
        `${FLEVO_BASE}/query?action=list_transactions&external_id=${encodeURIComponent(id)}`,
      ];

  const target = id.trim().toLowerCase();
  const matchesTarget = (tx: any) => {
    const candidates = [
      tx?.external_id,
      tx?.externalId,
      tx?.reference,
      tx?.external_reference,
      tx?.id,
      tx?.transaction_id,
      tx?.transactionId,
      tx?.metadata?.external_id,
    ];
    return candidates.some((v) => v != null && String(v).trim().toLowerCase() === target);
  };

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const json: any = await res.json();
      const list = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.transactions)
            ? json.transactions
            : [json?.data || json];
      for (const tx of list) {
        // Só aceita a transação que realmente corresponde a este pedido:
        // a API pode ignorar o filtro e devolver a lista completa.
        if (!tx || typeof tx !== "object" || !matchesTarget(tx)) continue;
        const status = String(tx?.status || tx?.payment_status || "").toUpperCase();
        if (PAID.includes(status)) {
          return {
            paid: true,
            paidAt: tx?.paid_at || tx?.approved_at || tx?.updated_at || null,
          };
        }
      }
    } catch {
      // tenta a próxima URL
    }
  }
  return none;
}

/* --------------------------------- VENO ---------------------------------- */

const VENO_BASE = "https://beta.venopayments.com";
const VENO_PAID = ["PAID", "CAPTURED"];

async function venoCreate(input: PixCreateInput): Promise<PixCreateResult> {
  const fail = (status?: number): PixCreateResult => ({
    ok: false,
    status,
    copyPaste: null,
    image: null,
    gatewayTransactionId: null,
    gatewayExternalId: null,
  });
  const key = process.env.VENO_API_KEY || "";
  if (!key) {
    console.error("Veno PIX: VENO_API_KEY ausente");
    return fail(500);
  }

  const amount = Math.round(input.amountReais * 100 + 0.0001);
  const baseItems =
    input.items && input.items.length
      ? input.items
      : [{ name: input.productName || input.description, quantity: 1, price: input.amountReais }];
  let products = baseItems.map((it) => ({
    external_ref: productExternalRef(it.name),
    name: it.name.slice(0, 200),
    price: Math.max(1, Math.round(it.price * 100 + 0.0001)),
    quantity: it.quantity,
  }));
  // A Veno exige que a soma de price x quantity bata exatamente com `amount`.
  const sum = products.reduce((t, p) => t + p.price * p.quantity, 0);
  if (sum !== amount) {
    products = [
      {
        external_ref: productExternalRef(input.productName || input.description),
        name: (input.productName || input.description).slice(0, 200),
        price: amount,
        quantity: 1,
      },
    ];
  }

  const address = [input.shipping?.logradouro, input.shipping?.numero, input.shipping?.bairro]
    .filter(Boolean)
    .join(", ");

  const res = await fetch(`${VENO_BASE}/api/v1/pix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      amount,
      description: input.description.slice(0, 200),
      external_id: input.externalId,
      callback_url: input.callbackUrl,
      payer: {
        name: input.client.name,
        email: input.client.email,
        document: input.client.document.replace(/\D/g, ""),
        phone: input.client.phone.replace(/\D/g, ""),
        ...(address ? { address } : {}),
        ...(input.shipping?.cidade ? { city: input.shipping.cidade } : {}),
        ...(input.shipping?.uf ? { state: input.shipping.uf.slice(0, 2) } : {}),
        ...(input.shipping?.cep
          ? { zip_code: input.shipping.cep.replace(/\D/g, "").slice(0, 8) }
          : {}),
      },
      products,
    }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    console.error("Veno PIX error", res.status, text.slice(0, 600));
    const gwMessage =
      (typeof json?.message === "string" && json.message) ||
      (typeof json?.error === "string" && json.error) ||
      undefined;
    return { ...fail(res.status), message: gwMessage };
  }

  const data = json?.data && typeof json.data === "object" ? json.data : json;
  const copyPaste: string | null =
    (typeof data?.pix_copy_paste === "string" && data.pix_copy_paste) ||
    (typeof data?.qr_code_image === "string" && data.qr_code_image.startsWith("00020")
      ? data.qr_code_image
      : null) ||
    (typeof data?.qr_code === "string" && data.qr_code.startsWith("00020") ? data.qr_code : null) ||
    null;
  if (!copyPaste || copyPaste.trim().length < 20) {
    console.error("Veno PIX sem payload", res.status, text.slice(0, 600));
    return fail(502);
  }
  const image =
    typeof data?.qr_code_image === "string" &&
    (data.qr_code_image.startsWith("data:") || /^https?:\/\//i.test(data.qr_code_image))
      ? data.qr_code_image
      : null;

  return {
    ok: true,
    copyPaste,
    image,
    gatewayTransactionId: data?.id ? String(data.id) : null,
    gatewayExternalId: input.externalId,
  };
}

async function venoStatus(id: string) {
  const none = { paid: false, paidAt: null as string | null };
  const key = process.env.VENO_API_KEY || "";
  if (!key) return none;
  try {
    const res = await fetch(`${VENO_BASE}/api/v1/pix/${encodeURIComponent(id)}/status`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return none;
    const json: any = await res.json();
    const data = json?.data && typeof json.data === "object" ? json.data : json;
    const status = String(data?.status || "").toUpperCase();
    if (!VENO_PAID.includes(status)) return none;
    return { paid: true, paidAt: data?.paid_at || null };
  } catch {
    return none;
  }
}

/* ------------------------------ CLOWNPAY -------------------------------- */

const CLOWNPAY_BASE = "https://app.clownspay.com/api/v1";

function clownpayKey() {
  return process.env.CLOWNPAY_API_KEY || process.env.CLOWNPAY_SECRET_KEY || "";
}

async function clownpayCreate(input: PixCreateInput): Promise<PixCreateResult> {
  const key = clownpayKey();
  const fail = (status?: number, message?: string): PixCreateResult => ({
    ok: false,
    status,
    message,
    copyPaste: null,
    image: null,
    gatewayTransactionId: null,
    gatewayExternalId: null,
  });
  if (!key) {
    console.error("ClownPay PIX: CLOWNPAY_API_KEY ausente");
    return fail(500);
  }

  const customer = {
    name: input.client.name,
    email: input.client.email,
    document: input.client.document.replace(/\D/g, ""),
    phone: input.client.phone.replace(/\D/g, ""),
  };
  const address = input.shipping
    ? {
        street: input.shipping.logradouro || "",
        number: input.shipping.numero || "",
        complement: input.shipping.complemento || "",
        neighborhood: input.shipping.bairro || "",
        city: input.shipping.cidade || "",
        state: (input.shipping.uf || "").slice(0, 2),
        zipcode: (input.shipping.cep || "").replace(/\D/g, ""),
      }
    : undefined;

  let res: Response;
  try {
    res = await fetch(`${CLOWNPAY_BASE}/transaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": key,
      },
      body: JSON.stringify({
        amount: Math.round(input.amountReais * 100 + 0.0001),
        description: input.description.slice(0, 200),
        reference: input.externalId,
        postback_url: input.callbackUrl,
        source: "api_externa",
        customer,
        ...(address ? { address } : {}),
      }),
    });
  } catch (error) {
    console.error("ClownPay PIX network error", error);
    return fail(502);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok || json?.status === "error" || json?.success === false) {
    const message = typeof json?.message === "string" ? json.message : undefined;
    console.error("ClownPay PIX error", res.status, text.slice(0, 600));
    return fail(res.status, message);
  }

  const data = json?.data && typeof json.data === "object" ? json.data : json;
  const copyPaste = data?.qr_code || data?.pix_code || data?.payload || null;
  if (typeof copyPaste !== "string" || copyPaste.trim().length < 20) {
    console.error("ClownPay PIX sem qr_code", res.status, text.slice(0, 600));
    return fail(502);
  }
  return {
    ok: true,
    copyPaste,
    image: typeof data?.qr_code_base64 === "string" ? data.qr_code_base64 : null,
    gatewayTransactionId: data?.transaction_id != null ? String(data.transaction_id) : null,
    gatewayExternalId: data?.id != null ? String(data.id) : input.externalId,
  };
}

async function clownpayStatus(id: string) {
  const key = clownpayKey();
  const none = { paid: false, paidAt: null as string | null };
  if (!key) return none;
  const headers = { Accept: "application/json", "X-API-Key": key };
  const urls = id.startsWith("pix_")
    ? [`${CLOWNPAY_BASE}/query?action=list_transactions&external_id=${encodeURIComponent(id)}`]
    : [`${CLOWNPAY_BASE}/query?action=get_transaction&id=${encodeURIComponent(id)}`];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const json: any = await res.json();
      const list = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : [json?.data || json];
      for (const tx of list) {
        if (!tx || typeof tx !== "object") continue;
        const status = String(tx.status || tx.payment_status || "").toUpperCase();
        if (PAID.includes(status)) {
          return { paid: true, paidAt: tx.paid_at || tx.approved_at || tx.updated_at || null };
        }
      }
    } catch {
      // O webhook continua sendo a confirmação principal se a consulta falhar.
    }
  }
  return none;
}

/* ------------------------------- dispatch -------------------------------- */

export function createPixCharge(input: PixCreateInput): Promise<PixCreateResult> {
  if (ACTIVE_GATEWAY === "clownpay") return clownpayCreate(input);
  if (ACTIVE_GATEWAY === "veno") return venoCreate(input);
  if (ACTIVE_GATEWAY === "flevopay") return flevopayCreate(input);
  if (ACTIVE_GATEWAY === "plowf") return plowfCreate(input);
  if (ACTIVE_GATEWAY === "ironpay") return ironCreate(input);
  if (ACTIVE_GATEWAY === "duck") return duckCreate(input);
  return codefyCreate(input);
}

export function fetchPixStatus(id: string): Promise<{ paid: boolean; paidAt: string | null }> {
  if (ACTIVE_GATEWAY === "clownpay") return clownpayStatus(id);
  if (ACTIVE_GATEWAY === "veno") return venoStatus(id);
  if (ACTIVE_GATEWAY === "flevopay") return flevopayStatus(id);
  if (ACTIVE_GATEWAY === "plowf") return plowfStatus(id);
  if (ACTIVE_GATEWAY === "ironpay") return ironStatus(id);
  // A Duck não expõe consulta pública de status: a confirmação vem via webhook.
  if (ACTIVE_GATEWAY === "duck") return Promise.resolve({ paid: false, paidAt: null });
  return codefyStatus(id);
}

