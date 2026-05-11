-- Create pipeline_phases table
CREATE TABLE IF NOT EXISTS public.pipeline_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipeline_phases ENABLE ROW LEVEL SECURITY;

-- Create policy for read access (authenticated users)
CREATE POLICY "Allow read access for authenticated users" ON public.pipeline_phases
    FOR SELECT TO authenticated USING (true);

-- Create policy for write access (admin only)
CREATE POLICY "Allow write access for admins" ON public.pipeline_phases
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Insert default phases
INSERT INTO public.pipeline_phases (name, label, color, order_index) VALUES
    ('SDR', 'SDR (Pré-Venda)', 'bg-blue-600', 1),
    ('Planner', 'Planner (Venda)', 'bg-purple-600', 2),
    ('Pós-venda', 'Pós-Venda', 'bg-green-600', 3)
ON CONFLICT DO NOTHING;

-- Add phase_id to pipeline_stages
ALTER TABLE public.pipeline_stages 
ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.pipeline_phases(id);

-- Migrate existing data
UPDATE public.pipeline_stages s
SET phase_id = p.id
FROM public.pipeline_phases p
WHERE s.fase = p.name;

-- Create function to sync fase column (Legacy Support)
CREATE OR REPLACE FUNCTION public.sync_pipeline_stage_fase()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.phase_id IS NOT NULL THEN
        SELECT name INTO NEW.fase
        FROM public.pipeline_phases
        WHERE id = NEW.phase_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync fase column
DROP TRIGGER IF EXISTS sync_stage_fase_trigger ON public.pipeline_stages;
CREATE TRIGGER sync_stage_fase_trigger
    BEFORE INSERT OR UPDATE OF phase_id ON public.pipeline_stages
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_pipeline_stage_fase();
