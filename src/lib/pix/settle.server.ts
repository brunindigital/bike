import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPixStatus } from "@/lib/pix/gateways.server";
import { productExternalRef } from "@/lib/pix/products";

const RASTREIO_SITE = "https://trackflowsystem.lovable.app";
const SITE_BASE = "https://inoxhome.lovable.app";

const BIKE_NAME = "Bike Ergométrica Spinning Profissional 120kg";
const BIKE_IMAGE = `${SITE_BASE}/images/bike-ergometrica-spinning.webp`;

function isBikeOrder(products: unknown): boolean {
  if (!Array.isArray(products)) return false;
  return products.some((product: any) => {
    const name = String(product?.name || "");
    return productExternalRef(name) === "bike-ergometrica-spinning";
  });
}

function resolveProductInfo(products: unknown): { produto: string; imagem: string } {
  if (!isBikeOrder(products)) return { produto: "", imagem: "" };
  return { produto: BIKE_NAME, imagem: BIKE_IMAGE };
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Valor do pedido em REAIS.
 * - Prioriza a linha canônica do pedido (order_ref / id "pix_..."), criada pelo
 *   nosso checkout, que sempre grava o valor exato em reais.
 * - Linhas inseridas pelo webhook do gateway podem vir em centavos (ex.: 6190)
 *   ou sem valor (0/null) — normaliza e ignora zeros.
 * - Fallback: soma dos itens do pedido (products), quando disponível.
 */
function resolveAmountReais(rows: any[], orderRef?: string | null): number {
  const normalize = (v: unknown): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Number.isInteger(n) && n >= 1000 ? n / 100 : n;
  };

  const canonical = rows.find(
    (r) =>
      (orderRef && String(r?.transaction_id) === String(orderRef)) ||
      String(r?.transaction_id || "").startsWith("pix_"),
  );
  const ownAmount = normalize(canonical?.amount);
  if (ownAmount > 0) return ownAmount;

  for (const row of rows) {
    const value = normalize(row?.amount);
    if (value > 0) return value;
  }

  for (const row of rows) {
    const items = Array.isArray(row?.products) ? row.products : null;
    if (!items?.length) continue;
    const sum = items.reduce(
      (acc: number, item: any) => acc + (Number(item?.price) || 0) * (Number(item?.quantity) || 1),
      0,
    );
    if (sum > 0) return Math.round(sum * 100 + 0.0001) / 100;
  }

  return 0;
}

/**
 * Um mesmo pagamento gera várias linhas (nosso id "pix_...", o id da gateway,
 * o hash, etc.). `order_ref` é o id canônico do pedido: é ele que vai para a
 * Utmify e é nele que os guards de "já enviado" são travados, o que elimina
 * duplicidade de venda gerada/aprovada quando o webhook e o polling trazem
 * conjuntos diferentes de ids.
 */
export async function resolveOrderGroup(
  admin: SupabaseClient<any, any, any>,
  ids: string[],
): Promise<{ ids: string[]; orderRef: string }> {
  const unique = Array.from(new Set(ids.filter(Boolean).map(String)));
  if (!unique.length) return { ids: [], orderRef: "" };

  const { data: known } = await admin
    .from("pix_transactions")
    .select("transaction_id,order_ref")
    .in("transaction_id", unique);

  const refs = new Set<string>(
    ((known as any[]) || []).map((r) => r?.order_ref).filter(Boolean).map(String),
  );
  const ownId = unique.find((id) => id.startsWith("pix_"));
  if (ownId) refs.add(ownId);
  if (!refs.size) refs.add(unique[0]);

  const refList = Array.from(refs);
  const orderRef = refList.find((r) => r.startsWith("pix_")) || refList[0];

  const { data: siblings } = await admin
    .from("pix_transactions")
    .select("transaction_id")
    .in("order_ref", refList);

  const all = Array.from(
    new Set([...unique, ...(((siblings as any[]) || []).map((r) => String(r.transaction_id)))]),
  );

  // Normaliza todas as linhas do grupo para o mesmo id canônico.
  await admin.from("pix_transactions").update({ order_ref: orderRef }).in("transaction_id", all);

  return { ids: all, orderRef };
}


/**
 * Marks every id that belongs to the same payment as paid and runs the paid
 * side effects once: push the order to the tracking site and email the buyer.
 * Safe to call repeatedly (guarded by rastreio_enviado / email_enviado).
 */
export async function settlePaidTransaction(
  admin: SupabaseClient<any, any, any>,
  ids: string[],
  paidAt?: string | null,
) {
  const group = await resolveOrderGroup(admin, ids);
  const uniqueIds = group.ids;
  const orderRef = group.orderRef;
  if (!uniqueIds.length) return;

  const paidAtIso = toIso(paidAt) || new Date().toISOString();

  const { data: rowsRaw } = await admin
    .from("pix_transactions")
    .select("*")
    .in("transaction_id", uniqueIds);

  await admin
    .from("pix_transactions")
    .update({ status: "paid", paid_at: paidAtIso, updated_at: new Date().toISOString() })
    .in("transaction_id", uniqueIds);

  // Rows are duplicated per id (external id + gateway id); customer data may
  // live on only one of them, so merge before using it. A linha canônica
  // (order_ref) vem primeiro: é ela que tem os dados reais do lead.
  const rows = [...(((rowsRaw as any[]) || []))].sort((a, b) =>
    String(a.transaction_id) === orderRef ? -1 : String(b.transaction_id) === orderRef ? 1 : 0,
  );
  const merged: any = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (merged[key] == null && value != null) merged[key] = value;
    }
  }
  // The canonical row (order_ref, id "pix_...") is the only one guaranteed to
  // hold the amount in Reais; webhook-inserted gateway rows may carry the
  // gateway's own unit (cents) or no amount at all, which produced R$ 6.190,00
  // and R$ 0,00 on Utmify.
  merged.amount = resolveAmountReais(rows, orderRef);
  const alreadySent = rows.some((r) => r.rastreio_enviado);
  const emailSent = rows.some((r) => r.email_enviado);
  const orderId = orderRef || merged.transaction_id || uniqueIds[0];
  const bikeOrder = isBikeOrder(merged.products);

  // Utmify: marca a venda como paga usando SEMPRE o mesmo orderId da criação
  // do PIX (order_ref), senão a Utmify criaria um segundo pedido aprovado.
  const utmifySent = rows.some((r) => r.utmify_enviado);
  const amountReais = Number(merged.amount) || 0;
  // Sem identidade do comprador a linha é um eco do gateway (id desconhecido),
  // nunca um pedido real: enviar geraria pagamento duplicado na Utmify.
  const hasIdentity = Boolean(merged.payer_email || merged.payer_cpf || merged.payer_name);
  if (!utmifySent && !hasIdentity) {
    await admin
      .from("pix_transactions")
      .update({ utmify_enviado: true })
      .in("transaction_id", uniqueIds);
    console.error("Utmify paid skipped: order without customer identity", orderId);
  }
  if (!utmifySent && amountReais <= 0) {
    // Sem valor confiável não enviamos: R$ 0,00 na Utmify é pior que atrasar.
    console.error("Utmify paid skipped: amount unresolved for", orderId);
  }
  if (!utmifySent && hasIdentity && amountReais > 0) {

    // Trava atômica no grupo inteiro do pedido (order_ref): webhook e polling
    // podem chegar juntos com ids diferentes e só um envia.
    const { data: claimedUtmify } = await admin
      .from("pix_transactions")
      .update({ utmify_enviado: true })
      .eq("order_ref", orderRef)
      .eq("utmify_enviado", false)
      .select("transaction_id");
    if (claimedUtmify && claimedUtmify.length) {
      try {
        const { sendUtmifyOrder } = await import("@/lib/utmify/send.server");
        const result = await sendUtmifyOrder({
          orderId,
          status: "paid",
          amountReais,
          createdAt: toIso(merged.created_at),
          approvedDate: paidAtIso,
          customer: {
            name: merged.payer_name,
            email: merged.payer_email,
            phone: merged.payer_phone,
            document: merged.payer_cpf,
            ip: merged.payer_ip,
          },
          items: Array.isArray(merged.products) ? merged.products : null,
          tracking: merged.tracking || null,
        });
        // Só liberamos novo envio quando a Utmify REJEITOU o pedido (4xx):
        // erro de rede ou 5xx pode ter registrado a venda do outro lado, e
        // reenviar nesse caso era o que duplicava a venda aprovada.
        const rejected = result.status >= 400 && result.status < 500;
        if (!result.ok && rejected) {
          await admin
            .from("pix_transactions")
            .update({ utmify_enviado: false })
            .in("transaction_id", uniqueIds);
        }
      } catch (e) {
        console.error("Utmify paid error", e);
      }
    }
  }



  if (!merged.payer_email && !merged.payer_name) return;

  // Meta Conversions API: dispara o Purchase no instante da aprovação, mesmo
  // que o lead já tenha fechado a página. Usa o mesmo event_id do pixel no
  // navegador ("pix_" + id do nosso checkout) para deduplicar.
  const capiSent = rows.some((r) => r.capi_enviado);
  if (!capiSent && amountReais > 0) {
    const { data: claimedCapi } = await admin
      .from("pix_transactions")
      .update({ capi_enviado: true })
      .eq("order_ref", orderRef)
      .eq("capi_enviado", false)
      .select("transaction_id");

    if (claimedCapi && claimedCapi.length) {
      try {
        const { sendMetaPurchase } = await import("@/lib/meta/capi.server");
        const ownId = orderRef || uniqueIds[0];
        const result = await sendMetaPurchase({
          eventId: `pix_${ownId}`,
          amountReais,
          paidAtIso,
          eventSourceUrl: merged.fb_event_source_url || null,
          contents: Array.isArray(merged.products) ? merged.products : null,
          customer: {
            email: merged.payer_email,
            phone: merged.payer_phone,
            name: merged.payer_name,
            document: merged.payer_cpf,
            ip: merged.payer_ip,
            userAgent: merged.fb_user_agent,
            fbp: merged.fb_fbp,
            fbc: merged.fb_fbc,
            city: merged.ship_cidade,
            state: merged.ship_uf,
            zip: merged.ship_cep,
          },
        });
        if (!result.ok) {
          await admin
            .from("pix_transactions")
            .update({ capi_enviado: false })
            .in("transaction_id", uniqueIds);
        }
      } catch (e) {
        console.error("Meta CAPI purchase error", e);
        await admin
          .from("pix_transactions")
          .update({ capi_enviado: false })
          .in("transaction_id", uniqueIds);
      }
    }
  }

  let trackingCode: string | null = merged.tracking_code || null;
  let trackingLink: string | null = null;

  if (!alreadySent && bikeOrder) {
    const { data: claimed } = await admin
      .from("pix_transactions")
      .update({ rastreio_enviado: true })
      .in("transaction_id", uniqueIds)
      .eq("rastreio_enviado", false)
      .select("transaction_id");
    if (claimed && claimed.length) {
      try {
        const apiKey = process.env.PEDIDOS_API_KEY;
        if (!apiKey) throw new Error("Rastreio API key not configured");
        const { produto, imagem } = resolveProductInfo(merged.products);
        const res = await fetch(`${RASTREIO_SITE}/api/public/pedidos`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            pedido: orderId,
            cliente: merged.payer_name || "",
            email: merged.payer_email || "",
            telefone: merged.payer_phone || "",
            cpf: merged.payer_cpf || "",
            produto,
            imagem,
            categoria: "Fitness",
            cep: merged.ship_cep || "",
            cidade: merged.ship_cidade || "",
            uf: merged.ship_uf || "",
            logradouro: merged.ship_logradouro || "",
            numero: String(merged.ship_numero || "").slice(0, 20),
            complemento: String(merged.ship_complemento || "").slice(0, 20),
            bairro: merged.ship_bairro || "",
            quantidade: 1,
            dataCompra: toIso(merged.created_at),
            dataPagamento: paidAtIso,
          }),
        });
        if (!res.ok) {
          console.error("Rastreio POST failed", res.status, (await res.text()).slice(0, 400));
          await admin
            .from("pix_transactions")
            .update({ rastreio_enviado: false })
            .in("transaction_id", uniqueIds);
        } else {
          try {
            const payload: any = await res.json();
            trackingCode =
              payload?.codigo ||
              payload?.codigoRastreio ||
              payload?.codigo_rastreio ||
              payload?.rastreio ||
              payload?.tracking_code ||
              payload?.data?.codigo ||
              payload?.data?.codigoRastreio ||
              payload?.data?.rastreio ||
              trackingCode;
            trackingLink = payload?.linkRastreio || payload?.data?.linkRastreio || null;
          } catch {
            /* keep whatever code we already had */
          }
          if (trackingCode) {
            await admin
              .from("pix_transactions")
              .update({ tracking_code: String(trackingCode) })
              .in("transaction_id", uniqueIds);
          }
        }
      } catch (e) {
        console.error("Rastreio POST error", e);
        await admin
          .from("pix_transactions")
          .update({ rastreio_enviado: false })
          .in("transaction_id", uniqueIds);
      }
    }
  }

  if (merged.payer_email && !emailSent && bikeOrder) {
    const { data: claimedEmail } = await admin
      .from("pix_transactions")
      .update({ email_enviado: true })
      .in("transaction_id", uniqueIds)
      .eq("email_enviado", false)
      .select("transaction_id");
    if (claimedEmail && claimedEmail.length) {
      try {
        const code = trackingCode ? String(trackingCode) : orderId;
        const link = trackingLink || `${RASTREIO_SITE}/rastreio/${encodeURIComponent(code)}`;
        const endereco = [
          [merged.ship_logradouro, merged.ship_numero].filter(Boolean).join(", "),
          merged.ship_complemento,
          merged.ship_bairro,
          [merged.ship_cidade, merged.ship_uf].filter(Boolean).join("/"),
          merged.ship_cep,
        ]
          .filter(Boolean)
          .join(" — ");
        const { sendTransactionalEmailServer } = await import("@/lib/email/send.server");
        const result = await sendTransactionalEmailServer({
          templateName: "rastreio-pedido",
          recipientEmail: merged.payer_email,
          idempotencyKey: `rastreio-${orderId}`,
          templateData: {
            nome: merged.payer_name || "",
            pedido: orderId,
            codigoRastreio: code,
            linkRastreio: link,
            endereco,
            produto: BIKE_NAME,
            imagem: BIKE_IMAGE,
          },
        });
        if (!result.success) {
          console.error("Tracking email not sent", result.reason);
          await admin
            .from("pix_transactions")
            .update({ email_enviado: false })
            .in("transaction_id", uniqueIds);
        }
      } catch (e) {
        console.error("Tracking email error", e);
        await admin
          .from("pix_transactions")
          .update({ email_enviado: false })
          .in("transaction_id", uniqueIds);
      }
    }
  }
}

/** Asks the active gateway directly whether a transaction is paid. */
export function fetchGatewayStatus(id: string): Promise<{ paid: boolean; paidAt: string | null }> {
  return fetchPixStatus(id);
}
