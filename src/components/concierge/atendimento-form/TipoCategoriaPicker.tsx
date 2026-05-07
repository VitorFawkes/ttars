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
  onTipoChange: (tipo: TipoConcierge) => void
  onCategoriaChange: (categoria: CategoriaConcierge) => void
  produtoSlug: string | null | undefined
}

export function TipoCategoriaPicker({
  tipo,
  categoria,
  onTipoChange,
  onCategoriaChange,
  produtoSlug,
}: TipoCategoriaPickerProps) {
  const categoriasDoProduto = useMemo(() => categoriasParaProduto(produtoSlug), [produtoSlug])

  const categoriasDoTipo = useMemo(() => {
    return categoriasDoProduto
      .filter(c => c.config.tipo === tipo)
      .map(c => c.key as CategoriaConcierge)
  }, [tipo, categoriasDoProduto])

  // Categoria efetiva: se a selecionada saiu da lista (porque o tipo mudou),
  // cai na primeira disponível. Mantém renderização sem flicker — sem effect.
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
            onTipoChange(newTipo)
            // Garante que a categoria pertença ao novo tipo
            const novasCategorias = categoriasDoProduto
              .filter(c => c.config.tipo === newTipo)
              .map(c => c.key as CategoriaConcierge)
            if (novasCategorias.length > 0 && !novasCategorias.includes(categoria)) {
              onCategoriaChange(novasCategorias[0])
            }
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
          onChange={(e) => onCategoriaChange(e.target.value as CategoriaConcierge)}
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
