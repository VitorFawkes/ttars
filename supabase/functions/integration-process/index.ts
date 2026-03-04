import { createClient } from 'jsr:@supabase/supabase-js@2'
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // Authentication: Accept EITHER service role key OR authenticated admin user
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    let isAuthorized = false;
    let authMethod = '';

    // Method 0: Internal processing bypass (for webhook-ingest fire-and-forget)
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (internalSecret && expectedSecret && internalSecret === expectedSecret) {
        isAuthorized = true;
        authMethod = 'internal';
    }

    // Method 1: Service Role Key - decode JWT and check role claim
    const tokenFromHeader = authHeader?.replace('Bearer ', '');
    if (!isAuthorized && tokenFromHeader) {
        try {
            // Decode JWT payload (base64)
            const payloadBase64 = tokenFromHeader.split('.')[1];
            if (payloadBase64) {
                const payload = JSON.parse(atob(payloadBase64));
                if (payload.role === 'service_role') {
                    isAuthorized = true;
                    authMethod = 'service_role_jwt';
                }
            }
        } catch (e) {
            console.error('JWT decode error:', e);
        }
    }

    // Method 1b: Also accept exact match (backward compat)
    if (!isAuthorized && authHeader === `Bearer ${serviceRoleKey}`) {
        isAuthorized = true;
        authMethod = 'service_role_exact';
    }

    // Method 2: Authenticated user with admin role (for frontend calls)
    if (!isAuthorized && authHeader) {
        try {
            const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
            const { data: { user }, error } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));

            if (user && !error) {
                // Check if user has admin or gestor role
                const serviceClient = createClient(supabaseUrl, serviceRoleKey ?? '');
                const { data: profile } = await serviceClient
                    .from('profiles')
                    .select('role_id, roles(name)')
                    .eq('id', user.id)
                    .single();

                const roleName = (profile?.roles as any)?.name;
                if (roleName && ['admin', 'gestor', 'superadmin'].includes(roleName)) {
                    isAuthorized = true;
                    authMethod = `user:${roleName}`;
                }
            }
        } catch (e) {
            console.error('Auth check error:', e);
        }
    }

    if (!isAuthorized) {
        console.error('Unauthorized access attempt to integration-process');
        return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    console.log(`integration-process called via ${authMethod}`);

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Helper to update event status
        const updateEventStatus = async (
            eventId: string,
            status: string,
            log: string,
            triggerId?: string | null,
            retryInfo?: { attempts: number; next_retry_at: string | null }
        ) => {
            const update: Record<string, unknown> = {
                status,
                processing_log: log,
                processed_at: new Date().toISOString()
            };
            if (triggerId !== undefined) {
                update.matched_trigger_id = triggerId;
            }
            if (retryInfo) {
                update.attempts = retryInfo.attempts;
                update.next_retry_at = retryInfo.next_retry_at;
            }
            const { error } = await supabase
                .from('integration_events')
                .update(update)
                .eq('id', eventId);
            return error;
        }

        // Errors that should NOT be retried (need config fix, not retry)
        const isRetryableError = (message: string): boolean => {
            const permanentErrors = ['Unmapped Stage', 'Topology Error', 'Integration not found'];
            return !permanentErrors.some(pe => message.includes(pe));
        };

        // Direct Postgres connection for card updates (loop prevention)
        // SET LOCAL app.update_source = 'integration' prevents the outbound trigger from firing
        const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
        const pgSql = databaseUrl ? postgres(databaseUrl, { ssl: 'require' }) : null;

        const updateCardSafe = async (cardId: string, payload: Record<string, any>) => {
            if (!pgSql) {
                console.warn('[integration-process] SUPABASE_DB_URL not set, using REST (loop prevention disabled)');
                const { error } = await supabase.from('cards').update(payload).eq('id', cardId);
                if (error) throw new Error(`Card Update Error: ${error.message}`);
                return;
            }
            const columns = Object.keys(payload);
            await pgSql.begin(async (tx: any) => {
                await tx`SELECT set_config('app.update_source', 'integration', true)`;
                await tx`UPDATE cards SET ${pgSql(payload, columns)} WHERE id = ${cardId}::uuid`;
            });
        };

        // Parse body
        let body: Record<string, any> = {};
        try {
            body = await req.json();
        } catch (_e) {
            // Body might be empty
        }
        const { integration_id, event_ids } = body;

        // 0. Fetch Settings
        const { data: settings } = await supabase
            .from('integration_settings')
            .select('key, value')
            .in('key', ['SHADOW_MODE_ENABLED', 'WRITE_MODE_ENABLED', 'ALLOWED_EVENT_TYPES']);

        const shadowModeSetting = settings?.find(s => s.key === 'SHADOW_MODE_ENABLED')?.value === 'true';
        const writeModeSetting = settings?.find(s => s.key === 'WRITE_MODE_ENABLED')?.value;
        const allowedEventTypesSetting = settings?.find(s => s.key === 'ALLOWED_EVENT_TYPES')?.value;
        const allowedEventTypes = allowedEventTypesSetting ? allowedEventTypesSetting.split(',').map((t: string) => t.trim()) : ['deal_add', 'deal_update', 'deal_state'];
        // FIX: Default to WRITE mode. Shadow only if EXPLICITLY enabled or writes EXPLICITLY disabled.
        // Before: !writeModeSetting caused shadow mode when setting didn't exist in DB
        const isShadowMode = shadowModeSetting || writeModeSetting === 'false';
        console.log(`[integration-process] Mode: ${isShadowMode ? 'SHADOW' : 'WRITE'} (shadow=${shadowModeSetting}, write=${writeModeSetting || 'not_set'})`);

        // 1. Fetch Events to Process
        let query = supabase
            .from('integration_events')
            .select('*')
            .order('created_at', { ascending: true });

        // If specific event IDs provided, fetch those (any status) without limit;
        // otherwise fetch pending with limit of 50, respecting retry backoff
        if (event_ids && Array.isArray(event_ids) && event_ids.length > 0) {
            query = query.in('id', event_ids);
        } else {
            const now = new Date().toISOString();
            query = query.eq('status', 'pending')
                .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
                .limit(50);
        }

        if (integration_id) {
            query = query.eq('integration_id', integration_id);
        }

        const { data: events, error: fetchError } = await query;
        if (fetchError) throw fetchError

        const stats = {
            scanned: events?.length || 0,
            eligible: 0,
            updated: 0,
            blocked: 0,
            processed_shadow: 0,
            ignored: 0,
            ignored_by_trigger: 0,
            errors: 0,
            mode: isShadowMode ? 'SHADOW' : 'WRITE'
        };

        if (!events || events.length === 0) {
            return new Response(JSON.stringify({ message: 'No pending events found', stats }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // 2. Load Metadata (Pipelines, Stages, Maps)
        const { data: stageMappings } = await supabase.from('integration_stage_map').select('*');
        const { data: userMappings } = await supabase.from('integration_user_map').select('*');
        // Load field mappings WITH storage configuration (enterprise architecture)
        // storage_location: 'column' | 'produto_data' | 'marketing_data' | 'briefing_inicial'
        // db_column_name: actual column name when storage_location = 'column'
        // NOTE: Using select('*') - if new columns exist, they come automatically
        // If they don't exist yet, the fallback logic handles it gracefully
        const { data: fieldMappings } = await supabase
            .from('integration_field_map')
            .select('*')
            .eq('is_active', true);
        const { data: systemFields } = await supabase.from('system_fields').select('key, type, section');

        // Load Topology (include fase for SDR owner assignment, is_lost/is_won/is_planner_won for status routing, ordem/phase_id for anti-regression)
        const { data: pipelineStages } = await supabase.from('pipeline_stages').select('id, pipeline_id, nome, fase, is_lost, is_won, is_planner_won, ordem, phase_id');
        const { data: pipelines } = await supabase.from('pipelines').select('id, nome, produto');
        const { data: pipelinePhases } = await supabase.from('pipeline_phases').select('id, order_index');

        // Load Inbound Trigger Rules (for selective entity creation)
        const { data: inboundTriggers } = await supabase
            .from('integration_inbound_triggers')
            .select('*')
            .eq('is_active', true);

        // Helper: Parse flattened AC fields
        // AC webhook sends deal[fields] as a sequential array where:
        //   deal[fields][INDEX][key]   = field name
        //   deal[fields][INDEX][value] = field value
        //   deal[fields][INDEX][id]    = actual AC field ID (only for fields with set values)
        // We prefer [id] (real AC field ID) when available, fallback to INDEX for backward compat.
        const parseCustomFields = (payload: Record<string, any>) => {
            const fields: Record<string, any> = {};

            // Collect all unique field indices
            const indices = new Set<string>();
            Object.keys(payload).forEach(key => {
                const match = key.match(/^deal\[fields\]\[(\d+)\]/);
                if (match) indices.add(match[1]);
            });

            indices.forEach(idx => {
                const value = payload[`deal[fields][${idx}][value]`];
                const acFieldId = payload[`deal[fields][${idx}][id]`];

                if (value !== undefined) {
                    // Use real AC field ID when available, fall back to sequential index
                    const effectiveId = acFieldId || idx;
                    fields[effectiveId] = value;

                    // ALSO store by index for backward compat (if acFieldId differs from index)
                    if (acFieldId && acFieldId !== idx) {
                        fields[idx] = value;
                    }
                }
            });
            return fields;
        };

        // Helper: Resolve Topology
        const resolveTopology = (stageId: string) => {
            const stage = pipelineStages?.find(s => s.id === stageId);
            if (!stage) return null;

            const pipeline = pipelines?.find(p => p.id === stage.pipeline_id);
            if (!pipeline) return null;

            return {
                pipelineId: pipeline.id,
                pipelineName: pipeline.nome,
                produto: pipeline.produto,
                stageName: stage.nome,
                fase: (stage as Record<string, unknown>).fase || null  // Include fase for SDR owner assignment
            };
        };

        // Helper: Get stage position for ordering comparison (phase order_index + stage ordem)
        // Same pattern as CardHeader stage sorting logic (phase first, then ordem within phase)
        const UNLINKED_PHASE_ORDER = 999; // Stages without phase_id sort last (same as Resolução phase)
        const getStagePosition = (stageId: string): { phaseOrder: number; stageOrder: number } | null => {
            const stage = pipelineStages?.find(s => s.id === stageId);
            if (!stage) return null;
            const phase = pipelinePhases?.find(p => p.id === (stage as any).phase_id);
            return {
                phaseOrder: phase?.order_index ?? UNLINKED_PHASE_ORDER,
                stageOrder: (stage as any).ordem ?? 0
            };
        };

        // Helper: Check if currentStage is more advanced than targetStage
        const isStageMoreAdvanced = (currentStageId: string, targetStageId: string): boolean => {
            const currentPos = getStagePosition(currentStageId);
            const targetPos = getStagePosition(targetStageId);
            if (!currentPos || !targetPos) {
                console.warn(`[ANTI-REGRESSION] Cannot compare stages: current=${currentStageId}, target=${targetStageId}. Allowing update (fail-open).`);
                return false;
            }
            if (currentPos.phaseOrder !== targetPos.phaseOrder) {
                return currentPos.phaseOrder > targetPos.phaseOrder;
            }
            return currentPos.stageOrder > targetPos.stageOrder;
        };

        // Helper: Check if stage is terminal (won or lost)
        const isTerminalStage = (stageId: string): boolean => {
            const stage = pipelineStages?.find(s => s.id === stageId);
            if (!stage) return false;
            return (stage as any).is_lost === true || (stage as any).is_won === true;
        };

        // Helper: Map Status
        const mapStatus = (acStatus: string | number) => {
            const s = String(acStatus);
            if (s === '1') return 'ganho';
            if (s === '2') return 'perdido';
            return 'aberto';
        };

        // Helper: Check Inbound Trigger Rules
        // Returns trigger if matched, null if no match, or special object if no triggers configured
        // Now supports:
        // - Multi-select arrays for pipelines, stages, and owners
        // - NULL arrays meaning "any" (qualquer)
        // - action_type: 'create_only', 'update_only', 'all'
        const checkInboundTrigger = (
            integrationId: string,
            pipelineId: string,
            stageId: string,
            ownerId: string | null,
            eventType: string,
            entityType: string
        ): { allowed: boolean; reason: string; trigger: any | null } => {
            // Get triggers for this integration
            const triggers = inboundTriggers?.filter(t => t.integration_id === integrationId);

            // BACKWARD COMPAT: If no triggers configured, allow all events
            if (!triggers || triggers.length === 0) {
                return { allowed: true, reason: 'No trigger rules configured (allowing all)', trigger: null };
            }

            // Find matching trigger using array matching
            // NULL, empty array, or array with only empty strings = "qualquer" (match any)
            const filterValid = (arr: string[] | null | undefined) =>
                (arr || []).filter(id => id && id.trim() !== '');

            const matchingTrigger = triggers.find(t => {
                // Check pipeline match: NULL/empty = any, otherwise must be in array
                const validPipelines = filterValid(t.external_pipeline_ids);
                const pipelineMatch = validPipelines.length === 0
                    ? true  // "Qualquer Pipeline"
                    : validPipelines.includes(pipelineId);

                // Check stage match: NULL/empty = any, otherwise must be in array
                const validStages = filterValid(t.external_stage_ids);
                const stageMatch = validStages.length === 0
                    ? true  // "Qualquer Etapa"
                    : validStages.includes(stageId);

                // Check owner match: NULL/empty = any, otherwise must be in array
                const validOwners = filterValid(t.external_owner_ids);
                const ownerMatch = validOwners.length === 0
                    ? true  // "Qualquer Pessoa"
                    : ownerId && validOwners.includes(ownerId);

                // Check entity type
                const entityMatch = t.entity_types.includes(entityType === 'deal' ? 'deal' : 'contact');

                // Check action_type compatibility WITHIN the find criteria
                // This ensures create_only triggers don't steal matches from update_only triggers
                const actionType = t.action_type || 'all';
                const actionMatch = actionType === 'all'
                    || (actionType === 'create_only' && eventType === 'deal_add')
                    || (actionType === 'update_only' && eventType !== 'deal_add');

                return pipelineMatch && stageMatch && ownerMatch && entityMatch && actionMatch;
            });

            if (!matchingTrigger) {
                // FIX: When triggers ARE configured for this integration, treat them as an allowlist.
                // Events that don't match any trigger should be BLOCKED, not allowed.
                // This ensures rules like "create_only from Stage 42" are actually enforced.
                return {
                    allowed: false,
                    reason: `No trigger matched (Pipeline ${pipelineId}, Stage ${stageId}, Event ${eventType}${ownerId ? `, Owner ${ownerId}` : ''})`,
                    trigger: null
                };
            }

            return {
                allowed: true,
                reason: `Matched trigger: ${matchingTrigger.name || matchingTrigger.description || matchingTrigger.id}`,
                trigger: matchingTrigger
            };
        };

        // 3. Process Events
        const results: any[] = [];

        for (const event of events) {
            stats.eligible++;
            let log = '';
            let matchedTrigger: any = null;

            try {
                const payload = event.payload || {};
                const entity = event.entity_type;
                const importMode = payload.import_mode || 'replay';

                // ═══════════════════════════════════════════════════════════════════
                // CONTACT EVENT HANDLER
                // ═══════════════════════════════════════════════════════════════════
                if (entity === 'contact') {
                    const acContactId = payload['contact[id]'] || payload.contact_id || payload.id;
                    const firstName = payload['contact[first_name]'] || payload.first_name || '';
                    const lastName = payload['contact[last_name]'] || payload.last_name || '';
                    const email = payload['contact[email]'] || payload.email;
                    const phone = payload['contact[phone]'] || payload.phone;

                    // Use separate fields for nome and sobrenome
                    const nome = firstName.trim() || 'Sem Nome';
                    const sobrenome = lastName.trim() || null;

                    if (!acContactId) {
                        stats.ignored++;
                        await updateEventStatus(event.id, 'ignored', 'Contact event missing contact ID');
                        continue;
                    }

                    // Parse contact custom fields (contact[fields][ID] -> { ID: value })
                    const parseContactFields = (payload: Record<string, any>) => {
                        const fields: Record<string, any> = {};
                        Object.keys(payload).forEach(key => {
                            const match = key.match(/^contact\[fields\]\[(\d+)\]$/);
                            if (match) {
                                fields[`contact[fields][${match[1]}]`] = payload[key];
                            }
                        });
                        // Also add standard contact fields
                        if (payload['contact[email]']) fields['contact[email]'] = payload['contact[email]'];
                        if (payload['contact[phone]']) fields['contact[phone]'] = payload['contact[phone]'];
                        if (payload['contact[first_name]']) fields['contact[first_name]'] = payload['contact[first_name]'];
                        if (payload['contact[last_name]']) fields['contact[last_name]'] = payload['contact[last_name]'];
                        if (payload['contact[tags]']) fields['contact[tags]'] = payload['contact[tags]'];
                        return fields;
                    };

                    const contactFields = parseContactFields(payload);

                    // Get contact field mappings for this integration (entity_type = 'contact')
                    const contactFieldMappings = fieldMappings?.filter(m =>
                        m.entity_type === 'contact' &&
                        m.direction === 'inbound' &&
                        m.integration_id === event.integration_id
                    ) || [];

                    if (!isShadowMode) {
                        // Try to find existing contact by external_id OR email
                        let existingContact = null;
                        let contactCrmId: string | null = null;

                        const { data: byExternalId } = await supabase
                            .from('contatos')
                            .select('id')
                            .eq('external_id', String(acContactId))
                            .eq('external_source', 'active_campaign')
                            .single();

                        if (byExternalId) {
                            existingContact = byExternalId;
                            contactCrmId = byExternalId.id;
                        } else if (email) {
                            const { data: byEmail } = await supabase
                                .from('contatos')
                                .select('id')
                                .eq('email', email)
                                .single();
                            existingContact = byEmail;
                            contactCrmId = byEmail?.id || null;
                        }

                        // Tier 3: busca por telefone via matching robusto (variantes BR)
                        if (!existingContact && phone) {
                            const { data: byPhone } = await supabase
                                .rpc('find_contact_by_whatsapp', { p_phone: phone, p_convo_id: '' });
                            if (byPhone) {
                                existingContact = { id: byPhone };
                                contactCrmId = byPhone;
                            }
                        }

                        if (existingContact) {
                            const updatePayload: Record<string, any> = {
                                external_id: String(acContactId),
                                external_source: 'active_campaign',
                                updated_at: new Date().toISOString()
                            };
                            if (nome !== 'Sem Nome') updatePayload.nome = nome;
                            if (sobrenome) updatePayload.sobrenome = sobrenome;
                            if (phone) updatePayload.telefone = phone;

                            const { error: uErr } = await supabase
                                .from('contatos')
                                .update(updatePayload)
                                .eq('id', existingContact.id);

                            if (uErr) throw new Error(`Contact Update Error: ${uErr.message}`);
                            log = `Updated Contact ${existingContact.id} (AC ID: ${acContactId})`;
                        } else {
                            // Create new contact with AC external_id
                            const { data: newContact, error: cErr } = await supabase
                                .from('contatos')
                                .insert({
                                    nome: nome,
                                    sobrenome: sobrenome,
                                    email: email,
                                    telefone: phone,
                                    external_id: String(acContactId),
                                    external_source: 'active_campaign',
                                    tags: ['active_campaign'],
                                    tipo_pessoa: 'adulto'
                                })
                                .select('id')
                                .single();

                            if (cErr) throw new Error(`Contact Create Error: ${cErr.message}`);
                            contactCrmId = newContact.id;

                            // Populate contato_meios for WhatsApp matching
                            if (phone && newContact?.id) {
                                let normalizedPhone = phone.replace(/\D/g, '');
                                if (/^55\d{10,11}$/.test(normalizedPhone)) {
                                    normalizedPhone = normalizedPhone.slice(2);
                                }
                                await supabase.from('contato_meios').upsert({
                                    contato_id: newContact.id,
                                    tipo: 'whatsapp',
                                    valor: phone,
                                    valor_normalizado: normalizedPhone,
                                    is_principal: true,
                                    origem: 'active_campaign'
                                }, { onConflict: 'tipo,valor_normalizado', ignoreDuplicates: true });
                            }

                            log = `Created Contact (AC ID: ${acContactId})`;
                        }

                        // ═══════════════════════════════════════════════════════════════════
                        // APPLY CONTACT FIELD MAPPINGS TO CARDS
                        // ═══════════════════════════════════════════════════════════════════
                        if (contactCrmId && contactFieldMappings.length > 0) {
                            // Find cards where this contact is the principal person
                            const { data: linkedCards } = await supabase
                                .from('cards')
                                .select('id, marketing_data, briefing_inicial, produto_data')
                                .eq('pessoa_principal_id', contactCrmId);

                            if (linkedCards && linkedCards.length > 0) {
                                for (const card of linkedCards) {
                                    const cardUpdates: Record<string, any> = {};
                                    let marketingData = card.marketing_data || {};
                                    let briefingInicial = card.briefing_inicial || {};
                                    let produtoData = card.produto_data || {};
                                    let hasFieldUpdates = false;

                                    // Apply each contact field mapping
                                    for (const mapping of contactFieldMappings) {
                                        const acValue = contactFields[mapping.external_field_id];
                                        if (acValue === undefined || acValue === null || acValue === '') continue;

                                        const localKey = mapping.local_field_key;

                                        // Handle different target types
                                        if (localKey.startsWith('card.')) {
                                            // Direct card field (via system_fields / JSONB)
                                            const fieldKey = localKey.replace('card.', '');

                                            // Check if it's a JSONB target
                                            if (fieldKey.startsWith('__briefing_inicial__.')) {
                                                const jsonKey = fieldKey.replace('__briefing_inicial__.', '');
                                                briefingInicial[jsonKey] = acValue;
                                                hasFieldUpdates = true;
                                            } else if (fieldKey.startsWith('__produto_data__.')) {
                                                const jsonKey = fieldKey.replace('__produto_data__.', '');
                                                produtoData[jsonKey] = acValue;
                                                hasFieldUpdates = true;
                                            } else if (fieldKey.startsWith('__marketing_data__.')) {
                                                const jsonKey = fieldKey.replace('__marketing_data__.', '');
                                                marketingData[jsonKey] = acValue;
                                                hasFieldUpdates = true;
                                            } else {
                                                // Store in marketing_data with the field key
                                                marketingData[fieldKey] = acValue;
                                                hasFieldUpdates = true;
                                            }
                                        } else if (localKey.startsWith('contact.')) {
                                            // Contact field - already handled above
                                            continue;
                                        } else if (localKey === '__briefing_inicial__') {
                                            // Store entire value in briefing_inicial
                                            briefingInicial[mapping.external_field_id] = acValue;
                                            hasFieldUpdates = true;
                                        } else if (localKey === '__produto_data__') {
                                            produtoData[mapping.external_field_id] = acValue;
                                            hasFieldUpdates = true;
                                        } else if (localKey === '__marketing_data__') {
                                            marketingData[mapping.external_field_id] = acValue;
                                            hasFieldUpdates = true;
                                        }
                                    }

                                    // Update card if we have field updates
                                    if (hasFieldUpdates) {
                                        cardUpdates.marketing_data = marketingData;
                                        cardUpdates.briefing_inicial = briefingInicial;
                                        cardUpdates.produto_data = produtoData;
                                        cardUpdates.updated_at = new Date().toISOString();

                                        try {
                                            await updateCardSafe(card.id, cardUpdates);
                                            log += ` | Updated Card ${card.id} with ${Object.keys(marketingData).length} mapped fields`;
                                        } catch (cardUpdateErr) {
                                            console.error(`Failed to update card ${card.id} with contact fields:`, cardUpdateErr);
                                        }
                                    }
                                }
                            }
                        }

                        await updateEventStatus(event.id, 'processed', log);
                        stats.updated++;
                        results.push({ id: event.id, status: 'processed', log });
                    } else {
                        log = `[SHADOW] Would upsert Contact (AC ID: ${acContactId})`;
                        if (contactFieldMappings.length > 0) {
                            log += ` and apply ${contactFieldMappings.length} field mappings to linked cards`;
                        }
                        await updateEventStatus(event.id, 'processed_shadow', log);
                        stats.processed_shadow++;
                        results.push({ id: event.id, status: 'processed_shadow', log });
                    }
                    continue;
                }

                // Only process deals and dealActivity
                if (entity !== 'deal' && entity !== 'dealActivity') {
                    stats.ignored++;
                    await updateEventStatus(event.id, 'ignored', `Ignored: Entity ${entity}`);
                    continue;
                }

                // Only process allowed event types
                if (!allowedEventTypes.includes(event.event_type)) {
                    stats.ignored++;
                    await updateEventStatus(event.id, 'ignored', `Ignored: Event type ${event.event_type} not allowed`);
                    continue;
                }

                // 3.1 Resolve Target Stage
                // Support both flat format (stage, pipeline) and bracket format (deal[stageid], deal[pipelineid])
                const acStageId = payload.stage || payload.stage_id || payload.d_stageid || payload['deal[stageid]'];
                const acPipelineId = payload.pipeline || payload.pipeline_id || payload['deal[pipelineid]'];

                // EARLY STATUS DETECTION: Extract deal status before trigger/stage checks
                // so lost deals (AC status=2) can bypass blocking logic downstream.
                const earlyStatus = mapStatus(payload.status || payload['deal[status]']);
                const isLostDeal = earlyStatus === 'perdido';

                // 3.1.1 CHECK INBOUND TRIGGER RULES (selective entity creation)
                // BYPASS triggers for manual sync operations (import_mode: 'sync' or force_update: true)
                const isManualSync = importMode === 'sync' || payload.force_update === true;

                // Get AC owner ID for trigger matching
                const acOwnerId = payload.owner || payload.owner_id || payload['deal[owner]'];

                if (!isManualSync) {
                    const triggerCheck = checkInboundTrigger(
                        event.integration_id,
                        String(acPipelineId || ''),
                        String(acStageId || ''),
                        acOwnerId ? String(acOwnerId) : null,
                        event.event_type,
                        entity
                    );

                    if (!triggerCheck.allowed) {
                        // LOST DEAL BYPASS: AC status=2 must always be processed for existing cards.
                        // A deal marked as lost may come from any AC pipeline/stage, including
                        // ones without configured trigger rules (e.g. Pipeline 31 Desqualificados).
                        // We only bypass for deal_update (not deal_add — never create new cards as lost).
                        if (isLostDeal && event.event_type !== 'deal_add') {
                            log += ` [TRIGGER_BYPASS: AC status=lost, event allowed despite no trigger match]`;
                        } else {
                            stats.ignored_by_trigger++;
                            await updateEventStatus(event.id, 'ignored', `Trigger blocked: ${triggerCheck.reason}`, triggerCheck.trigger?.id || null);
                            results.push({ id: event.id, status: 'ignored', reason: triggerCheck.reason });
                            continue;
                        }
                    } else {
                        matchedTrigger = triggerCheck.trigger;
                    }
                }

                let targetStageId: string | null = null;
                let targetPipelineIdOverride: string | null = null;

                // PRIORITY 1: Use trigger's target_stage_id if defined
                if (matchedTrigger?.target_stage_id) {
                    targetStageId = matchedTrigger.target_stage_id;
                    targetPipelineIdOverride = matchedTrigger.target_pipeline_id || null;
                }

                // PRIORITY 2: Use stage mapping
                if (!targetStageId) {
                    const map = stageMappings?.find(m =>
                        m.integration_id === event.integration_id &&
                        m.external_stage_id === acStageId &&
                        m.pipeline_id === acPipelineId
                    );

                    if (map) {
                        targetStageId = map.internal_stage_id;
                    } else if (importMode === 'new_lead' && payload.default_stage_id) {
                        targetStageId = payload.default_stage_id;
                    }
                }

                const isMoveEvent = event.event_type === 'deal_add' || event.event_type === 'deal_update' || event.event_type === 'deal_state';

                if (isMoveEvent && !targetStageId) {
                    const isWonDeal = earlyStatus === 'ganho';
                    if (isLostDeal) {
                        // Lost deals don't need a mapped AC stage — the lost override
                        // downstream will assign the correct is_lost stage for the card's pipeline.
                        log += ` [UNMAPPED_BYPASS: Stage ${acStageId} (Pipeline ${acPipelineId}) unmapped, but status=lost will force to Fechado-Perdido]`;
                    } else if (isWonDeal) {
                        // Won deals don't need a mapped AC stage — the won override
                        // downstream will assign the correct is_planner_won stage for the card's pipeline.
                        log += ` [UNMAPPED_BYPASS: Stage ${acStageId} (Pipeline ${acPipelineId}) unmapped, but status=won will force to is_planner_won stage]`;
                    } else {
                        throw new Error(`Unmapped Stage: AC Stage ${acStageId} (Pipeline ${acPipelineId})`);
                    }
                }

                // 3.2 Resolve Topology
                let topology: { pipelineId: string; pipelineName: string; produto: string; stageName: string; fase: string | null } | null = null;
                if (targetStageId) {
                    topology = resolveTopology(targetStageId);
                    if (!topology) {
                        throw new Error(`Topology Error: Could not resolve Pipeline/Product for Stage ${targetStageId}`);
                    }
                    // Override pipeline if trigger specifies it
                    if (targetPipelineIdOverride) {
                        const overridePipeline = pipelines?.find(p => p.id === targetPipelineIdOverride);
                        if (overridePipeline) {
                            topology.pipelineId = overridePipeline.id;
                            topology.pipelineName = overridePipeline.nome;
                            topology.produto = overridePipeline.produto;
                        }
                    }
                }

                // 3.3 Resolve Owner (acOwnerId already declared above for trigger matching)
                let targetOwnerId: string | null = null;
                if (acOwnerId) {
                    const uMap = userMappings?.find(m => m.external_user_id === String(acOwnerId) && m.integration_id === event.integration_id);
                    if (uMap) targetOwnerId = uMap.internal_user_id;
                }

                // 3.4 Parse Custom Fields & Map Data
                const acFields = parseCustomFields(payload);

                // ALSO Parse Contact Fields (for Deal events that carry contact data)
                const parseContactFieldsForDeal = (payload: Record<string, any>) => {
                    const fields: Record<string, any> = {};
                    Object.keys(payload).forEach(key => {
                        const match = key.match(/^contact\[fields\]\[(\d+)\]$/);
                        if (match) {
                            fields[match[1]] = payload[key];
                        }
                    });
                    return fields;
                };
                const acContactFields = parseContactFieldsForDeal(payload);

                const marketingData: Record<string, any> = {
                    active_campaign_id: payload.id || payload['deal[id]'],
                    source: 'active_campaign',
                    raw_fields: { ...acFields, ...acContactFields }, // Store both in raw_fields
                    unmapped_fields: {}
                };

                // Dynamic Field Mapping with sync_always check
                // We need to check if we should overwrite existing values
                // For this, we need the existing card data, which we fetch later.
                // So we will prepare the "potential" updates here, and filter them when we have the existing card.

                const potentialUpdates: Record<string, any> = {};
                const protectedFields: string[] = []; // List of local keys that should NOT be updated if they exist

                // Normalize AC pipeline ID for field mapping lookup
                const acPipelineStr = acPipelineId ? String(acPipelineId) : '';

                Object.entries(acFields).forEach(([fieldId, value]) => {
                    // Match deal field mappings respecting external_pipeline_id:
                    // - Pipeline-specific mappings only match events from that pipeline
                    // - Global mappings (external_pipeline_id = '' or null) match all events
                    const fieldMap = fieldMappings?.find(m =>
                        m.external_field_id === fieldId &&
                        m.integration_id === event.integration_id &&
                        m.entity_type === 'deal' &&
                        (!m.external_pipeline_id || m.external_pipeline_id === '' || m.external_pipeline_id === acPipelineStr)
                    );

                    if (fieldMap) {
                        // Store in potential updates
                        potentialUpdates[fieldMap.local_field_key] = value;

                        // If sync_always is false, mark as protected
                        if (fieldMap.sync_always === false) {
                            protectedFields.push(fieldMap.local_field_key);
                        }
                    } else {
                        marketingData.unmapped_fields[fieldId] = value;
                    }
                });

                // Apply Contact Field Mappings
                Object.entries(acContactFields).forEach(([fieldId, value]) => {
                    // Note: external_field_id for contact usually has format "contact[fields][ID]" or just "ID"?
                    // In integration_field_map, it seems to be stored as "contact[fields][ID]" for contacts.
                    // But let's check how it's stored.
                    // The query result showed: "external_field_id":"contact[fields][46]"
                    // So we need to match that.
                    const externalKey = `contact[fields][${fieldId}]`;

                    const fieldMap = fieldMappings?.find(m => m.external_field_id === externalKey && m.integration_id === event.integration_id && m.entity_type === 'contact');

                    if (fieldMap) {
                        potentialUpdates[fieldMap.local_field_key] = value;
                        if (fieldMap.sync_always === false) {
                            protectedFields.push(fieldMap.local_field_key);
                        }
                    }
                });

                // Apply potential updates to marketingData (we will filter later or apply logic now if possible)
                // Actually, for marketing_data fields, we can just put them in.
                // The protection logic needs to happen when we merge with existing data.
                // But wait, marketing_data is a JSONB column.
                // If we want to protect "marketing_data.some_field", we need to know the existing value.

                // Let's store the mapping instructions to apply during the Card Update phase
                const fieldUpdateInstructions = Object.entries(potentialUpdates).map(([key, value]) => ({
                    key,
                    value,
                    protected: protectedFields.includes(key)
                }));

                // Special Case: Epoca Viagem (109 = Start, 101 = End)
                const dateStart = acFields['109'];
                const dateEnd = acFields['101'];

                if (dateStart || dateEnd) {
                    marketingData.epoca_viagem = {
                        from: dateStart || null,
                        to: dateEnd || null
                    };
                }

                // 3.5 Prepare DB Payload
                const dealId = payload.id || payload['deal[id]'] || payload.deal_id;
                const title = payload.title || payload['deal[title]'] || 'Sem Título';
                // AC webhooks send TWO value fields:
                //   deal[value]     = formatted string in REAIS ("15,000.00")
                //   deal[value_raw] = unformatted number in REAIS (15000)
                // NOTE: value_raw is already in REAIS, NOT centavos!
                // The AC API v3 returns deal.value in CENTS, but integration-sync-deals
                // converts to reais before passing here (deal.value / 100).
                // parseFloat("10,000.00") = 10 (stops at comma!) — use value_raw first.
                const rawValue = payload['deal[value_raw]'] || payload.value_raw;
                const formattedValue = payload.value || payload['deal[value]'] || '0';
                const value = rawValue
                    ? parseFloat(String(rawValue))  // already in REAIS
                    : parseFloat(String(formattedValue).replace(/,/g, ''));
                const status = mapStatus(payload.status || payload['deal[status]']);

                const contactEmail = payload.contact_email || payload['deal[contact_email]'] || payload.email;
                // Build contact name from first_name + last_name - keep separate
                const acFirstName = payload['contact[first_name]'] || payload.contact_first_name || '';
                const acLastName = payload['contact[last_name]'] || payload.contact_last_name || '';
                const contactNome = acFirstName.trim() || payload.contact_name || payload['deal[contact_name]'] || 'Sem Nome';
                const contactSobrenome = acLastName.trim() || null;
                const contactPhone = payload.contact_phone || payload['deal[contact_phone]'] || payload.phone;
                const acContactId = payload['deal[contactid]'] || payload.contactid || payload.contact_id;

                if (!isShadowMode) {
                    // UPSERT CONTACT (3-tier dedup: external_id → email → telefone)
                    let contactId: string | null = null;

                    // Tier 1: external_id (mais confiável)
                    if (acContactId) {
                        const { data: byExtId } = await supabase
                            .from('contatos')
                            .select('id')
                            .eq('external_id', String(acContactId))
                            .eq('external_source', 'active_campaign')
                            .single();
                        if (byExtId) contactId = byExtId.id;
                    }

                    // Tier 2: email
                    if (!contactId && contactEmail) {
                        const { data: byEmail } = await supabase
                            .from('contatos')
                            .select('id')
                            .eq('email', contactEmail)
                            .single();
                        if (byEmail) contactId = byEmail.id;
                    }

                    // Tier 3: telefone via matching robusto (variantes BR)
                    if (!contactId && contactPhone) {
                        const { data: byPhone } = await supabase
                            .rpc('find_contact_by_whatsapp', { p_phone: contactPhone, p_convo_id: '' });
                        if (byPhone) contactId = byPhone;
                    }

                    // Linkar external_id se encontrou contato existente sem vínculo AC
                    if (contactId && acContactId) {
                        await supabase
                            .from('contatos')
                            .update({
                                external_id: String(acContactId),
                                external_source: 'active_campaign'
                            })
                            .eq('id', contactId)
                            .is('external_id', null);
                    }

                    // Se não encontrou em nenhum tier → criar novo
                    if (!contactId) {
                        const { data: newContact, error: cErr } = await supabase
                            .from('contatos')
                            .insert({
                                nome: contactNome,
                                sobrenome: contactSobrenome,
                                email: contactEmail,
                                telefone: contactPhone,
                                external_id: acContactId ? String(acContactId) : null,
                                external_source: acContactId ? 'active_campaign' : null,
                                tags: ['active_campaign'],
                                tipo_pessoa: 'adulto'
                            })
                            .select('id')
                            .single();
                        if (cErr) throw new Error(`Contact Create Error: ${cErr.message}`);
                        contactId = newContact.id;

                        // Populate contato_meios for WhatsApp matching
                        if (contactPhone) {
                            let normalizedPhone = contactPhone.replace(/\D/g, '');
                            if (/^55\d{10,11}$/.test(normalizedPhone)) {
                                normalizedPhone = normalizedPhone.slice(2);
                            }
                            await supabase.from('contato_meios').upsert({
                                contato_id: contactId,
                                tipo: 'whatsapp',
                                valor: contactPhone,
                                valor_normalizado: normalizedPhone,
                                is_principal: true,
                                origem: 'active_campaign'
                            }, { onConflict: 'tipo,valor_normalizado', ignoreDuplicates: true });
                        }
                    }

                    // UPSERT CARD
                    // Fetch all fields including locked_fields for field protection
                    const { data: existingCard } = await supabase
                        .from('cards')
                        .select('*, locked_fields') // Include locked_fields for user-level field protection
                        .eq('external_id', dealId)
                        .eq('external_source', 'active_campaign')
                        .single();

                    // Apply Field Updates with Protection Logic
                    // MERGE: Start with existing marketing_data to preserve contact-sourced fields
                    // (deal_update webhooks from AC don't include contact[fields], so without merge
                    //  any data populated by the deal_add's contact[fields] would be wiped out)
                    const finalMarketingData = {
                        ...(existingCard?.marketing_data || {}),
                        ...marketingData
                    };
                    const topLevelUpdates: Record<string, any> = {};

                    // Initialize JSON field containers for enterprise storage
                    let cardPayload_produtoData: Record<string, any> | null = existingCard?.produto_data || null;
                    let cardPayload_briefingInicial: Record<string, any> | null = existingCard?.briefing_inicial || null;

                    fieldUpdateInstructions.forEach(instruction => {
                        const { key, value, protected: isProtected } = instruction;

                        // Check if we should skip this update
                        let shouldSkip = false;

                        // ═══════════════════════════════════════════════════════════════════
                        // PRIORITY 1: USER-LEVEL FIELD LOCK (locked_fields)
                        // If user locked this field, ALWAYS skip update regardless of other rules
                        // ═══════════════════════════════════════════════════════════════════
                        const lockedFields = existingCard?.locked_fields as Record<string, boolean> | null;
                        if (lockedFields && lockedFields[key] === true) {
                            shouldSkip = true;
                            console.log(`[FIELD_LOCK] Field "${key}" is locked by user, skipping update`);
                        }

                        // ═══════════════════════════════════════════════════════════════════
                        // PRIORITY 2: MAPPING-LEVEL PROTECTION (sync_always = false)
                        // ═══════════════════════════════════════════════════════════════════
                        if (!shouldSkip && isProtected && existingCard) {
                            // Check if existing card has a value for this key
                            // The key could be a top-level column OR inside marketing_data
                            let existingValue = existingCard[key];

                            // If not found at top level, check marketing_data
                            if (existingValue === undefined && existingCard.marketing_data) {
                                existingValue = existingCard.marketing_data[key];
                            }

                            // If existing value is not null/undefined/empty, protect it
                            if (existingValue !== null && existingValue !== undefined && existingValue !== '') {
                                shouldSkip = true;
                            }
                        }

                        if (!shouldSkip) {
                            // ═══════════════════════════════════════════════════════════════════
                            // ENTERPRISE STORAGE LOGIC - 100% Database Driven (no hardcoded lists)
                            // ═══════════════════════════════════════════════════════════════════
                            // Find the mapping for this field to get storage configuration
                            const fieldMapping = fieldMappings?.find(m => m.local_field_key === key);
                            const storageLocation = fieldMapping?.storage_location || null;
                            const dbColumnName = fieldMapping?.db_column_name || null;

                            // Clean up key (remove card. prefix if present)
                            let cleanKey = key;
                            if (key.startsWith('card.')) {
                                cleanKey = key.replace('card.', '');
                            }

                            // GUARD: Don't overwrite existing JSON values with empty strings
                            // This prevents deal_update events (which have mostly empty deal[fields])
                            // from wiping out data previously populated by contact[fields] in deal_add
                            const isEmpty = value === '' || value === null || value === undefined;

                            // Route based on storage_location from database configuration
                            if (storageLocation === 'column' && dbColumnName) {
                                // Direct column in cards table - skip empty values to avoid wiping existing data
                                if (!isEmpty) {
                                    topLevelUpdates[dbColumnName] = value;
                                }
                            } else if (storageLocation === 'produto_data') {
                                if (!isEmpty) {
                                    if (!cardPayload_produtoData) cardPayload_produtoData = {};
                                    const jsonKey = cleanKey.replace('__produto_data__.', '');
                                    cardPayload_produtoData[jsonKey] = value;
                                }
                            } else if (storageLocation === 'briefing_inicial') {
                                if (!isEmpty) {
                                    if (!cardPayload_briefingInicial) cardPayload_briefingInicial = {};
                                    const jsonKey = cleanKey.replace('__briefing_inicial__.', '');
                                    cardPayload_briefingInicial[jsonKey] = value;
                                }
                            } else if (storageLocation === 'marketing_data') {
                                if (!isEmpty) {
                                    finalMarketingData[cleanKey] = value;
                                }
                            } else {
                                // FALLBACK: Legacy prefix-based routing (for backward compatibility)
                                if (key.startsWith('__briefing_inicial__.')) {
                                    if (!isEmpty) {
                                        if (!cardPayload_briefingInicial) cardPayload_briefingInicial = {};
                                        const jsonKey = key.replace('__briefing_inicial__.', '');
                                        cardPayload_briefingInicial[jsonKey] = value;
                                    }
                                } else if (key.startsWith('__produto_data__.')) {
                                    if (!isEmpty) {
                                        if (!cardPayload_produtoData) cardPayload_produtoData = {};
                                        const jsonKey = key.replace('__produto_data__.', '');
                                        cardPayload_produtoData[jsonKey] = value;
                                    }
                                } else {
                                    // Default: marketing_data (safe fallback)
                                    if (!isEmpty) {
                                        finalMarketingData[cleanKey] = value;
                                    }
                                }
                            }
                        }
                    });

                    const cardPayload: Record<string, any> = {
                        titulo: title,
                        valor_estimado: value,
                        status_comercial: status,
                        ...topLevelUpdates, // Override with mapped values if they exist and are not protected
                        marketing_data: finalMarketingData,
                        updated_at: new Date().toISOString()
                    };

                    // ═══════════════════════════════════════════════════════════════════
                    // SYNC: deal[value] → produto_data.orcamento (smart_budget format)
                    // Ensures the "Investimento" section field shows the AC deal value.
                    // IMPORTANT: trg_sync_travel_normalized (BEFORE UPDATE OF produto_data)
                    // overwrites valor_estimado from orcamento.total_calculado.
                    // So we MUST keep orcamento in sync with the deal value to avoid
                    // the trigger reverting valor_estimado to the old orcamento value.
                    // ═══════════════════════════════════════════════════════════════════
                    if (value > 0) {
                        if (!cardPayload_produtoData) cardPayload_produtoData = {};
                        const existingOrcamento = existingCard?.produto_data?.orcamento;
                        if (!existingOrcamento || !existingOrcamento.tipo) {
                            // No orcamento yet — create it
                            cardPayload_produtoData.orcamento = {
                                tipo: 'total',
                                valor: value,
                                total_calculado: value,
                                display: `R$ ${value.toLocaleString('pt-BR')}`
                            };
                        } else if (existingOrcamento.total_calculado !== value || existingOrcamento.valor !== value) {
                            // Orcamento exists but value changed — update value fields
                            cardPayload_produtoData.orcamento = {
                                ...existingOrcamento,
                                valor: value,
                                total_calculado: value,
                                display: `R$ ${value.toLocaleString('pt-BR')}`
                            };
                        }
                    }

                    // ═══════════════════════════════════════════════════════════════════
                    // ENTERPRISE: Include produto_data and briefing_inicial if populated
                    // ═══════════════════════════════════════════════════════════════════
                    if (cardPayload_produtoData && Object.keys(cardPayload_produtoData).length > 0) {
                        cardPayload.produto_data = cardPayload_produtoData;
                    }
                    if (cardPayload_briefingInicial && Object.keys(cardPayload_briefingInicial).length > 0) {
                        cardPayload.briefing_inicial = cardPayload_briefingInicial;
                    }

                    // Ensure title/value/status are not overwritten by default if they are protected via mapping
                    // The ...topLevelUpdates above handles the "mapped" values.
                    // But what if they are NOT mapped? Then 'title', 'value', 'status' variables are used.
                    // We should probably respect protection for these standard fields too if they are mapped.
                    // If they are NOT mapped, we use the standard AC values (title, value, status).
                    // If they ARE mapped, 'topLevelUpdates' has the value (or not, if skipped).

                    // Refinement:
                    // If 'valor_estimado' is NOT in topLevelUpdates (because it was protected), 
                    // we should NOT use the 'value' variable from AC payload either!
                    // We need to check if these standard fields were "attempted" to be updated via mapping.

                    // Actually, 'value', 'title', 'status' are extracted from payload directly.
                    // If there is a mapping for them, it would be in 'fieldUpdateInstructions'.
                    // If there is NO mapping, we default to using them.
                    // If there IS a mapping and it was protected, we should use the EXISTING value (or just not include it in update).

                    // Let's check if standard fields are being protected
                    const isTitleProtected = fieldUpdateInstructions.some(i => i.key === 'titulo' && i.protected && existingCard?.titulo);
                    const isValueProtected = fieldUpdateInstructions.some(i => i.key === 'valor_estimado' && i.protected && existingCard?.valor_estimado);

                    if (isTitleProtected) delete cardPayload.titulo;
                    if (isValueProtected) delete cardPayload.valor_estimado;

                    // ═══════════════════════════════════════════════════════════════════
                    // QUALITY GATE VALIDATION - Validate against stage requirements
                    // ═══════════════════════════════════════════════════════════════════
                    if (targetStageId && matchedTrigger && !matchedTrigger.bypass_validation) {
                        const validationLevel = matchedTrigger.validation_level || 'fields_only';

                        if (validationLevel !== 'none') {
                            // Build card data for validation
                            const cardDataForValidation = {
                                ...cardPayload,
                                briefing_inicial: cardPayload_briefingInicial,
                                produto_data: cardPayload_produtoData
                            };

                            // Call validation function
                            const { data: validationResult, error: valError } = await supabase.rpc(
                                'validate_integration_gate',
                                {
                                    p_card_data: cardDataForValidation,
                                    p_target_stage_id: targetStageId,
                                    p_source: 'active_campaign',
                                    p_validation_level: validationLevel
                                }
                            );

                            if (valError) {
                                console.error('Quality Gate validation error:', valError);
                                // Fail-open: Continue processing on validation error
                            } else {
                                const validation = validationResult?.[0];

                                if (validation && !validation.valid && !validation.can_bypass) {
                                    // REQUIREMENTS NOT MET
                                    const quarantineMode = matchedTrigger.quarantine_mode || 'stage';
                                    const missingReqs = validation.missing_requirements || [];

                                    if (quarantineMode === 'reject') {
                                        // REJECT: Don't create card, log conflict
                                        await supabase.from('integration_conflict_log').insert({
                                            integration_id: event.integration_id,
                                            event_id: event.id,
                                            trigger_id: matchedTrigger.id,
                                            conflict_type: 'missing_field',
                                            target_stage_id: targetStageId,
                                            missing_requirements: missingReqs,
                                            resolution: 'rejected'
                                        });

                                        stats.blocked++;
                                        await updateEventStatus(event.id, 'blocked',
                                            `Quality Gate rejected: ${missingReqs.length} requirements not met`, matchedTrigger?.id || null);
                                        results.push({ id: event.id, status: 'blocked', missing: missingReqs });
                                        continue; // Skip to next event
                                    }

                                    if (quarantineMode === 'stage' && matchedTrigger.quarantine_stage_id) {
                                        // QUARANTINE: Redirect to quarantine stage
                                        const originalTargetStage = targetStageId;
                                        targetStageId = matchedTrigger.quarantine_stage_id;
                                        topology = resolveTopology(targetStageId);

                                        await supabase.from('integration_conflict_log').insert({
                                            integration_id: event.integration_id,
                                            event_id: event.id,
                                            trigger_id: matchedTrigger.id,
                                            conflict_type: 'missing_field',
                                            target_stage_id: originalTargetStage,
                                            actual_stage_id: targetStageId,
                                            missing_requirements: missingReqs,
                                            resolution: 'quarantined'
                                        });

                                        log += ` [QUARANTINE: ${missingReqs.length} requirements missing]`;
                                    }

                                    if (quarantineMode === 'force') {
                                        // FORCE: Create anyway, just log the conflict
                                        await supabase.from('integration_conflict_log').insert({
                                            integration_id: event.integration_id,
                                            event_id: event.id,
                                            trigger_id: matchedTrigger.id,
                                            conflict_type: 'missing_field',
                                            target_stage_id: targetStageId,
                                            actual_stage_id: targetStageId,
                                            missing_requirements: missingReqs,
                                            resolution: 'forced'
                                        });

                                        log += ` [FORCED: ${missingReqs.length} requirements bypassed]`;
                                    }
                                }
                            }
                        }
                    }
                    // ═══════════════════════════════════════════════════════════════════

                    // If AC says deal is lost (status=2), force card to the is_lost stage
                    // Scoped to the card's pipeline to avoid cross-pipeline mismatch (TRIPS vs WEDDING)
                    if (status === 'perdido') {
                        const scopePipelineId = existingCard?.pipeline_id || topology?.pipelineId || null;

                        const scopedLostStage = scopePipelineId
                            ? pipelineStages?.find(s => s.is_lost === true && s.pipeline_id === scopePipelineId)
                            : null;

                        // Fallback: first is_lost stage found (backward compat if pipeline unknown)
                        const finalLostStage = scopedLostStage || pipelineStages?.find(s => s.is_lost === true);

                        if (finalLostStage) {
                            targetStageId = finalLostStage.id;
                            topology = resolveTopology(targetStageId);
                            log += ` [AC status=lost -> forced to Fechado-Perdido (pipeline: ${topology?.pipelineName || 'unknown'})]`;
                        }
                    }

                    // If AC says deal is won (status=1), force card to the is_planner_won stage
                    // For TRIPS: "Viagem Confirmada (Ganho)" [is_planner_won=true]
                    // Scoped to the card's pipeline to avoid cross-pipeline mismatch
                    if (status === 'ganho') {
                        const scopePipelineId = existingCard?.pipeline_id || topology?.pipelineId || null;

                        const scopedWonStage = scopePipelineId
                            ? pipelineStages?.find(s => s.is_planner_won === true && s.pipeline_id === scopePipelineId)
                            : null;

                        const fallbackWonStage = pipelineStages?.find(s => s.is_planner_won === true);
                        const finalWonStage = scopedWonStage || fallbackWonStage;

                        if (finalWonStage) {
                            targetStageId = finalWonStage.id;
                            topology = resolveTopology(targetStageId);
                            log += ` [AC status=won -> forced to ${topology?.stageName || finalWonStage.nome} (pipeline: ${topology?.pipelineName || 'unknown'})]`;
                        }
                    }

                    // ═══════════════════════════════════════════════════════════════════
                    // ANTI-REGRESSION: Don't move card backward if CRM is already more advanced
                    // Comparison: (phase.order_index, stage.ordem) — phase weighs more than ordem
                    // ═══════════════════════════════════════════════════════════════════
                    let skipStageUpdate = false;

                    if (existingCard && targetStageId && existingCard.pipeline_stage_id) {
                        const currentCrmStageId = existingCard.pipeline_stage_id;

                        // Status 'perdido' always forces to lost stage (handled above), skip regression check
                        if (status !== 'perdido') {
                            // Rule 1: If CRM card is at a terminal stage (won/lost), never allow AC to move it out
                            if (isTerminalStage(currentCrmStageId)) {
                                skipStageUpdate = true;
                                const currentPos = getStagePosition(currentCrmStageId);
                                log += ` [DONT_REGRESS: CRM at terminal stage (phase=${currentPos?.phaseOrder}, ordem=${currentPos?.stageOrder})]`;
                            }
                            // Rule 2: If CRM stage is more advanced than AC target, don't regress
                            else if (isStageMoreAdvanced(currentCrmStageId, targetStageId)) {
                                skipStageUpdate = true;
                                const currentPos = getStagePosition(currentCrmStageId);
                                const targetPos = getStagePosition(targetStageId);
                                log += ` [DONT_REGRESS: CRM (phase=${currentPos?.phaseOrder}, ordem=${currentPos?.stageOrder}) > AC target (phase=${targetPos?.phaseOrder}, ordem=${targetPos?.stageOrder})]`;
                            }
                        }
                    }

                    // If skipping stage update and AC says 'ganho', don't set status_comercial
                    // (let the DB trigger enforce status based on the actual CRM stage)
                    if (skipStageUpdate && status === 'ganho') {
                        delete cardPayload.status_comercial;
                        log += ' [status_comercial deferred to CRM stage trigger]';
                    }

                    if (targetStageId && topology && !skipStageUpdate) {
                        cardPayload.pipeline_stage_id = targetStageId;
                        cardPayload.pipeline_id = topology.pipelineId;
                        cardPayload.produto = topology.produto;
                    }

                    if (targetOwnerId) {
                        cardPayload.dono_atual_id = targetOwnerId;

                        // Also set role-specific owner based on fase
                        if (topology?.fase === 'SDR') {
                            cardPayload.sdr_owner_id = targetOwnerId;
                        } else if (topology?.fase === 'Planner') {
                            cardPayload.vendas_owner_id = targetOwnerId;
                        } else if (topology?.fase === 'Pós-venda') {
                            cardPayload.concierge_owner_id = targetOwnerId;
                        }
                    }

                    if (existingCard) {
                        // Correct created_at for AC cards if we have the original date
                        const acCreateDateForUpdate = payload['deal[create_date]'] || payload.cdate;
                        if (acCreateDateForUpdate && existingCard.external_source === 'active_campaign') {
                            const parsedDate = new Date(acCreateDateForUpdate);
                            if (!isNaN(parsedDate.getTime())) {
                                const acTimestamp = parsedDate.toISOString();
                                if (existingCard.created_at !== acTimestamp) {
                                    cardPayload.created_at = acTimestamp;
                                }
                            }
                        }

                        await updateCardSafe(existingCard.id, cardPayload);
                        log += `Updated Card ${existingCard.id} (Pipeline: ${topology?.pipelineName})`;

                    } else {
                        if (!topology) throw new Error("Cannot create card: Missing Topology (Stage/Pipeline/Product)");

                        cardPayload.external_id = dealId;
                        cardPayload.external_source = 'active_campaign';
                        cardPayload.pessoa_principal_id = contactId;

                        // ═══════════════════════════════════════════════════════════════════
                        // SMART ORIGIN: Resolve origin from AC data
                        // Priority: AC "Origem do lead" field (#29) → UTM data → fallback 'active_campaign'
                        //
                        // Rules:
                        //  1. If AC "Origem do lead" matches our taxonomy → use it (indicacao, carteira, mkt, etc.)
                        //  2. If AC "Origem do lead" is marketing-related text → 'mkt'
                        //  3. If no AC origin but UTM/marketing data exists → 'mkt'
                        //  4. Otherwise → 'active_campaign'
                        // ═══════════════════════════════════════════════════════════════════
                        const acOrigem = String(topLevelUpdates.origem || finalMarketingData.origem || '').toLowerCase().trim();
                        const acUtmSource = topLevelUpdates.utm_source || finalMarketingData.utm_source;
                        const acUtmMedium = topLevelUpdates.utm_medium || finalMarketingData.utm_medium;
                        const acUtmCampaign = topLevelUpdates.utm_campaign || finalMarketingData.utm_campaign;

                        // Normalize AC "Origem do lead" to our taxonomy
                        // Valid origins: mkt, indicacao, carteira_propria, carteira_wg
                        const ORIGEM_MAP: Record<string, string> = {
                            'mkt': 'mkt', 'marketing': 'mkt',
                            'indicacao': 'indicacao', 'indicação': 'indicacao', 'referral': 'indicacao',
                            'carteira_propria': 'carteira_propria', 'carteira própria': 'carteira_propria',
                            'carteira_wg': 'carteira_wg', 'carteira wg': 'carteira_wg',
                            // Legacy mappings → default to carteira_propria
                            'carteira': 'carteira_propria', 'recorrente': 'carteira_propria', 'recorrencia': 'carteira_propria',
                            'site': 'mkt', 'manual': 'mkt', 'outro': 'mkt',
                        };
                        const resolvedOrigem = acOrigem ? ORIGEM_MAP[acOrigem] : null;
                        const hasUtmData = !!(acUtmSource || acUtmMedium || acUtmCampaign);

                        if (resolvedOrigem) {
                            // AC sent a recognizable origin → use it directly
                            cardPayload.origem = resolvedOrigem;
                            cardPayload.origem_lead = acUtmSource || null;
                        } else if (acOrigem) {
                            // AC sent an origin value we don't recognize → treat as marketing
                            cardPayload.origem = 'mkt';
                            cardPayload.origem_lead = topLevelUpdates.origem || finalMarketingData.origem || null;
                        } else if (hasUtmData) {
                            // No origin field, but UTM data present → marketing
                            cardPayload.origem = 'mkt';
                            cardPayload.origem_lead = acUtmSource || null;
                        } else {
                            // No marketing/origin info at all → fallback to marketing
                            cardPayload.origem = 'mkt';
                        }
                        // Don't let the mapped 'origem' field overwrite our resolved value
                        delete topLevelUpdates.origem;

                        // Use AC deal creation date instead of current time
                        const acCreateDate = payload['deal[create_date]'] || payload.cdate || payload.date_time;
                        const parsedCreateDate = acCreateDate ? new Date(acCreateDate) : null;
                        cardPayload.created_at = (parsedCreateDate && !isNaN(parsedCreateDate.getTime()))
                            ? parsedCreateDate.toISOString()
                            : new Date().toISOString();

                        const { error: iErr } = await supabase
                            .from('cards')
                            .insert(cardPayload);

                        if (iErr) throw new Error(`Card Create Error: ${iErr.message}`);
                        log = `Created Card (Pipeline: ${topology.pipelineName})`;
                    }

                    await updateEventStatus(event.id, 'processed', log, matchedTrigger?.id || null);
                    stats.updated++;
                    results.push({ id: event.id, status: 'processed', log });

                } else {
                    log = `[SHADOW] Would ${targetStageId ? 'Upsert Card' : 'Process Event'} - Pipeline: ${topology?.pipelineName || 'N/A'}`;
                    await updateEventStatus(event.id, 'processed_shadow', log, matchedTrigger?.id || null);
                    stats.processed_shadow++;
                    results.push({ id: event.id, status: 'processed_shadow', log });
                }

            } catch (err: any) {
                console.error(`Event ${event.id} failed:`, err);

                const MAX_RETRIES = 3;
                const currentAttempts = (event.attempts || 0) + 1;
                const retryable = isRetryableError(err.message);
                const isFinalFailure = currentAttempts >= MAX_RETRIES || !retryable;
                const newStatus = isFinalFailure ? 'failed' : 'pending';

                // Exponential backoff: 2min, 8min, 32min (capped at 30min)
                const retryDelayMs = retryable
                    ? Math.min(2 * 60 * 1000 * Math.pow(4, currentAttempts - 1), 30 * 60 * 1000)
                    : 0;

                const logPrefix = isFinalFailure
                    ? `[FINAL attempt ${currentAttempts}/${MAX_RETRIES}]`
                    : `[Retry ${currentAttempts}/${MAX_RETRIES}, next in ${Math.round(retryDelayMs / 60000)}min]`;

                await updateEventStatus(
                    event.id,
                    newStatus,
                    `${logPrefix} ${err.message}`,
                    matchedTrigger?.id || null,
                    {
                        attempts: currentAttempts,
                        next_retry_at: retryable && !isFinalFailure
                            ? new Date(Date.now() + retryDelayMs).toISOString()
                            : null
                    }
                );
                stats.errors++;
                results.push({ id: event.id, status: newStatus, error: err.message, attempt: currentAttempts });
            }
        }

        if (pgSql) await pgSql.end();

        return new Response(JSON.stringify({
            message: `Processed ${stats.updated + stats.processed_shadow} events`,
            stats,
            results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        })
    }
})
