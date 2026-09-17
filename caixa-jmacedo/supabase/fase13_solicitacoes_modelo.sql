-- ============================================================
-- Fase 13 — Busca de modelo com autocomplete + fila de
-- solicitação de novo modelo (quem não pode cadastrar modelo,
-- como o Operacional, pode pedir; quem administra aprova).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create table if not exists solicitacoes_modelo (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categorias(id),
  nome text not null,
  unidade_id uuid references unidades(id),
  solicitado_por uuid references usuarios(id),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  criado_em timestamptz not null default now(),
  resolvido_por uuid references usuarios(id),
  resolvido_em timestamptz
);

alter table solicitacoes_modelo enable row level security;

-- qualquer pessoa logada pode pedir a inclusão de um modelo
create policy solicitacoes_modelo_insert on solicitacoes_modelo for insert
  with check (true);

-- quem administra modelos vê tudo; o próprio solicitante vê o status do que pediu
create policy solicitacoes_modelo_select on solicitacoes_modelo for select
  using (
    meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor')
    or solicitado_por = auth.uid()
  );

-- só quem administra modelos aprova/rejeita
create policy solicitacoes_modelo_update on solicitacoes_modelo for update
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));

grant select on solicitacoes_modelo to authenticated;
