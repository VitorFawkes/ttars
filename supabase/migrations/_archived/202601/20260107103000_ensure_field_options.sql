-- Migration to ensure 'options' column in 'system_fields' is JSONB
-- This is critical for the new Multiselect and Select field handling

DO $$
BEGIN
    -- Check if the column exists and is not JSONB (e.g. if it was text)
    -- If it's text, we try to cast it. If it doesn't exist, we add it.
    
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'system_fields' 
        AND column_name = 'options'
    ) THEN
        -- Column exists. Check type.
        IF (
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'system_fields' 
            AND column_name = 'options'
        ) != 'jsonb' THEN
            -- Attempt to convert to JSONB. 
            -- We use a safe cast that treats invalid JSON as empty array or null if possible, 
            -- but for safety we might just want to alter it using USING.
            ALTER TABLE system_fields 
            ALTER COLUMN options TYPE JSONB 
            USING options::jsonb;
        END IF;
    ELSE
        -- Column does not exist, add it.
        ALTER TABLE system_fields 
        ADD COLUMN options JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Ensure it has a default of empty array if null
    ALTER TABLE system_fields 
    ALTER COLUMN options SET DEFAULT '[]'::jsonb;

END $$;
