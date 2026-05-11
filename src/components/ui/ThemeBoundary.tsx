import React from 'react';
import { cn } from '@/lib/utils';

interface ThemeBoundaryProps extends React.HTMLAttributes<HTMLDivElement> {
    mode: 'light' | 'dark';
    children: React.ReactNode;
}

/**
 * ThemeBoundary
 * 
 * Enforces a specific theme mode (light or dark) for its children.
 * This is the core mechanism of the Elite Design System, allowing
 * a Hybrid Theme where Sidebar is Dark and Content is Light.
 * 
 * Usage:
 * <ThemeBoundary mode="dark"> <Sidebar /> </ThemeBoundary>
 * <ThemeBoundary mode="light"> <MainContent /> </ThemeBoundary>
 */
export const ThemeBoundary = React.forwardRef<HTMLDivElement, ThemeBoundaryProps>(
    ({ mode, className, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    // If mode is dark, add 'dark' class. If light, remove it (or ensure it's not present).
                    // Note: Tailwind's 'dark' class is usually applied to 'html', but here we apply it to a div
                    // to create a nested theme context.
                    mode === 'dark' ? 'dark' : 'light',
                    // Apply base text/bg colors for this universe
                    "bg-surface-primary text-text-primary",
                    "transition-colors duration-300",
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

ThemeBoundary.displayName = "ThemeBoundary";
