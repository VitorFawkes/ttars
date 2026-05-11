-- Migration: Add widget_component column to sections table
-- This enables sections to render specialized widget components (e.g., ProposalsWidget)
-- instead of dynamic form fields.

-- 1. Add widget_component column
ALTER TABLE sections ADD COLUMN IF NOT EXISTS widget_component text;

COMMENT ON COLUMN sections.widget_component IS 'If set, renders a specialized widget component instead of dynamic fields. Values: proposals, activity, etc.';

-- 2. Insert Proposta as a system section with widget
INSERT INTO sections (key, label, color, icon, position, is_system, is_governable, order_index, widget_component) 
VALUES ('proposta', 'Propostas', 'bg-indigo-50 text-indigo-700 border-indigo-100', 'file-text', 'right_column', true, false, 35, 'proposals')
ON CONFLICT (key) DO UPDATE SET
    label = 'Propostas',
    color = 'bg-indigo-50 text-indigo-700 border-indigo-100',
    icon = 'file-text',
    widget_component = 'proposals',
    is_system = true,
    is_governable = false;
