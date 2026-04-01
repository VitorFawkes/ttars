import { Bell, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNotifications, NOTIFICATION_NEW_EVENT } from '@/hooks/useNotifications'
import NotificationDrawer from './notifications/NotificationDrawer'

const STORAGE_KEY = 'notification-btn-pos'
const MINIMIZED_KEY = 'notification-btn-minimized'

function loadPosition(): { x: number; y: number } | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return null
}

function savePosition(pos: { x: number; y: number }) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
}

export default function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false)
    const [bouncing, setBouncing] = useState(false)
    const [minimized, setMinimized] = useState(() => localStorage.getItem(MINIMIZED_KEY) === 'true')
    const { unreadCount, updateBaseline } = useNotifications()

    // Position state — null means use default (bottom-right)
    const [position, setPosition] = useState<{ x: number; y: number } | null>(loadPosition)
    const draggingRef = useRef(false)
    const dragStartRef = useRef({ mouseX: 0, mouseY: 0, elX: 0, elY: 0 })
    const hasDraggedRef = useRef(false)
    const btnRef = useRef<HTMLButtonElement>(null)
    // Auto-open when user arrives with unread notifications
    const hasAutoOpenedRef = useRef(false)
    useEffect(() => {
        if (unreadCount > 0 && !hasAutoOpenedRef.current && !minimized) {
            hasAutoOpenedRef.current = true
            // Use rAF to avoid synchronous setState-in-effect lint
            requestAnimationFrame(() => setIsOpen(true))
        }
    }, [unreadCount, minimized])

    // Listen for new notification events from the realtime subscription
    const handleNewNotification = useCallback(() => {
        if (!minimized) {
            setIsOpen(true)
        }
        setBouncing(true)
        setTimeout(() => setBouncing(false), 2000)
    }, [minimized])

    useEffect(() => {
        window.addEventListener(NOTIFICATION_NEW_EVENT, handleNewNotification)
        return () => window.removeEventListener(NOTIFICATION_NEW_EVENT, handleNewNotification)
    }, [handleNewNotification])

    const handleClose = () => {
        setIsOpen(false)
        updateBaseline()
    }

    // Drag handlers
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        draggingRef.current = true
        hasDraggedRef.current = false
        const btn = btnRef.current
        if (!btn) return

        const rect = btn.getBoundingClientRect()
        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            elX: rect.left,
            elY: rect.top,
        }
        btn.setPointerCapture(e.pointerId)
    }, [])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current) return
        const dx = e.clientX - dragStartRef.current.mouseX
        const dy = e.clientY - dragStartRef.current.mouseY

        // Only start dragging after 5px movement to avoid accidental drags
        if (!hasDraggedRef.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        hasDraggedRef.current = true

        const btnSize = minimized ? 32 : 48
        const newX = Math.max(0, Math.min(window.innerWidth - btnSize, dragStartRef.current.elX + dx))
        const newY = Math.max(0, Math.min(window.innerHeight - btnSize, dragStartRef.current.elY + dy))
        setPosition({ x: newX, y: newY })
    }, [minimized])

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current) return
        draggingRef.current = false
        const btn = btnRef.current
        if (btn) btn.releasePointerCapture(e.pointerId)

        if (hasDraggedRef.current && position) {
            savePosition(position)
        }
    }, [position])

    const handleClick = () => {
        // Don't open if we just finished dragging
        if (hasDraggedRef.current) return
        if (minimized) {
            setMinimized(false)
            localStorage.setItem(MINIMIZED_KEY, 'false')
            return
        }
        setIsOpen(true)
    }

    const handleMinimize = (e: React.MouseEvent) => {
        e.stopPropagation()
        setMinimized(true)
        setIsOpen(false)
        localStorage.setItem(MINIMIZED_KEY, 'true')
        updateBaseline()
    }

    // Compute style: use saved position or default bottom-right
    const btnStyle: React.CSSProperties = position
        ? { position: 'fixed', left: position.x, top: position.y, bottom: 'auto', right: 'auto' }
        : { position: 'fixed', bottom: 24, right: 24 }

    // Drawer position follows button
    const drawerStyle: React.CSSProperties | undefined = position
        ? (() => {
            const btnSize = minimized ? 32 : 48
            const drawerWidth = 400
            const drawerMaxHeight = Math.min(600, window.innerHeight - 80)
            let left = position.x + btnSize - drawerWidth
            if (left < 8) left = 8
            let top = position.y - drawerMaxHeight - 8
            if (top < 8) {
                top = position.y + btnSize + 8
            }
            return { left, top, bottom: 'auto', right: 'auto' }
        })()
        : undefined

    return (
        <>
            {/* Floating bell button — draggable */}
            <div className="group z-40" style={btnStyle}>
                <button
                    ref={btnRef}
                    data-notification-trigger
                    type="button"
                    aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}
                    className={cn(
                        'relative flex items-center justify-center rounded-full shadow-lg transition-all duration-200 touch-none select-none',
                        minimized ? 'w-8 h-8' : 'w-12 h-12',
                        isOpen && !minimized && 'scale-0 pointer-events-none',
                        unreadCount > 0
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-xl hover:scale-105'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:shadow-xl hover:scale-105',
                        'cursor-grab active:cursor-grabbing'
                    )}
                    onClick={handleClick}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    <div className="relative">
                        <Bell className={cn(
                            minimized ? 'h-3.5 w-3.5' : 'h-5 w-5',
                            bouncing && 'animate-bounce'
                        )} />
                        {unreadCount > 0 && (
                            <span className={cn(
                                'absolute -top-2 -right-2 flex items-center justify-center rounded-full text-white bg-red-500 ring-2 ring-white font-bold',
                                minimized
                                    ? 'min-w-[14px] h-[14px] text-[8px]'
                                    : 'min-w-[18px] h-[18px] text-[10px]'
                            )}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </div>
                </button>

                {/* Minimize button — appears on hover */}
                {!minimized && !isOpen && (
                    <button
                        type="button"
                        onClick={handleMinimize}
                        className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-slate-900 shadow-sm"
                        title="Minimizar"
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                )}
            </div>

            {/* Expanding notification box */}
            <NotificationDrawer isOpen={isOpen} onClose={handleClose} positionStyle={drawerStyle} />
        </>
    )
}
