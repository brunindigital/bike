---
name: Troca de gateway PIX
description: Adaptadores Veno/IronPay/Codefy/Plowf/FlevoPay, secrets e particularidades de cada API
type: feature
---
Toda a integração PIX passa por `src/lib/pix/gateways.server.ts`. Trocar de gateway = mudar `ACTIVE_GATEWAY`.

Gateway ativa: **VenoPayments** (`veno`).

- Veno: `POST https://beta.venopayments.com/api/v1/pix`, header `Authorization: Bearer VENO_API_KEY` (chave `veno_live_...`). `amount` em CENTAVOS, `external_id` = nosso id (idempotente), `callback_url` = webhook, `payer` completo obrigatório (name/email/document/phone) e `products` obrigatórios com soma `price*quantity` == `amount`. Resposta: `pix_copy_paste`/`qr_code_image`, `id`. Status: `GET /api/v1/pix/{id}/status`. Webhook: `{event:"deposit.paid", data:{id, external_id, status, paid_at}}`, sem assinatura.
- FlevoPay: `POST https://app.flevopay.com.br/api/v1/transaction`, header `X-API-Key: FLEVOPAY_API_KEY`.
- Plowf: `PLOWF_API_TOKEN`, webhook HMAC `PLOWF_WEBHOOK_TOKEN`, exige soma dos produtos == value.
- IronPay: precisa criar oferta por valor (`IRONPAY_PRODUCT_HASH`), rate limit agressivo.
- Codefy/Duck: headers `x-public-key`/`x-secret-key`; Duck não tem consulta de status.
