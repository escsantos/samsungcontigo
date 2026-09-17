-- ============================================================
-- Fase 22 — Notificação diferenciada quando alguém é @mencionado
-- no mural (além do contador normal de mensagens novas).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create table if not exists mural_notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  mensagem_id uuid not null references mural_mensagens(id) on delete cascade,
  autor_id uuid not null references usuarios(id),
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists idx_mural_notificacoes_usuario on mural_notificacoes (usuario_id, lida);

alter table mural_notificacoes enable row level security;

create policy mural_notificacoes_select on mural_notificacoes for select
  using (usuario_id = auth.uid());

create policy mural_notificacoes_update on mural_notificacoes for update
  using (usuario_id = auth.uid());

grant select, update on mural_notificacoes to authenticated;

-- ao postar uma mensagem, detecta @login válidos no texto e cria uma
-- notificação de menção pra cada pessoa citada (exceto pra si mesmo)
create or replace function registrar_mencoes_mural()
returns trigger as $$
declare
  login_mencionado text;
  id_mencionado uuid;
begin
  for login_mencionado in
    select distinct lower(m[1])
    from regexp_matches(new.texto, '@([a-zA-Z0-9._]+)', 'g') as m
  loop
    select id into id_mencionado from usuarios where lower(login) = login_mencionado;
    if id_mencionado is not null and id_mencionado <> new.usuario_id then
      insert into mural_notificacoes (usuario_id, mensagem_id, autor_id)
      values (id_mencionado, new.id, new.usuario_id);
    end if;
  end loop;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_registrar_mencoes_mural on mural_mensagens;
create trigger trg_registrar_mencoes_mural
after insert on mural_mensagens
for each row execute function registrar_mencoes_mural();
