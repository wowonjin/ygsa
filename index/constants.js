export const ADMIN_ID = 'admin'
export const ADMIN_PASSWORD = 'admin'
export const AUTH_STORAGE_KEY = 'ygsa_admin_auth'
export const AUTH_DURATION_MS = 60 * 60 * 1000

export const DRAFT_STORAGE_KEY = 'alphaProfileDraft_v1'
export const DRAFT_STORAGE_PREFIX = `${DRAFT_STORAGE_KEY}:`

export const PHONE_STATUS_VALUES = ['pending', 'scheduled', 'done']
export const PHONE_STATUS_LABELS = {
  pending: '상담 전',
  scheduled: '상담 예정',
  done: '상담 완료',
}
export const STATUS_CLASS_NAMES = {
  pending: 'status-before',
  scheduled: 'status-scheduled',
  done: 'status-complete',
}

export const TIME_SLOT_START_HOUR = 9
export const TIME_SLOT_END_HOUR = 21
export const TIME_SLOT_INTERVAL_MINUTES = 15

export const SALARY_RANGE_LABELS = {
  '1': '3000만원 미만',
  '2': '3000-4000만원',
  '3': '4000-6000만원',
  '4': '6000-8000만원',
  '5': '8000-1억원',
  '6': '1억-2억원',
  '7': '2억-3억원',
  '8': '3억원 이상',
}



