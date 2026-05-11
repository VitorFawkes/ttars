-- ========================================
-- Enriquecer solicitacao_mudanca
-- Novas categorias + outcomes de conclusao
-- ========================================

-- 1. Novas categorias para change_request
INSERT INTO public.activity_categories (key, label, scope, visible, ordem)
VALUES
    ('transfer', 'Transfer', 'change_request', true, 25),
    ('passeio', 'Passeio / Tour', 'change_request', true, 35),
    ('erro', 'Erro Operacional', 'change_request', true, 45),
    ('fornecedor', 'Problema Fornecedor', 'change_request', true, 46),
    ('upsell', 'Upsell / Upgrade', 'change_request', true, 47)
ON CONFLICT (key) DO NOTHING;

-- 2. Outcomes para solicitacao_mudanca
INSERT INTO task_type_outcomes (tipo, outcome_key, outcome_label, ordem, is_success)
VALUES
    ('solicitacao_mudanca', 'resolvido', 'Resolvido', 1, true),
    ('solicitacao_mudanca', 'resolvido_com_custo', 'Resolvido c/ custo', 2, true),
    ('solicitacao_mudanca', 'cancelado_cliente', 'Cancelado pelo cliente', 3, false),
    ('solicitacao_mudanca', 'escalado', 'Escalado p/ gerência', 4, false)
ON CONFLICT (tipo, outcome_key) DO NOTHING;
