-- ============================================================
-- Atualização: número da OS passa de 8 para 10 caracteres
-- (novo padrão: só números com zero à esquerda, ou "O-00000015" / "V-00000015")
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

alter table lancamentos drop constraint if exists lancamentos_numero_os_check;
alter table lancamentos add constraint lancamentos_numero_os_check check (char_length(numero_os) <= 10);
