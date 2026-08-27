-- ============================================================
-- Fase 4 — Views para os Dashboards visíveis a todos os usuários
-- (o ranking mostra todas as unidades; o detalhe (drill-down)
-- continua protegido pela tela — só abre para quem tem acesso
-- àquela unidade específica, verificado no código do app).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- Dashboard "Valores": totais do mês por unidade, para todas as unidades
create or replace view vw_dashboard_valores as
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(sum(l.orcamento_aprovado), 0) as orcamento_aprovado,
  coalesce(sum(l.valor_pago), 0) as valor_pago,
  count(distinct l.numero_os) as qtd_os
from unidades u
left join lancamentos l on l.unidade_id = u.id
  and l.data >= date_trunc('month', current_date)::date
where u.ativo = true
group by u.id, u.nome;

grant select on vw_dashboard_valores to authenticated;

-- Dashboard "Vendedores": vendas de acessórios do mês, por atendente + unidade,
-- em todas as unidades (mesma lógica do painel de TV, mas com orçamento/qtd também)
create or replace view vw_dashboard_vendedores as
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
  and l.categoria_id = (select id from categorias where nome = 'Acessório')
  and l.data >= date_trunc('month', current_date)::date
where us.ativo = true
group by us.id, us.nome_completo, un.id, un.nome;

grant select on vw_dashboard_vendedores to authenticated;

-- garante que o painel de TV (usado sem login) também continua acessível
grant select on vw_painel_tv to authenticated;
grant select on vw_painel_acessorios to authenticated;
