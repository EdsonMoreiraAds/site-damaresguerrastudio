-- Evolua Notas — esquema base.
-- Regra de ouro: o cliente (browser/PostgREST) só LÊ tabelas, e só o que a RLS permite.
-- Toda escrita passa por funções (0002) que validam organização, CNPJ e papel.

create type public.org_kind      as enum ('empresa', 'escritorio');
create type public.member_role   as enum ('admin', 'solicitante', 'operador');
create type public.request_status as enum
  ('rascunho','a_revisar','aprovada','processando','autorizada','rejeitada','em_verificacao');
create type public.ambiente      as enum ('homologacao', 'producao');
create type public.attempt_status as enum ('enviada', 'autorizada', 'rejeitada', 'indefinida');

-- ---------- validadores ----------
create function public.valid_cnpj(c text) returns boolean
language plpgsql immutable as $$
declare
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; d1 int; d2 int; i int;
begin
  if c is null or c !~ '^[0-9]{14}$' or c ~ '^([0-9])\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(c,i,1)::int * w1[i]; end loop;
  d1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0; for i in 1..13 loop s := s + substr(c,i,1)::int * w2[i]; end loop;
  d2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return d1 = substr(c,13,1)::int and d2 = substr(c,14,1)::int;
end $$;

create function public.valid_cpf(c text) returns boolean
language plpgsql immutable as $$
declare s int; d1 int; d2 int; i int;
begin
  if c is null or c !~ '^[0-9]{11}$' or c ~ '^([0-9])\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(c,i,1)::int * (11 - i); end loop;
  d1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0; for i in 1..10 loop s := s + substr(c,i,1)::int * (12 - i); end loop;
  d2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return d1 = substr(c,10,1)::int and d2 = substr(c,11,1)::int;
end $$;

-- ---------- organizações e acesso ----------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  kind        public.org_kind not null,
  plan        text not null check (plan in ('essencial','pro','escritorio')),
  four_eyes   boolean not null default false,   -- quem aprova não pode ser quem criou
  cycle_day   smallint not null default 1 check (cycle_day between 1 and 28),
  created_at  timestamptz not null default now(),
  check ((kind = 'empresa' and plan in ('essencial','pro')) or (kind = 'escritorio' and plan = 'escritorio'))
);

create table public.memberships (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.member_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships (user_id) where active;

create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  cnpj          text not null check (public.valid_cnpj(cnpj)),
  razao_social  text not null check (char_length(razao_social) between 2 and 200),
  municipio_ibge text not null check (municipio_ibge ~ '^[0-9]{7}$'),
  perfil_fiscal text not null default 'simples_me_epp',
  codigos_servico text[] not null default '{}',
  emissor       text not null default 'simulado' check (emissor in ('simulado','agente')),
  ambiente      public.ambiente not null default 'homologacao',
  -- Dados fiscais exigidos pela API Nacional (ver docs/REFERENCIA-EMISSOR.md)
  serie         text not null default '00001' check (serie ~ '^[0-9]{5}$' and serie::int between 1 and 49999),
  ctrib_nac     text check (ctrib_nac ~ '^[0-9]{6}$'),
  ctrib_mun     text check (ctrib_mun ~ '^[0-9]{3}$'),
  cloc_prestacao text check (cloc_prestacao ~ '^[0-9]{7}$'),
  aliq_simples  numeric(5,2) not null default 0 check (aliq_simples >= 0 and aliq_simples <= 100),
  texto_fixo    text not null default '' check (char_length(texto_fixo) <= 500),
  dps_seq       bigint not null default 0,            -- último número de DPS usado na série
  cert_valid_until date,                              -- informado pelo agente (A1 vence em 1 ano)
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (org_id, cnpj),
  -- o simulador jamais pode rodar em produção
  check (not (emissor = 'simulado' and ambiente = 'producao'))
);
create index on public.companies (org_id);

-- Acesso por CNPJ para quem não é admin.
create table public.company_access (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  primary key (company_id, user_id)
);
create index on public.company_access (user_id);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  role        public.member_role not null,
  company_ids uuid[] not null default '{}',
  invited_by  uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index invitations_pending on public.invitations (org_id, email) where accepted_at is null;

-- ---------- solicitações ----------
create table public.invoice_requests (
  id            uuid primary key default gen_random_uuid(),   -- também é o identificador do DPS (idempotência)
  org_id        uuid not null references public.organizations(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  status        public.request_status not null default 'rascunho',
  tomador_doc   text not null check (public.valid_cpf(tomador_doc) or public.valid_cnpj(tomador_doc)),
  tomador_nome  text not null check (char_length(tomador_nome) between 2 and 200),
  tomador_cep   text not null check (tomador_cep ~ '^[0-9]{8}$'),
  tomador_numero text not null check (char_length(tomador_numero) between 1 and 10),
  tomador_complemento text not null default '' check (char_length(tomador_complemento) <= 60),
  descricao     text not null check (char_length(descricao) between 3 and 2000),
  codigo_servico text not null check (char_length(codigo_servico) between 1 and 20),
  competencia   date not null check (competencia = date_trunc('month', competencia)::date),
  valor         numeric(14,2) not null check (valor > 0 and valor < 100000000),
  dps_numero    bigint,                                -- atribuído no 1º envio; estável nas reconsultas
  content_hash  text not null default '',
  approved_hash text,
  approved_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  sent_by       uuid references auth.users(id) on delete set null,
  sent_at       timestamptz,
  ambiente      public.ambiente,
  rejection_reason text,
  chave_acesso  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.invoice_requests (company_id, status);
create unique index on public.invoice_requests (company_id, dps_numero) where dps_numero is not null;
create index on public.invoice_requests (org_id, created_at desc);

-- Hash do conteúdo fiscal; se mudar depois da aprovação, volta para revisão.
create function public.trg_request_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.content_hash := encode(sha256(convert_to(concat_ws('|',
      new.company_id, new.tomador_doc, new.tomador_nome, new.tomador_cep, new.tomador_numero,
      new.tomador_complemento, new.descricao,
      new.codigo_servico, new.competencia, new.valor), 'UTF8')), 'hex');
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.content_hash <> old.content_hash then
    if old.status in ('processando','autorizada','em_verificacao') then
      raise exception 'nota_bloqueada' using errcode = 'P0001';
    end if;
    if old.status in ('aprovada','rejeitada') then
      new.status := 'a_revisar';
    end if;
    new.approved_hash := null; new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
create trigger request_guard before insert or update on public.invoice_requests
  for each row execute function public.trg_request_guard();

-- ---------- tentativas de emissão ----------
create table public.emission_attempts (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.invoice_requests(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  attempt_no  int not null,
  mode        text not null default 'emitir' check (mode in ('emitir','consultar')),
  ambiente    public.ambiente not null,
  status      public.attempt_status not null default 'enviada',
  external_id text,
  error       text,
  claimed_at  timestamptz,
  sent_at     timestamptz not null default now(),
  finished_at timestamptz,
  unique (request_id, attempt_no)
);
-- no máximo UMA tentativa em aberto por solicitação (trava duplo clique / corrida)
create unique index one_open_attempt on public.emission_attempts (request_id) where status = 'enviada';
-- no máximo UMA autorização por solicitação
create unique index one_authorization on public.emission_attempts (request_id) where status = 'autorizada';
create index on public.emission_attempts (company_id, status);

create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.invoice_requests(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind       text not null check (kind in ('xml','pdf')),
  path       text not null,
  sha256     text not null,
  created_at timestamptz not null default now(),
  unique (request_id, kind)
);

-- Consumo: uma linha por nota autorizada em PRODUÇÃO. unique(request_id) garante lançamento único.
create table public.usage_ledger (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null unique references public.invoice_requests(id) on delete cascade,
  attempt_id uuid not null references public.emission_attempts(id),
  created_at timestamptz not null default now()
);
create index on public.usage_ledger (org_id, created_at);

-- Auditoria append-only.
create table public.events (
  id         bigint generated always as identity primary key,
  org_id     uuid not null,
  company_id uuid,
  request_id uuid,
  actor      uuid,
  action     text not null,
  detail     jsonb not null default '{}',
  at         timestamptz not null default now()
);
create index on public.events (request_id, at);
create index on public.events (org_id, at desc);
create function public.trg_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'auditoria é somente-inserção'; end $$;
create trigger events_immutable before update or delete on public.events
  for each row execute function public.trg_events_immutable();
create trigger events_no_truncate before truncate on public.events
  for each statement execute function public.trg_events_immutable();

-- Agentes locais (guardam o A1; o SaaS só guarda o HASH do token de acesso).
create table public.agents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,  -- isolamento por CNPJ
  name         text not null check (char_length(name) between 2 and 80),
  token_hash   text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
