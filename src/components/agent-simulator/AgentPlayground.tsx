import { useState } from 'react'
import { FlaskConical, Info } from 'lucide-react'
import { useAgentSimulator } from '@/hooks/useAgentSimulator'
import { ChatWindow } from './ChatWindow'
import { MessageInput } from './MessageInput'
import { ScenarioPresetPicker } from './ScenarioPresetPicker'
import { PipelineTracePanel } from './PipelineTracePanel'
import type { WizardData } from '@/hooks/useAgentWizard'

interface AgentPlaygroundProps {
  wizardData: WizardData
  /** Optional header slot for custom titles */
  compact?: boolean
}

export function AgentPlayground({ wizardData, compact = false }: AgentPlaygroundProps) {
  const simulator = useAgentSimulator(wizardData)
  const [showPresets, setShowPresets] = useState(!compact)

  const agentName = wizardData.step1?.agent_name?.trim() || 'Agente'
  const contactName = simulator.currentPreset?.contact_name || 'Cliente de teste'

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-indigo-800">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Simulador em modo local — mostra como o agente vai se comportar. Ao ativar, ele usará o pipeline real de IA.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Presets column */}
        <div className="lg:col-span-3 space-y-2">
          <button
            onClick={() => setShowPresets((s) => !s)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
          >
            <FlaskConical className="w-4 h-4" />
            {showPresets ? 'Ocultar cenários' : 'Mostrar cenários'}
          </button>
          <div className={showPresets ? 'block' : 'hidden lg:block'}>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" />
              Cenários de teste
            </p>
            <ScenarioPresetPicker
              currentPresetId={simulator.currentPreset?.id}
              onSelect={simulator.loadPreset}
            />
          </div>
        </div>

        {/* Chat column */}
        <div className="lg:col-span-6 flex flex-col gap-2 min-h-[500px]">
          <div className="flex-1 min-h-[400px]">
            <ChatWindow
              messages={simulator.messages}
              isProcessing={simulator.isProcessing}
              agentName={agentName}
              contactName={contactName}
            />
          </div>
          <MessageInput
            onSend={simulator.sendMessage}
            onReset={simulator.reset}
            disabled={simulator.isProcessing}
          />
        </div>

        {/* Trace column */}
        <div className="lg:col-span-3 space-y-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nos bastidores</p>
          <PipelineTracePanel trace={simulator.latestTrace} />
        </div>
      </div>
    </div>
  )
}
