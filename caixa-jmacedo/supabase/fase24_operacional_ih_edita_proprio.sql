-- ============================================================
-- Fase 24 — Operacional com login fixo IH ganha permissão de
-- alterar (Consulta) os PRÓPRIOS lançamentos de IH — continua
-- sem poder alterar lançamentos de outras pessoas, nem CI, nem
-- de outras unidades.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function minha_linha() returns linha_tipo as $$
  select linha from usuarios where id = auth.uid();
$$ language sql stable;

drop policy if exists lancamentos_update on lancamentos;
create policy lancamentos_update on lancamentos for update
  using (
    (
      meu_cargo() in ('administrador', 'diretor', 'adm', 'gerencia', 'supervisao')
      and (meu_cargo() in ('administrador', 'diretor', 'adm') or unidade_id in (select minhas_unidades()))
    )
    or (
      meu_cargo() = 'operacional'
      and minha_linha() = 'ih'
      and linha = 'ih'
      and atendente_id = auth.uid()
      and unidade_id in (select minhas_unidades())
    )
  );
