-- ============================================================
-- Fase 31 — Estatísticas do sistema (Configurações → Estatísticas)
--
-- 4 funções de agregação, todas SEM security definer — rodam com
-- a permissão de quem chama, então respeitam a mesma regra de
-- unidade de sempre (Supervisão/Gerência só veem as próprias
-- unidades; Administrador/Diretor veem tudo).
--
-- Todas aceitam os mesmos 4 parâmetros:
--   data_inicio, data_fim_excl  → período (fim exclusivo)
--   unidade_id_param            → uma unidade só (ou null = não filtra por unidade)
--   marca_param                 → grupo por marca, ex: 'CSP' (ou null = não filtra)
-- Se os dois (unidade e marca) vierem null, mostra tudo que o usuário tem acesso.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- 1) Série diária — quantidade e valor por dia, separado por linha (CI/IH)
create or replace function estatisticas_series_diarias(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null
)
returns table (dia date, linha linha_tipo, qtd bigint, valor_total numeric)
language sql stable as $$
  select l.data as dia, l.linha, count(*) as qtd, coalesce(sum(l.valor_pago), 0) as valor_total
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
  group by l.data, l.linha
  order by l.data;
$$;

-- 2) Pareto por horário do dia (0–23), em horário de Brasília
create or replace function estatisticas_por_hora(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null
)
returns table (hora int, qtd bigint)
language sql stable as $$
  select extract(hour from l.criado_em at time zone 'America/Sao_Paulo')::int as hora, count(*) as qtd
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
  group by 1
  order by 1;
$$;

-- 3) Mapa de calor dia da semana × hora (0=domingo)
create or replace function estatisticas_mapa_calor(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null
)
returns table (dia_semana int, hora int, qtd bigint)
language sql stable as $$
  select
    extract(dow from l.data)::int as dia_semana,
    extract(hour from l.criado_em at time zone 'America/Sao_Paulo')::int as hora,
    count(*) as qtd
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
  group by 1, 2
  order by 1, 2;
$$;

-- 4) Distribuição por categoria (quantidade e valor)
create or replace function estatisticas_por_categoria(
  data_inicio date, data_fim_excl date, unidade_id_param uuid default null, marca_param text default null
)
returns table (categoria text, qtd bigint, valor_total numeric)
language sql stable as $$
  select coalesce(c.nome, 'Sem categoria') as categoria, count(*) as qtd, coalesce(sum(l.valor_pago), 0) as valor_total
  from lancamentos l
  join unidades un on un.id = l.unidade_id
  left join categorias c on c.id = l.categoria_id
  where l.data >= data_inicio and l.data < data_fim_excl
    and (unidade_id_param is null or l.unidade_id = unidade_id_param)
    and (marca_param is null or un.nome like marca_param || '%')
  group by c.nome
  order by qtd desc;
$$;

grant execute on function estatisticas_series_diarias(date, date, uuid, text) to authenticated;
grant execute on function estatisticas_por_hora(date, date, uuid, text) to authenticated;
grant execute on function estatisticas_mapa_calor(date, date, uuid, text) to authenticated;
grant execute on function estatisticas_por_categoria(date, date, uuid, text) to authenticated;
