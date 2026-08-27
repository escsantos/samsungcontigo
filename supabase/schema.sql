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
  cargo text not null check (cargo in ('Administrador','Diretor','Gerente','Vendedor','Estoque','Financeiro','Cliente')),
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
    'Em Estoque - Aguardando Faturamento','Faturamento Efetuado','Liberado para Retirada/Entrega',
    'Cancelado'
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
  valor numeric(12,2) not null check (valor <> 0),
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

-- 12. Pagamento na revisão do vendedor + marca "sem pagamento"
alter table orcamentos add column if not exists sem_pagamento boolean default false;

alter table notificacoes drop constraint if exists notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('esqueci_senha', 'pedido_pendente_pronto', 'pedido_sem_pagamento'));

create policy "vendedor avisa pedido sem pagamento"
  on notificacoes for insert
  with check (tipo = 'pedido_sem_pagamento' and pode_gerenciar_clientes());

-- 13. Ajustes de permissão: Vendedor gerencia pagamento, tela de Pagamentos vê qualquer pedido
drop policy if exists "criar pagamentos" on pagamentos_orcamento;
create policy "criar pagamentos"
  on pagamentos_orcamento for insert
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and (pode_gerenciar_clientes() or pode_gerenciar_estoque())));

create policy "editar pagamentos"
  on pagamentos_orcamento for update
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (pode_gerenciar_clientes() or pode_gerenciar_estoque())));

drop policy if exists "excluir pagamentos" on pagamentos_orcamento;
create policy "excluir pagamentos"
  on pagamentos_orcamento for delete
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (pode_gerenciar_clientes() or pode_gerenciar_estoque())));

drop policy if exists "ver orcamentos" on orcamentos;
create policy "ver orcamentos"
  on orcamentos for select
  using (cliente_id = meu_cliente_id() or vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque());

drop policy if exists "ver itens de orcamento" on orcamento_itens;
create policy "ver itens de orcamento"
  on orcamento_itens for select
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (o.cliente_id = meu_cliente_id() or o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())));

drop policy if exists "ver pagamentos" on pagamentos_orcamento;
create policy "ver pagamentos"
  on pagamentos_orcamento for select
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and (o.cliente_id = meu_cliente_id() or o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())));

-- Busca pontual por número exato pra tela de Pagamentos — não abre listagem geral
create or replace function buscar_orcamento_pagamento(pid bigint)
returns setof orcamentos
language sql security definer set search_path = public stable as $$
  select * from orcamentos where id = pid and (pode_gerenciar_clientes() or pode_gerenciar_estoque());
$$;

create or replace function buscar_itens_pagamento(pid bigint)
returns setof orcamento_itens
language sql security definer set search_path = public stable as $$
  select oi.* from orcamento_itens oi
  where oi.orcamento_id = pid
  and exists (select 1 from orcamentos o where o.id = pid and (pode_gerenciar_clientes() or pode_gerenciar_estoque()));
$$;

create or replace function buscar_pagamentos_pagamento(pid bigint)
returns setof pagamentos_orcamento
language sql security definer set search_path = public stable as $$
  select po.* from pagamentos_orcamento po
  where po.orcamento_id = pid
  and exists (select 1 from orcamentos o where o.id = pid and (pode_gerenciar_clientes() or pode_gerenciar_estoque()))
  order by po.registrado_em;
$$;

-- 14. Módulo Financeiro
create or replace function eh_financeiro()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Financeiro'));
$$;

alter table orcamentos add column if not exists recebimento_confirmado boolean default false;
alter table orcamentos add column if not exists recebimento_confirmado_por uuid references perfis(id);
alter table orcamentos add column if not exists recebimento_confirmado_em timestamptz;

create policy "financeiro confirma recebimento"
  on orcamentos for update
  using (eh_financeiro())
  with check (eh_financeiro());

alter table orcamento_itens add column if not exists custo_pago_fabricante boolean default false;
alter table orcamento_itens add column if not exists custo_pago_fabricante_por uuid references perfis(id);
alter table orcamento_itens add column if not exists custo_pago_fabricante_em timestamptz;

create policy "financeiro confirma pagamento fabricante"
  on orcamento_itens for update
  using (eh_financeiro())
  with check (eh_financeiro());

create policy "financeiro le orcamentos"
  on orcamentos for select
  using (eh_financeiro());

create policy "financeiro le itens"
  on orcamento_itens for select
  using (eh_financeiro());

create policy "financeiro le pagamentos"
  on pagamentos_orcamento for select
  using (eh_financeiro());

create policy "financeiro le clientes"
  on clientes for select
  using (eh_financeiro());

-- 15. Pagamento herdado do pedido pai (liberação parcial)
alter table orcamentos add column if not exists valor_herdado_pai numeric(12,2) default 0;

-- 16. Multi-unidade — Fase 1: cadastro de unidades e vínculo com usuários
create table if not exists unidades (
  id bigint generated always as identity primary key,
  nome text not null,
  asc_cod text not null unique check (asc_cod ~ '^[0-9]{7}$'),
  proximo_numero_pedido integer not null default 1,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);

create table if not exists perfis_unidades (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references perfis(id) on delete cascade,
  unidade_id bigint not null references unidades(id) on delete cascade,
  criado_em timestamptz default now(),
  unique (perfil_id, unidade_id)
);

alter table unidades enable row level security;
alter table perfis_unidades enable row level security;

create policy "ve unidades vinculadas ou gestor"
  on unidades for select
  using (pode_gerenciar_usuarios() or exists (select 1 from perfis_unidades pu where pu.unidade_id = unidades.id and pu.perfil_id = auth.uid()));

create policy "admin gerencia unidades"
  on unidades for all
  using (is_administrador())
  with check (is_administrador());

create policy "ve proprios vinculos ou gestor"
  on perfis_unidades for select
  using (perfil_id = auth.uid() or pode_gerenciar_usuarios());

create policy "gestor gerencia vinculos"
  on perfis_unidades for all
  using (pode_gerenciar_usuarios())
  with check (pode_gerenciar_usuarios());
-- ================================================================
-- MULTI-UNIDADE — FASE 3: Catálogo compartilhado + preço por unidade
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- 1. Renomeia "pecas" -> "pecas_catalogo" (preserva todos os ids e a
--    referência que orcamento_itens.peca_id já tem pra essa tabela)
alter table pecas rename to pecas_catalogo;

-- 2. Nova tabela de preços — isolada por unidade
create table if not exists pecas_precos (
  id bigint generated always as identity primary key,
  unidade_id bigint not null references unidades(id),
  codigo text not null,
  valor_unitario numeric(12,2),
  data_referencia text,
  atualizado_em timestamptz default now(),
  unique (unidade_id, codigo)
);
create index if not exists idx_pecas_precos_codigo on pecas_precos (codigo);
create index if not exists idx_pecas_precos_unidade on pecas_precos (unidade_id);

-- 3. Migra os preços que já existem hoje pra ESC Santos
insert into pecas_precos (unidade_id, codigo, valor_unitario, data_referencia, atualizado_em)
select distinct on (pc.codigo)
  (select id from unidades where asc_cod = '3197760'),
  pc.codigo, pc.valor_unitario, pc.data_referencia, pc.atualizado_em
from pecas_catalogo pc
where pc.valor_unitario is not null
order by pc.codigo, pc.atualizado_em desc nulls last
on conflict (unidade_id, codigo) do nothing;

-- 4. Remove as colunas de preço do catálogo (agora vivem em pecas_precos)
alter table pecas_catalogo drop column if exists valor_unitario;
alter table pecas_catalogo drop column if exists data_referencia;

-- 5. lotes_pecas ganha unidade_id (delivery/lote é sempre de uma unidade específica)
alter table lotes_pecas add column if not exists unidade_id bigint references unidades(id);
update lotes_pecas set unidade_id = (select id from unidades where asc_cod = '3197760') where unidade_id is null;
alter table lotes_pecas alter column unidade_id set not null;
alter table lotes_pecas drop constraint if exists lotes_pecas_codigo_no_entrega_key;
alter table lotes_pecas add constraint lotes_pecas_unidade_codigo_entrega_key unique (unidade_id, codigo, no_entrega);

-- 6. pecas_processamentos ganha unidade_id (rastreia quem subiu o quê, de qual unidade)
alter table pecas_processamentos add column if not exists unidade_id bigint references unidades(id);
update pecas_processamentos set unidade_id = (select id from unidades where asc_cod = '3197760') where unidade_id is null;

-- 7. RLS de pecas_precos — só vê/gerencia preço de unidade que tem vínculo
alter table pecas_precos enable row level security;

create policy "ve precos da propria unidade"
  on pecas_precos for select
  using (exists (select 1 from perfis_unidades pu where pu.unidade_id = pecas_precos.unidade_id and pu.perfil_id = auth.uid()));

create policy "admin grava precos da propria unidade"
  on pecas_precos for insert
  with check (is_administrador() and exists (select 1 from perfis_unidades pu where pu.unidade_id = pecas_precos.unidade_id and pu.perfil_id = auth.uid()));

create policy "admin atualiza precos da propria unidade"
  on pecas_precos for update
  using (is_administrador() and exists (select 1 from perfis_unidades pu where pu.unidade_id = pecas_precos.unidade_id and pu.perfil_id = auth.uid()))
  with check (is_administrador() and exists (select 1 from perfis_unidades pu where pu.unidade_id = pecas_precos.unidade_id and pu.perfil_id = auth.uid()));

-- 8. RLS de lotes_pecas — mesma regra, agora por unidade
drop policy if exists "estoque le lotes" on lotes_pecas;
create policy "estoque le lotes"
  on lotes_pecas for select
  using (pode_gerenciar_estoque() and exists (select 1 from perfis_unidades pu where pu.unidade_id = lotes_pecas.unidade_id and pu.perfil_id = auth.uid()));

drop policy if exists "administrador gerencia lotes" on lotes_pecas;
create policy "administrador gerencia lotes"
  on lotes_pecas for all
  using (is_administrador() and exists (select 1 from perfis_unidades pu where pu.unidade_id = lotes_pecas.unidade_id and pu.perfil_id = auth.uid()))
  with check (is_administrador() and exists (select 1 from perfis_unidades pu where pu.unidade_id = lotes_pecas.unidade_id and pu.perfil_id = auth.uid()));

-- 9. Função que junta catálogo (compartilhado) + preço (da unidade pedida)
--    substitui a antiga consulta direta em "pecas" nas telas do sistema
create or replace function buscar_pecas(p_unidade_id bigint)
returns table (
  id bigint,
  modelo text,
  categoria text,
  codigo text,
  descricao_resumida text,
  descricao_peca text,
  valor_unitario numeric,
  data_referencia text
)
language sql stable as $$
  select c.id, c.modelo, c.categoria, c.codigo, c.descricao_resumida, c.descricao_peca,
         p.valor_unitario, p.data_referencia
  from pecas_catalogo c
  left join pecas_precos p on p.codigo = c.codigo and p.unidade_id = p_unidade_id;
$$;
-- 17. Multi-unidade — Fase 3 (ver fase3_catalogo_precos.sql, já incluído acima)
-- ================================================================
-- MULTI-UNIDADE — FASE 4: Isolar dados operacionais por unidade
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- 1. orcamentos ganha unidade_id (tudo que já existe hoje vira ESC Santos)
alter table orcamentos add column if not exists unidade_id bigint references unidades(id);
update orcamentos set unidade_id = (select id from unidades where asc_cod = '3197760') where unidade_id is null;
alter table orcamentos alter column unidade_id set not null;

-- 2. Ver orçamentos: cliente sempre vê os seus (compartilhado entre unidades);
--    equipe só vê se tiver vínculo com a unidade DAQUELE pedido específico
drop policy if exists "ver orcamentos" on orcamentos;
create policy "ver orcamentos"
  on orcamentos for select
  using (
    cliente_id = meu_cliente_id()
    or (
      exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid())
      and (vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())
    )
  );

drop policy if exists "financeiro le orcamentos" on orcamentos;
create policy "financeiro le orcamentos"
  on orcamentos for select
  using (eh_financeiro() and exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid()));

-- 3. Criar orçamento: precisa ter vínculo com a unidade que está sendo gravada
drop policy if exists "criar orcamentos" on orcamentos;
create policy "criar orcamentos"
  on orcamentos for insert
  with check (
    criado_por = auth.uid()
    and exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid())
    and (cliente_id = meu_cliente_id() or pode_gerenciar_clientes() or pode_gerenciar_estoque())
  );

-- 4. Revisar/editar orçamento (Aprovar/Rejeitar/Ajustar/avançar status): mesma regra de vínculo
drop policy if exists "revisar orcamentos" on orcamentos;
create policy "revisar orcamentos"
  on orcamentos for update
  using (
    exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid())
    and (vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())
  );

drop policy if exists "financeiro confirma recebimento" on orcamentos;
create policy "financeiro confirma recebimento"
  on orcamentos for update
  using (eh_financeiro() and exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid()))
  with check (eh_financeiro() and exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid()));

-- 5. Itens do orçamento: herdam a regra do pedido
drop policy if exists "ver itens de orcamento" on orcamento_itens;
create policy "ver itens de orcamento"
  on orcamento_itens for select
  using (
    exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and (
        o.cliente_id = meu_cliente_id()
        or (
          exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
          and (o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())
        )
      )
    )
  );

drop policy if exists "financeiro le itens" on orcamento_itens;
create policy "financeiro le itens"
  on orcamento_itens for select
  using (
    eh_financeiro() and exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
    )
  );

drop policy if exists "financeiro confirma pagamento fabricante" on orcamento_itens;
create policy "financeiro confirma pagamento fabricante"
  on orcamento_itens for update
  using (
    eh_financeiro() and exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
    )
  )
  with check (
    eh_financeiro() and exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
    )
  );

drop policy if exists "criar itens de orcamento" on orcamento_itens;
create policy "criar itens de orcamento"
  on orcamento_itens for insert
  with check (
    exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
      and (o.criado_por = auth.uid() or o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())
    )
  );

-- 6. Pagamentos: mesma regra de vínculo por unidade
drop policy if exists "ver pagamentos" on pagamentos_orcamento;
create policy "ver pagamentos"
  on pagamentos_orcamento for select
  using (
    exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and (
        o.cliente_id = meu_cliente_id()
        or (
          exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
          and (o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())
        )
      )
    )
  );

drop policy if exists "financeiro le pagamentos" on pagamentos_orcamento;
create policy "financeiro le pagamentos"
  on pagamentos_orcamento for select
  using (
    eh_financeiro() and exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
    )
  );

drop policy if exists "criar pagamentos" on pagamentos_orcamento;
create policy "criar pagamentos"
  on pagamentos_orcamento for insert
  with check (
    exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
      and (pode_gerenciar_clientes() or pode_gerenciar_estoque())
    )
  );

drop policy if exists "editar pagamentos" on pagamentos_orcamento;
create policy "editar pagamentos"
  on pagamentos_orcamento for update
  using (
    exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
      and (pode_gerenciar_clientes() or pode_gerenciar_estoque())
    )
  );

drop policy if exists "excluir pagamentos" on pagamentos_orcamento;
create policy "excluir pagamentos"
  on pagamentos_orcamento for delete
  using (
    exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
      and (pode_gerenciar_clientes() or pode_gerenciar_estoque())
    )
  );

-- 7. Função de busca pontual da tela Pagamentos — agora também confere a unidade
drop function if exists buscar_orcamento_pagamento(bigint);
create or replace function buscar_orcamento_pagamento(pid bigint)
returns setof orcamentos
language sql security definer set search_path = public stable as $$
  select o.* from orcamentos o
  where o.id = pid
  and (pode_gerenciar_clientes() or pode_gerenciar_estoque())
  and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid());
$$;

drop function if exists buscar_itens_pagamento(bigint);
create or replace function buscar_itens_pagamento(pid bigint)
returns setof orcamento_itens
language sql security definer set search_path = public stable as $$
  select oi.* from orcamento_itens oi
  where oi.orcamento_id = pid
  and exists (
    select 1 from orcamentos o where o.id = pid
    and (pode_gerenciar_clientes() or pode_gerenciar_estoque())
    and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
  );
$$;

drop function if exists buscar_pagamentos_pagamento(bigint);
create or replace function buscar_pagamentos_pagamento(pid bigint)
returns setof pagamentos_orcamento
language sql security definer set search_path = public stable as $$
  select po.* from pagamentos_orcamento po
  where po.orcamento_id = pid
  and exists (
    select 1 from orcamentos o where o.id = pid
    and (pode_gerenciar_clientes() or pode_gerenciar_estoque())
    and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
  )
  order by po.registrado_em;
$$;
-- ================================================================
-- MULTI-UNIDADE — FASE 4b: Numeração própria de pedido por unidade
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- 1. Coluna do número exibido (por unidade)
alter table orcamentos add column if not exists numero_unidade integer;

-- 2. Pedidos que já existem hoje (todos ESC Santos) mantêm o número que já tinham,
--    preservando a numeração que você já está acostumado a ver
update orcamentos set numero_unidade = id where numero_unidade is null;
alter table orcamentos alter column numero_unidade set not null;

-- 3. O contador de cada unidade continua de onde os pedidos existentes pararam
update unidades u
set proximo_numero_pedido = coalesce((select max(o.numero_unidade) + 1 from orcamentos o where o.unidade_id = u.id), 1);

-- 4. Função que reserva o próximo número de forma atômica (evita dois pedidos com o mesmo número)
create or replace function proximo_numero_pedido(p_unidade_id bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  numero integer;
begin
  if not exists (select 1 from perfis_unidades pu where pu.unidade_id = p_unidade_id and pu.perfil_id = auth.uid()) then
    raise exception 'Sem acesso a essa unidade';
  end if;
  update unidades set proximo_numero_pedido = proximo_numero_pedido + 1
  where id = p_unidade_id
  returning proximo_numero_pedido - 1 into numero;
  return numero;
end;
$$;

-- 5. Índice pra busca rápida por número dentro da unidade
create unique index if not exists idx_orcamentos_unidade_numero on orcamentos (unidade_id, numero_unidade);

-- 6. Busca da tela Pagamentos agora é por número da unidade + a unidade ativa (não mais pelo id interno)
drop function if exists buscar_orcamento_pagamento(bigint);
create or replace function buscar_orcamento_pagamento(p_numero integer, p_unidade_id bigint)
returns setof orcamentos
language sql security definer set search_path = public stable as $$
  select o.* from orcamentos o
  where o.numero_unidade = p_numero
  and o.unidade_id = p_unidade_id
  and (pode_gerenciar_clientes() or pode_gerenciar_estoque())
  and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid());
$$;
-- ================================================================
-- CORREÇÃO — Clientes visíveis conforme a unidade do vendedor vinculado
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

drop policy if exists "gestores de clientes leem" on clientes;
create policy "gestores de clientes leem"
  on clientes for select
  using (
    pode_gerenciar_clientes()
    and (
      vendedor_id is null
      or vendedor_id = auth.uid()
      or exists (
        select 1 from perfis_unidades pu1
        join perfis_unidades pu2 on pu1.unidade_id = pu2.unidade_id
        where pu1.perfil_id = clientes.vendedor_id and pu2.perfil_id = auth.uid()
      )
    )
  );

drop policy if exists "gestores de clientes gerenciam" on clientes;
create policy "gestores de clientes gerenciam"
  on clientes for all
  using (
    pode_gerenciar_clientes()
    and (
      vendedor_id is null
      or vendedor_id = auth.uid()
      or exists (
        select 1 from perfis_unidades pu1
        join perfis_unidades pu2 on pu1.unidade_id = pu2.unidade_id
        where pu1.perfil_id = clientes.vendedor_id and pu2.perfil_id = auth.uid()
      )
    )
  )
  with check (
    pode_gerenciar_clientes()
    and (
      vendedor_id is null
      or vendedor_id = auth.uid()
      or exists (
        select 1 from perfis_unidades pu1
        join perfis_unidades pu2 on pu1.unidade_id = pu2.unidade_id
        where pu1.perfil_id = clientes.vendedor_id and pu2.perfil_id = auth.uid()
      )
    )
  );
-- ================================================================
-- MANUTENÇÃO DO BANCO — logs de auditoria + permissão de exclusão
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- Log de toda ação de manutenção (auditoria — quem fez, quando, o quê)
create table if not exists manutencao_logs (
  id bigint generated always as identity primary key,
  acao text not null,
  unidade_id bigint references unidades(id),
  executado_por uuid references perfis(id),
  detalhes jsonb,
  executado_em timestamptz default now()
);

alter table manutencao_logs enable row level security;

create policy "admin ve logs de manutencao"
  on manutencao_logs for select
  using (is_administrador());

create policy "admin cria logs de manutencao"
  on manutencao_logs for insert
  with check (is_administrador());

-- Exclusão de orçamentos: só Administrador, só da(s) unidade(s) que tem vínculo.
-- orcamento_itens e pagamentos_orcamento já têm "on delete cascade" configurado,
-- então excluir aqui já limpa tudo que depende do pedido automaticamente.
drop policy if exists "admin exclui orcamentos" on orcamentos;
create policy "admin exclui orcamentos"
  on orcamentos for delete
  using (
    is_administrador()
    and exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid())
  );
-- ================================================================
-- CORREÇÃO — Origem do preço na Consulta de Peças (fallback entre unidades)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

drop function if exists buscar_pecas(bigint);
create or replace function buscar_pecas(p_unidade_id bigint)
returns table (
  id bigint,
  modelo text,
  categoria text,
  codigo text,
  descricao_resumida text,
  descricao_peca text,
  valor_unitario numeric,
  data_referencia text,
  unidade_origem_id bigint,
  unidade_origem_nome text
)
language sql stable as $$
  select
    c.id, c.modelo, c.categoria, c.codigo, c.descricao_resumida, c.descricao_peca,
    coalesce(p_local.valor_unitario, p_fallback.valor_unitario) as valor_unitario,
    coalesce(p_local.data_referencia, p_fallback.data_referencia) as data_referencia,
    coalesce(p_local.unidade_id, p_fallback.unidade_id) as unidade_origem_id,
    coalesce(u_local.nome, u_fallback.nome) as unidade_origem_nome
  from pecas_catalogo c
  left join pecas_precos p_local
    on p_local.codigo = c.codigo and p_local.unidade_id = p_unidade_id and p_local.valor_unitario is not null
  left join unidades u_local on u_local.id = p_local.unidade_id
  left join lateral (
    select pp.unidade_id, pp.valor_unitario, pp.data_referencia
    from pecas_precos pp
    where pp.codigo = c.codigo and pp.unidade_id <> p_unidade_id and pp.valor_unitario is not null
    order by pp.atualizado_em desc
    limit 1
  ) p_fallback on p_local.valor_unitario is null
  left join unidades u_fallback on u_fallback.id = p_fallback.unidade_id;
$$;
-- ================================================================
-- CORREÇÃO — Atribuição de preço/lote pela coluna T (unidade real da compra)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- 1. pecas_precos: guarda sempre o código bruto da coluna T (asc_cod_origem).
--    unidade_id fica opcional — só é preenchido quando o código bate com uma
--    unidade já cadastrada no sistema.
alter table pecas_precos add column if not exists asc_cod_origem text;
update pecas_precos set asc_cod_origem = (select u.asc_cod from unidades u where u.id = pecas_precos.unidade_id) where asc_cod_origem is null;
alter table pecas_precos alter column unidade_id drop not null;
alter table pecas_precos drop constraint if exists pecas_precos_unidade_id_codigo_key;
alter table pecas_precos add constraint pecas_precos_asccod_codigo_key unique (asc_cod_origem, codigo);

-- 2. lotes_pecas: mesmo tratamento
alter table lotes_pecas add column if not exists asc_cod_origem text;
update lotes_pecas set asc_cod_origem = (select u.asc_cod from unidades u where u.id = lotes_pecas.unidade_id) where asc_cod_origem is null;
alter table lotes_pecas alter column unidade_id drop not null;
alter table lotes_pecas drop constraint if exists lotes_pecas_unidade_codigo_entrega_key;
alter table lotes_pecas add constraint lotes_pecas_asccod_codigo_entrega_key unique (asc_cod_origem, codigo, no_entrega);

-- 3. RLS — permite ver/gravar registros de unidade ainda não cadastrada (informativo)
drop policy if exists "ve precos da propria unidade" on pecas_precos;
create policy "ve precos da propria unidade"
  on pecas_precos for select
  using (
    unidade_id is null
    or exists (select 1 from perfis_unidades pu where pu.unidade_id = pecas_precos.unidade_id and pu.perfil_id = auth.uid())
  );

drop policy if exists "admin grava precos da propria unidade" on pecas_precos;
create policy "admin grava precos da propria unidade"
  on pecas_precos for insert
  with check (is_administrador());

drop policy if exists "admin atualiza precos da propria unidade" on pecas_precos;
create policy "admin atualiza precos da propria unidade"
  on pecas_precos for update
  using (is_administrador())
  with check (is_administrador());

drop policy if exists "estoque le lotes" on lotes_pecas;
create policy "estoque le lotes"
  on lotes_pecas for select
  using (
    pode_gerenciar_estoque()
    and (
      unidade_id is null
      or exists (select 1 from perfis_unidades pu where pu.unidade_id = lotes_pecas.unidade_id and pu.perfil_id = auth.uid())
    )
  );

drop policy if exists "administrador gerencia lotes" on lotes_pecas;
create policy "administrador gerencia lotes"
  on lotes_pecas for all
  using (is_administrador())
  with check (is_administrador());

-- 4. buscar_pecas: casa "preço local" pelo ASC COD da unidade ativa (não mais unidade_id
--    de sessão), com fallback pra outra unidade quando não achar, trazendo o código bruto
--    também pra exibir mesmo quando a unidade de origem ainda não está cadastrada.
drop function if exists buscar_pecas(bigint);
create or replace function buscar_pecas(p_unidade_id bigint)
returns table (
  id bigint,
  modelo text,
  categoria text,
  codigo text,
  descricao_resumida text,
  descricao_peca text,
  valor_unitario numeric,
  data_referencia text,
  unidade_origem_id bigint,
  unidade_origem_nome text,
  asc_cod_origem text
)
language sql stable as $$
  with unidade_atual as (select asc_cod from unidades where id = p_unidade_id)
  select
    c.id, c.modelo, c.categoria, c.codigo, c.descricao_resumida, c.descricao_peca,
    coalesce(p_local.valor_unitario, p_fallback.valor_unitario) as valor_unitario,
    coalesce(p_local.data_referencia, p_fallback.data_referencia) as data_referencia,
    coalesce(p_local.unidade_id, p_fallback.unidade_id) as unidade_origem_id,
    coalesce(u_local.nome, u_fallback.nome) as unidade_origem_nome,
    coalesce(p_local.asc_cod_origem, p_fallback.asc_cod_origem) as asc_cod_origem
  from pecas_catalogo c
  left join pecas_precos p_local
    on p_local.codigo = c.codigo
    and p_local.asc_cod_origem = (select asc_cod from unidade_atual)
    and p_local.valor_unitario is not null
  left join unidades u_local on u_local.id = p_local.unidade_id
  left join lateral (
    select pp.unidade_id, pp.valor_unitario, pp.data_referencia, pp.asc_cod_origem
    from pecas_precos pp
    where pp.codigo = c.codigo
      and pp.asc_cod_origem is distinct from (select asc_cod from unidade_atual)
      and pp.valor_unitario is not null
    order by pp.atualizado_em desc
    limit 1
  ) p_fallback on p_local.valor_unitario is null
  left join unidades u_fallback on u_fallback.id = p_fallback.unidade_id;
$$;
-- ================================================================
-- MANUTENÇÃO — permissão pra limpar catálogo/preços/lotes de peças
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

drop policy if exists "admin exclui precos" on pecas_precos;
create policy "admin exclui precos"
  on pecas_precos for delete
  using (is_administrador());

drop policy if exists "admin exclui processamentos" on pecas_processamentos;
create policy "admin exclui processamentos"
  on pecas_processamentos for delete
  using (is_administrador());
-- ================================================================
-- IMPOSTOS POR UNIDADE
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

alter table impostos add column if not exists unidade_id bigint references unidades(id);
update impostos set unidade_id = (select id from unidades where asc_cod = '3197760') where unidade_id is null;
alter table impostos alter column unidade_id set not null;

drop policy if exists "usuarios logados leem impostos" on impostos;
create policy "ve impostos da propria unidade"
  on impostos for select
  using (exists (select 1 from perfis_unidades pu where pu.unidade_id = impostos.unidade_id and pu.perfil_id = auth.uid()));

drop policy if exists "administrador gerencia impostos" on impostos;
create policy "admin gerencia impostos da propria unidade"
  on impostos for all
  using (is_administrador() and exists (select 1 from perfis_unidades pu where pu.unidade_id = impostos.unidade_id and pu.perfil_id = auth.uid()))
  with check (is_administrador() and exists (select 1 from perfis_unidades pu where pu.unidade_id = impostos.unidade_id and pu.perfil_id = auth.uid()));
-- ================================================================
-- ITEM 4 — trava no banco: nenhum pagamento pode ultrapassar o valor do pedido
-- ================================================================
create or replace function validar_limite_pagamento()
returns trigger
language plpgsql as $$
declare
  valor_pedido numeric;
  herdado numeric;
  total_outros numeric;
begin
  select valor_total, coalesce(valor_herdado_pai, 0) into valor_pedido, herdado
  from orcamentos where id = new.orcamento_id;

  select coalesce(sum(valor), 0) into total_outros
  from pagamentos_orcamento
  where orcamento_id = new.orcamento_id and id <> coalesce(new.id, -1);

  if new.valor > 0 and (total_outros + herdado + new.valor) > (valor_pedido + 0.01) then
    raise exception 'O total de pagamentos (R$ %) não pode ultrapassar o valor do pedido (R$ %).',
      round(total_outros + herdado + new.valor, 2), valor_pedido;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_limite_pagamento on pagamentos_orcamento;
create trigger trg_validar_limite_pagamento
before insert or update on pagamentos_orcamento
for each row execute function validar_limite_pagamento();

-- ================================================================
-- ITEM 5 — Cancelamento / desistência de pedido, com estorno pro Financeiro
-- ================================================================

alter table orcamentos add column if not exists motivo_cancelamento text;
alter table orcamentos add column if not exists cancelado_por uuid references perfis(id);
alter table orcamentos add column if not exists cancelado_em timestamptz;

-- Estorno lança um pagamento NEGATIVO em pagamentos_orcamento (ver concluir_estorno abaixo),
-- então a constraint de valor precisa aceitar valores negativos, só não zero.
alter table pagamentos_orcamento drop constraint if exists pagamentos_orcamento_valor_check;
alter table pagamentos_orcamento add constraint pagamentos_orcamento_valor_check check (valor <> 0);

create table if not exists estornos (
  id bigint generated always as identity primary key,
  orcamento_id bigint not null references orcamentos(id),
  unidade_id bigint references unidades(id),
  valor numeric(12,2) not null,
  motivo text,
  status text not null default 'Pendente' check (status in ('Pendente', 'Concluído')),
  solicitado_por uuid references perfis(id),
  solicitado_em timestamptz default now(),
  processado_por uuid references perfis(id),
  processado_em timestamptz,
  observacao text
);

alter table estornos enable row level security;

create policy "ve estornos da propria unidade"
  on estornos for select
  using (
    eh_financeiro()
    or pode_gerenciar_clientes()
    or pode_gerenciar_estoque()
  );

create policy "cria estorno ao cancelar pedido"
  on estornos for insert
  with check (
    solicitado_por = auth.uid()
    and exists (
      select 1 from orcamentos o
      where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
      and (o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque())
    )
  );

-- Financeiro conclui o estorno através dessa função — atualiza o pedido de estorno e
-- lança um pagamento negativo (baixa) no pedido, refletindo automaticamente em todos
-- os relatórios que já somam pagamentos_orcamento.
create or replace function concluir_estorno(p_estorno_id bigint, p_observacao text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_estorno record;
begin
  if not eh_financeiro() then
    raise exception 'Sem permissão pra concluir estornos.';
  end if;

  select * into v_estorno from estornos where id = p_estorno_id and status = 'Pendente';
  if not found then
    raise exception 'Estorno não encontrado ou já processado.';
  end if;

  update estornos
  set status = 'Concluído', processado_por = auth.uid(), processado_em = now(), observacao = p_observacao
  where id = p_estorno_id;

  insert into pagamentos_orcamento (orcamento_id, forma_pagamento, valor, data_pagamento, registrado_por)
  values (v_estorno.orcamento_id, 'Estorno (baixa financeira)', -v_estorno.valor, current_date, auth.uid());
end;
$$;
-- ================================================================
-- AUDITORIA — log de login/logout, alterações de usuário e movimentações
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

create table if not exists auditoria_logs (
  id bigint generated always as identity primary key,
  tipo_evento text not null,   -- login, logout, criacao, edicao, exclusao, status, bloqueio, desbloqueio, senha, pagamento
  entidade text not null,      -- perfis, orcamentos, clientes, pagamentos_orcamento, estoque, financeiro, base
  entidade_id text,
  usuario_id uuid references perfis(id),
  unidade_id bigint references unidades(id),
  descricao text not null,
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz default now()
);

create index if not exists idx_auditoria_criado_em on auditoria_logs (criado_em desc);
create index if not exists idx_auditoria_usuario on auditoria_logs (usuario_id);
create index if not exists idx_auditoria_unidade on auditoria_logs (unidade_id);
create index if not exists idx_auditoria_entidade on auditoria_logs (entidade);
create index if not exists idx_auditoria_tipo on auditoria_logs (tipo_evento);

alter table auditoria_logs enable row level security;

-- qualquer usuário autenticado registra o próprio evento (login/logout precisam
-- funcionar mesmo antes do perfil terminar de carregar)
create policy "usuario registra proprio log"
  on auditoria_logs for insert
  with check (usuario_id = auth.uid() or usuario_id is null);

-- Administrador vê tudo; Diretor/Gerente veem eventos gerais (sem unidade) +
-- eventos das unidades onde têm vínculo
create policy "gestor le auditoria"
  on auditoria_logs for select
  using (
    is_administrador()
    or (
      pode_gerenciar_usuarios()
      and (
        auditoria_logs.unidade_id is null
        or exists (select 1 from perfis_unidades pu where pu.unidade_id = auditoria_logs.unidade_id and pu.perfil_id = auth.uid())
      )
    )
  );
-- ================================================================
-- MÓDULO FISCAL — Nota Fiscal por pedido + obrigatoriedade por unidade
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- 1. Unidade: se ela é obrigada a emitir Nota Fiscal de venda.
--    Default true (obrigatória) — o cadastro de unidade pede essa resposta
--    explicitamente na hora de criar/editar.
alter table unidades add column if not exists obriga_nota_fiscal boolean not null default true;

-- 2. Pedido: dado da Nota Fiscal emitida, ou marcação de "emitir depois".
--    A emissão é liberada a partir do status "Faturamento Efetuado" (não
--    bloqueia nenhuma etapa — é só registro/controle).
alter table orcamentos add column if not exists nota_fiscal_numero text;
alter table orcamentos add column if not exists nota_fiscal_emitida_por uuid references perfis(id);
alter table orcamentos add column if not exists nota_fiscal_emitida_em timestamptz;
alter table orcamentos add column if not exists nota_fiscal_emitir_depois boolean not null default false;
alter table orcamentos add column if not exists nota_fiscal_marcada_depois_por uuid references perfis(id);
alter table orcamentos add column if not exists nota_fiscal_marcada_depois_em timestamptz;
alter table orcamentos add column if not exists nota_fiscal_observacao text;

-- 3. Quem pode gerenciar a Nota Fiscal do pedido (tela de Estoque e o novo
--    menu Fiscal): Administrador, Diretor, Gerente, Estoque e Financeiro.
--    A policy "revisar orcamentos" já existente não inclui Financeiro, então
--    criamos uma policy de update dedicada (mesmo padrão usado em "financeiro
--    confirma recebimento").
create or replace function pode_gerenciar_fiscal()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Estoque','Financeiro'));
$$;

drop policy if exists "gerencia nota fiscal do pedido" on orcamentos;
create policy "gerencia nota fiscal do pedido"
  on orcamentos for update
  using (pode_gerenciar_fiscal() and exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid()))
  with check (pode_gerenciar_fiscal() and exists (select 1 from perfis_unidades pu where pu.unidade_id = orcamentos.unidade_id and pu.perfil_id = auth.uid()));

-- 4. Índice pra acelerar o dashboard Fiscal (pedidos liberados sem NF, por unidade).
create index if not exists idx_orcamentos_nf_pendente on orcamentos (unidade_id, status) where nota_fiscal_numero is null;

-- 5. Evita registrar o mesmo número de NF duas vezes na mesma unidade
--    (cada unidade tem sua própria numeração fiscal).
create unique index if not exists idx_orcamentos_nf_numero_unico on orcamentos (unidade_id, nota_fiscal_numero) where nota_fiscal_numero is not null;

-- ================================================================
-- CARREGAR BASES — data da solicitação da Base GSPN (coluna Q)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- Guarda a data de solicitação mais recente encontrada na Base GSPN de cada
-- processamento — identifica até quando aquele arquivo veio atualizado.
alter table pecas_processamentos add column if not exists gspn_data_solicitacao_max text;

-- ================================================================
-- MÓDULO RELATÓRIOS — Resumo (margem/comissão por pedido entregue)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- Percentual de comissão de cada vendedor sobre o valor pago do pedido.
-- Fica em branco (null) até alguém cadastrar — o relatório trata null como 0%.
alter table perfis add column if not exists comissao_percentual numeric(5,2);

-- ================================================================
-- CARGO SUPERVISOR — mesmas permissões de Gerente, por enquanto
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

alter table perfis drop constraint if exists perfis_cargo_check;
alter table perfis add constraint perfis_cargo_check
  check (cargo in ('Administrador','Diretor','Gerente','Supervisor','Vendedor','Estoque','Financeiro','Cliente'));

create or replace function pode_gerenciar_usuarios()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from perfis
    where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Supervisor')
  );
$$;

create or replace function pode_gerenciar_clientes()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from perfis
    where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Supervisor','Vendedor')
  );
$$;

create or replace function pode_ver_todos_orcamentos()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Supervisor'));
$$;

create or replace function pode_gerenciar_estoque()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Supervisor','Estoque'));
$$;

create or replace function pode_gerenciar_fiscal()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Supervisor','Estoque','Financeiro'));
$$;

-- ================================================================
-- MÓDULO ESTOQUE — liberar pedido pro faturamento sem pagamento total
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ================================================================

-- Quem liberou, quando e por quê. sem_pagamento (já existente) continua
-- marcando o pedido como pendência de pagamento nas telas que já usam esse
-- selo (Orçamentos, Estoque, Financeiro).
alter table orcamentos add column if not exists liberado_sem_pagamento_por uuid references perfis(id);
alter table orcamentos add column if not exists liberado_sem_pagamento_em timestamptz;
alter table orcamentos add column if not exists liberado_sem_pagamento_motivo text;

-- ================================================================
-- FINANCEIRO — registrar pagamento direto pelo Contas a Receber
-- O Financeiro já podia ver pedidos/pagamentos; agora também pode
-- registrar/editar pagamento e subir comprovante, pra quitar a pendência
-- sem precisar de outro cargo.
-- ================================================================

drop policy if exists "financeiro registra pagamento" on pagamentos_orcamento;
create policy "financeiro registra pagamento"
  on pagamentos_orcamento for insert
  with check (
    eh_financeiro() and exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
    )
  );

drop policy if exists "financeiro edita pagamento" on pagamentos_orcamento;
create policy "financeiro edita pagamento"
  on pagamentos_orcamento for update
  using (
    eh_financeiro() and exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
    )
  )
  with check (
    eh_financeiro() and exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
    )
  );

drop policy if exists "financeiro exclui pagamento" on pagamentos_orcamento;
create policy "financeiro exclui pagamento"
  on pagamentos_orcamento for delete
  using (
    eh_financeiro() and exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
    )
  );

drop policy if exists "financeiro le comprovantes" on storage.objects;
create policy "financeiro le comprovantes"
  on storage.objects for select
  using (bucket_id = 'comprovantes' and eh_financeiro());

drop policy if exists "financeiro sobe comprovantes" on storage.objects;
create policy "financeiro sobe comprovantes"
  on storage.objects for insert
  with check (bucket_id = 'comprovantes' and eh_financeiro());
