
-- ================================================================
-- NOVA UNIDADE CSP CAMPINAS + CIDADE NOS CARDS DE UNIDADE (10/11/2026)
-- 1) unidades ganha a coluna "cidade" (aparece no card da tela
--    "Selecione a unidade" e em Configurações > Unidades)
-- 2) cria a CSP CAMPINAS (ASC 7123002), Nota Fiscal NÃO obrigatória,
--    numeração de pedidos começando em 1
-- 3) dá acesso a ela para todos os Administradores e Diretores
-- (os impostos da unidade são cadastrados depois em Sistema > Impostos)
-- Rode este bloco inteiro no SQL Editor do Supabase
-- ================================================================

alter table unidades add column if not exists cidade text;

insert into unidades (nome, asc_cod, cidade, obriga_nota_fiscal)
values ('CSP CAMPINAS', '7123002', 'Campinas - SP', false)
on conflict (asc_cod) do update set cidade = excluded.cidade, obriga_nota_fiscal = excluded.obriga_nota_fiscal, ativo = true;

update unidades set cidade = 'São Paulo - SP' where asc_cod = '3495086' and cidade is null;
update unidades set cidade = 'São Paulo - SP' where asc_cod = '7076735' and cidade is null;
update unidades set cidade = 'Santos - SP' where asc_cod = '3197760' and cidade is null;
update unidades set cidade = 'Taboão da Serra - SP' where asc_cod = '3197757' and cidade is null;

insert into perfis_unidades (perfil_id, unidade_id)
select p.id, u.id
from perfis p
cross join unidades u
where u.asc_cod = '7123002'
  and p.cargo in ('Administrador', 'Diretor')
  and not exists (select 1 from perfis_unidades pu where pu.perfil_id = p.id and pu.unidade_id = u.id);

-- conferência: deve listar a CSP CAMPINAS e quem tem acesso
select u.nome, u.asc_cod, u.cidade, u.obriga_nota_fiscal, p.nome as usuario, p.cargo
from unidades u
left join perfis_unidades pu on pu.unidade_id = u.id
left join perfis p on p.id = pu.perfil_id
where u.asc_cod = '7123002'
order by p.nome;
