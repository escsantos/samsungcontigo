-- ============================================================
-- Atualização: substitui as categorias/tipos de serviço de teste
-- pela lista oficial (TIPO_DE_SERVIÇO.xlsx) e corrige acentuação.
-- Rode isso no SQL Editor do seu projeto Supabase (o que já está
-- em uso), numa "New query".
-- ============================================================

-- apaga o(s) lançamento(s) de teste que você criou (senão a limpeza
-- abaixo falha, porque eles apontam pra um tipo de serviço antigo)
delete from lancamentos;

-- limpa os cadastros de teste
delete from modelos;
delete from tipos_servico;
delete from categorias;

-- recria categorias
insert into categorias (nome) values
('Celular'), ('TV'), ('Tablet'), ('Relógio'), ('Notebook'), ('Robô'), ('Acessório');

-- recria tipos de serviço com a lista oficial
insert into tipos_servico (nome, categoria_id) values
('ROBÔ - TAXA DE ANÁLISE', (select id from categorias where nome = 'Robô')),
('ROBÔ - PARECER TÉCNICO', (select id from categorias where nome = 'Robô')),
('ROBÔ - OUTROS REPARO', (select id from categorias where nome = 'Robô')),
('RELÓGIO - TAXA DE ANÁLISE', (select id from categorias where nome = 'Relógio')),
('RELÓGIO - PARECER TÉCNICO', (select id from categorias where nome = 'Relógio')),
('RELÓGIO - OUTROS REPARO', (select id from categorias where nome = 'Relógio')),
('RELÓGIO - REPARO TELA', (select id from categorias where nome = 'Relógio')),
('TABLET - TAXA DE ANÁLISE', (select id from categorias where nome = 'Tablet')),
('TABLET - PARECER TÉCNICO', (select id from categorias where nome = 'Tablet')),
('TABLET - OUTROS REPARO', (select id from categorias where nome = 'Tablet')),
('TABLET - REPARO TELA', (select id from categorias where nome = 'Tablet')),
('TABLET - DESBLOQUEIO', (select id from categorias where nome = 'Tablet')),
('CELULAR - PARECER TÉCNICO', (select id from categorias where nome = 'Celular')),
('CELULAR - OUTROS REPARO', (select id from categorias where nome = 'Celular')),
('CELULAR - REPARO TELA', (select id from categorias where nome = 'Celular')),
('CELULAR - DESBLOQUEIO', (select id from categorias where nome = 'Celular')),
('NOTEBOOK - TAXA DE ANÁLISE', (select id from categorias where nome = 'Notebook')),
('NOTEBOOK - PARECER TÉCNICO', (select id from categorias where nome = 'Notebook')),
('NOTEBOOK - OUTROS REPARO', (select id from categorias where nome = 'Notebook')),
('NOTEBOOK - REPARO TELA', (select id from categorias where nome = 'Notebook')),
('NOTEBOOK - SOFTWARE', (select id from categorias where nome = 'Notebook')),
('TV - TAXA DE ANÁLISE', (select id from categorias where nome = 'TV')),
('TV - PARECER TÉCNICO', (select id from categorias where nome = 'TV')),
('TV - OUTROS REPARO', (select id from categorias where nome = 'TV')),
('TV - REPARO OPEN CELL', (select id from categorias where nome = 'TV')),
('TV - REPARO PAINEL', (select id from categorias where nome = 'TV')),
('TV - BARRAMENTO', (select id from categorias where nome = 'TV')),
('ACESSÓRIO - CONTROLE', (select id from categorias where nome = 'Acessório')),
('ACESSÓRIO - PELÍCULA SAMSUNG', (select id from categorias where nome = 'Acessório')),
('ACESSÓRIO - CABO', (select id from categorias where nome = 'Acessório')),
('ACESSÓRIO - OUTROS', (select id from categorias where nome = 'Acessório')),
('ACESSÓRIO - PELÍCULA INTERNA', (select id from categorias where nome = 'Acessório')),
('ACESSÓRIO - FONTE + CARREGADOR', (select id from categorias where nome = 'Acessório')),
('ACESSÓRIO - FONTE', (select id from categorias where nome = 'Acessório')),
('ACESSÓRIO - FONTE NOTEBOOK', (select id from categorias where nome = 'Acessório')),
('ACESSÓRIO - FONE', (select id from categorias where nome = 'Acessório'));
