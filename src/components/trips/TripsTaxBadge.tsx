import { Badge } from '../ui/Badge'
import { cn } from '../../lib/utils'

export type TripsProdutoData = {
    taxa_planejamento?: {
        ativa: boolean
        status: 'pendente' | 'paga' | 'cortesia' | 'nao_aplicavel' | 'nao_ativa'
        valor: number
        data_status?: string
    }
}

interface TripsTaxBadgeProps {
    taxaData?: TripsProdutoData['taxa_planejamento']
    className?: string
}

export default function TripsTaxBadge({ taxaData, className }: TripsTaxBadgeProps) {
    if (!taxaData || !taxaData.ativa) {
        return null
    }

    const status = (taxaData.status || 'nao_ativa') as keyof typeof statusConfig

    const statusConfig = {
        pendente: {
            label: 'Taxa Pendente',
            className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            icon: '⏳'
        },
        paga: {
            label: 'Taxa Paga',
            className: 'bg-green-100 text-green-800 border-green-200',
            icon: '✓'
        },
        cortesia: {
            label: 'Cortesia',
            className: 'bg-blue-100 text-blue-800 border-blue-200',
            icon: '🎁'
        },
        nao_aplicavel: {
            label: 'Taxa N/A',
            className: 'bg-gray-100 text-gray-600 border-gray-200',
            icon: '—'
        },
        nao_ativa: {
            label: 'Sem Taxa',
            className: 'bg-gray-100 text-gray-500 border-gray-200',
            icon: '○'
        }
    }

    const config = statusConfig[status]

    return (
        <Badge
            variant="outline"
            className={cn(
                'font-medium text-xs px-2 py-0.5 border',
                config.className,
                className
            )}
        >
            <span className="mr-1">{config.icon}</span>
            {config.label}
            {taxaData.valor && status !== 'nao_aplicavel' && status !== 'nao_ativa' && (
                <span className="ml-1 font-semibold">
                    {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        maximumFractionDigits: 0
                    }).format(taxaData.valor)}
                </span>
            )}
        </Badge>
    )
}
