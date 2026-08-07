# Studio Damares Guerra

Landing page de vendas para o Studio Damares Guerra (salão de beleza feminina, Horizonte - CE):
hero, serviços, prova social, produtos, preços, depoimentos, localização e agendamento via WhatsApp.

Arquivo único e autossuficiente (`index.html`) — CSS e JS embutidos no próprio arquivo,
para funcionar em qualquer host de arquivo estático sem depender de pasta de assets separada.

Paleta e logo seguem a identidade real da marca (pílula terracota + monograma DG + wordmark
"studio Damares Guerra"). Endereço, telefone e link do Instagram usados no site são os reais
do perfil do Google Meu Negócio.

## Dados reais já aplicados
- WhatsApp/telefone: (85) 99160-5404
- Endereço: Pátio Horizonte, Av. Presidente Castelo Branco, 3835, Lj 06, Centro, Horizonte - CE, 62880-384
- Instagram: @damaresguerrastudio
- Avaliação: 4,9 ★ (109 avaliações no Google)

## Antes de publicar
- A logo em SVG no `index.html` é uma recriação aproximada (só temos a referência visual, não o
  arquivo vetorial original). Se tiver o `.svg`/`.ai` original, substitua o `<svg class="logo-mark">`
  (aparece 2x) e o `<link rel="icon">` por ele para ficar pixel-perfect.
- A seção "Linha Home Care" já lista os produtos reais da Garden Hair (Force Açaí, Cotton, Defined
  Curls, Engrossador) com as cores dos frascos reais — mas os **preços são ilustrativos**. Ajuste
  no array `products` dentro do `<script>` para os valores reais de venda.
- Troque os blocos de cor dos produtos por fotos reais dos frascos (mesmo array `products`, campo `color` → pode virar `image`).
- Troque os blocos de vídeo (`.video-thumb`) por embeds reais do YouTube/Instagram.
- Substitua os blocos de cor de galeria e depoimentos por fotos reais (arrays `gallery` e `testimonials`).
- Ajuste os textos de preço/pacotes na seção "Investimento" — os valores atuais são exemplos ilustrativos.
- Os depoimentos e nomes de clientes são fictícios (exemplo) — substitua por avaliações reais do Google/Instagram.

## Rodar localmente
```
python3 -m http.server 8080
```
