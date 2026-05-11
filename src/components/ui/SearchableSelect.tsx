import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
    value: string;
    label: string;
}

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    searchPlaceholder?: string;
    className?: string;
    disabled?: boolean;
}

export function SearchableSelect({
    value,
    onChange,
    options,
    placeholder = 'Selecione...',
    searchPlaceholder = 'Buscar...',
    className,
    disabled = false
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    // Check if option is a section header (non-selectable)
    const isSectionHeader = (value: string) => value.startsWith('__section_');

    // Filter options based on search term (keep section headers if any items in that section match)
    const filteredOptions = options.filter(option => {
        // Always hide section headers when searching
        if (searchTerm && isSectionHeader(option.value)) return false;

        return option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            option.value.toLowerCase().includes(searchTerm.toLowerCase());
    });

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
    };

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
                    className
                )}
            >
                <span className={cn("block truncate text-left flex-1", !selectedOption && "text-muted-foreground")}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <div className="flex items-center gap-1">
                    {selectedOption && value && (
                        <X
                            className="h-4 w-4 opacity-50 hover:opacity-100 cursor-pointer"
                            onClick={handleClear}
                        />
                    )}
                    <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", isOpen && "rotate-180")} />
                </div>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[280px] rounded-md border bg-popover shadow-lg">
                    {/* Search Input */}
                    <div className="p-2 border-b">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full h-7 pl-8 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            {searchTerm && (
                                <X
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer"
                                    onClick={() => setSearchTerm('')}
                                />
                            )}
                        </div>
                    </div>

                    {/* Options List */}
                    <div className="max-h-[300px] overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <div className="p-2.5 text-xs text-muted-foreground text-center">
                                Nenhum resultado encontrado
                            </div>
                        ) : (
                            filteredOptions.map((option) => {
                                // Section header (non-selectable)
                                if (isSectionHeader(option.value)) {
                                    return (
                                        <div
                                            key={option.value}
                                            className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/50 border-y border-border sticky top-0"
                                        >
                                            {option.label}
                                        </div>
                                    );
                                }

                                // Regular selectable option
                                return (
                                    <div
                                        key={option.value}
                                        onClick={() => handleSelect(option.value)}
                                        className={cn(
                                            "flex items-center justify-between px-2.5 py-1.5 text-xs cursor-pointer hover:bg-accent",
                                            option.value === value && "bg-accent/50 font-medium"
                                        )}
                                    >
                                        <span className="truncate">{option.label}</span>
                                        {option.value === value && (
                                            <Check className="h-4 w-4 text-primary ml-2 flex-shrink-0" />
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Results count */}
                    {searchTerm && filteredOptions.length > 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                            {filteredOptions.length} de {options.length} opções
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
