import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingNotifications } from '@/hooks/usePendingNotifications';
import { useFirstAccessOfDay } from '@/hooks/useFirstAccessOfDay';
import { PendenciaItem } from './PendenciaItem';

export function PendenciasModalDiario() {
  const { profile } = useAuth();
  const { byChannel, isLoading } = usePendingNotifications();
  const { isFirstAccess, markShown } = useFirstAccessOfDay();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const pendencias = byChannel('modal');

  useEffect(() => {
    if (!isLoading && isFirstAccess && pendencias.length > 0) {
      setIsOpen(true);
    }
  }, [isLoading, isFirstAccess, pendencias.length]);

  function handleClose() {
    setIsOpen(false);
    markShown();
  }

  function handleOpenCard(cardId: string) {
    handleClose();
    navigate(`/cards/${cardId}`);
  }

  if (!isOpen) return null;

  const nome = profile?.nome?.split(' ')[0] ?? '';
  const greeting = nome ? `Bom dia, ${nome}` : 'Bom dia';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">{greeting}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Você tem {pendencias.length} {pendencias.length === 1 ? 'pendência' : 'pendências'} hoje
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto space-y-2 p-4">
          {pendencias.map((p) => (
            <PendenciaItem key={p.id} pendencia={p} onOpen={handleOpenCard} />
          ))}
        </div>

        <footer className="flex justify-end border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
