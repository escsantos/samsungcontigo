-- ============================================================
-- Fase 19 — Corrige o fuso horário de "hoje/semana/mês"
--
-- O banco do Supabase roda com o relógio em UTC. Usar current_date
-- direto faz o dia virar às 21h de Brasília (UTC-3), não à
-- meia-noite local — por isso o Dashboard Diário já mostrava o
-- dia seguinte a partir das 21h.
--
-- Cria uma função hoje_brasil() e troca current_date por ela em
-- todas as views que definem "hoje", "esta semana" ou "este mês".
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function hoje_brasil()
returns date as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$ language sql stable;

-- ------------------------------------------------------------
-- Ranking do painel de TV (CI e IH)
-- ------------------------------------------------------------
create or replace view vw_ranking_dia as
select unidade_id, sum(valor_pago) as total_pago, hoje_brasil() as periodo
from lancamentos
where data = hoje_brasil() and linha = 'ci'
group by unidade_id;

create or replace view vw_ranking_semana as
select
  unidade_id,
  sum(valor_pago) as total_pago,
  (hoje_brasil() - (extract(dow from hoje_brasil()))::int) as inicio_semana
from lancamentos
where data >= (hoje_brasil() - (extract(dow from hoje_brasil()))::int) and linha = 'ci'
group by unidade_id;

create or replace view vw_ranking_mes as
select unidade_id, sum(valor_pago) as total_pago,
  date_trunc('month', hoje_brasil())::date as mes_referencia
from lancamentos
where data >= date_trunc('month', hoje_brasil())::date and linha = 'ci'
group by unidade_id;

create or replace view vw_ranking_dia_ih as
select unidade_id, sum(valor_pago) as total_pago, hoje_brasil() as periodo
from lancamentos
where data = hoje_brasil() and linha = 'ih'
group by unidade_id;

create or replace view vw_ranking_semana_ih as
select
  unidade_id,
  sum(valor_pago) as total_pago,
  (hoje_brasil() - (extract(dow from hoje_brasil()))::int) as inicio_semana
from lancamentos
where data >= (hoje_brasil() - (extract(dow from hoje_brasil()))::int) and linha = 'ih'
group by unidade_id;

create or replace view vw_ranking_mes_ih as
select unidade_id, sum(valor_pago) as total_pago,
  date_trunc('month', hoje_brasil())::date as mes_referencia
from lancamentos
where data >= date_trunc('month', hoje_brasil())::date and linha = 'ih'
group by unidade_id;

create or replace view vw_painel_tv as
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(d.total_pago, 0) as total_dia,
  coalesce(s.total_pago, 0) as total_semana,
  coalesce(m.total_pago, 0) as total_mes,
  coalesce(mt.valor_meta, 0) as meta_mes
from unidades u
left join vw_ranking_dia d on d.unidade_id = u.id
left join vw_ranking_semana s on s.unidade_id = u.id
left join vw_ranking_mes m on m.unidade_id = u.id
left join metas mt on mt.unidade_id = u.id
  and mt.mes_referencia = date_trunc('month', hoje_brasil())::date
  and mt.linha = 'ci'
where u.ativo = true and u.atende_ci = true;

create or replace view vw_painel_tv_ih as
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(d.total_pago, 0) as total_dia,
  coalesce(s.total_pago, 0) as total_semana,
  coalesce(m.total_pago, 0) as total_mes,
  coalesce(mt.valor_meta, 0) as meta_mes
from unidades u
left join vw_ranking_dia_ih d on d.unidade_id = u.id
left join vw_ranking_semana_ih s on s.unidade_id = u.id
left join vw_ranking_mes_ih m on m.unidade_id = u.id
left join metas mt on mt.unidade_id = u.id
  and mt.mes_referencia = date_trunc('month', hoje_brasil())::date
  and mt.linha = 'ih'
where u.ativo = true and u.atende_ih = true;

-- ------------------------------------------------------------
-- Acessórios do painel (CI e IH)
-- ------------------------------------------------------------
create or replace view vw_painel_acessorios as
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(sum(l.valor_pago), 0) as total_vendido,
  coalesce(sum(l.valor_pago), 0) * 0.05 as premio
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join lancamentos l on l.atendente_id = us.id
  and l.unidade_id = un.id
  and l.linha = 'ci'
  and l.categoria_id = (select id from categorias where nome = 'Acessório')
  and l.data >= date_trunc('month', hoje_brasil())::date
where us.ativo = true and un.atende_ci = true
group by us.id, us.nome_completo, un.id, un.nome
having coalesce(sum(l.valor_pago), 0) > 0;

create or replace view vw_painel_acessorios_ih as
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(sum(l.valor_pago), 0) as total_vendido,
  coalesce(sum(l.valor_pago), 0) * 0.05 as premio
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join lancamentos l on l.atendente_id = us.id
  and l.unidade_id = un.id
  and l.linha = 'ih'
  and l.categoria_id = (select id from categorias where nome = 'Acessório')
  and l.data >= date_trunc('month', hoje_brasil())::date
where us.ativo = true and un.atende_ih = true
group by us.id, us.nome_completo, un.id, un.nome
having coalesce(sum(l.valor_pago), 0) > 0;

-- ------------------------------------------------------------
-- Dashboard OW e Vendedores (continuam com "mês corrente")
-- ------------------------------------------------------------
create or replace view vw_dashboard_ow as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', hoje_brasil())::date
    and (categoria_id is null or categoria_id <> (select id from categorias where nome = 'Acessório'))
),
pagos as (
  select unidade_id, linha, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id, linha
),
orcamentos as (
  select unidade_id, linha, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, linha, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, linha, numero_os, tipo_servico_id
  ) os_unicas
  group by unidade_id, linha
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  l.linha,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
cross join (select unnest(enum_range(null::linha_tipo)) as linha) l
left join pagos p on p.unidade_id = u.id and p.linha = l.linha
left join orcamentos o on o.unidade_id = u.id and o.linha = l.linha
where u.ativo = true
  and ((l.linha = 'ci' and u.atende_ci) or (l.linha = 'ih' and u.atende_ih));

create or replace view vw_dashboard_vendedores as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', hoje_brasil())::date
    and categoria_id = (select id from categorias where nome = 'Acessório')
),
pagos as (
  select atendente_id as usuario_id, unidade_id, linha, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by atendente_id, unidade_id, linha
),
orcamentos as (
  select usuario_id, unidade_id, linha, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select atendente_id as usuario_id, unidade_id, linha, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by atendente_id, unidade_id, linha, numero_os, tipo_servico_id
  ) os_unicas
  group by usuario_id, unidade_id, linha
)
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(p.linha, o.linha, 'ci'::linha_tipo) as linha,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join pagos p on p.usuario_id = us.id and p.unidade_id = un.id
left join orcamentos o on o.usuario_id = us.id and o.unidade_id = un.id and o.linha = p.linha
where us.ativo = true and p.valor_pago is not null;

create or replace view vw_dashboard_vendedores_ow as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', hoje_brasil())::date
    and (categoria_id is null or categoria_id <> (select id from categorias where nome = 'Acessório'))
),
pagos as (
  select atendente_id as usuario_id, unidade_id, linha, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by atendente_id, unidade_id, linha
),
orcamentos as (
  select usuario_id, unidade_id, linha, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select atendente_id as usuario_id, unidade_id, linha, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by atendente_id, unidade_id, linha, numero_os, tipo_servico_id
  ) os_unicas
  group by usuario_id, unidade_id, linha
)
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(p.linha, o.linha, 'ci'::linha_tipo) as linha,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join pagos p on p.usuario_id = us.id and p.unidade_id = un.id
left join orcamentos o on o.usuario_id = us.id and o.unidade_id = un.id and o.linha = p.linha
where us.ativo = true and p.valor_pago is not null;

-- ------------------------------------------------------------
-- Valores (Diário/Semanal/Mensal): mantidas por compatibilidade,
-- mas essas 3 telas passam a consultar os lançamentos direto
-- (para suportar escolher qualquer dia/semana/mês) — corrigidas
-- aqui só por consistência, caso algo mais volte a usá-las.
-- ------------------------------------------------------------
create or replace view vw_dashboard_valores as
with base as (
  select * from lancamentos where data >= date_trunc('month', hoje_brasil())::date
),
pagos as (
  select unidade_id, linha, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id, linha
),
orcamentos as (
  select unidade_id, linha, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, linha, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, linha, numero_os, tipo_servico_id
  ) os_unicas
  group by unidade_id, linha
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  l.linha,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
cross join (select unnest(enum_range(null::linha_tipo)) as linha) l
left join pagos p on p.unidade_id = u.id and p.linha = l.linha
left join orcamentos o on o.unidade_id = u.id and o.linha = l.linha
where u.ativo = true
  and ((l.linha = 'ci' and u.atende_ci) or (l.linha = 'ih' and u.atende_ih));

create or replace view vw_dashboard_valores_diario as
with base as (
  select * from lancamentos where data = hoje_brasil()
),
pagos as (
  select unidade_id, linha, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id, linha
),
orcamentos as (
  select unidade_id, linha, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, linha, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, linha, numero_os, tipo_servico_id
  ) os_unicas
  group by unidade_id, linha
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  l.linha,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
cross join (select unnest(enum_range(null::linha_tipo)) as linha) l
left join pagos p on p.unidade_id = u.id and p.linha = l.linha
left join orcamentos o on o.unidade_id = u.id and o.linha = l.linha
where u.ativo = true
  and ((l.linha = 'ci' and u.atende_ci) or (l.linha = 'ih' and u.atende_ih));

create or replace view vw_dashboard_valores_semanal as
with base as (
  select * from lancamentos where data >= (hoje_brasil() - (extract(dow from hoje_brasil()))::int)
),
pagos as (
  select unidade_id, linha, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id, linha
),
orcamentos as (
  select unidade_id, linha, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, linha, numero_os, tipo_servico_id, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, linha, numero_os, tipo_servico_id
  ) os_unicas
  group by unidade_id, linha
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  l.linha,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
cross join (select unnest(enum_range(null::linha_tipo)) as linha) l
left join pagos p on p.unidade_id = u.id and p.linha = l.linha
left join orcamentos o on o.unidade_id = u.id and o.linha = l.linha
where u.ativo = true
  and ((l.linha = 'ci' and u.atende_ci) or (l.linha = 'ih' and u.atende_ih));

grant select on vw_dashboard_valores to authenticated;
grant select on vw_dashboard_valores_diario to authenticated;
grant select on vw_dashboard_valores_semanal to authenticated;
grant select on vw_dashboard_ow to authenticated;
grant select on vw_dashboard_vendedores to authenticated;
grant select on vw_dashboard_vendedores_ow to authenticated;
grant select on vw_painel_tv to anon;
grant select on vw_painel_tv to authenticated;
grant select on vw_painel_tv_ih to anon;
grant select on vw_painel_tv_ih to authenticated;
grant select on vw_painel_acessorios to anon;
grant select on vw_painel_acessorios to authenticated;
grant select on vw_painel_acessorios_ih to anon;
grant select on vw_painel_acessorios_ih to authenticated;
