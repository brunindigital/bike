import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { settlePaidTransaction, resolveOrderGroup } from "@/lib/pix/settle.server";
import { createHmac, timingSafeEqual } from "crypto";

// Codefy / Plowf POSTs here whenever a transaction changes state (callbackUrl).
// Payload: { event: "transaction.paid", transaction: { id, external_id,
// status, amount (Reais), paid_at }, ... }.
export const Route = createFileRoute("/api/public/pix/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const rawBody = await request.text();
        let body: any = null;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        // Verifica assinatura HMAC do webhook da Plowf quando presente.
        const plowfSignature = request.headers.get("x-webhook-signature");
        if (plowfSignature) {
          const token = process.env.PLOWF_WEBHOOK_TOKEN || "";
          if (token) {
            const expected = createHmac("sha256", token).update(rawBody).digest("hex");
            if (!timingSafeEqual(Buffer.from(plowfSignature), Buffer.from(expected))) {
              return new Response("invalid signature", { status: 401 });
            }
          }
        }


        const ids = Array.from(
          new Set(
            [
              url.searchParams.get("external_id"),
              body?.external_ref,
              body?.data?.external_ref,
              body?.uuid,
              body?.data?.uuid,
              body?.external_reference,
              body?.data?.external_reference,
              body?.transaction_hash,
              body?.hash,
              body?.data?.transaction_hash,
              body?.data?.hash,
              body?.transaction?.externalRef,
              body?.externalRef,
              body?.data?.externalRef,
              body?.externalId,
              body?.data?.externalId,
              body?.external_id,
              body?.externalId,
              body?.data?.external_id,
              body?.data?.externalId,
              body?.data?.transaction_id,
              body?.data?.metadata?.order_id,
              body?.transaction?.external_id,
              body?.transaction?.externalId,
              body?.id,
              body?.transactionId,
              body?.transaction_id,
              body?.data?.id,
              body?.data?.transactionId,
              body?.data?.transaction_id,
              body?.transaction?.id,
              body?.transaction?.external_id,
              body?.transaction?.identifier,
              body?.identifier,
              body?.data?.identifier,
            ]
              .filter(Boolean)
              .map((value) => String(value)),
          ),
        );
        const tx = ids[0] || null;
        const eventHeader =
          request.headers.get("x-event") ||
          request.headers.get("x-codefy-event") ||
          request.headers.get("X-Codefy-Event") ||
          String(body?.event || "") ||
          String(body?.type || "") ||
          "";
        const rawStatus = String(
          body?.status ||
            body?.payment_status ||
            body?.data?.payment_status ||
            body?.data?.status ||
            body?.transaction?.status ||
            body?.raw_status ||
            eventHeader.split(".").pop() ||
            body?.event ||
            "",
        ).toUpperCase();

        if (!tx) return new Response("missing id", { status: 400 });

        let status: "pending" | "paid" | "failed" | "cancelled" = "pending";
        if (
          [
            "PAID",
            "PAGO",
            "APPROVED",
            "APROVADO",
            "COMPLETED",
            "SUCCESS",
            "SUCCEEDED",
            "TRANSACTION_PAID",
            "TRANSACTION.PAID",
            "PAID_OUT",
            "PAYMENT_PAID",
            "PIX_PAID",
            "TRANSACTION_APPROVED",
            "CAPTURED",
            "DEPOSIT.PAID",
          ].includes(
            rawStatus,
          )
        ) {
          status = "paid";
        } else if (
          ["FAILED", "DECLINED", "RECUSADO", "REJECTED", "ERROR", "REFUSED", "DENIED"].includes(rawStatus)
        ) {
          status = "failed";
        } else if (
          [
            "CANCELLED",
            "CANCELED",
            "CANCELADO",
            "REFUNDED",
            "REEMBOLSADO",
            "EXPIRED",
            "CHARGEBACK",
            "CHARGED_BACK",
            "TRANSACTION_CANCELED",
            "TRANSACTION_REFUNDED",
            "TRANSACTION_CHARGED_BACK",
            "TRANSACTION.EXPIRED",
            "TRANSACTION.REFUNDED",
            "CHARGEDBACK",
            "IN_PROTEST",
          ].includes(rawStatus)
        ) {
          status = "cancelled";
        }

        const paidAtRaw =
          body?.paid_at ||
          body?.data?.paid_at ||
          body?.transaction?.paid_at ||
          body?.transaction?.payedAt ||
          body?.transaction?.paidAt ||
          body?.data?.payedAt ||
          null;

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) {
          console.error("Webhook received but backend not configured");
          return new Response("not configured", { status: 500 });
        }
        const admin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Codefy reports the amount in Reais.
        const amount =
          Number(body?.amount ?? body?.data?.amount ?? body?.transaction?.amount ?? 0) || 0;
        const patch: Record<string, unknown> = {
          status,
          updated_at: new Date().toISOString(),
        };
        if (status === "paid") {
          const parsed = paidAtRaw ? new Date(String(paidAtRaw)) : null;
          patch.paid_at =
            parsed && !Number.isNaN(parsed.getTime())
              ? parsed.toISOString()
              : new Date().toISOString();
        }

        // Gateways reportam o valor em unidades diferentes (reais ou centavos).
        const amountReaisFromGateway =
          amount > 0 && Number.isInteger(amount) && amount >= 1000 ? amount / 100 : amount;

        // Agrupa todos os ids que pertencem ao mesmo pedido (nosso "pix_..." e
        // os ids/hashes da gateway) sob um único order_ref.
        const group = await resolveOrderGroup(admin, ids);
        const allIds = Array.from(new Set([...group.ids, ...ids]));
        let orderRef = group.orderRef || ids[0];

        // Existe alguma linha nossa (criada pelo checkout) neste grupo?
        const { data: existingRows } = await admin
          .from("pix_transactions")
          .select("transaction_id,order_ref,payer_email")
          .in("transaction_id", allIds);
        const known = (existingRows as any[]) || [];
        const hasOwnRow = known.some(
          (r) => String(r.transaction_id).startsWith("pix_") || r.payer_email,
        );

        // A IronPay às vezes notifica com um id que não estava na criação do PIX
        // (uuid próprio dela, sem o external_id no callback). Sem reconciliação
        // isso criava um pedido "fantasma" e a Utmify recebia o pagamento duas
        // vezes. Aqui religamos a notificação ao pedido real do checkout.
        let reconciled = false;
        if (!hasOwnRow) {
          const docRaw = String(
            body?.customer?.document ||
              body?.client?.document ||
              body?.data?.customer?.document ||
              body?.payer?.document ||
              body?.payer?.cpf ||
              body?.data?.payer?.document ||
              "",
          ).replace(/\D/g, "");
          const emailRaw = String(
            body?.customer?.email ||
              body?.client?.email ||
              body?.data?.customer?.email ||
              body?.payer?.email ||
              body?.data?.payer?.email ||
              "",
          ).trim();

          const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
          let candidate: any = null;

          if (docRaw.length >= 11) {
            const { data } = await admin
              .from("pix_transactions")
              .select("order_ref,amount,created_at")
              .eq("payer_cpf", docRaw)
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(5);
            candidate = ((data as any[]) || [])[0] || null;
          }
          if (!candidate && emailRaw) {
            const { data } = await admin
              .from("pix_transactions")
              .select("order_ref,amount,created_at")
              .eq("payer_email", emailRaw)
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(5);
            candidate = ((data as any[]) || [])[0] || null;
          }
          if (!candidate && amountReaisFromGateway > 0) {
            // Último recurso: pedido do checkout com o mesmo valor, ainda
            // pendente, criado nos últimos 60 minutos.
            const { data } = await admin
              .from("pix_transactions")
              .select("order_ref,amount,created_at,status")
              .eq("amount", amountReaisFromGateway)
              .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
              .order("created_at", { ascending: false })
              .limit(10);
            candidate =
              ((data as any[]) || []).find(
                (r) => r.order_ref && String(r.order_ref).startsWith("pix_"),
              ) || null;
          }

          if (candidate?.order_ref) {
            orderRef = String(candidate.order_ref);
            reconciled = true;
          }
        }

        let knownAmountReais = 0;
        const rowsMissingAmount: string[] = [];
        for (const id of allIds) {
          const { data: existing } = await admin
            .from("pix_transactions")
            .select("*")
            .eq("transaction_id", id)
            .maybeSingle();

          if (existing) {
            const existingAmount = Number((existing as any).amount) || 0;
            if (existingAmount > 0) {
              const normalized =
                Number.isInteger(existingAmount) && existingAmount >= 1000
                  ? existingAmount / 100
                  : existingAmount;
              if (String(id) === String(orderRef) || knownAmountReais <= 0) {
                knownAmountReais = normalized;
              }
            } else {
              rowsMissingAmount.push(id);
            }
            await admin
              .from("pix_transactions")
              .update({ ...patch, order_ref: orderRef })
              .eq("transaction_id", id);
          } else {
            if (amountReaisFromGateway <= 0) rowsMissingAmount.push(id);
            await admin.from("pix_transactions").insert({
              transaction_id: id,
              order_ref: orderRef,
              // Nunca grava 0: um valor zerado vazava para a Utmify.
              amount: amountReaisFromGateway > 0 ? amountReaisFromGateway : 0,
              // Notificação órfã (sem pedido nosso e sem reconciliação): não
              // pode virar venda na Utmify/Meta, senão duplica o pagamento.
              ...(hasOwnRow || reconciled
                ? {}
                : { utmify_enviado: true, capi_enviado: true }),
              ...patch,
            });
          }
        }

        const paidIds: string[] = status === "paid" ? allIds : [];

        // Propaga o valor real do pedido para as linhas que ficaram sem valor
        // (ids extras criados pelo webhook do gateway).
        const fillAmount = knownAmountReais > 0 ? knownAmountReais : amountReaisFromGateway;
        if (fillAmount > 0 && rowsMissingAmount.length) {
          await admin
            .from("pix_transactions")
            .update({ amount: fillAmount })
            .in("transaction_id", rowsMissingAmount);
        }

        if (paidIds.length && (hasOwnRow || reconciled)) {
          await settlePaidTransaction(
            admin,
            reconciled ? [...paidIds, orderRef] : paidIds,
            patch.paid_at as string,
          );
        }



        return new Response("ok", { status: 200 });
      },
    },
  },
});