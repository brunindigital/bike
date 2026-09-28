import { createFileRoute } from "@tanstack/react-router";
import { sendTransactionalEmailServer } from "@/lib/email/send.server";

export const Route = createFileRoute("/api/public/email-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let email = "joaomcapistrano@gmail.com";
        try {
          const body = await request.json();
          if (typeof body?.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
            email = body.email;
          }
        } catch {
          // sem corpo: usa o padrão
        }
        const result = await sendTransactionalEmailServer({
          templateName: "rastreio-pedido",
          recipientEmail: email,
          idempotencyKey: `email-test-${Date.now()}`,
          templateData: {
            nome: "Cliente",
            pedido: "TESTE-001",
            codigoRastreio: "BR123456789TEST",
            linkRastreio: "https://trackflowsystem.lovable.app/rastreio/BR123456789TEST",
            endereco: "Rua de Teste, 123 — Centro, São Paulo/SP",
            produto: "Bike Ergométrica Spinning Profissional 120kg",
            imagem: "https://inoxhome.lovable.app/images/bike-ergometrica-spinning.webp",
          },
        });

        return Response.json(result);
      },
    },
  },
});
