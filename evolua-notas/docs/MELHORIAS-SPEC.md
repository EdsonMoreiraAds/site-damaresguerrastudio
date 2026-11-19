# Correções e melhorias em relação a `Evolua_Notas_MVP.md`

## Correções
1. **Tomador sem endereço.** O fluxo só pedia "tomador"; a API exige CEP e número. Incluídos.
2. **Número da DPS indefinido.** A spec fala em "chave de idempotência" mas não em numeração. A DPS tem série (00001–49999 por API) e número sequencial por emissor; modelados e atribuídos uma única vez por nota.
3. **Status sem transições completas.** "Em verificação" não dizia como sair. Definido: só por **Consultar resultado** (nunca reenvio); a consulta resolve para Autorizada ou Rejeitada. Rejeitada → A revisar → Aprovada → novo envio.
4. **"Se os dados mudarem depois da aprovação, voltar à revisão"** estava só como intenção. Implementado com hash do conteúdo em trigger no banco.
5. **Resultado tardio.** Uma tentativa que deu timeout pode autorizar depois; a spec não cobria. Tratado: aceito se a nota ainda não foi autorizada; ignorado (sem 2º consumo) se outra tentativa já autorizou.
6. **Exemplo de cobrança** conferido: R$ 299 + 2×R$ 19 + 50×R$ 0,70 = **R$ 372,00** ✔ (coberto por teste).
7. **Plano de empresa** permite 1 CNPJ — a spec não dizia o que acontece ao cadastrar o 2º; agora é bloqueado.
8. **Produção** dependia de "validar antes" sem mecanismo. Agora é um bloqueio no banco (agente + dados fiscais + ≥ 1 autorização em homologação).

## Segurança adicionada (não estava na spec)
Escrita somente por funções; leitura por RLS; 404 uniforme; auditoria append-only; "quatro olhos" opcional; tokens de agente com hash e por CNPJ; URLs assinadas de 60 s para XML/PDF; MFA e confirmação de e-mail como requisito; convites atrelados a e-mail confirmado; cabeçalhos de segurança. Detalhes e pendências em `SEGURANCA.md`.

## Decisões em aberto (precisam de você)
- **Cobrança real** (Stripe/Asaas/Pagar.me) e emissão de nota do próprio SaaS.
- **Quem opera o agente** no escritório: instalação assistida ou autoatendimento?
- **Retenção** de XML/PDF e política de encerramento (LGPD × obrigação fiscal).
- **Preços**: tratados como hipótese a validar, como a spec já diz.
