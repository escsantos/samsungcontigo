-- ============================================================
-- Fase 6 — Dashboard Vendedores: separar em Orçamentos x Acessórios
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace view vw_dashboard_vendedores_ow as
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(sum(l.orcamento_aprovado), 0) as orcamento_aprovado,
  coalesce(sum(l.valor_pago), 0) as valor_pago,
  count(distinct l.numero_os) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join lancamentos l on l.atendente_id = us.id
  and l.unidade_id = un.id
  and l.data >= date_trunc('month', current_date)::date
  and (l.categoria_id is null or l.categoria_id <> (select id from categorias where nome = 'Acessório'))
where us.ativo = true
group by us.id, us.nome_completo, un.id, un.nome;

grant select on vw_dashboard_vendedores_ow to authenticated;
