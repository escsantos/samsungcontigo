-- ============================================================
-- Fase 7 — Corrige permissão: faltava liberar ALTERAR e EXCLUIR
-- em categorias, modelos e tipos de serviço (só a criação estava
-- liberada no banco; por isso os botões pareciam não funcionar).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create policy cadastro_update_categorias on categorias for update
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));
create policy cadastro_delete_categorias on categorias for delete
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));

create policy cadastro_update_modelos on modelos for update
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));
create policy cadastro_delete_modelos on modelos for delete
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));

create policy cadastro_update_tipos_servico on tipos_servico for update
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));
create policy cadastro_delete_tipos_servico on tipos_servico for delete
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));
