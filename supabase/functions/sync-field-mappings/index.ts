import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Sincroniza mapeamentos de campos do Inbound para Outbound
 * Campos que entram do AC podem ser configurados para também sair para o AC
 */

const AC_INTEGRATION_ID = 'a2141b92-561f-4514-92b4-9412a068d236';

// Mapeamento de campos internos do CRM para IDs do AC
// Baseado nos campos mais comuns que fazem sentido ser bidirecionais
const FIELD_MAPPINGS: Record<string, { acFieldId: string; acFieldName: string; section?: string }> = {
    // Campos de valor
    'valor_estimado': { acFieldId: '21', acFieldName: 'Deal Value', section: 'valor' },
    'valor_final': { acFieldId: '21', acFieldName: 'Deal Value', section: 'valor' },

    // Campos de viagem
    'data_viagem_inicio': { acFieldId: '22', acFieldName: 'Data de embarque?', section: 'viagem' },
    'data_viagem_fim': { acFieldId: '23', acFieldName: 'Data Retorno da viagem', section: 'viagem' },
    'destinos': { acFieldId: '20', acFieldName: 'Destino(s) do roteiro?', section: 'viagem' },
    'pax': { acFieldId: '17', acFieldName: 'Quantas pessoas?', section: 'viagem' },
    'dias_ate_viagem': { acFieldId: '19', acFieldName: 'Quantos dias de viagem?', section: 'viagem' },

    // Campos de briefing
    'motivo': { acFieldId: '25', acFieldName: 'Qual o intuito da viagem', section: 'briefing' },
    'orcamento': { acFieldId: '24', acFieldName: 'Qual o orçamento por pessoa?', section: 'briefing' },
    'o_que_e_importante': { acFieldId: '26', acFieldName: 'Observações', section: 'briefing' },
    'special_requests': { acFieldId: '27', acFieldName: 'Deal Description', section: 'briefing' },

    // Campos de contato
    'telefone': { acFieldId: '28', acFieldName: 'Telefone', section: 'contato' },

    // Campos de marketing
    'origem': { acFieldId: '29', acFieldName: 'Origem do lead', section: 'marketing' },
    'utm_source': { acFieldId: '30', acFieldName: 'Origem da última conversão', section: 'marketing' },
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[sync-field-mappings] Starting field mapping sync...');

    try {
        // 1. Buscar mapeamentos inbound ativos
        const { data: inboundMappings, error: inboundError } = await supabase
            .from('integration_field_map')
            .select('*')
            .eq('integration_id', AC_INTEGRATION_ID)
            .eq('direction', 'inbound')
            .eq('is_active', true)
            .eq('entity_type', 'deal');

        if (inboundError) throw new Error(`Inbound query error: ${inboundError.message}`);

        console.log(`[sync-field-mappings] Found ${inboundMappings?.length || 0} inbound mappings`);

        // 2. Buscar catálogo de campos do AC
        const { data: fieldCatalog, error: catalogError } = await supabase
            .from('integration_field_catalog')
            .select('*')
            .eq('integration_id', AC_INTEGRATION_ID);

        if (catalogError) throw new Error(`Catalog query error: ${catalogError.message}`);

        // Criar mapa de campo_key -> info do catálogo
        const catalogMap = new Map(
            (fieldCatalog || []).map(f => [f.field_key, f])
        );

        // 3. Buscar mapeamentos outbound existentes (todos, independente do pipeline)
        const { data: existingOutbound, error: outboundError } = await supabase
            .from('integration_outbound_field_map')
            .select('internal_field, external_pipeline_id')
            .eq('integration_id', AC_INTEGRATION_ID);

        if (outboundError) throw new Error(`Outbound query error: ${outboundError.message}`);

        const existingFields = new Set(
            (existingOutbound || []).map(m => m.internal_field)
        );

        // 4. Criar novos mapeamentos outbound para campos que ainda não existem
        const newMappings: Array<{
            integration_id: string;
            internal_field: string;
            internal_field_label: string;
            external_field_id: string;
            external_field_name: string;
            section: string | null;
            sync_always: boolean;
            is_active: boolean;
        }> = [];

        // Tracking para relatório
        const skippedComplexFields: string[] = [];
        const alreadySynced: string[] = [];
        const allInboundFields: string[] = [];

        for (const inbound of inboundMappings || []) {
            const localField = inbound.local_field_key;
            allInboundFields.push(localField);

            // Pular campos complexos (briefing, produto_data, etc)
            if (localField.startsWith('__')) {
                skippedComplexFields.push(localField);
                continue;
            }

            // Pular se já existe no outbound
            if (existingFields.has(localField)) {
                alreadySynced.push(localField);
                continue;
            }

            // Buscar info do campo no catálogo pelo external_field_id
            const catalogEntry = Array.from(catalogMap.values()).find(
                c => c.field_key === inbound.external_field_id
            );

            // Criar label legível
            const fieldLabel = localField
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());

            newMappings.push({
                integration_id: AC_INTEGRATION_ID,
                internal_field: localField,
                internal_field_label: fieldLabel,
                external_field_id: inbound.external_field_id,
                external_field_name: catalogEntry?.field_name || fieldLabel,
                section: inbound.section || null,
                sync_always: inbound.sync_always || false,
                is_active: true  // Ativo por default (sync admin-triggered)
            });
        }

        // 5. Inserir novos mapeamentos (usando upsert para evitar duplicatas)
        if (newMappings.length > 0) {
            const { error: insertError } = await supabase
                .from('integration_outbound_field_map')
                .upsert(newMappings, {
                    onConflict: 'integration_id,internal_field',
                    ignoreDuplicates: true
                });

            if (insertError) throw new Error(`Insert error: ${insertError.message}`);
        }

        console.log(`[sync-field-mappings] Created ${newMappings.length} new outbound mappings`);

        return new Response(JSON.stringify({
            success: true,
            inbound_count: inboundMappings?.length || 0,
            existing_outbound: existingFields.size,
            new_outbound_created: newMappings.length,
            new_mappings: newMappings.map(m => ({
                field: m.internal_field,
                ac_field: m.external_field_name
            })),
            report: {
                total_inbound: allInboundFields.length,
                skipped_complex_fields: skippedComplexFields.length,
                skipped_complex_list: skippedComplexFields,
                already_synced: alreadySynced.length,
                already_synced_list: alreadySynced,
                outbound_only: Array.from(existingFields).filter(f => !allInboundFields.includes(f))
            }
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err: unknown) {
        let errorMessage = 'Unknown error';
        if (err instanceof Error) {
            errorMessage = err.message;
        } else if (typeof err === 'object' && err !== null) {
            errorMessage = JSON.stringify(err);
        } else {
            errorMessage = String(err);
        }
        console.error('[sync-field-mappings] Error:', errorMessage);
        return new Response(JSON.stringify({
            success: false,
            error: errorMessage
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
