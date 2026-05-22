-- Adiciona campos editáveis em ai_agent_business_config que substituem trechos
-- hardcoded no texto canônico da Patricia (defaults/patricia_principles.ts e
-- defaults/patricia_data_update_rules.ts).
--
-- Decisões deslocadas pra UI/banco (admin pode editar sem deploy):
--   - empresa_stats_text: "Desde 2012, mais de 650 casamentos..."
--   - network_regions_text: "Caribe (Cancún, Punta Cana...), Maldivas..."
--   - destination_categories_text: "Caribe / Maldivas / Nordeste / Mendoza / Europa / Outro"
--   - brochure_policy_text: política de material/brochura pra enviar
--   - honorario_faixa_text: "R$ 4 mil a R$ 18 mil"
--
-- Tudo TEXT free-form pra admin escrever em linguagem natural.
-- Quando NULL, o router usa default hardcoded como fallback (em
-- supabase/functions/ai-agent-router-v2/index.ts).
--
-- Wedding Planner já é resolvida via ai_agents.wedding_planner_profile_id
-- (FK profiles) — não precisa coluna nova.

ALTER TABLE ai_agent_business_config
  ADD COLUMN IF NOT EXISTS empresa_stats_text TEXT,
  ADD COLUMN IF NOT EXISTS network_regions_text TEXT,
  ADD COLUMN IF NOT EXISTS destination_categories_text TEXT,
  ADD COLUMN IF NOT EXISTS brochure_policy_text TEXT,
  ADD COLUMN IF NOT EXISTS honorario_faixa_text TEXT;

-- Seed Patricia com valores que estavam no texto canônico (preserva paridade
-- com o prompt antes desta migration).
UPDATE ai_agent_business_config
SET
  empresa_stats_text = COALESCE(
    empresa_stats_text,
    'Desde 2012, mais de 650 casamentos realizados em mais de 20 países. 5 prêmios consecutivos como melhor produtora de Destination Wedding da América Latina.'
  ),
  network_regions_text = COALESCE(
    network_regions_text,
    'Caribe (Cancún, Punta Cana, Tulum, Riviera Maya), Maldivas, Nordeste brasileiro (Trancoso, Jericoacoara, Fernando de Noronha, Praia do Forte), Mendoza/Argentina, e Europa selecionada (Portugal, Itália, Espanha, Grécia).'
  ),
  destination_categories_text = COALESCE(
    destination_categories_text,
    'Caribe / Maldivas / Nordeste / Mendoza / Europa / Outro'
  ),
  brochure_policy_text = COALESCE(
    brochure_policy_text,
    'A Welcome não tem material informativo / brochura / guia pra eu enviar pro lead. NUNCA prometo "vou te mandar um guia", "vou te enviar um material", "te encaminho uma brochura". No desfecho não qualificado, encerro com honestidade direta — sem promessa de envio.'
  ),
  honorario_faixa_text = COALESCE(
    honorario_faixa_text,
    'R$ 4 mil a R$ 18 mil'
  )
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

COMMENT ON COLUMN ai_agent_business_config.empresa_stats_text IS
  'Texto livre com stats da empresa (ano de fundação, casamentos realizados, prêmios). Substitui {empresa_stats} no prompt.';
COMMENT ON COLUMN ai_agent_business_config.network_regions_text IS
  'Texto livre com regiões da rede própria forte. Substitui {network_regions} no prompt.';
COMMENT ON COLUMN ai_agent_business_config.destination_categories_text IS
  'Categorias canônicas do campo ww_destino. Substitui {destination_categories} nas regras de gravação.';
COMMENT ON COLUMN ai_agent_business_config.brochure_policy_text IS
  'Política de material/brochura. Substitui {brochure_policy} no prompt. Admin escreve "não temos" ou explica como mandar.';
COMMENT ON COLUMN ai_agent_business_config.honorario_faixa_text IS
  'Faixa de honorário da assessoria (texto curto). Substitui {honorario_faixa} no prompt.';
