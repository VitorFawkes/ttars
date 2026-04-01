import React from 'react'
import { Copy } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'

interface FieldCopyButtonProps {
  sourceLabel: string
  onCopy: () => void
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Botão para copiar valor de um campo irmão.
 * Visual idêntico ao FieldLockButton.
 */
export function FieldCopyButton({
  sourceLabel,
  onCopy,
  disabled = false,
  size = 'sm',
  className
}: FieldCopyButtonProps) {
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const buttonSize = size === 'sm' ? 'p-1' : 'p-1.5'

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!disabled) onCopy()
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            disabled={disabled}
            className={cn(
              buttonSize,
              "rounded-full transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-offset-1",
              "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 focus:ring-indigo-300",
              disabled && "opacity-50 cursor-not-allowed",
              className
            )}
            aria-label={`Copiar de ${sourceLabel}`}
          >
            <Copy className={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">
            Copiar de {sourceLabel}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default FieldCopyButton
