import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { Guest, RsvpCounts } from '../../../hooks/convidados/types'

// ── Fontes ──────────────────────────────────────────────────────────────
// Usa fontes built-in do PDF — Helvetica (sans) e Times (serif). Sem
// dependência de Google Fonts (URLs mudam e quebram offline).
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
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}
function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const target = new Date(iso); target.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  return diff
}
function cleanCoupleName(titulo: string): string {
  return titulo.replace(/^\s*(DW|D\.?W\.?|Elopement|Elop\.?)\s*[|\-—–]\s*/i, '').trim()
}
function guestFullName(g: Guest): string {
  return `${g.nome ?? ''}${g.sobrenome ? ' ' + g.sobrenome : ''}`.trim() || '(sem nome)'
}

// ── Paleta de cores ─────────────────────────────────────────────────────
const C = {
  rose: '#e11d48',
  roseSoft: '#fdf2f8',
  roseDark: '#9f1239',
  amber: '#d97706',
  amberSoft: '#fef3c7',
  emerald: '#059669',
  emeraldSoft: '#d1fae5',
  sky: '#0284c7',
  skySoft: '#e0f2fe',
  slate900: '#0f172a',
  slate700: '#334155',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  slate50: '#f8fafc',
  white: '#ffffff',
}

// ── Estilos ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: { padding: 0, fontFamily: FONT_SANS, backgroundColor: C.white, color: C.slate900 },
  pageContent: { paddingHorizontal: 56, paddingVertical: 56 },

  // Capa
  capa: { flexGrow: 1, paddingHorizontal: 56, paddingVertical: 80, backgroundColor: C.roseSoft, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  capaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  capaBrand: { fontSize: 9, fontWeight: 500, color: C.rose, letterSpacing: 2, textTransform: 'uppercase' },
  capaMonograma: { fontSize: 18, color: C.rose },
  capaCenter: { alignItems: 'center', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' },
  capaLabel: { fontSize: 11, color: C.slate500, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 24, fontWeight: 500 },
  capaCasal: { fontFamily: FONT_SERIF_ITALIC, fontSize: 56, color: C.slate900, lineHeight: 1.1 },
  capaDivisor: { width: 60, height: 1, backgroundColor: C.rose, marginVertical: 24 },
  capaDetalhe: { fontSize: 14, color: C.slate700, marginBottom: 6 },
  capaDetalheStrong: { fontSize: 14, color: C.slate900, fontWeight: 600 },
  capaFooter: { alignItems: 'center' },
  capaFooterTxt: { fontSize: 9, color: C.slate500, marginBottom: 4 },
  capaCountdown: { fontSize: 14, color: C.rose, fontWeight: 600 },

  // Cabeçalho de seção
  sectionHeader: { marginBottom: 24 },
  sectionEyebrow: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 500, marginBottom: 6 },
  sectionTitle: { fontFamily: FONT_SANS_BOLD, fontSize: 28, lineHeight: 1.2 },
  sectionSubtitle: { fontSize: 11, color: C.slate500, marginTop: 6 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, padding: 16, borderRadius: 8, borderWidth: 1, borderStyle: 'solid' },
  statNumber: { fontSize: 36, fontWeight: 800, lineHeight: 1 },
  statLabel: { fontSize: 9, marginTop: 6, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 },

  // Barra de progresso
  progressLabel: { fontSize: 10, color: C.slate500, marginBottom: 6, fontWeight: 500 },
  progressTrack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: C.slate100 },
  progressSeg: { height: '100%' },
  progressLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  progressLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressLegendDot: { width: 8, height: 8, borderRadius: 4 },
  progressLegendText: { fontSize: 9, color: C.slate700 },

  // Destaque
  destaque: { marginTop: 24, padding: 16, borderRadius: 8, backgroundColor: C.emeraldSoft, borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: C.emerald },
  destaqueTxt: { fontSize: 12, color: C.slate900, fontWeight: 500 },

  // Lista de convidados
  guestList: { flexDirection: 'row', flexWrap: 'wrap' },
  guestItem: { flexDirection: 'row', width: '50%', paddingVertical: 5, paddingRight: 12, alignItems: 'center' },
  guestBullet: { width: 14, fontSize: 10, marginRight: 4 },
  guestNome: { fontSize: 11, color: C.slate700, flex: 1 },
  empty: { fontSize: 12, color: C.slate500, textAlign: 'center', padding: 24, fontStyle: 'italic' },

  // Footer
  footer: { position: 'absolute', bottom: 28, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerTxt: { fontSize: 8, color: C.slate400 },
  footerBrand: { fontSize: 8, color: C.rose, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' },
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
        <View style={styles.capaTop}>
          <Text style={styles.capaBrand}>Welcome Trips · Relatório de Convidados</Text>
          <Text style={styles.capaMonograma}>♥</Text>
        </View>

        <View style={styles.capaCenter}>
          <Text style={styles.capaLabel}>Destination Wedding</Text>
          <Text style={styles.capaCasal}>{casal}</Text>
          <View style={styles.capaDivisor} />
          {wedding.local && (
            <Text style={styles.capaDetalhe}>
              em <Text style={styles.capaDetalheStrong}>{wedding.local}</Text>
            </Text>
          )}
          {dataExtenso && (
            <Text style={styles.capaDetalheStrong}>{dataExtenso}</Text>
          )}
        </View>

        <View style={styles.capaFooter}>
          <Text style={styles.capaFooterTxt}>Relatório gerado em {hoje}</Text>
          {dias !== null && dias > 0 && (
            <Text style={styles.capaCountdown}>Faltam {dias} {dias === 1 ? 'dia' : 'dias'} para o grande dia</Text>
          )}
          {dias !== null && dias === 0 && (
            <Text style={styles.capaCountdown}>É hoje! 🎉</Text>
          )}
          {dias !== null && dias < 0 && (
            <Text style={styles.capaCountdown}>Foi há {Math.abs(dias)} {Math.abs(dias) === 1 ? 'dia' : 'dias'}</Text>
          )}
        </View>
      </View>
    </Page>
  )
}

function PageVisaoGeral({ counts }: { counts: RsvpCounts }) {
  const total = counts.total
  const respondidos = counts.confirmado + counts.nao_vai
  const taxaResp = total > 0 ? Math.round((respondidos / total) * 100) : 0

  const segments = total > 0 ? [
    { value: counts.confirmado, color: C.emerald, label: 'Confirmados' },
    { value: counts.intencao, color: C.sky, label: 'Intenção de ir' },
    { value: counts.sem_reacao, color: C.amber, label: 'Sem resposta' },
    { value: counts.nao_vai, color: C.rose, label: 'Não vão' },
  ].filter(s => s.value > 0) : []

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageContent}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionEyebrow, { color: C.rose }]}>Visão geral</Text>
          <Text style={styles.sectionTitle}>A casa cheia de amor</Text>
          <Text style={styles.sectionSubtitle}>{total} {total === 1 ? 'convidado' : 'convidados'} no total · Taxa de resposta: {taxaResp}%</Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard n={counts.confirmado} label="Confirmados" bg={C.emeraldSoft} fg={C.emerald} border={C.emerald} />
          <StatCard n={counts.intencao} label="Intenção" bg={C.skySoft} fg={C.sky} border={C.sky} />
          <StatCard n={counts.sem_reacao} label="Sem resposta" bg={C.amberSoft} fg={C.amber} border={C.amber} />
          <StatCard n={counts.nao_vai} label="Não vão" bg={C.roseSoft} fg={C.rose} border={C.rose} />
        </View>

        <View>
          <Text style={styles.progressLabel}>Distribuição dos convidados</Text>
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
        </View>

        {counts.confirmado > 0 && (
          <View style={styles.destaque}>
            <Text style={styles.destaqueTxt}>
              Você já tem {counts.confirmado} {counts.confirmado === 1 ? 'confirmado garantido' : 'confirmados garantidos'} ♥
            </Text>
          </View>
        )}
      </View>
      <FooterPage page={2} />
    </Page>
  )
}

function PageLista({
  title, eyebrow, eyebrowColor, subtitle, emptyMsg, bullet, guests, pageNumber,
}: {
  title: string
  eyebrow: string
  eyebrowColor: string
  subtitle: string
  emptyMsg: string
  bullet: string
  guests: Guest[]
  pageNumber: number
}) {
  const lista = [...guests].sort((a, b) =>
    guestFullName(a).localeCompare(guestFullName(b), 'pt-BR', { sensitivity: 'base' }),
  )

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageContent}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionEyebrow, { color: eyebrowColor }]}>{eyebrow}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>

        {lista.length === 0 ? (
          <Text style={styles.empty}>{emptyMsg}</Text>
        ) : (
          <View style={styles.guestList}>
            {lista.map(g => (
              <View key={g.id} style={styles.guestItem} wrap={false}>
                <Text style={[styles.guestBullet, { color: eyebrowColor }]}>{bullet}</Text>
                <Text style={styles.guestNome}>{guestFullName(g)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <FooterPage page={pageNumber} />
    </Page>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({ n, label, bg, fg, border }: { n: number; label: string; bg: string; fg: string; border: string }) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.statNumber, { color: fg }]}>{n}</Text>
      <Text style={[styles.statLabel, { color: fg }]}>{label}</Text>
    </View>
  )
}

function FooterPage({ page }: { page: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerTxt}>Página {page}</Text>
      <Text style={styles.footerBrand}>Welcome Trips</Text>
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

  return (
    <Document title={`Relatório de Convidados — ${cleanCoupleName(wedding.titulo)}`}>
      <PageCapa wedding={wedding} />
      <PageVisaoGeral counts={counts} />
      <PageLista
        eyebrow="Confirmados"
        eyebrowColor={C.emerald}
        title="Já confirmaram presença"
        subtitle={
          confirmados.length === 0
            ? 'Ainda ninguém — relaxa, é cedo!'
            : `${confirmados.length} ${confirmados.length === 1 ? 'pessoa' : 'pessoas'} que não vão deixar você esquecer desse dia`
        }
        emptyMsg="Ainda ninguém confirmou. Vai chegar — paciência!"
        bullet="♥"
        guests={confirmados}
        pageNumber={3}
      />
      {intencao.length > 0 && (
        <PageLista
          eyebrow="Intenção de ir"
          eyebrowColor={C.sky}
          title="Quase confirmando"
          subtitle={`${intencao.length} ${intencao.length === 1 ? 'pessoa' : 'pessoas'} sinalizaram que pretendem ir`}
          emptyMsg=""
          bullet="◆"
          guests={intencao}
          pageNumber={4}
        />
      )}
      <PageLista
        eyebrow="Sem resposta"
        eyebrowColor={C.amber}
        title="Esperando resposta"
        subtitle={
          semResposta.length === 0
            ? 'Todo mundo respondeu — uau!'
            : `Talvez vale dar aquela cutucada — ${semResposta.length} convidados ainda não responderam`
        }
        emptyMsg="Todo mundo respondeu. 👏"
        bullet="○"
        guests={semResposta}
        pageNumber={intencao.length > 0 ? 5 : 4}
      />
      {naoVao.length > 0 && (
        <PageLista
          eyebrow="Não vão"
          eyebrowColor={C.rose}
          title="Não vão poder comparecer"
          subtitle={`Vão estar com vocês em pensamento — ${naoVao.length} ${naoVao.length === 1 ? 'pessoa avisou' : 'pessoas avisaram'} que não conseguem`}
          emptyMsg=""
          bullet="✉"
          guests={naoVao}
          pageNumber={intencao.length > 0 ? 6 : 5}
        />
      )}
    </Document>
  )
}
