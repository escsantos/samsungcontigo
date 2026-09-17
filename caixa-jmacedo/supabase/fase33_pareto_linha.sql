-- ============================================================
-- Fase 33 — Relatório Pareto passa a respeitar o interruptor de
-- linha (CI + IH / Detalhado / CI / IH) do topo da tela, igual
-- todos os outros dashboards.
--
-- A função agora também devolve a linha de cada lançamento, pra
-- telas que precisam separar CI de IH (modo "Detalhado").
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

drop function if exists relatorio_pareto_por_data(text[], int[], uuid[]);

create or replace function relatorio_pareto_por_data(
  meses text[],
  dias_semana int[],
  unidade_ids uuid[] default null,
  linha_param linha_tipo default null
)
returns table (dia date, unidade_id uuid, unidade_nome text, linha linha_tipo, qtd bigint, valor_total numeric)
language sql stable as $$
  select l.data as dia, l.unidade_id, un.nome as unidade_nome, l.linha,
         count(*) as qtd, coalesce(sum(l.valor_pago), 0) as valor_total
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  where to_char(l.data, 'YYYY-MM') = any(meses)
    and extract(dow from l.data)::int = any(dias_semana)
    and (unidade_ids is null or array_length(unidade_ids, 1) is null or l.unidade_id = any(unidade_ids))
    and (linha_param is null or l.linha = linha_param)
  group by l.data, l.unidade_id, un.nome, l.linha
  order by l.data;
$$;

grant execute on function relatorio_pareto_por_data(text[], int[], uuid[], linha_tipo) to authenticated;
