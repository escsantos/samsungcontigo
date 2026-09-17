-- ============================================================
-- Fase 29 — Balões de notificação em tempo real
--
-- 1) Toda vez que um lançamento novo é criado, todo mundo que
--    está online recebe um balãozinho de comemoração (unidade,
--    login de quem lançou, e o valor) — some sozinho em 5s.
--
-- 2) O Administrador pode mandar um aviso pra todo mundo online,
--    que aparece no mesmo formato de balão, mas só some quando a
--    pessoa clica pra fechar.
--
-- Os dois usam o Realtime do Supabase (não é só verificação
-- periódica — aparece na hora, assim que acontece).
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create table if not exists avisos_admin (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (char_length(texto) between 1 and 500),
  autor_id uuid not null references usuarios(id),
  criado_em timestamptz not null default now()
);

alter table avisos_admin enable row level security;

create policy avisos_admin_select on avisos_admin for select using (true);

create policy avisos_admin_insert on avisos_admin for insert
  with check (autor_id = auth.uid() and meu_cargo() = 'administrador');

grant select, insert on avisos_admin to authenticated;

-- habilita o Realtime nas duas tabelas (idempotente — não dá erro se já
-- estiver habilitado, por exemplo se você rodar essa migração de novo)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancamentos'
  ) then
    alter publication supabase_realtime add table lancamentos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'avisos_admin'
  ) then
    alter publication supabase_realtime add table avisos_admin;
  end if;
end $$;
