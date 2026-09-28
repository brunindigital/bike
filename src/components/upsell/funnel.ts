/**
 * Estado do funil no navegador.
 *
 * O objetivo é simples: se o lead pagou (front ou qualquer upsell) e voltar ao
 * site depois — mesmo horas depois, em qualquer página — ele é levado
 * automaticamente para a próxima etapa do funil. O script
 * /js/resume-upsell.js lê estas chaves em todo carregamento de página.
 */

/** Registra qual é a próxima etapa caso o PIX atual seja confirmado. */
export function setNextStep(next: string) {
  try {
    localStorage.setItem("lvPixNext", next);
  } catch {
    // ignora
  }
}

/** Marca o PIX atual como já pago/consumido para não repetir o redirecionamento. */
export function markCurrentPixPaid(next: string) {
  try {
    const tx = localStorage.getItem("lastPixTx");
    if (tx) localStorage.setItem("pixPaid_" + tx, "1");
    localStorage.setItem("lvPixNext", next);
  } catch {
    // ignora
  }
}
