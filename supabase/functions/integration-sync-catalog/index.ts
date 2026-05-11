import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Fetch ALL pages from ActiveCampaign API with pagination.
 * Simplified version - only syncs custom fields (fastest).
 */
async function fetchDealFields(
    baseUrl: string,
    apiKey: string
): Promise<{ id: string; fieldLabel: string }[]> {
    const allFields: { id: string; fieldLabel: string }[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
        const res = await fetch(`${baseUrl}/api/3/dealCustomFieldMeta?limit=${limit}&offset=${offset}`, {
            headers: { 'Api-Token': apiKey }
        });

        if (!res.ok) {
            throw new Error(`AC API error (Deals): ${res.status}`);
        }

        const data = await res.json();
        const fields = data.dealCustomFieldMeta || [];
        allFields.push(...fields);

        if (fields.length < limit) break;
        offset += limit;
    }
    return allFields;
}

async function fetchContactFields(
    baseUrl: string,
    apiKey: string
): Promise<{ id: string; title: string }[]> {
    const allFields: { id: string; title: string }[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
        const res = await fetch(`${baseUrl}/api/3/fields?limit=${limit}&offset=${offset}`, {
            headers: { 'Api-Token': apiKey }
        });

        if (!res.ok) {
            throw new Error(`AC API error (Contacts): ${res.status}`);
        }

        const data = await res.json();
        const fields = data.fields || [];
        allFields.push(...fields);

        if (fields.length < limit) break;
        offset += limit;
    }
    return allFields;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Get AC credentials
        const { data: settings } = await supabase
            .from('integration_settings')
            .select('key, value')
            .in('key', ['ACTIVECAMPAIGN_API_URL', 'ACTIVECAMPAIGN_API_KEY']);

        const AC_API_URL = settings?.find((s: { key: string; value: string }) => s.key === 'ACTIVECAMPAIGN_API_URL')?.value;
        const AC_API_KEY = settings?.find((s: { key: string; value: string }) => s.key === 'ACTIVECAMPAIGN_API_KEY')?.value;

        if (!AC_API_URL || !AC_API_KEY) {
            throw new Error('AC credentials not found');
        }

        // Get integration ID
        const { data: integration } = await supabase
            .from('integrations')
            .select('id')
            .eq('provider', 'active_campaign')
            .limit(1)
            .single();

        if (!integration?.id) {
            throw new Error('No AC integration found');
        }

        // Fetch Deal fields
        const dealFields = await fetchDealFields(AC_API_URL, AC_API_KEY);

        // Fetch Contact fields
        const contactFields = await fetchContactFields(AC_API_URL, AC_API_KEY);

        // Batch upsert
        const entries = [
            ...dealFields.map(f => ({
                integration_id: integration.id,
                entity_type: 'field', // or 'deal_field' if we want to distinguish
                external_id: f.id,
                external_name: f.fieldLabel,
                parent_external_id: '',
                metadata: { ...f, type: 'deal' }
            })),
            ...contactFields.map(f => ({
                integration_id: integration.id,
                entity_type: 'field',
                external_id: `contact[fields][${f.id}]`, // Prefix to match mapping logic
                external_name: `${f.title} (Contact)`,
                parent_external_id: '',
                metadata: { ...f, type: 'contact' }
            }))
        ];

        const { error } = await supabase
            .from('integration_catalog')
            .upsert(entries, { onConflict: 'integration_id,entity_type,external_id,parent_external_id' });

        return new Response(JSON.stringify({
            fields_synced: entries.length,
            error: error?.message
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: error ? 400 : 200,
        });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: msg }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
