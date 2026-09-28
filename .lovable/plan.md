# Trocar o produto: Kit de Potes → Bicicleta Ergométrica Spinning

Substituição completa do produto em todas as etapas do funil, mantendo o layout, as animações e o gateway de pagamento (Veno) exatamente como estão.

## Produto novo

- Nome: Bicicleta Bike Ergométrica Spinning Academia Fitness Profissional 120kg
- Preço principal: R$ 87,90 (à vista no Pix, frete grátis)
- Preço do popup de saída (últimos lotes): R$ 67,90
- Variações: Preto, Vermelho e Cinza
- 5 fotos oficiais do TikTok Shop baixadas e servidas localmente (pasta de imagens da bike), incluindo a foto de capa/pré-carregamento

## Páginas e etapas atualizadas

1. **Página principal (oferta)**
   - Carrossel com as 5 fotos oficiais; o slide de vídeo dos potes é removido (não há vídeo do novo produto)
   - Título, preço, selo de frete grátis e seletor de cores (Preto / Vermelho / Cinza) com miniaturas
   - Benefícios e especificações reescritos para o nicho: estrutura reforçada até 120 kg, roda de inércia silenciosa, resistência regulável, banco e guidão ajustáveis em altura, monitor com tempo/velocidade/calorias, pedais com correia, rodinhas de transporte, montagem simples
   - Bloco de avaliações: nota 4.6 com 660+ avaliações, comentários reescritos falando de estrutura resistente, silêncio, montagem fácil e regulagens
   - Notificações de compra recente e gatilhos de prova social adaptados (nomes + "comprou a Bike Spinning agora")

2. **Checkout / resumo do pedido**
   - Nome, foto, cor e valores do pedido apontando para a bike
   - Order bumps trocados para: Tapete Protetor de Solo Anti-impacto, Garrafa Squeeze Térmica, Kit de Lubrificação e Manutenção, Garantia Estendida 2 Anos (com imagens geradas para cada um)
   - Lista de itens, textos de escassez e frete revisados

3. **Loja / vitrine**
   - Produtos, fotos, títulos e variações trocados para a bike

4. **Upsells 1 a 4 e página de obrigado**
   - Textos adaptados ao universo fitness, mantendo os valores e o fluxo atuais (Nota Fiscal, taxas, frete, reembolso)
   - Página de obrigado e o script que mostra "produto comprado" passam a exibir a bike

5. **Popup de back-redirect na home**
   - De R$ 87,90 para R$ 67,90, texto de últimos lotes, imagem da bike, gravando o preço com desconto no checkout

## Detalhes técnicos

- As 5 imagens são baixadas para `public/images/bike/` e referenciadas por caminho local (evita depender do CDN do TikTok).
- Imagens dos 4 order bumps geradas e salvas em `public/images/`.
- `src/lib/pix/products.ts`: novas chaves de catálogo e `external_ref` estáveis para bike, variações, bumps e upsells, com nomes de cobrança neutros no gateway.
- Edições nos HTML pré-renderizados (`site.html`, `pagamento.html`, `oferta.html`, `loja.html`, `upsell1-4.html`, `obrigado.html`), nos scripts (`produto-comprado.js`, `back-redirect.js`) e nas rotas React (`index.tsx`, `upsell1-4.tsx`, metadados/SEO de cada rota).
- Nenhuma alteração em integração de pagamento, rastreamento (UTM/Utmify/Meta) ou recuperação de funil.
- Validação: build limpo + checagem no navegador do carrossel, seletor de cores, checkout com bumps e geração de Pix.
