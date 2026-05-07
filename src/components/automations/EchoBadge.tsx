/**
 * EchoBadge — pequeno componente que renderiza o ícone do Echo + label,
 * usado pra marcar visualmente as ações que falam com a plataforma Echo
 * (envio, gestão de conversa, etc.).
 *
 * Em telas com fundo claro, mostra o ícone `/echo-icon.png` à esquerda do
 * texto; pode ser usado em botões, badges, headers de step, etc.
 */
import React from 'react'

interface EchoBadgeProps {
    label?: string
    size?: number
    /** Quando true, mostra apenas o ícone (sem label) */
    iconOnly?: boolean
    className?: string
}

export const EchoBadge: React.FC<EchoBadgeProps> = ({
    label,
    size = 14,
    iconOnly = false,
    className = '',
}) => {
    return (
        <span className={`inline-flex items-center gap-1 ${className}`}>
            <img
                src="/echo-icon.png"
                alt="Echo"
                width={size}
                height={size}
                className="rounded-sm"
                style={{ width: size, height: size }}
            />
            {!iconOnly && label && <span>{label}</span>}
        </span>
    )
}

export default EchoBadge
