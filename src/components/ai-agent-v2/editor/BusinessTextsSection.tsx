import { Sparkles, MapPin, BookOpen, Mail, DollarSign } from 'lucide-react'
import type { BusinessConfigInput } from '@/hooks/v2/useAgentBusinessConfig'

interface Props {
  value: BusinessConfigInput
  onChange: (next: BusinessConfigInput) => void
  /**
   * Quando true, mostra dica de placeholder ({wedding_planner_name}, etc.).
   * Hoje só Patricia tem esses placeholders. Outros agentes podem usar os
   * mesmos campos como referência genérica.
   */
  showPlaceholderHint?: boolean
}

interface FieldDef {
  key: keyof BusinessConfigInput
  label: string
  placeholder: string
  description: string
  icon: typeof Sparkles
  rows: number
  placeholder_var: string
}

const FIELDS: FieldDef[] = [
  {
    key: 'empresa_stats_text',
    label: 'Stats da empresa',
    placeholder: 'Ex: Desde 2012, mais de 650 casamentos em mais de 20 países. 5 prêmios consecutivos.',
    description: 'Frase curta com números do histórico (ano de fundação, casamentos realizados, prêmios). O agente menciona quando relevante na conversa.',
    icon: Sparkles,
    rows: 3,
    placeholder_var: '{empresa_stats}',
  },
  {
    key: 'network_regions_text',
    label: 'Onde a empresa tem rede forte',
    placeholder: 'Ex: Caribe (Cancún, Punta Cana), Maldivas, Nordeste brasileiro, Mendoza/Argentina, Europa selecionada.',
    description: 'Regiões/destinos com rede própria da empresa. Quando o lead cita destino fora dessa lista, o agente diz "vou checar".',
    icon: MapPin,
    rows: 3,
    placeholder_var: '{network_regions}',
  },
  {
    key: 'destination_categories_text',
    label: 'Categorias de destino do CRM',
    placeholder: 'Ex: Caribe / Maldivas / Nordeste / Mendoza / Europa / Outro',
    description: 'Categorias canônicas que o agente usa pra classificar destinos no campo do CRM. Separe com " / ".',
    icon: BookOpen,
    rows: 2,
    placeholder_var: '{destination_categories}',
  },
  {
    key: 'brochure_policy_text',
    label: 'Material/brochura pra enviar',
    placeholder: 'Ex: Não temos material informativo pra enviar. Quando lead pedir, ofereço reunião como alternativa.',
    description: 'Como o agente responde quando o lead pede material/brochura/guia.',
    icon: Mail,
    rows: 3,
    placeholder_var: '{brochure_policy}',
  },
  {
    key: 'honorario_faixa_text',
    label: 'Faixa de honorário',
    placeholder: 'Ex: R$ 4 mil a R$ 18 mil',
    description: 'Faixa de valor do honorário da assessoria. O agente cita essa faixa quando o lead pergunta direto sobre cobrança.',
    icon: DollarSign,
    rows: 1,
    placeholder_var: '{honorario_faixa}',
  },
]

/**
 * Cinco campos de texto livre que substituem trechos antes hardcoded no
 * prompt da Patricia. Cada um vira um placeholder no texto canônico do
 * agente — o router substitui em runtime.
 *
 * Decisões de NEGÓCIO (admin edita): valores, regiões, política, faixa.
 * Decisões de PROMPT ENGINEERING ficam no código (defaults/patricia_*.ts).
 */
export function BusinessTextsSection({ value, onChange, showPlaceholderHint = false }: Props) {
  const handleField = (key: keyof BusinessConfigInput, text: string) => {
    onChange({ ...value, [key]: text.trim() === '' ? null : text })
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-base font-semibold text-slate-900">Textos da empresa que o agente usa</h3>
        <p className="text-xs text-slate-500 mt-1">
          Esses textos viram parte do "cérebro" do agente. Edite aqui pra ajustar sem precisar de deploy.
          Quando você deixar vazio, o agente usa o texto padrão.
        </p>
      </header>

      <div className="p-5 space-y-5">
        {FIELDS.map(field => {
          const Icon = field.icon
          const current = (value[field.key] as string | null) ?? ''
          return (
            <div key={field.key}>
              <div className="flex items-start gap-2 mb-1.5">
                <Icon className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-800">{field.label}</label>
                  <p className="text-[11px] text-slate-500 mt-0.5">{field.description}</p>
                </div>
                {showPlaceholderHint && (
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                    {field.placeholder_var}
                  </span>
                )}
              </div>
              {field.rows === 1 ? (
                <input
                  type="text"
                  value={current}
                  onChange={(e) => handleField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              ) : (
                <textarea
                  value={current}
                  onChange={(e) => handleField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
                />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
