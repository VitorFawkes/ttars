/**
 * Script para resetar propostas e criar exemplo com novo formato de voos
 *
 * Execute com: node scripts/reset-proposals.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseKey) {
    console.error('❌ SUPABASE_ANON_KEY is required')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function resetAndCreateProposal() {
    console.log('🗑️  Deletando propostas antigas...\n')

    // 1. Deletar items de propostas
    const { error: itemsError } = await supabase
        .from('proposal_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

    if (itemsError) console.log('Items:', itemsError.message)
    else console.log('✅ Items deletados')

    // 2. Deletar seções
    const { error: sectionsError } = await supabase
        .from('proposal_sections')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

    if (sectionsError) console.log('Sections:', sectionsError.message)
    else console.log('✅ Seções deletadas')

    // 3. Deletar versões
    const { error: versionsError } = await supabase
        .from('proposal_versions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

    if (versionsError) console.log('Versions:', versionsError.message)
    else console.log('✅ Versões deletadas')

    // 4. Deletar propostas
    const { error: proposalsError } = await supabase
        .from('proposals')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

    if (proposalsError) console.log('Proposals:', proposalsError.message)
    else console.log('✅ Propostas deletadas')

    console.log('\n📝 Criando nova proposta com formato de voos...\n')

    // 5. Buscar um card ou criar
    let { data: cards } = await supabase
        .from('cards')
        .select('id, titulo')
        .limit(1)

    let cardId

    if (!cards || cards.length === 0) {
        console.log('Criando card de teste...')
        const { data: newCard, error: cardError } = await supabase
            .from('cards')
            .insert({
                titulo: 'Viagem SP → Curitiba (Fevereiro 2026)',
            })
            .select()
            .single()

        if (cardError) {
            console.error('❌ Erro ao criar card:', cardError.message)
            return
        }
        cardId = newCard.id
        console.log('✅ Card criado:', newCard.titulo)
    } else {
        cardId = cards[0].id
        console.log('✅ Usando card existente:', cards[0].titulo)
    }

    // 6. Criar proposta
    const { data: proposal, error: propError } = await supabase
        .from('proposals')
        .insert({
            card_id: cardId,
            status: 'draft',
        })
        .select()
        .single()

    if (propError) {
        console.error('❌ Erro ao criar proposta:', propError.message)
        return
    }

    console.log('✅ Proposta criada:', proposal.id)

    // 7. Criar versão
    const { data: version, error: verError } = await supabase
        .from('proposal_versions')
        .insert({
            proposal_id: proposal.id,
            version_number: 1,
            title: 'Viagem São Paulo ↔ Curitiba',
        })
        .select()
        .single()

    if (verError) {
        console.error('❌ Erro ao criar versão:', verError.message)
        return
    }

    // 8. Atualizar proposta com versão ativa
    await supabase
        .from('proposals')
        .update({ active_version_id: version.id })
        .eq('id', proposal.id)

    // 9. Criar seção de voos
    const { data: flightSection, error: secError } = await supabase
        .from('proposal_sections')
        .insert({
            version_id: version.id,
            section_type: 'flights',
            title: 'Voos',
            ordem: 0,
            visible: true,
            config: {},
        })
        .select()
        .single()

    if (secError) {
        console.error('❌ Erro ao criar seção:', secError.message)
        return
    }

    // 10. Criar item de voo com NOVO FORMATO (legs + options)
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
                options: [
                    {
                        id: 'opt-gol-1100',
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
                        ordem: 0,
                    },
                    {
                        id: 'opt-gol-1104',
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
                        ordem: 1,
                    },
                    {
                        id: 'opt-gol-1106',
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
                        ordem: 2,
                    },
                ],
                ordem: 0,
                is_expanded: true,
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
                options: [
                    {
                        id: 'opt-gol-1117',
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
                        ordem: 0,
                    },
                    {
                        id: 'opt-gol-1573',
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
                        ordem: 1,
                    },
                    {
                        id: 'opt-gol-1121',
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
                        ordem: 2,
                    },
                    {
                        id: 'opt-gol-1137',
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
                        ordem: 3,
                    },
                ],
                ordem: 1,
                is_expanded: true,
            },
        ],
        show_prices: true,
        allow_mix_airlines: true,
        default_selections: {},
    }

    const { error: itemError } = await supabase
        .from('proposal_items')
        .insert({
            section_id: flightSection.id,
            item_type: 'flight',
            title: 'Opções de Voo GOL',
            description: 'Voos ida e volta São Paulo - Curitiba',
            base_price: 0,
            ordem: 0,
            is_optional: false,
            is_default_selected: true,
            rich_content: { flights: flightsData },
        })

    if (itemError) {
        console.error('❌ Erro ao criar item:', itemError.message)
        return
    }

    // 11. Criar seção de hotel de exemplo
    const { data: hotelSection } = await supabase
        .from('proposal_sections')
        .insert({
            version_id: version.id,
            section_type: 'hotels',
            title: 'Hospedagem',
            ordem: 1,
            visible: true,
            config: {},
        })
        .select()
        .single()

    if (hotelSection) {
        await supabase.from('proposal_items').insert({
            section_id: hotelSection.id,
            item_type: 'hotel',
            title: 'Hotel Curitiba Center',
            description: '3 noites com café da manhã',
            base_price: 850.00,
            ordem: 0,
            is_optional: false,
            is_default_selected: true,
            image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
            rich_content: {
                location_city: 'Curitiba',
                check_in: '2026-02-23',
                check_out: '2026-02-26',
                room_type: 'Superior',
                meal_plan: 'Café da manhã incluso',
            },
        })
    }

    console.log('\n' + '═'.repeat(60))
    console.log('✅ PROPOSTA CRIADA COM SUCESSO!')
    console.log('═'.repeat(60))
    console.log('\n📋 Estrutura criada:')
    console.log('   • Proposta com versão ativa')
    console.log('   • Seção de Voos com novo formato (legs + options)')
    console.log('   • 3 opções de IDA (GOL)')
    console.log('   • 4 opções de VOLTA (GOL)')
    console.log('   • Seção de Hotel de exemplo')
    console.log('\n🔗 Acesse:')
    console.log(`   http://localhost:5173/proposals/${proposal.id}/edit`)
    console.log('\n')
}

resetAndCreateProposal().catch(console.error)
