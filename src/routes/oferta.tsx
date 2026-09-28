import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/oferta")({
  component: Oferta,
  head: () => ({
    meta: [
      { title: "Oferta exclusiva — Bike Ergométrica Spinning por R$ 61,90" },
      {
        name: "description",
        content:
          "Cupom exclusivo liberado: leve a Bike Ergométrica Spinning por apenas R$ 61,90 à vista no Pix, com frete grátis e garantia de 12 meses.",
      },
      { property: "og:title", content: "Oferta exclusiva — Bike Ergométrica por R$ 61,90" },
      {
        property: "og:description",
        content: "Cupom exclusivo só nessa sessão: Bike Ergométrica Spinning por R$ 61,90 no Pix.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Oferta() {
  return (
    <iframe
      src="/oferta.html"
      title="Oferta exclusiva"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
