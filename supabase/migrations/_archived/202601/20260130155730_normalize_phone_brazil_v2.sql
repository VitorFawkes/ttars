-- Phone normalization function for Brazilian phone numbers
-- Removes the country code (55) if present and strips all non-numeric characters

CREATE OR REPLACE FUNCTION normalize_phone_brazil(phone_number text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_normalized text;
BEGIN
    -- Remove all non-digit characters
    v_normalized := regexp_replace(phone_number, '\D', '', 'g');

    -- If starts with 55 and has 12-13 digits total (55 + 10-11 digit Brazilian number), remove the 55
    IF v_normalized ~ '^55\d{10,11}$' THEN
        v_normalized := substring(v_normalized from 3);
    END IF;

    RETURN v_normalized;
END;
$$;
