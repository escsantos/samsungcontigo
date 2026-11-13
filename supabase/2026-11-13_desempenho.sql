
-- ================================================================
-- DESEMPENHO (13/11/2026) — sem mudar nenhum dado nem regra
-- 1) Índices nas colunas usadas o tempo todo em filtros e junções
--    (itens/pagamentos de cada pedido, pedidos por unidade/data,
--    vínculos de usuário x unidade, preços e Deliveries por código).
-- 2) Índices de "busca por pedaço de texto" (pg_trgm) para a Consulta
--    de Peças (ilike '%termo%' em modelo/código/descrição).
-- 3) buscar_pecas_filtro: mesma busca da buscar_pecas, mas filtra ANTES
--    de calcular preço/Delivery (a antiga montava TODO o catálogo e
--    TODAS as Deliveries a cada tecla digitada — com o robô carregando
--    as bases de 5 unidades, isso ficou pesado). A antiga continua
--    existindo (as telas usam a nova e caem na antiga se precisar).
-- 4) contar_categorias_catalogo: contagem por categoria direto no banco
--    (a Consulta baixava o catálogo inteiro só para contar).
-- Rode este bloco inteiro no SQL Editor do Supabase (pode levar 1 a 2 min)
-- ================================================================

create extension if not exists pg_trgm;

-- pedidos e o que pendura neles
create index if not exists idx_orcamento_itens_orcamento on orcamento_itens (orcamento_id);
create index if not exists idx_orcamento_itens_pago_fab on orcamento_itens (orcamento_id) where custo_pago_fabricante;
create index if not exists idx_pagamentos_orcamento_orc on pagamentos_orcamento (orcamento_id);
create index if not exists idx_pagamento_anexos_pag on pagamento_anexos (pagamento_id);
create index if not exists idx_orcamentos_unidade_criado on orcamentos (unidade_id, criado_em desc);
create index if not exists idx_orcamentos_unidade_entregue on orcamentos (unidade_id, entregue_em) where entregue;
create index if not exists idx_orcamentos_vendedor on orcamentos (vendedor_id);
create index if not exists idx_orcamentos_cliente on orcamentos (cliente_id);
create index if not exists idx_orcamentos_pai on orcamentos (pedido_pai_id) where pedido_pai_id is not null;
create index if not exists idx_perfis_unidades_unidade on perfis_unidades (unidade_id, perfil_id);
create index if not exists idx_notificacoes_criado on notificacoes (criado_em desc);
create index if not exists idx_pecas_processamentos_unid on pecas_processamentos (unidade_id, processado_em desc);

-- preços e Deliveries por código (usados pela Consulta de Peças)
create index if not exists idx_pecas_precos_codigo_asc on pecas_precos (codigo, asc_cod_origem);
create index if not exists idx_pecas_precos_codigo_recente on pecas_precos (codigo, atualizado_em desc) where valor_unitario is not null;
create index if not exists idx_lotes_codigo_recente on lotes_pecas (codigo, criado_em desc) where valor_unitario is not null;
create index if not exists idx_pecas_catalogo_codigo on pecas_catalogo (codigo);
create index if not exists idx_pecas_catalogo_categoria on pecas_catalogo (categoria);

-- busca por pedaço de texto
create index if not exists idx_trgm_catalogo_modelo on pecas_catalogo using gin (modelo gin_trgm_ops);
create index if not exists idx_trgm_catalogo_codigo on pecas_catalogo using gin (codigo gin_trgm_ops);
create index if not exists idx_trgm_catalogo_desc_res on pecas_catalogo using gin (descricao_resumida gin_trgm_ops);
create index if not exists idx_trgm_catalogo_desc_peca on pecas_catalogo using gin (descricao_peca gin_trgm_ops);
create index if not exists idx_trgm_lotes_codigo on lotes_pecas using gin (codigo gin_trgm_ops);

-- busca de peças com o filtro aplicado antes do cálculo
-- p_termos: cada termo precisa aparecer em modelo, código ou descrição (igual à tela)
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
          c.modelo ilike '%' || x.termo || '%'
          or c.codigo ilike '%' || x.termo || '%'
          or c.descricao_resumida ilike '%' || x.termo || '%'
          or c.descricao_peca ilike '%' || x.termo || '%'
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
          l.codigo ilike '%' || x.termo || '%'
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

-- contagem por categoria (filtros da Consulta de Peças)
create or replace function contar_categorias_catalogo()
returns table (categoria text, total bigint)
language sql security definer set search_path = public stable as $$
  select categoria, count(*) from pecas_catalogo group by categoria order by categoria;
$$;
grant execute on function contar_categorias_catalogo() to authenticated;

-- atualiza as estatísticas para o banco escolher bem os índices novos
analyze orcamentos;
analyze orcamento_itens;
analyze pagamentos_orcamento;
analyze pecas_catalogo;
analyze pecas_precos;
analyze lotes_pecas;
