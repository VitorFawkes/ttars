-- Migration: WhatsApp Multi-Provider Support
-- Date: 2026-01-12
-- Description: Adds instances and conversations tables, migrates existing messages.

-- 1. Create whatsapp_instances table
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    provider text NOT NULL CHECK (provider IN ('chatpro', 'echo')),
    external_id text, -- Instance ID from provider
    name text NOT NULL,
    api_url text,
    api_key text,
    webhook_secret text,
    is_primary boolean DEFAULT false,
    status text DEFAULT 'disconnected' CHECK (status IN ('active', 'disconnected', 'error')),
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(provider, external_id)
);

-- Enable RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view instances (for governance)
CREATE POLICY "Authenticated users can view whatsapp_instances"
    ON public.whatsapp_instances FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only admins/service role should update (simplified to authenticated for MVP governance)
CREATE POLICY "Authenticated users can update whatsapp_instances"
    ON public.whatsapp_instances FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);


-- 2. Create whatsapp_conversations table
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid REFERENCES public.contatos(id) ON DELETE CASCADE,
    instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    last_message_at timestamp with time zone DEFAULT now(),
    unread_count int DEFAULT 0,
    status text DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(contact_id, instance_id)
);

-- Enable RLS
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- Policy: View conversations
CREATE POLICY "Authenticated users can view whatsapp_conversations"
    ON public.whatsapp_conversations FOR SELECT
    TO authenticated
    USING (true);


-- 3. Modify whatsapp_messages table
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL;

-- Drop old unique constraint on external_id if it exists (to allow same ID across different instances if needed)
-- Note: We need to check if the constraint exists by name or just drop the unique index.
-- Assuming standard naming or just dropping the constraint if we can find it.
-- For safety, we'll just add the composite index and keep the old one for now if it doesn't conflict, 
-- but ideally we want (instance_id, external_id) to be unique.
-- Let's try to drop the constraint by its likely name.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_external_id_key') THEN
        ALTER TABLE public.whatsapp_messages DROP CONSTRAINT whatsapp_messages_external_id_key;
    END IF;
END $$;

-- Create new composite unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_instance_external ON public.whatsapp_messages(instance_id, external_id);


-- 4. Migration Logic: Create Legacy Instance and Migrate Data
DO $$
DECLARE
    v_instance_id uuid;
BEGIN
    -- Check if we already have a legacy instance or any instance
    SELECT id INTO v_instance_id FROM public.whatsapp_instances WHERE provider = 'chatpro' AND external_id = 'legacy-chatpro' LIMIT 1;

    IF v_instance_id IS NULL THEN
        -- Insert Legacy Instance
        INSERT INTO public.whatsapp_instances (provider, external_id, name, status, is_primary, api_url)
        VALUES ('chatpro', 'legacy-chatpro', 'ChatPro (Legacy)', 'active', true, 'https://api.chatpro.com.br') -- Placeholder URL
        RETURNING id INTO v_instance_id;
    END IF;

    -- Update existing messages that have no instance_id
    UPDATE public.whatsapp_messages
    SET instance_id = v_instance_id
    WHERE instance_id IS NULL;

    -- Create conversations for existing messages
    INSERT INTO public.whatsapp_conversations (contact_id, instance_id, last_message_at, created_at, updated_at)
    SELECT
        contact_id,
        v_instance_id,
        MAX(created_at),
        MIN(created_at),
        MAX(created_at)
    FROM public.whatsapp_messages
    WHERE contact_id IS NOT NULL AND instance_id = v_instance_id
    GROUP BY contact_id
    ON CONFLICT (contact_id, instance_id) DO NOTHING;

    -- Link messages to conversations
    UPDATE public.whatsapp_messages wm
    SET conversation_id = wc.id
    FROM public.whatsapp_conversations wc
    WHERE wm.contact_id = wc.contact_id
      AND wm.instance_id = wc.instance_id
      AND wm.conversation_id IS NULL;

END $$;
