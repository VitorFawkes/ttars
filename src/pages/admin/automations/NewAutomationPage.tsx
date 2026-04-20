import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Bolt, Layers } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'

/**
 * Hub de escolha entre dois tipos de automação:
 *
 * - Simples (um gatilho → uma ação) → AutomationBuilderPage (trigger/new).
 *   Cobre card criado, stage_enter, field_changed, tag_added/removed,
 *   inbound_message_pattern, time_offset_from_date e time_in_stage.
 *
 * - Cadência (vários passos encadeados ao longo do tempo) → AutomacaoBuilderPage
 *   (automacao/new). BlockRecipeGallery fica dentro dela.
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

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
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
                    onClick={() => navigate('/settings/automations/automacao/new')}
                    className="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-6 hover:border-indigo-400 hover:shadow transition-all group"
                >
                    <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-100">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 tracking-tight">Cadência de vários passos</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Série encadeada no tempo</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        Vários passos com intervalos entre eles. Ex: prospecção SDR (ligação
                        no D+0, e-mail no D+2, WhatsApp no D+5) ou onboarding pós-venda em
                        várias etapas.
                    </p>
                    <div className="text-xs text-slate-500 space-y-1">
                        <div>• Cadência SDR simples (3 tentativas na primeira semana)</div>
                        <div>• Follow-up de proposta enviada</div>
                        <div>• Onboarding pós-venda (boas-vindas + agendamento + kickoff)</div>
                        <div>• Checklist de documentos paralelos</div>
                        <div>• Handoff SDR → Planner com tarefas paralelas</div>
                    </div>
                </button>
            </div>

            <p className="mt-6 text-xs text-slate-500 max-w-4xl">
                Em dúvida? <strong>Automação simples</strong> resolve 80% dos casos. A
                <strong> cadência</strong> é pra quando você precisa de 3+ passos com tempo
                entre eles (sequência de prospecção, onboarding estruturado, pós-venda).
            </p>
        </>
    )
}
