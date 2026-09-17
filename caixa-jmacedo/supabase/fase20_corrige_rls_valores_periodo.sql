-- ============================================================
-- Fase 20 — Corrige regressão: os dashboards de Valores
-- (Diário/Semanal/Mensal) passaram a consultar "lancamentos"
-- direto da tela, e por isso caíram na regra de segurança (RLS)
-- que só libera ver os lançamentos da própria unidade — todo
-- mundo passou a ver zero nas unidades que não são a sua.
--
-- Essa função roda com permissão elevada (SECURITY DEFINER, como
-- as views antigas) e devolve o ranking completo pra qualquer
-- usuário autenticado — o "buraco" de segurança que o RLS existe
-- pra evitar continua fechado no detalhe por-lançamento (o clique
-- na unidade), que é filtrado à parte, na tela.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function valores_por_periodo(data_inicio date, data_fim_excl date, linha_param linha_tipo default null)
returns table (
  unidade_id uuid,
  unidade_nome text,
  linha linha_tipo,
  orcamento_aprovado numeric,
  valor_pago numeric,
  qtd_os bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select *
    from lancamentos
    where data >= data_inicio
      and data < data_fim_excl
      and (linha_param is null or linha = linha_param)
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
    and ((l.linha = 'ci' and u.atende_ci) or (l.linha = 'ih' and u.atende_ih))
    and (linha_param is null or l.linha = linha_param);
$$;

grant execute on function valores_por_periodo(date, date, linha_tipo) to authenticated;
