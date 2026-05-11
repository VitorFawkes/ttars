import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "../../lib/utils"
import { X } from "lucide-react"

const DialogContext = React.createContext<{
    open: boolean
    onOpenChange: (open: boolean) => void
} | null>(null)

const Dialog = ({ children, open, onOpenChange }: { children: React.ReactNode, open?: boolean, onOpenChange?: (open: boolean) => void }) => {
    // If controlled, use props. If uncontrolled (not supported here but good for future), use state.
    // For now, we assume controlled usage as per AddUserModal.

    return (
        <DialogContext.Provider value={{ open: !!open, onOpenChange: onOpenChange || (() => { }) }}>
            {children}
        </DialogContext.Provider>
    )
}

const DialogTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, onClick, asChild, children, ...props }, ref) => {
    const context = React.useContext(DialogContext)

    if (asChild && React.isValidElement<Record<string, unknown>>(children)) {
        const childOnClick = children.props.onClick as ((e: React.MouseEvent) => void) | undefined
        return React.cloneElement(children, {
            onClick: (e: React.MouseEvent) => {
                childOnClick?.(e)
                context?.onOpenChange(true)
            },
        })
    }

    return (
        <button
            ref={ref}
            className={cn(className)}
            onClick={(e) => {
                onClick?.(e)
                context?.onOpenChange(true)
            }}
            {...props}
        >
            {children}
        </button>
    )
})
DialogTrigger.displayName = "DialogTrigger"

const DialogContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
    const context = React.useContext(DialogContext)

    if (!context?.open) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in-0">
            <div className="fixed inset-0" onClick={() => context.onOpenChange(false)} />
            <div
                ref={ref}
                className={cn(
                    "relative z-50 flex flex-col w-full max-w-lg max-h-[90vh] gap-4 border bg-white p-6 shadow-lg duration-200 sm:rounded-lg animate-in fade-in-0 zoom-in-95 overflow-hidden",
                    className
                )}
                {...props}
            >
                <button
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                    onClick={() => context.onOpenChange(false)}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>
                {children}
            </div>
        </div>,
        document.body
    )
})
DialogContent.displayName = "DialogContent"

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col space-y-1.5 text-center sm:text-left",
            className
        )}
        {...props}
    />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
            className
        )}
        {...props}
    />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn(
            "text-lg font-semibold leading-none tracking-tight",
            className
        )}
        {...props}
    />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
))
DialogDescription.displayName = "DialogDescription"

export {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
}
