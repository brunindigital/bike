/**
 * Catálogo de produtos com IDs estáveis.
 *
 * O `external_ref` enviado ao gateway precisa ser ÚNICO E FIXO por produto
 * (nunca por transação). Por isso cada produto tem um ID definido aqui e é
 * esse ID que vai no payload do gateway.
 */

const CATALOG: Record<string, string> = {
  // Front atual (Bike Ergométrica Spinning)
  "bike ergometrica spinning": "bike-ergometrica-spinning",
  "bike ergometrica spinning profissional 120kg": "bike-ergometrica-spinning",
  "bicicleta bike ergometrica spinning academia fitness profissional 120kg": "bike-ergometrica-spinning",
  "bicicleta ergometrica spinning profissional 120kg": "bike-ergometrica-spinning",
  "tapete de protecao para piso 120x60cm": "tapete-protecao-piso",
  "garrafa termica inox 750ml com tampa e canudo": "garrafa-termica-750",
  "kit 2 halteres faixa elastica de resistencia": "kit-halteres-faixa",
  "toalha fitness de microfibra alta absorcao": "toalha-fitness-microfibra",
  // Front antigo (Kit 10 Potes Herméticos de Vidro 640ml)
  "kit pote": "conjunto-potes-hermeticos-640",
  "kit potes": "conjunto-potes-hermeticos-640",
  "kit 10 potes hermeticos de vidro 640ml": "conjunto-potes-hermeticos-640",
  "kit 10 potes hermeticos": "conjunto-potes-hermeticos-640",
  // Upsells da linha hermética
  "kit hermetico chef": "conjunto-hermetico-chef",
  "kit hermetico master": "conjunto-hermetico-master",
  "garantia premium 12 meses": "garantia-premium-12m",
  "envio expresso seguro de entrega": "envio-expresso-seguro",
  "panela de pressao potes hermeticos antiaderente 4 2l": "panela-pressao-antiaderente",
  // Front (checkout principal)

  "kit panela": "conjunto-culinario-premium",
  "conjunto culinario premium": "conjunto-culinario-premium",
  "kit 10 pecas colinox": "conjunto-culinario-premium",
  "kit 10 pecas colinox (marmore)": "conjunto-culinario-premium",
  "kit 10 pecas colinox (quartzo)": "conjunto-culinario-premium",
  "kit 10 pecas colinox (grafite)": "conjunto-culinario-premium",
  "kit 10 pecas colinox (oliva)": "conjunto-culinario-premium",
  "kit 10 pecas colinox (preta)": "conjunto-culinario-premium",
  "kit 10 pecas colinox (bege)": "conjunto-culinario-premium",
  "kit 10 pecas colinox (marrom)": "conjunto-culinario-premium",
  "kit 10 pecas colinox (rosa)": "conjunto-culinario-premium",
  // Novas linhas (produtos distintos, ref própria e fixa)
  "kit 10 pecas colinox acqua": "conjunto-culinario-acqua",
  "kit acqua": "conjunto-culinario-acqua",
  "acqua": "conjunto-culinario-acqua",
  "kit 10 pecas colinox fiori": "conjunto-culinario-fiori-grill",
  "kit fiori": "conjunto-culinario-fiori-grill",
  "fiori": "conjunto-culinario-fiori-grill",
  // Upsells
  "kit panela pro": "conjunto-culinario-pro",
  "conjunto culinario pro": "conjunto-culinario-pro",
  "kit panela chef": "conjunto-culinario-chef",
  "conjunto culinario chef": "conjunto-culinario-chef",
  "kit panela simples": "conjunto-culinario-essencial",
  "conjunto culinario essencial": "conjunto-culinario-essencial",
  "kit panela master": "conjunto-culinario-master",
  "conjunto culinario master": "conjunto-culinario-master",
  // Order bumps
  "jogo de jantar 10 pecas oxford": "conjunto-jantar-oxford",
  "jogo de jantar 10 pecas oxford ryo maresia": "conjunto-jantar-oxford",
  "conjunto de jantar oxford 10 pecas": "conjunto-jantar-oxford",
  "panela de pressao colinox": "panela-pressao-antiaderente",
  "panela de pressao colinox antiaderente 4 2l": "panela-pressao-antiaderente",
  "panela de pressao antiaderente 4 2l": "panela-pressao-antiaderente",
  "kit potes hermeticos": "conjunto-potes-hermeticos",
  "kit 10 potes de vidro hermeticos colinox": "conjunto-potes-hermeticos",
  "kit copos nadir": "conjunto-copos-nadir",
  "kit de 24 unidades de copos vidro nadir suco agua 300ml": "conjunto-copos-nadir",
  "conjunto de copos nadir 24 unidades 300ml": "conjunto-copos-nadir",
  // Frete
  "frete gratis": "frete-gratis",
  jadlog: "frete-jadlog",
  "sedex 12": "frete-sedex12",
};


function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Variações do mesmo produto (cor, embalagem, etc.) precisam do MESMO id.
 * Ex.: "Kit Panela - Preta" e "Kit Panela - Bege" => "kit-panela".
 */
function stripVariant(key: string): string {
  return key
    .replace(/\b(preta|preto|cinza|bege|marrom|rosa|marmore|quartzo|grafite|oliva|verde|azul|vermelha|vermelho|transparente)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(name: string): string {
  return normalize(name).replace(/\s+/g, "-").slice(0, 60) || "produto";
}

/** ID estável do produto — sempre o mesmo para o mesmo produto. */
export function productExternalRef(name: string): string {
  const key = normalize(name);
  const base = stripVariant(key);
  return CATALOG[key] || CATALOG[base] || `produto-${slug(base || name)}`;
}

/**
 * Nome comercial enviado ao GATEWAY (descrição da cobrança).
 * Nomes profissionais e neutros — sem "potes", "herméticos" etc.
 */
const GATEWAY_NAMES: Record<string, string> = {
  "bike-ergometrica-spinning": "EQUIPAMENTO FITNESS BIKE INDOOR PRO",
  "tapete-protecao-piso": "ACESSORIO FITNESS TAPETE PROTECAO",
  "garrafa-termica-750": "ACESSORIO FITNESS GARRAFA TERMICA 750",
  "kit-halteres-faixa": "ACESSORIO FITNESS KIT HALTERES E FAIXA",
  "toalha-fitness-microfibra": "ACESSORIO FITNESS TOALHA MICROFIBRA",
  "conjunto-potes-hermeticos-640": "KIT CULINARIO PREMIUM ARMAZENAMENTO 640",
  "conjunto-potes-hermeticos": "KIT CULINARIO PREMIUM ARMAZENAMENTO",
  "conjunto-hermetico-chef": "KIT CULINARIO PREMIUM ARMAZENAMENTO CHEF",
  "conjunto-hermetico-master": "KIT CULINARIO PREMIUM ARMAZENAMENTO MASTER",
  "conjunto-culinario-premium": "KIT CULINARIO PREMIUM LINHA ESSENCIAL",
  "conjunto-culinario-acqua": "KIT CULINARIO PREMIUM LINHA ACQUA",
  "conjunto-culinario-fiori-grill": "KIT CULINARIO PREMIUM LINHA FIORI",
  "conjunto-culinario-pro": "KIT CULINARIO PREMIUM LINHA PRO",
  "conjunto-culinario-chef": "KIT CULINARIO PREMIUM LINHA CHEF",
  "conjunto-culinario-essencial": "KIT CULINARIO PREMIUM LINHA CLASSIC",
  "conjunto-culinario-master": "KIT CULINARIO PREMIUM LINHA MASTER",
  "conjunto-jantar-oxford": "KIT CULINARIO PREMIUM MESA POSTA",
  "panela-pressao-antiaderente": "KIT CULINARIO PREMIUM COCCAO RAPIDA",
  "conjunto-copos-nadir": "KIT CULINARIO PREMIUM LINHA CRISTAL",
  "garantia-premium-12m": "SERVICO PREMIUM GARANTIA ESTENDIDA 12M",
  "envio-expresso-seguro": "SERVICO PREMIUM ENVIO EXPRESSO",
  "frete-gratis": "SERVICO DE ENTREGA PADRAO",
  "frete-jadlog": "SERVICO DE ENTREGA EXPRESSA",
  "frete-sedex12": "SERVICO DE ENTREGA PRIORITARIA",
};

/** Nome profissional para a cobrança no gateway. */
export function productGatewayName(name: string): string {
  const ref = productExternalRef(name);
  return GATEWAY_NAMES[ref] || "EQUIPAMENTO FITNESS BIKE INDOOR PRO";
}
