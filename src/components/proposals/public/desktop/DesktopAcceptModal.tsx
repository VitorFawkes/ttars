/**
 * DesktopAcceptModal - Modal de confirmação de aceite para desktop
 *
 * Layout mais amplo com detalhes completos
 */

import { useState } from 'react'
import { X, CheckCircle2, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice, type Currency } from '../shared/utils/priceUtils'

interface SelectedItem {
  id: string
  title: string
  type: string
  price: number
  quantity: number
  optionLabel?: string
}

interface DesktopAcceptModalProps {
  isOpen: boolean
  onClose: () => void
  selectedItems: SelectedItem[]
  total: number
  currency?: Currency
  travelers?: number
  isAccepting: boolean
  isAccepted: boolean
  error: string | null
  onConfirm: (notes: string) => void
}

export function DesktopAcceptModal({
  isOpen,
  onClose,
  selectedItems,
  total,
  currency = 'BRL',
  travelers = 1,
  isAccepting,
  isAccepted,
  error,
  onConfirm,
}: DesktopAcceptModalProps) {
  const [notes, setNotes] = useState('')

  if (!isOpen) return null

  const step = isAccepted ? 'success' : isAccepting ? 'loading' : 'confirm'
  const pricePerPerson = travelers > 1 ? total / travelers : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={step === 'confirm' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-6 py-4 border-b",
          step === 'success' ? "bg-emerald-50 border-emerald-100" : "border-slate-100"
        )}>
          <h2 className="text-xl font-bold text-slate-900">
            {step === 'success' ? '✓ Proposta Aceita!' : 'Confirmar Proposta'}
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
        <div className="overflow-y-auto max-h-[60vh]">
          {step === 'confirm' && (
            <div className="p-6">
              {/* Lista de itens */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">
                  Itens selecionados ({selectedItems.length})
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedItems.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <Check className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{item.title}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {item.optionLabel && <span>{item.optionLabel}</span>}
                            {item.quantity > 1 && <span>• Qtd: {item.quantity}</span>}
                          </div>
                        </div>
                      </div>
                      <p className="font-semibold text-slate-700">
                        {formatPrice(item.price, currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="p-5 bg-emerald-50 rounded-xl mb-6">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-sm text-emerald-700 font-medium mb-1">Total da viagem</p>
                    {pricePerPerson && (
                      <p className="text-sm text-emerald-600">
                        {formatPrice(pricePerPerson, currency)} por pessoa
                      </p>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-emerald-700">
                    {formatPrice(total, currency)}
                  </p>
                </div>
              </div>

              {/* Observações */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Observações (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Prefiro quarto com vista mar, check-in antecipado, dietas especiais..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {/* Erro */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'loading' && (
            <div className="py-16 text-center">
              <Loader2 className="h-16 w-16 text-emerald-600 animate-spin mx-auto mb-6" />
              <p className="text-lg text-slate-600">Processando sua aceitação...</p>
              <p className="text-sm text-slate-400 mt-2">Isso pode levar alguns segundos</p>
            </div>
          )}

          {step === 'success' && (
            <div className="py-12 px-6 text-center">
              {/* Ícone de sucesso */}
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-30" />
                <div className="relative w-full h-full bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                Proposta confirmada com sucesso!
              </h3>
              <p className="text-slate-500 mb-8">
                Sua consultora foi notificada e entrará em contato em breve.
              </p>

              {/* Checklist animada */}
              <div className="space-y-4 mb-8 text-left max-w-sm mx-auto">
                {[
                  { text: 'Proposta confirmada', delay: 200 },
                  { text: 'Seleções registradas', delay: 500 },
                  { text: 'Consultora notificada', delay: 800 },
                  { text: 'E-mail de confirmação enviado', delay: 1100 },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 opacity-0 animate-fade-in"
                    style={{ animationDelay: `${item.delay}ms`, animationFillMode: 'forwards' }}
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-4 w-4 text-emerald-600" />
                    </div>
                    <span className="text-slate-700">{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Total confirmado */}
              <div className="p-5 bg-emerald-50 rounded-xl">
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
            <div className="flex gap-4">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3.5 rounded-xl font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Voltar e Alterar
              </button>
              <button
                onClick={() => onConfirm(notes)}
                className="flex-1 px-6 py-3.5 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
              >
                Confirmar Proposta
              </button>
            </div>
          )}

          {step === 'success' && (
            <button
              onClick={onClose}
              className="w-full px-6 py-3.5 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
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
