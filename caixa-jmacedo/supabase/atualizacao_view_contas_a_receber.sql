-- ============================================================
-- Atualização: a view de contas a receber passa a trazer também
-- o tipo de serviço / categoria / modelo do último lançamento da
-- OS, para permitir quitar o saldo direto pelo popup da tela.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace view vw_contas_a_receber as
select
  c.unidade_id,
  c.numero_os,
  c.orcamento_aprovado,
  c.total_pago,
  c.orcamento_aprovado - c.total_pago as falta_pagar,
  c.ultimo_lancamento,
  u.tipo_servico_id,
  u.categoria_id,
  u.modelo_id
from (
  select
    unidade_id,
    numero_os,
    max(orcamento_aprovado) as orcamento_aprovado,
    sum(valor_pago) as total_pago,
    max(data) as ultimo_lancamento
  from lancamentos
  group by unidade_id, numero_os
) c
join lateral (
  select tipo_servico_id, categoria_id, modelo_id
  from lancamentos l
  where l.unidade_id = c.unidade_id and l.numero_os = c.numero_os
  order by l.criado_em desc
  limit 1
) u on true
where c.orcamento_aprovado - c.total_pago > 0;
