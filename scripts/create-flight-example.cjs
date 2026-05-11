/**
 * Cria uma proposta com exemplo de voos diretamente via insert
 * Sem passar pelo trigger problemático
 */

const { createClient } = require('@supabase/supabase-js');
const serviceKey = require('../.claude/secrets.json').supabase_service_role;
const supabase = createClient('https://szyrzxvlptqqheizyrxu.supabase.co', serviceKey);

async function main() {
    console.log('📋 Buscando proposta existente ou criando nova...\n');

    // Verificar se já existe uma proposta
    let { data: proposals } = await supabase
        .from('proposals')
        .select('id, active_version_id')
        .limit(1);

    let proposalId, versionId;

    if (proposals && proposals.length > 0) {
        proposalId = proposals[0].id;
        versionId = proposals[0].active_version_id;
        console.log('   Usando proposta existente:', proposalId);
    } else {
        // Precisa criar - vamos tentar com card_id null
        console.log('   Nenhuma proposta encontrada.');
        console.log('   Por favor, crie uma proposta pela interface do sistema');
        console.log('   e execute este script novamente.\n');
        console.log('   Acesse: http://localhost:5173/pipeline');
        console.log('   - Selecione um card');
        console.log('   - Clique em "Nova Proposta"');
        return;
    }

    // Buscar ou criar versão
    if (!versionId) {
        const { data: version, error } = await supabase
            .from('proposal_versions')
            .insert({
                proposal_id: proposalId,
                version_number: 1,
                title: 'Viagem São Paulo ↔ Curitiba'
            })
            .select()
            .single();

        if (error) {
            console.error('Erro ao criar versão:', error.message);
            return;
        }
        versionId = version.id;

        await supabase
            .from('proposals')
            .update({ active_version_id: versionId })
            .eq('id', proposalId);
    }

    console.log('   Version ID:', versionId);

    // Limpar seções e items existentes desta versão
    await supabase.from('proposal_items').delete().eq('section_id',
        supabase.from('proposal_sections').select('id').eq('version_id', versionId)
    );
    await supabase.from('proposal_sections').delete().eq('version_id', versionId);
    console.log('   Seções limpas');

    // Criar seção de voos
    const { data: section, error: secError } = await supabase
        .from('proposal_sections')
        .insert({
            version_id: versionId,
            section_type: 'flights',
            title: 'Voos',
            ordem: 0,
            visible: true
        })
        .select()
        .single();

    if (secError) {
        console.error('Erro ao criar seção:', secError.message);
        return;
    }

    // Dados de voos no NOVO FORMATO
    const flightsData = {
        legs: [
            {
                id: 'leg-ida',
                leg_type: 'outbound',
                label: 'IDA',
                origin_code: 'CGH',
                origin_city: 'São Paulo - Congonhas',
                destination_code: 'CWB',
                destination_city: 'Curitiba - Afonso Pena',
                date: '2026-02-23',
                ordem: 0,
                is_expanded: true,
                options: [
                    {
                        id: 'gol-1100',
                        airline_code: 'G3',
                        airline_name: 'GOL',
                        flight_number: '1100',
                        departure_time: '07:10',
                        arrival_time: '08:15',
                        cabin_class: 'economy',
                        fare_family: 'light',
                        equipment: '73G',
                        stops: 0,
                        baggage: '',
                        price: 399.10,
                        currency: 'BRL',
                        is_recommended: true,
                        ordem: 0
                    },
                    {
                        id: 'gol-1104',
                        airline_code: 'G3',
                        airline_name: 'GOL',
                        flight_number: '1104',
                        departure_time: '10:15',
                        arrival_time: '11:25',
                        cabin_class: 'economy',
                        fare_family: 'light',
                        equipment: '73G',
                        stops: 0,
                        baggage: '',
                        price: 399.10,
                        currency: 'BRL',
                        is_recommended: false,
                        ordem: 1
                    },
                    {
                        id: 'gol-1106',
                        airline_code: 'G3',
                        airline_name: 'GOL',
                        flight_number: '1106',
                        departure_time: '13:20',
                        arrival_time: '14:30',
                        cabin_class: 'economy',
                        fare_family: 'light',
                        equipment: '7M8',
                        stops: 0,
                        baggage: '',
                        price: 399.10,
                        currency: 'BRL',
                        is_recommended: false,
                        ordem: 2
                    }
                ]
            },
            {
                id: 'leg-volta',
                leg_type: 'return',
                label: 'VOLTA',
                origin_code: 'CWB',
                origin_city: 'Curitiba - Afonso Pena',
                destination_code: 'CGH',
                destination_city: 'São Paulo - Congonhas',
                date: '2026-02-26',
                ordem: 1,
                is_expanded: true,
                options: [
                    {
                        id: 'gol-1117',
                        airline_code: 'G3',
                        airline_name: 'GOL',
                        flight_number: '1117',
                        departure_time: '11:35',
                        arrival_time: '12:40',
                        cabin_class: 'economy',
                        fare_family: 'light',
                        equipment: '73G',
                        stops: 0,
                        baggage: '',
                        price: 195.17,
                        currency: 'BRL',
                        is_recommended: true,
                        ordem: 0
                    },
                    {
                        id: 'gol-1573',
                        airline_code: 'G3',
                        airline_name: 'GOL',
                        flight_number: '1573',
                        departure_time: '12:10',
                        arrival_time: '13:15',
                        cabin_class: 'economy',
                        fare_family: 'light',
                        equipment: '73G',
                        stops: 0,
                        baggage: '',
                        price: 195.23,
                        currency: 'BRL',
                        is_recommended: false,
                        ordem: 1
                    },
                    {
                        id: 'gol-1121',
                        airline_code: 'G3',
                        airline_name: 'GOL',
                        flight_number: '1121',
                        departure_time: '15:20',
                        arrival_time: '16:25',
                        cabin_class: 'economy',
                        fare_family: 'light',
                        equipment: '73G',
                        stops: 0,
                        baggage: '',
                        price: 195.23,
                        currency: 'BRL',
                        is_recommended: false,
                        ordem: 2
                    },
                    {
                        id: 'gol-1137',
                        airline_code: 'G3',
                        airline_name: 'GOL',
                        flight_number: '1137',
                        departure_time: '20:50',
                        arrival_time: '22:00',
                        cabin_class: 'economy',
                        fare_family: 'light',
                        equipment: '73G',
                        stops: 0,
                        baggage: '',
                        price: 383.68,
                        currency: 'BRL',
                        is_recommended: false,
                        ordem: 3
                    }
                ]
            }
        ],
        show_prices: true,
        allow_mix_airlines: true,
        default_selections: {}
    };

    const { error: itemError } = await supabase.from('proposal_items').insert({
        section_id: section.id,
        item_type: 'flight',
        title: 'Opções de Voo GOL',
        description: 'Voos ida e volta São Paulo - Curitiba',
        base_price: 0,
        ordem: 0,
        is_optional: false,
        is_default_selected: true,
        rich_content: { flights: flightsData }
    });

    if (itemError) {
        console.error('Erro ao criar item:', itemError.message);
        return;
    }

    console.log('');
    console.log('═'.repeat(55));
    console.log('✅ PROPOSTA COM VOOS CRIADA!');
    console.log('═'.repeat(55));
    console.log('');
    console.log('📋 Estrutura:');
    console.log('   • IDA: 3 opções GOL (CGH → CWB) - 23/02');
    console.log('   • VOLTA: 4 opções GOL (CWB → CGH) - 26/02');
    console.log('');
    console.log('🔗 Acesse:');
    console.log(`   http://localhost:5173/proposals/${proposalId}/edit`);
    console.log('');
}

main().catch(console.error);
