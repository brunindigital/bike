import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createPixCharge } from "@/lib/pix/gateways.server";
import { sendUtmifyOrder } from "@/lib/utmify/send.server";
import { productGatewayName } from "@/lib/pix/products";

const schema = z.object({
  amount: z.number().positive().max(100000),
  paymentType: z.enum(["main", "upsell"]).default("main"),
  client: z.object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(200),
    document: z.string().min(11).max(20),
    phone: z.string().min(8).max(20),
  }),
  products: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        quantity: z.number().int().positive().max(50),
        price: z.number().positive(),
      }),
    )
    .max(20)
    .optional(),
  shipping: z
    .object({
      cep: z.string().max(20).optional(),
      logradouro: z.string().max(200).optional(),
      numero: z.string().max(30).optional(),
      complemento: z.string().max(200).optional(),
      bairro: z.string().max(120).optional(),
      cidade: z.string().max(120).optional(),
      uf: z.string().max(10).optional(),
    })
    .nullable()
    .optional(),
  tracking: z
    .object({
      // O Meta manda valores longos (nome|id + blob "::"). Limites curtos
      // rejeitavam a requisição inteira e a venda ia sem campanha.
      src: z.string().max(600).optional().nullable(),
      sck: z.string().max(600).optional().nullable(),
      utm_source: z.string().max(600).optional().nullable(),
      utm_campaign: z.string().max(600).optional().nullable(),
      utm_medium: z.string().max(600).optional().nullable(),
      utm_content: z.string().max(600).optional().nullable(),
      utm_term: z.string().max(600).optional().nullable(),
    })
    .partial()
    .nullable()
    .optional(),
  fb: z
    .object({
      fbp: z.string().max(200).optional().nullable(),
      fbc: z.string().max(400).optional().nullable(),
      url: z.string().max(500).optional().nullable(),
    })
    .partial()
    .nullable()
    .optional(),
});

/** Valida CPF (11) ou CNPJ (14). A Duck recusa documentos inválidos. */
function isValidDocument(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    for (let t = 9; t < 11; t++) {
      let sum = 0;
      for (let i = 0; i < t; i++) sum += Number(d[i]) * (t + 1 - i);
      let dig = ((sum * 10) % 11) % 10;
      if (dig !== Number(d[t])) return false;
    }
    return true;
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (len: number) => {
      let pos = len - 7;
      let sum = 0;
      for (let i = 0; i < len; i++) {
        sum += Number(d[i]) * pos--;
        if (pos < 2) pos = 9;
      }
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

export const Route = createFileRoute("/api/public/pix/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid payload" }, { status: 400 });
        }
        const input = parsed.data;

        const origin = new URL(request.url).origin;
        const externalId = `pix_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const callbackUrl = `${origin}/api/public/pix/webhook?external_id=${encodeURIComponent(externalId)}`;

        const amountReais = Math.round(input.amount * 100 + 0.0001) / 100;
        const doc = input.client.document.replace(/\D/g, "");
        if (!isValidDocument(doc)) {
          return Response.json(
            { error: "invalid_document", message: "CPF/CNPJ inválido." },
            { status: 400 },
          );
        }
        const phone = input.client.phone.replace(/\D/g, "");
        // Nomes profissionais (sem "potes"/"herméticos") na requisição ao gateway.
        const gatewayProducts = (input.products || []).map((p) => ({
          name: productGatewayName(p.name),
          quantity: p.quantity,
          price: p.price,
        }));
        const description =
          gatewayProducts.map((p) => `${p.quantity}x ${p.name}`).join(" + ").slice(0, 200) ||
          "EQUIPAMENTO FITNESS BIKE INDOOR PRO";
        const charge = await createPixCharge({
          externalId,
          amountReais,
          paymentType: input.paymentType,
          callbackUrl,
          description,
          productName: gatewayProducts[0]?.name || "EQUIPAMENTO FITNESS BIKE INDOOR PRO",
          items: gatewayProducts.length
            ? gatewayProducts
            : [{ name: "EQUIPAMENTO FITNESS BIKE INDOOR PRO", quantity: 1, price: amountReais }],

          client: {
            name: input.client.name,
            email: input.client.email,
            document: doc,
            phone,
          },
          shipping: input.shipping ?? undefined,
        });

        if (!charge.ok) {
          return Response.json(
            {
              error: "Failed to create PIX",
              status: charge.status,
              message:
                charge.message ||
                "Não foi possível gerar o PIX agora. Tente novamente em instantes.",
            },
            { status: 200 },
          );
        }


        const copyPaste = charge.copyPaste;
        const rawImage = charge.image;
        // Some gateways echo the PIX copy-paste string in image fields; only
        // trust it as an image when it really is a data URI, URL, or base64.
        const image =
          typeof rawImage === "string" &&
          rawImage &&
          !rawImage.startsWith("00020101") &&
          (rawImage.startsWith("data:") ||
            /^https?:\/\//i.test(rawImage) ||
            /^[A-Za-z0-9+/=\s]+$/.test(rawImage))
            ? rawImage
            : null;
        const qrCode = image
          ? image.startsWith("data:") || /^https?:\/\//i.test(image)
            ? image
            : `data:image/png;base64,${image}`
          : copyPaste
            ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(copyPaste)}`
            : null;
        const gatewayTransactionId = charge.gatewayTransactionId;
        const gatewayExternalId = charge.gatewayExternalId;
        const transactionId = externalId;
        const clientIp =
          request.headers.get("cf-connecting-ip") ||
          (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
          null;
        const items = input.products?.length
          ? input.products.map((p) => ({ name: p.name, quantity: p.quantity, price: p.price }))
          : [
              {
                name: "Bike Ergométrica Spinning Profissional 120kg",
                quantity: 1,
                price: amountReais,
              },
            ];
        const createdAtIso = new Date().toISOString();

        // Persist both the stable external id and the gateway id. This MUST be
        // awaited: on the Worker runtime a floating promise is dropped when the
        // response is returned, which left paid transactions without a row.
        // Quando o lead recarrega a página ou gera o PIX de novo, o pedido é o
        // MESMO: reaproveitamos o order_ref já existente e não enviamos outro
        // "waiting_payment" para a Utmify (era isso que duplicava a venda).
        let orderRef = transactionId;
        let utmifyAlreadySent = false;
        if (transactionId && supabaseUrl && supabaseServiceKey) {
          const admin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const sinceIso = new Date(Date.now() - 45 * 60 * 1000).toISOString();
          const { data: previous } = await admin
            .from("pix_transactions")
            .select("order_ref,created_at,status,products")
            .eq("payer_email", input.client.email)
            .eq("amount", amountReais)
            .gte("created_at", sinceIso)
            .order("created_at", { ascending: false })
            .limit(20);
          const reusable = ((previous as any[]) || []).find(
            (r) =>
              r?.order_ref &&
              Array.isArray(r.products) &&
              r.products.some((product: any) =>
                String(product?.name || "").toLowerCase().includes("bike"),
              ) &&
              !["paid", "approved", "completed", "success", "succeeded"].includes(
                String(r.status || "").toLowerCase(),
              ),
          );
          if (reusable?.order_ref) {
            orderRef = String(reusable.order_ref);
            utmifyAlreadySent = true;
          }
          const ids = Array.from(
            new Set(
              [transactionId, gatewayTransactionId, gatewayExternalId].filter(Boolean).map(String),
            ),
          );
          const row = {
            // Id canônico do pedido: todas as linhas do mesmo pagamento (nosso
            // id + ids da gateway) compartilham este valor, garantindo um único
            // envio de "gerado" e "aprovado" na Utmify.
            order_ref: orderRef,
            status: "pending" as const,
            amount: amountReais,

            payer_name: input.client.name,
            payer_email: input.client.email,
            payer_phone: phone || null,
            payer_cpf: doc || null,
            payer_ip: clientIp,
            products: items,
            tracking: input.tracking || null,
            ship_cep: input.shipping?.cep || null,
            ship_logradouro: input.shipping?.logradouro || null,
            ship_numero: input.shipping?.numero || null,
            ship_complemento: input.shipping?.complemento || null,
            ship_bairro: input.shipping?.bairro || null,
            ship_cidade: input.shipping?.cidade || null,
            ship_uf: input.shipping?.uf || null,
            fb_fbp: input.fb?.fbp || null,
            fb_fbc: input.fb?.fbc || null,
            fb_event_source_url: input.fb?.url || null,
            fb_user_agent: request.headers.get("user-agent") || null,
          };
          await Promise.all(
            ids.map((id) =>
              admin
                .from("pix_transactions")
                .upsert({ transaction_id: id, ...row }, { onConflict: "transaction_id" }),
            ),
          ).catch((e) => console.error("Failed to persist pix transaction", e));

          // Trava atômica: só UM envio de "waiting_payment" por order_ref,
          // mesmo com cliques repetidos ou requisições simultâneas.
          if (!utmifyAlreadySent) {
            const { data: claimed } = await admin
              .from("pix_transactions")
              .update({ utmify_waiting_enviado: true })
              .eq("order_ref", orderRef)
              .eq("utmify_waiting_enviado", false)
              .select("transaction_id");
            if (!claimed || claimed.length === 0) utmifyAlreadySent = true;
          } else {
            await admin
              .from("pix_transactions")
              .update({ utmify_waiting_enviado: true })
              .eq("order_ref", orderRef);
          }
        }

        // Envia a venda (PIX gerado) para a Utmify — uma única vez por pedido.
        if (!utmifyAlreadySent)

        await sendUtmifyOrder({
          orderId: orderRef,
          status: "waiting_payment",
          amountReais,
          createdAt: createdAtIso,
          customer: {
            name: input.client.name,
            email: input.client.email,
            phone,
            document: doc,
            ip: clientIp,
          },
          items,
          tracking: input.tracking || null,
        }).catch((e) => console.error("Utmify waiting_payment error", e));

        return Response.json({ qrCode, copyPaste, transactionId, gatewayTransactionId });
      },
    },
  },
});
