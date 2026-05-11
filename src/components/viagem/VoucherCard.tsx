import { FileText, Download } from 'lucide-react'
import type { TripItem } from '@/types/viagem'

interface VoucherCardProps {
  item: TripItem
}

export function VoucherCard({ item }: VoucherCardProps) {
  const operacional = item.operacional as Record<string, string | undefined>
  const comercial = item.comercial as Record<string, string | undefined>
  const titulo = comercial.titulo ?? 'Voucher'
  const voucherUrl = operacional.voucher_url
  const numeroReserva = operacional.numero_reserva

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
          {numeroReserva && (
            <p className="text-xs text-slate-500 mt-0.5">Reserva: {numeroReserva}</p>
          )}
        </div>
        {voucherUrl && (
          <a
            href={voucherUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
            aria-label="Baixar voucher"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>

      {operacional.endereco && (
        <p className="text-xs text-slate-600 mt-2">{operacional.endereco}</p>
      )}
      {operacional.telefone && (
        <p className="text-xs text-slate-600 mt-1">{operacional.telefone}</p>
      )}
    </div>
  )
}
