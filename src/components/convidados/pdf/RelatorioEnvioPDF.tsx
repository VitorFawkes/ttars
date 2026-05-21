import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const FONT_SANS = 'Helvetica'
const FONT_SANS_BOLD = 'Helvetica-Bold'
const FONT_SERIF_ITALIC = 'Times-Italic'

const C = {
  gold: '#BD965C',
  goldSoft: '#f6efe2',
  goldDark: '#8c6e3d',
  emerald: '#059669',
  amber: '#d97706',
  rose: '#9f1239',
  sky: '#0284c7',
  slate900: '#0f172a',
  slate700: '#334155',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  white: '#ffffff',
}

const LOGO_SRC = '/WelcomeWeddings_LogoHorizontal_Dourada_1080x1080.png'

const MONTHS = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]

function longDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}
function dateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} às ${hh}:${min}`
}
function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function cleanCoupleName(titulo: string): string {
  return titulo.replace(/^\s*(DW|D\.?W\.?|Elopement|Elop\.?)\s*[|\-—–]\s*/i, '').trim()
}

const ACK_LABEL: Record<number, string> = {
  0: 'Pendente',
  2: 'Enviada',
  3: 'Entregue',
  4: 'Lida',
}

export interface LoteInfo {
  template_slug: string
  started_at: string
  finished_at: string | null
  total: number
  sent: number
  failed: number
}

export interface MensagemEnvio {
  nome: string
  telefone: string | null
  has_error: boolean
  error_message: string | null
  ack_status: number | null
}

export interface RelatorioEnvioPdfProps {
  wedding: {
    titulo: string
    local: string | null
    wedding_date: string | null
  }
  lote: LoteInfo
  mensagens: MensagemEnvio[]
}

// ── Estilos ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: { padding: 0, fontFamily: FONT_SANS, backgroundColor: C.white, color: C.slate900 },
  pageContent: { paddingHorizontal: 56, paddingVertical: 56 },

  // Capa
  capa: { flexGrow: 1, paddingHorizontal: 56, paddingVertical: 72, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' },
  capaLogoTop: { width: 140, height: 140, objectFit: 'contain' },
  capaCenter: { alignItems: 'center', textAlign: 'center' },
  capaLabel: { fontSize: 10, color: C.gold, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 24 },
  capaCasal: { fontFamily: FONT_SERIF_ITALIC, fontSize: 44, color: C.slate900, lineHeight: 1.1 },
  capaDivisor: { width: 60, height: 1, backgroundColor: C.gold, marginVertical: 20 },
  capaTemplate: { fontSize: 13, color: C.slate700, marginBottom: 4 },
  capaTemplateCode: { fontFamily: FONT_SANS_BOLD, fontSize: 14, color: C.gold, marginVertical: 4 },
  capaData: { fontSize: 12, color: C.slate900 },
  capaFooter: { alignItems: 'center' },
  capaFooterTxt: { fontSize: 9, color: C.slate500 },

  // Header das páginas internas
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  pageHeaderLogo: { width: 80, height: 80, objectFit: 'contain' },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageHeaderCouple: { fontFamily: FONT_SERIF_ITALIC, fontSize: 16, color: C.slate900 },
  pageHeaderSub: { fontSize: 9, color: C.slate500, marginTop: 2 },

  // Seções
  sectionEyebrow: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6, color: C.gold },
  sectionTitle: { fontFamily: FONT_SANS_BOLD, fontSize: 22, lineHeight: 1.2, marginBottom: 18 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, padding: 14, borderRadius: 6, borderWidth: 1, borderStyle: 'solid' },
  statNumber: { fontFamily: FONT_SANS_BOLD, fontSize: 32, lineHeight: 1 },
  statLabel: { fontSize: 8, marginTop: 6, letterSpacing: 1, textTransform: 'uppercase' },

  // Tabela de mensagens
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: C.slate200, paddingBottom: 6, marginTop: 20, marginBottom: 6 },
  tableHeadCell: { fontSize: 8, color: C.slate500, letterSpacing: 1, textTransform: 'uppercase' },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: C.slate100 },
  rowNome: { fontSize: 10.5, color: C.slate900, flex: 2 },
  rowTel: { fontSize: 9.5, color: C.slate500, flex: 1.4 },
  rowStatus: { fontSize: 9.5, flex: 1.2 },
  rowMotivo: { fontSize: 9, color: C.rose, flex: 2.4 },

  // Section header com badge
  sectionBlock: { marginTop: 20 },
  sectionBlockHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, marginBottom: 8, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: C.slate200 },

  empty: { fontSize: 10, color: C.slate500, textAlign: 'center', padding: 12, fontStyle: 'italic' },

  // Footer
  footer: { position: 'absolute', bottom: 24, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerTxt: { fontSize: 7.5, color: C.slate400 },
  footerBrand: { fontSize: 7.5, color: C.gold, letterSpacing: 1, textTransform: 'uppercase' },
})

function PageHeader({ wedding, lote }: { wedding: RelatorioEnvioPdfProps['wedding']; lote: LoteInfo }) {
  return (
    <View style={styles.pageHeader}>
      <Image src={LOGO_SRC} style={styles.pageHeaderLogo} />
      <View style={styles.pageHeaderRight}>
        <Text style={styles.pageHeaderCouple}>{cleanCoupleName(wedding.titulo)}</Text>
        <Text style={styles.pageHeaderSub}>
          Envio {lote.template_slug} · {dateTime(lote.started_at)}
        </Text>
      </View>
    </View>
  )
}

function FooterPage() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerTxt} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      <Text style={styles.footerBrand}>Welcome Weddings</Text>
    </View>
  )
}

function StatCard({ n, label, border, fg }: { n: number; label: string; border: string; fg: string }) {
  return (
    <View style={[styles.statCard, { borderColor: border }]}>
      <Text style={[styles.statNumber, { color: fg }]}>{n}</Text>
      <Text style={[styles.statLabel, { color: fg }]}>{label}</Text>
    </View>
  )
}

export function RelatorioEnvioPDF({ wedding, lote, mensagens }: RelatorioEnvioPdfProps) {
  const recebeu = mensagens.filter(m => !m.has_error)
  const naoRecebeu = mensagens.filter(m => m.has_error)

  const recebeuSorted = [...recebeu].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const naoRecebeuSorted = [...naoRecebeu].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const casal = cleanCoupleName(wedding.titulo)
  const eventoData = longDate(wedding.wedding_date)
  const dataEnvio = dateTime(lote.started_at)
  const hoje = shortDate(new Date())

  return (
    <Document title={`Relatório de Envio — ${casal} — ${lote.template_slug}`}>
      {/* Capa */}
      <Page size="A4" style={styles.page}>
        <View style={styles.capa}>
          <Image src={LOGO_SRC} style={styles.capaLogoTop} />

          <View style={styles.capaCenter}>
            <Text style={styles.capaLabel}>Relatório de Envio</Text>
            <Text style={styles.capaCasal}>{casal}</Text>
            <View style={styles.capaDivisor} />
            <Text style={styles.capaTemplate}>Mensagem</Text>
            <Text style={styles.capaTemplateCode}>{lote.template_slug}</Text>
            <Text style={styles.capaData}>{dataEnvio}</Text>
            {eventoData && (
              <Text style={[styles.capaTemplate, { marginTop: 18 }]}>Casamento em {eventoData}</Text>
            )}
            {wedding.local && (
              <Text style={styles.capaTemplate}>{wedding.local}</Text>
            )}
          </View>

          <View style={styles.capaFooter}>
            <Text style={styles.capaFooterTxt}>Gerado em {hoje}</Text>
          </View>
        </View>
      </Page>

      {/* Relatório */}
      <Page size="A4" style={styles.page}>
        <View style={styles.pageContent}>
          <PageHeader wedding={wedding} lote={lote} />

          <Text style={styles.sectionEyebrow}>Resumo do envio</Text>
          <Text style={styles.sectionTitle}>{lote.total} {lote.total === 1 ? 'destinatário' : 'destinatários'}</Text>

          <View style={styles.statsRow}>
            <StatCard n={lote.total} label="Total" border={C.slate200} fg={C.slate900} />
            <StatCard n={recebeu.length} label="Receberam" border={C.emerald} fg={C.emerald} />
            <StatCard n={naoRecebeu.length} label="Não receberam" border={C.rose} fg={C.rose} />
          </View>

          {/* Receberam */}
          {recebeuSorted.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionBlockHead}>
                <Text style={[styles.sectionEyebrow, { color: C.emerald, marginBottom: 0 }]}>Receberam</Text>
                <Text style={{ fontSize: 9, color: C.slate500, marginLeft: 'auto' }}>{recebeuSorted.length}</Text>
              </View>
              <View style={styles.tableHead}>
                <Text style={[styles.tableHeadCell, { flex: 2 }]}>Nome</Text>
                <Text style={[styles.tableHeadCell, { flex: 1.4 }]}>Telefone</Text>
                <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>Status</Text>
              </View>
              {recebeuSorted.map((m, i) => (
                <View key={`r-${i}`} style={styles.row} wrap={false}>
                  <Text style={styles.rowNome}>{m.nome}</Text>
                  <Text style={styles.rowTel}>{m.telefone || '—'}</Text>
                  <Text style={[styles.rowStatus, { color: C.emerald }]}>
                    {m.ack_status != null ? ACK_LABEL[m.ack_status] ?? 'Enviada' : 'Enviada'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Não receberam */}
          {naoRecebeuSorted.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionBlockHead}>
                <Text style={[styles.sectionEyebrow, { color: C.rose, marginBottom: 0 }]}>Não receberam</Text>
                <Text style={{ fontSize: 9, color: C.slate500, marginLeft: 'auto' }}>{naoRecebeuSorted.length}</Text>
              </View>
              <View style={styles.tableHead}>
                <Text style={[styles.tableHeadCell, { flex: 2 }]}>Nome</Text>
                <Text style={[styles.tableHeadCell, { flex: 1.4 }]}>Telefone</Text>
                <Text style={[styles.tableHeadCell, { flex: 2.4 }]}>Motivo</Text>
              </View>
              {naoRecebeuSorted.map((m, i) => (
                <View key={`f-${i}`} style={styles.row} wrap={false}>
                  <Text style={styles.rowNome}>{m.nome}</Text>
                  <Text style={styles.rowTel}>{m.telefone || '—'}</Text>
                  <Text style={styles.rowMotivo}>{m.error_message || 'Sem motivo registrado'}</Text>
                </View>
              ))}
            </View>
          )}

          {recebeuSorted.length === 0 && naoRecebeuSorted.length === 0 && (
            <Text style={styles.empty}>Sem mensagens registradas neste lote.</Text>
          )}
        </View>
        <FooterPage />
      </Page>
    </Document>
  )
}
