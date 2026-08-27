-- ============================================================
-- Fase 8 — Corrige o cálculo de semana no painel de TV para
-- domingo→sábado (o Postgres calcula semana ISO, que começa na
-- segunda-feira, por padrão — por isso a aba "Semana" do painel
-- não estava batendo com o padrão domingo-sábado usado no resto
-- do sistema).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace view vw_ranking_semana as
select
  unidade_id,
  sum(valor_pago) as total_pago,
  (current_date - (extract(dow from current_date))::int) as inicio_semana
from lancamentos
where data >= (current_date - (extract(dow from current_date))::int)
group by unidade_id;
