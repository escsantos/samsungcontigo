-- ============================================================
-- Fase 3 — Solicitações de "esqueci minha senha"
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create table if not exists solicitacoes_senha (
  id uuid primary key default gen_random_uuid(),
  login text not null,
  usuario_id uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atendida boolean not null default false,
  atendida_por uuid references usuarios(id),
  atendida_em timestamptz
);

-- ao inserir, tenta já vincular ao usuário existente pelo login
create or replace function preencher_usuario_solicitacao()
returns trigger as $$
begin
  select id into new.usuario_id from usuarios where login = new.login limit 1;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_preencher_usuario_solicitacao on solicitacoes_senha;
create trigger trg_preencher_usuario_solicitacao
before insert on solicitacoes_senha
for each row execute function preencher_usuario_solicitacao();

alter table solicitacoes_senha enable row level security;

-- qualquer pessoa (mesmo sem login, direto da tela de login) pode criar um pedido
create policy solicitacoes_senha_insert on solicitacoes_senha for insert
  with check (true);

-- só vê quem tem permissão sobre a unidade do usuário que pediu
create policy solicitacoes_senha_select on solicitacoes_senha for select
  using (
    meu_cargo() in ('administrador', 'diretor')
    or usuario_id in (
      select uu.usuario_id from usuario_unidades uu
      where uu.unidade_id in (select minhas_unidades())
    )
  );

create policy solicitacoes_senha_update on solicitacoes_senha for update
  using (
    meu_cargo() in ('administrador', 'diretor')
    or usuario_id in (
      select uu.usuario_id from usuario_unidades uu
      where uu.unidade_id in (select minhas_unidades())
    )
  );
