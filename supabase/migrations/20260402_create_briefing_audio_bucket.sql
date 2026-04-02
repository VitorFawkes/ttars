-- Criar bucket para armazenar áudios de briefing
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'briefing-audio',
  'briefing-audio',
  false,
  26214400, -- 25MB (limite do Whisper API)
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/x-m4a']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: qualquer usuário autenticado pode fazer upload (INSERT)
CREATE POLICY "Authenticated users can upload briefing audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'briefing-audio');

-- RLS: qualquer usuário autenticado pode ler (SELECT) — admins verão no feed
CREATE POLICY "Authenticated users can read briefing audio"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'briefing-audio');

-- RLS: service_role pode deletar (para limpeza futura se necessário)
CREATE POLICY "Service role can delete briefing audio"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'briefing-audio');
