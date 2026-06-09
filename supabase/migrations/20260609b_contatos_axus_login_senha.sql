-- Credenciais do cliente no Axus Travel App, por contato.
-- Texto simples (mesma sensibilidade de CPF/passaporte já armazenados em contatos).
-- contatos já é tabela por-org com RLS por org_id; colunas novas herdam a proteção da linha.

ALTER TABLE contatos
  ADD COLUMN IF NOT EXISTS axus_login TEXT,
  ADD COLUMN IF NOT EXISTS axus_senha TEXT;

COMMENT ON COLUMN contatos.axus_login IS 'Login do cliente no Axus Travel App';
COMMENT ON COLUMN contatos.axus_senha IS 'Senha do cliente no Axus Travel App (texto simples, como CPF/passaporte)';
