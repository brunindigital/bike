import { useEffect, useState } from "react";
import { ensureValidCpf } from "./cpf";
import { getFbData, getTracking } from "@/lib/tracking";
import type { CustomerData } from "./useCustomerData";

export interface PrefetchPixData {
  qrCode: string;
  qrImageUrl: string;
  reference: string;
}

export interface UsePixPrefetchResult {
  data: PrefetchPixData | null;
  loading: boolean;
  error: string | null;
}

export function usePixPrefetch(
  amount: number,
  details: string,
  customer: { data: CustomerData; isLoaded: boolean },
): UsePixPrefetchResult {
  const [data, setData] = useState<PrefetchPixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer.isLoaded) return;

    let cancelled = false;

    const generatePix = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/public/pix/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            client: {
              name: customer.data.name,
              email: customer.data.email,
              document: ensureValidCpf(customer.data.cpf),
              phone: customer.data.phone.replace(/\D/g, ""),
            },
            products: [{ name: details, quantity: 1, price: amount }],
            tracking: getTracking(),
            fb: getFbData(),
          }),
        });
        const json = await res.json().catch(() => null);

        if (cancelled) return;

        if (json?.copyPaste && json?.transactionId) {
          const ids = [json.transactionId, json.gatewayTransactionId].filter(Boolean).join(",");
          try {
            localStorage.setItem("lastPixTx", ids);
            localStorage.setItem("lastPixTxAt", String(Date.now()));
          } catch {
            // ignora
          }
          setData({
            qrCode: json.copyPaste,
            qrImageUrl: json.qrCode || "",
            reference: ids,
          });
        } else {
          setError(json?.message || "Nao foi possivel gerar o PIX. Tente novamente.");
        }
      } catch {
        if (!cancelled) {
          setError("Erro ao processar. Tente novamente.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    generatePix();

    return () => {
      cancelled = true;
    };
  }, [amount, details, customer.isLoaded, customer.data.name, customer.data.email, customer.data.cpf, customer.data.phone]);

  return { data, loading, error };
}
