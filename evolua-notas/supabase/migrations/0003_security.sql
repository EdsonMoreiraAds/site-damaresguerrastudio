-- RLS + privilégios. Negado por padrão; o cliente só lê.

alter table public.organizations     enable row level security;
alter table public.memberships       enable row level security;
alter table public.companies         enable row level security;
alter table public.company_access    enable row level security;
alter table public.invitations       enable row level security;
alter table public.invoice_requests  enable row level security;
alter table public.emission_attempts enable row level security;
alter table public.documents         enable row level security;
alter table public.usage_ledger      enable row level security;
alter table public.events            enable row level security;
alter table public.agents            enable row level security;

create policy org_select on public.organizations for select to authenticated using (public.is_member(id));
create policy mem_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin(org_id));
create policy co_select on public.companies for select to authenticated using (public.can_access_company(id));
create policy ca_select on public.company_access for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin(org_id));
create policy inv_select on public.invitations for select to authenticated using (public.is_admin(org_id));
create policy req_select on public.invoice_requests for select to authenticated using (public.can_access_company(company_id));
create policy att_select on public.emission_attempts for select to authenticated using (public.can_access_company(company_id));
create policy doc_select on public.documents for select to authenticated using (public.can_access_company(company_id));
create policy ledger_select on public.usage_ledger for select to authenticated using (public.is_admin(org_id));
create policy ev_select on public.events for select to authenticated
  using ((company_id is null and public.is_admin(org_id)) or (company_id is not null and public.can_access_company(company_id)));
create policy ag_select on public.agents for select to authenticated using (public.is_admin(org_id));

-- Tabelas: ninguém escreve direto. Leitura só para usuários autenticados.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.organizations, public.memberships, public.companies, public.company_access,
                public.invitations, public.invoice_requests, public.emission_attempts,
                public.documents, public.usage_ledger, public.events to authenticated;
-- token_hash nunca sai do banco
grant select (id, org_id, company_id, name, created_by, last_seen_at, revoked_at, created_at)
  on public.agents to authenticated;

-- Funções: nada executável por padrão.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Usadas pelas políticas RLS e chamadas pelo app (sempre com JWT do usuário).
grant execute on function
  public.is_member(uuid), public.is_admin(uuid), public.can_access_company(uuid),
  public.can_operate_company(uuid), public.valid_cnpj(text), public.valid_cpf(text),
  public.create_org(text, public.org_kind),
  public.create_company(uuid, text, text, text, text[], text),
  public.enable_production(uuid), public.set_company_emissor(uuid, text),
  public.update_company_fiscal(uuid, text, text, text, text, numeric, text),
  public.invite_member(uuid, text, public.member_role, uuid[]), public.accept_invitations(),
  public.set_member_access(uuid, uuid, public.member_role, boolean, uuid[]),
  public.set_four_eyes(uuid, boolean),
  public.create_request(uuid, text, text, text, text, text, text, text, date, numeric),
  public.update_request(uuid, text, text, text, text, text, text, text, date, numeric),
  public.submit_request(uuid), public.approve_request(uuid), public.reopen_request(uuid),
  public.delete_draft(uuid), public.begin_send(uuid), public.begin_reconcile(uuid),
  public.log_download(uuid), public.create_agent(uuid, text, text), public.revoke_agent(uuid),
  public.usage_summary(uuid), public.list_members(uuid)
to authenticated;

-- Somente servidor (service_role): resultado do emissor, agente, documentos, varredura.
grant execute on function
  public.finish_attempt(uuid, text, text, text, text), public.sweep_stale_attempts(int),
  public.register_document(uuid, text, text, text),
  public.agent_claim_job(text, date), public.agent_report(text, uuid, text, text, text, text)
to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Bucket privado para XML/PDF (sem políticas = sem acesso direto; downloads via URL assinada curta).
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false)
on conflict (id) do update set public = false;
