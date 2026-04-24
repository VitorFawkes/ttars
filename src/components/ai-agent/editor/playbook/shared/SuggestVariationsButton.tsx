import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { SuggestVariationsModal } from './SuggestVariationsModal'
import type { FieldType, SuggestVariationsContext } from '@/hooks/playbook/useAgentSuggestVariations'

interface Props {
  text: string
  fieldType: FieldType
  context?: SuggestVariationsContext
  onSelect: (text: string) => void
  className?: string
  label?: string
}

export function SuggestVariationsButton({ text, fieldType, context, onSelect, className, label }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn('gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50', className)}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {label ?? 'Sugerir variações'}
      </Button>
      {open && (
        <SuggestVariationsModal
          text={text}
          fieldType={fieldType}
          context={context}
          onSelect={(t) => { onSelect(t); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
