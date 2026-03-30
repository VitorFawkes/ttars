import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePipelineFilters, initialState } from './usePipelineFilters';

export function usePipelinePersistence() {
    const { user } = useAuth();
    const { setAll, reset, ...currentState } = usePipelineFilters();

    // Load state when user changes
    useEffect(() => {
        if (!user) {
            reset();
            return;
        }

        const key = `pipeline-filters-${user.id}`;
        const saved = localStorage.getItem(key);

        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Migra groupFilters do formato antigo (showLinked/showSolo) para novo
                if (parsed.groupFilters && 'showLinked' in parsed.groupFilters) {
                    parsed.groupFilters = {
                        showGroupMembers: true,
                        showSubCards: true,
                        showSolo: true,
                    };
                }
                setAll({ ...initialState, ...parsed });
            } catch (e) {
                console.error('Failed to parse saved pipeline filters', e);
                // If parse fails, maybe clear it? or just use defaults
                // localStorage.removeItem(key);
                reset();
            }
        } else {
            // No saved state for this user, reset to defaults
            reset();
        }
    }, [user, user?.id, setAll, reset]);

    // Save state when it changes
    useEffect(() => {
        if (!user) return;

        const key = `pipeline-filters-${user.id}`;

        // We only want to save the persistable parts of the state
        // We can reconstruct the object to save based on what we want to persist
        const stateToSave = {
            viewMode: currentState.viewMode,
            subView: currentState.subView,
            filters: currentState.filters,
            groupFilters: currentState.groupFilters,
            showClosedCards: currentState.showClosedCards,
            showWonDirect: currentState.showWonDirect,
            collapsedPhases: currentState.collapsedPhases
        };

        localStorage.setItem(key, JSON.stringify(stateToSave));
    }, [
        user,
        user?.id,
        currentState.viewMode,
        currentState.subView,
        currentState.filters,
        currentState.groupFilters,
        currentState.showClosedCards,
        currentState.showWonDirect,
        currentState.collapsedPhases
    ]);
}
