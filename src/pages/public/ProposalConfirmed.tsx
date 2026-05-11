import { useParams, useNavigate } from 'react-router-dom'
import { usePublicProposal } from '@/hooks/useProposal'
import { Button } from '@/components/ui/Button'
import {
    Loader2,
    CheckCircle2,
    MessageCircle,
    Calendar,
    Download,
    Sparkles
} from 'lucide-react'

export default function ProposalConfirmed() {
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()
    const { data: proposal, isLoading } = usePublicProposal(token!)

    const version = proposal?.active_version

    if (isLoading) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
                <Loader2 className="h-10 w-10 animate-spin text-green-500" />
            </div>
        )
    }

    return (
        <div className="min-h-dvh bg-gradient-to-br from-green-50 to-emerald-100 flex flex-col">
            {/* Success Animation */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                {/* Animated Check */}
                <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center animate-bounce-once">
                        <CheckCircle2 className="h-14 w-14 text-white" />
                    </div>
                    <div className="absolute -top-2 -right-2">
                        <Sparkles className="h-8 w-8 text-yellow-400" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-green-900 mb-3">
                    Proposta Aceita!
                </h1>

                <p className="text-green-700 text-lg mb-2">
                    {version?.title || 'Sua Viagem'}
                </p>

                <p className="text-green-600/80 max-w-sm">
                    Sua consultora foi notificada e entrará em contato em breve
                    para os próximos passos.
                </p>
            </div>

            {/* Actions */}
            <div className="p-6 space-y-3 pb-safe">
                {/* Contact WhatsApp */}
                <Button
                    size="lg"
                    className="w-full h-14"
                    onClick={() => {
                        // This would use the consultant's WhatsApp
                        window.open('https://wa.me/?text=Olá! Acabei de aceitar a proposta para minha viagem.', '_blank')
                    }}
                >
                    <MessageCircle className="h-5 w-5 mr-2" />
                    Falar com Consultora
                </Button>

                {/* Secondary Actions */}
                <div className="grid grid-cols-2 gap-3">
                    <Button
                        variant="outline"
                        size="lg"
                        className="h-12"
                        onClick={() => navigate(`/p/${token}`)}
                    >
                        <Calendar className="h-4 w-4 mr-2" />
                        Ver Proposta
                    </Button>

                    <Button
                        variant="outline"
                        size="lg"
                        className="h-12"
                        disabled
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar PDF
                    </Button>
                </div>
            </div>

            {/* Custom Animation Style */}
            <style>{`
        @keyframes bounce-once {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        .animate-bounce-once {
          animation: bounce-once 0.5s ease-in-out;
        }
      `}</style>
        </div>
    )
}
