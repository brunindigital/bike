import { createFileRoute } from "@tanstack/react-router";

// Lightweight funnel beacon: logs the redirect from /pagamento → /upsell1
// so we can confirm the funnel end-to-end from server logs.
export const Route = createFileRoute("/api/public/analytics/upsell-redirect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = null;
        try {
          payload = await request.json();
        } catch {
          payload = { raw: await request.text().catch(() => "") };
        }
        console.log("[funnel] upsell_redirect", JSON.stringify(payload));
        return new Response("ok", { status: 200 });
      },
    },
  },
});
