
-- ================================================================
-- AJUSTE DO PEDIDO PELO ESTOQUE (03/11/2026)
-- Antes de confirmar a Delivery, o Estoque (e Adm/Diretor/Gerente/
-- Supervisor) pode: mudar a QUANTIDADE de uma peça, REMOVER uma peça ou
-- INCLUIR uma peça nova. O valor de venda é recalculado (preço unitário
-- mantido; desconto da peça proporcional; peça nova com a margem/imposto
-- do próprio pedido) e o total do pedido é atualizado.
-- Cada ajuste fica registrado em orcamento_ajustes (aparece na linha do
-- tempo do pedido), inclusive quando o cliente já pagou mais que o novo
-- total — para o Financeiro tratar a diferença.
-- Rode este bloco inteiro no SQL Editor do Supabase
-- ================================================================

-- desconto por peça (já usado pelas telas; garante que a coluna existe)
alter table orcamento_itens add column if not exists desconto_item numeric(12,2) default 0;

create table if not exists orcamento_ajustes (
  id bigint generated always as identity primary key,
  orcamento_id bigint not null references orcamentos(id) on delete cascade,
  acao text not null,                  -- qtd | remover | incluir
  descricao text not null,
  motivo text,
  valor_antes numeric(12,2),
  valor_depois numeric(12,2),
  total_pago numeric(12,2),
  pago_a_mais numeric(12,2) default 0,
  criado_por uuid references perfis(id) default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz default now()
);
create index if not exists idx_orcamento_ajustes_orc on orcamento_ajustes (orcamento_id);

alter table orcamento_ajustes enable row level security;

drop policy if exists "ver ajustes do pedido" on orcamento_ajustes;
create policy "ver ajustes do pedido"
  on orcamento_ajustes for select
  using (exists (
    select 1 from orcamentos o where o.id = orcamento_id
    and (o.cliente_id = meu_cliente_id() or o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque() or eh_financeiro())
  ));
-- (sem insert/update/delete direto: só pela função abaixo)

create or replace function ajustar_item_pedido(
  p_orcamento_id bigint,
  p_acao text,             -- 'qtd' | 'remover' | 'incluir'
  p_item_id bigint default null,
  p_qtd integer default null,
  p_peca jsonb default null, -- para 'incluir': {peca_id, modelo, categoria, codigo, descricao_resumida, descricao_peca, valor_unitario}
  p_motivo text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orc orcamentos%rowtype;
  v_item orcamento_itens%rowtype;
  v_antes numeric;
  v_depois numeric;
  v_pago numeric;
  v_desc_itens_antes numeric;
  v_desc_itens_depois numeric;
  v_subtotal numeric;
  v_desconto numeric;
  v_venda_unit numeric;
  v_custo numeric;
  v_divisor numeric;
  v_descricao text;
  v_nome text;
begin
  if not exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Supervisor','Estoque')) then
    raise exception 'Sem permissão para ajustar o pedido.';
  end if;

  select * into v_orc from orcamentos where id = p_orcamento_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not exists (select 1 from perfis_unidades pu where pu.unidade_id = v_orc.unidade_id and pu.perfil_id = auth.uid()) then
    raise exception 'Pedido fora da sua unidade.';
  end if;
  if v_orc.status not in ('Aguardando Separação/Compra', 'Peças Compradas - Aguardando Chegada', 'Peça Indisponível Samsung') then
    raise exception 'O pedido só pode ser ajustado antes de confirmar as Deliveries (status atual: %).', v_orc.status;
  end if;
  if p_acao not in ('qtd', 'remover', 'incluir') then
    raise exception 'Ação inválida.';
  end if;

  v_antes := coalesce(v_orc.valor_total, 0);
  select coalesce(sum(desconto_item), 0) into v_desc_itens_antes from orcamento_itens where orcamento_id = p_orcamento_id;

  if p_acao in ('qtd', 'remover') then
    select * into v_item from orcamento_itens where id = p_item_id and orcamento_id = p_orcamento_id for update;
    if not found then raise exception 'Peça não encontrada neste pedido.'; end if;
    if coalesce(v_item.liberado, false) then
      raise exception 'A peça % já tem Delivery confirmada — não pode mais ser alterada.', v_item.codigo;
    end if;
  end if;

  if p_acao = 'qtd' then
    if p_qtd is null or p_qtd < 1 then raise exception 'Quantidade inválida (mínimo 1).'; end if;
    if p_qtd = v_item.qtd then raise exception 'A quantidade é a mesma.'; end if;
    v_venda_unit := coalesce(v_item.venda_unitario, case when coalesce(v_item.qtd, 0) > 0 then v_item.venda_total / v_item.qtd else 0 end, 0);
    update orcamento_itens set
      qtd = p_qtd,
      venda_total = round(v_venda_unit * p_qtd, 2),
      desconto_item = case when coalesce(v_item.qtd, 0) > 0 then round(coalesce(desconto_item, 0) * p_qtd / v_item.qtd, 2) else 0 end
    where id = v_item.id;
    v_descricao := format('Quantidade de %s alterada: %s → %s', v_item.codigo, v_item.qtd, p_qtd);

  elsif p_acao = 'remover' then
    if (select count(*) from orcamento_itens where orcamento_id = p_orcamento_id) <= 1 then
      raise exception 'O pedido precisa ter pelo menos 1 peça. Para desistir do pedido inteiro, use "Cancelar pedido".';
    end if;
    delete from orcamento_itens where id = v_item.id;
    v_descricao := format('Peça removida: %s (%s un.)', v_item.codigo, v_item.qtd);

  else -- incluir
    if p_qtd is null or p_qtd < 1 then raise exception 'Quantidade inválida (mínimo 1).'; end if;
    if p_peca is null or coalesce(p_peca->>'codigo', '') = '' then raise exception 'Escolha a peça.'; end if;
    v_custo := nullif(p_peca->>'valor_unitario', '')::numeric;
    if v_custo is null then raise exception 'A peça % não tem custo cadastrado.', p_peca->>'codigo'; end if;
    v_divisor := 1 - coalesce(v_orc.margem, 0) / 100 - coalesce(v_orc.imposto_total, 0) / 100;
    if v_divisor <= 0 then raise exception 'Margem + imposto do pedido inválidos.'; end if;
    v_venda_unit := round(v_custo / v_divisor, 2);
    insert into orcamento_itens (
      orcamento_id, peca_id, modelo, categoria, codigo, descricao_resumida, descricao_peca,
      qtd, custo_unitario, venda_unitario, venda_total, desconto_item
    ) values (
      p_orcamento_id,
      case when coalesce((p_peca->>'peca_id')::bigint, 0) > 0 then (p_peca->>'peca_id')::bigint else null end,
      p_peca->>'modelo', p_peca->>'categoria', p_peca->>'codigo', p_peca->>'descricao_resumida', p_peca->>'descricao_peca',
      p_qtd, v_custo, v_venda_unit, round(v_venda_unit * p_qtd, 2), 0
    );
    v_descricao := format('Peça incluída: %s (%s un. × %s)', p_peca->>'codigo', p_qtd, to_char(v_venda_unit, 'FM999G999G990D00'));
  end if;

  -- recalcula o total do pedido
  select coalesce(sum(venda_total), 0), coalesce(sum(desconto_item), 0)
    into v_subtotal, v_desc_itens_depois
  from orcamento_itens where orcamento_id = p_orcamento_id;
  v_desconto := greatest(0, coalesce(v_orc.desconto, 0) + (v_desc_itens_depois - v_desc_itens_antes));
  v_desconto := least(v_desconto, v_subtotal);
  v_depois := round(v_subtotal - v_desconto, 2);
  update orcamentos set valor_total = v_depois, desconto = v_desconto where id = p_orcamento_id;

  select coalesce(sum(valor), 0) + coalesce(v_orc.valor_herdado_pai, 0) into v_pago
  from pagamentos_orcamento where orcamento_id = p_orcamento_id;

  select nome into v_nome from perfis where id = auth.uid();
  insert into orcamento_ajustes (orcamento_id, acao, descricao, motivo, valor_antes, valor_depois, total_pago, pago_a_mais, criado_por_nome)
  values (p_orcamento_id, p_acao, v_descricao, nullif(trim(coalesce(p_motivo, '')), ''), v_antes, v_depois, v_pago,
          greatest(0, round(v_pago - v_depois, 2)), v_nome);

  return jsonb_build_object('valor_antes', v_antes, 'valor_depois', v_depois, 'total_pago', v_pago, 'descricao', v_descricao);
end;
$$;

grant execute on function ajustar_item_pedido(bigint, text, bigint, integer, jsonb, text) to authenticated;
