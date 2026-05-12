import * as React from "react"
import { cn } from "../../lib/utils"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    /** When set, the textarea height resizes the user makes are saved to localStorage under this key and restored on mount. */
    persistKey?: string
}

const STORAGE_PREFIX = 'textarea-h:'

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, persistKey, style, ...props }, ref) => {
        const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

        const setRefs = React.useCallback((node: HTMLTextAreaElement | null) => {
            innerRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
        }, [ref])

        // Restore saved height on mount
        React.useLayoutEffect(() => {
            if (!persistKey) return
            const el = innerRef.current
            if (!el) return
            try {
                const saved = window.localStorage.getItem(STORAGE_PREFIX + persistKey)
                if (saved) {
                    const h = parseInt(saved, 10)
                    if (!Number.isNaN(h) && h > 0) el.style.height = `${h}px`
                }
            } catch { /* ignore */ }
        }, [persistKey])

        // Persist height when the user resizes via the native drag handle
        React.useEffect(() => {
            if (!persistKey) return
            const el = innerRef.current
            if (!el || typeof ResizeObserver === 'undefined') return

            let lastSaved = 0
            const ro = new ResizeObserver(() => {
                // Only save when the inline style.height is set (i.e. user dragged the resize handle)
                const inline = el.style.height
                if (!inline) return
                const h = el.offsetHeight
                if (h <= 0 || h === lastSaved) return
                lastSaved = h
                try { window.localStorage.setItem(STORAGE_PREFIX + persistKey, String(h)) } catch { /* ignore */ }
            })
            ro.observe(el)
            return () => ro.disconnect()
        }, [persistKey])

        return (
            <textarea
                className={cn(
                    "flex min-h-[60px] w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                ref={setRefs}
                style={style}
                {...props}
            />
        )
    }
)
Textarea.displayName = "Textarea"

export { Textarea }
