import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bicicleta Ergométrica Spinning Profissional 120kg | Oferta" },
      {
        name: "description",
        content:
          "Bike ergométrica spinning profissional: roda de inércia 6kg, painel LCD, suporta até 120kg. Oferta com frete grátis e garantia de 12 meses.",
      },
      { property: "og:title", content: "Bicicleta Ergométrica Spinning Profissional 120kg | Oferta" },
      {
        property: "og:description",
        content:
          "Bike ergométrica spinning profissional até 120kg. Oferta por tempo limitado com frete grátis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/site.html"
      title="Bike Ergométrica Spinning"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
      }}
    />
  );
}
