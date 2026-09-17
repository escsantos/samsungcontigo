-- ============================================================
-- Fase 16 — Orçamento aprovado deixa de ser obrigatório no
-- lançamento. Cenário: cliente paga só a taxa de análise, o
-- orçamento é definido (e possivelmente corrigido) depois, num
-- lançamento seguinte da mesma OS.
--
-- Regra nova: orçamento = 0/em branco significa "ainda não
-- definido" — nesse caso não há limite de valor pago. Assim que
-- QUALQUER lançamento da OS tiver um orçamento > 0, esse passa a
-- ser o valor travado para os lançamentos seguintes (igual já
-- funcionava antes, só que agora ignorando os lançamentos com
-- orçamento em branco/zero na hora de decidir qual foi "o
-- primeiro").
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

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

  -- orçamento "oficial" da OS é o do primeiro lançamento em que ele foi
  -- de fato definido (> 0) — ignora lançamentos com orçamento em branco
  select orcamento_aprovado into orcamento
  from lancamentos
  where unidade_id = new.unidade_id
    and numero_os = new.numero_os
    and orcamento_aprovado > 0
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000')
  order by criado_em asc
  limit 1;

  if orcamento is not null and orcamento <> new.orcamento_aprovado then
    new.orcamento_aprovado := orcamento; -- trava no valor já definido para essa OS
  end if;

  -- só valida o limite se o orçamento já foi definido; sem orçamento
  -- definido (0/em branco), qualquer valor pago é permitido por enquanto
  if new.orcamento_aprovado > 0 and (ja_pago + new.valor_pago) > new.orcamento_aprovado then
    raise exception 'VALOR_EXCEDE_ORCAMENTO: saldo restante é %', (new.orcamento_aprovado - ja_pago);
  end if;

  return new;
end;
$$ language plpgsql;
