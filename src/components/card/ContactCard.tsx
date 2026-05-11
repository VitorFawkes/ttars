import { Phone, Mail, MessageSquare } from 'lucide-react'
import type { Database } from '../../database.types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface ContactCardProps {
    card: Card
}

export default function ContactCard({ card }: ContactCardProps) {
    return (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Contato Principal</h3>
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold">
                        {card.pessoa_nome?.charAt(0) || 'L'}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{card.pessoa_nome || 'Lead'}</p>
                        <p className="text-xs text-gray-500">Cliente Principal</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                        <Phone className="h-3.5 w-3.5" />
                        Ligar
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors">
                        <MessageSquare className="h-3.5 w-3.5" />
                        WhatsApp
                    </button>
                </div>
                <button className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    Enviar Email
                </button>
            </div>
        </div>
    )
}
