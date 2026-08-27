-- ============================================================
-- Fase 5 — Dashboard "Orçamentos (OW)": todas as vendas do mês,
-- por unidade, EXCETO acessórios. Mesmo padrão do Dashboard
-- Valores (visível a todos; o detalhe fica protegido na tela).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace view vw_dashboard_ow as
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(sum(l.orcamento_aprovado), 0) as orcamento_aprovado,
  coalesce(sum(l.valor_pago), 0) as valor_pago,
  count(distinct l.numero_os) as qtd_os
from unidades u
left join lancamentos l on l.unidade_id = u.id
  and l.data >= date_trunc('month', current_date)::date
  and (l.categoria_id is null or l.categoria_id <> (select id from categorias where nome = 'Acessório'))
where u.ativo = true
group by u.id, u.nome;

grant select on vw_dashboard_ow to authenticated;
