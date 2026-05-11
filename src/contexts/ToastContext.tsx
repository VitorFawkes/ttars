import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    title: string;
    description?: string;
    type: ToastType;
}

interface ToastContextType {
    toast: (props: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback(({ title, description, type = 'info' }: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, title, description, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={cn(
                            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-white p-4 shadow-lg transition-all animate-in slide-in-from-right-full duration-300",
                            t.type === 'success' && "border-green-200 bg-green-50",
                            t.type === 'error' && "border-red-200 bg-red-50",
                            t.type === 'warning' && "border-yellow-200 bg-yellow-50",
                            t.type === 'info' && "border-blue-200 bg-blue-50"
                        )}
                    >
                        {t.type === 'success' && <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />}
                        {t.type === 'error' && <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />}
                        {t.type === 'warning' && <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />}
                        {t.type === 'info' && <Info className="h-5 w-5 text-blue-600 mt-0.5" />}

                        <div className="flex-1">
                            <h3 className={cn("text-sm font-medium",
                                t.type === 'success' && "text-green-900",
                                t.type === 'error' && "text-red-900",
                                t.type === 'warning' && "text-yellow-900",
                                t.type === 'info' && "text-blue-900"
                            )}>
                                {t.title}
                            </h3>
                            {t.description && (
                                <p className={cn("mt-1 text-xs",
                                    t.type === 'success' && "text-green-700",
                                    t.type === 'error' && "text-red-700",
                                    t.type === 'warning' && "text-yellow-700",
                                    t.type === 'info' && "text-blue-700"
                                )}>
                                    {t.description}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => removeToast(t.id)}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
