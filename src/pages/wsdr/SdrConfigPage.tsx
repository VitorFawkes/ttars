import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { SofiaEditor } from '@/components/wsdr/editor/SofiaEditor'
import { SofiaAgentSwitcher } from '@/components/wsdr/editor/SofiaAgentSwitcher'
import { ConversationTester } from '@/components/wsdr/ConversationTester'

export default function SdrConfigPage() {
  const [slug, setSlug] = useState('sofia-weddings')
  const [testerOpen, setTesterOpen] = useState(false)

  return (
    <div className="h-full flex flex-col bg-ww-paper">
      {/* Header FIXO — não some no scroll (só o conteúdo abaixo rola) */}
      <header className="shrink-0 border-b border-ww-sand bg-ww-paper/95 backdrop-blur z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-ww-cream border border-ww-gold/30 shadow-ww-lift shrink-0">
            <span className="font-ww-serif text-2xl leading-none text-ww-gold-ink">S</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ww-gold-ink/80">Welcome Weddings · SDR</p>
            <h1 className="font-ww-serif text-2xl text-ww-n700 tracking-tight leading-tight">Sofia</h1>
          </div>
          <button type="button" onClick={() => setTesterOpen(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-ww-gold/40 text-sm font-medium text-ww-gold-ink shadow-ww-lift hover:bg-ww-gold-soft transition-colors duration-150 ease-out active:scale-[0.98] shrink-0">
            <MessageCircle className="w-4 h-4" />Testar conversa
          </button>
        </div>
      </header>

      {/* Conteúdo rolável */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 pt-6 pb-4 space-y-6">
          <p className="font-ww-display text-sm text-ww-n500 max-w-2xl leading-relaxed">
            Sua consultora de casamentos no WhatsApp. Toque numa seção pra ajustar como ela conversa,
            o que faz e o que pode dizer — as mudanças valem na próxima mensagem, depois de salvar.
          </p>

          <SofiaAgentSwitcher selectedSlug={slug} onSelect={setSlug} />

          <SofiaEditor key={slug} slug={slug} />

          <p className="text-center font-ww-display text-xs text-ww-n400 pb-4">
            Configuração exclusiva da Welcome Weddings
          </p>
        </div>
      </div>

      {/* Botão flutuante no mobile pra abrir o testador */}
      <button type="button" onClick={() => setTesterOpen(true)}
        className="sm:hidden fixed bottom-20 right-5 z-30 flex items-center justify-center w-14 h-14 rounded-full bg-ww-gold text-white shadow-ww-modal active:scale-95 transition-transform"
        aria-label="Testar conversa">
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Gaveta do testador (opt-in) — direita no desktop, folha inferior no mobile */}
      {testerOpen && (
        <div className="fixed inset-0 z-30">
          <div className="absolute inset-0 bg-ww-n700/50 backdrop-blur-sm" onClick={() => setTesterOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[440px] bg-ww-paper shadow-ww-modal flex flex-col">
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ww-sand bg-white/80 backdrop-blur shrink-0">
              <h2 className="font-ww-serif text-lg text-ww-n700 tracking-tight">Testar a conversa</h2>
              <button type="button" onClick={() => setTesterOpen(false)} aria-label="Fechar"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-ww-n400 hover:bg-ww-cream transition-colors duration-150 ease-out active:scale-95">
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">
              <ConversationTester />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
