-- Add checklist to the allowed field types
ALTER TABLE public.system_fields DROP CONSTRAINT IF EXISTS system_fields_type_check;

ALTER TABLE public.system_fields ADD CONSTRAINT system_fields_type_check CHECK (
    type IN ('text', 'textarea', 'number', 'currency', 'date', 'select', 'multiselect', 'checklist', 'boolean', 'json')
);
