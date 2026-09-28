import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM = `Você é o atendente virtual da loja Inox Home Online (suporte oficial do Kit 10 Peças Colinox).
Responda SEMPRE em português do Brasil, de forma curta (máx. 3 frases), educada e objetiva.

Informações oficiais que você deve usar:
- Produto: Kit 10 Peças Colinox. Cores disponíveis: Preta e Bege (Marrom e Rosa estão esgotadas).
- Pagamento: somente via PIX, aprovação imediata após o pagamento.
- Frete: Grátis, JADLOG (R$ 18,47) ou SEDEX 12 (R$ 33,40), escolhido no checkout.
- Prazo de entrega: Grátis/JADLOG de 5 a 9 dias úteis; SEDEX 12 de 2 a 5 dias úteis, após confirmação do pagamento.
- Código de rastreio é enviado por e-mail em até 24h úteis após o pagamento confirmado.
- Garantia: 7 dias para troca/devolução por arrependimento e 90 dias contra defeito de fabricação.
- Nota fiscal enviada por e-mail.
- Se o cliente pagou e não recebeu confirmação, peça o e-mail usado na compra e informe que a equipe verifica em até 24h úteis.

Nunca invente dados de pedido, não peça senha, cartão ou dados bancários. Se não souber, oriente o cliente a aguardar o e-mail de confirmação ou responder este chat com o e-mail da compra.`;

export const Route = createFileRoute("/api/public/support/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages?: Msg[] };
          const history = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
          if (history.length === 0) {
            return Response.json({ error: "missing_messages" }, { status: 400 });
          }
          const key = process.env["LOVABLE_API_KEY"];
          if (!key) return Response.json({ error: "missing_key" }, { status: 500 });

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model: "google/gemini-3.6-flash",
              messages: [
                { role: "system", content: SYSTEM },
                ...history.map((m) => ({
                  role: m.role === "assistant" ? "assistant" : "user",
                  content: String(m.content ?? "").slice(0, 2000),
                })),
              ],
            }),
          });

          if (res.status === 429) return Response.json({ error: "rate_limited" }, { status: 429 });
          if (res.status === 402) return Response.json({ error: "no_credits" }, { status: 402 });
          if (!res.ok) {
            console.error("support chat gateway error", res.status, await res.text());
            return Response.json({ error: "gateway_error" }, { status: 502 });
          }

          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const reply = data.choices?.[0]?.message?.content?.trim();
          if (!reply) return Response.json({ error: "empty_reply" }, { status: 502 });
          return Response.json({ reply });
        } catch (error) {
          console.error("support chat failed", error);
          return Response.json({ error: "unexpected" }, { status: 500 });
        }
      },
    },
  },
});
