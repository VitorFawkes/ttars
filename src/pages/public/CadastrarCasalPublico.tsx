import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Sparkles, Copy, ExternalLink, Send, CheckCircle2, Loader2, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { gerarCodigo, isValidCodigo } from '../../lib/convidados/gerarCodigo'
import { formatPhoneBR, isValidPhoneBR, phoneDigits } from '../../lib/convidados/formatPhoneBR'
import { buildLinkCasal, buildWhatsappLink } from '../../lib/convidados/buildLink'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const EDGE_URL = `${SUPABASE_URL}/functions/v1/wedding-lista-publica`

interface CasalCriado { codigo: string; nome: string; whatsapp: string }

function useEnableNativeScroll() {
  useEffect(() => {
    const html = document.documentElement, body = document.body, root = document.getElementById('root')
    const prev = { htmlOverflow: html.style.overflow, htmlHeight: html.style.height, bodyOverflow: body.style.overflow, bodyHeight: body.style.height, rootOverflow: root?.style.overflow, rootHeight: root?.style.height }
    html.style.overflow = 'auto'; html.style.height = 'auto'
    body.style.overflow = 'visible'; body.style.height = 'auto'
    if (root) { root.style.overflow = 'visible'; root.style.height = 'auto' }
    return () => {
      html.style.overflow = prev.htmlOverflow; html.style.height = prev.htmlHeight
      body.style.overflow = prev.bodyOverflow; body.style.height = prev.bodyHeight
      if (root) { root.style.overflow = prev.rootOverflow || ''; root.style.height = prev.rootHeight || '' }
    }
  }, [])
}

export default function CadastrarCasalPublico() {
  useEnableNativeScroll()
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [codigo, setCodigo] = useState(() => gerarCodigo())
  const [errors, setErrors] = useState<{ nome?: string; codigo?: string; whatsapp?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CasalCriado | null>(null)
  const nomeRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nomeRef.current?.focus() }, [])

  const reset = useCallback(() => {
    setNome(''); setWhatsapp(''); setCodigo(gerarCodigo()); setCreated(null); setErrors({})
    setTimeout(() => nomeRef.current?.focus(), 50)
  }, [])

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!nome.trim()) errs.nome = 'Informe o nome do casal'
    const codeUp = codigo.toUpperCase().trim()
    if (!isValidCodigo(codeUp)) errs.codigo = 'Apenas A-Z, 0-9, hífen (4-16 chars)'
    if (!isValidPhoneBR(whatsapp)) errs.whatsapp = 'Informe um WhatsApp válido'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSubmitting(true)
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ action: 'criar_casal_publico', codigo: codeUp, nome_casal: nome.trim(), whatsapp_digits: phoneDigits(whatsapp) }),
      })
      const body = await res.json()
      if (!res.ok) {
        if (body.error === 'codigo_duplicado') { setErrors({ codigo: 'Esse código já existe — gere outro' }); return }
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setCreated({ codigo: codeUp, nome: nome.trim(), whatsapp })
    } catch (err) {
      setErrors({ nome: (err as Error).message })
    } finally { setSubmitting(false) }
  }, [nome, codigo, whatsapp])

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 font-ww-display"
      style={{ background: 'linear-gradient(135deg, rgba(189,150,92,0.12) 0%, #FBF8F4 45%, rgba(234,167,148,0.10) 100%)' }}>
      <article className="w-full max-w-[520px] bg-white rounded-2xl border border-ww-sand shadow-ww-lift overflow-hidden">
        <header className="px-7 py-6 border-b border-ww-sand text-center">
          <img src="/brand/ww/welcome-weddings-vertical.png" alt="Welcome Weddings" className="h-14 w-auto mx-auto mb-3 object-contain" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ww-gold mb-1">Cadastro de Casal</p>
          <h1 className="font-ww-serif italic text-[26px] leading-tight text-ww-n700">{created ? created.nome : 'Novo casal'}</h1>
          {!created && (<p className="text-sm text-ww-n500 mt-2 leading-relaxed">Cadastre o casal e receba o link único pra eles preencherem a lista de convidados.</p>)}
        </header>

        {!created ? (
          <form onSubmit={submit} className="p-7 flex flex-col gap-4">
            <Field label="Nome do casal" hint="Como vocês querem aparecer (ex: Maria & João)" error={errors.nome}>
              <input ref={nomeRef} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria & João" className={cn(inputCls, errors.nome && inputErrCls)} />
            </Field>
            <Field label="Código do casamento" hint="Será parte do link único do casal" error={errors.codigo}
              rightAction={<button type="button" onClick={() => setCodigo(gerarCodigo())} className="text-[11px] text-ww-gold-ink hover:text-ww-gold inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> Gerar outro</button>}>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className={cn(inputCls, 'font-mono uppercase tracking-wider', errors.codigo && inputErrCls)} />
            </Field>
            <Field label="WhatsApp do contato" hint="Pra receber o link e tirar dúvidas" error={errors.whatsapp}>
              <div className="flex items-stretch border border-ww-sand-dk rounded-md focus-within:ring-2 focus-within:ring-ww-gold/30 focus-within:border-ww-gold">
                <span className="inline-flex items-center px-2 text-xs text-ww-n500 border-r border-ww-sand-dk bg-ww-paper rounded-l-md">+55</span>
                <input value={whatsapp} onChange={(e) => setWhatsapp(formatPhoneBR(e.target.value))} placeholder="48 99999-9999" inputMode="numeric" className="flex-1 px-3 py-2 text-sm bg-transparent rounded-r-md focus:outline-none" />
              </div>
            </Field>
            <button type="submit" disabled={submitting} className="mt-2 inline-flex items-center justify-center gap-2 px-4 h-11 rounded-full text-sm font-semibold bg-ww-gold text-white hover:bg-ww-gold-ink shadow-md hover:shadow-ww-lift transition-all disabled:opacity-60 disabled:cursor-wait">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Cadastrar casal
            </button>
          </form>
        ) : (
          <ShareView casal={created} onNovo={reset} />
        )}
      </article>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm border border-ww-sand-dk rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold'
const inputErrCls = 'border-red-300 focus:border-red-500 focus:ring-red-200'

interface FieldProps { label: string; hint?: string; error?: string; children: React.ReactNode; rightAction?: React.ReactNode }
function Field({ label, hint, error, children, rightAction }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ww-n600">{label}</span>
        {rightAction}
      </div>
      {children}
      {hint && !error && <span className="text-[11px] italic text-ww-n400">{hint}</span>}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </label>
  )
}

function ShareView({ casal, onNovo }: { casal: CasalCriado; onNovo: () => void }) {
  const link = buildLinkCasal(casal.codigo)
  const wa = buildWhatsappLink(phoneDigits(casal.whatsapp), casal.codigo)
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }
  return (
    <div className="p-7 flex flex-col gap-5">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-emerald-600" /></div>
      </div>
      <div className="text-center">
        <p className="text-sm text-ww-n500">Casal cadastrado.</p>
        <p className="text-sm text-ww-n500">Código: <code className="font-mono text-[12px] bg-ww-gold-soft text-ww-gold-ink px-1.5 py-0.5 rounded">{casal.codigo}</code></p>
      </div>
      <div className="bg-ww-paper border border-ww-sand rounded-md p-3 flex items-center gap-2">
        <code className="font-mono text-[12px] text-ww-n700 truncate flex-1">{link}</code>
        <button type="button" onClick={handleCopy} className={cn('inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors', copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-ww-sand text-ww-n600 hover:bg-ww-cream')}>
          {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        {wa && (<a href={wa} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 h-10 text-sm font-medium rounded-md bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"><Send className="w-4 h-4" /> Enviar via WhatsApp</a>)}
        <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 h-10 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors"><ExternalLink className="w-4 h-4" /> Abrir lista</a>
      </div>
      <button type="button" onClick={onNovo} className="inline-flex items-center justify-center gap-1.5 px-3 h-10 text-sm text-ww-n600 hover:text-ww-n700 border border-dashed border-ww-sand-dk rounded-md hover:border-ww-gold hover:bg-ww-gold-soft/30 transition-colors">
        <Plus className="w-4 h-4" /> Cadastrar outro casal
      </button>
    </div>
  )
}
