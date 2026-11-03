
-- ================================================================
-- ATUALIZAÇÃO AUTOMÁTICA DAS BASES (03/11/2026)
-- O robô do PC (C:\SSG-CONTIGO\robo-bases) confere a cada 2 minutos as
-- pastas do Robô GSPN no OneDrive (PEÇAS\base_pecas.xlsx e
-- BASE DE DADOS\base_ordens_servico.xlsx). Quando o arquivo consolidado
-- muda — ou alguém clica em "Forçar atualização" — ele processa e grava
-- catálogo, preços e Deliveries, e registra aqui o status.
-- Rode este bloco inteiro no SQL Editor do Supabase
-- ================================================================

-- histórico de processamentos: de onde veio (manual/robô) e quando o
-- arquivo consolidado foi salvo pelo Robô GSPN
alter table pecas_processamentos add column if not exists origem text default 'manual';
alter table pecas_processamentos add column if not exists arquivo_pecas_salvo_em timestamptz;
alter table pecas_processamentos add column if not exists arquivo_gspn_salvo_em timestamptz;

create table if not exists bases_robo_status (
  unidade_id bigint primary key references unidades(id),
  ultima_verificacao timestamptz,          -- "batimento" do robô (a cada 2 min)
  pecas_versao text,
  pecas_salvo_em timestamptz,              -- quando o Robô GSPN salvou a base_pecas
  pecas_processado_em timestamptz,         -- quando o sistema atualizou com ela
  pecas_total integer,
  gspn_versao text,
  gspn_salvo_em timestamptz,
  gspn_processado_em timestamptz,
  gspn_total integer,
  em_processamento boolean default false,
  processamento_inicio timestamptz,
  ultimo_erro text,
  ultimo_erro_em timestamptz,
  forcar_pedido_em timestamptz,            -- botão "Forçar atualização"
  forcar_pedido_por_nome text,
  forcar_atendido_em timestamptz,
  atualizado_em timestamptz default now()
);

alter table bases_robo_status enable row level security;

create or replace function pode_carregar_bases()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from perfis where id = auth.uid() and cargo in ('Administrador','Diretor','Gerente','Supervisor','Estoque'));
$$;

drop policy if exists "ve status do robo de bases" on bases_robo_status;
create policy "ve status do robo de bases"
  on bases_robo_status for select
  using (
    pode_carregar_bases()
    and exists (select 1 from perfis_unidades pu where pu.unidade_id = bases_robo_status.unidade_id and pu.perfil_id = auth.uid())
  );
-- (o robô grava com a chave de serviço; a tela só pede atualização pela função abaixo)

create or replace function solicitar_atualizacao_bases(p_unidade_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if not pode_carregar_bases() then
    raise exception 'Sem permissão para forçar a atualização das bases.';
  end if;
  if not exists (select 1 from perfis_unidades pu where pu.unidade_id = p_unidade_id and pu.perfil_id = auth.uid()) then
    raise exception 'Unidade inválida.';
  end if;
  select nome into v_nome from perfis where id = auth.uid();
  insert into bases_robo_status (unidade_id, forcar_pedido_em, forcar_pedido_por_nome)
  values (p_unidade_id, now(), v_nome)
  on conflict (unidade_id) do update set forcar_pedido_em = now(), forcar_pedido_por_nome = v_nome, atualizado_em = now();
end;
$$;

grant execute on function solicitar_atualizacao_bases(bigint) to authenticated;
