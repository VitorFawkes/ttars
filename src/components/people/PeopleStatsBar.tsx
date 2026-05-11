import { User, DollarSign, Plane, Crown } from 'lucide-react'

interface PeopleStatsBarProps {
    totalPeople: number
    totalSpend?: number
    totalTrips?: number
    totalLeaders?: number
}

export default function PeopleStatsBar({ totalPeople, totalSpend = 0, totalTrips = 0, totalLeaders = 0 }: PeopleStatsBarProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total de Contatos</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{totalPeople}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <User className="h-5 w-5" />
                </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Total</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totalSpend)}
                    </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <DollarSign className="h-5 w-5" />
                </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Viagens Realizadas</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{totalTrips}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Plane className="h-5 w-5" />
                </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Líderes de Grupo</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{totalLeaders}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                    <Crown className="h-5 w-5" />
                </div>
            </div>
        </div>
    )
}
