import React from 'react'
import { Lock, Unlock } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFieldLock } from '../../hooks/useFieldLock'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'

interface FieldLockButtonProps {
  fieldKey: string
  cardId: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Botão de bloqueio para campos individuais.
 * Quando bloqueado (locked), o campo não é atualizado automaticamente pelas integrações.
 *
 * Visual:
 * - Locked: Cadeado fechado, cor amber, sempre visível
 * - Unlocked: Cadeado aberto, cor cinza, visível no hover
 */
export function FieldLockButton({
  fieldKey,
  cardId,
  size = 'sm',
  className
}: FieldLockButtonProps) {
  const { isLocked, toggleLock, isUpdating } = useFieldLock(cardId)
  const locked = isLocked(fieldKey)

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const buttonSize = size === 'sm' ? 'p-1' : 'p-1.5'

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Evita abrir modal de edição ao clicar no lock
    toggleLock(fieldKey)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            disabled={isUpdating}
            className={cn(
              buttonSize,
              "rounded-full transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-offset-1",
              locked
                ? "text-amber-600 bg-amber-50 hover:bg-amber-100 focus:ring-amber-300"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:ring-gray-300",
              isUpdating && "opacity-50 cursor-not-allowed",
              className
            )}
            aria-label={locked ? "Desbloquear campo para atualizações automáticas" : "Bloquear atualizações automáticas"}
          >
            {isUpdating ? (
              <span className={cn(iconSize, "block animate-spin border-2 border-current border-t-transparent rounded-full")} />
            ) : locked ? (
              <Lock className={iconSize} />
            ) : (
              <Unlock className={iconSize} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">
            {locked
              ? "Campo bloqueado - atualizações automáticas da integração são ignoradas. Clique para desbloquear."
              : "Campo liberado - aceita atualizações automáticas da integração. Clique para bloquear."
            }
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default FieldLockButton
