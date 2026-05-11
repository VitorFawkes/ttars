import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowUpDown, Crown, Baby, User, Loader2 } from 'lucide-react'
import type { Person, PeopleSort } from '../../hooks/usePeopleIntelligence'
import { Badge } from '../ui/Badge'

interface PeopleGridProps {
    people: Person[]
    loading: boolean
    sort: PeopleSort
    setSort: (sort: PeopleSort) => void
    onPersonClick: (person: Person) => void
}

export default function PeopleGrid({ people, loading, sort, setSort, onPersonClick }: PeopleGridProps) {
    const handleSort = (column: PeopleSort['column']) => {
        if (sort.column === column) {
            setSort({ column, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
        } else {
            setSort({ column, direction: 'desc' }) // Default to desc for metrics
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    if (people.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <User className="h-12 w-12 mb-4 text-gray-300" />
                <p className="text-lg font-medium">Nenhum contato encontrado</p>
                <p className="text-sm">Tente ajustar seus filtros de busca</p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th
                            className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => handleSort('nome')}
                        >
                            <div className="flex items-center gap-2">
                                Nome
                                <ArrowUpDown className={`h-3 w-3 ${sort.column === 'nome' ? (sort.direction === 'asc' ? 'text-indigo-600' : 'text-indigo-600 rotate-180') : 'text-gray-300'}`} />
                            </div>
                        </th>
                        <th className="px-6 py-4">Contato</th>
                        <th
                            className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors text-right"
                            onClick={() => handleSort('total_spend')}
                        >
                            <div className="flex items-center justify-end gap-2">
                                Valor Total
                                <ArrowUpDown className={`h-3 w-3 ${sort.column === 'total_spend' ? (sort.direction === 'asc' ? 'text-indigo-600' : 'text-indigo-600 rotate-180') : 'text-gray-300'}`} />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors text-center"
                            onClick={() => handleSort('total_trips')}
                        >
                            <div className="flex items-center justify-center gap-2">
                                Viagens
                                <ArrowUpDown className={`h-3 w-3 ${sort.column === 'total_trips' ? (sort.direction === 'asc' ? 'text-indigo-600' : 'text-indigo-600 rotate-180') : 'text-gray-300'}`} />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => handleSort('last_trip_date')}
                        >
                            <div className="flex items-center gap-2">
                                Última Viagem
                                <ArrowUpDown className={`h-3 w-3 ${sort.column === 'last_trip_date' ? (sort.direction === 'asc' ? 'text-indigo-600' : 'text-indigo-600 rotate-180') : 'text-gray-300'}`} />
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {people.map((person) => (
                        <tr
                            key={person.id}
                            onClick={() => onPersonClick(person)}
                            className="group hover:bg-indigo-50/30 transition-colors cursor-pointer"
                        >
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-medium text-sm group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                        {(person.nome || 'S').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-900">
                                                {[person.nome, person.sobrenome].filter(Boolean).join(' ') || 'Sem Nome'}
                                            </span>
                                            {person.stats?.is_group_leader && (
                                                <Crown className="h-3 w-3 text-amber-500 fill-amber-500" />
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigator.clipboard.writeText(person.id);
                                                    // You can add a toast here if you like, but it can be annoying in a list
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-indigo-100 rounded text-gray-400 hover:text-indigo-600 transition-all"
                                                title="Copiar ID"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {person.tipo_pessoa === 'crianca' ? (
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                                    <Baby className="h-3 w-3 mr-1" />
                                                    Não Adulto
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-gray-200 text-gray-500">
                                                    <User className="h-3 w-3 mr-1" />
                                                    Adulto
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="space-y-1">
                                    {person.email && (
                                        <p className="text-sm text-gray-600">{person.email}</p>
                                    )}
                                    {person.telefone && (
                                        <p className="text-xs text-gray-400">{person.telefone}</p>
                                    )}
                                    {!person.email && !person.telefone && (
                                        <span className="text-xs text-gray-300 italic">Sem contato</span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="font-medium text-gray-900">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(person.stats?.total_spend || 0)}
                                </div>
                                {person.stats?.total_trips && person.stats.total_trips > 0 && (
                                    <div className="text-xs text-gray-400">
                                        Média: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((person.stats.total_spend || 0) / person.stats.total_trips)}
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 group-hover:bg-indigo-100 group-hover:text-indigo-700 transition-colors">
                                    {person.stats?.total_trips || 0}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                {person.stats?.last_trip_date ? (
                                    <div>
                                        <p className="text-sm text-gray-900">
                                            {format(new Date(person.stats.last_trip_date), "MMM yyyy", { locale: ptBR })}
                                        </p>
                                        <p className="text-xs text-gray-400 capitalize">
                                            {person.stats.top_destinations?.[0] || 'Destino desconhecido'}
                                        </p>
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-400">Nunca viajou</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
