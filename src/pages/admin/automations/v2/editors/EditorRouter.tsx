/**
 * EditorRouter — escolhe qual editor renderizar conforme o `node.type`.
 *
 * Reusa editores existentes do builder linear (MessageStepEditor,
 * MediaStepEditor, EchoActionStepEditor) — esses editores não sabem do
 * mundo de nodes, eles só recebem `config` + `onChange` e operam no JSON.
 *
 * Pra ações Echo (action.echo_*), a sub-ação vem do tipo do node, não de
 * um dropdown — então sobrescrevemos config.action e marcamos como readonly.
 */
import React from 'react'
import type { WorkflowNodeType } from '../types'
import { MessageStepEditor } from '@/pages/admin/cadence/components/MessageStepEditor'
import { MediaStepEditor } from '@/pages/admin/cadence/components/MediaStepEditor'
import { EchoActionStepEditor, type EchoSubAction } from '@/pages/admin/cadence/components/EchoActionStepEditor'
import { useProductContext } from '@/hooks/useProductContext'
import { TriggerEditor } from './TriggerEditor'
import {
    WaitEditor, EndEditor, BranchEditor, StartCadenceEditor,
} from './FlowEditors'
import {
    CreateTaskEditor, CompleteTaskEditor, ChangeStageEditor, CardTagEditor,
    UpdateFieldEditor, NotifyInternalEditor, N8nWebhookEditor,
    UpdateContactFieldEditor, SendEmailEditor, AssignOwnerEditor,
    MarkCardResultEditor,
} from './CardActionEditors'

interface EditorRouterProps {
    type: WorkflowNodeType
    config: Record<string, unknown>
    onChange: (next: Record<string, unknown>) => void
}

// Mapeia action.echo_<x> → sub-action que o EchoActionStepEditor entende.
const ECHO_TYPE_TO_SUBACTION: Partial<Record<WorkflowNodeType, EchoSubAction>> = {
    'action.echo_assign':          'assign',
    'action.echo_release':         'release',
    'action.echo_close':           'close',
    'action.echo_set_status':      'set_status',
    'action.echo_add_tag':         'add_tag',
    'action.echo_remove_tag':      'remove_tag',
    'action.echo_add_co_owner':    'add_co_owner',
    'action.echo_remove_co_owner': 'remove_co_owner',
}

export const EditorRouter: React.FC<EditorRouterProps> = ({ type, config, onChange }) => {
    const product = useProductContext((s) => s.currentProduct)

    // Triggers — todos delegam ao TriggerEditor com type
    if (type.startsWith('trigger.')) {
        return <TriggerEditor type={type as never} config={config} onChange={onChange} />
    }

    // Echo actions — locked sub-action via tipo do node
    const echoSub = ECHO_TYPE_TO_SUBACTION[type]
    if (echoSub) {
        const lockedConfig = { ...config, action: echoSub }
        return (
            <EchoActionStepEditor
                config={lockedConfig as never}
                onChange={(next) => {
                    // Garante que action sempre vem do node.type — usuário não muda
                    onChange({ ...next, action: echoSub })
                }}
            />
        )
    }

    switch (type) {
        case 'action.send_message':
            return <MessageStepEditor config={config as never} onChange={onChange as never} product={product} />
        case 'action.send_media':
            return <MediaStepEditor config={config as never} onChange={onChange as never} product={product} />
        case 'action.create_task':
            return <CreateTaskEditor config={config} onChange={onChange} />
        case 'action.complete_task':
            return <CompleteTaskEditor config={config} onChange={onChange} />
        case 'action.change_stage':
            return <ChangeStageEditor config={config} onChange={onChange} />
        case 'action.add_tag':
        case 'action.remove_tag':
            return <CardTagEditor config={config} onChange={onChange} />
        case 'action.update_field':
            return <UpdateFieldEditor config={config} onChange={onChange} />
        case 'action.update_contact_field':
            return <UpdateContactFieldEditor config={config} onChange={onChange} />
        case 'action.assign_owner':
            return <AssignOwnerEditor config={config} onChange={onChange} />
        case 'action.mark_card_result':
            return <MarkCardResultEditor config={config} onChange={onChange} />
        case 'action.send_email':
            return <SendEmailEditor config={config} onChange={onChange} />
        case 'action.notify_internal':
            return <NotifyInternalEditor config={config} onChange={onChange} />
        case 'action.wait':
            return <WaitEditor config={config} onChange={onChange} />
        case 'action.end':
            return <EndEditor config={config} onChange={onChange} />
        case 'action.branch':
            return <BranchEditor config={config} onChange={onChange} />
        case 'action.start_cadence':
            return <StartCadenceEditor config={config} onChange={onChange} />
        case 'action.trigger_n8n_webhook':
            return <N8nWebhookEditor config={config} onChange={onChange} />
        default:
            return (
                <div className="text-xs text-slate-500 italic">
                    Sem editor específico pra <code>{type}</code> ainda.
                </div>
            )
    }
}

export default EditorRouter
