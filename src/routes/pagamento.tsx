import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pagamento")({
  component: Pagamento,
});

function Pagamento() {
  return (
    <iframe
      src="/pagamento.html"
      title="Pagamento"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
