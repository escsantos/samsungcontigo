
-- ================================================================
-- ALTERAR A DATA DA ENTREGA/RETIRADA (12/11/2026)
-- Supervisor, Gerente, Diretor e Administrador podem corrigir a data em
-- que o "Produto Entregue" foi registrado, com justificativa obrigatória.
-- A data de entrega define a semana (Resumo, Comissões, Fabricante...),
-- então tudo recalcula sozinho. Regras:
--   * bloqueado se o pedido já foi pago ao fabricante;
--   * se mudar de semana, a validação do gerente volta para pendente;
--   * não aceita data futura; mantém o horário original da entrega;
--   * cada alteração fica no histórico (linha do tempo + Auditoria).
-- Rode este bloco inteiro no SQL Editor do Supabase
-- ================================================================

create table if not exists orcamento_entrega_alteracoes (
  id bigint generated always as identity primary key,
  orcamento_id bigint not null references orcamentos(id) on delete cascade,
  data_antes timestamptz,
  data_depois timestamptz,
  justificativa text not null,
  validacao_resetada boolean default false,
  alterado_por uuid references perfis(id) default auth.uid(),
  alterado_por_nome text,
  criado_em timestamptz default now()
);
create index if not exists idx_entrega_alteracoes_orc on orcamento_entrega_alteracoes (orcamento_id);

alter table orcamento_entrega_alteracoes enable row level security;

drop policy if exists "ver alteracoes de entrega" on orcamento_entrega_alteracoes;
create policy "ver alteracoes de entrega"
  on orcamento_entrega_alteracoes for select
  using (exists (
    select 1 from orcamentos o where o.id = orcamento_id
    and (o.cliente_id = meu_cliente_id() or o.vendedor_id = auth.uid() or pode_ver_todos_orcamentos() or pode_gerenciar_estoque() or eh_financeiro())
  ));
-- (sem insert/update/delete direto: só pela função abaixo)

create or replace function alterar_data_entrega(p_orcamento_id bigint, p_nova_data date, p_justificativa text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orc orcamentos%rowtype;
  v_dia_antes date;
  v_hora time;
  v_novo timestamptz;
  v_semana_antes date;
  v_semana_depois date;
  v_reset boolean := false;
  v_nome text;
begin
  if not exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Supervisor')) then
    raise exception 'Só Supervisor, Gerente, Diretor ou Administrador podem alterar a data da entrega.';
  end if;
  if coalesce(trim(p_justificativa), '') = '' then
    raise exception 'Informe a justificativa.';
  end if;
  if p_nova_data is null then
    raise exception 'Informe a nova data.';
  end if;

  select * into v_orc from orcamentos where id = p_orcamento_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not exists (select 1 from perfis_unidades pu where pu.unidade_id = v_orc.unidade_id and pu.perfil_id = auth.uid()) then
    raise exception 'Pedido fora da sua unidade.';
  end if;
  if not coalesce(v_orc.entregue, false) or v_orc.entregue_em is null then
    raise exception 'O pedido ainda não foi entregue.';
  end if;
  if p_nova_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data da entrega não pode ser no futuro.';
  end if;
  if exists (select 1 from orcamento_itens i where i.orcamento_id = p_orcamento_id and coalesce(i.custo_pago_fabricante, false)) then
    raise exception 'Este pedido já foi pago ao fabricante — a data da entrega não pode mais ser alterada.';
  end if;

  v_dia_antes := (v_orc.entregue_em at time zone 'America/Sao_Paulo')::date;
  if p_nova_data = v_dia_antes then
    raise exception 'A nova data é igual à atual.';
  end if;
  v_hora := (v_orc.entregue_em at time zone 'America/Sao_Paulo')::time;
  v_novo := (p_nova_data + v_hora) at time zone 'America/Sao_Paulo';

  -- semana domingo a sábado (igual ao Resumo e ao Fabricante)
  v_semana_antes := v_dia_antes - extract(dow from v_dia_antes)::int;
  v_semana_depois := p_nova_data - extract(dow from p_nova_data)::int;
  if v_semana_antes <> v_semana_depois and v_orc.validacao_gerente is not null then
    v_reset := true;
  end if;

  update orcamentos set
    entregue_em = v_novo,
    validacao_gerente = case when v_reset then null else validacao_gerente end,
    validacao_gerente_justificativa = case when v_reset then null else validacao_gerente_justificativa end,
    validacao_gerente_por = case when v_reset then null else validacao_gerente_por end,
    validacao_gerente_em = case when v_reset then null else validacao_gerente_em end
  where id = p_orcamento_id;

  select nome into v_nome from perfis where id = auth.uid();
  insert into orcamento_entrega_alteracoes (orcamento_id, data_antes, data_depois, justificativa, validacao_resetada, alterado_por_nome)
  values (p_orcamento_id, v_orc.entregue_em, v_novo, trim(p_justificativa), v_reset, v_nome);

  return jsonb_build_object('data_antes', v_orc.entregue_em, 'data_depois', v_novo, 'mudou_semana', v_semana_antes <> v_semana_depois, 'validacao_resetada', v_reset);
end;
$$;

grant execute on function alterar_data_entrega(bigint, date, text) to authenticated;
