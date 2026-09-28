import { useState, useEffect, useMemo } from "react";
import { X, Copy, Clock, Loader2, CheckCircle } from "lucide-react";
import { upsellTokens } from "./tokens";
import { ensureValidCpf } from "./cpf";
import { getFbData, getTracking } from "@/lib/tracking";
import type { PrefetchPixData } from "./usePixPrefetch";

interface PixModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  title: string;
  customerName: string;
  customerEmail: string;
  customerCpf: string;
  customerPhone: string;
  details: string;
  onSuccess: () => void;
  prefetchedData?: PrefetchPixData | null;
  prefetchLoading?: boolean;
  prefetchError?: string | null;
}

const PINK = "#FF3B66";

/** Gera o PIX na Veno (gateway ativa) através da API pública do site. */
const PixModal = ({
  isOpen,
  onClose,
  amount,
  title,
  customerName,
  customerEmail,
  customerCpf,
  customerPhone,
  details,
  onSuccess,
  prefetchedData,
  prefetchLoading = false,
  prefetchError = null,
}: PixModalProps) => {
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrImageUrl: string;
    reference: string;
  } | null>(prefetchedData || null);
  const [copied, setCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "approved">("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(prefetchError);

  // Timer de 14 minutos
  const expiresAtMs = useMemo(() => Date.now() + 14 * 60 * 1000, [pixData]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const remainingMs = Math.max(0, expiresAtMs - now);
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);
  const timerText = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  // Sincroniza dados pré-carregados quando chegam
  useEffect(() => {
    if (prefetchedData) {
      setPixData(prefetchedData);
      setErrorMessage(null);
    }
  }, [prefetchedData]);

  useEffect(() => {
    if (prefetchError && !pixData) {
      setErrorMessage(prefetchError);
    }
  }, [prefetchError, pixData]);

  // Gerar PIX quando o modal abre, caso não tenha sido pré-carregado
  useEffect(() => {
    if (!isOpen || pixData || loading || prefetchedData) return;

    const generatePix = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch("/api/public/pix/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            client: {
              name: customerName,
              email: customerEmail,
              document: ensureValidCpf(customerCpf),
              phone: customerPhone.replace(/\D/g, ""),
            },
            products: [{ name: details, quantity: 1, price: amount }],
            tracking: getTracking(),
            fb: getFbData(),
          }),
        });
        const data = await res.json().catch(() => null);

        if (data?.copyPaste && data?.transactionId) {
          const ids = [data.transactionId, data.gatewayTransactionId].filter(Boolean).join(",");
          try {
            localStorage.setItem("lastPixTx", ids);
            localStorage.setItem("lastPixTxAt", String(Date.now()));
          } catch {
            // ignora
          }
          setPixData({
            qrCode: data.copyPaste,
            qrImageUrl: data.qrCode || "",
            reference: ids,
          });
        } else {
          setErrorMessage(
            data?.message || "Não foi possível gerar o PIX agora. Tente novamente em instantes.",
          );
        }
      } catch {
        setErrorMessage("Erro ao processar. Tente novamente.");
      } finally {
        setLoading(false);
      }
    };

    generatePix();
  }, [isOpen]);

  // Polling para verificar status
  useEffect(() => {
    if (!pixData?.reference) return;
    if (paymentStatus === "approved") return;

    let stopped = false;
    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/public/pix/status?id=${encodeURIComponent(pixData.reference)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!stopped && data?.status === "paid") {
          setPaymentStatus("approved");
          setTimeout(() => onSuccess(), 2000);
        }
      } catch {
        // ignora
      }
    };

    const interval = setInterval(checkStatus, 5000);
    checkStatus();

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [pixData?.reference, paymentStatus, onSuccess]);

  const handleCopy = async () => {
    if (!pixData?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Não foi possível copiar.");
    }
  };

  // Reset state quando fecha
  useEffect(() => {
    if (!isOpen) {
      setPixData(null);
      setPaymentStatus("pending");
      setCopied(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      style={upsellTokens}
    >
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header com logo */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex-1" />
          <img src="/images/ttk-shop-up.png" alt="TikTok Shop" className="h-7" />
          <div className="flex-1 flex justify-end">
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Título e Valor */}
        <div className="text-center px-5 pb-4">
          <p className="text-gray-500 text-sm font-medium">{title}</p>
          <p className="text-4xl font-extrabold text-gray-900 mt-1">
            R$ {amount.toFixed(2).replace(".", ",")}
          </p>
        </div>

        {/* QR Code */}
        <div className="px-5 pb-4">
          <div className="flex justify-center">
            <div className="rounded-2xl border-2 border-gray-100 p-4 bg-white">
              {loading || !pixData?.qrImageUrl ? (
                <div className="w-48 h-48 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                </div>
              ) : (
                <img
                  src={pixData.qrImageUrl}
                  alt="QR Code PIX"
                  className="w-48 h-48 object-contain"
                />
              )}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="px-5 pb-4">
            <p className="text-sm text-center text-rose-500 font-medium">{errorMessage}</p>
          </div>
        )}

        {/* Botão Copiar */}
        <div className="px-5 pb-4">
          <button
            onClick={handleCopy}
            disabled={!pixData?.qrCode}
            className="w-full py-4 rounded-xl font-bold text-base text-white transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: copied ? "#2DB573" : PINK }}
          >
            <Copy className="w-5 h-5" strokeWidth={2.5} />
            {copied ? "Código copiado!" : "Copiar código PIX"}
          </button>
        </div>

        {/* Timer */}
        <div className="px-5 pb-3">
          <div className="flex items-center justify-center gap-2 text-amber-600">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">O PIX expira em:</span>
            <span className="font-bold text-base tabular-nums">{timerText}</span>
          </div>
        </div>

        {/* Status */}
        <div className="px-5 pb-4">
          {paymentStatus === "approved" ? (
            <div className="flex items-center justify-center gap-2 text-emerald-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold text-sm">Pagamento confirmado!</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-blue-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Aguardando confirmação...</span>
            </div>
          )}
        </div>

        {/* Código truncado */}
        {pixData?.qrCode && (
          <div className="px-5 pb-5">
            <p className="text-[10px] text-center text-gray-400 break-all line-clamp-2 leading-relaxed">
              {pixData.qrCode}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PixModal;
