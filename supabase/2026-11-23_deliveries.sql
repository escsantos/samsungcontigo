-- ================================================================
-- DELIVERIES DISPONÍVEIS MAIS RÁPIDO (23/11/2026)
-- O robô lê as Deliveries já gravadas da unidade (por ASC, em ordem de id)
-- para gravar só as novas; sem índice, em São Miguel essa leitura chegou a
-- estourar o tempo ("statement timeout") e a atualização falhava.
-- Rode este bloco inteiro no SQL Editor do Supabase
-- ================================================================

create index if not exists idx_lotes_asc_id on lotes_pecas (asc_cod_origem, id);
create index if not exists idx_lotes_asc_codigo_entrega on lotes_pecas (asc_cod_origem, codigo, no_entrega);

analyze lotes_pecas;
