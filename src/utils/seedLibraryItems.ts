import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { LibraryCategory } from '@/hooks/useLibrary'

interface LibraryItemSeed {
    name: string
    category: LibraryCategory
    content: Record<string, unknown>
    base_price: number
    currency: string
    supplier: string | null
    destination: string | null
    tags: string[]
    is_shared: boolean
}

const LIBRARY_ITEMS: LibraryItemSeed[] = [
    {
        name: 'Hotel Fasano Rio de Janeiro',
        category: 'hotel',
        content: {
            description: 'Luxo à beira-mar de Ipanema. Rooftop com vista panorâmica e piscina com hidromassagem.',
            images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2670&auto=format&fit=crop'],
            highlights: ['Café da manhã incluso', 'Spa completo', 'Academia 24h'],
            specs: {
                'Check-in': '15:00',
                'Check-out': '12:00',
                'Tipo': 'Suite Ocean View'
            }
        },
        base_price: 2500,
        currency: 'BRL',
        supplier: 'Fasano Group',
        destination: 'Rio de Janeiro',
        tags: ['luxo', 'praia', 'lua-de-mel'],
        is_shared: true
    },
    {
        name: 'LATAM Business Class SP-MIA',
        category: 'flight',
        content: {
            description: 'Voo direto São Paulo (GRU) para Miami (MIA). Assento cama 180°, menu degustação e bar.',
            images: ['https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2574&auto=format&fit=crop'],
            highlights: ['Acesso ao lounge VIP', 'Embarque prioritário', 'Franquia 2x32kg'],
            specs: {
                'Duração': '9h 30min',
                'Aeronave': 'Boeing 787 Dreamliner',
                'Frequência': 'Diário'
            }
        },
        base_price: 12000,
        currency: 'BRL',
        supplier: 'LATAM Airlines',
        destination: 'Miami',
        tags: ['executivo', 'estados-unidos', 'voo-direto'],
        is_shared: true
    },
    {
        name: 'Passeio de Helicóptero NYC',
        category: 'experience',
        content: {
            description: 'Sobrevoe Manhattan, Estátua da Liberdade e Brooklyn Bridge. 20 minutos de voo inesquecível.',
            images: ['https://images.unsplash.com/photo-1534430480872-3498386e7856?q=80&w=2670&auto=format&fit=crop'],
            highlights: ['Fones com narração', 'Fotos profissionais', 'Champagne após'],
            specs: {
                'Duração': '20 minutos',
                'Capacidade': '4 pessoas',
                'Partida': 'Downtown Manhattan Heliport'
            }
        },
        base_price: 1800,
        currency: 'BRL',
        supplier: 'HeliNY',
        destination: 'Nova York',
        tags: ['aventura', 'romantico', 'premium'],
        is_shared: true
    },
    {
        name: 'SUV Executivo - Aeroporto/Hotel',
        category: 'transfer',
        content: {
            description: 'Transfer privativo em SUV de luxo com motorista bilíngue. Wi-Fi e água mineral.',
            images: ['https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?q=80&w=2670&auto=format&fit=crop'],
            highlights: ['Motorista uniformizado', 'Atendimento 24h', 'Cancelamento gratuito até 24h'],
            specs: {
                'Veículo': 'Cadillac Escalade ou similar',
                'Capacidade': '6 passageiros',
                'Bagagem': '8 malas'
            }
        },
        base_price: 450,
        currency: 'BRL',
        supplier: 'Blacklane',
        destination: null,
        tags: ['aeroporto', 'privativo', 'luxo'],
        is_shared: true
    },
    {
        name: 'Seguro Viagem Premium',
        category: 'service',
        content: {
            description: 'Cobertura completa até USD 300.000. Inclui COVID, bagagem e cancelamento.',
            images: ['https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=80&w=2670&auto=format&fit=crop'],
            highlights: ['Assistência 24h em português', 'Cobertura médica USD 300k', 'Cancelamento de viagem'],
            specs: {
                'Cobertura Médica': 'USD 300.000',
                'Bagagem': 'USD 2.500',
                'Cancelamento': 'Até R$ 20.000'
            }
        },
        base_price: 350,
        currency: 'BRL',
        supplier: 'Allianz Travel',
        destination: null,
        tags: ['seguro', 'obrigatorio', 'europa'],
        is_shared: true
    }
]

export async function seedLibraryItems() {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Usuário não autenticado')

        console.log('Starting library seed...')
        let created = 0

        for (const item of LIBRARY_ITEMS) {
            // Check if exists
            const { data: existing } = await supabase
                .from('proposal_library')
                .select('id')
                .eq('name', item.name)
                .single()

            if (!existing) {
                const { error } = await supabase
                    .from('proposal_library')
                    .insert({
                        ...item,
                        content: item.content as any,
                        created_by: user.id
                    })

                if (error) {
                    console.error('Error creating library item:', item.name, error)
                } else {
                    console.log('Created library item:', item.name)
                    created++
                }
            } else {
                console.log('Library item already exists:', item.name)
            }
        }

        if (created > 0) {
            toast.success(`${created} itens adicionados à biblioteca!`)
        } else {
            toast.info('Todos os itens de exemplo já existem')
        }
        return true
    } catch (error) {
        console.error('Error seeding library:', error)
        toast.error('Erro ao gerar itens da biblioteca')
        return false
    }
}
