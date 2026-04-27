import { useState, useMemo } from 'react'
import { X, Trash2, AlertCircle } from 'lucide-react'
import { useOrg } from '../../contexts/OrgContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useCriarModelo, useUpdateModelo, useDeleteModelo, type ModeloConcierge } from '../../hooks/concierge/useModelosConcierge'
import { TIPO_LABEL, categoriasParaProduto, type TipoConcierge } from '../../hooks/concierge/types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  modelo: ModeloConcierge | null  // null = criar novo
}

// Wrapper força re-mount quando modelo muda (key) — evita useEffect pra reset de form
export default function ModeloEditorModal({ open, onClose, modelo }: Props) {
  if (!open) return null
  return (
    <ModeloEditorModalInner
      key={modelo?.template_id ?? 'novo'}
      onClose={onClose}
      modelo={modelo}
    />
  )
}

function ModeloEditorModalInner({ onClose, modelo }: { onClose: () => void; modelo: ModeloConcierge | null }) {
  const { org } = useOrg()
  const { slug: produtoAtual } = useCurrentProductMeta()
  const isEdit = modelo !== null

  const [name, setName] = useState(modelo?.template_name ?? '')
  const [description, setDescription] = useState(modelo?.template_description ?? '')
  const [tipo, setTipo] = useState<TipoConcierge>(modelo?.tipo_concierge ?? 'operacional')
  const [dayOffset, setDayOffset] = useState<number>(modelo?.day_offset ?? 0)
  const [taskTitulo, setTaskTitulo] = useState(modelo?.task_titulo ?? '')
  const [taskDescricao, setTaskDescricao] = useState(modelo?.task_descricao ?? '')
  const [requerOcasiaoEspecial, setRequerOcasiaoEspecial] = useState(Boolean(modelo?.condicao_extra?.requer_ocasiao_especial))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const criar = useCriarModelo()
  const update = useUpdateModelo()
  const del = useDeleteModelo()

  const categoriasDisponiveis = useMemo(
    () => categoriasParaProduto(produtoAtual).filter(c => c.config.tipo === tipo),
    [produtoAtual, tipo]
  )

  // Categoria: se o modelo veio com uma categoria que ainda existe e bate com o tipo atual, mantém.
  // Senão, usa a primeira disponível pro tipo selecionado.
  const categoriaInicial = useMemo(() => {
    if (modelo?.categoria_concierge && categoriasDisponiveis.find(c => c.key === modelo.categoria_concierge)) {
      return modelo.categoria_concierge
    }
    return categoriasDisponiveis[0]?.key ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])
  const [categoria, setCategoria] = useState<string>(modelo?.categoria_concierge ?? categoriaInicial)

  // Categoria efetivamente exibida (descarta valor inválido pro tipo atual)
  const categoriaCheck = !categoriasDisponiveis.find(c => c.key === categoria)
  const categoriaEfetiva = categoriaCheck ? categoriaInicial : categoria

  const isPending = criar.isPending || update.isPending || del.isPending
  const podeS = name.trim() && categoriaEfetiva && taskTitulo.trim() && org?.id

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!podeS) return
    const condicao_extra = requerOcasiaoEspecial ? { requer_ocasiao_especial: true } : {}
    const base = {
      name: name.trim(),
      description: description.trim(),
      tipo_concierge: tipo,
      categoria_concierge: categoriaEfetiva,
      day_offset: dayOffset,
      task_titulo: taskTitulo.trim(),
      task_descricao: taskDescricao.trim(),
      condicao_extra,
    }
    if (isEdit && modelo) {
      update.mutate(
        { template_id: modelo.template_id, step_id: modelo.step_id, org_id: org!.id, ...base },
        { onSuccess: () => onClose() }
      )
    } else {
      criar.mutate({ ...base, org_id: org!.id }, { onSuccess: () => onClose() })
    }
  }

  const handleDelete = () => {
    if (!modelo || !org?.id) return
    del.mutate({ template_id: modelo.template_id, org_id: org.id }, { onSuccess: () => onClose() })
  }

  const dayLabel = dayOffset === 0 ? 'No aceite da viagem' : dayOffset > 0 ? `${dayOffset} dia${dayOffset === 1 ? '' : 's'} depois do retorno` : `${-dayOffset} dia${dayOffset === -1 ? '' : 's'} antes do embarque`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{isEdit ? 'Editar modelo' : 'Novo modelo de cadência'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">As mesmas mudanças aparecem em Configurações &gt; Automações</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome do modelo *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Concierge: Pedir passaporte D-20" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que esse modelo faz e quando dispara"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 h-16 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tipo *</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoConcierge)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {(Object.entries(TIPO_LABEL) as [TipoConcierge, typeof TIPO_LABEL[TipoConcierge]][]).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Categoria *</label>
              <select
                value={categoriaEfetiva}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {categoriasDisponiveis.length === 0 && <option value="">— sem categorias deste tipo —</option>}
                {categoriasDisponiveis.map(c => (
                  <option key={c.key} value={c.key}>{c.config.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Quando dispara *</label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={dayOffset}
                onChange={(e) => setDayOffset(parseInt(e.target.value || '0', 10))}
                className="w-24"
              />
              <span className="text-xs text-slate-600">{dayLabel}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Use número negativo (ex: -20) para "20 dias antes do embarque". Positivo (ex: +3) para depois do retorno. Zero para no aceite.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Título da tarefa *</label>
            <Input
              value={taskTitulo}
              onChange={(e) => setTaskTitulo(e.target.value)}
              placeholder="Ex: Pedir foto do passaporte ao cliente"
            />
            <p className="text-[11px] text-slate-500 mt-1">Aparece pra concierge como o título do atendimento.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Descrição da tarefa</label>
            <textarea
              value={taskDescricao}
              onChange={(e) => setTaskDescricao(e.target.value)}
              placeholder="Instrução pra concierge sobre como executar"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg h-20 resize-none"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={requerOcasiaoEspecial}
                onChange={(e) => setRequerOcasiaoEspecial(e.target.checked)}
                className="rounded border-slate-300"
              />
              Disparar só em viagens com ocasião especial (lua de mel, aniversário)
            </label>
            <p className="text-[11px] text-slate-500 mt-1 ml-5">Útil pra cadências de tratamento VIP.</p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div>
              {isEdit && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-xs text-red-700">Confirmar exclusão?</span>
                    <button type="button" onClick={handleDelete} className="text-xs font-semibold text-red-700 underline" disabled={isPending}>Sim, excluir</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500">cancelar</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir modelo
                  </button>
                )
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
              <Button type="submit" disabled={!podeS || isPending}>{isEdit ? 'Salvar' : 'Criar modelo'}</Button>
            </div>
          </div>
        </form>

        <div className={cn('px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500')}>
          <strong>Importante:</strong> ao criar, o modelo nasce <strong>desativado</strong>. Ative manualmente quando estiver pronto pra produção.
        </div>
      </div>
    </div>
  )
}
