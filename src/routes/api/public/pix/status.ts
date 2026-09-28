import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { fetchGatewayStatus, settlePaidTransaction } from "@/lib/pix/settle.server";

export const Route = createFileRoute("/api/public/pix/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ids = (url.searchParams.get("id") || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 5);
        if (!ids.length) {
          return Response.json({ error: "missing id" }, { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ status: "unknown" }, { status: 200 });
        }

        const client = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await client
          .from("pix_transactions")
          .select("status,paid_at")
          .in("transaction_id", ids);

        if (error) {
          return Response.json({ status: "unknown" }, { status: 200 });
        }
        const rows = data || [];
        const paidRow = rows.find((row) =>
          ["paid", "approved", "completed", "success", "succeeded"].includes(
            String(row.status || "").toLowerCase(),
          ),
        );

        // The gateway callback is not always delivered, so confirm directly with
        // Duck whenever our record still looks unpaid. This is what actually
        // releases the buyer to the upsell and triggers the tracking email.
        if (!paidRow) {
          for (const id of ids) {
            const remote = await fetchGatewayStatus(id);
            if (remote.paid) {
              await settlePaidTransaction(client, ids, remote.paidAt);
              return Response.json({ status: "paid", paidAt: remote.paidAt });
            }
          }
        }

        if (!rows.length) {
          return Response.json({ status: "pending" });
        }
        const paid = data.find((row) =>
          ["paid", "approved", "completed", "success", "succeeded"].includes(
            String(row.status || "").toLowerCase(),
          ),
        );
        const row = paid || data[0];
        const rawStatus = String(row.status || "pending").toLowerCase();
        const status = ["paid", "approved", "completed", "success", "succeeded"].includes(rawStatus)
          ? "paid"
          : rawStatus;

        return Response.json({
          status,
          paidAt: row.paid_at,
        });
      },
    },
  },
});