import * as React from "react";
import { render } from "@react-email/render";
import { createClient } from "@supabase/supabase-js";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "Bike Ergométrica Spinning";
const RESEND_GATEWAY_URL = "https://connector-gateway.lovable.dev/resend/emails";


/**
 * Server-side transactional email send via Resend (no user JWT).
 * Only call from verified server contexts such as the payment webhook.
 */
export async function sendTransactionalEmailServer(opts: {
  templateName: string;
  recipientEmail: string;
  idempotencyKey?: string;
  templateData?: Record<string, any>;
}): Promise<{ success: boolean; reason?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return { success: false, reason: "not_configured" };
  }

  const template = TEMPLATES[opts.templateName];
  if (!template) return { success: false, reason: "template_not_found" };

  const recipient = template.to || opts.recipientEmail;
  if (!recipient) return { success: false, reason: "no_recipient" };
  const normalizedEmail = recipient.toLowerCase();

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: suppressed, error: suppressionError } = await supabase
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (suppressionError) return { success: false, reason: "suppression_check_failed" };
  if (suppressed) return { success: false, reason: "email_suppressed" };

  const templateData = opts.templateData ?? {};
  const element = React.createElement(template.component, templateData);
  const html = await render(element);
  const plainText = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function" ? template.subject(templateData) : template.subject;

  const messageId = opts.idempotencyKey || crypto.randomUUID();

  await supabase.from("email_send_log").insert({
    message_id: messageId,
    template_name: opts.templateName,
    recipient_email: recipient,
    status: "pending",
  });

  const resendApiKey = process.env.RESEND_API_KEY;
  const lovableApiKey = process.env.LOVABLE_API_KEY;
  if (!resendApiKey || !lovableApiKey) {
    await supabase
      .from("email_send_log")
      .update({ status: "failed", error_message: "RESEND_API_KEY or LOVABLE_API_KEY missing" })
      .eq("message_id", messageId);
    return { success: false, reason: "not_configured" };
  }

  const DEFAULT_FROM = `${SITE_NAME} <rastreio@focus-30.live>`;
  const envFrom = (process.env.RESEND_FROM || "").trim();
  const validFrom = /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/.test(envFrom) || /^[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/.test(envFrom);
  const from = validFrom ? envFrom : DEFAULT_FROM;

  // Domínio usado para reply-to e unsubscribe (mesmo domínio do remetente = melhor alinhamento DMARC)
  const fromAddress = from.includes("<") ? from.split("<")[1].replace(">", "").trim() : from;
  const fromDomain = fromAddress.split("@")[1];
  const replyTo = process.env.RESEND_REPLY_TO?.trim() || `suporte@${fromDomain}`;
  const unsubscribeUrl = `https://${fromDomain}/unsubscribe?email=${encodeURIComponent(recipient)}`;

  try {
    const res = await fetch(RESEND_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": resendApiKey,
        "Idempotency-Key": messageId,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        reply_to: replyTo,
        subject,
        html,
        text: plainText,
        headers: {
          "List-Unsubscribe": `<mailto:unsubscribe@${fromDomain}?subject=unsubscribe>, <${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "X-Entity-Ref-ID": messageId,
        },
      }),
    });


    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend send failed [${res.status}]: ${body}`);
      await supabase
        .from("email_send_log")
        .update({ status: "failed", error_message: `resend_${res.status}: ${body.slice(0, 400)}` })
        .eq("message_id", messageId);
      return { success: false, reason: `resend_${res.status}` };
    }

    await supabase
      .from("email_send_log")
      .update({ status: "sent" })
      .eq("message_id", messageId);

    return { success: true };
  } catch (err) {
    console.error("Resend send error", err);
    await supabase
      .from("email_send_log")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
      })
      .eq("message_id", messageId);
    return { success: false, reason: "send_failed" };
  }
}