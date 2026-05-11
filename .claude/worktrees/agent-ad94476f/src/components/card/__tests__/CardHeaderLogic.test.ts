import { describe, it, expect } from 'vitest';

// Mock Card Interface based on View
interface MockCard {
    status_comercial: string;
    valor_estimado: number | null;
    valor_final: number | null;
    proxima_tarefa: any;
    tempo_sem_contato: number | null;
    solicitacao_mudanca?: boolean; // Simplified for test
}

// Logic extracted from CardHeader.tsx
const getDisplayValue = (card: MockCard) => {
    if (card.status_comercial === 'ganho' || card.status_comercial === 'perdido') {
        return card.valor_final || card.valor_estimado || 0;
    }
    return card.valor_estimado || 0;
};



describe('CardHeader Logic SSOT', () => {
    it('should use valor_estimado for open cards', () => {
        const card: MockCard = {
            status_comercial: 'aberto',
            valor_estimado: 5000,
            valor_final: 99999, // Should be ignored if present (though DB trigger prevents this)
            proxima_tarefa: null,
            tempo_sem_contato: 0
        };
        expect(getDisplayValue(card)).toBe(5000);
    });

    it('should use valor_final for won cards', () => {
        const card: MockCard = {
            status_comercial: 'ganho',
            valor_estimado: 5000,
            valor_final: 7000,
            proxima_tarefa: null,
            tempo_sem_contato: 0
        };
        expect(getDisplayValue(card)).toBe(7000);
    });

    it('should fallback to valor_estimado for won cards if final is missing', () => {
        const card: MockCard = {
            status_comercial: 'ganho',
            valor_estimado: 5000,
            valor_final: null,
            proxima_tarefa: null,
            tempo_sem_contato: 0
        };
        expect(getDisplayValue(card)).toBe(5000);
    });
});
