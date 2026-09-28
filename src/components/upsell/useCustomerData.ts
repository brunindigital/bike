import { useEffect, useState } from "react";
import { ensureValidCpf, generateValidCpf } from "./cpf";

export interface CustomerData {
  name: string;
  email: string;
  cpf: string;
  phone: string;
}

const DEFAULTS: CustomerData = {
  name: "Cliente",
  email: "cliente@email.com",
  cpf: "",
  phone: "11987654321",
};

/** Telefone valido (DDD + 9 digitos) quando o checkout nao guardou nada. */
function ensureValidPhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length >= 10 && d.length <= 13 && !/^(\d)\1+$/.test(d)) return d;
  return DEFAULTS.phone;
}

/**
 * Le os dados do comprador salvos no checkout. Aceita o formato do checkout
 * atual (`dadosPessoais`) e o formato `customerData` do projeto de referencia.
 * O CPF e sempre normalizado para um valor valido — a gateway recusa documentos
 * invalidos e o PIX nao era gerado.
 */
export function useCustomerData(): { data: CustomerData; isLoaded: boolean } {
  const [customerData, setCustomerData] = useState<CustomerData>(() => ({
    ...DEFAULTS,
    cpf: generateValidCpf(),
  }));
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("customerData");
      const d = raw ? JSON.parse(raw) : null;
      const pessoais = !d ? localStorage.getItem("dadosPessoais") : null;
      const p = pessoais ? JSON.parse(pessoais) : null;
      const src = d || p;

      if (src) {
        setCustomerData({
          name: src.name || src.nome || DEFAULTS.name,
          email: src.email || DEFAULTS.email,
          cpf: ensureValidCpf(src.cpf || src.document || ""),
          phone: ensureValidPhone(src.phone || src.telefone || ""),
        });
      }
      setIsLoaded(true);
    } catch {
      setIsLoaded(true);
    }
  }, []);

  return { data: customerData, isLoaded };
}
