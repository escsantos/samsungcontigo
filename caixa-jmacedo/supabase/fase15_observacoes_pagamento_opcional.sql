-- ============================================================
-- Fase 15 — Lançamento: valor pago passa a ser opcional (se não
-- for informado, forma de pagamento fica "nenhuma"/nula) + novo
-- campo de observações, opcional.
-- Rode no SQL Editor do seu projeto Supabase.
-- ============================================================

-- forma_pagamento deixa de ser obrigatória (fica nula quando não há valor pago)
alter table lancamentos alter column forma_pagamento drop not null;

-- passa a aceitar também "MÚLTIPLAS", usado quando o lançamento tem mais de
-- uma forma de pagamento (o detalhe de cada uma fica em formas_pagamento)
alter table lancamentos drop constraint if exists lancamentos_forma_pagamento_check;
alter table lancamentos add constraint lancamentos_forma_pagamento_check check (forma_pagamento in
  ('PIX','DÉBITO','CRÉDITO','DINHEIRO','BOLETO','LINK DE PAGAMENTO','MÚLTIPLAS'));

-- detalhamento de cada forma de pagamento, quando há mais de uma no mesmo lançamento
-- formato: [{"valor": 100.00, "forma_pagamento": "PIX", "parcelas": null, "bandeira": null}, ...]
alter table lancamentos add column if not exists formas_pagamento jsonb;

-- novo campo, livre, não obrigatório
alter table lancamentos add column if not exists observacoes text;
