-- ============================================================
-- Dados iniciais — rode depois do schema.sql (só em banco novo)
-- ============================================================

insert into unidades (nome, codigo) values
('JM3', 'JM3'),
('CSP Campinas', 'CSPCAMP'),
('CSP São Miguel', 'CSPSMIG'),
('MSC Ribeirão Preto', 'MSCRP'),
('ESC Santos', 'ESCSAN'),
('ESC Guarulhos', 'ESCGRU'),
('ESC Ferraz de Vasconcelos', 'ESCFER'),
('ESC Taboão da Serra', 'ESCTAB'),
('INSS Shopping Interlagos', 'INSINT'),
('INSS Shopping Morumbi', 'INSMOR'),
('INSS Shopping Marília', 'INSMAR'),
('INSS Shopping Bauru', 'INSBAU'),
('INSS Shopping Piracicaba', 'INSPIR'),
('INSS Shopping São José dos Campos', 'INSSJC'),
('INSS Shopping Taubaté', 'INSTAU'),
('INSS Shopping Ribeirão Preto (Novo Ribeirão)', 'INSRP1'),
('INSS Shopping Ribeirão Preto (Ribeirão Shopping)', 'INSRP2'),
('INSS Shopping São José do Rio Preto', 'INSSJP'),
('INSS Shopping Campinas (Pq Dom Pedro)', 'INSCP1'),
('INSS Shopping Campinas (Iguatemi)', 'INSCP2'),
('INSS Shopping Jundiaí', 'INSJUN');

insert into categorias (nome) values
('Celular'), ('TV'), ('Tablet'), ('Relógio'), ('Notebook'), ('Robô'), ('Acessório');

-- lista oficial enviada pelo Grupo J.Macedo (arquivo TIPO_DE_SERVIÇO.xlsx)
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
