type Listener = (isOutage: boolean) => void

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const PROBE_TIMEOUT_MS = 8000
const PROBE_DEBOUNCE_MS = 3000
const POLL_INTERVAL_MS = 15000

let isOutage = false
let probeInFlight = false
let lastProbeAt = 0
let pollHandle: ReturnType<typeof setInterval> | null = null
const listeners = new Set<Listener>()

function emit() {
    for (const l of listeners) l(isOutage)
}

function setOutage(value: boolean) {
    if (isOutage === value) return
    isOutage = value
    if (value) startPolling()
    else stopPolling()
    emit()
}

function startPolling() {
    if (pollHandle) return
    pollHandle = setInterval(() => { void probe() }, POLL_INTERVAL_MS)
}

function stopPolling() {
    if (!pollHandle) return
    clearInterval(pollHandle)
    pollHandle = null
}

async function probe(): Promise<void> {
    if (probeInFlight) return
    const now = Date.now()
    if (now - lastProbeAt < PROBE_DEBOUNCE_MS) return
    probeInFlight = true
    lastProbeAt = now
    try {
        const ctrl = new AbortController()
        const timeoutId = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
        const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'HEAD',
            headers: { apikey: SUPABASE_ANON_KEY },
            signal: ctrl.signal,
        })
        clearTimeout(timeoutId)
        // 5xx = upstream caiu (Cloudflare 522, etc). Outros códigos significam que respondeu.
        setOutage(res.status >= 500)
    } catch {
        // Timeout ou erro de rede = considera fora.
        setOutage(true)
    } finally {
        probeInFlight = false
    }
}

export function reportSupabaseNetworkError() {
    void probe()
}

export function subscribeToSupabaseHealth(listener: Listener) {
    listeners.add(listener)
    listener(isOutage)
    return () => { listeners.delete(listener) }
}

export function getSupabaseOutageState() {
    return isOutage
}
