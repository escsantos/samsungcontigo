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
  senha_temporaria boolean default true,
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

-- 3. Notificações
create table if not exists notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('esqueci_senha')),
  usuario_login text,
  mensagem text not null,
  lida boolean default false,
  criado_em timestamptz default now()
);

alter table notificacoes enable row level security;

create policy "gestores leem notificacoes"
  on notificacoes for select
  using (pode_gerenciar_usuarios());

create policy "gestores atualizam notificacoes"
  on notificacoes for update
  using (pode_gerenciar_usuarios())
  with check (pode_gerenciar_usuarios());

create policy "qualquer um solicita esqueci senha"
  on notificacoes for insert
  with check (tipo = 'esqueci_senha');

-- 4. Função de presença online (expõe só nome/foto, nada sensível)
create or replace function usuarios_online()
returns table(id uuid, nome text, foto_url text)
language sql security definer set search_path = public stable as $$
  select id, nome, foto_url from perfis
  where visto_em > now() - interval '2 minutes'
    and coalesce(bloqueado, false) = false
  order by nome;
$$;

-- 2. Tabela de peças (resultado do cruzamento Base Peças x Base GSPN)
create table if not exists pecas (
  id bigint generated always as identity primary key,
  modelo text not null,
  categoria text not null,
  codigo text not null,
  descricao_resumida text,
  descricao_peca text,
  valor_unitario numeric(12,2),
  data_referencia text,
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

-- 4. Impostos (usados no cálculo Custo / Imposto / Lucro Líquido / Venda Sugerida)
create table if not exists impostos (
  id bigint generated always as identity primary key,
  nome text not null,
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 100),
  ativo boolean default true,
  criado_em timestamptz default now()
);

alter table impostos enable row level security;

create policy "usuarios logados leem impostos"
  on impostos for select
  using (auth.role() = 'authenticated');

create policy "administrador gerencia impostos"
  on impostos for all
  using (is_administrador())
  with check (is_administrador());

insert into impostos (nome, percentual, ativo) values ('ICMS Peças', 8.45, true);

-- 5. Clientes
create table if not exists clientes (
  id bigint generated always as identity primary key,
  tipo_pessoa text not null check (tipo_pessoa in ('fisica','juridica')),
  nome text not null,
  nome_fantasia text,
  cpf text,
  rg text,
  data_nascimento date,
  cnpj text,
  inscricao_estadual text,
  ie_isento boolean default false,
  inscricao_municipal text,
  contato_responsavel text,
  email text,
  email_secundario text,
  telefone_fixo text,
  celular text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  referencia text,
  vendedor_id uuid references perfis(id) on delete set null,
  categoria text check (categoria in ('Revenda','Assistência Técnica','Consumidor Final','Atacado')),
  condicao_pagamento text,
  status text not null default 'Ativo' check (status in ('Ativo','Inativo','Bloqueado')),
  observacoes text,
  origem text,
  criado_por uuid references perfis(id) on delete set null,
  criado_em timestamptz default now()
);

create unique index if not exists idx_clientes_cpf on clientes (cpf) where cpf is not null and cpf <> '';
create unique index if not exists idx_clientes_cnpj on clientes (cnpj) where cnpj is not null and cnpj <> '';
create index if not exists idx_clientes_busca on clientes
  using gin (to_tsvector('simple', coalesce(nome,'') || ' ' || coalesce(nome_fantasia,'') || ' ' || coalesce(cpf,'') || ' ' || coalesce(cnpj,'')));

alter table clientes enable row level security;

create or replace function pode_gerenciar_clientes()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from perfis
    where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Vendedor')
  );
$$;

create policy "gestores de clientes leem"
  on clientes for select
  using (pode_gerenciar_clientes());

create policy "gestores de clientes gerenciam"
  on clientes for all
  using (pode_gerenciar_clientes())
  with check (pode_gerenciar_clientes());

-- 6. Vínculo login <-> cadastro de cliente, e módulo de Orçamentos
alter table perfis add column if not exists cliente_id bigint references clientes(id) on delete set null;

create or replace function meu_cliente_id()
returns bigint language sql security definer set search_path = public stable as $$
  select cliente_id from perfis where id = auth.uid();
$$;

create or replace function pode_ver_todos_orcamentos()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente'));
$$;

create or replace function pode_gerenciar_estoque()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Estoque'));
$$;

create table if not exists orcamentos (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references clientes(id),
  vendedor_id uuid references perfis(id),
  criado_por uuid references perfis(id),
  status text not null default 'Pendente' check (status in ('Pendente','Aprovado','Rejeitado')),
  motivo_rejeicao text,
  valor_total numeric(12,2),
  margem numeric(5,2),
  imposto_total numeric(5,2),
  revisado_por uuid references perfis(id),
  revisado_em timestamptz,
  criado_em timestamptz default now()
);

alter table orcamentos enable row level security;

create policy "ver orcamentos"
  on orcamentos for select
  using (cliente_id = meu_cliente_id() or vendedor_id = auth.uid() or pode_ver_todos_orcamentos());

create policy "criar orcamentos"
  on orcamentos for insert
  with check (criado_por = auth.uid() and (cliente_id = meu_cliente_id() or pode_gerenciar_clientes() or pode_gerenciar_estoque()));

create policy "revisar orcamentos"
  on orcamentos for update
  using (vendedor_id = auth.uid() or pode_ver_todos_orcamentos())
  with check (vendedor_id = auth.uid() or pode_ver_todos_orcamentos());

create table if not exists orcamento_itens (
  id bigint generated always as identity primary key,
  orcamento_id bigint not null references orcamentos(id) on delete cascade,
  peca_id bigint references pecas(id) on delete set null,
  modelo text,
  categoria text,
  codigo text,
  descricao_resumida text,
  descricao_peca text,
  qtd integer not null default 1,
  custo_unitario numeric(12,2),
  venda_unitario numeric(12,2),
  venda_total numeric(12,2)
);

alter table orcamento_itens enable row level security;

create policy "ver itens de orcamento"
  on orcamento_itens for select
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (o.cliente_id = meu_cliente_id() or o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos())));

create policy "criar itens de orcamento"
  on orcamento_itens for insert
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and o.criado_por = auth.uid()));

create policy "editar itens de orcamento"
  on orcamento_itens for update
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos())));

create policy "excluir itens de orcamento"
  on orcamento_itens for delete
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos())));

-- 7. Estoque: lotes de compra por Delivery (custo exato) e fluxo de status
create table if not exists lotes_pecas (
  id bigint generated always as identity primary key,
  codigo text not null,
  no_entrega text not null,
  valor_unitario numeric(12,2),
  qtd numeric(12,2),
  data_nf text,
  criado_em timestamptz default now(),
  unique (codigo, no_entrega)
);

create index if not exists idx_lotes_codigo on lotes_pecas (codigo);

alter table lotes_pecas enable row level security;

create policy "estoque le lotes"
  on lotes_pecas for select
  using (pode_gerenciar_estoque());

create policy "administrador gerencia lotes"
  on lotes_pecas for all
  using (is_administrador())
  with check (is_administrador());

alter table orcamentos drop constraint if exists orcamentos_status_check;
alter table orcamentos add constraint orcamentos_status_check
  check (status in (
    'Pendente de Análise','Validado pelo Vendedor','Rejeitado',
    'Aguardando Separação/Compra','Peças Compradas - Aguardando Chegada',
    'Em Estoque - Aguardando Faturamento','Faturamento Efetuado','Liberado para Retirada/Entrega'
  ));
alter table orcamentos alter column status set default 'Pendente de Análise';

drop policy if exists "revisar orcamentos" on orcamentos;
create policy "revisar orcamentos"
  on orcamentos for update
  using (vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())
  with check (vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque());

alter table orcamento_itens add column if not exists no_entrega text;
alter table orcamento_itens add column if not exists custo_real numeric(12,2);
alter table orcamento_itens add column if not exists liberado boolean default false;
alter table orcamento_itens add column if not exists liberado_por uuid references perfis(id);
alter table orcamento_itens add column if not exists liberado_em timestamptz;

drop policy if exists "editar itens de orcamento" on orcamento_itens;
create policy "editar itens de orcamento"
  on orcamento_itens for update
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())));

-- 8. Fluxo operacional completo (compra, faturamento, separação, entrega)
alter table orcamentos add column if not exists numero_pedido_compra text;
alter table orcamentos add column if not exists no_entrega text;
alter table orcamentos add column if not exists valor_pago numeric(12,2);
alter table orcamentos add column if not exists data_pagamento date;
alter table orcamentos add column if not exists anexo_pagamento_url text;
alter table orcamentos add column if not exists pagamento_validado_por uuid references perfis(id);
alter table orcamentos add column if not exists pagamento_validado_em timestamptz;
alter table orcamentos add column if not exists separado_por uuid references perfis(id);
alter table orcamentos add column if not exists separado_em timestamptz;
alter table orcamentos add column if not exists entregue boolean default false;
alter table orcamentos add column if not exists entregue_por uuid references perfis(id);
alter table orcamentos add column if not exists entregue_em timestamptz;

insert into storage.buckets (id, name, public) values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

create policy "estoque le comprovantes"
  on storage.objects for select
  using (bucket_id = 'comprovantes' and pode_gerenciar_estoque());

create policy "estoque sobe comprovantes"
  on storage.objects for insert
  with check (bucket_id = 'comprovantes' and pode_gerenciar_estoque());

drop policy if exists "criar itens de orcamento" on orcamento_itens;
create policy "criar itens de orcamento"
  on orcamento_itens for insert
  with check (
    exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and (o.criado_por = auth.uid() or o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())
    )
  );

-- 9. Pagamentos do faturamento (múltiplas formas, pagamento parcial)
create table if not exists pagamentos_orcamento (
  id bigint generated always as identity primary key,
  orcamento_id bigint not null references orcamentos(id) on delete cascade,
  forma_pagamento text not null,
  valor numeric(12,2) not null check (valor > 0),
  data_pagamento date not null,
  anexo_url text,
  registrado_por uuid references perfis(id),
  registrado_em timestamptz default now()
);

alter table pagamentos_orcamento enable row level security;

create policy "ver pagamentos"
  on pagamentos_orcamento for select
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (o.cliente_id = meu_cliente_id() or o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())));

create policy "criar pagamentos"
  on pagamentos_orcamento for insert
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and pode_gerenciar_estoque()));

create policy "excluir pagamentos"
  on pagamentos_orcamento for delete
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and pode_gerenciar_estoque()));

-- 10. Liberação parcial (pedido "filho" pra peça pendente)
alter table orcamentos add column if not exists pedido_pai_id bigint references orcamentos(id);
alter table orcamentos add column if not exists parcial boolean default false;

alter table notificacoes drop constraint if exists notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('esqueci_senha', 'pedido_pendente_pronto'));

create policy "estoque cria notificacao de pendencia"
  on notificacoes for insert
  with check (tipo = 'pedido_pendente_pronto' and pode_gerenciar_estoque());

-- 11. Desconto no orçamento
alter table orcamentos add column if not exists desconto numeric(12,2) default 0;
