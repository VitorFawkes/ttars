import type { WwDiretoriaFaseKey } from '@/hooks/analyticsWeddings/useWw2'

// Cores por macro-fase (tokens ww-*). Compartilhado entre snapshot e visões de tempo.
export const FASE_UI: Record<WwDiretoriaFaseKey, { dot: string; bar: string; ink: string }> = {
  sdr:          { dot: 'bg-ww-gold',     bar: 'bg-ww-gold',     ink: 'text-ww-gold-ink' },
  closer:       { dot: 'bg-ww-rosewood', bar: 'bg-ww-rosewood', ink: 'text-ww-rosewood' },
  planejamento: { dot: 'bg-ww-olive',    bar: 'bg-ww-olive',    ink: 'text-ww-olive-ink' },
  producao:     { dot: 'bg-ww-blush',    bar: 'bg-ww-blush',    ink: 'text-ww-rosewood' },
}
