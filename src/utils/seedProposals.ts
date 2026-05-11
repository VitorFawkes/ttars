import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

/**
 * Seeds demonstration proposals for the CRM.
 * Creates realistic proposals with Builder V4 format:
 * - proposal_sections in the separate table
 * - proposal_items with rich_content namespaces (hotel, flights, experience, etc.)
 */
export async function seedProposals() {
    try {
        console.log('[seedProposals] Starting...')

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        console.log('[seedProposals] Auth result:', { userId: user?.id, authError })

        if (!user) throw new Error('Usuário não autenticado')

        // Get existing cards to link proposals
        const { data: cards, error: cardsError } = await supabase
            .from('cards')
            .select('id, titulo')
            .limit(5)

        console.log('[seedProposals] Cards query:', {
            count: cards?.length,
            cardsError,
            cards: cards?.map(c => ({ id: c.id, titulo: c.titulo }))
        })

        if (!cards || cards.length === 0) {
            toast.warning('Crie alguns cards no Pipeline antes de gerar propostas de exemplo')
            return false
        }

        // Check if we already have V4 proposals
        const { data: existingProposals } = await supabase
            .from('proposals')
            .select('id')
            .limit(1)

        if (existingProposals && existingProposals.length > 0) {
            toast.info('Propostas de exemplo já existem. Delete as existentes primeiro se quiser recriar.')
            return true
        }

        const card = cards[0]

        console.log('[seedProposals] Creating V4 format proposal...')

        // Generate IDs
        const proposalId = crypto.randomUUID()
        const versionId = crypto.randomUUID()
        const publicToken = generateToken(12)

        // Section IDs
        const flightsSectionId = crypto.randomUUID()
        const hotelsRomaSectionId = crypto.randomUUID()
        const hotelsFlorencaSectionId = crypto.randomUUID()
        const experiencesSectionId = crypto.randomUUID()
        const transfersSectionId = crypto.randomUUID()
        const insuranceSectionId = crypto.randomUUID()

        // 1. Create Proposal
        const { error: proposalError } = await supabase.from('proposals').insert({
            id: proposalId,
            card_id: card.id,
            status: 'sent',
            public_token: publicToken,
            created_by: user.id,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })

        if (proposalError) {
            console.error('[seedProposals] Error creating proposal:', proposalError)
            throw proposalError
        }

        // 2. Create Version
        const { error: versionError } = await supabase.from('proposal_versions').insert({
            id: versionId,
            proposal_id: proposalId,
            version_number: 1,
            title: 'Lua de Mel Itália - 12 Noites',
            created_by: user.id,
            metadata: {
                currency: 'BRL',
                show_secondary_currency: true,
                travel_dates: '15 Mar - 27 Mar 2025',
                travelers: '2 adultos'
            }
        })

        if (versionError) {
            console.error('[seedProposals] Error creating version:', versionError)
            throw versionError
        }

        // Update active_version_id
        await supabase.from('proposals').update({ active_version_id: versionId }).eq('id', proposalId)

        // 3. Create Sections
        const sections = [
            { id: flightsSectionId, version_id: versionId, section_type: 'flights' as const, title: 'Voos', ordem: 1, visible: true },
            { id: hotelsRomaSectionId, version_id: versionId, section_type: 'hotels' as const, title: 'Hospedagem em Roma', ordem: 2, visible: true },
            { id: hotelsFlorencaSectionId, version_id: versionId, section_type: 'hotels' as const, title: 'Hospedagem em Florença', ordem: 3, visible: true },
            { id: experiencesSectionId, version_id: versionId, section_type: 'custom' as const, title: 'Experiências', ordem: 4, visible: true },
            { id: transfersSectionId, version_id: versionId, section_type: 'custom' as const, title: 'Transfers', ordem: 5, visible: true },
            { id: insuranceSectionId, version_id: versionId, section_type: 'custom' as const, title: 'Seguro Viagem', ordem: 6, visible: true },
        ]

        const { error: sectionsError } = await supabase.from('proposal_sections').insert(sections)
        if (sectionsError) {
            console.error('[seedProposals] Error creating sections:', sectionsError)
            throw sectionsError
        }

        // 4. Create Items with Builder V4 format
        const items = createSampleItems({
            flightsSectionId,
            hotelsRomaSectionId,
            hotelsFlorencaSectionId,
            experiencesSectionId,
            transfersSectionId,
            insuranceSectionId
        })

        const { error: itemsError } = await supabase.from('proposal_items').insert(items)
        if (itemsError) {
            console.error('[seedProposals] Error creating items:', itemsError)
            throw itemsError
        }

        console.log('[seedProposals] Created V4 proposal successfully!')
        console.log(`[seedProposals] Public URL: /p/${publicToken}`)
        console.log(`[seedProposals] Builder URL: /proposals/${proposalId}/edit`)

        toast.success('Proposta de exemplo criada!')
        return true

    } catch (error) {
        console.error('[seedProposals] Error:', error)
        toast.error('Erro ao gerar proposta de exemplo')
        return false
    }
}

function generateToken(length = 12): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface SectionIds {
    flightsSectionId: string
    hotelsRomaSectionId: string
    hotelsFlorencaSectionId: string
    experiencesSectionId: string
    transfersSectionId: string
    insuranceSectionId: string
}

function createSampleItems(ids: SectionIds) {
    const items = []

    // ========== VOO ==========
    items.push({
        id: crypto.randomUUID(),
        section_id: ids.flightsSectionId,
        item_type: 'flight' as const,
        title: 'Voos São Paulo ↔ Roma',
        description: 'Voos LATAM diretos com refeições inclusas',
        base_price: 8500,
        ordem: 1,
        image_url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80',
        is_optional: false,
        is_default_selected: true,
        rich_content: {
            flights: {
                show_prices: true,
                allow_mix_airlines: false,
                default_selections: {},
                legs: [
                    {
                        id: 'leg-ida',
                        leg_type: 'outbound',
                        label: 'IDA',
                        origin_code: 'GRU',
                        origin_city: 'São Paulo',
                        destination_code: 'FCO',
                        destination_city: 'Roma',
                        date: '2025-03-15',
                        ordem: 0,
                        is_expanded: true,
                        options: [
                            {
                                id: 'opt-ida-1',
                                airline_code: 'LA',
                                airline_name: 'LATAM',
                                flight_number: 'LA8068',
                                departure_time: '22:45',
                                arrival_time: '14:30',
                                cabin_class: 'economy',
                                fare_family: 'plus',
                                equipment: 'Boeing 787-9',
                                stops: 0,
                                baggage: '1 mala 23kg',
                                price: 4250,
                                currency: 'BRL',
                                is_recommended: true,
                                enabled: true,
                                ordem: 0
                            },
                            {
                                id: 'opt-ida-2',
                                airline_code: 'AZ',
                                airline_name: 'ITA Airways',
                                flight_number: 'AZ673',
                                departure_time: '23:15',
                                arrival_time: '15:45',
                                cabin_class: 'economy',
                                fare_family: 'light',
                                equipment: 'Airbus A350',
                                stops: 0,
                                baggage: '1 mala 23kg',
                                price: 3900,
                                currency: 'BRL',
                                is_recommended: false,
                                enabled: true,
                                ordem: 1
                            }
                        ]
                    },
                    {
                        id: 'leg-volta',
                        leg_type: 'return',
                        label: 'VOLTA',
                        origin_code: 'FCO',
                        origin_city: 'Roma',
                        destination_code: 'GRU',
                        destination_city: 'São Paulo',
                        date: '2025-03-27',
                        ordem: 1,
                        is_expanded: true,
                        options: [
                            {
                                id: 'opt-volta-1',
                                airline_code: 'LA',
                                airline_name: 'LATAM',
                                flight_number: 'LA8069',
                                departure_time: '16:30',
                                arrival_time: '23:45',
                                cabin_class: 'economy',
                                fare_family: 'plus',
                                equipment: 'Boeing 787-9',
                                stops: 0,
                                baggage: '1 mala 23kg',
                                price: 4250,
                                currency: 'BRL',
                                is_recommended: true,
                                enabled: true,
                                ordem: 0
                            }
                        ]
                    }
                ]
            }
        }
    })

    // ========== HOTÉIS ROMA ==========
    items.push({
        id: crypto.randomUUID(),
        section_id: ids.hotelsRomaSectionId,
        item_type: 'hotel' as const,
        title: 'Hotel de Russie',
        description: 'Hotel 5 estrelas no coração de Roma, próximo à Piazza del Popolo.',
        base_price: 4500,
        ordem: 1,
        image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
        is_optional: false,
        is_default_selected: true,
        rich_content: {
            hotel: {
                hotel_name: 'Hotel de Russie - A Rocco Forte Hotel',
                star_rating: 5,
                location_city: 'Roma',
                room_type: 'Deluxe Room com Vista Jardim',
                board_type: 'breakfast',
                check_in_date: '2025-03-16',
                check_out_date: '2025-03-21',
                check_in_time: '15:00',
                check_out_time: '11:00',
                nights: 5,
                price_per_night: 900,
                currency: 'BRL',
                cancellation_policy: 'Cancelamento gratuito até 7 dias antes',
                amenities: ['Spa', 'Piscina', 'Academia', 'Restaurante', 'Bar', 'WiFi', 'Concierge'],
                options: [],
                image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
                images: [],
                description: null,
                notes: null
            }
        }
    })

    items.push({
        id: crypto.randomUUID(),
        section_id: ids.hotelsRomaSectionId,
        item_type: 'hotel' as const,
        title: 'Hotel Artemide',
        description: 'Boutique hotel 4 estrelas na Via Nazionale.',
        base_price: 2500,
        ordem: 2,
        image_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
        is_optional: false,
        is_default_selected: false,
        rich_content: {
            hotel: {
                hotel_name: 'Hotel Artemide',
                star_rating: 4,
                location_city: 'Roma',
                room_type: 'Superior Room',
                board_type: 'breakfast',
                check_in_date: '2025-03-16',
                check_out_date: '2025-03-21',
                check_in_time: '14:00',
                check_out_time: '12:00',
                nights: 5,
                price_per_night: 500,
                currency: 'BRL',
                cancellation_policy: 'Cancelamento gratuito até 3 dias antes',
                amenities: ['Spa', 'Academia', 'Bar', 'WiFi'],
                options: [],
                image_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
                images: [],
                description: null,
                notes: null
            }
        }
    })

    // ========== HOTÉIS FLORENÇA ==========
    items.push({
        id: crypto.randomUUID(),
        section_id: ids.hotelsFlorencaSectionId,
        item_type: 'hotel' as const,
        title: 'Four Seasons Firenze',
        description: 'Palácio renascentista com jardins botânicos privados.',
        base_price: 4200,
        ordem: 1,
        image_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80',
        is_optional: false,
        is_default_selected: true,
        rich_content: {
            hotel: {
                hotel_name: 'Four Seasons Hotel Firenze',
                star_rating: 5,
                location_city: 'Florença',
                room_type: 'Garden View Room',
                board_type: 'breakfast',
                check_in_date: '2025-03-21',
                check_out_date: '2025-03-27',
                check_in_time: '15:00',
                check_out_time: '12:00',
                nights: 6,
                price_per_night: 700,
                currency: 'BRL',
                cancellation_policy: 'Cancelamento gratuito até 14 dias antes',
                amenities: ['Spa', 'Piscina', 'Jardim', 'Restaurante', 'Bar', 'WiFi'],
                options: [],
                image_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80',
                images: [],
                description: null,
                notes: null
            }
        }
    })

    // ========== EXPERIÊNCIAS ==========
    items.push({
        id: crypto.randomUUID(),
        section_id: ids.experiencesSectionId,
        item_type: 'experience' as const,
        title: 'Tour Privado Vaticano',
        description: 'Acesso exclusivo antes da abertura. Museus, Capela Sistina e Basílica.',
        base_price: 450,
        ordem: 1,
        image_url: 'https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=800&q=80',
        is_optional: true,
        is_default_selected: true,
        rich_content: {
            experience: {
                name: 'Tour Privado pelo Vaticano',
                date: '2025-03-17',
                time: '07:00',
                duration: '4 horas',
                location_city: 'Roma',
                meeting_point: 'Entrada dos Museus do Vaticano',
                participants: 2,
                price_type: 'per_person',
                price: 225,
                currency: 'BRL',
                included: ['Guia em português', 'Ingressos sem fila', 'Fones de ouvido'],
                options: [],
                provider: 'GetYourGuide',
                cancellation_policy: 'Cancelamento gratuito até 48h antes',
                age_restriction: null,
                difficulty_level: 'easy',
                image_url: 'https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=800&q=80',
                description: 'Inclui Museus do Vaticano, Capela Sistina e Basílica de São Pedro.',
                notes: null
            }
        }
    })

    items.push({
        id: crypto.randomUUID(),
        section_id: ids.experiencesSectionId,
        item_type: 'experience' as const,
        title: 'Aula de Culinária Toscana',
        description: 'Aprenda a fazer massa fresca com chef local.',
        base_price: 320,
        ordem: 2,
        image_url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80',
        is_optional: true,
        is_default_selected: true,
        rich_content: {
            experience: {
                name: 'Aula de Culinária Toscana',
                date: '2025-03-22',
                time: '10:00',
                duration: '5 horas',
                location_city: 'Florença',
                meeting_point: 'Mercato Centrale',
                participants: 2,
                price_type: 'total',
                price: 320,
                currency: 'BRL',
                included: ['Ingredientes', 'Avental', 'Almoço', 'Vinhos', 'Receitas'],
                options: [],
                provider: 'Cooking with Nonna',
                cancellation_policy: 'Cancelamento gratuito até 24h antes',
                age_restriction: 'Maiores de 12 anos',
                difficulty_level: 'easy',
                image_url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80',
                description: null,
                notes: null
            }
        }
    })

    // ========== TRANSFERS ==========
    items.push({
        id: crypto.randomUUID(),
        section_id: ids.transfersSectionId,
        item_type: 'transfer' as const,
        title: 'Aeroporto Roma → Hotel',
        description: 'Recepção com placa personalizada.',
        base_price: 120,
        ordem: 1,
        image_url: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&q=80',
        is_optional: true,
        is_default_selected: true,
        rich_content: {
            transfer: {
                origin: 'Aeroporto Fiumicino (FCO)',
                origin_type: 'airport',
                destination: 'Hotel de Russie',
                destination_type: 'hotel',
                date: '2025-03-16',
                time: '15:30',
                vehicle_type: 'sedan',
                passengers: 2,
                price: 120,
                currency: 'BRL',
                notes: 'Motorista aguarda até 60 min',
                options: [],
                image_url: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&q=80',
                description: null,
                show_route: true,
                show_datetime: true,
                show_vehicle: true,
                show_passengers: true
            }
        }
    })

    items.push({
        id: crypto.randomUUID(),
        section_id: ids.transfersSectionId,
        item_type: 'transfer' as const,
        title: 'Roma → Florença (Trem)',
        description: 'Bilhetes Frecciarossa classe Business.',
        base_price: 180,
        ordem: 2,
        image_url: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=800&q=80',
        is_optional: false,
        is_default_selected: true,
        rich_content: {
            transfer: {
                origin: 'Roma Termini',
                origin_type: 'address',
                destination: 'Florença SMN',
                destination_type: 'address',
                date: '2025-03-21',
                time: '10:00',
                vehicle_type: 'bus',
                passengers: 2,
                price: 180,
                currency: 'BRL',
                notes: 'Classe Business',
                options: [],
                image_url: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=800&q=80',
                description: 'Frecciarossa - 1h30min',
                show_route: true,
                show_datetime: true,
                show_vehicle: false,
                show_passengers: true
            }
        }
    })

    // ========== SEGURO ==========
    items.push({
        id: crypto.randomUUID(),
        section_id: ids.insuranceSectionId,
        item_type: 'insurance' as const,
        title: 'Seguro Assist Card 60',
        description: 'Cobertura médica de USD 60.000.',
        base_price: 280,
        ordem: 1,
        image_url: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&q=80',
        is_optional: false,
        is_default_selected: true,
        rich_content: {
            insurance: {
                name: 'Assist Card 60',
                provider: 'assist_card',
                coverage_start: '2025-03-15',
                coverage_end: '2025-03-27',
                travelers: 2,
                medical_coverage: 60000,
                medical_coverage_currency: 'USD',
                price: 140,
                price_type: 'per_person',
                coverages: [
                    'Despesas médicas: USD 60.000',
                    'Translado médico',
                    'Cancelamento: USD 2.000',
                    'Extravio bagagem: USD 1.200'
                ],
                policy_number: null,
                description: 'Seguro essencial para Europa',
                notes: '',
                image_url: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&q=80',
                options: [],
                show_coverage_dates: true,
                show_medical_value: true
            }
        }
    })

    items.push({
        id: crypto.randomUUID(),
        section_id: ids.insuranceSectionId,
        item_type: 'insurance' as const,
        title: 'Seguro Allianz Premium',
        description: 'Cobertura USD 150.000, sem franquia.',
        base_price: 480,
        ordem: 2,
        image_url: null,
        is_optional: false,
        is_default_selected: false,
        rich_content: {
            insurance: {
                name: 'Allianz Travel Premium',
                provider: 'allianz',
                coverage_start: '2025-03-15',
                coverage_end: '2025-03-27',
                travelers: 2,
                medical_coverage: 150000,
                medical_coverage_currency: 'USD',
                price: 240,
                price_type: 'per_person',
                coverages: [
                    'Despesas médicas: USD 150.000',
                    'Translado ilimitado',
                    'Cancelamento: USD 5.000',
                    'Extravio bagagem: USD 2.500',
                    'COVID-19 incluso',
                    'Sem franquia'
                ],
                policy_number: null,
                description: 'Proteção completa',
                notes: '',
                image_url: null,
                options: [],
                show_coverage_dates: true,
                show_medical_value: true
            }
        }
    })

    return items
}
