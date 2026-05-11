-- Enable RLS on pipeline_stages (just in case)
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Policy for Admin Full Access
CREATE POLICY "Admin full access" ON pipeline_stages
    FOR ALL
    USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE role = 'admin'
        )
    )
    WITH CHECK (
        auth.uid() IN (
            SELECT id FROM profiles WHERE role = 'admin'
        )
    );
