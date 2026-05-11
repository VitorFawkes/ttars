/**
 * MobileAcceptModal - Modal de confirmação de aceite
 */

import { useState } from 'react'
import { X, CheckCircle2, Loader2 } from 'lucide-react'
import { formatPrice, type Currency } from '../shared/utils/priceUtils'

interface SelectedItem {
  id: string
  title: string
  type: string
  price: number
  quantity: number
  optionLabel?: string
}

interface MobileAcceptModalProps {
  isOpen: boolean
  onClose: () => void
  selectedItems: SelectedItem[]
  total: number
  currency?: Currency
  isAccepting: boolean
  isAccepted: boolean
  error: string | null
  onConfirm: (notes: string) => void
}

export function MobileAcceptModal({
  isOpen,
  onClose,
  selectedItems,
  total,
  currency = 'BRL',
  isAccepting,
  isAccepted,
  error,
  onConfirm,
}: MobileAcceptModalProps) {
  const [notes, setNotes] = useState('')

  if (!isOpen) return null

  // Step: confirm | loading | success
  const step = isAccepted ? 'success' : isAccepting ? 'loading' : 'confirm'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={step === 'confirm' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white w-full max-w-lg rounded-t-3xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            {step === 'success' ? 'Proposta Aceita!' : 'Confirmar Proposta'}
          </h2>
          {step === 'confirm' && (
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh] p-6">
          {step === 'confirm' && (
            <>
              {/* Lista de itens selecionados */}
              <div className="space-y-3 mb-6">
                {selectedItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{item.title}</p>
                      {item.optionLabel && (
                        <p className="text-xs text-slate-500">{item.optionLabel}</p>
                      )}
                      {item.quantity > 1 && (
                        <p className="text-xs text-slate-500">Qtd: {item.quantity}</p>
                      )}
                    </div>
                    <p className="font-semibold text-slate-700 ml-3">
                      {formatPrice(item.price, currency)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl mb-6">
                <span className="font-semibold text-emerald-800">Total</span>
                <span className="text-2xl font-bold text-emerald-700">
                  {formatPrice(total, currency)}
                </span>
              </div>

              {/* Observações */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Observações (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Prefiro quarto com vista, check-in antecipado..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {/* Erro */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}

          {step === 'loading' && (
            <div className="py-12 text-center">
              <Loader2 className="h-12 w-12 text-emerald-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-600">Processando sua aceitação...</p>
            </div>
          )}

          {step === 'success' && (
            <div className="py-8 text-center">
              {/* Ícone de sucesso */}
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-30" />
                <div className="relative w-full h-full bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
              </div>

              {/* Checklist animada */}
              <div className="space-y-3 mb-8 text-left max-w-xs mx-auto">
                {[
                  { text: 'Proposta confirmada', delay: 200 },
                  { text: 'Seleções salvas', delay: 500 },
                  { text: 'Consultora notificada', delay: 800 },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 opacity-0 animate-fade-in"
                    style={{ animationDelay: `${item.delay}ms`, animationFillMode: 'forwards' }}
                  >
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                      <span className="text-emerald-600 text-sm">✓</span>
                    </div>
                    <span className="text-slate-700">{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Total confirmado */}
              <div className="p-4 bg-emerald-50 rounded-xl">
                <p className="text-sm text-emerald-700 mb-1">Total confirmado</p>
                <p className="text-3xl font-bold text-emerald-700">
                  {formatPrice(total, currency)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white">
          {step === 'confirm' && (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3.5 rounded-xl font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Voltar e Alterar
              </button>
              <button
                onClick={() => onConfirm(notes)}
                className="flex-1 px-4 py-3.5 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
              >
                Confirmar Proposta
              </button>
            </div>
          )}

          {step === 'success' && (
            <button
              onClick={onClose}
              className="w-full px-4 py-3.5 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {/* CSS para animação */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out;
        }
      `}</style>
    </div>
  )
}
