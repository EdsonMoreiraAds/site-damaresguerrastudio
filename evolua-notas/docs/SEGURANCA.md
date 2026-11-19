# Segurança

## Modelo de ameaça resumido
Dados sensíveis: documentos fiscais (CPF/CNPJ de tomadores, valores), XML/PDF, tokens dos agentes. Ativo crítico: **capacidade de emitir nota em nome do CNPJ**.

## Controles implementados

| Risco | Controle | Onde |
|---|---|---|
| Usuário vê/altera dados de outro CNPJ ou organização | RLS em todas as tabelas; helpers `can_access_company`/`is_admin`; **sem política de escrita** — clientes só leem | `0003_security.sql` |
| Acesso direto à API REST contornando a interface | tabelas sem `INSERT/UPDATE/DELETE` para `authenticated`; escrita só por funções `SECURITY DEFINER` que revalidam papel e CNPJ | `0002_functions.sql` |
| Enumerar notas por ID | "sem acesso" responde igual a "não existe" (`nao_encontrado`, 404) | `_req_locked` |
| Emissão duplicada (duplo clique, retry, timeout) | `FOR UPDATE` na nota; índice único de tentativa aberta e de autorização; UUID da nota = identificador estável da DPS; timeout → *Em verificação* (nunca reenvia); resultado repetido é idempotente | `begin_send`, `finish_attempt` |
| Alterar dados depois de aprovar | hash do conteúdo em trigger; edição invalida aprovação; envio exige `approved_hash = content_hash` | `trg_request_guard` |
| Consumo contado duas vezes / homologação cobrada | `usage_ledger.request_id UNIQUE`; só `ambiente = producao` | `finish_attempt` |
| Simulador emitindo "de verdade" | `CHECK (emissor='simulado' → ambiente='homologacao')` + recusa no executor | `companies`, `fiscal/run.ts` |
| Produção ligada sem teste | exige agente, dados fiscais completos e ao menos 1 emissão autorizada em homologação | `enable_production` |
| Auditoria adulterada | `events` append-only (trigger bloqueia UPDATE/DELETE/TRUNCATE); registra quem criou/editou/aprovou/enviou/baixou | `events` |
| Conflito de interesses | regra opcional "quatro olhos": quem criou não aprova | `organizations.four_eyes` |
| Roubo de token do agente | 256 bits aleatórios; só SHA-256 no banco; coluna `token_hash` sem `SELECT`; revogável; agente vinculado a **um** CNPJ | `agents`, `agent_claim_job` |
| Vazamento do certificado A1 | nunca entra no SaaS; sem campo, tabela ou log para isso | arquitetura |
| Download de XML/PDF por quem não deve | bucket privado sem políticas; rota valida via RLS, registra o download e entrega URL assinada de 60 s | `/api/documentos/[id]` |
| Convite sequestrado | convite casa com e-mail **confirmado**; exige "Confirm email" ligado | `accept_invitations` |
| Perda do último admin | bloqueado | `set_member_access` |
| Chave `service_role` exposta | só em `server-only`, sem prefixo `NEXT_PUBLIC_`; usada apenas depois de autenticar chamador/agente | `lib/supabase/admin.ts` |
| XSS / clickjacking / downgrade | CSP, `X-Frame-Options: DENY`, HSTS, `nosniff`, Referrer/Permissions-Policy; React escapa saída; XML escapado no simulador | `next.config.mjs` |
| CSRF | Server Actions (Origin check do Next) + cookies `SameSite` do Supabase | Next |
| Mensagens de erro vazando internos | só códigos conhecidos são traduzidos; o resto vira texto genérico | `lib/errors.ts` |
| Sessão forjada | middleware usa `auth.getUser()` (valida o JWT no servidor), não `getSession()` | `middleware.ts` |
| Open redirect | callback redireciona sempre para `NEXT_PUBLIC_SITE_URL` | `auth/callback` |

Tudo acima marcado com RLS/idempotência/consumo é exercitado por `npm run test:db` (inclui: usuário sem vínculo, acesso direto, operador de outro CNPJ, funções de serviço negadas ao cliente, resultado tardio sem duplicar, homologação fora do consumo).

## Obrigatório antes de produção (configuração, não código)

1. Supabase Auth: **Confirm email = ON**, senha mínima 10, **MFA (TOTP) obrigatório** para admins e operadores fiscais, proteção contra vazamento de senhas, rate limits ativos, `Site URL` e Redirect URLs só do seu domínio.
2. Supabase: remover a `anon key` de qualquer uso que não seja o app; **Data API → expor apenas o schema `public`**; conferir em *Advisors → Security* que não há alertas de RLS.
3. Vercel: variáveis secretas só em *Production/Preview* marcadas como sensíveis; proteção de deploy de preview; domínio próprio com HTTPS.
4. Backups: Supabase Pro com PITR; teste de restauração trimestral.
5. Região São Paulo; contrato/DPA com os operadores; política de retenção (XML fiscal: guardar pelo prazo legal — em geral 5 anos; confirme com a contabilidade).
6. **LGPD**: o SaaS trata dados de terceiros (tomadores) como operador; defina base legal com o cliente, canal de titular, e exclusão/anonimização ao encerrar contrato (respeitando o prazo fiscal).
7. Monitoramento: alerta em picos de `agente_invalido`, rejeições e `nota.resultado_duplicado_ignorado`.
8. Teste de intrusão do fluxo de agente antes do primeiro cliente real.

## Limitações conhecidas
- Rate limit do endpoint do agente é em memória (por instância serverless): serve de freio, não de garantia. Em produção, usar Vercel Firewall/WAF ou Upstash.
- CSP usa `'unsafe-inline'` para scripts por causa do Next; evoluir para nonces.
- Mudança de plano é manual (sem cobrança automática); o usuário não consegue alterá-lo pelo app.
- `npm audit` aponta PostCSS (dependência de build do Next 15) com advisories de CSS controlado por atacante. O projeto só compila o próprio CSS, então o risco prático é baixo; resolver migrando para a versão do Next que traga o PostCSS corrigido (Next 16.x) antes do go-live.
