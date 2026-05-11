-- Create activity_categories table
CREATE TABLE IF NOT EXISTS public.activity_categories (
    key text PRIMARY KEY,
    label text NOT NULL,
    scope text NOT NULL,
    visible boolean DEFAULT true,
    ordem integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_categories ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Allow public read access" ON public.activity_categories
    FOR SELECT USING (true);

-- Insert default values for change_request scope
INSERT INTO public.activity_categories (key, label, scope, visible, ordem)
VALUES 
    ('voo', 'Voo', 'change_request', true, 10),
    ('hotel', 'Hotel', 'change_request', true, 20),
    ('datas', 'Datas', 'change_request', true, 30),
    ('financeiro', 'Financeiro', 'change_request', true, 40),
    ('outro', 'Outro', 'change_request', true, 50)
ON CONFLICT (key) DO NOTHING;
