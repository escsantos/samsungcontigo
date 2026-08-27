-- ============================================================
-- Fase 28 — Indicador de usuários online
-- Guarda quando cada usuário acessou o sistema pela última vez;
-- "online" = acessou nos últimos 2 minutos (o app manda um sinal
-- a cada ~40s enquanto a pessoa está com o sistema aberto).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

alter table usuarios add column if not exists ultimo_acesso timestamptz;
