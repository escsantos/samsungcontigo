-- ============================================================
-- Fase 27 — Supervisão e Gerência só podem alterar (e a tela só
-- lista) usuários das PRÓPRIAS unidades. Administrador e Diretor
-- continuam com acesso a todos.
--
-- A validação principal já foi feita nas rotas /api/criar-usuario,
-- /api/editar-usuario e /api/bloquear-usuario (que usam a chave de
-- serviço). Esta regra aqui é uma segunda camada de proteção, caso
-- algo tente alterar a tabela usuarios direto, fora dessas rotas.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

drop policy if exists usuarios_update on usuarios;
create policy usuarios_update on usuarios for update
  using (
    meu_cargo() in ('administrador', 'diretor')
    or id = auth.uid()
    or (
      meu_cargo() in ('supervisao', 'gerencia')
      and exists (
        select 1 from usuario_unidades uu
        where uu.usuario_id = usuarios.id
          and uu.unidade_id in (select minhas_unidades())
      )
    )
  );
