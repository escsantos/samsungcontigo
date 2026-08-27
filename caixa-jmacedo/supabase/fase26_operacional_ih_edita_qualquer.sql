-- ============================================================
-- Fase 26 — Operacional com login fixo IH passa a poder alterar
-- QUALQUER lançamento de IH da(s) unidade(s) dele — não só os que
-- ele mesmo criou (ajuste do que foi feito na Fase 24).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

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
      and unidade_id in (select minhas_unidades())
    )
  );
