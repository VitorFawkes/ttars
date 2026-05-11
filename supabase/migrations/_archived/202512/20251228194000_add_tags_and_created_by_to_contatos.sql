-- Add tags and created_by columns to contatos table
ALTER TABLE public.contatos 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Create index for better filtering performance
CREATE INDEX IF NOT EXISTS idx_contatos_tags ON public.contatos USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contatos_created_by ON public.contatos(created_by);

-- Update RLS policies to allow reading created_by (if necessary, though usually public read is fine for CRM)
-- Assuming existing policies cover this.
