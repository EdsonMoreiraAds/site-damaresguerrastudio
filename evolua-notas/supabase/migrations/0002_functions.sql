-- Funções de autorização (usadas pelas políticas RLS) e operações de escrita.
-- Todas SECURITY DEFINER com search_path vazio; cada uma valida auth.uid() por conta própria.

-- ================= helpers de autorização =================
create function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
                 where m.org_id = p_org and m.user_id = auth.uid() and m.active);
$$;

create function public.is_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
                 where m.org_id = p_org and m.user_id = auth.uid() and m.active and m.role = 'admin');
$$;

-- Admin vê todos os CNPJs da organização; os demais, só os atribuídos.
create function public.can_access_company(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.companies c
      join public.memberships m on m.org_id = c.org_id and m.user_id = auth.uid() and m.active
     where c.id = p_company and c.active
       and (m.role = 'admin'
            or exists (select 1 from public.company_access a
                        where a.company_id = c.id and a.user_id = m.user_id))
  );
$$;

create function public.can_operate_company(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.companies c
      join public.memberships m on m.org_id = c.org_id and m.user_id = auth.uid() and m.active
     where c.id = p_company and c.active and m.role in ('admin','operador')
       and (m.role = 'admin'
            or exists (select 1 from public.company_access a
                        where a.company_id = c.id and a.user_id = m.user_id))
  );
$$;

create function public._log(p_org uuid, p_company uuid, p_request uuid, p_action text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.events (org_id, company_id, request_id, actor, action, detail)
  values (p_org, p_company, p_request, auth.uid(), p_action, coalesce(p_detail, '{}'));
$$;

create function public._need_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'nao_autenticado' using errcode = '28000'; end if;
  return u;
end $$;

-- ================= organização, empresas, equipe =================
create function public.create_org(p_name text, p_kind public.org_kind) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); v uuid;
begin
  if (select count(*) from public.memberships where user_id = u and role = 'admin') >= 3 then
    raise exception 'limite_organizacoes' using errcode = 'P0001';
  end if;
  insert into public.organizations (name, kind, plan)
  values (trim(p_name), p_kind, case p_kind when 'empresa' then 'essencial' else 'escritorio' end)
  returning id into v;
  insert into public.memberships (org_id, user_id, role) values (v, u, 'admin');
  perform public._log(v, null, null, 'organizacao.criada', jsonb_build_object('nome', trim(p_name)));
  return v;
end $$;

create function public.create_company(p_org uuid, p_cnpj text, p_razao text, p_ibge text,
                                      p_codigos text[], p_emissor text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); o public.organizations; v uuid; v_cnpj text := regexp_replace(p_cnpj, '\D', '', 'g');
begin
  if not public.is_admin(p_org) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not public.valid_cnpj(v_cnpj) then raise exception 'cnpj_invalido' using errcode = 'P0001'; end if;
  select * into o from public.organizations where id = p_org for update;
  if o.kind = 'empresa' and (select count(*) from public.companies where org_id = p_org and active) >= 1 then
    raise exception 'limite_cnpj_plano' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.companies where org_id = p_org and cnpj = v_cnpj) then
    raise exception 'cnpj_duplicado' using errcode = 'P0001';
  end if;
  insert into public.companies (org_id, cnpj, razao_social, municipio_ibge, codigos_servico, emissor)
  values (p_org, v_cnpj, trim(p_razao), p_ibge, coalesce(p_codigos, '{}'), p_emissor)
  returning id into v;
  perform public._log(p_org, v, null, 'empresa.criada', jsonb_build_object('cnpj', v_cnpj));
  return v;
end $$;

-- Produção só depois de uma emissão bem-sucedida em homologação, com emissor real (agente).
create function public.enable_production(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); c public.companies;
begin
  select * into c from public.companies where id = p_company for update;
  if not found or not public.is_admin(c.org_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if c.emissor <> 'agente' then raise exception 'producao_exige_agente' using errcode = 'P0001'; end if;
  if c.ctrib_nac is null or c.cloc_prestacao is null then raise exception 'dados_fiscais_incompletos' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.emission_attempts a
                  where a.company_id = c.id and a.ambiente = 'homologacao' and a.status = 'autorizada') then
    raise exception 'homologacao_pendente' using errcode = 'P0001';
  end if;
  update public.companies set ambiente = 'producao' where id = c.id;
  perform public._log(c.org_id, c.id, null, 'empresa.producao_habilitada', '{}');
end $$;

create function public.update_company_fiscal(p_company uuid, p_serie text, p_ctrib_nac text, p_ctrib_mun text,
                                             p_cloc_prestacao text, p_aliq numeric, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.companies;
begin
  perform public._need_user();
  select * into c from public.companies where id = p_company for update;
  if not found or not public.is_admin(c.org_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if c.ambiente = 'producao' and p_serie <> c.serie then raise exception 'ja_em_producao' using errcode = 'P0001'; end if;
  update public.companies set serie = p_serie, ctrib_nac = nullif(p_ctrib_nac,''), ctrib_mun = nullif(p_ctrib_mun,''),
         cloc_prestacao = nullif(p_cloc_prestacao,''), aliq_simples = p_aliq, texto_fixo = coalesce(p_texto,'')
   where id = c.id;
  perform public._log(c.org_id, c.id, null, 'empresa.dados_fiscais_alterados', '{}');
end $$;

create function public.set_company_emissor(p_company uuid, p_emissor text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.companies;
begin
  perform public._need_user();
  select * into c from public.companies where id = p_company for update;
  if not found or not public.is_admin(c.org_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if c.ambiente = 'producao' then raise exception 'ja_em_producao' using errcode = 'P0001'; end if;
  update public.companies set emissor = p_emissor where id = c.id;
  perform public._log(c.org_id, c.id, null, 'empresa.emissor_alterado', jsonb_build_object('emissor', p_emissor));
end $$;

create function public.invite_member(p_org uuid, p_email text, p_role public.member_role, p_companies uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); e text := lower(trim(p_email));
begin
  if not public.is_admin(p_org) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if exists (select 1 from unnest(coalesce(p_companies,'{}')) cid
              where not exists (select 1 from public.companies c where c.id = cid and c.org_id = p_org)) then
    raise exception 'empresa_invalida' using errcode = 'P0001';
  end if;
  insert into public.invitations (org_id, email, role, company_ids, invited_by)
  values (p_org, e, p_role, coalesce(p_companies,'{}'), u)
  on conflict (org_id, email) where accepted_at is null
  do update set role = excluded.role, company_ids = excluded.company_ids;
  perform public._log(p_org, null, null, 'equipe.convite', jsonb_build_object('email', e, 'papel', p_role));
end $$;

-- Chamada no primeiro acesso: só convites do e-mail JÁ CONFIRMADO do usuário.
create function public.accept_invitations() returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); mail text; n int := 0; i public.invitations; cid uuid;
begin
  select lower(email) into mail from auth.users where id = u and email_confirmed_at is not null;
  if mail is null then return 0; end if;
  for i in select * from public.invitations where email = mail and accepted_at is null for update loop
    insert into public.memberships (org_id, user_id, role) values (i.org_id, u, i.role)
      on conflict (org_id, user_id) do update set role = excluded.role, active = true;
    foreach cid in array i.company_ids loop
      insert into public.company_access (company_id, user_id, org_id) values (cid, u, i.org_id)
      on conflict do nothing;
    end loop;
    update public.invitations set accepted_at = now() where id = i.id;
    perform public._log(i.org_id, null, null, 'equipe.convite_aceito', jsonb_build_object('usuario', u));
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.set_member_access(p_org uuid, p_user uuid, p_role public.member_role,
                                         p_active boolean, p_companies uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  perform public._need_user();
  if not public.is_admin(p_org) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships where org_id = p_org and user_id = p_user) then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  update public.memberships set role = p_role, active = p_active where org_id = p_org and user_id = p_user;
  if not exists (select 1 from public.memberships where org_id = p_org and role = 'admin' and active) then
    raise exception 'ultimo_admin' using errcode = 'P0001';  -- desfaz a transação
  end if;
  delete from public.company_access where org_id = p_org and user_id = p_user;
  foreach cid in array coalesce(p_companies,'{}') loop
    if exists (select 1 from public.companies c where c.id = cid and c.org_id = p_org) then
      insert into public.company_access (company_id, user_id, org_id) values (cid, p_user, p_org);
    end if;
  end loop;
  perform public._log(p_org, null, null, 'equipe.acesso_alterado',
                      jsonb_build_object('usuario', p_user, 'papel', p_role, 'ativo', p_active));
end $$;

create function public.set_four_eyes(p_org uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._need_user();
  if not public.is_admin(p_org) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  update public.organizations set four_eyes = p_on where id = p_org;
  perform public._log(p_org, null, null, 'org.regra_aprovacao', jsonb_build_object('quatro_olhos', p_on));
end $$;

-- ================= solicitações =================
create function public._req_locked(p_id uuid) returns public.invoice_requests
language plpgsql security definer set search_path = '' as $$
declare r public.invoice_requests;
begin
  select * into r from public.invoice_requests where id = p_id for update;
  -- mesma resposta para "não existe" e "sem acesso": não vaza existência
  if not found or not public.can_access_company(r.company_id) then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  return r;
end $$;

create function public._check_service(p_company uuid, p_codigo text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare c public.companies;
begin
  select * into c from public.companies where id = p_company;
  if cardinality(c.codigos_servico) > 0 and not (p_codigo = any (c.codigos_servico)) then
    raise exception 'codigo_servico_invalido' using errcode = 'P0001';
  end if;
end $$;

create function public.create_request(p_company uuid, p_doc text, p_nome text, p_cep text, p_numero text, p_compl text,
                                      p_desc text, p_codigo text, p_competencia date, p_valor numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); c public.companies; v uuid;
        doc text := regexp_replace(p_doc, '\D', '', 'g');
begin
  if not public.can_access_company(p_company) then raise exception 'nao_encontrado' using errcode = 'P0002'; end if;
  select * into c from public.companies where id = p_company;
  if not (public.valid_cpf(doc) or public.valid_cnpj(doc)) then raise exception 'documento_invalido' using errcode = 'P0001'; end if;
  if date_trunc('month', p_competencia)::date > date_trunc('month', current_date)::date then raise exception 'competencia_futura' using errcode = 'P0001'; end if;
  perform public._check_service(p_company, p_codigo);
  if regexp_replace(p_cep, '\D', '', 'g') !~ '^[0-9]{8}$' then raise exception 'cep_invalido' using errcode = 'P0001'; end if;
  insert into public.invoice_requests (org_id, company_id, tomador_doc, tomador_nome, tomador_cep, tomador_numero,
                                       tomador_complemento, descricao, codigo_servico, competencia, valor, created_by)
  values (c.org_id, c.id, doc, trim(p_nome), regexp_replace(p_cep, '\D', '', 'g'), trim(p_numero), trim(coalesce(p_compl,'')), trim(p_desc), trim(p_codigo),
          date_trunc('month', p_competencia)::date, p_valor, u)
  returning id into v;
  perform public._log(c.org_id, c.id, v, 'nota.criada', '{}');
  return v;
end $$;

create function public.update_request(p_id uuid, p_doc text, p_nome text, p_cep text, p_numero text, p_compl text,
                                      p_desc text, p_codigo text, p_competencia date, p_valor numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); r public.invoice_requests; doc text := regexp_replace(p_doc, '\D', '', 'g');
begin
  r := public._req_locked(p_id);
  if r.status not in ('rascunho','a_revisar','aprovada','rejeitada') then raise exception 'nota_bloqueada' using errcode = 'P0001'; end if;
  -- solicitante só mexe nas próprias notas; operador/admin em qualquer uma do seu CNPJ
  if not (r.created_by = u or public.can_operate_company(r.company_id)) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not (public.valid_cpf(doc) or public.valid_cnpj(doc)) then raise exception 'documento_invalido' using errcode = 'P0001'; end if;
  if date_trunc('month', p_competencia)::date > date_trunc('month', current_date)::date then raise exception 'competencia_futura' using errcode = 'P0001'; end if;
  perform public._check_service(r.company_id, p_codigo);
  update public.invoice_requests
     set tomador_doc = doc, tomador_nome = trim(p_nome), tomador_cep = regexp_replace(p_cep, '\D', '', 'g'),
         tomador_numero = trim(p_numero), tomador_complemento = trim(coalesce(p_compl,'')), descricao = trim(p_desc),
         codigo_servico = trim(p_codigo), competencia = date_trunc('month', p_competencia)::date, valor = p_valor
   where id = r.id;
  perform public._log(r.org_id, r.company_id, r.id, 'nota.editada', jsonb_build_object('status_anterior', r.status));
end $$;

create function public.submit_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); r public.invoice_requests;
begin
  r := public._req_locked(p_id);
  if r.status not in ('rascunho','rejeitada') then raise exception 'status_invalido' using errcode = 'P0001'; end if;
  if not (r.created_by = u or public.can_operate_company(r.company_id)) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  update public.invoice_requests set status = 'a_revisar', rejection_reason = null where id = r.id;
  perform public._log(r.org_id, r.company_id, r.id, 'nota.enviada_para_revisao', '{}');
end $$;

create function public.approve_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); r public.invoice_requests; o public.organizations;
begin
  r := public._req_locked(p_id);
  if not public.can_operate_company(r.company_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if r.status <> 'a_revisar' then raise exception 'status_invalido' using errcode = 'P0001'; end if;
  select * into o from public.organizations where id = r.org_id;
  if o.four_eyes and r.created_by = u then raise exception 'aprovador_deve_ser_outro' using errcode = 'P0001'; end if;
  update public.invoice_requests
     set status = 'aprovada', approved_hash = content_hash, approved_by = u, approved_at = now()
   where id = r.id;
  perform public._log(r.org_id, r.company_id, r.id, 'nota.aprovada', jsonb_build_object('hash', r.content_hash));
end $$;

-- Volta uma nota aprovada (ainda não enviada) para revisão.
create function public.reopen_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.invoice_requests;
begin
  perform public._need_user();
  r := public._req_locked(p_id);
  if not public.can_operate_company(r.company_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if r.status not in ('aprovada','rejeitada') then raise exception 'status_invalido' using errcode = 'P0001'; end if;
  update public.invoice_requests
     set status = 'a_revisar', approved_hash = null, approved_by = null, approved_at = null
   where id = r.id;
  perform public._log(r.org_id, r.company_id, r.id, 'nota.reaberta', '{}');
end $$;

create function public.delete_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); r public.invoice_requests;
begin
  r := public._req_locked(p_id);
  if r.status <> 'rascunho' then raise exception 'status_invalido' using errcode = 'P0001'; end if;
  if not (r.created_by = u or public.can_operate_company(r.company_id)) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  perform public._log(r.org_id, r.company_id, r.id, 'nota.rascunho_excluido', '{}');
  delete from public.invoice_requests where id = r.id;
end $$;

-- ================= envio (idempotente) =================
create function public.begin_send(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); r public.invoice_requests; c public.companies; n int; v uuid;
begin
  r := public._req_locked(p_id);                       -- trava a linha: dois cliques serializam
  if not public.can_operate_company(r.company_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if r.status <> 'aprovada' then raise exception 'status_invalido' using errcode = 'P0001'; end if;
  if r.approved_hash is distinct from r.content_hash then raise exception 'aprovacao_desatualizada' using errcode = 'P0001'; end if;
  select * into c from public.companies where id = r.company_id;
  if c.ambiente = 'producao' and (c.ctrib_nac is null or c.cloc_prestacao is null) then
    raise exception 'dados_fiscais_incompletos' using errcode = 'P0001';
  end if;
  select coalesce(max(attempt_no), 0) + 1 into n from public.emission_attempts where request_id = r.id;
  if r.dps_numero is null then   -- número da DPS é do emissor: sequência por empresa/série, atribuída uma única vez
    update public.companies set dps_seq = dps_seq + 1 where id = c.id returning dps_seq into r.dps_numero;
  end if;
  insert into public.emission_attempts (request_id, org_id, company_id, attempt_no, mode, ambiente)
  values (r.id, r.org_id, r.company_id, n, 'emitir', c.ambiente) returning id into v;
  update public.invoice_requests set status = 'processando', sent_by = u, sent_at = now(), ambiente = c.ambiente,
         dps_numero = r.dps_numero where id = r.id;
  perform public._log(r.org_id, r.company_id, r.id, 'nota.enviada', jsonb_build_object('tentativa', n, 'ambiente', c.ambiente));
  return v;
end $$;

-- Consulta de resultado de uma nota "em verificação" — nunca reemite.
create function public.begin_reconcile(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.invoice_requests; c public.companies; n int; v uuid;
begin
  perform public._need_user();
  r := public._req_locked(p_id);
  if not public.can_operate_company(r.company_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if r.status <> 'em_verificacao' then raise exception 'status_invalido' using errcode = 'P0001'; end if;
  select * into c from public.companies where id = r.company_id;
  select coalesce(max(attempt_no), 0) + 1 into n from public.emission_attempts where request_id = r.id;
  insert into public.emission_attempts (request_id, org_id, company_id, attempt_no, mode, ambiente)
  values (r.id, r.org_id, r.company_id, n, 'consultar', coalesce(r.ambiente, c.ambiente)) returning id into v;
  update public.invoice_requests set status = 'processando' where id = r.id;
  perform public._log(r.org_id, r.company_id, r.id, 'nota.consulta_resultado', jsonb_build_object('tentativa', n));
  return v;
end $$;

-- ================= resultado (somente service_role) =================
create function public.finish_attempt(p_attempt uuid, p_outcome text, p_chave text, p_external text, p_motivo text)
returns text language plpgsql security definer set search_path = '' as $$
declare a public.emission_attempts; r public.invoice_requests;
begin
  if p_outcome not in ('autorizada','rejeitada','indefinida') then raise exception 'resultado_invalido' using errcode = 'P0001'; end if;
  select * into a from public.emission_attempts where id = p_attempt for update;
  if not found then raise exception 'nao_encontrado' using errcode = 'P0002'; end if;
  select * into r from public.invoice_requests where id = a.request_id for update;

  -- repetição do mesmo resultado (reentrega do agente, retry de rede): não faz nada
  if a.status in ('autorizada','rejeitada') then return 'ja_finalizada'; end if;
  if a.status = 'indefinida' and p_outcome = 'indefinida' then return 'ja_finalizada'; end if;

  if r.status = 'autorizada' then
    -- outra tentativa já autorizou: este resultado não gera 2ª nota nem 2º consumo
    update public.emission_attempts set status = 'rejeitada', error = 'duplicada', finished_at = now() where id = a.id;
    perform public._log(r.org_id, r.company_id, r.id, 'nota.resultado_duplicado_ignorado', jsonb_build_object('tentativa', a.attempt_no));
    return 'ignorada';
  end if;

  if p_outcome = 'autorizada' then
    if p_chave is null or length(p_chave) < 10 then raise exception 'chave_obrigatoria' using errcode = 'P0001'; end if;
    update public.emission_attempts set status = 'autorizada', external_id = p_external, finished_at = now() where id = a.id;
    update public.invoice_requests set status = 'autorizada', chave_acesso = p_chave, rejection_reason = null where id = r.id;
    if a.ambiente = 'producao' then
      insert into public.usage_ledger (org_id, company_id, request_id, attempt_id)
      values (a.org_id, a.company_id, a.request_id, a.id) on conflict (request_id) do nothing;
    end if;
  elsif p_outcome = 'rejeitada' then
    update public.emission_attempts set status = 'rejeitada', error = left(p_motivo, 1000), finished_at = now() where id = a.id;
    update public.invoice_requests set status = 'rejeitada', rejection_reason = left(p_motivo, 1000)
     where id = r.id and status in ('processando','em_verificacao');
  else
    update public.emission_attempts set status = 'indefinida', error = left(p_motivo, 1000), finished_at = now() where id = a.id;
    update public.invoice_requests set status = 'em_verificacao' where id = r.id and status = 'processando';
  end if;
  perform public._log(r.org_id, r.company_id, r.id, 'nota.resultado_' || p_outcome,
                      jsonb_build_object('tentativa', a.attempt_no, 'modo', a.mode, 'motivo', left(p_motivo, 300)));
  return p_outcome;
end $$;

-- Tentativas sem resposta viram "indefinida" -> nota "em verificação" (nunca reenvia sozinho).
create function public.sweep_stale_attempts(p_minutes int default 10) returns int
language plpgsql security definer set search_path = '' as $$
declare a record; n int := 0;
begin
  for a in select id from public.emission_attempts
            where status = 'enviada' and sent_at < now() - make_interval(mins => p_minutes) loop
    perform public.finish_attempt(a.id, 'indefinida', null, null, 'sem resposta do emissor no prazo');
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.register_document(p_request uuid, p_kind text, p_path text, p_sha256 text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.invoice_requests;
begin
  select * into r from public.invoice_requests where id = p_request;
  if not found then raise exception 'nao_encontrado' using errcode = 'P0002'; end if;
  insert into public.documents (request_id, org_id, company_id, kind, path, sha256)
  values (r.id, r.org_id, r.company_id, p_kind, p_path, p_sha256)
  on conflict (request_id, kind) do nothing;
end $$;

create function public.log_download(p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  perform public._need_user();
  select * into d from public.documents where id = p_document;
  if not found or not public.can_access_company(d.company_id) then raise exception 'nao_encontrado' using errcode = 'P0002'; end if;
  perform public._log(d.org_id, d.company_id, d.request_id, 'documento.download', jsonb_build_object('tipo', d.kind));
end $$;

-- ================= agente local =================
create function public.create_agent(p_company uuid, p_name text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); c public.companies; v uuid;
begin
  select * into c from public.companies where id = p_company;
  if not found or not public.is_admin(c.org_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if c.emissor <> 'agente' then raise exception 'empresa_sem_agente' using errcode = 'P0001'; end if;
  insert into public.agents (org_id, company_id, name, token_hash, created_by)
  values (c.org_id, c.id, trim(p_name), p_token_hash, u) returning id into v;
  perform public._log(c.org_id, c.id, null, 'agente.criado', jsonb_build_object('agente', v));
  return v;
end $$;

create function public.revoke_agent(p_agent uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.agents;
begin
  perform public._need_user();
  select * into a from public.agents where id = p_agent;
  if not found or not public.is_admin(a.org_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  update public.agents set revoked_at = now() where id = a.id and revoked_at is null;
  perform public._log(a.org_id, a.company_id, null, 'agente.revogado', jsonb_build_object('agente', a.id));
end $$;

-- O agente puxa trabalho: só vê tentativas do SEU CNPJ.
create function public.agent_claim_job(p_token_hash text, p_cert_valid_until date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.agents; a public.emission_attempts; r public.invoice_requests; c public.companies;
begin
  select * into g from public.agents where token_hash = p_token_hash and revoked_at is null;
  if not found then raise exception 'agente_invalido' using errcode = '28000'; end if;
  update public.agents set last_seen_at = now() where id = g.id;
  if p_cert_valid_until is not null then
    update public.companies set cert_valid_until = p_cert_valid_until where id = g.company_id;
  end if;
  select * into a from public.emission_attempts
   where company_id = g.company_id and status = 'enviada'
     and (claimed_at is null or claimed_at < now() - interval '2 minutes')
   order by sent_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.emission_attempts set claimed_at = now() where id = a.id;
  select * into r from public.invoice_requests where id = a.request_id;
  select * into c from public.companies where id = a.company_id;
  return jsonb_build_object(
    'attempt_id', a.id, 'mode', a.mode, 'ambiente', a.ambiente,
    'dps_id', r.id,                                  -- chave de idempotência estável
    'dps_numero', r.dps_numero, 'serie', c.serie,    -- o agente monta o Id da DPS e consulta HEAD /dps/{id} antes de emitir
    'prestador', jsonb_build_object('cnpj', c.cnpj, 'razao_social', c.razao_social, 'municipio_ibge', c.municipio_ibge,
                  'cloc_prestacao', c.cloc_prestacao, 'ctrib_nac', c.ctrib_nac, 'ctrib_mun', c.ctrib_mun,
                  'aliq_simples', c.aliq_simples, 'texto_fixo', c.texto_fixo),
    'tomador', jsonb_build_object('documento', r.tomador_doc, 'nome', r.tomador_nome, 'cep', r.tomador_cep,
                  'numero', r.tomador_numero, 'complemento', r.tomador_complemento),
    'servico', jsonb_build_object('descricao', r.descricao, 'codigo', r.codigo_servico),
    'competencia', r.competencia, 'valor', r.valor, 'hash_aprovado', r.approved_hash);
end $$;

create function public.agent_report(p_token_hash text, p_attempt uuid, p_outcome text,
                                    p_chave text, p_external text, p_motivo text) returns text
language plpgsql security definer set search_path = '' as $$
declare g public.agents; a public.emission_attempts;
begin
  select * into g from public.agents where token_hash = p_token_hash and revoked_at is null;
  if not found then raise exception 'agente_invalido' using errcode = '28000'; end if;
  select * into a from public.emission_attempts where id = p_attempt and company_id = g.company_id;
  if not found then raise exception 'nao_encontrado' using errcode = 'P0002'; end if;
  update public.agents set last_seen_at = now() where id = g.id;
  return public.finish_attempt(p_attempt, p_outcome, p_chave, p_external, p_motivo);
end $$;

-- ================= consumo =================
create function public.usage_summary(p_org uuid)
returns table (cycle_start date, cycle_end date, autorizadas bigint, cnpjs_ativos bigint)
language plpgsql stable security definer set search_path = '' as $$
declare o public.organizations; today date := (now() at time zone 'America/Sao_Paulo')::date; s date;
begin
  perform public._need_user();
  if not public.is_admin(p_org) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select * into o from public.organizations where id = p_org;
  s := date_trunc('month', today)::date + (o.cycle_day - 1);
  if s > today then s := (date_trunc('month', today) - interval '1 month')::date + (o.cycle_day - 1); end if;
  return query select s, (s + interval '1 month')::date,
    (select count(*) from public.usage_ledger l where l.org_id = p_org
        and (l.created_at at time zone 'America/Sao_Paulo')::date >= s
        and (l.created_at at time zone 'America/Sao_Paulo')::date < (s + interval '1 month')::date),
    (select count(*) from public.companies c where c.org_id = p_org and c.active);
end $$;

-- ================= equipe (e-mails vivem em auth.users; só admin vê) =================
create function public.list_members(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, active boolean, company_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._need_user();
  if not public.is_admin(p_org) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  return query
    select m.user_id, u.email::text, m.role, m.active,
           coalesce((select array_agg(a.company_id) from public.company_access a
                      where a.user_id = m.user_id and a.org_id = p_org), '{}')
      from public.memberships m join auth.users u on u.id = m.user_id
     where m.org_id = p_org order by u.email;
end $$;
