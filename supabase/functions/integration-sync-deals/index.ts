import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Fetch deals from ActiveCampaign API with pagination.
 * Filters by pipeline (6 = Wedding, 8 = Trips).
 * Date filters use ISO format and filter by cdate (created) or mdate (modified).
 */
async function fetchDeals(
    baseUrl: string,
    apiKey: string,
    pipelineId: string,
    limit: number = 100,
    dealId?: string,
    ownerId?: string,
    dateFrom?: string,
    dateTo?: string,
    dateField: 'cdate' | 'mdate' = 'mdate'
): Promise<any[]> {
    const allDeals: any[] = [];
    let offset = 0;

    // If specific deal ID requested, fetch just that one
    if (dealId) {
        const url = `${baseUrl}/api/3/deals/${dealId}?include=contact`;
        const res = await fetch(url, {
            headers: { 'Api-Token': apiKey }
        });

        if (!res.ok) {
            // If 404, just return empty
            if (res.status === 404) return [];
            throw new Error(`AC API error: ${res.status} - ${await res.text()}`);
        }

        const data = await res.json();
        // AC returns { deal: { ... } } for single fetch, but we need to normalize it
        // Note: 'include=contact' might return side-loaded data in 'contacts' array
        // We need to merge it manually if so.
        // However, for simplicity in this script, let's stick to the list endpoint with filter if possible,
        // OR handle the single response structure.
        // The list endpoint supports filters[id]. Let's use that for consistency.
    }

    while (true) {
        let url = `${baseUrl}/api/3/deals?filters[pipeline]=${pipelineId}&limit=${limit}&offset=${offset}&orders[cdate]=DESC&include=dealCustomFieldData,contact,contact.fieldValues`;

        if (dealId) {
            url = `${baseUrl}/api/3/deals?filters[id]=${dealId}&include=dealCustomFieldData,contact,contact.fieldValues`;
        } else if (ownerId) {
            url += `&filters[owner]=${ownerId}`;
        }

        // Add date range filters (AC uses YYYY-MM-DD format)
        // Map 'cdate' -> 'created' and 'mdate' -> 'updated'
        const filterPrefix = dateField === 'cdate' ? 'created' : 'updated';

        if (dateFrom) {
            url += `&filters[${filterPrefix}_after]=${dateFrom}`;
        }
        if (dateTo) {
            url += `&filters[${filterPrefix}_before]=${dateTo}`;
        }

        const res = await fetch(url, {
            headers: { 'Api-Token': apiKey }
        });

        if (!res.ok) {
            throw new Error(`AC API error: ${res.status} - ${await res.text()}`);
        }

        const data = await res.json();
        const deals = data.deals || [];
        const contacts = data.contacts || [];
        const fieldValues = data.fieldValues || [];
        const dealCustomFieldData = data.dealCustomFieldData || [];

        // Merge contact data and deal custom fields into deals if side-loaded
        const enrichedDeals = deals.map((deal: any) => {
            // Merge contact data
            if (deal.contact) {
                const contactId = deal.contact; // often just an ID string
                const contactObj = contacts.find((c: any) => c.id === contactId);
                if (contactObj) {
                    // Merge fieldValues into contactObj
                    const myFields = fieldValues.filter((fv: any) => fv.contact === contactId);
                    const fieldsMap: Record<string, any> = {};
                    myFields.forEach((fv: any) => {
                        fieldsMap[fv.field] = fv.value;
                    });
                    contactObj.fields = fieldsMap;

                    deal.contact = contactObj; // Replace ID with full object
                }
            }

            // Merge deal custom field data (side-loaded from AC API)
            // AC returns: { deal_id, dealCustomFieldMetum (field ID), custom_field_text_value, ... }
            const myDealFields = dealCustomFieldData.filter((dcf: any) => dcf.deal_id === deal.id || dcf.deal === deal.id);
            if (myDealFields.length > 0) {
                deal.customFieldData = myDealFields.map((dcf: any) => ({
                    id: dcf.dealCustomFieldMetum || dcf.custom_field_id,
                    value: dcf.custom_field_text_value || dcf.custom_field_number_value || dcf.custom_field_currency_value || dcf.custom_field_date_value || ''
                })).filter((f: any) => f.value !== '' && f.value !== null);
            }

            return deal;
        });

        allDeals.push(...enrichedDeals);

        console.log(`Fetched ${deals.length} deals from pipeline ${pipelineId}, offset ${offset}`);

        // If specific deal, we are done
        if (dealId) break;

        if (deals.length < limit) break;
        offset += limit;

        // Safety limit - only fetch up to 500 to prevent timeout
        if (offset > 400) {
            console.log('Reached safety limit of 500 deals');
            break;
        }
    }
    return allDeals;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // Security Check: Verify Cron Secret
    const cronSecretHeader = req.headers.get('x-cron-secret');
    const url = new URL(req.url);
    const cronSecretQuery = url.searchParams.get('secret');

    const providedSecret = cronSecretHeader || cronSecretQuery;
    const expectedSecret = Deno.env.get('CRON_SECRET');

    // Allow if secret matches OR if request is authenticated (User context)
    // We trust the Authorization header because verify_jwt=true is enforced at deployment
    const authHeader = req.headers.get('Authorization');
    const isAuthorizedUser = !!authHeader;

    if (expectedSecret && providedSecret !== expectedSecret && !isAuthorizedUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
        });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Parse body for options
        let body: {
            pipeline_id?: string;
            limit?: number;
            force_update?: boolean;
            deal_id?: string;
            owner_id?: string;
            date_from?: string;    // YYYY-MM-DD format
            date_to?: string;      // YYYY-MM-DD format
            date_field?: 'cdate' | 'mdate';  // cdate = created, mdate = modified (default)
        } = {};
        try {
            body = await req.json();
        } catch (_e) {
            // Body might be empty
        }

        // Default to pipeline 8 (Trips) if not specified
        const pipelineId = body.pipeline_id || '8';
        const fetchLimit = body.limit || 100;
        const forceUpdate = body.force_update || false;
        const specificDealId = body.deal_id;
        const ownerId = body.owner_id;
        const dateFrom = body.date_from;
        const dateTo = body.date_to;
        const dateField = body.date_field || 'mdate';

        // Get AC credentials
        const { data: settings } = await supabase
            .from('integration_settings')
            .select('key, value')
            .in('key', ['ACTIVECAMPAIGN_API_URL', 'ACTIVECAMPAIGN_API_KEY']);

        const AC_API_URL = settings?.find((s: { key: string; value: string }) => s.key === 'ACTIVECAMPAIGN_API_URL')?.value;
        const AC_API_KEY = settings?.find((s: { key: string; value: string }) => s.key === 'ACTIVECAMPAIGN_API_KEY')?.value;

        if (!AC_API_URL || !AC_API_KEY) {
            throw new Error('AC credentials not found in integration_settings');
        }

        // Get integration ID - use maybeSingle to avoid throwing
        const { data: integration, error: integrationError } = await supabase
            .from('integrations')
            .select('id')
            .eq('provider', 'active_campaign')
            .limit(1)
            .maybeSingle();

        if (integrationError) {
            throw new Error(`Failed to fetch integration: ${integrationError.message}`);
        }

        if (!integration?.id) {
            throw new Error('No AC integration found in database');
        }

        // Fetch deals from AC (limited for performance)
        const deals = await fetchDeals(
            AC_API_URL,
            AC_API_KEY,
            pipelineId,
            fetchLimit,
            specificDealId,
            ownerId,
            dateFrom,
            dateTo,
            dateField
        );

        if (deals.length === 0) {
            return new Response(JSON.stringify({
                pipeline_id: pipelineId,
                deals_fetched: 0,
                already_synced: 0,
                new_events_created: 0,
                error: null
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // Process in batches of 50 to avoid large IN() query issues
        const BATCH_SIZE = 50;
        let totalInserted = 0;
        let totalSkipped = 0;
        let lastError = null;
        const allInsertedIds: string[] = [];

        for (let i = 0; i < deals.length; i += BATCH_SIZE) {
            const batchDeals = deals.slice(i, i + BATCH_SIZE);

            // Build idempotency keys for this batch
            // If force_update is true, append timestamp to make it unique
            const timestamp = forceUpdate ? `_${Date.now()}` : '';
            const batchKeys = batchDeals.map(d => `sync_${d.id}_${pipelineId}${timestamp}`);

            // Check for existing events in this batch ONLY if NOT forcing update
            let existingKeySet = new Set<string>();

            if (!forceUpdate) {
                const { data: existingEvents } = await supabase
                    .from('integration_events')
                    .select('idempotency_key')
                    .in('idempotency_key', batchKeys);

                existingKeySet = new Set(existingEvents?.map(e => e.idempotency_key) || []);
                totalSkipped += existingKeySet.size;
            }

            // Filter out already synced deals (if not forced)
            const newDeals = batchDeals.filter(d => !existingKeySet.has(`sync_${d.id}_${pipelineId}`));

            if (newDeals.length === 0) continue;

            // Build events for insertion
            const events = newDeals.map(deal => ({
                integration_id: integration.id,
                status: 'pending',
                entity_type: 'deal',
                event_type: forceUpdate ? 'deal_update' : 'deal_add', // Use deal_update for forced syncs
                external_id: String(deal.id),
                payload: {
                    id: deal.id,
                    pipeline: pipelineId,
                    pipeline_id: pipelineId,
                    stage: deal.stage,
                    stage_id: deal.stage,
                    owner: deal.owner,
                    owner_id: deal.owner,
                    title: deal.title,
                    // AC API v3 returns deal.value in CENTS (1500000 = R$15,000)
                    // Convert to REAIS here so integration-process stores correctly
                    value: Math.round(Number(deal.value || 0)) / 100,
                    status: deal.status,
                    'deal[id]': deal.id,
                    'deal[title]': deal.title,
                    'deal[value]': Math.round(Number(deal.value || 0)) / 100,
                    'deal[status]': deal.status,
                    'deal[stageid]': deal.stage,
                    'deal[pipelineid]': pipelineId,
                    'deal[owner]': deal.owner,
                    'deal[contactid]': deal.contact?.id,  // Include contactid for proper contact linking
                    contactid: deal.contact?.id,          // Alternative format
                    contact_id: deal.contact?.id,         // Another alternative format
                    contact_email: deal.contact?.email,
                    contact_name: deal.contact?.firstName ? `${deal.contact.firstName} ${deal.contact.lastName || ''}`.trim() : undefined,
                    contact_phone: deal.contact?.phone,
                    // Pass contact fields explicitly for mapping
                    'contact[id]': deal.contact?.id,
                    'contact[email]': deal.contact?.email,
                    'contact[first_name]': deal.contact?.firstName,
                    'contact[last_name]': deal.contact?.lastName,
                    'contact[phone]': deal.contact?.phone,
                    // Flatten contact custom fields for mapping
                    ...(deal.contact?.fields ? Object.entries(deal.contact.fields).reduce((acc, [k, v]) => ({
                        ...acc,
                        [`contact[fields][${k}]`]: v
                    }), {}) : {}),
                    // Flatten deal custom fields for mapping (from dealCustomFieldData side-load)
                    // Format matches webhook format: deal[fields][INDEX][id] and deal[fields][INDEX][value]
                    ...(deal.customFieldData ? deal.customFieldData.reduce((acc: Record<string, any>, cf: any, idx: number) => ({
                        ...acc,
                        [`deal[fields][${idx}][id]`]: cf.id,
                        [`deal[fields][${idx}][value]`]: cf.value,
                        [`deal[fields][${idx}][key]`]: `field_${cf.id}`
                    }), {}) : {}),
                    // AC deal dates (for correct created_at on cards)
                    cdate: deal.cdate,
                    'deal[create_date]': deal.cdate,
                    import_mode: 'sync',
                    force_update: forceUpdate,
                    synced_at: new Date().toISOString()
                },
                processing_log: `Synced from AC API (Pipeline ${pipelineId}) - Force: ${forceUpdate}`,
                idempotency_key: `sync_${deal.id}_${pipelineId}${timestamp}`
            }));

            // Insert batch
            const { data: insertedEvents, error } = await supabase
                .from('integration_events')
                .insert(events)
                .select('id');

            if (error) {
                console.error(`Batch ${Math.floor(i / BATCH_SIZE)} insert error:`, error.message);
                lastError = error.message;
            } else {
                totalInserted += events.length;
                if (insertedEvents) {
                    insertedEvents.forEach(e => allInsertedIds.push(e.id));
                }
            }

            console.log(`Batch ${Math.floor(i / BATCH_SIZE)}: ${newDeals.length} new, ${existingKeySet.size} skipped`);
        }

        // AUTO-PROCESS: Trigger integration-process to handle the created events
        // Process in chunks to avoid timeout and ensure all events are handled
        let processedCount = 0;
        let processError = null;
        const PROCESS_CHUNK_SIZE = 50;

        if (totalInserted > 0) {
            const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
            const totalChunks = Math.ceil(allInsertedIds.length / PROCESS_CHUNK_SIZE);
            console.log(`Processing ${allInsertedIds.length} events in ${totalChunks} chunks`);

            for (let i = 0; i < allInsertedIds.length; i += PROCESS_CHUNK_SIZE) {
                const chunk = allInsertedIds.slice(i, i + PROCESS_CHUNK_SIZE);
                const chunkNum = Math.floor(i / PROCESS_CHUNK_SIZE) + 1;

                try {
                    const { data: processResult, error: invokeError } = await supabase.functions.invoke('integration-process', {
                        body: {
                            integration_id: integration.id,
                            event_ids: chunk
                        },
                        headers: {
                            'x-internal-secret': cronSecret
                        }
                    });

                    if (invokeError) {
                        // Capture full error details including response body
                        let errorDetail = invokeError.message;
                        try {
                            if (processResult) errorDetail += ` | data: ${JSON.stringify(processResult)}`;
                        } catch (_) {}
                        console.error(`Chunk ${chunkNum}/${totalChunks} failed:`, errorDetail);
                        if (!processError) processError = `Chunk ${chunkNum}: ${errorDetail}`;
                    } else {
                        const chunkProcessed = processResult?.stats?.updated || 0;
                        processedCount += chunkProcessed;
                        console.log(`Chunk ${chunkNum}/${totalChunks}: ${chunkProcessed} processed`);
                    }
                } catch (procErr: unknown) {
                    const msg = procErr instanceof Error ? procErr.message : String(procErr);
                    console.error(`Chunk ${chunkNum}/${totalChunks} error:`, msg);
                    if (!processError) processError = msg;
                }
            }

            console.log(`Auto-process completed: ${processedCount}/${allInsertedIds.length} events processed`);

            // Verify actual event status if invoke reported errors (transient HTTP errors may mask success)
            if (processError && allInsertedIds.length > 0) {
                const { data: verifiedEvents } = await supabase
                    .from('integration_events')
                    .select('status')
                    .in('id', allInsertedIds);

                if (verifiedEvents) {
                    const actualProcessed = verifiedEvents.filter(e => e.status === 'processed').length;
                    if (actualProcessed === allInsertedIds.length) {
                        console.log(`Post-verification: all ${actualProcessed} events processed despite invoke error. Clearing transient error.`);
                        processError = null;
                        processedCount = actualProcessed;
                    } else if (actualProcessed > processedCount) {
                        console.log(`Post-verification: ${actualProcessed}/${allInsertedIds.length} events actually processed (invoke reported ${processedCount})`);
                        processedCount = actualProcessed;
                        const pending = verifiedEvents.filter(e => e.status === 'pending').length;
                        const failed = verifiedEvents.filter(e => e.status === 'failed').length;
                        if (pending > 0 || failed > 0) {
                            processError = `${failed} falharam, ${pending} pendentes (de ${allInsertedIds.length} total)`;
                        }
                    }
                }
            }
        }

        return new Response(JSON.stringify({
            pipeline_id: pipelineId,
            deals_fetched: deals.length,
            already_synced: totalSkipped,
            new_events_created: totalInserted,
            events_processed: processedCount,
            error: lastError,
            process_error: processError
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: lastError && totalInserted === 0 ? 400 : 200,
        });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Sync deals error:', msg);
        return new Response(JSON.stringify({ error: msg }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
