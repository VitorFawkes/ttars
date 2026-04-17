/**
 * Script para criar uma proposta de teste com voos
 *
 * Execute com: npx tsx scripts/create-test-proposal.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseKey) {
    console.error('❌ VITE_SUPABASE_ANON_KEY não encontrada')
    console.log('Execute: source .env.local ou exporte a variável')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function createTestProposal() {
    console.log('🚀 Criando proposta de teste...\n')

    // 1. Buscar um card existente ou criar um
    const { data: cards, error: cardsError } = await supabase
        .from('cards')
        .select('id, titulo')
        .limit(1)

    if (cardsError) {
        console.error('❌ Erro ao buscar cards:', cardsError.message)
        return
    }

    let cardId: string

    if (!cards || cards.length === 0) {
        console.log('📝 Nenhum card encontrado, criando um de teste...')

        const { data: newCard, error: newCardError } = await supabase
            .from('cards')
            .insert({
                titulo: 'Viagem Teste - São Paulo → Curitiba',
                status: 'proposta',
                origem: 'São Paulo',
                destino: 'Curitiba',
                data_viagem_inicio: '2026-02-23',
                data_viagem_fim: '2026-02-26',
            })
            .select()
            .single()

        if (newCardError) {
            console.error('❌ Erro ao criar card:', newCardError.message)
            return
        }

        cardId = newCard.id
        console.log('✅ Card criado:', newCard.titulo)
    } else {
        cardId = cards[0].id
        console.log('✅ Usando card existente:', cards[0].titulo)
    }

    // 2. Criar proposta
    const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .insert({
            card_id: cardId,
            status: 'draft',
        })
        .select()
        .single()

    if (proposalError) {
        console.error('❌ Erro ao criar proposta:', proposalError.message)
        return
    }

    console.log('✅ Proposta criada:', proposal.id)

    // 3. Criar versão
    const { data: version, error: versionError } = await supabase
        .from('proposal_versions')
        .insert({
            proposal_id: proposal.id,
            version_number: 1,
            title: 'Viagem São Paulo → Curitiba (Teste de Voos)',
        })
        .select()
        .single()

    if (versionError) {
        console.error('❌ Erro ao criar versão:', versionError.message)
        return
    }

    // 4. Atualizar proposta com versão ativa
    await supabase
        .from('proposals')
        .update({ active_version_id: version.id })
        .eq('id', proposal.id)

    // 5. Criar seção de voos
    const { data: section, error: sectionError } = await supabase
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

    if (sectionError) {
        console.error('❌ Erro ao criar seção:', sectionError.message)
        return
    }

    // 6. Criar item de voo com a nova estrutura de legs/options
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
                        id: 'opt-ida-1',
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
                        id: 'opt-ida-2',
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
                        id: 'opt-ida-3',
                        airline_code: 'AD',
                        airline_name: 'Azul',
                        flight_number: '6404',
                        departure_time: '12:25',
                        arrival_time: '13:25',
                        cabin_class: 'economy',
                        fare_family: 'plus',
                        equipment: 'E95',
                        stops: 0,
                        baggage: '1 mala 23kg',
                        price: 370.94,
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
                        id: 'opt-volta-1',
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
                        id: 'opt-volta-2',
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
                        id: 'opt-volta-3',
                        airline_code: 'AD',
                        airline_name: 'Azul',
                        flight_number: '6025',
                        departure_time: '16:45',
                        arrival_time: '17:50',
                        cabin_class: 'economy',
                        fare_family: 'plus',
                        equipment: '295',
                        stops: 0,
                        baggage: '1 mala 23kg',
                        price: 193.12,
                        currency: 'BRL',
                        is_recommended: false,
                        ordem: 2,
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
            section_id: section.id,
            item_type: 'flight',
            title: 'Voos São Paulo ↔ Curitiba',
            description: 'Opções de voo ida e volta',
            base_price: 0,
            ordem: 0,
            is_optional: false,
            is_default_selected: true,
            rich_content: { flights: flightsData },
        })

    if (itemError) {
        console.error('❌ Erro ao criar item de voo:', itemError.message)
        return
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ PROPOSTA DE TESTE CRIADA COM SUCESSO!')
    console.log('='.repeat(60))
    console.log('\n📋 Detalhes:')
    console.log(`   Proposta ID: ${proposal.id}`)
    console.log(`   Versão ID: ${version.id}`)
    console.log(`   Card ID: ${cardId}`)
    console.log('\n🔗 Acesse no navegador:')
    console.log(`   http://localhost:5173/proposals/${proposal.id}/edit`)
    console.log('\n')
}

createTestProposal().catch(console.error)
