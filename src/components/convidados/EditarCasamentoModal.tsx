import { useEffect, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useUpdateWedding } from '../../hooks/convidados/useUpdateWedding'
import { useWeddingEditValues } from '../../hooks/convidados/useWeddingEditValues'

interface EditarCasamentoModalProps {
  open: boolean
  onClose: () => void
  cardId: string
}

interface FormState {
  titulo: string
  data_viagem_inicio: string
  ww_local: string
  ww_data_final_acao: string
  ww_link_atendimento: string
  ww_site_casamento: string
}

const EMPTY_FORM: FormState = {
  titulo: '',
  data_viagem_inicio: '',
  ww_local: '',
  ww_data_final_acao: '',
  ww_link_atendimento: '',
  ww_site_casamento: '',
}

function toFormState(values: {
  titulo: string
  data_viagem_inicio: string | null
  ww_local: string | null
  ww_data_final_acao: string | null
  ww_link_atendimento: string | null
  ww_site_casamento: string | null
}): FormState {
  return {
    titulo: values.titulo,
    data_viagem_inicio: values.data_viagem_inicio ?? '',
    ww_local: values.ww_local ?? '',
    ww_data_final_acao: values.ww_data_final_acao ?? '',
    ww_link_atendimento: values.ww_link_atendimento ?? '',
    ww_site_casamento: values.ww_site_casamento ?? '',
  }
}

function emptyToNull(s: string): string | null {
  const t = s.trim()
  return t.length === 0 ? null : t
}

export function EditarCasamentoModal({ open, onClose, cardId }: EditarCasamentoModalProps) {
  const { data: values, isLoading } = useWeddingEditValues(cardId, { enabled: open })
  const update = useUpdateWedding()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Quando os valores chegam (ou mudam por refetch), reseta o form.
  // Reseta também ao fechar pra não vazar edição não salva.
  useEffect(() => {
    if (open && values) setForm(toFormState(values))
    if (!open) setForm(EMPTY_FORM)
  }, [open, values])

  if (!open) return null

  const handleChange = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!form.titulo.trim()) return
    try {
      await update.mutateAsync({
        cardId,
        titulo: form.titulo.trim(),
        data_viagem_inicio: emptyToNull(form.data_viagem_inicio),
        ww_local: emptyToNull(form.ww_local),
        ww_data_final_acao: emptyToNull(form.ww_data_final_acao),
        ww_link_atendimento: emptyToNull(form.ww_link_atendimento),
        ww_site_casamento: emptyToNull(form.ww_site_casamento),
      })
      onClose()
    } catch {
      // toast já é disparado pelo hook em onError
    }
  }

  const canSave = !!form.titulo.trim() && !update.isPending && !isLoading

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Editar Casamento</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando dados…</span>
            </div>
          ) : !values ? (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
              Não consegui carregar os dados desse casamento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Título do Casamento"
                required
                className="md:col-span-2"
              >
                <input
                  type="text"
                  value={form.titulo}
                  onChange={e => handleChange('titulo', e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                  placeholder="Ex: Nathalye e Pedro"
                />
              </Field>

              <Field label="Data do Evento">
                <input
                  type="date"
                  value={form.data_viagem_inicio}
                  onChange={e => handleChange('data_viagem_inicio', e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                />
              </Field>

              <Field label="Data Final da Promo" hint="Usada em mensagens de campanha (ex: data limite de RSVP)">
                <input
                  type="date"
                  value={form.ww_data_final_acao}
                  onChange={e => handleChange('ww_data_final_acao', e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                />
              </Field>

              <Field label="Local do Evento" className="md:col-span-2">
                <input
                  type="text"
                  value={form.ww_local}
                  onChange={e => handleChange('ww_local', e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                  placeholder="Ex: Casa Cornacchi - Itália"
                />
              </Field>

              <Field label="Site do Casamento" className="md:col-span-2">
                <input
                  type="url"
                  value={form.ww_site_casamento}
                  onChange={e => handleChange('ww_site_casamento', e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                  placeholder="https://www.wedme.com.br/seuslug"
                />
              </Field>

              <Field label="Link de Atendimento" className="md:col-span-2" hint="Link enviado aos convidados nas mensagens">
                <input
                  type="url"
                  value={form.ww_link_atendimento}
                  onChange={e => handleChange('ww_link_atendimento', e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                  placeholder="https://..."
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white rounded-md transition-colors',
              canSave ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-300 cursor-not-allowed',
            )}
          >
            {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

function Field({ label, hint, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
}
