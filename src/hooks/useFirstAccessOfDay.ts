import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'welcomecrm.lastPendenciaModalShownDate';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Detecta o "1º acesso do dia" ao CRM.
 * Sinais: mount, document.visibilitychange ('visible'), window focus.
 * Persiste a data do último disparo em localStorage. Sem rede.
 *
 * Uso:
 *   const { isFirstAccess, markShown } = useFirstAccessOfDay();
 *   // Quando exibir o modal, chame markShown() para silenciar até o próximo dia.
 */
export function useFirstAccessOfDay() {
  const [isFirstAccess, setIsFirstAccess] = useState<boolean>(false);

  const check = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (stored !== todayISO()) {
      setIsFirstAccess(true);
    }
  }, []);

  const markShown = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, todayISO());
    } catch {
      // localStorage pode estar bloqueado (modo privado, quota); silenciar.
    }
    setIsFirstAccess(false);
  }, []);

  useEffect(() => {
    check();
    const onVis = () => check();
    const onFocus = () => check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  return { isFirstAccess, markShown };
}
