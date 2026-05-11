import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Mail, Phone, User } from 'lucide-react'

interface CardPeopleProps {
    cardId: string
}

export default function CardPeople({ cardId }: CardPeopleProps) {
    const { data: people, isLoading } = useQuery({
        queryKey: ['card-people', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('participacoes')
                .select(`
          id,
          papel,
          pessoa:pessoas (
            id,
            nome,
            email,
            telefone,
            cidade,
            estado
          )
        `)
                .eq('card_id', cardId)

            if (error) throw error
            return data
        }
    })

    if (isLoading) return <div className="p-4 text-center text-sm text-gray-500">Carregando pessoas...</div>

    if (!people || people.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-8 text-center">
                <User className="mx-auto h-8 w-8 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhuma pessoa vinculada</h3>
                <p className="mt-1 text-sm text-gray-500">Adicione clientes ou parceiros a este card.</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((participation: any) => (
                <div key={participation.id} className="flex flex-col rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold">
                                {participation.pessoa.nome.charAt(0)}
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-gray-900">{participation.pessoa.nome}</h4>
                                <p className="text-xs text-gray-500 capitalize">{participation.papel.replace('_', ' ')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 space-y-2">
                        {participation.pessoa.email && (
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                <Mail className="h-3 w-3" />
                                <a href={`mailto:${participation.pessoa.email}`} className="hover:underline">
                                    {participation.pessoa.email}
                                </a>
                            </div>
                        )}
                        {participation.pessoa.telefone && (
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                <Phone className="h-3 w-3" />
                                <a href={`tel:${participation.pessoa.telefone}`} className="hover:underline">
                                    {participation.pessoa.telefone}
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
