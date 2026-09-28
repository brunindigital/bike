import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  head: () => ({
    meta: [
      { title: "Cancelar inscrição | promonewshop" },
      {
        name: "description",
        content: "Cancele o recebimento de e-mails da promonewshop em um clique.",
      },
      { property: "og:title", content: "Cancelar inscrição | promonewshop" },
      {
        property: "og:description",
        content: "Cancele o recebimento de e-mails da promonewshop em um clique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function UnsubscribePage() {
  const [state, setState] = useState<
    "loading" | "valid" | "done" | "already" | "invalid" | "error"
  >("loading");
  const [token, setToken] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    if (!t) return setState("invalid");
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return setState("invalid");
        if (data.valid) return setState("valid");
        setState(data.reason === "already_unsubscribed" ? "already" : "invalid");
      })
      .catch(() => setState("error"));
  }, []);

  const confirm = async () => {
    setState("loading");
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await r.json().catch(() => ({}));
      if (data.success) setState("done");
      else if (data.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">Cancelar inscrição</h1>
        {state === "loading" && (
          <p className="mt-4 text-muted-foreground">Carregando…</p>
        )}
        {state === "valid" && (
          <>
            <p className="mt-4 text-muted-foreground">
              Confirme para parar de receber nossos e-mails.
            </p>
            <button
              onClick={confirm}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground"
            >
              Confirmar cancelamento
            </button>
          </>
        )}
        {state === "done" && (
          <p className="mt-4 text-muted-foreground">
            Pronto! Você não receberá mais nossos e-mails.
          </p>
        )}
        {state === "already" && (
          <p className="mt-4 text-muted-foreground">
            Sua inscrição já havia sido cancelada.
          </p>
        )}
        {state === "invalid" && (
          <p className="mt-4 text-muted-foreground">Link inválido ou expirado.</p>
        )}
        {state === "error" && (
          <p className="mt-4 text-muted-foreground">
            Não foi possível concluir. Tente novamente mais tarde.
          </p>
        )}
      </div>
    </main>
  );
}