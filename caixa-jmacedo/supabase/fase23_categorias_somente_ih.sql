-- ============================================================
-- Fase 23 — Categorias exclusivas de IH
--
-- Algumas categorias de serviço só existem no atendimento IH
-- (DTV, WSM, ACN, REF, CKT). Elas ficam escondidas do formulário
-- de Lançamento quando a linha selecionada é CI — só aparecem
-- quando a linha é IH (atendente fixo IH, ou gestão com o
-- seletor em "IH").
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

alter table categorias add column if not exists somente_ih boolean not null default false;

insert into categorias (nome, somente_ih)
select nome, true
from (values ('DTV'), ('WSM'), ('ACN'), ('REF'), ('CKT')) as novas(nome)
where not exists (select 1 from categorias c where c.nome = novas.nome);

-- caso essas categorias já existissem cadastradas antes (por
-- qualquer motivo), garante que ficam marcadas como IH mesmo assim
update categorias set somente_ih = true where nome in ('DTV', 'WSM', 'ACN', 'REF', 'CKT');
