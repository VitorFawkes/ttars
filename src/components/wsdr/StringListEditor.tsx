import React, { useState } from 'react'
import { Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface StringListEditorProps {
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  label?: string
  description?: string
  allowReorder?: boolean
}

export function StringListEditor({
  items,
  onChange,
  placeholder = 'Pressione Enter para adicionar',
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

  const handleDelete = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const handleStartEdit = (index: number) => {
    setEditingIndex(index)
    setEditValue(items[index])
  }

  const handleSaveEdit = (index: number) => {
    if (editValue.trim()) {
      const newItems = [...items]
      newItems[index] = editValue.trim()
      onChange(newItems)
    }
    setEditingIndex(null)
    setEditValue('')
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items]
    const otherIndex = direction === 'up' ? index - 1 : index + 1
    if (otherIndex >= 0 && otherIndex < newItems.length) {
      [newItems[index], newItems[otherIndex]] = [newItems[otherIndex], newItems[index]]
      onChange(newItems)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, index?: number) => {
    if (e.key === 'Enter') {
      if (index !== undefined) {
        handleSaveEdit(index)
      } else {
        handleAdd()
      }
    } else if (e.key === 'Escape') {
      setEditingIndex(null)
      setEditValue('')
    }
  }

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-medium text-slate-900">{label}</label>}
      {description && <p className="text-xs text-slate-500">{description}</p>}

      {/* Input para adicionar novo item */}
      <div className="flex gap-2">
        <Input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="button"
          onClick={handleAdd}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Lista de itens */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            {allowReorder && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handleMove(index, 'up')}
                  disabled={index === 0}
                  className="p-0.5 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Mover para cima"
                >
                  <ChevronUp className="w-3 h-3 text-slate-500" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 'down')}
                  disabled={index === items.length - 1}
                  className="p-0.5 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Mover para baixo"
                >
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </button>
              </div>
            )}

            {editingIndex === index ? (
              <Input
                autoFocus
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onBlur={() => handleSaveEdit(index)}
                className="flex-1"
              />
            ) : (
              <input
                type="text"
                value={item}
                onClick={() => handleStartEdit(index)}
                readOnly
                className="flex-1 text-sm text-slate-900 cursor-pointer bg-transparent"
              />
            )}

            <button
              type="button"
              onClick={() => handleDelete(index)}
              className="p-1.5 hover:bg-red-100 rounded transition-colors"
              title="Deletar"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          </div>
        ))}

        {items.length === 0 && (
          <p className="text-xs text-slate-400 italic py-2">Nenhum item adicionado ainda.</p>
        )}
      </div>
    </div>
  )
}
