-- Create debug_requests table to capture raw incoming data
CREATE TABLE IF NOT EXISTS public.debug_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    function_name TEXT,
    method TEXT,
    url TEXT,
    headers JSONB,
    payload JSONB
);

-- Enable RLS (though service role will usually handle this, it's good practice)
ALTER TABLE public.debug_requests ENABLE ROW LEVEL SECURITY;

-- Allow service role access (implicit, but documented here)
-- No public access by default.

COMMENT ON TABLE public.debug_requests IS 'Captured raw requests for debugging purposes. Stores payloads before any processing.';
