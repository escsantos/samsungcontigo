-- ============================================================
-- Fase 10 — Novo cargo "ADM": acesso operacional a todas as
-- unidades, sem acesso a Configurações.
-- Rode no SQL Editor do seu projeto Supabase.
--
-- Se der erro de "unsafe use of new value" ao rodar tudo de uma
-- vez, rode só a primeira linha (ALTER TYPE) sozinha, clique em
-- Run, depois cole e rode o resto do arquivo separadamente.
-- ============================================================

alter type cargo_tipo add value if not exists 'adm';

-- ------------------------------------------------------------
-- Lançamentos: ADM enxerga e corrige tudo, de qualquer unidade,
-- igual Administrador/Diretor.
-- ------------------------------------------------------------
drop policy if exists lancamentos_select on lancamentos;
create policy lancamentos_select on lancamentos for select
  using (
    meu_cargo() in ('administrador', 'diretor', 'adm')
    or unidade_id in (select minhas_unidades())
  );

drop policy if exists lancamentos_update on lancamentos;
create policy lancamentos_update on lancamentos for update
  using (
    meu_cargo() in ('administrador', 'diretor', 'adm', 'gerencia', 'supervisao')
    and (meu_cargo() in ('administrador', 'diretor', 'adm') or unidade_id in (select minhas_unidades()))
  );

drop policy if exists lancamentos_delete on lancamentos;
create policy lancamentos_delete on lancamentos for delete
  using (
    meu_cargo() in ('administrador', 'diretor', 'adm', 'gerencia')
    and (meu_cargo() in ('administrador', 'diretor', 'adm') or unidade_id in (select minhas_unidades()))
  );
