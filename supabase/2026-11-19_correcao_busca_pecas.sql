-- ================================================================
-- CORREÇÃO DA BUSCA DE PEÇAS (19/11/2026)
-- Peças com descrição/modelo vazio (ex.: cadastro manual) apareciam em
-- qualquer pesquisa: campo vazio (NULL) fazia o filtro "não decidir" e a
-- peça passava. Agora campo vazio conta como texto vazio.
-- Rode este bloco inteiro no SQL Editor do Supabase
-- ================================================================

create or replace function buscar_pecas_filtro(
  p_unidade_id bigint,
  p_termos text[] default '{}',
  p_categoria text default null,
  p_limite integer default 300
)
returns table (
  id bigint,
  modelo text,
  categoria text,
  codigo text,
  descricao_resumida text,
  descricao_peca text,
  valor_unitario numeric,
  data_referencia text,
  unidade_origem_id bigint,
  unidade_origem_nome text,
  asc_cod_origem text,
  cadastro_manual boolean,
  cadastrado_por_nome text,
  cadastrado_em timestamptz
)
language sql security definer set search_path = public stable as $$
  with unidade_atual as (select asc_cod from unidades where id = p_unidade_id),
  termos as (select coalesce(array_remove(p_termos, ''), '{}') as t),
  cat_filtrado as (
    select c.*
    from pecas_catalogo c
    where (p_categoria is null or c.categoria = p_categoria)
      and not exists (
        select 1 from unnest((select t from termos)) as x(termo)
        where not (
          coalesce(c.modelo, '') ilike '%' || x.termo || '%'
          or coalesce(c.codigo, '') ilike '%' || x.termo || '%'
          or coalesce(c.descricao_resumida, '') ilike '%' || x.termo || '%'
          or coalesce(c.descricao_peca, '') ilike '%' || x.termo || '%'
        )
      )
    order by c.modelo
    limit p_limite
  ),
  catalogadas as (
    select
      c.id, c.modelo, c.categoria, c.codigo, c.descricao_resumida, c.descricao_peca,
      coalesce(p_local.valor_unitario, p_fallback.valor_unitario) as valor_unitario,
      coalesce(p_local.data_referencia, p_fallback.data_referencia) as data_referencia,
      coalesce(p_local.unidade_id, p_fallback.unidade_id) as unidade_origem_id,
      coalesce(u_local.nome, u_fallback.nome) as unidade_origem_nome,
      coalesce(p_local.asc_cod_origem, p_fallback.asc_cod_origem) as asc_cod_origem,
      c.cadastro_manual,
      cad.nome as cadastrado_por_nome,
      c.cadastrado_em
    from cat_filtrado c
    left join pecas_precos p_local
      on p_local.codigo = c.codigo
      and p_local.asc_cod_origem = (select asc_cod from unidade_atual)
      and p_local.valor_unitario is not null
    left join unidades u_local on u_local.id = p_local.unidade_id
    left join lateral (
      select pp.unidade_id, pp.valor_unitario, pp.data_referencia, pp.asc_cod_origem
      from pecas_precos pp
      where pp.codigo = c.codigo
        and pp.asc_cod_origem is distinct from (select asc_cod from unidade_atual)
        and pp.valor_unitario is not null
      order by pp.atualizado_em desc
      limit 1
    ) p_fallback on p_local.valor_unitario is null
    left join unidades u_fallback on u_fallback.id = p_fallback.unidade_id
    left join perfis cad on cad.id = c.cadastrado_por
  ),
  -- códigos que só existem nas Deliveries (sem modelo no GSPN) — "Não Classificado"
  lotes_filtrados as (
    select l.*
    from lotes_pecas l
    where (p_categoria is null or p_categoria = 'Não Classificado')
      and l.valor_unitario is not null
      and not exists (
        select 1 from unnest((select t from termos)) as x(termo)
        where not (
          coalesce(l.codigo, '') ilike '%' || x.termo || '%'
          or 'Sem classificação (Base GSPN) — custo da Base Peças' ilike '%' || x.termo || '%'
        )
      )
      and not exists (select 1 from pecas_catalogo c where c.codigo = l.codigo)
  ),
  nao_classificadas as (
    select distinct on (l.codigo)
      -l.id as id,
      ''::text as modelo,
      'Não Classificado'::text as categoria,
      l.codigo,
      'Sem classificação (Base GSPN) — custo da Base Peças'::text as descricao_resumida,
      ''::text as descricao_peca,
      l.valor_unitario,
      l.data_nf as data_referencia,
      l.unidade_id as unidade_origem_id,
      u.nome as unidade_origem_nome,
      l.asc_cod_origem,
      false as cadastro_manual,
      null::text as cadastrado_por_nome,
      null::timestamptz as cadastrado_em
    from lotes_filtrados l
    left join unidades u on u.id = l.unidade_id
    order by l.codigo,
      case when l.asc_cod_origem = (select asc_cod from unidade_atual) then 0 else 1 end,
      l.criado_em desc
  )
  select * from (
    select * from catalogadas
    union all
    (select * from nao_classificadas limit p_limite)
  ) r
  order by r.modelo
  limit p_limite;
$$;

grant execute on function buscar_pecas_filtro(bigint, text[], text, integer) to authenticated;
