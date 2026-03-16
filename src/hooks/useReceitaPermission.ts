/**
 * useReceitaPermission
 *
 * Desde 2026-03: Produtos são populados via CSV na página Vendas Monde.
 * Edição manual removida — canEdit sempre false.
 * Hook mantido para compatibilidade com consumidores existentes.
 */
export function useReceitaPermission() {
  return {
    canView: true,
    canEdit: false,
  }
}
