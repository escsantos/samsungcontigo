-- ============================================================
-- Fase 18 — Linha de operação CI (balcão) x IH (in-home)
--
-- Modelo:
-- • unidades: ganham 2 flags independentes (atende_ci, atende_ih)
--   — uma unidade pode ser só CI, só IH, ou as duas.
-- • usuarios: ganham uma "linha" fixa opcional. Atendente de
--   balcão = 'ci', atendente in-home = 'ih'. Quem não tem linha
--   fixa (null) é gestão — vê/alterna as duas pelo interruptor
--   da tela, e escolhe manualmente a linha ao lançar.
-- • lancamentos: ganham a linha (nunca nula) — herdada do login
--   de quem lançou (se tiver linha fixa) ou escolhida na tela
--   (se for gestão).
-- • metas: passam a ser por unidade + mês + linha (uma unidade
--   com as duas linhas pode ter metas diferentes para cada uma).
-- • Contas a Receber e os dashboards de Valores/OW/Vendedores
--   passam a separar CI de IH (uma linha na tabela para cada).
-- • Painel de TV: o painel principal (/painel) passa a mostrar
--   só CI; criado um painel novo e separado só para IH.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Tipo enumerado
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'linha_tipo') then
    create type linha_tipo as enum ('ci', 'ih');
  end if;
end $$;

-- ------------------------------------------------------------
-- 1) Unidades: quais linhas cada uma atende
-- ------------------------------------------------------------
alter table unidades add column if not exists atende_ci boolean not null default true;
alter table unidades add column if not exists atende_ih boolean not null default false;

-- cria a unidade nova (só IH), se ainda não existir
insert into unidades (nome, codigo, atende_ci, atende_ih)
select 'MSC Cidade Dutra', 'MSCDUT', false, true
where not exists (select 1 from unidades where nome = 'MSC Cidade Dutra');

-- marca as 3 unidades que já existem e também atendem IH
update unidades set atende_ih = true
where nome in ('CSP Campinas', 'CSP São Miguel', 'MSC Ribeirão Preto');

-- ------------------------------------------------------------
-- 2) Usuários: linha fixa opcional (null = gestão, vê as duas)
-- ------------------------------------------------------------
alter table usuarios add column if not exists linha linha_tipo;

-- ------------------------------------------------------------
-- 3) Lançamentos: linha do atendimento (nunca nula)
-- ------------------------------------------------------------
alter table lancamentos add column if not exists linha linha_tipo not null default 'ci';

-- o gatilho de saldo já considera (unidade, OS, tipo de serviço);
-- passa a considerar também a linha, para não misturar CI com IH
-- na mesma "sub-OS" (caso um número de OS seja reaproveitado)
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
    and linha = new.linha
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000');

  select orcamento_aprovado into orcamento
  from lancamentos
  where unidade_id = new.unidade_id
    and numero_os = new.numero_os
    and tipo_servico_id = new.tipo_servico_id
    and linha = new.linha
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
-- 4) Metas: por unidade + mês + linha
-- ------------------------------------------------------------
alter table metas add column if not exists linha linha_tipo not null default 'ci';
alter table metas drop constraint if exists metas_unidade_id_mes_referencia_key;
alter table metas add constraint metas_unidade_mes_linha_key unique (unidade_id, mes_referencia, linha);

-- ------------------------------------------------------------
-- 5) Contas a Receber: uma linha por (unidade, OS, tipo de
--    serviço, linha) — CI e IH nunca se misturam no mesmo saldo
-- ------------------------------------------------------------
drop view if exists vw_contas_a_receber;
create view vw_contas_a_receber as
select
  c.unidade_id,
  c.numero_os,
  c.tipo_servico_id,
  ts.nome as tipo_servico_nome,
  c.linha,
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
    linha,
    max(orcamento_aprovado) as orcamento_aprovado,
    sum(valor_pago) as total_pago,
    max(data) as ultimo_lancamento
  from lancamentos
  group by unidade_id, numero_os, tipo_servico_id, linha
) c
left join tipos_servico ts on ts.id = c.tipo_servico_id
join lateral (
  select categoria_id, modelo_id
  from lancamentos l
  where l.unidade_id = c.unidade_id and l.numero_os = c.numero_os
    and l.tipo_servico_id = c.tipo_servico_id and l.linha = c.linha
  order by l.criado_em desc
  limit 1
) u on true
where c.orcamento_aprovado - c.total_pago > 0;

-- ------------------------------------------------------------
-- 6) Dashboards: uma linha na tabela por (unidade, linha) — uma
--    unidade com as duas linhas aparece 2x, cada uma com seu
--    próprio orçamento/pago/qtd. OS
-- ------------------------------------------------------------

-- Valores (Mensal)
drop view if exists vw_dashboard_valores;
create view vw_dashboard_valores as
with base as (
  select * from lancamentos where data >= date_trunc('month', current_date)::date
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

-- Valores (Diário)
drop view if exists vw_dashboard_valores_diario;
create view vw_dashboard_valores_diario as
with base as (
  select * from lancamentos where data = current_date
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

-- Valores (Semanal)
drop view if exists vw_dashboard_valores_semanal;
create view vw_dashboard_valores_semanal as
with base as (
  select * from lancamentos where data >= (current_date - (extract(dow from current_date))::int)
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

-- Orçamentos (OW) — exceto Acessório
drop view if exists vw_dashboard_ow;
create view vw_dashboard_ow as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
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

-- Vendedores > Acessórios
drop view if exists vw_dashboard_vendedores;
create view vw_dashboard_vendedores as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
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

-- Vendedores > Orçamentos (exceto Acessório)
drop view if exists vw_dashboard_vendedores_ow;
create view vw_dashboard_vendedores_ow as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
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
-- 7) Painel de TV: o principal (/painel) passa a ser só CI;
--    cria as views paralelas para o painel novo, só IH.
-- ------------------------------------------------------------
create or replace view vw_ranking_dia as
select unidade_id, sum(valor_pago) as total_pago, current_date as periodo
from lancamentos
where data = current_date and linha = 'ci'
group by unidade_id;

create or replace view vw_ranking_semana as
select
  unidade_id,
  sum(valor_pago) as total_pago,
  (current_date - (extract(dow from current_date))::int) as inicio_semana
from lancamentos
where data >= (current_date - (extract(dow from current_date))::int) and linha = 'ci'
group by unidade_id;

create or replace view vw_ranking_mes as
select unidade_id, sum(valor_pago) as total_pago,
  date_trunc('month', current_date)::date as mes_referencia
from lancamentos
where data >= date_trunc('month', current_date)::date and linha = 'ci'
group by unidade_id;

drop view if exists vw_painel_tv;
create view vw_painel_tv as
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
  and mt.mes_referencia = date_trunc('month', current_date)::date
  and mt.linha = 'ci'
where u.ativo = true and u.atende_ci = true;

-- Ranking IH (mesma lógica, filtrando linha = 'ih')
create or replace view vw_ranking_dia_ih as
select unidade_id, sum(valor_pago) as total_pago, current_date as periodo
from lancamentos
where data = current_date and linha = 'ih'
group by unidade_id;

create or replace view vw_ranking_semana_ih as
select
  unidade_id,
  sum(valor_pago) as total_pago,
  (current_date - (extract(dow from current_date))::int) as inicio_semana
from lancamentos
where data >= (current_date - (extract(dow from current_date))::int) and linha = 'ih'
group by unidade_id;

create or replace view vw_ranking_mes_ih as
select unidade_id, sum(valor_pago) as total_pago,
  date_trunc('month', current_date)::date as mes_referencia
from lancamentos
where data >= date_trunc('month', current_date)::date and linha = 'ih'
group by unidade_id;

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
  and mt.mes_referencia = date_trunc('month', current_date)::date
  and mt.linha = 'ih'
where u.ativo = true and u.atende_ih = true;

-- Acessórios do painel: também passam a respeitar a linha
drop view if exists vw_painel_acessorios;
create view vw_painel_acessorios as
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
  and l.data >= date_trunc('month', current_date)::date
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
  and l.data >= date_trunc('month', current_date)::date
where us.ativo = true and un.atende_ih = true
group by us.id, us.nome_completo, un.id, un.nome
having coalesce(sum(l.valor_pago), 0) > 0;

grant select on vw_painel_tv to anon;
grant select on vw_painel_tv to authenticated;
grant select on vw_painel_acessorios to anon;
grant select on vw_painel_acessorios to authenticated;
grant select on vw_painel_tv_ih to anon;
grant select on vw_painel_tv_ih to authenticated;
grant select on vw_painel_acessorios_ih to anon;
grant select on vw_painel_acessorios_ih to authenticated;
grant select on vw_dashboard_valores to authenticated;
grant select on vw_dashboard_valores_diario to authenticated;
grant select on vw_dashboard_valores_semanal to authenticated;
grant select on vw_dashboard_ow to authenticated;
grant select on vw_dashboard_vendedores to authenticated;
grant select on vw_dashboard_vendedores_ow to authenticated;
grant select on vw_contas_a_receber to authenticated;
