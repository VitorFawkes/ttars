import { ImageIcon, Mic, FileText } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

const ITEMS: Array<{ key: 'audio' | 'image' | 'pdf'; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
  { key: 'audio', label: 'Áudio', icon: Mic, hint: 'Transcreve áudios recebidos via Whisper. Sem isso, o agente responde "não consegui entender o áudio".' },
  { key: 'image', label: 'Imagem', icon: ImageIcon, hint: 'Lê imagens via Vision (ex: passaporte, screenshot de passagem). Custo maior por mensagem.' },
  { key: 'pdf', label: 'PDF', icon: FileText, hint: 'Extrai texto de PDFs anexados. Útil para orçamento/proposta recebida.' },
]

export function TabMultimodal({ form, setForm }: Props) {
  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center gap-2">
        <ImageIcon className="w-5 h-5 text-pink-500" />
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Multimodal</h2>
      </header>
      <p className="text-sm text-slate-500 -mt-2">
        Tipos de anexo que o agente processa. Tudo desligado = só texto.
      </p>

      <div className="space-y-2">
        {ITEMS.map(item => {
          const Icon = item.icon
          const on = form.multimodal_config[item.key]
          return (
            <div key={item.key} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Icon className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.hint}</p>
                </div>
              </div>
              <Switch
                checked={on}
                onCheckedChange={v => setForm(f => ({
                  ...f,
                  multimodal_config: { ...f.multimodal_config, [item.key]: v },
                }))}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
