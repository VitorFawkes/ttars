import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface OutboundEvent {
    id: string;
    card_id: string;
    tarefa_id: string | null;
    integration_id: string;
    external_id: string | null;
    event_type: 'stage_change' | 'field_update' | 'won' | 'lost' | 'card_created'
              | 'task_created' | 'task_completed' | 'task_updated';
    payload: Record<string, unknown>;
    status: string;
    attempts: number;
    integrations?: {
        config?: {
            api_key?: string;
            api_url?: string;
        };
    };
}

Deno.serve(async (req) => {
    // Only allow POST for scheduled invocations
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            }
        });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[integration-dispatch] Starting outbound event processing...');

    // 0. Check if outbound sync is enabled and not in shadow mode
    const { data: settings } = await supabase
        .from('integration_settings')
        .select('key, value')
        .in('key', ['OUTBOUND_SYNC_ENABLED', 'OUTBOUND_SHADOW_MODE', 'OUTBOUND_NOTES_SECTIONS']);

    const settingsMap = (settings || []).reduce((acc, s) => {
        acc[s.key] = s.value;
        return acc;
    }, {} as Record<string, string>);

    const syncEnabled = settingsMap['OUTBOUND_SYNC_ENABLED'] === 'true';
    const shadowMode = settingsMap['OUTBOUND_SHADOW_MODE'] === 'true';

    // Notes config: which observation sections to sync as AC Notes
    let notesConfig = { enabled: true, sections: { sdr: true, planner: true, pos_venda: true } };
    try {
        if (settingsMap['OUTBOUND_NOTES_SECTIONS']) {
            notesConfig = JSON.parse(settingsMap['OUTBOUND_NOTES_SECTIONS']);
        }
    } catch { /* use defaults */ }

    if (!syncEnabled) {
        console.log('[integration-dispatch] Outbound sync is disabled');
        return new Response(JSON.stringify({
            message: 'Outbound sync is disabled',
            processed: 0,
            sync_enabled: false
        }), { status: 200 });
    }

    if (shadowMode) {
        console.log('[integration-dispatch] Shadow mode is active - skipping actual dispatch');
        return new Response(JSON.stringify({
            message: 'Shadow mode active - no events dispatched',
            processed: 0,
            shadow_mode: true
        }), { status: 200 });
    }

    // 1. Fetch pending outbound events (respecting retry backoff)
    const now = new Date().toISOString();
    const { data: events, error: fetchError } = await supabase
        .from('integration_outbound_queue')
        .select(`
            id, card_id, tarefa_id, integration_id, external_id, event_type, payload, status, attempts,
            integrations:integrations(config)
        `)
        .eq('status', 'pending')
        .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
        .order('created_at')
        .limit(50);

    if (fetchError) {
        console.error('[integration-dispatch] Failed to fetch events:', fetchError);
        return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }

    if (!events?.length) {
        console.log('[integration-dispatch] No pending events');
        return new Response(JSON.stringify({ message: 'No pending events', processed: 0 }), { status: 200 });
    }

    console.log(`[integration-dispatch] Processing ${events.length} events...`);

    // 1b. Load outbound field mappings for field_update translation (CRM field → AC field ID)
    const { data: outboundFieldMaps } = await supabase
        .from('integration_outbound_field_map')
        .select('internal_field, external_field_id, external_field_name, is_active')
        .eq('is_active', true);

    const fieldMapLookup = new Map<string, string>();
    for (const m of outboundFieldMaps || []) {
        if (m.internal_field && m.external_field_id) {
            fieldMapLookup.set(m.internal_field, m.external_field_id);
        }
    }

    // 1c. Load task type mappings for task_created/task_updated (CRM tipo → AC dealTasktype)
    const { data: taskTypeMaps } = await supabase
        .from('integration_task_type_map')
        .select('pipeline_id, ac_task_type, crm_task_tipo')
        .eq('is_active', true);

    const taskTypeMapLookup = new Map<string, number>();
    for (const m of taskTypeMaps || []) {
        taskTypeMapLookup.set(`${m.pipeline_id}:${m.crm_task_tipo}`, m.ac_task_type);
    }

    // 1d. Load user mappings for task assignee (CRM profile → AC user)
    const { data: userMappings } = await supabase
        .from('integration_user_map')
        .select('internal_user_id, external_user_id');

    const userMapReverse = new Map<string, string>(); // CRM profile ID → AC user ID
    for (const m of userMappings || []) {
        if (m.internal_user_id && m.external_user_id) {
            userMapReverse.set(m.internal_user_id, m.external_user_id);
        }
    }

    // Metadata fields from the trigger payload that should never be sent to AC
    const METADATA_FIELDS = new Set(['shadow_mode', 'matched_rule', 'old_stage_id', 'new_stage_id',
        'target_external_stage_id', 'target_external_stage_name', 'status', 'motivo_perda']);

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const event of events as unknown as OutboundEvent[]) {
        try {
            // 2. Mark as processing
            await supabase
                .from('integration_outbound_queue')
                .update({ status: 'processing' })
                .eq('id', event.id);

            // 3. Get ActiveCampaign API credentials
            // First try from integration config, then fallback to integration_settings
            const integration = event.integrations as { config?: { api_key?: string; api_url?: string } };
            let acApiKey = integration?.config?.api_key;
            let acApiUrl = integration?.config?.api_url;

            // Fallback to integration_settings if not in config
            if (!acApiKey || !acApiUrl) {
                const { data: acSettings } = await supabase
                    .from('integration_settings')
                    .select('key, value')
                    .in('key', ['ACTIVECAMPAIGN_API_KEY', 'ACTIVECAMPAIGN_API_URL']);

                const acSettingsMap = (acSettings || []).reduce((acc, s) => {
                    acc[s.key] = s.value;
                    return acc;
                }, {} as Record<string, string>);

                acApiKey = acApiKey || acSettingsMap['ACTIVECAMPAIGN_API_KEY'];
                acApiUrl = acApiUrl || acSettingsMap['ACTIVECAMPAIGN_API_URL'];
            }

            if (!acApiKey || !acApiUrl) {
                throw new Error('ActiveCampaign API not configured. Set ACTIVECAMPAIGN_API_KEY and ACTIVECAMPAIGN_API_URL in integration settings.');
            }

            // 4. Build API request based on event type
            let endpoint = '';
            let httpMethod = 'PUT';
            let body: Record<string, unknown> = {};
            let isCardCreated = false;

            switch (event.event_type) {

                case 'card_created': {
                    httpMethod = 'POST';
                    endpoint = '/api/3/deals';
                    isCardCreated = true;

                    const ccPayload = event.payload as {
                        titulo?: string;
                        valor_estimado?: number;
                        pipeline_stage_id?: string;
                        target_external_stage_id?: string;
                        dono_atual_id?: string;
                    };

                    if (!ccPayload.target_external_stage_id) {
                        throw new Error('card_created: target_external_stage_id not set (no outbound stage mapping for this stage)');
                    }

                    // Buscar o pipeline (group) do AC a partir do mapeamento de stage
                    const { data: stageMapEntry } = await supabase
                        .from('integration_stage_map')
                        .select('pipeline_id')
                        .eq('external_stage_id', ccPayload.target_external_stage_id)
                        .limit(1)
                        .maybeSingle();

                    if (!stageMapEntry?.pipeline_id) {
                        throw new Error(`card_created: No AC pipeline found for stage ${ccPayload.target_external_stage_id}`);
                    }

                    const dealValue = typeof ccPayload.valor_estimado === 'number'
                        ? Math.round(ccPayload.valor_estimado * 100) : 0;

                    const dealBody: Record<string, unknown> = {
                        title: ccPayload.titulo || 'Novo Lead',
                        value: dealValue,
                        currency: 'brl',
                        group: stageMapEntry.pipeline_id,
                        stage: ccPayload.target_external_stage_id,
                    };

                    // Best-effort: vincular ao contato AC pelo email
                    const { data: cardData } = await supabase
                        .from('cards')
                        .select('pessoa_principal_id')
                        .eq('id', event.card_id)
                        .maybeSingle();

                    if (cardData?.pessoa_principal_id) {
                        const { data: contactData } = await supabase
                            .from('contatos')
                            .select('email')
                            .eq('id', cardData.pessoa_principal_id)
                            .maybeSingle();

                        if (contactData?.email) {
                            try {
                                const acContactRes = await fetch(
                                    `${acApiUrl}/api/3/contacts?email=${encodeURIComponent(contactData.email)}`,
                                    { headers: { 'Api-Token': acApiKey } }
                                );
                                if (acContactRes.ok) {
                                    const acContacts = await acContactRes.json();
                                    const acContact = acContacts?.contacts?.[0];
                                    if (acContact?.id) {
                                        dealBody.contact = String(acContact.id);
                                    }
                                }
                            } catch (_) {
                                // Contact lookup falhou — deal criado sem vínculo de contato
                            }
                        }
                    }

                    // Mapear owner do CRM → AC
                    if (ccPayload.dono_atual_id) {
                        const { data: ownerMap } = await supabase
                            .from('integration_user_map')
                            .select('external_user_id')
                            .eq('internal_user_id', ccPayload.dono_atual_id)
                            .eq('integration_id', event.integration_id)
                            .limit(1)
                            .maybeSingle();

                        if (ownerMap?.external_user_id) {
                            dealBody.owner = ownerMap.external_user_id;
                        }
                    }

                    body = { deal: dealBody };
                    console.log(`[integration-dispatch] Card created: "${dealBody.title}" → Stage ${ccPayload.target_external_stage_id} Pipeline ${stageMapEntry.pipeline_id} Owner ${dealBody.owner || 'N/A'}`);
                    break;
                }
                case 'stage_change': {
                    endpoint = `/api/3/deals/${event.external_id}`;
                    const targetStageId = (event.payload as { target_external_stage_id?: string }).target_external_stage_id;
                    body = {
                        deal: {
                            stage: targetStageId
                        }
                    };
                    console.log(`[integration-dispatch] Stage change: Deal ${event.external_id} -> Stage ${targetStageId}`);
                    break;
                }

                case 'field_update': {
                    endpoint = `/api/3/deals/${event.external_id}`;

                    // ── _observacoes_note: sync observações via AC Notes API ──
                    const obsNote = (event.payload as Record<string, unknown>)?._observacoes_note as
                        { sdr?: Record<string, unknown>; planner?: Record<string, unknown>; pos_venda?: Record<string, unknown> } | undefined;

                    if (obsNote && event.external_id && notesConfig.enabled) {
                        try {
                            const sections: string[] = [];
                            const formatSection = (title: string, data: Record<string, unknown> | undefined) => {
                                if (!data || Object.keys(data).length === 0) return;
                                const lines = Object.entries(data)
                                    .filter(([, v]) => v !== null && v !== '' && v !== undefined)
                                    .map(([k, v]) => `• ${k.replace(/_/g, ' ')}: ${String(v)}`);
                                if (lines.length > 0) {
                                    sections.push(`── ${title} ──\n${lines.join('\n')}`);
                                }
                            };
                            if (notesConfig.sections.sdr) formatSection('SDR / Briefing', obsNote.sdr);
                            if (notesConfig.sections.planner) formatSection('Planner / Observações Críticas', obsNote.planner);
                            if (notesConfig.sections.pos_venda) formatSection('Pós-Venda', obsNote.pos_venda);

                            if (sections.length > 0) {
                                const noteBody = `[CRM Observações — ${new Date().toLocaleDateString('pt-BR')}]\n\n${sections.join('\n\n')}`;

                                const noteRes = await fetch(`${acApiUrl}/api/3/notes`, {
                                    method: 'POST',
                                    headers: { 'Api-Token': acApiKey, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        note: {
                                            note: noteBody,
                                            relid: Number(event.external_id),
                                            reltype: 'deal',
                                        }
                                    })
                                });

                                if (noteRes.ok) {
                                    console.log(`[integration-dispatch] Note synced for deal ${event.external_id}`);
                                } else {
                                    console.warn(`[integration-dispatch] Note API failed: ${noteRes.status} ${await noteRes.text()}`);
                                }
                            }
                        } catch (noteErr) {
                            console.warn(`[integration-dispatch] Note sync error:`, noteErr);
                        }
                    }

                    // Translate CRM field names → AC field IDs using integration_outbound_field_map
                    const standardFields: Record<string, unknown> = {};
                    const customFields: Array<{ customFieldId: number; fieldValue: string }> = [];
                    let skippedFields: string[] = [];

                    // Flatten nested objects so inner keys can match field mappings
                    // e.g. observacoes: { o_que_e_importante: "..." } → o_que_e_importante: "..."
                    const flatPayload: Record<string, unknown> = {};
                    for (const [key, val] of Object.entries(event.payload || {})) {
                        if (METADATA_FIELDS.has(key) || key === '_observacoes_note') continue;
                        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                            // Keep the key itself if it has a mapping (e.g. orcamento → deal[value])
                            if (fieldMapLookup.has(key)) {
                                flatPayload[key] = val;
                            }
                            // Also flatten inner keys for nested objects (e.g. observacoes.o_que_e_importante)
                            for (const [innerKey, innerVal] of Object.entries(val as Record<string, unknown>)) {
                                if (fieldMapLookup.has(innerKey) && !(innerKey in flatPayload)) {
                                    flatPayload[innerKey] = innerVal;
                                }
                            }
                        } else {
                            flatPayload[key] = val;
                        }
                    }

                    for (const [fieldId, value] of Object.entries(flatPayload)) {
                        // Check if it's already in AC format (deal[fieldname])
                        const standardMatch = fieldId.match(/^deal\[(\w+)\]$/);
                        if (standardMatch) {
                            standardFields[standardMatch[1]] = value;
                            continue;
                        }

                        // Translate CRM field → AC field using the outbound field map
                        const acFieldId = fieldMapLookup.get(fieldId);
                        if (acFieldId) {
                            // Check if it's a standard AC field (deal.value, deal.title, etc.)
                            const acStandardMatch = acFieldId.match(/^deal\[(\w+)\]$/);
                            if (acStandardMatch) {
                                const stdField = acStandardMatch[1];
                                let stdValue: unknown;

                                if (stdField === 'value') {
                                    // deal[value] — AC expects numeric value in cents
                                    // Handle orcamento object: extract total_calculado or valor
                                    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                                        const obj = value as Record<string, unknown>;
                                        // Hierarquia: total_calculado (SmartBudget v2)
                                        //           > valor (orcamento legado simples)
                                        //           > total (trigger activities antigo)
                                        const numValue = obj.total_calculado ?? obj.valor ?? obj.total;
                                        stdValue = typeof numValue === 'number' ? numValue * 100 : 0;
                                    } else if (typeof value === 'number') {
                                        stdValue = value * 100;
                                    } else if (typeof value === 'string') {
                                        const parsed = parseFloat(value);
                                        stdValue = isNaN(parsed) ? 0 : parsed * 100;
                                    } else {
                                        stdValue = 0;
                                    }
                                    // Sanity check: values > R$ 10M (1 billion cents) are suspicious
                                    if (typeof stdValue === 'number' && stdValue > 1_000_000_000) {
                                        console.warn(`[integration-dispatch] WARNING: Suspiciously high deal value ${stdValue} cents (R$ ${(stdValue / 100).toLocaleString()}) for deal ${event.external_id}. Possible centavos-as-reais bug.`);
                                    }
                                } else {
                                    // Other standard fields (title, status, etc.)
                                    if (Array.isArray(value)) {
                                        stdValue = value.join(', ');
                                    } else if (value !== null && typeof value === 'object') {
                                        stdValue = JSON.stringify(value);
                                    } else {
                                        stdValue = value;
                                    }
                                }
                                standardFields[stdField] = stdValue;
                            } else {
                                // Custom field - AC expects numeric ID
                                const numericId = parseInt(acFieldId, 10);
                                if (isNaN(numericId) || numericId === 0) {
                                    console.warn(`[integration-dispatch] Invalid custom field ID "${acFieldId}" for field "${fieldId}", skipping`);
                                    skippedFields.push(`${fieldId}(invalid_id:${acFieldId})`);
                                    continue;
                                }
                                // Arrays (e.g. destinos: ["Japão", "Brasil"]) → comma-separated string
                                // Rich objects: extract best value for AC field type
                                //   - DuracaoViagem (dias_max) → number for AC number fields
                                //   - Other objects with display → human-readable string
                                let fieldValue: string;
                                if (Array.isArray(value)) {
                                    fieldValue = value.join(', ');
                                } else if (value !== null && typeof value === 'object') {
                                    const obj = value as Record<string, unknown>;
                                    if (typeof obj.dias_max === 'number') {
                                        // DuracaoViagem (fixo/range) → send max days (AC number field)
                                        fieldValue = String(obj.dias_max);
                                    } else if (obj.tipo === 'indefinido' || obj.tipo === 'fixo' || obj.tipo === 'range') {
                                        // DuracaoViagem without numeric value (indefinido) → clear AC field
                                        fieldValue = '';
                                    } else if (typeof obj.display === 'string' && obj.display) {
                                        fieldValue = obj.display;
                                    } else {
                                        fieldValue = JSON.stringify(value);
                                    }
                                } else {
                                    fieldValue = String(value ?? '');
                                }
                                customFields.push({
                                    customFieldId: numericId,
                                    fieldValue
                                });
                            }
                        } else {
                            skippedFields.push(fieldId);
                        }
                    }

                    if (skippedFields.length > 0) {
                        console.warn(`[integration-dispatch] Skipped unmapped fields: ${skippedFields.join(', ')}`);
                    }

                    // Only send if we have actual fields to update
                    if (Object.keys(standardFields).length === 0 && customFields.length === 0) {
                        const logMsg = obsNote
                            ? `Note-only sync (no deal fields to update)`
                            : `Skipped: No mapped fields (unmapped: ${skippedFields.join(', ')})`;
                        console.log(`[integration-dispatch] ${logMsg} for event ${event.id}`);
                        await supabase.from('integration_outbound_queue').update({
                            status: 'sent',
                            processed_at: new Date().toISOString(),
                            processing_log: logMsg
                        }).eq('id', event.id);
                        results.push({ id: event.id, status: 'sent' });
                        continue;
                    }

                    const dealObject: Record<string, unknown> = { ...standardFields };
                    if (customFields.length > 0) {
                        dealObject.fields = customFields;
                    }

                    body = { deal: dealObject };
                    console.log(`[integration-dispatch] Field update: Deal ${event.external_id}, ${Object.keys(standardFields).length} standard, ${customFields.length} custom, ${skippedFields.length} skipped`);
                    break;
                }

                case 'won': {
                    endpoint = `/api/3/deals/${event.external_id}`;
                    body = {
                        deal: {
                            status: 1 // 1 = Won in ActiveCampaign
                        }
                    };
                    console.log(`[integration-dispatch] Won: Deal ${event.external_id}`);
                    break;
                }

                case 'lost': {
                    endpoint = `/api/3/deals/${event.external_id}`;

                    // AC automation "[WW] [WT] [CRM] Perdidos sem motivo" (ID 90)
                    // reverts deals to Open if no loss reason field is filled.
                    // We must send the motivo de perda alongside status=2.
                    const lostPayload = event.payload as { motivo_perda?: string };
                    const lossFields: Array<{ customFieldId: number; fieldValue: string }> = [];

                    if (lostPayload.motivo_perda && lostPayload.motivo_perda !== 'null') {
                        // Lookup CRM loss reason name
                        const { data: motivoRow } = await supabase
                            .from('motivos_perda')
                            .select('nome')
                            .eq('id', lostPayload.motivo_perda)
                            .single();

                        const motivoNome = motivoRow?.nome || '';

                        if (motivoNome) {
                            // Map CRM motivo → AC field options
                            // Field 2:  "Motivo de perda" (generic WW)
                            // Field 56: "SDR WT - Motivo de Perda"
                            // Field 59: "VND WT - Motivo de Perda"
                            const mapField2: Record<string, string> = {
                                'Sem resposta (Ghosting)': 'Sem Interesse',
                                'Oportunidade Futura': 'Oportunidade futura (casamento para mais de 2 anos)',
                                'Preço': 'Orçamento não condiz com o número de convidados/destino',
                                'Concorrência': 'Já tem a viagem contratada',
                                'Desistência / Sem interesse': 'Sem Interesse',
                                'Produto não atende': 'Quer destino que não fazemos',
                                'Outro': 'Sem Interesse',
                                'Perdido via ActiveCampaign': 'Sem Interesse',
                            };
                            const mapField56: Record<string, string> = {
                                'Sem resposta (Ghosting)': 'Não respondeu',
                                'Oportunidade Futura': 'Oportunidade Futura',
                                'Preço': 'Orçamento Baixo',
                                'Concorrência': 'Lead fechou por fora',
                                'Desistência / Sem interesse': 'Lead sem fit',
                                'Produto não atende': 'Lead sem fit',
                                'Outro': 'Não respondeu',
                                'Perdido via ActiveCampaign': 'Não respondeu',
                            };
                            const mapField59: Record<string, string> = {
                                'Sem resposta (Ghosting)': 'Não respondeu',
                                'Oportunidade Futura': 'Contato Futuro',
                                'Preço': 'Não concordou com os valores',
                                'Concorrência': 'Fechou com concorrente',
                                'Desistência / Sem interesse': 'Sem feat',
                                'Produto não atende': 'Sem feat',
                                'Outro': 'Não respondeu',
                                'Perdido via ActiveCampaign': 'Não respondeu',
                            };

                            // Fill all 3 motivo fields to cover any AC pipeline
                            if (mapField2[motivoNome]) {
                                lossFields.push({ customFieldId: 2, fieldValue: mapField2[motivoNome] });
                            }
                            if (mapField56[motivoNome]) {
                                lossFields.push({ customFieldId: 56, fieldValue: mapField56[motivoNome] });
                            }
                            if (mapField59[motivoNome]) {
                                lossFields.push({ customFieldId: 59, fieldValue: mapField59[motivoNome] });
                            }

                            console.log(`[integration-dispatch] Lost: motivo "${motivoNome}" → ${lossFields.length} AC fields`);
                        }
                    }

                    // Fallback: if no motivo was mapped, send a generic value
                    // to prevent AC automation 90 from reverting the deal to Open
                    if (lossFields.length === 0) {
                        lossFields.push({ customFieldId: 2, fieldValue: 'Sem Interesse' });
                        lossFields.push({ customFieldId: 56, fieldValue: 'Não respondeu' });
                        lossFields.push({ customFieldId: 59, fieldValue: 'Não respondeu' });
                        console.log(`[integration-dispatch] Lost: no motivo provided, using fallback values`);
                    }

                    body = {
                        deal: {
                            status: 2, // 2 = Lost in ActiveCampaign
                            ...(lossFields.length > 0 ? { fields: lossFields } : {}),
                        }
                    };
                    console.log(`[integration-dispatch] Lost: Deal ${event.external_id}`);
                    break;
                }

                // ═══════════════════════════════════════════════════════════════════
                // TASK EVENTS: CRM tarefas → AC dealTasks
                // ═══════════════════════════════════════════════════════════════════
                case 'task_created': {
                    httpMethod = 'POST';
                    endpoint = '/api/3/dealTasks';
                    isCardCreated = false; // reuse flag logic below for task write-back

                    const tcPayload = event.payload as {
                        ac_deal_id?: string; titulo?: string; tipo?: string;
                        data_vencimento?: string; pipeline_id?: string; responsavel_id?: string;
                    };

                    const acDealId = tcPayload.ac_deal_id || event.external_id;
                    if (!acDealId) {
                        throw new Error('task_created: No AC deal ID available');
                    }

                    // Map CRM tipo → AC dealTasktype
                    const pipelineId = tcPayload.pipeline_id || '';
                    const acTaskType = taskTypeMapLookup.get(`${pipelineId}:${tcPayload.tipo}`) || 3; // 3=todo fallback

                    // Map CRM responsavel_id → AC user ID
                    const acAssignee = tcPayload.responsavel_id
                        ? userMapReverse.get(tcPayload.responsavel_id)
                        : undefined;

                    const dealTask: Record<string, unknown> = {
                        title: tcPayload.titulo || 'Tarefa CRM',
                        dealTasktype: String(acTaskType),
                        duedate: tcPayload.data_vencimento || new Date().toISOString(),
                        relid: Number(acDealId),
                        reltype: 'deal',
                        status: 0
                    };
                    if (acAssignee) dealTask.assignee = Number(acAssignee);

                    body = { dealTask };
                    console.log(`[integration-dispatch] Task created: "${dealTask.title}" → Deal ${acDealId}`);
                    break;
                }

                case 'task_completed': {
                    if (!event.external_id) {
                        throw new Error('task_completed: No AC task external_id');
                    }
                    endpoint = `/api/3/dealTasks/${event.external_id}`;
                    body = { dealTask: { status: 1 } };
                    console.log(`[integration-dispatch] Task completed: AC Task ${event.external_id}`);
                    break;
                }

                case 'task_updated': {
                    if (!event.external_id) {
                        throw new Error('task_updated: No AC task external_id');
                    }
                    endpoint = `/api/3/dealTasks/${event.external_id}`;

                    const tuPayload = event.payload as {
                        titulo?: string; data_vencimento?: string; responsavel_id?: string;
                        pipeline_id?: string; tipo?: string;
                    };

                    const updatedTask: Record<string, unknown> = {};
                    if (tuPayload.titulo) updatedTask.title = tuPayload.titulo;
                    if (tuPayload.data_vencimento) updatedTask.duedate = tuPayload.data_vencimento;

                    // Map assignee
                    if (tuPayload.responsavel_id) {
                        const acUser = userMapReverse.get(tuPayload.responsavel_id);
                        if (acUser) updatedTask.assignee = Number(acUser);
                    }

                    body = { dealTask: updatedTask };
                    console.log(`[integration-dispatch] Task updated: AC Task ${event.external_id}`);
                    break;
                }

                default:
                    throw new Error(`Unknown event type: ${event.event_type}`);
            }

            // 5. Call ActiveCampaign API
            const apiResponse = await fetch(`${acApiUrl}${endpoint}`, {
                method: httpMethod,
                headers: {
                    'Api-Token': acApiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                throw new Error(`ActiveCampaign API Error: ${apiResponse.status} - ${errorText}`);
            }

            // 6. Parse response for validation
            let responseData = null;
            try {
                responseData = await apiResponse.json();
            } catch (parseErr) {
                console.warn(`[integration-dispatch] Could not parse API response: ${parseErr}`);
            }

            // 7a. Para task_created: salvar o AC task ID no tarefas.external_id
            if (event.event_type === 'task_created' && responseData?.dealTask?.id && event.tarefa_id) {
                const newAcTaskId = String(responseData.dealTask.id);
                await supabase.from('tarefas')
                    .update({ external_id: newAcTaskId, external_source: 'activecampaign' })
                    .eq('id', event.tarefa_id);
                await supabase.from('integration_outbound_queue')
                    .update({ external_id: newAcTaskId })
                    .eq('id', event.id);
                console.log(`[integration-dispatch] AC Task ${newAcTaskId} created for tarefa ${event.tarefa_id}`);
            }

            // 7b. Para card_created: salvar o external_id retornado pelo AC no card
            if (isCardCreated && responseData?.deal?.id) {
                const newExternalId = String(responseData.deal.id);
                await supabase.from('cards')
                    .update({
                        external_id: newExternalId,
                        external_source: 'activecampaign'
                    })
                    .eq('id', event.card_id);
                // Atualizar o evento da fila com o external_id para rastreamento
                await supabase.from('integration_outbound_queue')
                    .update({ external_id: newExternalId })
                    .eq('id', event.id);
                console.log(`[integration-dispatch] Deal criado no AC com ID ${newExternalId} para card ${event.card_id}`);
            }

            // 8. Mark as sent with response data for validation
            await supabase
                .from('integration_outbound_queue')
                .update({
                    status: 'sent',
                    processed_at: new Date().toISOString(),
                    processing_log: `Success: ${apiResponse.status}`,
                    response_data: responseData
                })
                .eq('id', event.id);

            results.push({ id: event.id, status: 'sent' });
            console.log(`[integration-dispatch] ✓ Event ${event.id} sent successfully`);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[integration-dispatch] ✗ Event ${event.id} failed:`, errorMessage);

            // Determine if we should retry
            const maxAttempts = 3;
            const newAttempts = (event.attempts || 0) + 1;
            const newStatus = newAttempts >= maxAttempts ? 'failed' : 'pending';
            const retryDelay = 60000 * newAttempts; // Exponential backoff: 1min, 2min, 3min

            await supabase
                .from('integration_outbound_queue')
                .update({
                    status: newStatus,
                    attempts: newAttempts,
                    next_retry_at: new Date(Date.now() + retryDelay).toISOString(),
                    processing_log: `Error (attempt ${newAttempts}): ${errorMessage}`
                })
                .eq('id', event.id);

            results.push({ id: event.id, status: 'error', error: errorMessage });
        }
    }

    const successCount = results.filter(r => r.status === 'sent').length;
    const failCount = results.filter(r => r.status === 'error').length;

    console.log(`[integration-dispatch] Complete: ${successCount} sent, ${failCount} failed`);

    return new Response(JSON.stringify({
        processed: results.length,
        sent: successCount,
        failed: failCount,
        results
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
});
