import { useMemo } from 'react'
import {
  CATEGORIAS_CONCIERGE,
  TIPO_LABEL,
  categoriasParaProduto,
  type TipoConcierge,
  type CategoriaConcierge,
} from '../../../hooks/concierge/types'

interface TipoCategoriaPickerProps {
  tipo: TipoConcierge
  categoria: CategoriaConcierge
  /**
   * Único callback que emite tipo + categoria juntos. Evita race condition
   * com stale closure no parent: se chamássemos `onTipoChange` e depois
   * `onCategoriaChange` em sequência, ambos os spreads usariam o mesmo
   * `value` defasado e a segunda chamada sobrescreveria a primeira.
   */
  onChange: (next: { tipo: TipoConcierge; categoria: CategoriaConcierge }) => void
  produtoSlug: string | null | undefined
}

export function TipoCategoriaPicker({
  tipo,
  categoria,
  onChange,
  produtoSlug,
}: TipoCategoriaPickerProps) {
  const categoriasDoProduto = useMemo(() => categoriasParaProduto(produtoSlug), [produtoSlug])

  const categoriasDoTipo = useMemo(() => {
    return categoriasDoProduto
      .filter(c => c.config.tipo === tipo)
      .map(c => c.key as CategoriaConcierge)
  }, [tipo, categoriasDoProduto])

  // Se o categoria do parent não pertence ao tipo atual (ex: estado inicial
  // inconsistente), exibe a primeira categoria válida. O onChange do select
  // sempre emite valores consistentes (tipo + categoria casados).
  const effectiveCategoria: CategoriaConcierge = categoriasDoTipo.includes(categoria)
    ? categoria
    : (categoriasDoTipo[0] ?? 'outro')

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Tipo *
        </label>
        <select
          value={tipo}
          onChange={(e) => {
            const newTipo = e.target.value as TipoConcierge
            const novasCategorias = categoriasDoProduto
              .filter(c => c.config.tipo === newTipo)
              .map(c => c.key as CategoriaConcierge)
            const newCategoria: CategoriaConcierge = novasCategorias.includes(categoria)
              ? categoria
              : (novasCategorias[0] ?? 'outro')
            onChange({ tipo: newTipo, categoria: newCategoria })
          }}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
        >
          {Object.entries(TIPO_LABEL).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Categoria *
        </label>
        <select
          value={effectiveCategoria}
          onChange={(e) => {
            const newCategoria = e.target.value as CategoriaConcierge
            // Deriva o tipo da categoria — categoria é a fonte de verdade.
            const newTipo = CATEGORIAS_CONCIERGE[newCategoria].tipo
            onChange({ tipo: newTipo, categoria: newCategoria })
          }}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
        >
          {categoriasDoTipo.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORIAS_CONCIERGE[cat].label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
