import {
  PHONE_STATUS_LABELS,
  PHONE_STATUS_VALUES,
  STATUS_CLASS_NAMES,
  SALARY_RANGE_LABELS,
} from '../constants.js'

export function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('ko-KR')
  } catch (error) {
    return value
  }
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function normalizeHeightValue(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '').slice(0, 3)
  return digits ? `${digits}cm` : ''
}

export function formatPhoneNumber(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '')
  if (!digits) return ''
  if (digits.length < 4) return digits
  if (digits.length < 8) return digits.replace(/(\d{3})(\d+)/, '$1-$2')
  return digits.replace(/(\d{3})(\d{3,4})(\d{0,4}).*/, '$1-$2-$3')
}

export function normalizePhoneKey(raw) {
  return String(raw || '').replace(/[^0-9]/g, '')
}

export function formatSalaryRange(value) {
  return SALARY_RANGE_LABELS[value] || ''
}

export function formatPhoneStatus(status) {
  return PHONE_STATUS_LABELS[status] || PHONE_STATUS_LABELS.pending
}

export function getStatusClass(status) {
  return STATUS_CLASS_NAMES[status] || STATUS_CLASS_NAMES.pending
}

export function ensurePhoneStatus(status) {
  return PHONE_STATUS_VALUES.includes(status) ? status : 'pending'
}



