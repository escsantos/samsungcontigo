-- ============================================================
-- Fase 32 — Relatório Pareto (Operação → Pareto)
--
-- Compara volume/valor por data, filtrando por mês(es), dia(s) da
-- semana e unidade(s). Sem security definer — respeita a mesma
-- regra de unidade de sempre (Supervisão/Gerência só veem as
-- próprias; Administrador/Diretor veem tudo).
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function relatorio_pareto_por_data(
  meses text[],                    -- ex: ARRAY['2026-08','2026-09']
  dias_semana int[],               -- 0=domingo .. 6=sábado
  unidade_ids uuid[] default null  -- null ou vazio = todas que o usuário tem acesso
)
returns table (dia date, unidade_id uuid, unidade_nome text, qtd bigint, valor_total numeric)
language sql stable as $$
  select l.data as dia, l.unidade_id, un.nome as unidade_nome,
         count(*) as qtd, coalesce(sum(l.valor_pago), 0) as valor_total
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  where to_char(l.data, 'YYYY-MM') = any(meses)
    and extract(dow from l.data)::int = any(dias_semana)
    and (unidade_ids is null or array_length(unidade_ids, 1) is null or l.unidade_id = any(unidade_ids))
  group by l.data, l.unidade_id, un.nome
  order by l.data;
$$;

grant execute on function relatorio_pareto_por_data(text[], int[], uuid[]) to authenticated;
