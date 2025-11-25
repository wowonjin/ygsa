import { ADMIN_ID, ADMIN_PASSWORD, AUTH_DURATION_MS, AUTH_STORAGE_KEY } from '../constants.js'
import { dom } from '../dom.js'
import { state } from '../state.js'

function recordAuthentication() {
  try {
    const expiresAt = Date.now() + AUTH_DURATION_MS
    localStorage.setItem(AUTH_STORAGE_KEY, String(expiresAt))
  } catch (error) {
    console.warn('[auth] 세션 저장 실패', error)
  }
}

function hasValidSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return false
    const expiresAt = Number(raw)
    if (!Number.isFinite(expiresAt)) return false
    if (Date.now() >= expiresAt) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return false
    }
    return true
  } catch (error) {
    console.warn('[auth] 세션 확인 실패', error)
    return false
  }
}

function unlockApp(onUnlock) {
  state.isAuthenticated = true
  if (dom.authOverlay) {
    dom.authOverlay.classList.add('hidden')
    setTimeout(() => dom.authOverlay?.setAttribute('hidden', ''), 260)
  }
  if (dom.appContentEl) {
    dom.appContentEl.hidden = false
  }
  document.body.classList.remove('auth-locked')
  recordAuthentication()
  if (typeof onUnlock === 'function') {
    onUnlock()
  }
}

export function initAuth({ onUnlock }) {
  if (!dom.authForm) {
    if (dom.appContentEl) dom.appContentEl.hidden = false
    document.body.classList.remove('auth-locked')
    state.isAuthenticated = true
    if (typeof onUnlock === 'function') onUnlock()
    return
  }

  dom.authForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const id = dom.authIdInput?.value.trim()
    const pw = dom.authPasswordInput?.value || ''
    if (id === ADMIN_ID && pw === ADMIN_PASSWORD) {
      if (dom.authErrorEl) dom.authErrorEl.hidden = true
      unlockApp(onUnlock)
    } else {
      if (dom.authErrorEl) {
        dom.authErrorEl.hidden = false
        dom.authErrorEl.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.'
      }
      dom.authPasswordInput?.focus()
      dom.authPasswordInput?.select?.()
    }
  })
  dom.authIdInput?.focus()

  if (hasValidSession()) {
    unlockApp(onUnlock)
  }
}



