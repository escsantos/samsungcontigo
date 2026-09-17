-- ============================================================
-- Fase 14 — Dashboard "Valores": versões Semanal e Diária, no
-- mesmo formato da versão mensal já existente (sem duplicar
-- orçamento quando uma OS tem mais de um lançamento).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- Diário (hoje)
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

grant select on vw_dashboard_valores_diario to authenticated;

-- Semanal (domingo a sábado, mesmo padrão usado no resto do sistema)
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

grant select on vw_dashboard_valores_semanal to authenticated;
