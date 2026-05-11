import { Check, FileCheck, Users } from 'lucide-react'
import { useChecklist, useToggleChecklist } from '@/hooks/viagem/useChecklist'

interface Props {
  token: string
  participantId: string
  totalPassageiros?: number
  internacional?: boolean
}

interface ChecklistItem {
  key: string
  label: string
  desc?: string
  internationalOnly?: boolean
}

const ITEMS: ChecklistItem[] = [
  { key: 'passaporte', label: 'Passaporte em dia', desc: 'Válido por pelo menos 6 meses.', internationalOnly: true },
  { key: 'visto', label: 'Visto ou autorização de viagem', desc: 'Quando necessário para o destino.', internationalOnly: true },
  { key: 'vacinas', label: 'Vacinas obrigatórias', desc: 'Febre amarela, por exemplo, para alguns destinos.' },
  { key: 'seguro_viagem', label: 'Seguro-viagem ativado' },
  { key: 'moeda', label: 'Câmbio ou cartão internacional' },
  { key: 'plano_celular', label: 'Plano de celular/roaming internacional', internationalOnly: true },
  { key: 'comprovantes', label: 'Comprovantes impressos ou no celular', desc: 'Hotéis, ingressos, seguro.' },
  { key: 'documento_carro', label: 'Habilitação internacional (PID)', desc: 'Se pretende alugar carro.', internationalOnly: true },
  { key: 'adaptador', label: 'Adaptador de tomada', internationalOnly: true },
  { key: 'lista_bagagem', label: 'Bagagem conferida' },
]

export function ChecklistPreEmbarque({ token, participantId, totalPassageiros, internacional }: Props) {
  const { data } = useChecklist(token, participantId)
  const toggle = useToggleChecklist(token, participantId)
  const marcados = new Set(data?.meu ?? [])
  const agregado = data?.agregado ?? {}

  const items = internacional === false
    ? ITEMS.filter((i) => !i.internationalOnly)
    : ITEMS

  const totalItems = items.length
  const marcadosCount = items.filter((i) => marcados.has(i.key)).length
  const pct = totalItems > 0 ? Math.round((marcadosCount / totalItems) * 100) : 0

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileCheck className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-slate-900">Antes de embarcar</h3>
        <span className="text-xs text-slate-500 ml-auto">{marcadosCount}/{totalItems}</span>
      </div>

      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-1">
        {items.map((item) => {
          const checked = marcados.has(item.key)
          const aggCount = agregado[item.key] ?? 0
          const othersCount = aggCount - (checked ? 1 : 0)
          return (
            <li key={item.key}>
              <button
                type="button"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ item_key: item.key, checked: !checked })}
                className={`w-full flex items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                  checked
                    ? 'bg-emerald-50 hover:bg-emerald-100'
                    : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${checked ? 'text-emerald-900 line-through' : 'text-slate-800'}`}>
                    {item.label}
                  </p>
                  {item.desc && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                  )}
                  {othersCount > 0 && totalPassageiros && totalPassageiros > 1 && (
                    <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" />
                      {othersCount} {othersCount === 1 ? 'passageiro já marcou' : 'passageiros já marcaram'}
                    </p>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
