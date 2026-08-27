-- ============================================================
-- Fase 30 — Balão de "novo lançamento" agora aparece pra TODO
-- MUNDO online, independente da unidade.
--
-- Antes, o balão usava o Realtime "postgres_changes" na tabela
-- lancamentos, que respeita a mesma regra de segurança (RLS) do
-- resto do sistema — por isso um Operacional de uma loja só via
-- o balão da própria loja.
--
-- Agora um gatilho no banco manda um "broadcast" público (não
-- passa pela regra de unidade) só com o resumo — unidade, login
-- de quem lançou, e o valor. Nenhum outro dado (nº da OS, tipo de
-- serviço, orçamento etc) sai nesse broadcast.
--
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

create or replace function notificar_novo_lancamento()
returns trigger as $$
declare
  unidade_nome text;
  login_atendente text;
begin
  select nome into unidade_nome from unidades where id = new.unidade_id;
  select login into login_atendente from usuarios where id = new.atendente_id;

  perform realtime.send(
    jsonb_build_object(
      'unidade', coalesce(unidade_nome, '—'),
      'login', coalesce(login_atendente, '—'),
      'valor', new.valor_pago
    ),
    'novo_lancamento',   -- nome do evento
    'celebracoes',        -- canal (tópico) público
    false                 -- false = público, não exige autorização por linha
  );

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notificar_novo_lancamento on lancamentos;
create trigger trg_notificar_novo_lancamento
after insert on lancamentos
for each row execute function notificar_novo_lancamento();
