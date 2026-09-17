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
