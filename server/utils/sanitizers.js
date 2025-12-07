const { PHONE_STATUS_OPTIONS } = require('../config/constants')

function sanitizeText(value) {
  return String(value ?? '').trim()
}

function sanitizeNotes(value) {
  return sanitizeText(value)
}

function truncateText(value, maxLength = 200) {
  const text = sanitizeText(value)
  if (!text) return ''
  if (text.length <= maxLength) return text
  const sliceLength = Math.max(maxLength - 3, 0)
  return `${text.slice(0, sliceLength)}...`
}

function sanitizeEnvValue(value) {
  if (typeof value === 'string') {
    return value.trim()
  }
  return ''
}

function normalizePhoneNumber(value) {
  if (!value) return ''
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('010')) {
    return digits
  }
  if (digits.length === 10) {
    return `010${digits}`
  }
  return digits
}

function normalizePhoneStatus(value, fallback = 'pending') {
  const normalized = sanitizeText(value)
  if (!normalized && fallback) return fallback
  if (PHONE_STATUS_OPTIONS.includes(normalized)) {
    return normalized
  }
  return fallback
}

function normalizeHeight(value) {
  const raw = sanitizeText(value)
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '').slice(0, 3)
  if (!digits) return ''
  return `${digits}cm`
}

function normalizeMeetingSchedule(value) {
  const raw = sanitizeText(value)
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new Error('유효한 상담 일정을 입력해 주세요.')
  }
  if (
    date.getUTCMinutes() % 15 !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  ) {
    throw new Error('상담 일정은 15분 단위로만 예약할 수 있습니다.')
  }
  return date.toISOString()
}

function safeToISOString(value, fallback) {
  const raw = sanitizeText(value)
  if (!raw) return fallback
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toISOString()
}

function sanitizeStringArray(input) {
  if (Array.isArray(input)) {
    return input.map((value) => sanitizeText(value)).filter(Boolean)
  }
  if (typeof input === 'string') {
    const value = sanitizeText(input)
    return value ? [value] : []
  }
  return []
}

function normalizeCandidateIdentifier(value) {
  return sanitizeText(value)
}

function sanitizeMatchHistoryCategory(value) {
  const normalized = sanitizeText(value).toLowerCase()
  if (normalized === 'confirmed' || normalized === 'intro') {
    return normalized
  }
  return 'intro'
}

module.exports = {
  sanitizeText,
  sanitizeNotes,
  truncateText,
  sanitizeEnvValue,
  normalizePhoneNumber,
  normalizePhoneStatus,
  normalizeHeight,
  normalizeMeetingSchedule,
  safeToISOString,
  sanitizeStringArray,
  normalizeCandidateIdentifier,
  sanitizeMatchHistoryCategory,
}

