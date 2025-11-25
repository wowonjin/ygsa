import { DRAFT_STORAGE_PREFIX } from '../constants.js'
import { normalizePhoneKey } from './format.js'

export function getDraftForPhone(phone) {
  const key = normalizePhoneKey(phone)
  if (!key) return null
  const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${key}`)
  if (!raw) return null
  try {
    const draft = JSON.parse(raw)
    return draft && typeof draft === 'object' ? draft : null
  } catch (error) {
    console.warn('[draft] parse failed', error)
    return null
  }
}

export function toOptionArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item == null ? '' : String(item).trim()))
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => (item == null ? '' : String(item).trim()))
            .filter(Boolean)
        }
      } catch (error) {
        /* ignore */
      }
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    }
    return [trimmed]
  }
  return []
}



