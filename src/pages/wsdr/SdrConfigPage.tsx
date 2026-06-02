import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { SofiaEditor } from '@/components/wsdr/editor/SofiaEditor'
import { SofiaAgentSwitcher } from '@/components/wsdr/editor/SofiaAgentSwitcher'
import { ConversationTester } from '@/components/wsdr/ConversationTester'

export default function SdrConfigPage() {
  const [slug, setSlug] = useState('sofia-weddings')

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100/50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-start gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">Sofia</h1>
            <p className="text-sm text-slate-500 mt-0.5 max-w-2xl leading-relaxed">
              SDR de casamentos no WhatsApp. Edite como ela conversa, o que ela faz e o que pode dizer.
              As mudanças valem na próxima mensagem, depois de salvar.
            </p>
          </div>
        </header>

        <SofiaAgentSwitcher selectedSlug={slug} onSelect={setSlug} />

        {/* Editor à esquerda + testador ao vivo fixo à direita (empilha no mobile/tablet) */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] gap-6 items-start">
          <div className="min-w-0">
            <SofiaEditor key={slug} slug={slug} />
          </div>
          <aside className="xl:sticky xl:top-6">
            <ConversationTester />
          </aside>
        </div>

        <p className="text-center text-xs text-slate-400 pb-8">Configuração exclusiva da Welcome Weddings</p>
      </div>
    </div>
  )
}
