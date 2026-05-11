import { Heart, Users, MapPin } from 'lucide-react'
import ChartCard from '../ChartCard'

export default function WeddingProductWidgets() {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <Heart className="w-4 h-4 text-rose-500" />
                <h2 className="text-sm font-semibold text-slate-700">Dados do casamento</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ChartCard
                    title="Destinos de casamento"
                    description="Em breve"
                >
                    <div className="h-[160px] flex flex-col items-center justify-center gap-2 text-slate-400">
                        <MapPin className="w-8 h-8 opacity-40" />
                        <p className="text-xs text-center max-w-[200px]">
                            Locais de cerimônia mais vendidos — virá quando extrairmos os campos do card.
                        </p>
                    </div>
                </ChartCard>

                <ChartCard
                    title="Convidados por casamento"
                    description="Em breve"
                >
                    <div className="h-[160px] flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Users className="w-8 h-8 opacity-40" />
                        <p className="text-xs text-center max-w-[200px]">
                            Média e distribuição de convidados — requer normalização dos campos WEDDING.
                        </p>
                    </div>
                </ChartCard>

                <ChartCard
                    title="Tempo contrato → casamento"
                    description="Em breve"
                >
                    <div className="h-[160px] flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Heart className="w-8 h-8 opacity-40" />
                        <p className="text-xs text-center max-w-[200px]">
                            Tempo médio entre assinatura do contrato e a data do evento.
                        </p>
                    </div>
                </ChartCard>
            </div>
        </div>
    )
}
