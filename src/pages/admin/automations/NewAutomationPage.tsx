import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Bolt, Layers, MessageSquare, Workflow } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { EchoBadge } from '@/components/automations/EchoBadge'

/**
 * Hub de escolha do tipo de automação.
 *
 * Padrão (recomendado): Editor visual (v2) — canvas com nodes, igual n8n.
 * Cobre 90% dos casos de uso e segue evoluindo.
 *
 * Modos clássicos (mantidos por compatibilidade):
 *  - Simples (1 trigger → 1 ação) — AutomationBuilderPage
 *  - Cadência sequencial — CadenceBuilderPage (linear)
 *  - Cadência paralela (blocos) — AutomacaoBuilderPage (blocks)
 */
export default function NewAutomationPage() {
    const navigate = useNavigate()

    return (
        <>
            <AdminPageHeader
                title="Nova automação"
                subtitle="Use o editor visual (recomendado) ou um dos modos clássicos"
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

            {/* Opção principal — editor visual */}
            <div className="mt-6 max-w-6xl">
                <button
                    onClick={() => navigate('/settings/automations/v2/new')}
                    className="w-full text-left bg-gradient-to-r from-slate-900 to-indigo-900 text-white rounded-xl shadow-md p-6 hover:shadow-xl transition-all group"
                >
                    <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-white/15 flex items-center justify-center">
                            <Workflow className="w-7 h-7" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-lg tracking-tight">Editor visual</h3>
                                <span className="text-[10px] uppercase tracking-wider bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded font-semibold">recomendado</span>
                                <EchoBadge iconOnly size={14} />
                            </div>
                            <p className="text-sm text-slate-300">
                                Canvas com nodes ligados — gatilhos e ações conectados visualmente.
                                Cria qualquer fluxo: simples, sequencial ou ramificado. Suporta
                                mensagens, mídia e ações Echo no mesmo lugar.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                                <span>• 9 gatilhos diferentes</span>
                                <span>• 22 tipos de ação</span>
                                <span>• Auto-organizar (ELK)</span>
                                <span>• Validação visual</span>
                                <span>• Simulação dry-run</span>
                            </div>
                        </div>
                        <div className="text-sm text-slate-300 group-hover:text-white transition">Abrir →</div>
                    </div>
                </button>
            </div>

            {/* Modos clássicos */}
            <div className="mt-8 max-w-6xl">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-3">
                    Modos clássicos (por formulário)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                        onClick={() => navigate('/settings/automations/trigger/new')}
                        className="text-left bg-white border border-slate-200 rounded-lg shadow-sm p-4 hover:border-indigo-300 hover:shadow transition-all group"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <Bolt className="w-4 h-4" />
                            </div>
                            <h3 className="font-medium text-sm text-slate-900">Simples</h3>
                        </div>
                        <p className="text-xs text-slate-600">
                            Um gatilho → uma ação. Bom pra automações pontuais.
                        </p>
                    </button>

                    <button
                        onClick={() => navigate('/settings/automations/cadence/new')}
                        className="text-left bg-white border border-slate-200 rounded-lg shadow-sm p-4 hover:border-emerald-300 hover:shadow transition-all group"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <MessageSquare className="w-4 h-4" />
                            </div>
                            <h3 className="font-medium text-sm text-slate-900">Cadência sequencial</h3>
                        </div>
                        <p className="text-xs text-slate-600">
                            Lista de mensagens / mídia / ações Echo em ordem.
                        </p>
                    </button>

                    <button
                        onClick={() => navigate('/settings/automations/automacao/new')}
                        className="text-left bg-white border border-slate-200 rounded-lg shadow-sm p-4 hover:border-purple-300 hover:shadow transition-all group"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                                <Layers className="w-4 h-4" />
                            </div>
                            <h3 className="font-medium text-sm text-slate-900">Cadência paralela (blocos)</h3>
                        </div>
                        <p className="text-xs text-slate-600">
                            Tarefas humanas em paralelo dentro de blocos.
                        </p>
                    </button>
                </div>

                <p className="mt-4 text-xs text-slate-500">
                    Os modos clássicos serão descontinuados quando o editor visual cobrir 100%
                    dos casos. Por ora, use eles se precisar de algo que o editor visual ainda
                    não suporta (ex: ações de card encadeadas como step).
                </p>
            </div>
        </>
    )
}
