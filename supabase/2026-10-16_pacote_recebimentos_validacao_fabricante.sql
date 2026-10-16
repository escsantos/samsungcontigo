
-- ================================================================
-- PACOTE 16/10/2026 — Recebimentos, validação do gerente e
-- Pagamento ao Fabricante com selo
-- Rode este bloco inteiro no SQL Editor do Supabase
-- ================================================================

-- 1) Data do pagamento: no registro fica só a data de REGISTRO
--    (registrado_em). A data do pagamento passa a ser informada pelo
--    Financeiro ao confirmar o recebimento — por isso pode ficar vazia.
alter table pagamentos_orcamento alter column data_pagamento drop not null;

-- 2) Depois que o Financeiro confirma o recebimento, só Administrador e
--    Financeiro (que têm policies próprias) podem editar/excluir os
--    pagamentos do pedido. Os demais cargos ficam travados.
drop policy if exists "editar pagamentos" on pagamentos_orcamento;
create policy "editar pagamentos"
  on pagamentos_orcamento for update
  using (
    exists (
      select 1 from orcamentos o where o.id = orcamento_id
      and exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid())
      and (pode_gerenciar_clientes() or pode_gerenciar_estoque())
      and (not coalesce(o.recebimento_confirmado, false) or eh_financeiro())
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
      and (not coalesce(o.recebimento_confirmado, false) or eh_financeiro())
    )
  );

-- 3) Validação do gerente no Relatório Resumo
alter table orcamentos add column if not exists validacao_gerente text;
alter table orcamentos add column if not exists validacao_gerente_justificativa text;
alter table orcamentos add column if not exists validacao_gerente_por uuid references perfis(id);
alter table orcamentos add column if not exists validacao_gerente_em timestamptz;

alter table orcamentos drop constraint if exists orcamentos_validacao_gerente_check;
alter table orcamentos add constraint orcamentos_validacao_gerente_check
  check (validacao_gerente is null or validacao_gerente in ('validado', 'nao_validado'));

create or replace function pode_validar_resumo()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente'));
$$;

create or replace function validar_pedidos_resumo(p_ids bigint[], p_acao text, p_justificativa text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_validar_resumo() then
    raise exception 'Só Gerente, Diretor ou Administrador validam pedidos.';
  end if;
  if p_acao not in ('validado', 'nao_validado', 'limpar') then
    raise exception 'Ação inválida.';
  end if;
  if p_acao = 'nao_validado' and coalesce(trim(p_justificativa), '') = '' then
    raise exception 'Informe a justificativa para não validar.';
  end if;
  if exists (
    select 1 from orcamentos o
    where o.id = any(p_ids)
    and (not coalesce(o.entregue, false)
         or not exists (select 1 from perfis_unidades pu where pu.unidade_id = o.unidade_id and pu.perfil_id = auth.uid()))
  ) then
    raise exception 'Há pedido fora da sua unidade ou ainda não entregue.';
  end if;
  if exists (select 1 from orcamento_itens i where i.orcamento_id = any(p_ids) and i.custo_pago_fabricante) then
    raise exception 'Há pedido de semana já paga ao fabricante — a validação não pode mais ser alterada.';
  end if;

  update orcamentos set
    validacao_gerente = case when p_acao = 'limpar' then null else p_acao end,
    validacao_gerente_justificativa = case when p_acao = 'nao_validado' then trim(p_justificativa) else null end,
    validacao_gerente_por = case when p_acao = 'limpar' then null else auth.uid() end,
    validacao_gerente_em = case when p_acao = 'limpar' then null else now() end
  where id = any(p_ids);
end;
$$;

grant execute on function validar_pedidos_resumo(bigint[], text, text) to authenticated;

-- Pedidos entregues cujas peças JÁ foram todas pagas ao fabricante antes
-- desta regra: marca como validados (senão travariam semanas antigas).
update orcamentos o set
  validacao_gerente = 'validado',
  validacao_gerente_em = now()
where coalesce(o.entregue, false)
  and o.validacao_gerente is null
  and exists (select 1 from orcamento_itens i where i.orcamento_id = o.id and i.custo_pago_fabricante)
  and not exists (select 1 from orcamento_itens i where i.orcamento_id = o.id and coalesce(i.liberado, false) and not coalesce(i.custo_pago_fabricante, false));

-- 4) Pagamento ao fabricante com selo (nome, login, data e hora)
create table if not exists fabricante_pagamentos (
  id bigint generated always as identity primary key,
  unidade_id bigint not null references unidades(id),
  semana_inicio date not null,
  semana_fim date not null,
  semana_rotulo text not null,
  data_pagamento date not null,
  valor_total numeric(14,2) not null,
  qtd_pecas integer not null,
  qtd_pedidos integer not null,
  observacao text,
  confirmado_por uuid not null references perfis(id),
  confirmado_por_nome text not null,
  confirmado_por_login text not null,
  confirmado_em timestamptz not null default now()
);
create index if not exists idx_fabricante_pag_unidade on fabricante_pagamentos (unidade_id, semana_inicio desc);

alter table orcamento_itens add column if not exists fabricante_pagamento_id bigint references fabricante_pagamentos(id);

alter table fabricante_pagamentos enable row level security;

drop policy if exists "financeiro le pagamentos ao fabricante" on fabricante_pagamentos;
create policy "financeiro le pagamentos ao fabricante"
  on fabricante_pagamentos for select
  using (
    (eh_financeiro() or pode_validar_resumo())
    and exists (select 1 from perfis_unidades pu where pu.unidade_id = fabricante_pagamentos.unidade_id and pu.perfil_id = auth.uid())
  );
-- (sem insert/update/delete direto: só pela função abaixo)

create or replace function confirmar_pagamento_fabricante(
  p_unidade_id bigint,
  p_semana_inicio date,
  p_semana_rotulo text,
  p_data_pagamento date,
  p_observacao text,
  p_item_ids bigint[]
)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_fim date := p_semana_inicio + 6;
  v_id bigint;
  v_nome text;
  v_login text;
  v_total numeric;
  v_pecas integer;
  v_pedidos integer;
  v_qtd_itens integer;
begin
  if not eh_financeiro() then
    raise exception 'Só o Financeiro (ou Administrador) confirma pagamento ao fabricante.';
  end if;
  if not exists (select 1 from perfis_unidades where unidade_id = p_unidade_id and perfil_id = auth.uid()) then
    raise exception 'Você não tem acesso a esta unidade.';
  end if;
  if p_data_pagamento is null then
    raise exception 'Informe a data do pagamento ao fabricante.';
  end if;
  if extract(dow from p_semana_inicio) <> 0 then
    raise exception 'A semana precisa começar no domingo.';
  end if;
  if coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception 'Nenhuma peça para confirmar.';
  end if;

  -- a semana precisa estar fechada (todos os pedidos decididos pelo gerente)
  if exists (
    select 1 from orcamentos o
    where o.unidade_id = p_unidade_id
      and coalesce(o.entregue, false)
      and o.validacao_gerente is null
      and (o.entregue_em at time zone 'America/Sao_Paulo')::date between p_semana_inicio and v_fim
  ) then
    raise exception 'A semana ainda tem pedido sem validação do gerente.';
  end if;

  select count(*), coalesce(sum(coalesce(i.custo_real, 0) * i.qtd), 0), coalesce(sum(i.qtd), 0), count(distinct i.orcamento_id)
    into v_qtd_itens, v_total, v_pecas, v_pedidos
  from orcamento_itens i
  join orcamentos o on o.id = i.orcamento_id
  where i.id = any(p_item_ids)
    and coalesce(i.liberado, false)
    and not coalesce(i.custo_pago_fabricante, false)
    and o.unidade_id = p_unidade_id
    and coalesce(o.entregue, false)
    and o.validacao_gerente = 'validado'
    and (o.entregue_em at time zone 'America/Sao_Paulo')::date between p_semana_inicio and v_fim;

  if v_qtd_itens <> array_length(p_item_ids, 1) then
    raise exception 'Algumas peças mudaram desde que a tela foi aberta — clique em Atualizar e tente de novo.';
  end if;

  select nome into v_nome from perfis where id = auth.uid();
  select split_part(email, '@', 1) into v_login from auth.users where id = auth.uid();

  insert into fabricante_pagamentos (
    unidade_id, semana_inicio, semana_fim, semana_rotulo, data_pagamento,
    valor_total, qtd_pecas, qtd_pedidos, observacao,
    confirmado_por, confirmado_por_nome, confirmado_por_login
  ) values (
    p_unidade_id, p_semana_inicio, v_fim, coalesce(p_semana_rotulo, ''), p_data_pagamento,
    v_total, v_pecas, v_pedidos, nullif(trim(coalesce(p_observacao, '')), ''),
    auth.uid(), coalesce(v_nome, ''), coalesce(v_login, '')
  ) returning id into v_id;

  update orcamento_itens set
    custo_pago_fabricante = true,
    custo_pago_fabricante_por = auth.uid(),
    custo_pago_fabricante_em = now(),
    fabricante_pagamento_id = v_id
  where id = any(p_item_ids);

  return v_id;
end;
$$;

grant execute on function confirmar_pagamento_fabricante(bigint, date, text, date, text, bigint[]) to authenticated;
