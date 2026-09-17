-- ============================================================
-- Fase 12 — Excluir lançamento com justificativa (Consulta)
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

alter table lancamentos add column if not exists motivo_exclusao text;
