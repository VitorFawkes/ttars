import { useState } from 'react'
import { Target } from 'lucide-react'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { SdrQualificationSheet } from './SdrQualificationSheet'

/**
 * Botão flutuante (FAB) que abre o painel de pontuação SDR.
 * Aparece apenas em WEDDING; some em outros produtos.
 * Permite à SDR iniciar pontuação rapidamente, sem precisar entrar num card.
 */
export function FloatingScoreButton() {
    const { product } = useCurrentProductMeta()
    const [open, setOpen] = useState(false)
    const [telefoneInput, setTelefoneInput] = useState('')
    const [askingPhone, setAskingPhone] = useState(false)

    if (product?.slug !== 'WEDDING') return null

    const handleClick = () => {
        if (telefoneInput) {
            setOpen(true)
        } else {
            setAskingPhone(true)
        }
    }

    const handleStart = (e: React.FormEvent) => {
        e.preventDefault()
        if (!telefoneInput.trim()) return
        setAskingPhone(false)
        setOpen(true)
    }

    return (
        <>
            {!askingPhone && !open && (
                <button
                    onClick={handleClick}
                    className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
                    title="Pontuar lead (mesma régua que a Estela)"
                >
                    <Target className="h-5 w-5" />
                    <span className="text-sm font-semibold">Pontuar lead</span>
                </button>
            )}

            {askingPhone && (
                <div className="fixed bottom-6 right-6 z-40 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-80">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2">Telefone do lead</h3>
                    <p className="text-xs text-slate-500 mb-3">
                        Digite o telefone pra começar. Se o lead já tem card, a pontuação vai se vincular sozinha quando ele for criado.
                    </p>
                    <form onSubmit={handleStart} className="space-y-2">
                        <input
                            type="tel"
                            autoFocus
                            value={telefoneInput}
                            onChange={(e) => setTelefoneInput(e.target.value)}
                            placeholder="(11) 99999-9999"
                            className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setAskingPhone(false)
                                    setTelefoneInput('')
                                }}
                                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={!telefoneInput.trim()}
                                className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50"
                            >
                                Começar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {open && (
                <SdrQualificationSheet
                    open={open}
                    onOpenChange={(next) => {
                        setOpen(next)
                        if (!next) {
                            setTelefoneInput('')
                            setAskingPhone(false)
                        }
                    }}
                    telefone={telefoneInput || null}
                />
            )}
        </>
    )
}
