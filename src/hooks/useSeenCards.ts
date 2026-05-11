import { useCallback, useSyncExternalStore } from 'react'
import { useAuth } from '../contexts/AuthContext'

const STORAGE_PREFIX = 'welcomecrm:seen_cards:'
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

interface SeenCardsData {
  initializedAt: string
  seenIds: string[]
  seenAt: Record<string, string> // cardId → ISO timestamp (for cleanup)
}

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

function readStore(userId: string): SeenCardsData {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (raw) return JSON.parse(raw)
  } catch { /* corrupted */ }
  // First time: initialize with current timestamp so existing cards aren't "new"
  const initial: SeenCardsData = {
    initializedAt: new Date().toISOString(),
    seenIds: [],
    seenAt: {},
  }
  localStorage.setItem(getStorageKey(userId), JSON.stringify(initial))
  return initial
}

function writeStore(userId: string, data: SeenCardsData) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(data))
  // Notify all subscribers
  listeners.forEach(fn => fn())
}

// External store pattern for cross-component sync
const listeners = new Set<() => void>()
let snapshotVersion = 0

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => { listeners.delete(callback) }
}

function getSnapshot() {
  return snapshotVersion
}

/**
 * Tracks which pipeline cards the current user has opened.
 * Cards created after the user's first visit that haven't been opened are "new".
 * Uses localStorage — no DB writes needed.
 */
export function useSeenCards() {
  const { user } = useAuth()
  const userId = user?.id

  // Re-render when store changes (e.g., another component calls markSeen)
  useSyncExternalStore(subscribe, getSnapshot)

  const isNew = useCallback((cardId: string, createdAt: string | null | undefined): boolean => {
    if (!userId || !cardId || !createdAt) return false
    const store = readStore(userId)
    // Only highlight cards created AFTER the user first loaded the pipeline
    if (new Date(createdAt) <= new Date(store.initializedAt)) return false
    return !store.seenIds.includes(cardId)
  }, [userId])

  const markSeen = useCallback((cardId: string, ownerId?: string | null) => {
    if (!userId || !cardId) return
    // Only the card's owner can dismiss the "new" highlight
    if (ownerId && userId !== ownerId) return
    const store = readStore(userId)
    if (store.seenIds.includes(cardId)) return
    store.seenIds.push(cardId)
    store.seenAt[cardId] = new Date().toISOString()
    // Cleanup: remove entries older than MAX_AGE
    const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString()
    store.seenIds = store.seenIds.filter(id => {
      const at = store.seenAt[id]
      if (!at || at < cutoff) {
        delete store.seenAt[id]
        return false
      }
      return true
    })
    writeStore(userId, store)
    snapshotVersion++
  }, [userId])

  return { isNew, markSeen }
}
