# Ajustes: escassez, cor marrom disponível e order bump

## 1. Card de escassez (homepage)

Trocar "Apenas 13 unidades disponíveis" por "Restam poucas unidades, feirão 50 anos Inox Home Center".

Refino visual mantendo o mesmo lugar e formato de "pílula" logo abaixo das avaliações:
- Tipografia mais firme e legível (peso semibold, tracking levemente fechado, duas linhas no mobile sem quebrar palavra).
- Paleta mais confiável em vez do vermelho puro de alerta: base neutra/âmbar profunda com detalhe em vermelho apenas no ponto pulsante, transmitindo escassez sem parecer erro.
- Acabamento premium: leve gradiente, borda fina e sombra suave, ícone de estoque/selo à esquerda e destaque em "feirão 50 anos" para reforçar o evento.
- Também atualizo a linha auxiliar do card de cor para "Preta, Marrom e Bege disponíveis • Rosa esgotada".

## 2. Cor Marrom disponível

- No modal de escolha de cor, a opção Marrom deixa de ser "ESGOTADO": botão habilitado, sem tarja, com a foto `images/cor-marrom.webp` já existente e preço R$ 61,90 igual às outras.
- Apenas Rosa permanece esgotada.
- No checkout, ao escolher Marrom a imagem e o nome do produto no carrinho passam a mostrar o kit marrom (o mapa de cores do checkout já tem a entrada `marrom`; garanto que a seleção seja gravada e lida corretamente do começo ao fim, incluindo o parâmetro na URL e o resumo do pedido enviado à gateway).

## 3. Order bump (página de entrega)

- Selo "MAIS VENDIDA" passa da Panela de Pressão Colinox para o Jogo de Jantar 10 Peças Oxford Ryo Maresia.
- Preço da Panela de Pressão Colinox: R$ 48,99 → R$ 49,99 (com recálculo automático do total e do valor do PIX, que já é derivado do estado do pedido).

## Detalhes técnicos

- `public/site.html`: bloco de urgência (linha ~42-49), linha de disponibilidade do card de cor (~59) e opção Marrom no modal (~126).
- `public/pagamento.html`: array `BUMPS` (~298-301) para tag e preço; mapa de cores (~854) e normalizador (~320/860) validados para Marrom.
- Nenhuma mudança na camada de pagamento (`ACTIVE_GATEWAY` / adaptadores) — o total continua sendo calculado pelo estado do pedido.
