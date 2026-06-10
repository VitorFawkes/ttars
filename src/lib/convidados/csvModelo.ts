// Conteúdo do CSV modelo que o casal pode baixar e preencher antes de importar.
// Estrutura igual à do exportConvitesCSV pra ser lida de volta sem ajuste.

export const CSV_MODELO_HEADER = [
  'Nome do convite',
  'Pessoa',
  'Idade',
  'Telefone',
  'Lado',
  'Tipo de relação',
  'Observação',
]

const EXEMPLO: string[][] = [
  ['Família Souza', 'Mariana Souza', 'Maior de 18', '48 99887-1122', 'Noivo', 'Família', 'Mãe do noivo'],
  ['Família Souza', 'Carlos Souza', 'Maior de 18', '48 99887-1123', 'Noivo', 'Família', 'Pai do noivo'],
  ['Família Souza', 'Pedro Souza', 'Menor de 18', '', 'Noivo', 'Família', 'Irmão caçula'],
  ['Padrinhos do Rafael', 'Felipe Andrade', 'Maior de 18', '11 98765-4321', 'Noivo', 'Madrinha/Padrinho', 'Melhor amigo do noivo'],
  ['Padrinhos do Rafael', 'Renata Andrade', 'Maior de 18', '11 98765-4322', 'Noivo', 'Madrinha/Padrinho', 'Esposa do Felipe'],
  ['Amigos da faculdade', 'Beatriz Mendes', 'Maior de 18', '47 99100-2030', 'Noiva', 'Amigo(a)', 'Direito 2018'],
  ['Família Vasconcelos', 'Helena Vasconcelos', 'Maior de 18', '48 3222-1010', 'Noiva', 'Família', 'Avó — mesa principal'],
  ['Família Vasconcelos', 'Sofia Vasconcelos', 'Menor de 18', '', 'Noiva', 'Família', 'Filha do Ricardo'],
  ['Os Bittencourt', 'Roberta Bittencourt', 'Maior de 18', '48 99555-7788', 'Ambos', 'Amigo(a)', 'Casal amigo dos dois'],
  ['Os Bittencourt', 'André Bittencourt', 'Maior de 18', '48 99555-7789', 'Ambos', 'Amigo(a)', ''],
]

function cellEscape(v: string): string {
  if (/[,;"\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

export function modeloCSVContent(): string {
  const rows = [CSV_MODELO_HEADER, ...EXEMPLO]
  return '﻿' + rows.map((r) => r.map(cellEscape).join(',')).join('\n')
}
