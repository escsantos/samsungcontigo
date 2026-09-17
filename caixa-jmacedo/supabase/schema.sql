-- ============================================================
-- CAIXA — Grupo J.Macedo
-- Schema Supabase (Postgres) — rode este arquivo inteiro no
-- SQL Editor do seu projeto Supabase (Database > SQL Editor)
-- ============================================================

-- extensão usada para gerar ids
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ENUM de cargos
-- ------------------------------------------------------------
create type cargo_tipo as enum ('operacional', 'supervisao', 'gerencia', 'administrador', 'diretor');

-- ------------------------------------------------------------
-- UNIDADES
-- ------------------------------------------------------------
create table unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  codigo text not null unique,          -- código curto usado como prefixo sugerido da OS
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ------------------------------------------------------------
-- USUÁRIOS (perfil ligado ao auth.users do Supabase)
-- ------------------------------------------------------------
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome_completo text not null,
  login text not null unique,           -- padrão nome.sobrenome
  cargo cargo_tipo not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- vínculo usuário <-> unidade (um usuário pode acessar várias lojas)
create table usuario_unidades (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  unidade_id uuid not null references unidades(id) on delete cascade,
  primary key (usuario_id, unidade_id)
);

-- ------------------------------------------------------------
-- CATEGORIAS e MODELOS
-- ------------------------------------------------------------
create table categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique          -- Celular, TV, Tablet, Relógio, Notebook, Robô...
);

create table modelos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categorias(id),
  nome text not null,
  unique (categoria_id, nome)
);

-- ------------------------------------------------------------
-- TIPOS DE SERVIÇO
-- ------------------------------------------------------------
create table tipos_servico (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categorias(id),
  nome text not null unique          -- ex: "Celular - reparo tela"
);

-- ------------------------------------------------------------
-- METAS (mensal, por unidade)
-- ------------------------------------------------------------
create table metas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id),
  mes_referencia date not null,      -- sempre dia 1 do mês, ex 2026-07-01
  valor_meta numeric(12,2) not null,
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, mes_referencia)
);

-- ------------------------------------------------------------
-- LANÇAMENTOS (a "Base")
-- ------------------------------------------------------------
create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id),
  data date not null default current_date,
  numero_os text not null check (char_length(numero_os) <= 10),
  categoria_id uuid references categorias(id),
  modelo_id uuid references modelos(id),
  tipo_servico_id uuid not null references tipos_servico(id),
  orcamento_aprovado numeric(12,2) not null,
  valor_pago numeric(12,2) not null check (valor_pago >= 0),
  forma_pagamento text not null check (forma_pagamento in
    ('PIX','DÉBITO','CRÉDITO','DINHEIRO','BOLETO','LINK DE PAGAMENTO')),
  parcelas int check (parcelas between 1 and 10),
  bandeira text,
  atendente_id uuid not null references usuarios(id),
  criado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now(),
  alterado_por uuid references usuarios(id),
  alterado_em timestamptz
);

create index idx_lancamentos_unidade_data on lancamentos (unidade_id, data);
create index idx_lancamentos_os on lancamentos (unidade_id, numero_os);

-- ------------------------------------------------------------
-- TRIGGER: impede pagar mais do que o orçamento aprovado da OS
-- (mesma unidade + mesmo número de OS = mesma ordem de serviço)
-- ------------------------------------------------------------
create or replace function checar_saldo_os()
returns trigger as $$
declare
  ja_pago numeric(12,2);
  orcamento numeric(12,2);
begin
  select coalesce(sum(valor_pago), 0) into ja_pago
  from lancamentos
  where unidade_id = new.unidade_id
    and numero_os = new.numero_os
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000');

  -- orçamento da OS é o do primeiro lançamento já existente, se houver
  select orcamento_aprovado into orcamento
  from lancamentos
  where unidade_id = new.unidade_id and numero_os = new.numero_os
  order by criado_em asc
  limit 1;

  if orcamento is not null and orcamento <> new.orcamento_aprovado then
    new.orcamento_aprovado := orcamento; -- trava o orçamento no valor original da OS
  end if;

  if (ja_pago + new.valor_pago) > new.orcamento_aprovado then
    raise exception 'VALOR_EXCEDE_ORCAMENTO: saldo restante é %', (new.orcamento_aprovado - ja_pago);
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_checar_saldo_os
before insert or update on lancamentos
for each row execute function checar_saldo_os();

-- ============================================================
-- VIEWS de consolidação (usadas pelos dashboards e pelo painel)
-- ============================================================

-- Falta pagar por OS (para "contas a receber") — já traz os dados
-- do último lançamento da OS, usados para quitar o saldo pela tela.
create view vw_contas_a_receber as
select
  c.unidade_id,
  c.numero_os,
  c.orcamento_aprovado,
  c.total_pago,
  c.orcamento_aprovado - c.total_pago as falta_pagar,
  c.ultimo_lancamento,
  u.tipo_servico_id,
  u.categoria_id,
  u.modelo_id
from (
  select
    unidade_id,
    numero_os,
    max(orcamento_aprovado) as orcamento_aprovado,
    sum(valor_pago) as total_pago,
    max(data) as ultimo_lancamento
  from lancamentos
  group by unidade_id, numero_os
) c
join lateral (
  select tipo_servico_id, categoria_id, modelo_id
  from lancamentos l
  where l.unidade_id = c.unidade_id and l.numero_os = c.numero_os
  order by l.criado_em desc
  limit 1
) u on true
where c.orcamento_aprovado - c.total_pago > 0;

-- Ranking diário
create view vw_ranking_dia as
select unidade_id, sum(valor_pago) as total_pago, current_date as periodo
from lancamentos
where data = current_date
group by unidade_id;

-- Ranking semanal (semana corrida, segunda a domingo)
create view vw_ranking_semana as
select unidade_id, sum(valor_pago) as total_pago,
  date_trunc('week', current_date)::date as inicio_semana
from lancamentos
where data >= date_trunc('week', current_date)::date
group by unidade_id;

-- Ranking mensal
create view vw_ranking_mes as
select unidade_id, sum(valor_pago) as total_pago,
  date_trunc('month', current_date)::date as mes_referencia
from lancamentos
where data >= date_trunc('month', current_date)::date
group by unidade_id;

-- View pública e enxuta para o painel de TV (sem dados sensíveis)
create view vw_painel_tv as
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(d.total_pago, 0) as total_dia,
  coalesce(s.total_pago, 0) as total_semana,
  coalesce(m.total_pago, 0) as total_mes,
  coalesce(mt.valor_meta, 0) as meta_mes
from unidades u
left join vw_ranking_dia d on d.unidade_id = u.id
left join vw_ranking_semana s on s.unidade_id = u.id
left join vw_ranking_mes m on m.unidade_id = u.id
left join metas mt on mt.unidade_id = u.id
  and mt.mes_referencia = date_trunc('month', current_date)::date
where u.ativo = true;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table unidades enable row level security;
alter table usuarios enable row level security;
alter table usuario_unidades enable row level security;
alter table categorias enable row level security;
alter table modelos enable row level security;
alter table tipos_servico enable row level security;
alter table metas enable row level security;
alter table lancamentos enable row level security;

-- helper: cargo do usuário logado
create or replace function meu_cargo() returns cargo_tipo as $$
  select cargo from usuarios where id = auth.uid();
$$ language sql stable;

-- helper: unidades que o usuário logado pode acessar
create or replace function minhas_unidades() returns setof uuid as $$
  select unidade_id from usuario_unidades where usuario_id = auth.uid();
$$ language sql stable;

-- LANÇAMENTOS -------------------------------------------------
create policy lancamentos_select on lancamentos for select
  using (
    meu_cargo() in ('administrador','diretor')
    or unidade_id in (select minhas_unidades())
  );

create policy lancamentos_insert on lancamentos for insert
  with check (
    meu_cargo() in ('administrador','diretor')
    or unidade_id in (select minhas_unidades())
  );

create policy lancamentos_update on lancamentos for update
  using (
    meu_cargo() in ('administrador','diretor','gerencia','supervisao')
    and (meu_cargo() in ('administrador','diretor') or unidade_id in (select minhas_unidades()))
  );

create policy lancamentos_delete on lancamentos for delete
  using (
    meu_cargo() in ('administrador','diretor','gerencia')
    and (meu_cargo() in ('administrador','diretor') or unidade_id in (select minhas_unidades()))
  );

-- CADASTROS (tipos de serviço, categorias, modelos) ------------
create policy cadastro_select_geral on categorias for select using (true);
create policy cadastro_select_geral2 on modelos for select using (true);
create policy cadastro_select_geral3 on tipos_servico for select using (true);

create policy cadastro_insert on categorias for insert
  with check (meu_cargo() in ('supervisao','gerencia','administrador','diretor'));
create policy cadastro_insert2 on modelos for insert
  with check (meu_cargo() in ('supervisao','gerencia','administrador','diretor'));
create policy cadastro_insert3 on tipos_servico for insert
  with check (meu_cargo() in ('supervisao','gerencia','administrador','diretor'));

-- METAS ---------------------------------------------------------
create policy metas_select on metas for select using (true);
create policy metas_upsert on metas for insert
  with check (meu_cargo() in ('gerencia','administrador','diretor') and unidade_id in (select minhas_unidades()) or meu_cargo() in ('administrador','diretor'));
create policy metas_update on metas for update
  using (meu_cargo() in ('gerencia','administrador','diretor'));

-- UNIDADES / USUÁRIOS (só administrador/diretor cadastram) ------
create policy unidades_select on unidades for select using (true);
create policy unidades_write on unidades for insert with check (meu_cargo() in ('administrador','diretor'));
create policy unidades_update on unidades for update using (meu_cargo() in ('administrador','diretor'));

create policy usuarios_select on usuarios for select using (true);
create policy usuarios_write on usuarios for insert with check (meu_cargo() in ('administrador','diretor'));
create policy usuarios_update on usuarios for update using (meu_cargo() in ('administrador','diretor') or id = auth.uid());

create policy usuario_unidades_select on usuario_unidades for select using (true);
create policy usuario_unidades_write on usuario_unidades for insert with check (meu_cargo() in ('administrador','diretor'));

-- PAINEL DE TV: leitura pública e anônima, só da view resumida --
grant select on vw_painel_tv to anon;
-- ============================================================
-- Fase 2 — Log de auditoria + view de vendas de acessórios
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create table if not exists log_auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid,
  acao text not null check (acao in ('insert', 'update', 'delete')),
  unidade_id uuid references unidades(id),
  usuario_id uuid references usuarios(id),
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_log_auditoria_unidade on log_auditoria (unidade_id, criado_em desc);

alter table log_auditoria enable row level security;

create policy log_select on log_auditoria for select
  using (
    meu_cargo() in ('administrador', 'diretor')
    or (unidade_id is not null and unidade_id in (select minhas_unidades()))
  );

-- função genérica de log — registra quem alterou (auth.uid()) e o que mudou
create or replace function registrar_log_auditoria()
returns trigger as $$
declare
  uid_unidade uuid;
begin
  uid_unidade := coalesce(
    (case when TG_OP = 'DELETE' then old.unidade_id else new.unidade_id end),
    null
  );

  insert into log_auditoria (tabela, registro_id, acao, unidade_id, usuario_id, dados_antes, dados_depois)
  values (
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id else new.id end,
    lower(TG_OP),
    uid_unidade,
    auth.uid(),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- lançamentos: log de alteração e exclusão (inclusão já é o próprio lançamento)
drop trigger if exists trg_log_lancamentos on lancamentos;
create trigger trg_log_lancamentos
after update or delete on lancamentos
for each row execute function registrar_log_auditoria();

-- metas: log de toda alteração
drop trigger if exists trg_log_metas on metas;
create trigger trg_log_metas
after insert or update on metas
for each row execute function registrar_log_auditoria();

-- tipos de serviço: log de alteração (edição feita pela tela de Configurações)
drop trigger if exists trg_log_tipos_servico on tipos_servico;
create trigger trg_log_tipos_servico
after update on tipos_servico
for each row execute function registrar_log_auditoria();

-- ============================================================
-- View de vendas de acessórios do mês, por atendente + unidade
-- (usada na 4ª tela do painel de TV — prêmio de 5%)
-- ============================================================
create or replace view vw_painel_acessorios as
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(sum(l.valor_pago), 0) as total_vendido,
  coalesce(sum(l.valor_pago), 0) * 0.05 as premio
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join lancamentos l on l.atendente_id = us.id
  and l.unidade_id = un.id
  and l.categoria_id = (select id from categorias where nome = 'Acessório')
  and l.data >= date_trunc('month', current_date)::date
where us.ativo = true
group by us.id, us.nome_completo, un.id, un.nome
having coalesce(sum(l.valor_pago), 0) > 0;

grant select on vw_painel_acessorios to anon;
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
-- ============================================================
-- Fase 4 — Views para os Dashboards visíveis a todos os usuários
-- (o ranking mostra todas as unidades; o detalhe (drill-down)
-- continua protegido pela tela — só abre para quem tem acesso
-- àquela unidade específica, verificado no código do app).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- Dashboard "Valores": totais do mês por unidade, para todas as unidades
create or replace view vw_dashboard_valores as
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(sum(l.orcamento_aprovado), 0) as orcamento_aprovado,
  coalesce(sum(l.valor_pago), 0) as valor_pago,
  count(distinct l.numero_os) as qtd_os
from unidades u
left join lancamentos l on l.unidade_id = u.id
  and l.data >= date_trunc('month', current_date)::date
where u.ativo = true
group by u.id, u.nome;

grant select on vw_dashboard_valores to authenticated;

-- Dashboard "Vendedores": vendas de acessórios do mês, por atendente + unidade,
-- em todas as unidades (mesma lógica do painel de TV, mas com orçamento/qtd também)
create or replace view vw_dashboard_vendedores as
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(sum(l.orcamento_aprovado), 0) as orcamento_aprovado,
  coalesce(sum(l.valor_pago), 0) as valor_pago,
  count(distinct l.numero_os) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join lancamentos l on l.atendente_id = us.id
  and l.unidade_id = un.id
  and l.categoria_id = (select id from categorias where nome = 'Acessório')
  and l.data >= date_trunc('month', current_date)::date
where us.ativo = true
group by us.id, us.nome_completo, un.id, un.nome;

grant select on vw_dashboard_vendedores to authenticated;

-- garante que o painel de TV (usado sem login) também continua acessível
grant select on vw_painel_tv to authenticated;
grant select on vw_painel_acessorios to authenticated;
-- ============================================================
-- Fase 5 — Dashboard "Orçamentos (OW)": todas as vendas do mês,
-- por unidade, EXCETO acessórios. Mesmo padrão do Dashboard
-- Valores (visível a todos; o detalhe fica protegido na tela).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace view vw_dashboard_ow as
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(sum(l.orcamento_aprovado), 0) as orcamento_aprovado,
  coalesce(sum(l.valor_pago), 0) as valor_pago,
  count(distinct l.numero_os) as qtd_os
from unidades u
left join lancamentos l on l.unidade_id = u.id
  and l.data >= date_trunc('month', current_date)::date
  and (l.categoria_id is null or l.categoria_id <> (select id from categorias where nome = 'Acessório'))
where u.ativo = true
group by u.id, u.nome;

grant select on vw_dashboard_ow to authenticated;
-- ============================================================
-- Fase 6 — Dashboard Vendedores: separar em Orçamentos x Acessórios
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace view vw_dashboard_vendedores_ow as
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(sum(l.orcamento_aprovado), 0) as orcamento_aprovado,
  coalesce(sum(l.valor_pago), 0) as valor_pago,
  count(distinct l.numero_os) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join lancamentos l on l.atendente_id = us.id
  and l.unidade_id = un.id
  and l.data >= date_trunc('month', current_date)::date
  and (l.categoria_id is null or l.categoria_id <> (select id from categorias where nome = 'Acessório'))
where us.ativo = true
group by us.id, us.nome_completo, un.id, un.nome;

grant select on vw_dashboard_vendedores_ow to authenticated;
-- ============================================================
-- Fase 7 — Corrige permissão: faltava liberar ALTERAR e EXCLUIR
-- em categorias, modelos e tipos de serviço (só a criação estava
-- liberada no banco; por isso os botões pareciam não funcionar).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create policy cadastro_update_categorias on categorias for update
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));
create policy cadastro_delete_categorias on categorias for delete
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));

create policy cadastro_update_modelos on modelos for update
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));
create policy cadastro_delete_modelos on modelos for delete
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));

create policy cadastro_update_tipos_servico on tipos_servico for update
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));
create policy cadastro_delete_tipos_servico on tipos_servico for delete
  using (meu_cargo() in ('supervisao', 'gerencia', 'administrador', 'diretor'));
-- ============================================================
-- Fase 8 — Corrige o cálculo de semana no painel de TV para
-- domingo→sábado (o Postgres calcula semana ISO, que começa na
-- segunda-feira, por padrão — por isso a aba "Semana" do painel
-- não estava batendo com o padrão domingo-sábado usado no resto
-- do sistema).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace view vw_ranking_semana as
select
  unidade_id,
  sum(valor_pago) as total_pago,
  (current_date - (extract(dow from current_date))::int) as inicio_semana
from lancamentos
where data >= (current_date - (extract(dow from current_date))::int)
group by unidade_id;
-- ============================================================
-- Fase 9 — Manutenção do banco de dados (Configurações > Admin)
-- Libera a exclusão em massa (só para Administrador/Diretor) nas
-- tabelas de metas, log de auditoria e solicitações de senha —
-- lançamentos já podia ser excluído por esses cargos.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create policy metas_delete on metas for delete
  using (meu_cargo() in ('administrador', 'diretor'));

create policy log_delete on log_auditoria for delete
  using (meu_cargo() in ('administrador', 'diretor'));

create policy solicitacoes_senha_delete on solicitacoes_senha for delete
  using (meu_cargo() in ('administrador', 'diretor'));
-- ============================================================
-- Fase 10 — Novo cargo "ADM": acesso operacional a todas as
-- unidades, sem acesso a Configurações.
-- Rode no SQL Editor do seu projeto Supabase.
--
-- Se der erro de "unsafe use of new value" ao rodar tudo de uma
-- vez, rode só a primeira linha (ALTER TYPE) sozinha, clique em
-- Run, depois cole e rode o resto do arquivo separadamente.
-- ============================================================

alter type cargo_tipo add value if not exists 'adm';

-- ------------------------------------------------------------
-- Lançamentos: ADM enxerga e corrige tudo, de qualquer unidade,
-- igual Administrador/Diretor.
-- ------------------------------------------------------------
drop policy if exists lancamentos_select on lancamentos;
create policy lancamentos_select on lancamentos for select
  using (
    meu_cargo() in ('administrador', 'diretor', 'adm')
    or unidade_id in (select minhas_unidades())
  );

drop policy if exists lancamentos_update on lancamentos;
create policy lancamentos_update on lancamentos for update
  using (
    meu_cargo() in ('administrador', 'diretor', 'adm', 'gerencia', 'supervisao')
    and (meu_cargo() in ('administrador', 'diretor', 'adm') or unidade_id in (select minhas_unidades()))
  );

drop policy if exists lancamentos_delete on lancamentos;
create policy lancamentos_delete on lancamentos for delete
  using (
    meu_cargo() in ('administrador', 'diretor', 'adm', 'gerencia')
    and (meu_cargo() in ('administrador', 'diretor', 'adm') or unidade_id in (select minhas_unidades()))
  );
-- ============================================================
-- Fase 11 — Corrige um erro de cálculo: quando uma OS tinha mais
-- de um lançamento (ex: pagamento parcial + complemento), o
-- orçamento aprovado era somado uma vez POR LANÇAMENTO, em vez
-- de uma vez POR OS — inflando o "Orçamento aprovado" nos
-- dashboards (Valores, Orçamentos OW, Vendedores). O valor pago
-- sempre esteve correto; só o orçamento estava sendo duplicado.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- Dashboard "Valores": todas as categorias
create or replace view vw_dashboard_valores as
with base as (
  select * from lancamentos where data >= date_trunc('month', current_date)::date
),
pagos as (
  select unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id
),
orcamentos as (
  select unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os
  ) os_unicas
  group by unidade_id
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
left join pagos p on p.unidade_id = u.id
left join orcamentos o on o.unidade_id = u.id
where u.ativo = true;

-- Dashboard "Orçamentos (OW)": todas as categorias, exceto Acessório
create or replace view vw_dashboard_ow as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
    and (categoria_id is null or categoria_id <> (select id from categorias where nome = 'Acessório'))
),
pagos as (
  select unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id
),
orcamentos as (
  select unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os
  ) os_unicas
  group by unidade_id
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
left join pagos p on p.unidade_id = u.id
left join orcamentos o on o.unidade_id = u.id
where u.ativo = true;

-- Dashboard "Vendedores" > aba Acessórios
create or replace view vw_dashboard_vendedores as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
    and categoria_id = (select id from categorias where nome = 'Acessório')
),
pagos as (
  select atendente_id as usuario_id, unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by atendente_id, unidade_id
),
orcamentos as (
  select usuario_id, unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select atendente_id as usuario_id, unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by atendente_id, unidade_id, numero_os
  ) os_unicas
  group by usuario_id, unidade_id
)
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join pagos p on p.usuario_id = us.id and p.unidade_id = un.id
left join orcamentos o on o.usuario_id = us.id and o.unidade_id = un.id
where us.ativo = true;

-- Dashboard "Vendedores" > aba Orçamentos (exceto Acessório)
create or replace view vw_dashboard_vendedores_ow as
with base as (
  select * from lancamentos
  where data >= date_trunc('month', current_date)::date
    and (categoria_id is null or categoria_id <> (select id from categorias where nome = 'Acessório'))
),
pagos as (
  select atendente_id as usuario_id, unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by atendente_id, unidade_id
),
orcamentos as (
  select usuario_id, unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select atendente_id as usuario_id, unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by atendente_id, unidade_id, numero_os
  ) os_unicas
  group by usuario_id, unidade_id
)
select
  us.id as usuario_id,
  us.nome_completo,
  un.id as unidade_id,
  un.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from usuarios us
join usuario_unidades uu on uu.usuario_id = us.id
join unidades un on un.id = uu.unidade_id
left join pagos p on p.usuario_id = us.id and p.unidade_id = un.id
left join orcamentos o on o.usuario_id = us.id and o.unidade_id = un.id
where us.ativo = true;

grant select on vw_dashboard_valores to authenticated;
grant select on vw_dashboard_ow to authenticated;
grant select on vw_dashboard_vendedores to authenticated;
grant select on vw_dashboard_vendedores_ow to authenticated;
-- ============================================================
-- Fase 12 — Excluir lançamento com justificativa (Consulta)
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

alter table lancamentos add column if not exists motivo_exclusao text;
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
-- ============================================================
-- Fase 14 — Dashboard "Valores": versões Semanal e Diária, no
-- mesmo formato da versão mensal já existente (sem duplicar
-- orçamento quando uma OS tem mais de um lançamento).
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- Diário (hoje)
create or replace view vw_dashboard_valores_diario as
with base as (
  select * from lancamentos where data = current_date
),
pagos as (
  select unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id
),
orcamentos as (
  select unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os
  ) os_unicas
  group by unidade_id
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
left join pagos p on p.unidade_id = u.id
left join orcamentos o on o.unidade_id = u.id
where u.ativo = true;

grant select on vw_dashboard_valores_diario to authenticated;

-- Semanal (domingo a sábado, mesmo padrão usado no resto do sistema)
create or replace view vw_dashboard_valores_semanal as
with base as (
  select * from lancamentos where data >= (current_date - (extract(dow from current_date))::int)
),
pagos as (
  select unidade_id, sum(valor_pago) as valor_pago, count(distinct numero_os) as qtd_os
  from base group by unidade_id
),
orcamentos as (
  select unidade_id, sum(orcamento_aprovado) as orcamento_aprovado
  from (
    select unidade_id, numero_os, max(orcamento_aprovado) as orcamento_aprovado
    from base group by unidade_id, numero_os
  ) os_unicas
  group by unidade_id
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  coalesce(o.orcamento_aprovado, 0) as orcamento_aprovado,
  coalesce(p.valor_pago, 0) as valor_pago,
  coalesce(p.qtd_os, 0) as qtd_os
from unidades u
left join pagos p on p.unidade_id = u.id
left join orcamentos o on o.unidade_id = u.id
where u.ativo = true;

grant select on vw_dashboard_valores_semanal to authenticated;
