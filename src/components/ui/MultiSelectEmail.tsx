import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Plus } from 'lucide-react';
import { Badge } from "@/components/ui/Badge";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from '@/lib/supabase';

interface MultiSelectEmailProps {
    value: string[];
    onChange: (emails: string[]) => void;
    placeholder?: string;
}

export function MultiSelectEmail({ value = [], onChange, placeholder }: MultiSelectEmailProps) {
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<{ email: string, name: string }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Email validation regex
    const isValidEmail = (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // Fetch suggestions
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (inputValue.length < 2) {
                setSuggestions([]);
                return;
            }

            // Search in profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('email, nome')
                .eq('active', true)
                .ilike('email', `%${inputValue}%`)
                .limit(5);

            if (profiles) {
                setSuggestions(profiles.filter(p => p.email).map(p => ({ email: p.email!, name: p.nome || '' })));
            }
        };

        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [inputValue]);

    const addEmail = (email: string) => {
        const trimmed = email.trim();
        if (trimmed && isValidEmail(trimmed) && !value.includes(trimmed)) {
            onChange([...value, trimmed]);
            setInputValue('');
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const removeEmail = (emailToRemove: string) => {
        onChange(value.filter(email => email !== emailToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (['Enter', ',', 'Tab'].includes(e.key)) {
            e.preventDefault();
            if (inputValue) {
                addEmail(inputValue);
            }
        } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
            removeEmail(value[value.length - 1]);
        }
    };

    // Handle blur - auto add email when clicking outside
    const handleBlur = () => {
        // Small delay to allow click on suggestions
        setTimeout(() => {
            if (inputValue && isValidEmail(inputValue)) {
                addEmail(inputValue);
            }
            setShowSuggestions(false);
        }, 150);
    };

    // Click outside to close suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const showAddButton = inputValue && isValidEmail(inputValue);

    return (
        <div className="space-y-1.5" ref={containerRef}>
            <div className="flex flex-wrap gap-2 p-2 min-h-[42px] bg-white rounded-md border border-input ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                {value.map((email) => (
                    <Badge key={email} variant="secondary" className={`gap-1 pr-1 ${!isValidEmail(email) ? 'border-red-500 bg-red-50 text-red-700' : ''}`}>
                        {email}
                        <button
                            type="button"
                            onClick={() => removeEmail(email)}
                            className="ml-1 hover:bg-black/10 rounded-full p-0.5 transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
                <div className="relative flex-1 min-w-[120px] flex items-center gap-1">
                    <input
                        ref={inputRef}
                        type="email"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setShowSuggestions(true);
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={handleBlur}
                        className="w-full bg-transparent outline-none text-sm h-6"
                        placeholder={value.length === 0 ? (placeholder || "Digite o e-mail e pressione Enter") : "Adicionar outro..."}
                    />

                    {/* Botão visual para adicionar */}
                    {showAddButton && (
                        <button
                            type="button"
                            onClick={() => addEmail(inputValue)}
                            className="flex items-center gap-1 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors whitespace-nowrap"
                        >
                            <Plus className="h-3 w-3" />
                            Adicionar
                        </button>
                    )}

                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 w-full mt-1 z-50 bg-white rounded-md border shadow-md overflow-hidden">
                            <Command>
                                <CommandList>
                                    <CommandGroup>
                                        {suggestions.map((suggestion) => (
                                            <CommandItem
                                                key={suggestion.email}
                                                onSelect={() => addEmail(suggestion.email)}
                                                className="cursor-pointer flex items-center justify-between px-2 py-1.5 text-sm hover:bg-gray-100"
                                            >
                                                <div className="flex flex-col">
                                                    <span>{suggestion.email}</span>
                                                    {suggestion.name && <span className="text-xs text-gray-500">{suggestion.name}</span>}
                                                </div>
                                                {value.includes(suggestion.email) && <Check className="h-4 w-4 opacity-50" />}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </div>
                    )}
                </div>
            </div>

            {/* Feedback contextual */}
            {inputValue && !isValidEmail(inputValue) && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                    <span className="inline-block w-1 h-1 bg-amber-500 rounded-full"></span>
                    Digite um e-mail válido (ex: nome@empresa.com)
                </p>
            )}

            {/* Dica quando campo está vazio */}
            {!inputValue && value.length === 0 && (
                <p className="text-xs text-muted-foreground">
                    Digite o e-mail e pressione <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded border">Enter</kbd> para adicionar
                </p>
            )}
        </div>
    );
}
