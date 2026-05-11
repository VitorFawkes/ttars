import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ArrowRight } from 'lucide-react'

interface StickyFooterProps {
    total: number
    proposalId: string
}

export function StickyFooter({ total, proposalId }: StickyFooterProps) {
    const navigate = useNavigate()

    const formatPrice = (value: number) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)

    const handleReview = () => {
        // Navigate to review page (to be implemented)
        navigate(`/p/${proposalId}/review`)
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg safe-area-bottom">
            <div className="px-4 py-4 flex items-center justify-between gap-4">
                {/* Total */}
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total</p>
                    <p className="text-2xl font-bold text-green-600">{formatPrice(total)}</p>
                </div>

                {/* CTA Button */}
                <Button
                    size="lg"
                    onClick={handleReview}
                    className="flex-shrink-0 h-12 px-6 text-base font-semibold"
                >
                    Revisar e Aceitar
                    <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
            </div>
        </div>
    )
}
