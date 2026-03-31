-- Mapeamento de Planners: AC owner ID → CRM profile UUID
-- Todos os membros do time Planner com conta no Active Campaign
-- Integration ID: a2141b92-561f-4514-92b4-9412a068d236 (compartilhada Trips+Wedding)
--
-- Cruzados por email entre profiles (time Planner, 41 membros) e integration_catalog
-- Estado anterior: apenas AC 50 (Julia Jardim) e AC 56 (Vitor Gambetti) mapeados
-- Impacto: novos leads do AC com esses owners passarão a receber vendas_owner_id preenchido

INSERT INTO public.integration_user_map
  (integration_id, external_user_id, internal_user_id, label, direction)
VALUES
  ('a2141b92-561f-4514-92b4-9412a068d236', '16', '59e9cce7-c429-45ac-b4c8-ce28237748c3', 'Tiago de Mello Abdul Hak',         'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '18', '7f351ebf-206a-4904-ba85-23ac85d06f50', 'Michelly Straub Rufino Blenski',    'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '20', '738cb633-534a-4616-8c1a-193f8f3cbdfd', 'Simone Grochevits',                'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '21', 'b2e437ec-721e-4c5d-98ba-ee3275988e9f', 'Camila Montanhini Seixas',         'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '23', 'a08c16a9-b876-4a42-b705-2abaf3ea9220', 'Daniele Adamo',                    'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '24', 'dc2bbd1e-aa00-493f-ba0d-bd5190a7a650', 'Juliana Santana Silva',            'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '28', 'd5578f8f-32b3-4bcd-84fa-ddac4a398ac2', 'Raphaela Louise dos Santos',      'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '46', 'a44458dd-839d-4612-b152-fce18ee3e76f', 'Guilherme Jetka',                  'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '47', 'a5dcf446-6e91-4a55-a11d-6b3b855ef381', 'Kissia Kamily Monteiro Carvalho', 'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '51', 'f3b8a134-f92f-4215-9635-7093c9452c06', 'Carla Corte Xavier Flor',          'inbound'),
  ('a2141b92-561f-4514-92b4-9412a068d236', '55', 'f3c7ccd6-3038-469b-be5c-39a324ca64bc', 'Ana Carolina Kuss',                'inbound')
ON CONFLICT (integration_id, external_user_id)
  DO UPDATE SET internal_user_id = EXCLUDED.internal_user_id,
                label            = EXCLUDED.label,
                updated_at       = now();
