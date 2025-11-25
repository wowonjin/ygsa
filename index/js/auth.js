(function () {
  const YGSA = window.YGSA
  const { constants, dom, state } = YGSA
  const { showToast } = YGSA.utils

  function recordAuthentication() {
    try {
      const expiresAt = Date.now() + constants.AUTH_DURATION_MS
      localStorage.setItem(constants.AUTH_STORAGE_KEY, String(expiresAt))
    } catch (error) {
      console.warn('[auth] 세션 저장 실패', error)
    }
  }

  function hasValidSession() {
    try {
      const raw = localStorage.getItem(constants.AUTH_STORAGE_KEY)
      if (!raw) return false
      const expiresAt = Number(raw)
      if (!Number.isFinite(expiresAt)) return false
      if (Date.now() >= expiresAt) {
        localStorage.removeItem(constants.AUTH_STORAGE_KEY)
        return false
      }
      return true
    } catch (error) {
      console.warn('[auth] 세션 확인 실패', error)
      return false
    }
  }

  function unlockApp(onReady) {
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
    onReady?.()
  }

  function initAuth(onReady) {
    if (!dom.authForm) {
      if (dom.appContentEl) dom.appContentEl.hidden = false
      document.body.classList.remove('auth-locked')
      state.isAuthenticated = true
      onReady?.()
      return
    }

    dom.authForm.addEventListener('submit', (event) => {
      event.preventDefault()
      const id = dom.authIdInput?.value.trim()
      const pw = dom.authPasswordInput?.value || ''
      if (id === constants.ADMIN_ID && pw === constants.ADMIN_PASSWORD) {
        if (dom.authErrorEl) dom.authErrorEl.hidden = true
        unlockApp(onReady)
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
      unlockApp(onReady)
    }
  }

  YGSA.auth = { init: initAuth }
})()



