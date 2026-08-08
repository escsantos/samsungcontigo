-- ============================================================
-- SISTEMA CONSULTA DE PEÇAS — GRUPO J.MACEDO
-- Schema completo: perfis de usuário, controle de acesso e
-- tabela de peças processadas.
-- Rode este arquivo inteiro no SQL Editor do Supabase (New query)
-- ============================================================

-- 1. Perfis de usuário (espelha auth.users, guarda nome/cargo)
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  login text unique not null,
  nome text not null,
  cargo text not null check (cargo in ('Administrador','Diretor','Gerente','Vendedor','Estoque','Cliente')),
  cor_accent text default '#4A90D9',
  bloqueado boolean default false,
  visto_em timestamptz,
  email text,
  telefone text,
  foto_url text,
  criado_em timestamptz default now()
);

alter table perfis enable row level security;

-- Funções de permissão (SECURITY DEFINER, evita recursão de RLS)
create or replace function is_administrador()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo = 'Administrador');
$$;

create or replace function pode_gerenciar_usuarios()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from perfis
    where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente')
  );
$$;

create policy "usuario le seu proprio perfil"
  on perfis for select
  using (auth.uid() = id);

create policy "gerentes leem todos os perfis"
  on perfis for select
  using (pode_gerenciar_usuarios());

create policy "gerentes atualizam perfis"
  on perfis for update
  using (pode_gerenciar_usuarios())
  with check (pode_gerenciar_usuarios());

create policy "gerentes excluem perfis"
  on perfis for delete
  using (pode_gerenciar_usuarios());

create policy "usuario atualiza seu proprio perfil"
  on perfis for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Trava: usuário comum não pode alterar o próprio cargo/bloqueio
-- (só quem já é gestor pode mudar cargo/bloqueio de qualquer um)
create or replace function bloquear_autopromocao()
returns trigger language plpgsql security definer as $$
begin
  if not pode_gerenciar_usuarios() then
    if new.cargo is distinct from old.cargo then
      raise exception 'Você não tem permissão para alterar seu próprio cargo.';
    end if;
    if new.bloqueado is distinct from old.bloqueado then
      raise exception 'Você não tem permissão para alterar seu próprio bloqueio.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_bloquear_autopromocao
  before update on perfis
  for each row execute function bloquear_autopromocao();

-- Bucket de avatares (público para leitura, cada usuário só mexe na própria foto)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars leitura publica"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "usuario sobe sua propria foto"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuario atualiza sua propria foto"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuario remove sua propria foto"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

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

-- só Administrador pode inserir/alterar/excluir (recarregar bases)
create policy "administrador gerencia pecas"
  on pecas for all
  using (is_administrador())
  with check (is_administrador());

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

create policy "administrador insere log de processamento"
  on pecas_processamentos for insert
  with check (is_administrador());
