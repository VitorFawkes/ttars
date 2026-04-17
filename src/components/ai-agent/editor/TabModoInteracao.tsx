import { InteractionModeEditor } from './InteractionModeEditor'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

export function TabModoInteracao({ form, setForm }: Props) {
  return (
    <InteractionModeEditor
      mode={form.interaction_mode}
      firstMessage={form.first_message_config}
      outbound={form.outbound_trigger_config}
      onModeChange={mode => setForm(f => ({ ...f, interaction_mode: mode }))}
      onFirstMessageChange={cfg => setForm(f => ({ ...f, first_message_config: cfg }))}
      onOutboundChange={cfg => setForm(f => ({ ...f, outbound_trigger_config: cfg }))}
    />
  )
}
