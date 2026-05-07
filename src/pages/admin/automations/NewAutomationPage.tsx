import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Bolt, Layers, MessageSquare } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { EchoBadge } from '@/components/automations/EchoBadge'

/**
 * Hub de escolha do tipo de automação:
 *
 * - Simples (um gatilho → uma ação) → AutomationBuilderPage (trigger/new).
 *   Cobre card criado, stage_enter, field_changed, tag_added/removed,
 *   inbound_message_pattern, time_offset_from_date e time_in_stage.
 *
 * - Cadência sequencial (mensagens, mídia e ações Echo encadeadas com waits)
 *   → CadenceBuilderPage (cadence/new). É a cadência canônica pra follow-up
 *   de WhatsApp, onboarding e atendimento Echo.
 *
 * - Cadência paralela (blocos de tarefas humanas em paralelo)
 *   → AutomacaoBuilderPage (automacao/new). Bom pra prospecção SDR com
 *   várias tentativas no mesmo dia.
 */
export default function NewAutomationPage() {
    const navigate = useNavigate()

    return (
        <>
            <AdminPageHeader
                title="Nova automação"
                subtitle="Escolha o tipo que melhor se encaixa no que você quer fazer"
                icon={<Zap className="w-5 h-5" />}
                actions={
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/settings/automations')}
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Voltar
                    </Button>
                }
            />

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl">
                <button
                    onClick={() => navigate('/settings/automations/trigger/new')}
                    className="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-6 hover:border-indigo-400 hover:shadow transition-all group"
                >
                    <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100">
                            <Bolt className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 tracking-tight">Automação simples</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Um gatilho → uma ação</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        Dispara uma única ação quando algo acontece no card: manda WhatsApp,
                        cria tarefa, muda etapa, adiciona tag, avisa alguém do time, atualiza
                        campo ou chama webhook.
                    </p>
                    <div className="text-xs text-slate-500 space-y-1">
                        <div>• Card criado / entrou em etapa ou fase</div>
                        <div>• Campo do card mudou / tag adicionada ou removida</div>
                        <div>• Cliente respondeu com palavra-chave</div>
                        <div>• <strong>Antes/depois de uma data</strong> (viagem, aniversário, proposta)</div>
                        <div>• <strong>Card parado X dias em etapa</strong></div>
                    </div>
                </button>

                <button
                    onClick={() => navigate('/settings/automations/cadence/new')}
                    className="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-6 hover:border-emerald-400 hover:shadow transition-all group"
                >
                    <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100">
                            <MessageSquare className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                                Cadência sequencial
                                <EchoBadge iconOnly size={14} />
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">Mensagens / mídia / ações Echo encadeadas</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        Várias mensagens, mídias e ações Echo em ordem, com esperas entre elas.
                        Cancela sozinha se o card sair da etapa. É o caminho pra migrar
                        cadências de WhatsApp do ActiveCampaign.
                    </p>
                    <div className="text-xs text-slate-500 space-y-1">
                        <div>• 5 mensagens HSM ou texto livre, 1 dia entre cada</div>
                        <div>• Envio de imagem/vídeo/PDF</div>
                        <div>• Atribuir, fechar, taggear conversa Echo</div>
                        <div>• <strong>Auto-cancela</strong> se card mudar de etapa</div>
                    </div>
                </button>

                <button
                    onClick={() => navigate('/settings/automations/automacao/new')}
                    className="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-6 hover:border-purple-400 hover:shadow transition-all group"
                >
                    <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-100">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 tracking-tight">Cadência paralela (blocos)</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Tarefas humanas em paralelo por blocos</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        Grupos de tarefas humanas executadas em paralelo dentro de cada bloco.
                        O próximo bloco só dispara depois que todas as tarefas do anterior são
                        concluídas. Ideal pra SDR / pós-venda com checklists.
                    </p>
                    <div className="text-xs text-slate-500 space-y-1">
                        <div>• Cadência SDR (3 tentativas no mesmo dia)</div>
                        <div>• Follow-up de proposta enviada</div>
                        <div>• Onboarding pós-venda em fases</div>
                        <div>• Checklist de documentos paralelos</div>
                        <div>• Handoff SDR → Planner com tarefas paralelas</div>
                    </div>
                </button>
            </div>

            <p className="mt-6 text-xs text-slate-500 max-w-4xl">
                Em dúvida? <strong>Automação simples</strong> resolve 80% dos casos.
                Use <strong>cadência sequencial</strong> pra mensagens automáticas em série
                (WhatsApp, mídia, ações Echo). Use <strong>cadência paralela</strong> pra
                grupos de tarefas humanas com checklists.
            </p>
        </>
    )
}
