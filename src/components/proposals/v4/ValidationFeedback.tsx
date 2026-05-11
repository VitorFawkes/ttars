/**
 * ValidationFeedback - Componente de feedback visual para validação
 *
 * Exibe erros e avisos de forma clara e não intrusiva
 */

import { AlertCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ValidationFeedbackProps {
    errors?: string[]
    warnings?: string[]
    className?: string
}

export function ValidationFeedback({
    errors = [],
    warnings = [],
    className
}: ValidationFeedbackProps) {
    // Não renderiza se não há nada para mostrar
    if (errors.length === 0 && warnings.length === 0) {
        return null
    }

    return (
        <div className={cn(
            "mt-3 space-y-1.5 p-3 rounded-lg border",
            errors.length > 0
                ? "bg-red-50 border-red-200"
                : "bg-amber-50 border-amber-200",
            className
        )}>
            {/* Erros (bloqueantes) */}
            {errors.map((error, index) => (
                <p
                    key={`error-${index}`}
                    className="text-xs text-red-600 flex items-start gap-1.5"
                >
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                </p>
            ))}

            {/* Avisos (não bloqueantes) */}
            {warnings.map((warning, index) => (
                <p
                    key={`warning-${index}`}
                    className="text-xs text-amber-600 flex items-start gap-1.5"
                >
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>{warning}</span>
                </p>
            ))}
        </div>
    )
}

export default ValidationFeedback
