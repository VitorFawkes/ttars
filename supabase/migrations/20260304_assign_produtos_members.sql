-- Atribui produto aos membros do time baseado na área de atuação
-- Kissia = TRIPS, demais NULL → WEDDING
-- Admins (Cyntya, Vitor, mateus) ficam com NULL (veem tudo)

BEGIN;

-- Kissia Kamily Monteiro Carvalho → TRIPS
UPDATE profiles
SET produtos = ARRAY['TRIPS']::app_product[]
WHERE id = 'a5dcf446-6e91-4a55-a11d-6b3b855ef381'
  AND (produtos IS NULL OR produtos = '{}');

-- 14 membros → WEDDING
UPDATE profiles
SET produtos = ARRAY['WEDDING']::app_product[]
WHERE id IN (
  '68284f74-4b38-4bb8-9b7c-fe123e6c8edb', -- Bianca Borges Gaveliki
  'f3b8a134-f92f-4215-9635-7093c9452c06', -- Carla Corte Xavier Flor
  '033eed39-9cad-41eb-8bb7-ce4e7d65c0d9', -- Maria Eduarda Monteiro Braga
  '82e2dfe6-5436-4087-b45d-3d4b4938dae5', -- Mariana Ressetti Volpi
  '491299a2-4061-4e44-89fa-67584b575966', -- Mariana Rosales Mocochinski
  '7f351ebf-206a-4904-ba85-23ac85d06f50', -- Michelly Straub Rufino Blenski
  '10665faa-2417-41ea-99c5-389e24a2dc88', -- Nara Elaine da Silva Chaves
  'd5578f8f-32b3-4bcd-84fa-ddac4a398ac2', -- Raphaela Louise dos Santos
  'ff560001-eae6-4467-a996-ceafcdc67153', -- Renata Lazzari Bastos de Souza
  '0037915f-fdb8-48bf-b31e-207788878b5e', -- Silvia Santana Gato
  'ebdfdfa6-1fa9-4f56-835f-707088f681d5', -- Sofia Sant Anna de Faria
  '7c896c4a-ca7a-4210-82f3-7b2f9ac37a77', -- Sofia de Lima Furtado
  '59e9cce7-c429-45ac-b4c8-ce28237748c3', -- Tiago de Mello Abdul Hak
  '65828bea-cc5a-472f-a3b6-db9f7d2d11f3'  -- Vanessa Becker
)
AND (produtos IS NULL OR produtos = '{}');

COMMIT;
