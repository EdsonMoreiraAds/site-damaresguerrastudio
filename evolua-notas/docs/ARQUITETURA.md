# Arquitetura e escolha da hospedagem

## Recomendação: GitHub + Vercel + Supabase

```
Navegador ──► Vercel (Next.js: páginas, Server Actions, /api/agent/*)
                 │  JWT do usuário             │ service_role (só servidor)
                 ▼                             ▼
            Supabase Postgres (RLS + funções) ◄── Storage privado (XML/PDF, URL assinada de 60 s)
                 ▲
Agente local ────┘ HTTPS + token (hash no banco) — assina com o A1 e fala com a SEFIN Nacional
```

## Comparativo

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Supabase** (Postgres + Auth + Storage) | RLS pronta, login com MFA, bucket privado, backups/PITR, região São Paulo, tudo numa conta | acoplamento ao Supabase; plano gratuito pausa e não tem backup diário confiável | **Escolhido** |
| Postgres puro (Neon/RDS/VPS) | portabilidade total | você constrói login, recuperação de senha, MFA, storage, políticas de acesso e backup — meses de trabalho sensível a erro de segurança | Só se houver exigência de contrato |
| Só Vercel (KV/Blob) | simples | não é relacional; sem RLS; consumo e auditoria precisam de transação | Descartado |
| GitHub | — | não hospeda app nem banco | Usado para código, CI e revisão |

O isolamento por organização/CNPJ vive **no banco** (RLS + funções). Se um dia sair do Supabase, o esquema SQL é Postgres comum; só o login precisaria de substituto.

## Por que o certificado A1 NÃO fica no SaaS

A API Nacional exige **mTLS com o certificado do prestador** e assinatura XML. Funções serverless da Vercel não são lugar para guardar `.pfx` + senha de vários clientes: um vazamento permitiria emitir notas em nome de todos. O emissor de referência (Python) recomenda explicitamente rodar no computador do dono do certificado. Por isso: **agente local** — só trafega dados da nota; o `.pfx` e a senha nunca chegam ao SaaS.

Evolução futura possível: HSM/KMS com certificados em nuvem (A3 em nuvem) fornecidos pela certificadora, mantendo a chave fora do app.

## Custos e limites a considerar (confirme os preços atuais)

- **Vercel**: o plano gratuito (Hobby) não permite uso comercial → usar Pro.
- **Supabase**: plano gratuito pausa por inatividade e não atende produção → usar Pro (backups diários, PITR opcional).
- **Varredura de tentativas paradas**: use `pg_cron` do Supabase (`docs/DEPLOY.md`), sem depender do cron da Vercel.
