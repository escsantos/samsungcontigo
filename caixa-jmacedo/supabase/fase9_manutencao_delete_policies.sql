-- ============================================================
-- Fase 9 — Manutenção do banco de dados (Configurações > Admin)
-- Libera a exclusão em massa (só para Administrador/Diretor) nas
-- tabelas de metas, log de auditoria e solicitações de senha —
-- lançamentos já podia ser excluído por esses cargos.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create policy metas_delete on metas for delete
  using (meu_cargo() in ('administrador', 'diretor'));

create policy log_delete on log_auditoria for delete
  using (meu_cargo() in ('administrador', 'diretor'));

create policy solicitacoes_senha_delete on solicitacoes_senha for delete
  using (meu_cargo() in ('administrador', 'diretor'));
