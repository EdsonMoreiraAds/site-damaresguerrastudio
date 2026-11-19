# Publicação (GitHub → Vercel + Supabase)

1. **Supabase**: crie o projeto (região **South America – São Paulo**). Em *SQL Editor* execute, na ordem, `supabase/migrations/0001_schema.sql`, `0002_functions.sql`, `0003_security.sql` (ou `supabase db push`).
2. **Auth** (Authentication → Providers/Settings): e-mail ligado, *Confirm email* ON, senha ≥ 10, ative MFA TOTP, defina *Site URL* e adicione `https://SEU-DOMINIO/auth/callback` em Redirect URLs.
3. **Varredura de tentativas paradas** (SQL Editor):
   ```sql
   create extension if not exists pg_cron;
   select cron.schedule('evolua-sweep', '*/5 * * * *', $$select public.sweep_stale_attempts(10)$$);
   ```
4. **Vercel**: *Add New → Project* → importe o repositório, **Root Directory = `evolua-notas`**. Variáveis (veja `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (sensível), `CRON_SECRET`.
5. Faça o primeiro login, crie a organização e cadastre uma empresa em **homologação / emissor simulado** para validar o fluxo.
6. Produção só depois do agente: `docs/REFERENCIA-EMISSOR.md`.

## Checklist de aceite do piloto (mapeado em testes)
| Critério | Verificação |
|---|---|
| Alternar entre 2 CNPJs; sem vínculo = negado, inclusive via API | `test:db` seções "critério 1" |
| Fluxo completo em homologação + corrigir rejeição | `test:db` "rejeição e correção" |
| Duplo clique/falha de conexão → 1 autorização | `test:db` "critério 3" |
| Quem aprovou e enviou identificável; documentos só para autorizados | `approved_by`/`sent_by`, `events`, `/api/documentos` |
| Consumo conta 1× em produção; homologação fora | `test:db` "critério 5" |
