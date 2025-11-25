const HOSTNAME = window.location && window.location.hostname
const IS_LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/i.test(HOSTNAME || '')
const DEFAULT_BACKEND_ORIGIN = IS_LOCAL_HOST ? 'http://localhost:5000' : 'https://ygsa-backend.onrender.com'
const BACKEND_ORIGIN_RAW = (window.BACKEND_ORIGIN || '').trim()

export const BACKEND_ORIGIN = (BACKEND_ORIGIN_RAW || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, '')
export const API_BASE_URL = BACKEND_ORIGIN
export const API_URL = `${API_BASE_URL}/api/consult`
export const API_IMPORT_URL = `${API_BASE_URL}/api/consult/import`
export const EVENTS_URL = `${API_BASE_URL}/events`

if (!BACKEND_ORIGIN_RAW) {
  console.info(`[ygsa] BACKEND_ORIGIN 미설정 – 기본값 ${API_BASE_URL} 사용`)
}

async function parseJson(response) {
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

export async function fetchConsultations() {
  const res = await fetch(API_URL)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body?.ok) {
    throw new Error(body?.message || '데이터 오류')
  }
  return body.data || []
}

export async function patchConsultation(id, payload) {
  const { response, body } = await parseJson(
    await fetch(`${API_URL}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || '상세 정보를 저장하지 못했습니다.')
  }
  return body.data
}

export async function deleteConsultations(ids) {
  const { response, body } = await parseJson(
    await fetch(API_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  )
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || '삭제에 실패했습니다.')
  }
  return body
}

export async function uploadImportedItems(items) {
  const { response, body } = await parseJson(
    await fetch(API_IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),
  )
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || '엑셀 데이터를 반영하지 못했습니다.')
  }
  return body
}

export async function requestProfileShareLink(recordId) {
  const { response, body } = await parseJson(
    await fetch(`${API_URL}/${recordId}/profile-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || '프로필 카드 링크를 생성하지 못했습니다.')
  }
  return body.data || {}
}

export function createEventSource(onMessage, onError) {
  if (!('EventSource' in window)) return null
  const source = new EventSource(EVENTS_URL)
  if (typeof onMessage === 'function') {
    source.addEventListener('message', (event) => onMessage(event, source))
  }
  if (typeof onError === 'function') {
    source.addEventListener('error', (event) => onError(event, source))
  }
  return source
}



