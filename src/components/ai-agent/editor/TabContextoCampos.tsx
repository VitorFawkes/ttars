import { Radio, Eye, Edit3 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

const AVAILABLE_FIELDS: Array<{ key: string; label: string; group: string; updatable: boolean }> = [
  // contato
  { key: 'nome', label: 'Nome do contato', group: 'Contato', updatable: true },
  { key: 'telefone', label: 'Telefone', group: 'Contato', updatable: false },
  { key: 'email', label: 'Email', group: 'Contato', updatable: true },
  { key: 'cidade', label: 'Cidade', group: 'Contato', updatable: true },
  { key: 'estado', label: 'Estado', group: 'Contato', updatable: true },
  { key: 'empresa', label: 'Empresa', group: 'Contato', updatable: true },
  { key: 'data_nascimento', label: 'Data de nascimento', group: 'Contato', updatable: true },
  // card
  { key: 'produto', label: 'Produto', group: 'Card', updatable: false },
  { key: 'etapa', label: 'Etapa do pipeline', group: 'Card', updatable: false },
  { key: 'valor_estimado', label: 'Valor estimado', group: 'Card', updatable: true },
  { key: 'valor_final', label: 'Valor final', group: 'Card', updatable: true },
  { key: 'data_viagem', label: 'Data da viagem', group: 'Card', updatable: true },
  { key: 'destino', label: 'Destino', group: 'Card', updatable: true },
  { key: 'quantidade_pessoas', label: 'Quantidade de pessoas', group: 'Card', updatable: true },
  // ia
  { key: 'ai_resumo', label: 'Resumo IA', group: 'IA', updatable: true },
  { key: 'ai_contexto', label: 'Contexto IA', group: 'IA', updatable: true },
]

export function TabContextoCampos({ form, setForm }: Props) {
  const toggleVisible = (key: string) => {
    setForm(f => ({
      ...f,
      context_fields_config: {
        ...f.context_fields_config,
        visible_fields: f.context_fields_config.visible_fields.includes(key)
          ? f.context_fields_config.visible_fields.filter(k => k !== key)
          : [...f.context_fields_config.visible_fields, key],
      },
    }))
  }

  const toggleUpdatable = (key: string) => {
    setForm(f => ({
      ...f,
      context_fields_config: {
        ...f.context_fields_config,
        updatable_fields: f.context_fields_config.updatable_fields.includes(key)
          ? f.context_fields_config.updatable_fields.filter(k => k !== key)
          : [...f.context_fields_config.updatable_fields, key],
      },
    }))
  }

  const groups = Array.from(new Set(AVAILABLE_FIELDS.map(f => f.group)))

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center gap-2">
        <Radio className="w-5 h-5 text-fuchsia-500" />
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Contexto & Campos do CRM</h2>
      </header>
      <p className="text-sm text-slate-500 -mt-2">
        <Eye className="w-3 h-3 inline mr-1 text-indigo-600" /> <b>Ver:</b> o agente enxerga esse campo ao decidir.{' '}
        <Edit3 className="w-3 h-3 inline mx-1 ml-2 text-emerald-600" /> <b>Atualizar:</b> o agente pode escrever esse campo via tool UpdateContato.
        <br />
        Nunca atualiza <code>pessoa_principal_id</code> — restrição do sistema.
      </p>

      {groups.map(group => (
        <div key={group} className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">{group}</Label>
          <div className="space-y-1">
            {AVAILABLE_FIELDS.filter(f => f.group === group).map(field => {
              const visible = form.context_fields_config.visible_fields.includes(field.key)
              const updatable = form.context_fields_config.updatable_fields.includes(field.key)
              return (
                <div key={field.key} className="flex items-center justify-between p-2 border border-slate-100 rounded-lg hover:bg-slate-50">
                  <span className="text-sm text-slate-800">{field.label}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => toggleVisible(field.key)}
                      className={cn(
                        'flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors',
                        visible
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      )}
                    >
                      <Eye className="w-3 h-3" /> ver
                    </button>
                    <button
                      type="button"
                      disabled={!field.updatable}
                      onClick={() => toggleUpdatable(field.key)}
                      className={cn(
                        'flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors',
                        updatable
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300',
                        !field.updatable && 'opacity-40 cursor-not-allowed'
                      )}
                      title={!field.updatable ? 'Campo de leitura apenas' : ''}
                    >
                      <Edit3 className="w-3 h-3" /> atualizar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
