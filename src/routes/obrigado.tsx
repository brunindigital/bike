import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/obrigado")({
  head: () => ({
    meta: [
      { title: "Pedido confirmado — TikTok Shop" },
      {
        name: "description",
        content:
          "Seu pagamento via PIX foi confirmado. Acompanhe o código de rastreio do seu pedido pelo e-mail cadastrado.",
      },
      { property: "og:title", content: "Pedido confirmado — TikTok Shop" },
      {
        property: "og:description",
        content: "Seu pagamento via PIX foi confirmado e o pedido já está em separação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Pedido confirmado — TikTok Shop" },
      {
        name: "twitter:description",
        content: "Seu pagamento via PIX foi confirmado e o pedido já está em separação.",
      },
    ],
  }),
  component: Obrigado,
});

function Obrigado() {
  return (
    <iframe
      src="/obrigado.html"
      title="Obrigado"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}