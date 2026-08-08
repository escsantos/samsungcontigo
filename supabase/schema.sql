-- ============================================================
-- SISTEMA CONSULTA DE PEÇAS — GRUPO J.MACEDO
-- Schema inicial: perfis de usuário + tabela de peças processadas
-- Rode este arquivo inteiro no SQL Editor do Supabase (New query)
-- ============================================================

-- 1. Perfis de usuário (espelha auth.users, guarda nome/cargo)
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  login text unique not null,
  nome text not null,
  cargo text not null check (cargo in ('Administrador','Diretor','Supervisao','Gerencia','Vendedor')),
  cor_accent text default '#4A90D9',
  criado_em timestamptz default now()
);

alter table perfis enable row level security;

create policy "usuario le seu proprio perfil"
  on perfis for select
  using (auth.uid() = id);

-- Função auxiliar (SECURITY DEFINER) para checar cargo sem disparar
-- recursão infinita nas políticas de RLS da própria tabela perfis.
create or replace function is_admin_ou_diretor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from perfis
    where id = auth.uid() and cargo in ('Administrador','Diretor')
  );
$$;

create policy "admin/diretor leem todos os perfis"
  on perfis for select
  using (is_admin_ou_diretor());

-- 2. Tabela de peças (resultado do cruzamento Base Peças x Base GSPN)
create table if not exists pecas (
  id bigint generated always as identity primary key,
  modelo text not null,
  categoria text not null,
  codigo text not null,
  descricao_resumida text,
  descricao_peca text,
  valor_unitario numeric(12,2),
  atualizado_em timestamptz default now(),
  unique (modelo, codigo)
);

create index if not exists idx_pecas_codigo on pecas (codigo);
create index if not exists idx_pecas_modelo on pecas (modelo);
create index if not exists idx_pecas_categoria on pecas (categoria);
create index if not exists idx_pecas_busca on pecas
  using gin (to_tsvector('simple', coalesce(modelo,'') || ' ' || coalesce(codigo,'') || ' ' || coalesce(descricao_resumida,'') || ' ' || coalesce(descricao_peca,'')));

alter table pecas enable row level security;

-- qualquer usuário autenticado pode consultar
create policy "usuarios logados consultam pecas"
  on pecas for select
  using (auth.role() = 'authenticated');

-- só Administrador/Diretor podem inserir/alterar/excluir (recarregar bases)
create policy "admin/diretor gerenciam pecas"
  on pecas for all
  using (is_admin_ou_diretor())
  with check (is_admin_ou_diretor());

-- 3. Log de processamento de bases (auditoria de cada upload)
create table if not exists pecas_processamentos (
  id bigint generated always as identity primary key,
  usuario_id uuid references perfis(id),
  arquivo_pecas text,
  arquivo_gspn text,
  total_registros int,
  duplicados_removidos int,
  nao_classificados int,
  sem_custo int,
  processado_em timestamptz default now()
);

alter table pecas_processamentos enable row level security;

create policy "usuarios logados leem log de processamento"
  on pecas_processamentos for select
  using (auth.role() = 'authenticated');

create policy "admin/diretor inserem log de processamento"
  on pecas_processamentos for insert
  with check (is_admin_ou_diretor());
