-- ============================================
-- PHASE 1.4: Triggers & Automations
-- Functions for proposal status changes and token generation
-- ============================================

-- ============================================
-- Function: Generate unique public token
-- ============================================
CREATE OR REPLACE FUNCTION generate_proposal_public_token()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..12 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function: Handle proposal status changes
-- Creates activities in the CRM when status changes
-- ============================================
CREATE OR REPLACE FUNCTION handle_proposal_status_change()
RETURNS TRIGGER AS $$
DECLARE
    proposal_title TEXT;
    card_title TEXT;
BEGIN
    -- Get proposal title from active version
    SELECT pv.title INTO proposal_title
    FROM proposal_versions pv
    WHERE pv.id = NEW.active_version_id;
    
    -- Get card title
    SELECT c.titulo INTO card_title
    FROM cards c
    WHERE c.id = NEW.card_id;
    
    -- Handle different status transitions
    IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
        -- Proposal sent
        INSERT INTO activities (card_id, tipo, descricao, created_by)
        VALUES (
            NEW.card_id,
            'proposal_sent',
            'Proposta enviada: ' || COALESCE(proposal_title, 'Sem título'),
            NEW.created_by
        );
        
    ELSIF NEW.status = 'viewed' AND OLD.status = 'sent' THEN
        -- First view by client
        INSERT INTO activities (card_id, tipo, descricao)
        VALUES (
            NEW.card_id,
            'proposal_viewed',
            'Cliente visualizou proposta: ' || COALESCE(proposal_title, 'Sem título')
        );
        
    ELSIF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
        -- Proposal accepted
        INSERT INTO activities (card_id, tipo, descricao)
        VALUES (
            NEW.card_id,
            'proposal_accepted',
            'Cliente aceitou proposta: ' || COALESCE(proposal_title, 'Sem título')
        );
        
    ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        -- Proposal rejected
        INSERT INTO activities (card_id, tipo, descricao)
        VALUES (
            NEW.card_id,
            'proposal_rejected',
            'Cliente recusou proposta: ' || COALESCE(proposal_title, 'Sem título')
        );
        
    ELSIF NEW.status = 'expired' AND OLD.status != 'expired' THEN
        -- Proposal expired
        INSERT INTO activities (card_id, tipo, descricao)
        VALUES (
            NEW.card_id,
            'proposal_expired',
            'Proposta expirada: ' || COALESCE(proposal_title, 'Sem título')
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Trigger: On proposal status change
-- ============================================
DROP TRIGGER IF EXISTS on_proposal_status_change ON proposals;
CREATE TRIGGER on_proposal_status_change
    AFTER UPDATE ON proposals
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION handle_proposal_status_change();

-- ============================================
-- Function: Auto-generate public token on insert
-- ============================================
CREATE OR REPLACE FUNCTION auto_generate_proposal_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.public_token IS NULL THEN
        NEW.public_token := generate_proposal_public_token();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_generate_proposal_token_trigger ON proposals;
CREATE TRIGGER auto_generate_proposal_token_trigger
    BEFORE INSERT ON proposals
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_proposal_token();

-- ============================================
-- Function: Auto-expire proposals (to be called by cron)
-- ============================================
CREATE OR REPLACE FUNCTION auto_expire_proposals()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE proposals
    SET status = 'expired'
    WHERE status IN ('draft', 'sent', 'viewed', 'in_progress')
      AND expires_at IS NOT NULL
      AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Public access for proposal viewing (by token)
-- Allow anon users to SELECT proposals by public_token
-- ============================================
DROP POLICY IF EXISTS "Public can view proposals by token" ON proposals;
CREATE POLICY "Public can view proposals by token" ON proposals
    FOR SELECT TO anon
    USING (public_token IS NOT NULL);

-- Allow anon to view related versions
DROP POLICY IF EXISTS "Public can view proposal versions by token" ON proposal_versions;
CREATE POLICY "Public can view proposal versions by token" ON proposal_versions
    FOR SELECT TO anon
    USING (
        EXISTS (
            SELECT 1 FROM proposals p 
            WHERE p.id = proposal_versions.proposal_id 
            AND p.public_token IS NOT NULL
        )
    );

-- Allow anon to view related sections
DROP POLICY IF EXISTS "Public can view proposal sections" ON proposal_sections;
CREATE POLICY "Public can view proposal sections" ON proposal_sections
    FOR SELECT TO anon
    USING (
        EXISTS (
            SELECT 1 FROM proposal_versions pv
            JOIN proposals p ON p.id = pv.proposal_id
            WHERE pv.id = proposal_sections.version_id
            AND p.public_token IS NOT NULL
        )
    );

-- Allow anon to view related items
DROP POLICY IF EXISTS "Public can view proposal items" ON proposal_items;
CREATE POLICY "Public can view proposal items" ON proposal_items
    FOR SELECT TO anon
    USING (
        EXISTS (
            SELECT 1 FROM proposal_sections ps
            JOIN proposal_versions pv ON pv.id = ps.version_id
            JOIN proposals p ON p.id = pv.proposal_id
            WHERE ps.id = proposal_items.section_id
            AND p.public_token IS NOT NULL
        )
    );

-- Allow anon to view related options
DROP POLICY IF EXISTS "Public can view proposal options" ON proposal_options;
CREATE POLICY "Public can view proposal options" ON proposal_options
    FOR SELECT TO anon
    USING (
        EXISTS (
            SELECT 1 FROM proposal_items pi
            JOIN proposal_sections ps ON ps.id = pi.section_id
            JOIN proposal_versions pv ON pv.id = ps.version_id
            JOIN proposals p ON p.id = pv.proposal_id
            WHERE pi.id = proposal_options.item_id
            AND p.public_token IS NOT NULL
        )
    );
