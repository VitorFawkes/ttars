import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const TEMPLATES = [
    {
        name: 'Lua de Mel nas Maldivas (Luxo)',
        description: 'Roteiro romântico de 7 dias em bungalow sobre as águas com experiências exclusivas.',
        icon: 'heart',
        is_global: true,
        sections: [
            {
                id: 'cover',
                type: 'cover',
                title: 'Capa',
                order: 0,
                items: []
            },
            {
                id: 'intro',
                type: 'text',
                title: 'Introdução',
                order: 1,
                items: [
                    {
                        id: 'intro-text',
                        type: 'text',
                        content: 'Preparem-se para viver os dias mais inesquecíveis de suas vidas. As Maldivas são o cenário perfeito para celebrar o amor, com águas cristalinas, areia branca e um serviço impecável.',
                        order: 0
                    }
                ]
            },
            {
                id: 'itinerary',
                type: 'day_by_day',
                title: 'Roteiro Dia a Dia',
                order: 2,
                items: [
                    {
                        id: 'day-1',
                        type: 'day',
                        title: 'Dia 1: Chegada ao Paraíso',
                        description: 'Chegada em Malé e transfer de hidroavião para o resort. Check-in no Water Villa e tarde livre para relaxar.',
                        image_url: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?q=80&w=2665&auto=format&fit=crop',
                        order: 0
                    },
                    {
                        id: 'day-2',
                        type: 'day',
                        title: 'Dia 2: Café da Manhã Flutuante',
                        description: 'Comece o dia com um café da manhã servido na piscina privativa do seu bungalow.',
                        image_url: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=2670&auto=format&fit=crop',
                        order: 1
                    },
                    {
                        id: 'day-3',
                        type: 'day',
                        title: 'Dia 3: Jantar Submarino',
                        description: 'Experiência gastronômica única no restaurante Ithaa Undersea Restaurant.',
                        image_url: 'https://images.unsplash.com/photo-1590523277543-a94d2e4eb00b?q=80&w=2664&auto=format&fit=crop',
                        order: 2
                    }
                ]
            },
            {
                id: 'accommodation',
                type: 'accommodation',
                title: 'Hospedagem',
                order: 3,
                items: [
                    {
                        id: 'hotel-1',
                        type: 'hotel',
                        title: 'Soneva Jani',
                        description: 'Water Retreat com escorregador para o mar. All Inclusive Premium.',
                        image_url: 'https://images.unsplash.com/photo-1573843981267-be1999ff37cd?q=80&w=2574&auto=format&fit=crop',
                        price: 45000,
                        currency: 'BRL',
                        order: 0
                    }
                ]
            },
            {
                id: 'flights',
                type: 'flights',
                title: 'Vôos',
                order: 4,
                items: [
                    {
                        id: 'flight-1',
                        type: 'flight',
                        title: 'Emirates - Business Class',
                        description: 'São Paulo (GRU) -> Malé (MLE) com conexão em Dubai.',
                        price: 28000,
                        currency: 'BRL',
                        order: 0
                    }
                ]
            }
        ]
    },
    {
        name: 'Disney Magic Family',
        description: 'A magia de Orlando para toda a família. Parques, compras e diversão.',
        icon: 'sparkles',
        is_global: true,
        sections: [
            {
                id: 'cover',
                type: 'cover',
                title: 'Capa',
                order: 0,
                items: []
            },
            {
                id: 'itinerary',
                type: 'day_by_day',
                title: 'Roteiro dos Parques',
                order: 1,
                items: [
                    {
                        id: 'day-1',
                        type: 'day',
                        title: 'Dia 1: Magic Kingdom',
                        description: 'Onde os sonhos se tornam realidade. Castelo da Cinderela e fogos à noite.',
                        image_url: 'https://images.unsplash.com/photo-1628191011993-43508d5317d4?q=80&w=2670&auto=format&fit=crop',
                        order: 0
                    },
                    {
                        id: 'day-2',
                        type: 'day',
                        title: 'Dia 2: Epcot',
                        description: 'Volta ao mundo em um dia e guardiões da galáxia.',
                        image_url: 'https://images.unsplash.com/photo-1597466599360-3b9775841aec?q=80&w=2664&auto=format&fit=crop',
                        order: 1
                    }
                ]
            },
            {
                id: 'accommodation',
                type: 'accommodation',
                title: 'Hospedagem',
                order: 2,
                items: [
                    {
                        id: 'hotel-1',
                        type: 'hotel',
                        title: "Disney's Art of Animation Resort",
                        description: 'Suíte familiar temática (O Rei Leão, Carros ou Nemo).',
                        image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2670&auto=format&fit=crop',
                        price: 12000,
                        currency: 'BRL',
                        order: 0
                    }
                ]
            },
            {
                id: 'tickets',
                type: 'services',
                title: 'Ingressos e Serviços',
                order: 3,
                items: [
                    {
                        id: 'ticket-1',
                        type: 'service',
                        title: '4-Day Park Hopper Plus',
                        description: 'Acesso a todos os 4 parques temáticos + parques aquáticos.',
                        price: 4500,
                        currency: 'BRL',
                        order: 0
                    }
                ]
            }
        ]
    },
    {
        name: 'Eurotrip Clássica',
        description: 'O melhor de Londres, Paris e Roma em 12 dias.',
        icon: 'map',
        is_global: true,
        sections: [
            {
                id: 'cover',
                type: 'cover',
                title: 'Capa',
                order: 0,
                items: []
            },
            {
                id: 'itinerary',
                type: 'day_by_day',
                title: 'Roteiro',
                order: 1,
                items: [
                    {
                        id: 'day-1',
                        type: 'day',
                        title: 'Londres: A Realeza',
                        description: 'Big Ben, London Eye e Palácio de Buckingham.',
                        image_url: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=2670&auto=format&fit=crop',
                        order: 0
                    },
                    {
                        id: 'day-4',
                        type: 'day',
                        title: 'Paris: Cidade Luz',
                        description: 'Torre Eiffel, Louvre e passeio pelo Sena.',
                        image_url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=2673&auto=format&fit=crop',
                        order: 1
                    },
                    {
                        id: 'day-8',
                        type: 'day',
                        title: 'Roma: História Viva',
                        description: 'Coliseu, Vaticano e Fontana di Trevi.',
                        image_url: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=2596&auto=format&fit=crop',
                        order: 2
                    }
                ]
            },
            {
                id: 'transport',
                type: 'transport',
                title: 'Deslocamentos',
                order: 2,
                items: [
                    {
                        id: 'train-1',
                        type: 'transport',
                        title: 'Eurostar: Londres -> Paris',
                        description: 'Trem de alta velocidade pelo Canal da Mancha.',
                        price: 800,
                        currency: 'BRL',
                        order: 0
                    }
                ]
            }
        ]
    }
]

export async function seedTemplates() {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Usuário não autenticado')

        console.log('Starting seed...')

        for (const template of TEMPLATES) {
            // Check if exists
            const { data: existing } = await supabase
                .from('proposal_templates')
                .select('id')
                .eq('name', template.name)
                .single()

            if (!existing) {
                const { error } = await supabase
                    .from('proposal_templates')
                    .insert({
                        ...template,
                        created_by: user.id,
                        usage_count: 0
                    })

                if (error) {
                    console.error('Error creating template:', template.name, error)
                } else {
                    console.log('Created template:', template.name)
                }
            } else {
                console.log('Template already exists:', template.name)
            }
        }

        toast.success('Templates gerados com sucesso!')
        return true
    } catch (error) {
        console.error('Error seeding templates:', error)
        toast.error('Erro ao gerar templates')
        return false
    }
}
