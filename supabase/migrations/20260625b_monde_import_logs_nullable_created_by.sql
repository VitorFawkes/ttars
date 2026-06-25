-- monde_import_logs.created_by: permitir NULL.
-- A importação automática de vendas (cron monde-sales-import / API v3) não tem
-- usuário logado, então grava created_by = NULL (= "sistema"). Antes, o NOT NULL
-- fazia o INSERT de log falhar silenciosamente (a importação rodava, mas sem
-- registro de auditoria). O upload manual de planilha continua setando created_by.

ALTER TABLE monde_import_logs ALTER COLUMN created_by DROP NOT NULL;
