// Mapa setor (categoria de fornecedor) → ícone em /public/icons.
// Fonte única usada pelo card de planejamento e pelo banco de fornecedores.
export const SETOR_ICON: Record<string, string> = {
  'Buffet & Gastronomia': '/icons/food-delivery.png',
  'Decoração & Flores': '/icons/bouquet.png',
  'Música / DJ / Banda': '/icons/dj.png',
  'Fotografia & Vídeo': '/icons/camera.png',
  Celebrante: '/icons/celebrante.svg',
  'Beleza (cabelo & maquiagem)': '/icons/beleza.svg',
  'Convites & Papelaria': '/icons/convites.svg',
  'Transporte & Logística': '/icons/transporte.svg',
}

export function setorIcon(setor: string | null | undefined): string | undefined {
  if (!setor) return undefined
  return SETOR_ICON[setor]
}
