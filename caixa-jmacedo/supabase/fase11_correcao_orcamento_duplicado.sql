-- ============================================================
-- Fase 11 — Corrige um erro de cálculo: quando uma OS tinha mais
-- de um lançamento (ex: pagamento parcial + complemento), o
-- orçamento aprovado era somado uma vez POR LANÇAMENTO, em vez
-- de uma vez POR OS — inflando o "Orçamento aprovado" nos
-- dashboards (Valores, Orçamentos OW, Vendedores). O valor pago
-- sempre esteve correto; só o orçamento estava sendo duplicado.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- Dashboard "Valores": todas as categorias
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
    select unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os
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

-- Dashboard "Orçamentos (OW)": todas as categorias, exceto Acessório
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
    select unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os
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

-- Dashboard "Vendedores" > aba Acessórios
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
    select atendente_id as usuario_id, unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by atendente_id, unidade_id, numero_os
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

-- Dashboard "Vendedores" > aba Orçamentos (exceto Acessório)
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
    select atendente_id as usuario_id, unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by atendente_id, unidade_id, numero_os
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
grant select on vw_dashboard_ow to authenticated;
grant select on vw_dashboard_vendedores to authenticated;
grant select on vw_dashboard_vendedores_ow to authenticated;
