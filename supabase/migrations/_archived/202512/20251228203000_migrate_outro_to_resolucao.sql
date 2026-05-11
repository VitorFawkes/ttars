-- Drop the restrictive check constraint on 'fase' column
ALTER TABLE public.pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_fase_check;

-- Create 'Resolução' phase if it doesn't exist
INSERT INTO public.pipeline_phases (name, label, color, order_index, active)
SELECT 'Resolução', 'Resolução', 'bg-gray-500', 999, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.pipeline_phases WHERE name = 'Resolução'
);

-- Get the ID of the new phase
DO $$
DECLARE
    v_resolucao_id uuid;
BEGIN
    SELECT id INTO v_resolucao_id FROM public.pipeline_phases WHERE name = 'Resolução';

    -- Update stages that have no phase_id or have fase='Outro' or fase='Perdido' (if that was used as a phase name)
    -- Also specifically target the 'Perdido' stage to ensure it's in Resolução
    UPDATE public.pipeline_stages
    SET phase_id = v_resolucao_id,
        fase = 'Resolução' -- Update legacy column too
    WHERE phase_id IS NULL 
       OR fase = 'Outro'
       OR nome = 'Perdido'; -- Ensure Perdido stage goes here
END $$;
