-- H2: Tabela products — metadata centralizada de produtos
-- Substitui constantes hardcoded no frontend (PRODUCT_PIPELINE_MAP, arrays locais)
-- O enum app_product permanece para compatibilidade; esta tabela é a fonte de verdade para metadata

CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,                    -- 'TRIPS', 'WEDDING', 'CORP' (matches enum)
    name            TEXT NOT NULL,                    -- 'Welcome Trips'
    name_short      TEXT NOT NULL,                    -- 'Trips'
    icon_name       TEXT NOT NULL DEFAULT 'HelpCircle', -- Lucide icon name
    color_class     TEXT NOT NULL DEFAULT 'text-slate-500', -- Tailwind class
    pipeline_id     UUID REFERENCES pipelines(id),   -- FK direta para o pipeline do produto
    deal_label      TEXT,                             -- 'Viagem', 'Casamento', 'Evento'
    deal_plural     TEXT,                             -- 'Viagens', 'Casamentos', 'Eventos'
    main_date_label TEXT,                             -- 'Data da Viagem', etc.
    not_found_label TEXT,                             -- 'Viagem não encontrada', etc.
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, slug)
);

-- Seed: 3 produtos da Welcome Group
INSERT INTO products (org_id, slug, name, name_short, icon_name, color_class, pipeline_id, deal_label, deal_plural, main_date_label, not_found_label, active, display_order)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'TRIPS',   'Welcome Trips',   'Trips',   'Plane',     'text-teal-500',   'c8022522-4a1d-411c-9387-efe03ca725ee', 'Viagem',    'Viagens',    'Data da Viagem',    'Viagem não encontrada',    TRUE,  1),
    ('a0000000-0000-0000-0000-000000000001', 'WEDDING', 'Welcome Wedding', 'Wedding', 'Heart',     'text-rose-500',   'f4611f84-ce9c-48ad-814b-dcd6081f15db', 'Casamento', 'Casamentos', 'Data do Casamento', 'Casamento não encontrado', TRUE,  2),
    ('a0000000-0000-0000-0000-000000000001', 'CORP',    'Welcome Corp',    'Corp',    'Building2', 'text-purple-500', '952fd827-39a1-43cb-b160-a7f02a04678d', 'Evento',    'Eventos',    'Data do Evento',    'Evento não encontrado',    FALSE, 3)
ON CONFLICT (org_id, slug) DO UPDATE SET
    pipeline_id = EXCLUDED.pipeline_id,
    name = EXCLUDED.name,
    name_short = EXCLUDED.name_short,
    icon_name = EXCLUDED.icon_name,
    color_class = EXCLUDED.color_class;

-- RLS básica
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read_authenticated"
    ON products FOR SELECT TO authenticated
    USING (TRUE);

COMMENT ON TABLE products IS 'H2: Metadata de produtos por org. Fonte de verdade para nome, ícone, cor, labels, pipeline_id.';
