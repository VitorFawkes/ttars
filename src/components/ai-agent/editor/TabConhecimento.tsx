import { BookOpen, Plus, Trash2, Share2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAgentKBLinks } from '@/hooks/useAgentKBLinks'
import { useAiKnowledgeBases } from '@/hooks/useAiKnowledgeBases'

interface Props {
  agentId?: string
}

export function TabConhecimento({ agentId }: Props) {
  const navigate = useNavigate()
  const { links, link, unlink, toggleShared } = useAgentKBLinks(agentId)
  const { knowledgeBases: allKbs } = useAiKnowledgeBases()

  if (!agentId) {
    return (
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <p className="text-sm text-slate-500">Salve o agente antes de vincular bases de conhecimento.</p>
      </section>
    )
  }

  const linkedIds = new Set(links.map(l => l.kb_id))
  const availableKbs = allKbs.filter(kb => !linkedIds.has(kb.id))

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
              Bases de conhecimento <span className="text-slate-400 font-normal">({links.length} vinculadas)</span>
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/settings/ai-knowledge-bases')} className="gap-1">
            <ExternalLink className="w-3 h-3" /> Gerenciar bases
          </Button>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          O agente busca em todas as bases vinculadas. Marque "compartilhar" para que outros agentes da conta possam usar a mesma base.
        </p>

        {links.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
            Nenhuma base vinculada ainda. Adicione abaixo.
          </p>
        ) : (
          <div className="space-y-2">
            {links.map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {l.ai_knowledge_bases?.nome || '(base removida)'}
                    </p>
                    {l.ai_knowledge_bases?.tipo && (
                      <Badge variant="outline" className="text-xs">{l.ai_knowledge_bases.tipo}</Badge>
                    )}
                    {!l.ai_knowledge_bases?.ativa && (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">desativada</Badge>
                    )}
                  </div>
                  {l.ai_knowledge_bases?.descricao && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{l.ai_knowledge_bases.descricao}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <Share2 className="w-3 h-3" />
                    Compartilhar
                    <Switch
                      checked={l.shared_with_account}
                      onCheckedChange={(v) => toggleShared.mutate(
                        { linkId: l.id, shared: v },
                        { onSuccess: () => toast.success(v ? 'Compartilhada com a conta' : 'Não compartilhada') },
                      )}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!confirm('Desvincular esta base?')) return
                      unlink.mutate(l.id, { onSuccess: () => toast.success('Base desvinculada') })
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {availableKbs.length > 0 && (
        <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
          <header className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-semibold text-slate-900">Adicionar base existente</h3>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {availableKbs.map(kb => (
              <button
                key={kb.id}
                type="button"
                onClick={() => link.mutate({ kb_id: kb.id }, { onSuccess: () => toast.success('Base vinculada') })}
                className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg text-left hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{kb.nome}</p>
                  {kb.descricao && (
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{kb.descricao}</p>
                  )}
                  <Badge variant="outline" className="text-xs mt-1">{kb.tipo}</Badge>
                </div>
                <Plus className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
