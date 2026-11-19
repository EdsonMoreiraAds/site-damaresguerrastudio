# Evolua Notas

SaaS para solicitar, revisar e emitir NFS-e (Emissor Nacional) de vários CNPJs em um painel — para prestadores de serviço e escritórios contábeis. Implementa o MVP descrito em `Evolua_Notas_MVP.md`, com as correções e decisões de segurança listadas em `docs/MELHORIAS-SPEC.md`.

## Stack (e por que)

| Camada | Escolha | Motivo |
|---|---|---|
| Código e CI | **GitHub** | repositório, revisão, Actions (typecheck, testes, testes de banco) |
| App web + API | **Next.js 15 na Vercel** | deploy por push, Server Actions, preview por branch |
| Banco, login, arquivos | **Supabase** (Postgres + Auth + Storage) | RLS nativa, login pronto (MFA, e-mail), bucket privado com URL assinada, backups |

Comparativo completo e alternativas (Postgres puro, Neon, etc.) em `docs/ARQUITETURA.md`.

## Rodando

```bash
cd evolua-notas
cp .env.example .env.local      # preencha com as chaves do seu projeto Supabase
npm install
npm run dev
```

| Comando | O que faz |
|---|---|
| `cd agent && python -m pytest tests` | testes do agente local |
| `npm test` | testes unitários (validação de CNPJ/CPF, cobrança, status, emissor simulado) |
| `npm run test:db` | aplica as migrações num Postgres local descartável e roda mais de 30 verificações de RLS, idempotência e consumo |
| `npm run typecheck` / `npm run build` | tipos e build de produção |

Banco: aplique `supabase/migrations/0001..0003` (Supabase CLI `supabase db push` ou SQL Editor, em ordem). Passo a passo de publicação em `docs/DEPLOY.md`.

## Como funciona

`Rascunho → A revisar → Aprovada → Processando → Autorizada | Rejeitada | Em verificação`

- Toda **escrita** passa por funções no banco que validam organização, CNPJ e papel. O navegador só **lê**, filtrado por RLS — inclusive nas chamadas diretas à API REST do Supabase.
- **Edição depois da aprovação** muda o hash do conteúdo e devolve a nota à revisão; o envio só aceita nota cujo hash aprovado = hash atual.
- **Envio idempotente**: a nota é travada (`FOR UPDATE`), existe no máximo uma tentativa em aberto e uma autorização por solicitação (índices únicos). Timeout nunca reenvia: a nota vai para *Em verificação* e o operador usa **Consultar resultado**.
- **Consumo**: uma linha em `usage_ledger` por nota autorizada **em produção** (`unique(request_id)`); homologação, rejeições e duplicidades não entram.
- **Emissor**: `simulado` (só homologação, sem valor fiscal) ou **agente local** que guarda o certificado A1 no computador do cliente (`docs/REFERENCIA-EMISSOR.md`, `agent/PROTOCOLO.md`).

## Estado atual (honesto)

Pronto e testado: modelo de dados, RLS, fluxo completo em homologação simulada, consumo, plano, equipe/convites, auditoria, API do agente.
**Agente local** (`agent/`): escrito, com 10 testes (assinatura real, XSD, SEFIN simulada) e executável para Windows/macOS gerado pela CI (`agent-v*`); testado aqui só em Linux e **nunca contra a SEFIN real**.
**Não existe ainda**: cobrança automática, importação por Gmail, suporte a certificado A3/A1 em nuvem, assinatura do instalador (Microsoft/Apple), PDF no modo simulado. **Nenhuma nota real foi emitida** — a primeira emissão exige validar em homologação (produção restrita) com o certificado do cliente.

## Dispositivos
| Dispositivo | Uso |
|---|---|
| Windows / macOS com o certificado A1 | roda o agente (emite) e o painel |
| iPhone / iPad / Android | painel instalável (PWA: *Compartilhar → Adicionar à Tela de Início*) — criar, aprovar, acompanhar, baixar XML. **Não emite**: o iOS não guarda o .pfx nem abre mTLS com certificado de cliente |
