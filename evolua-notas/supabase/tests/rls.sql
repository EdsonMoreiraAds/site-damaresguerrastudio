\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); execute 'reset role'; execute 'set role authenticated'; end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', false); execute 'reset role'; execute 'set role service_role'; end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin execute q; exception when others then ok := true; if position(frag in sqlerrm) = 0 then raise exception 'ERRO ERRADO p/ [%]: % (esperava %)', q, sqlerrm, frag; end if; end;
  if not ok then raise exception 'DEVERIA FALHAR: %', q; end if;
end $$;
create or replace function pg_temp.eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FALHOU %: obtido % esperado %', label, got, want; end if; raise notice 'ok  %', label; end $$;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  org uuid; co1 uuid; co2 uuid; r1 uuid; r2 uuid; r3 uuid; att uuid; att2 uuid; n int; st text; ag uuid;
  tok text := 'hash-do-token-teste';
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (a,'admin@esc.com',now()),(b,'op@esc.com',now()),(c,'intruso@x.com',now()),(d,'sol@esc.com',now());

  -- ===== cadastro =====
  perform pg_temp.as_user(a);
  org := public.create_org('Escritório Teste', 'escritorio');
  co1 := public.create_company(org, '11.222.333/0001-81', 'Cliente Um LTDA', '2304400', array['01.07'], 'simulado');
  co2 := public.create_company(org, '11444777000161', 'Cliente Dois ME', '2304400', '{}', 'simulado');
  perform pg_temp.expect_fail($q$select public.create_company(null,'1','x','1','{}','simulado')$q$, 'sem_permissao');
  perform public.invite_member(org, 'OP@esc.com', 'operador', array[co1]);
  perform public.invite_member(org, 'sol@esc.com', 'solicitante', array[co1]);
  perform pg_temp.as_user(b); perform pg_temp.eq('convite operador', public.accept_invitations(), 1);
  perform pg_temp.as_user(d); perform pg_temp.eq('convite solicitante', public.accept_invitations(), 1);

  -- ===== critério 1: isolamento por CNPJ e acesso direto à API =====
  perform pg_temp.as_user(b);
  perform pg_temp.eq('operador vê só 1 CNPJ', (select count(*) from public.companies)::int, 1);
  perform pg_temp.as_user(c);
  perform pg_temp.eq('sem vínculo não vê empresas', (select count(*) from public.companies)::int, 0);
  perform pg_temp.eq('sem vínculo não vê org', (select count(*) from public.organizations)::int, 0);
  perform pg_temp.expect_fail(format($q$select public.create_request(%L,'52998224725','X Y','01310100','10','','serviço teste','01.07',date_trunc('month',current_date)::date,100)$q$, co1), 'nao_encontrado');
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail(format($q$select public.create_request(%L,'52998224725','X Y','01310100','10','','serviço teste','01.07',date_trunc('month',current_date)::date,100)$q$, co2), 'nao_encontrado');
  perform pg_temp.expect_fail($q$insert into public.invoice_requests(org_id,company_id,tomador_doc,tomador_nome,descricao,codigo_servico,competencia,valor) values (gen_random_uuid(),gen_random_uuid(),'1','x','abc','1',current_date,1)$q$, 'permission denied');
  perform pg_temp.expect_fail($q$update public.companies set ambiente='producao'$q$, 'permission denied');
  perform pg_temp.expect_fail($q$select token_hash from public.agents$q$, 'permission denied');
  perform pg_temp.expect_fail($q$select public.finish_attempt(gen_random_uuid(),'autorizada','x','x','x')$q$, 'permission denied');
  perform pg_temp.expect_fail($q$select public.agent_claim_job('x')$q$, 'permission denied');
  perform pg_temp.as_user(null);
  perform pg_temp.eq('anônimo sem uid não vê nada', (select count(*) from public.companies)::int, 0);

  -- ===== fluxo: criar, revisar, aprovar =====
  perform pg_temp.as_user(d);
  perform pg_temp.expect_fail(format($q$select public.create_request(%L,'52998224725','Fulano','01310100','10','','serviço','99.99',date_trunc('month',current_date)::date,100)$q$, co1), 'codigo_servico_invalido');
  perform pg_temp.expect_fail(format($q$select public.create_request(%L,'12345678900','Fulano','01310100','10','','serviço','01.07',date_trunc('month',current_date)::date,100)$q$, co1), 'documento_invalido');
  r1 := public.create_request(co1,'529.982.247-25','Fulano de Tal','01310100','10','','Consultoria mensal','01.07',current_date,1500.00);
  perform public.submit_request(r1);
  perform pg_temp.expect_fail(format($q$select public.approve_request(%L)$q$, r1), 'sem_permissao');   -- solicitante não aprova
  perform pg_temp.as_user(b);
  perform public.approve_request(r1);
  perform pg_temp.eq('aprovada', (select status::text from public.invoice_requests where id=r1), 'aprovada');
  -- editar depois de aprovada volta para revisão e invalida a aprovação
  perform public.update_request(r1,'52998224725','Fulano de Tal','01310100','10','','Consultoria mensal','01.07',current_date,1600.00);
  perform pg_temp.eq('edição reabre revisão', (select status::text from public.invoice_requests where id=r1), 'a_revisar');
  perform pg_temp.eq('aprovação limpa', (select approved_hash is null from public.invoice_requests where id=r1), true);
  perform pg_temp.expect_fail(format($q$select public.begin_send(%L)$q$, r1), 'status_invalido');
  perform public.approve_request(r1);

  -- ===== critério 3: duplo clique / falha de conexão =====
  att := public.begin_send(r1);
  perform pg_temp.expect_fail(format($q$select public.begin_send(%L)$q$, r1), 'status_invalido');
  perform pg_temp.expect_fail(format($q$select public.update_request(%L,'52998224725','F F','01310100','10','','alterado depois','01.07',current_date,1)$q$, r1), 'nota_bloqueada');
  perform pg_temp.as_service();
  perform pg_temp.eq('1º resultado', public.finish_attempt(att,'autorizada','CHAVE-HOMOLOG-0001','ext1',null), 'autorizada');
  perform pg_temp.eq('reentrega ignorada', public.finish_attempt(att,'autorizada','CHAVE-HOMOLOG-0001','ext1',null), 'ja_finalizada');
  perform pg_temp.as_root();
  perform pg_temp.eq('1 autorização', (select count(*) from public.emission_attempts where request_id=r1 and status='autorizada')::int, 1);
  -- ===== critério 5: homologação fora do consumo =====
  perform pg_temp.eq('homologação não consome', (select count(*) from public.usage_ledger)::int, 0);

  -- ===== produção só com agente + homologação validada =====
  perform pg_temp.as_user(a);
  perform pg_temp.expect_fail(format($q$select public.enable_production(%L)$q$, co1), 'producao_exige_agente');
  perform public.set_company_emissor(co1, 'agente');
  perform pg_temp.expect_fail(format($q$select public.enable_production(%L)$q$, co1), 'dados_fiscais_incompletos');
  perform public.update_company_fiscal(co1, '00001', '010701', '001', '2304400', 4.0, '');
  perform pg_temp.expect_fail(format($q$select public.enable_production(%L)$q$, co2), 'producao_exige_agente');
  perform public.enable_production(co1);
  perform pg_temp.expect_fail(format($q$select public.create_agent(%L,'PC do escritório','h')$q$, co2), 'empresa_sem_agente');
  ag := public.create_agent(co1, 'PC do escritório', tok);
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail(format($q$select public.create_agent(%L,'x','h2')$q$, co1), 'sem_permissao');

  -- ===== produção: indefinida -> em verificação -> consulta -> autorizada (1 consumo) =====
  perform pg_temp.as_user(d);
  r2 := public.create_request(co1,'52998224725','Beltrano','01310100','10','','Serviço produção','01.07',current_date,200);
  perform public.submit_request(r2);
  perform pg_temp.as_user(b); perform public.approve_request(r2);
  att := public.begin_send(r2);
  perform pg_temp.as_service();
  declare job jsonb; begin
    job := public.agent_claim_job(tok);
    perform pg_temp.eq('agente recebe o job', (job->>'attempt_id')::uuid, att);
    perform pg_temp.eq('dps_id estável', (job->>'dps_id')::uuid, r2);
    perform pg_temp.eq('nº DPS sequencial', (job->>'dps_numero')::int, 2);
    perform pg_temp.eq('serie no job', job->>'serie', '00001');
    perform pg_temp.eq('cep no job', job->'tomador'->>'cep', '01310100');
    perform pg_temp.eq('sem 2ª entrega imediata', public.agent_claim_job(tok) is null, true);
    perform pg_temp.expect_fail($q$select public.agent_claim_job('token-errado')$q$, 'agente_invalido');
  end;
  perform pg_temp.eq('timeout', public.finish_attempt(att,'indefinida',null,null,'timeout'), 'indefinida');
  perform pg_temp.as_root();
  perform pg_temp.eq('em verificação', (select status::text from public.invoice_requests where id=r2), 'em_verificacao');
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail(format($q$select public.begin_send(%L)$q$, r2), 'status_invalido');   -- nunca reemite
  att2 := public.begin_reconcile(r2);
  perform pg_temp.as_service();
  perform pg_temp.eq('consulta autoriza', public.finish_attempt(att2,'autorizada','CHAVE-PROD-00000002','ext2',null), 'autorizada');
  -- resultado tardio da tentativa original NÃO duplica
  perform pg_temp.eq('tardio ignorado', public.finish_attempt(att,'autorizada','CHAVE-PROD-00000002','ext2',null), 'ignorada');
  perform pg_temp.as_root();
  perform pg_temp.eq('1 consumo em produção', (select count(*) from public.usage_ledger)::int, 1);
  perform pg_temp.eq('1 autorização por nota', (select count(*) from public.emission_attempts where request_id=r2 and status='autorizada')::int, 1);

  -- agente de outro CNPJ não enxerga/reporta tentativas alheias
  perform pg_temp.as_service();
  perform pg_temp.expect_fail(format($q$select public.agent_report(%L,%L,'autorizada','CHAVE-XXXXXXXXXX','x',null)$q$, 'hash-inexistente', att), 'agente_invalido');

  -- ===== rejeição e correção =====
  perform pg_temp.as_user(d);
  r3 := public.create_request(co1,'11222333000181','Empresa Tomadora','01310100','10','','Serviço a rejeitar','01.07',current_date,50);
  perform public.submit_request(r3);
  perform pg_temp.as_user(b); perform public.approve_request(r3); att := public.begin_send(r3);
  perform pg_temp.as_service(); perform public.finish_attempt(att,'rejeitada',null,null,'E160 - código de tributação inválido');
  perform pg_temp.as_root();
  perform pg_temp.eq('rejeitada', (select status::text from public.invoice_requests where id=r3), 'rejeitada');
  perform pg_temp.as_user(b);
  perform public.update_request(r3,'11222333000181','Empresa Tomadora','01310100','10','','Serviço corrigido','01.07',current_date,50);
  perform pg_temp.eq('correção volta à revisão', (select status::text from public.invoice_requests where id=r3), 'a_revisar');
  perform public.approve_request(r3); att := public.begin_send(r3);
  perform pg_temp.eq('2ª tentativa numerada', (select attempt_no from public.emission_attempts where id=att), 2);
  perform pg_temp.as_service(); perform public.finish_attempt(att,'autorizada','CHAVE-PROD-00000003','ext3',null);
  perform pg_temp.as_root();
  perform pg_temp.eq('2 consumos (notas distintas)', (select count(*) from public.usage_ledger)::int, 2);

  -- ===== consumo e auditoria =====
  perform pg_temp.as_user(a);
  perform pg_temp.eq('usage_summary', (select autorizadas from public.usage_summary(org))::int, 2);
  perform pg_temp.eq('cnpjs ativos', (select cnpjs_ativos from public.usage_summary(org))::int, 2);
  perform pg_temp.as_user(b);
  perform pg_temp.expect_fail(format($q$select * from public.usage_summary(%L)$q$, org), 'sem_permissao');
  perform pg_temp.eq('operador não lê ledger', (select count(*) from public.usage_ledger)::int, 0);
  perform pg_temp.as_root();
  perform pg_temp.expect_fail($q$update public.events set action='x'$q$, 'somente-inserção');
  perform pg_temp.expect_fail($q$delete from public.events$q$, 'somente-inserção');
  perform pg_temp.eq('quem aprovou/enviou fica registrado',
     (select approved_by is not null and sent_by is not null from public.invoice_requests where id=r1), true);

  -- ===== quatro olhos =====
  perform pg_temp.as_user(a); perform public.set_four_eyes(org, true);
  r1 := public.create_request(co2,'52998224725','Cicrano','01310100','10','','Serviço quatro olhos','01.07',current_date,10);
  perform public.submit_request(r1);
  perform pg_temp.expect_fail(format($q$select public.approve_request(%L)$q$, r1), 'aprovador_deve_ser_outro');

  -- ===== último admin =====
  perform pg_temp.expect_fail(format($q$select public.set_member_access(%L,%L,'operador',true,'{}')$q$, org, a), 'ultimo_admin');

  -- ===== varredura de tentativas paradas =====
  perform public.set_four_eyes(org, false);
  perform public.approve_request(r1);
  att := public.begin_send(r1);
  perform pg_temp.as_root();
  update public.emission_attempts set sent_at = now() - interval '1 hour' where id = att;
  perform pg_temp.as_service();
  perform pg_temp.eq('varredura marca indefinida', public.sweep_stale_attempts(10), 1);
  perform pg_temp.as_root();
  perform pg_temp.eq('nota em verificação após varredura', (select status::text from public.invoice_requests where id=r1), 'em_verificacao');
  raise notice 'TODOS OS TESTES DE BANCO PASSARAM';
end $$;
