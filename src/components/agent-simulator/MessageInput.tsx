import { useState, useRef, useEffect } from 'react'
import { Send, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface MessageInputProps {
  onSend: (text: string) => void
  onReset: () => void
  disabled?: boolean
}

export function MessageInput({ onSend, onReset, disabled }: MessageInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex items-end gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
      <button
        onClick={onReset}
        disabled={disabled}
        className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg disabled:opacity-50"
        aria-label="Resetar conversa"
        title="Resetar conversa"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Digite como se fosse o cliente..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      />
      <Button
        onClick={send}
        disabled={disabled || !text.trim()}
        size="icon"
        className="h-10 w-10 flex-shrink-0"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  )
}
