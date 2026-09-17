-- ============================================================
-- Fase 17 — Mesma OS pode ter mais de um "orçamento": agora o
-- sistema trata cada combinação (unidade + número da OS + tipo
-- de serviço) como um registro independente, com seu próprio
-- orçamento travado e seu próprio saldo. Exemplo: a mesma OS pode
-- ter uma "Taxa de análise" e, depois, um "Reparo" — cada um com
-- orçamento e saldo próprios, em vez de dividir o mesmo orçamento.
--
-- Isso muda: o gatilho que trava/limita o orçamento, a tela de
-- Contas a Receber (agora mostra e cobra por tipo de serviço) e
-- os dashboards que somam o orçamento do mês (para não juntar
-- dois orçamentos diferentes da mesma OS num só).
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Gatilho: trava/limita o orçamento por (unidade, OS, tipo de serviço)
-- ------------------------------------------------------------
create or replace function checar_saldo_os()
returns trigger as $$
declare
  ja_pago numeric(12,2);
  orcamento numeric(12,2);
begin
  select coalesce(sum(valor_pago), 0) into ja_pago
  from lancamentos
  where unidade_id = new.unidade_id
    and numero_os = new.numero_os
    and tipo_servico_id = new.tipo_servico_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000');

  select orcamento_aprovado into orcamento
  from lancamentos
  where unidade_id = new.unidade_id
    and numero_os = new.numero_os
    and tipo_servico_id = new.tipo_servico_id
    and orcamento_aprovado > 0
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000')
  order by criado_em asc
  limit 1;

  if orcamento is not null and orcamento <> new.orcamento_aprovado then
    new.orcamento_aprovado := orcamento;
  end if;

  if new.orcamento_aprovado > 0 and (ja_pago + new.valor_pago) > new.orcamento_aprovado then
    raise exception 'VALOR_EXCEDE_ORCAMENTO: saldo restante é %', (new.orcamento_aprovado - ja_pago);
  end if;

  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- 2) Contas a receber: agora uma linha por (unidade, OS, tipo de
--    serviço) — assim a taxa de análise já paga não esconde o
--    reparo ainda em aberto da mesma OS, e vice-versa.
-- ------------------------------------------------------------
drop view if exists vw_contas_a_receber;
create view vw_contas_a_receber as
select
  c.unidade_id,
  c.numero_os,
  c.tipo_servico_id,
  ts.nome as tipo_servico_nome,
  c.orcamento_aprovado,
  c.total_pago,
  c.orcamento_aprovado - c.total_pago as falta_pagar,
  c.ultimo_lancamento,
  u.categoria_id,
  u.modelo_id
from (
  select
    unidade_id,
    numero_os,
    tipo_servico_id,
    max(orcamento_aprovado) as orcamento_aprovado,
    sum(valor_pago) as total_pago,
    max(data) as ultimo_lancamento
  from lancamentos
  group by unidade_id, numero_os, tipo_servico_id
) c
left join tipos_servico ts on ts.id = c.tipo_servico_id
join lateral (
  select categoria_id, modelo_id
  from lancamentos l
  where l.unidade_id = c.unidade_id and l.numero_os = c.numero_os and l.tipo_servico_id = c.tipo_servico_id
  order by l.criado_em desc
  limit 1
) u on true
where c.orcamento_aprovado - c.total_pago > 0;

-- ------------------------------------------------------------
-- 3) Dashboards: o orçamento do mês deixa de ser deduplicado só
--    por (unidade, OS) — agora considera também o tipo de
--    serviço, senão duas "sub-OS" (taxa de análise + reparo) da
--    mesma OS ficariam contando só o maior dos dois orçamentos.
-- ------------------------------------------------------------

-- Valores (Mensal)
create or replace view vw_dashboard_valores as
with base as (
  select * from lancamentos where data >= date_trunc('month', current_date)::date
),
pagos as (
  select unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id
),
orcamentos as (
  select unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os, tipo_servico_id
  ) os_unicas
  group by unidade_id
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
left join pagos p on p.unidade_id = u.id
left join orcamentos o on o.unidade_id = u.id
where u.ativo = true;

-- Valores (Diário)
create or replace view vw_dashboard_valores_diario as
with base as (
  select * from lancamentos where data = current_date
),
pagos as (
  select unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id
),
orcamentos as (
  select unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os, tipo_servico_id
  ) os_unicas
  group by unidade_id
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
left join pagos p on p.unidade_id = u.id
left join orcamentos o on o.unidade_id = u.id
where u.ativo = true;

-- Valores (Semanal)
create or replace view vw_dashboard_valores_semanal as
with base as (
  select * from lancamentos where data >= (current_date - (extract(dow from current_date))::int)
),
pagos as (
  select unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id
),
orcamentos as (
  select unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os, tipo_servico_id
  ) os_unicas
  group by unidade_id
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
left join pagos p on p.unidade_id = u.id
left join orcamentos o on o.unidade_id = u.id
where u.ativo = true;

-- Orçamentos (OW) — exceto Acessório
create or replace view vw_dashboard_ow as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
    and (categoria_id is null or categoria_id <> (select id from categorias where nome = 'Acessório'))
),
pagos as (
  select unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id
),
orcamentos as (
  select unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os, tipo_servico_id
  ) os_unicas
  group by unidade_id
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
left join pagos p on p.unidade_id = u.id
left join orcamentos o on o.unidade_id = u.id
where u.ativo = true;

-- Vendedores > Acessórios
create or replace view vw_dashboard_vendedores as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
    and categoria_id = (select id from categorias where nome = 'Acessório')
),
pagos as (
  select atendente_id as usuario_id, unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by atendente_id, unidade_id
),
orcamentos as (
  select usuario_id, unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select atendente_id as usuario_id, unidade_id, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by atendente_id, unidade_id, numero_os, tipo_servico_id
  ) os_unicas
  group by usuario_id, unidade_id
)
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join pagos p on p.usuario_id = us.id and p.unidade_id = un.id
left join orcamentos o on o.usuario_id = us.id and o.unidade_id = un.id
where us.ativo = true;

-- Vendedores > Orçamentos (exceto Acessório)
create or replace view vw_dashboard_vendedores_ow as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
    and (categoria_id is null or categoria_id <> (select id from categorias where nome = 'Acessório'))
),
pagos as (
  select atendente_id as usuario_id, unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by atendente_id, unidade_id
),
orcamentos as (
  select usuario_id, unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select atendente_id as usuario_id, unidade_id, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by atendente_id, unidade_id, numero_os, tipo_servico_id
  ) os_unicas
  group by usuario_id, unidade_id
)
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join pagos p on p.usuario_id = us.id and p.unidade_id = un.id
left join orcamentos o on o.usuario_id = us.id and o.unidade_id = un.id
where us.ativo = true;

grant select on vw_dashboard_valores to authenticated;
grant select on vw_dashboard_valores_diario to authenticated;
grant select on vw_dashboard_valores_semanal to authenticated;
grant select on vw_dashboard_ow to authenticated;
grant select on vw_dashboard_vendedores to authenticated;
grant select on vw_dashboard_vendedores_ow to authenticated;
