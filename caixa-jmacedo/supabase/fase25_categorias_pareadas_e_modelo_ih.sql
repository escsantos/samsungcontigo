-- ============================================================
-- Fase 25 — Duas melhorias:
--
-- 1) Categorias "pareadas": TV e DTV passam a compartilhar o
--    mesmo cadastro de modelos nos dois sentidos (um modelo
--    cadastrado em TV aparece também ao buscar em DTV, e
--    vice-versa) — sem precisar duplicar cadastro.
--
-- 2) Operacional com login fixo IH ganha permissão de cadastrar
--    modelo novo direto (sem precisar de aprovação) — a tela vai
--    pedir confirmação antes de gravar.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- 1) Pareamento entre categorias
alter table categorias add column if not exists categoria_pareada_id uuid references categorias(id);

update categorias set categoria_pareada_id = (select id from categorias where nome = 'DTV')
where nome = 'TV' and exists (select 1 from categorias where nome = 'DTV');

update categorias set categoria_pareada_id = (select id from categorias where nome = 'TV')
where nome = 'DTV' and exists (select 1 from categorias where nome = 'TV');

-- 2) Operacional IH pode cadastrar modelo direto (com confirmação na tela)
drop policy if exists cadastro_insert2 on modelos;
create policy cadastro_insert2 on modelos for insert
  with check (
    meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor')
    or (meu_cargo() = 'operacional' and minha_linha() = 'ih')
  );
