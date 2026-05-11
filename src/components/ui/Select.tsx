import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from './dropdown-menu';

export interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function Select({ value, onChange, options, placeholder = 'Select...', className, disabled = false }: SelectProps) {
    const selectedOption = options.find(opt => opt.value === value);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <button
                    type="button"
                    className={cn(
                        "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
                        className
                    )}
                >
                    <span className={cn("block truncate", !selectedOption && "text-muted-foreground")}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="max-h-[50vh] overflow-y-auto min-w-[var(--radix-dropdown-menu-trigger-width)] w-full"
                align="start"
            >
                {options.map((option) => (
                    <DropdownMenuItem
                        key={option.value}
                        onSelect={() => onChange(option.value)}
                        className={cn(
                            "cursor-pointer justify-between",
                            option.value === value && "bg-accent/50 font-medium"
                        )}
                    >
                        {option.label}
                        {option.value === value && (
                            <Check className="h-4 w-4 text-primary ml-2" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
