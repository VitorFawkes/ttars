import { SofiaEditor } from '@/components/wsdr/editor/SofiaEditor'
import { ConversationTester } from '@/components/wsdr/ConversationTester'

export default function SdrConfigPage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Configuração da Sofia</h1>
          <p className="text-slate-500 mt-2">
            A Sofia é a SDR de casamentos no WhatsApp. Edite como ela conversa com os noivos e o que ela
            pode fazer. As mudanças valem na próxima mensagem, depois de salvar.
          </p>
        </div>

        <SofiaEditor slug="sofia-weddings" />

        <ConversationTester />

        <div className="text-center text-sm text-slate-400 pb-8">
          <p>Configuração exclusiva da Welcome Weddings</p>
        </div>
      </div>
    </div>
  )
}
