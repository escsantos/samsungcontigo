-- ============================================================
-- Fase 21 — Mural de mensagens (estilo chat curto, tipo X/Twitter)
-- Qualquer usuário logado pode postar uma mensagem curta; todos
-- veem o mural com login + data/hora, em ordem cronológica.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create table if not exists mural_mensagens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  texto text not null check (char_length(texto) between 1 and 280),
  criado_em timestamptz not null default now()
);

create index if not exists idx_mural_mensagens_criado_em on mural_mensagens (criado_em desc);

alter table mural_mensagens enable row level security;

create policy mural_mensagens_select on mural_mensagens for select
  using (true);

create policy mural_mensagens_insert on mural_mensagens for insert
  with check (usuario_id = auth.uid());

-- controle por usuário: até onde ele já leu, e se quer receber o
-- aviso de mensagens novas (o "desligar notificação" pedido)
create table if not exists mural_status_usuario (
  usuario_id uuid primary key references usuarios(id),
  ultima_leitura timestamptz not null default now(),
  notificacoes_ativas boolean not null default true
);

alter table mural_status_usuario enable row level security;

create policy mural_status_select on mural_status_usuario for select
  using (usuario_id = auth.uid());

create policy mural_status_insert on mural_status_usuario for insert
  with check (usuario_id = auth.uid());

create policy mural_status_update on mural_status_usuario for update
  using (usuario_id = auth.uid());

grant select, insert on mural_mensagens to authenticated;
grant select, insert, update on mural_status_usuario to authenticated;
