const { createClient } = require('@supabase/supabase-js');

const serviceKey = require('../.claude/secrets.json').supabase_service_role;
const supabase = createClient('https://szyrzxvlptqqheizyrxu.supabase.co', serviceKey);

async function reset() {
    console.log('🔧 Preparando banco...\n');

    // Criar tabela activities se não existir (para o trigger funcionar)
    try {
        await supabase.rpc('exec_sql', {
            query: `
                CREATE TABLE IF NOT EXISTS activities (
                    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                    card_id uuid REFERENCES cards(id) ON DELETE CASCADE,
                    tipo text,
                    descricao text,
                    metadata jsonb DEFAULT '{}',
                    created_by uuid,
                    created_at timestamptz DEFAULT now()
                );
            `
        });
        console.log('   Tabela activities criada/verificada');
    } catch (e) {
        console.log('   (não foi possível criar activities via RPC)');
    }

    console.log('🗑️  Limpando propostas antigas...\n');

    await supabase.from('proposal_client_selections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('proposal_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('proposal_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('proposal_sections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('proposal_versions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('proposals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('✅ Dados antigos removidos\n');

    console.log('📝 Criando nova proposta...\n');

    const { data: cards } = await supabase.from('cards').select('id, titulo').limit(1);
    let cardId;

    if (cards && cards.length > 0) {
        cardId = cards[0].id;
        console.log('   Card:', cards[0].titulo);
    } else {
        const { data: newCard, error } = await supabase
            .from('cards')
            .insert({ titulo: 'Viagem SP → Curitiba (Teste)' })
            .select()
            .single();
        if (error) {
            console.error('Erro:', error.message);
            return;
        }
        cardId = newCard.id;
        console.log('   Card criado');
    }

    const { data: proposal, error: propError } = await supabase
        .from('proposals')
        .insert({ card_id: cardId, status: 'draft' })
        .select()
        .single();

    if (propError) {
        console.error('Erro ao criar proposta:', propError.message);
        return;
    }
    console.log('   Proposta:', proposal.id);

    const { data: version } = await supabase
        .from('proposal_versions')
        .insert({
            proposal_id: proposal.id,
            version_number: 1,
            title: 'Viagem São Paulo ↔ Curitiba'
        })
        .select()
        .single();

    await supabase
        .from('proposals')
        .update({ active_version_id: version.id })
        .eq('id', proposal.id);

    const { data: section } = await supabase
        .from('proposal_sections')
        .insert({
            version_id: version.id,
            section_type: 'flights',
            title: 'Voos',
            ordem: 0,
            visible: true
        })
        .select()
        .single();

    // NOVO FORMATO DE VOOS - legs com options
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

    await supabase.from('proposal_items').insert({
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

    console.log('');
    console.log('═'.repeat(55));
    console.log('✅ PROPOSTA CRIADA COM NOVO FORMATO DE VOOS!');
    console.log('═'.repeat(55));
    console.log('');
    console.log('📋 Estrutura:');
    console.log('   • IDA: 3 opções GOL (CGH → CWB)');
    console.log('   • VOLTA: 4 opções GOL (CWB → CGH)');
    console.log('');
    console.log('🔗 Acesse:');
    console.log(`   http://localhost:5173/proposals/${proposal.id}/edit`);
    console.log('');
}

reset().catch(console.error);
