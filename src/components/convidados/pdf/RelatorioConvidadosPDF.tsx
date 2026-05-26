import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import type { Guest, RsvpCounts } from '../../../hooks/convidados/types'
import { parseLocalDate } from '../../../lib/localDate'

// ── Fontes ──────────────────────────────────────────────────────────────
// Usa fontes built-in do PDF — Helvetica (sans) e Times (serif).
const FONT_SANS = 'Helvetica'
const FONT_SANS_BOLD = 'Helvetica-Bold'
const FONT_SERIF_ITALIC = 'Times-Italic'

// ── Tipos ──────────────────────────────────────────────────────────────
export interface RelatorioPdfProps {
  wedding: {
    titulo: string
    local: string | null
    wedding_date: string | null
    site_url: string | null
  }
  guests: Guest[]
  counts: RsvpCounts
}

const MONTHS = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]

function longDate(iso: string | null): string | null {
  const d = parseLocalDate(iso)
  if (!d) return null
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}
function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function daysUntil(iso: string | null): number | null {
  const target = parseLocalDate(iso)
  if (!target) return null
  target.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}
function cleanCoupleName(titulo: string): string {
  return titulo.replace(/^\s*(DW|D\.?W\.?|Elopement|Elop\.?)\s*[|\-—–]\s*/i, '').trim()
}
function guestFullName(g: Guest): string {
  return `${g.nome ?? ''}${g.sobrenome ? ' ' + g.sobrenome : ''}`.trim() || '(sem nome)'
}

// ── Paleta de cores (dourado Welcome Weddings) ──────────────────────────
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

// ── Estilos ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: { padding: 0, fontFamily: FONT_SANS, backgroundColor: C.white, color: C.slate900 },
  pageContent: { paddingHorizontal: 56, paddingVertical: 56 },

  // Capa
  capa: { flexGrow: 1, paddingHorizontal: 56, paddingVertical: 72, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' },
  capaLogoTop: { width: 140, height: 140, objectFit: 'contain' },
  capaCenter: { alignItems: 'center', textAlign: 'center' },
  capaLabel: { fontSize: 10, color: C.gold, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 24 },
  capaCasal: { fontFamily: FONT_SERIF_ITALIC, fontSize: 52, color: C.slate900, lineHeight: 1.1 },
  capaDivisor: { width: 60, height: 1, backgroundColor: C.gold, marginVertical: 24 },
  capaDetalhe: { fontSize: 13, color: C.slate700, marginBottom: 4 },
  capaDetalheStrong: { fontSize: 13, color: C.slate900 },
  capaFooter: { alignItems: 'center' },
  capaFooterTxt: { fontSize: 9, color: C.slate500, marginBottom: 4 },
  capaCountdown: { fontSize: 12, color: C.gold },

  // Cabeçalho da página interna
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  pageHeaderLogo: { width: 80, height: 80, objectFit: 'contain' },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageHeaderCouple: { fontFamily: FONT_SERIF_ITALIC, fontSize: 16, color: C.slate900 },
  pageHeaderDate: { fontSize: 9, color: C.slate500, marginTop: 2 },

  // Seções
  sectionEyebrow: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6, color: C.gold },
  sectionTitle: { fontFamily: FONT_SANS_BOLD, fontSize: 22, lineHeight: 1.2, marginBottom: 18 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, padding: 14, borderRadius: 6, borderWidth: 1, borderStyle: 'solid' },
  statNumber: { fontFamily: FONT_SANS_BOLD, fontSize: 32, lineHeight: 1 },
  statLabel: { fontSize: 8, marginTop: 6, letterSpacing: 1, textTransform: 'uppercase' },

  // Barra de progresso
  progressLabel: { fontSize: 9, color: C.slate500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  progressTrack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: C.slate100 },
  progressSeg: { height: '100%' },
  progressLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  progressLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  progressLegendDot: { width: 7, height: 7, borderRadius: 3.5 },
  progressLegendText: { fontSize: 9, color: C.slate700 },

  // Resumo (taxa)
  taxa: { marginTop: 24, padding: 14, borderRadius: 6, backgroundColor: C.goldSoft, borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: C.gold, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taxaLabel: { fontSize: 10, color: C.goldDark, letterSpacing: 1, textTransform: 'uppercase' },
  taxaValor: { fontFamily: FONT_SANS_BOLD, fontSize: 24, color: C.gold },

  // Lista de convidados
  guestList: { flexDirection: 'row', flexWrap: 'wrap' },
  guestItem: { flexDirection: 'row', width: '50%', paddingVertical: 4, paddingRight: 12, alignItems: 'center' },
  guestBullet: { width: 12, fontSize: 9, marginRight: 4 },
  guestNome: { fontSize: 10.5, color: C.slate700, flex: 1 },
  empty: { fontSize: 11, color: C.slate500, textAlign: 'center', padding: 24, fontStyle: 'italic' },

  // Footer
  footer: { position: 'absolute', bottom: 24, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerTxt: { fontSize: 7.5, color: C.slate400 },
  footerBrand: { fontSize: 7.5, color: C.gold, letterSpacing: 1, textTransform: 'uppercase' },
})

// ── Páginas ─────────────────────────────────────────────────────────────

function PageCapa({ wedding }: { wedding: RelatorioPdfProps['wedding'] }) {
  const dataExtenso = longDate(wedding.wedding_date)
  const dias = daysUntil(wedding.wedding_date)
  const casal = cleanCoupleName(wedding.titulo)
  const hoje = shortDate(new Date())

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.capa}>
        <Image src={LOGO_SRC} style={styles.capaLogoTop} />

        <View style={styles.capaCenter}>
          <Text style={styles.capaLabel}>Relatório de Convidados</Text>
          <Text style={styles.capaCasal}>{casal}</Text>
          <View style={styles.capaDivisor} />
          {wedding.local && <Text style={styles.capaDetalhe}>{wedding.local}</Text>}
          {dataExtenso && <Text style={styles.capaDetalheStrong}>{dataExtenso}</Text>}
        </View>

        <View style={styles.capaFooter}>
          <Text style={styles.capaFooterTxt}>Gerado em {hoje}</Text>
          {dias !== null && dias > 0 && (
            <Text style={styles.capaCountdown}>Faltam {dias} {dias === 1 ? 'dia' : 'dias'}</Text>
          )}
          {dias !== null && dias === 0 && <Text style={styles.capaCountdown}>É hoje</Text>}
          {dias !== null && dias < 0 && (
            <Text style={styles.capaCountdown}>{Math.abs(dias)} {Math.abs(dias) === 1 ? 'dia atrás' : 'dias atrás'}</Text>
          )}
        </View>
      </View>
    </Page>
  )
}

function PageHeader({ wedding }: { wedding: RelatorioPdfProps['wedding'] }) {
  const dataExtenso = longDate(wedding.wedding_date)
  return (
    <View style={styles.pageHeader}>
      <Image src={LOGO_SRC} style={styles.pageHeaderLogo} />
      <View style={styles.pageHeaderRight}>
        <Text style={styles.pageHeaderCouple}>{cleanCoupleName(wedding.titulo)}</Text>
        {dataExtenso && <Text style={styles.pageHeaderDate}>{dataExtenso}</Text>}
      </View>
    </View>
  )
}

function ListaSection({
  eyebrow, eyebrowColor, guests,
}: {
  eyebrow: string
  eyebrowColor: string
  guests: Guest[]
}) {
  if (guests.length === 0) return null
  const lista = [...guests].sort((a, b) =>
    guestFullName(a).localeCompare(guestFullName(b), 'pt-BR', { sensitivity: 'base' }),
  )
  return (
    <View wrap style={{ marginTop: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: C.slate200 }}>
        <Text style={[styles.sectionEyebrow, { color: eyebrowColor, marginBottom: 0 }]}>{eyebrow}</Text>
        <Text style={{ fontSize: 9, color: C.slate500, marginLeft: 'auto' }}>{lista.length}</Text>
      </View>
      <View style={styles.guestList}>
        {lista.map(g => (
          <View key={g.id} style={styles.guestItem} wrap={false}>
            <Text style={[styles.guestBullet, { color: eyebrowColor }]}>●</Text>
            <Text style={styles.guestNome}>{guestFullName(g)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({ n, label, border, fg }: { n: number; label: string; border: string; fg: string }) {
  return (
    <View style={[styles.statCard, { borderColor: border }]}>
      <Text style={[styles.statNumber, { color: fg }]}>{n}</Text>
      <Text style={[styles.statLabel, { color: fg }]}>{label}</Text>
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

// ── Documento ───────────────────────────────────────────────────────────

export function RelatorioConvidadosPDF({ wedding, guests, counts }: RelatorioPdfProps) {
  const byStatus = (s: Guest['status_rsvp']) => guests.filter(g => g.status_rsvp === s)
  const confirmados = byStatus('confirmado')
  const intencao = byStatus('intencao')
  const semResposta = byStatus('sem_reacao')
  const naoVao = byStatus('nao_vai')

  const total = counts.total
  const respondidos = counts.confirmado + counts.nao_vai
  const taxaResp = total > 0 ? Math.round((respondidos / total) * 100) : 0

  const segments = total > 0 ? [
    { value: counts.confirmado, color: C.emerald, label: 'Confirmados' },
    { value: counts.intencao, color: C.sky, label: 'Intenção' },
    { value: counts.sem_reacao, color: C.amber, label: 'Sem resposta' },
    { value: counts.nao_vai, color: C.rose, label: 'Não vão' },
  ].filter(s => s.value > 0) : []

  return (
    <Document title={`Relatório de Convidados — ${cleanCoupleName(wedding.titulo)}`}>
      <PageCapa wedding={wedding} />

      <Page size="A4" style={styles.page}>
        <View style={styles.pageContent}>
          <PageHeader wedding={wedding} />

          <Text style={styles.sectionEyebrow}>Visão geral</Text>
          <Text style={styles.sectionTitle}>{total} {total === 1 ? 'convidado' : 'convidados'}</Text>

          <View style={styles.statsRow}>
            <StatCard n={counts.confirmado} label="Confirmados" border={C.emerald} fg={C.emerald} />
            <StatCard n={counts.intencao} label="Intenção" border={C.sky} fg={C.sky} />
            <StatCard n={counts.sem_reacao} label="Sem resposta" border={C.amber} fg={C.amber} />
            <StatCard n={counts.nao_vai} label="Não vão" border={C.rose} fg={C.rose} />
          </View>

          {segments.length > 0 && (
            <>
              <Text style={styles.progressLabel}>Distribuição</Text>
              <View style={styles.progressTrack}>
                {segments.map((s, i) => (
                  <View key={i} style={{ ...styles.progressSeg, flex: s.value, backgroundColor: s.color }} />
                ))}
              </View>
              <View style={styles.progressLegend}>
                {segments.map((s, i) => (
                  <View key={i} style={styles.progressLegendItem}>
                    <View style={{ ...styles.progressLegendDot, backgroundColor: s.color }} />
                    <Text style={styles.progressLegendText}>{s.label}: {s.value}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={styles.taxa}>
            <Text style={styles.taxaLabel}>Taxa de resposta</Text>
            <Text style={styles.taxaValor}>{taxaResp}%</Text>
          </View>

          <ListaSection eyebrow="Confirmados" eyebrowColor={C.emerald} guests={confirmados} />
          <ListaSection eyebrow="Intenção de ir" eyebrowColor={C.sky} guests={intencao} />
          <ListaSection eyebrow="Sem resposta" eyebrowColor={C.amber} guests={semResposta} />
          <ListaSection eyebrow="Não vão" eyebrowColor={C.rose} guests={naoVao} />
        </View>
        <FooterPage />
      </Page>
    </Document>
  )
}
