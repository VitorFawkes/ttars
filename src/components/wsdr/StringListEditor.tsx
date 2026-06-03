import React, { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { SortableList } from '@/components/wsdr/editor/SortableList'

interface StringListEditorProps {
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  label?: string
  description?: string
  allowReorder?: boolean
}

// Lista editável de textos. Reordena ARRASTANDO (não setas). Cada item mostra o texto
// INTEIRO (quebra linha, não corta) e abre pra editar num textarea ao clicar.
export function StringListEditor({
  items,
  onChange,
  placeholder = 'Escreva e aperte Enter para adicionar',
  label,
  description,
  allowReorder = true,
}: StringListEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newValue, setNewValue] = useState('')

  const handleAdd = () => {
    if (newValue.trim()) {
      onChange([...items, newValue.trim()])
      setNewValue('')
    }
  }
  const handleDelete = (index: number) => onChange(items.filter((_, i) => i !== index))
  const startEdit = (index: number) => { setEditingIndex(index); setEditValue(items[index]) }
  const saveEdit = (index: number) => {
    if (editValue.trim()) {
      const next = [...items]; next[index] = editValue.trim(); onChange(next)
    }
    setEditingIndex(null); setEditValue('')
  }

  const renderRow = (item: string, index: number) => (
    <div className="flex items-start gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
      {editingIndex === index ? (
        <Textarea
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setEditingIndex(null); setEditValue('') } }}
          onBlur={() => saveEdit(index)}
          className="flex-1 min-h-[60px] text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => startEdit(index)}
          className="flex-1 text-left text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words hover:text-slate-900"
          title="Clique para editar"
        >
          {item}
        </button>
      )}
      <button type="button" onClick={() => handleDelete(index)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 shrink-0" title="Remover">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-medium text-slate-900">{label}</label>}
      {description && <p className="text-xs text-slate-500">{description}</p>}

      <div className="flex gap-2">
        <Input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') handleAdd() }}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" onClick={handleAdd} size="sm" className="bg-ww-gold hover:bg-ww-gold-ink text-white shrink-0">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-1">Nenhum item ainda.</p>
      ) : allowReorder ? (
        <SortableList items={items} onReorder={onChange} renderItem={renderRow} />
      ) : (
        <div className="space-y-2">{items.map((it, i) => <div key={i}>{renderRow(it, i)}</div>)}</div>
      )}
    </div>
  )
}
