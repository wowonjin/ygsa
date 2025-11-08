;(function () {
  const LOCAL_DEFAULT = 'http://localhost:5000'
  const REMOTE_DEFAULT = 'https://ygsa-backend.onrender.com'

  function normalizeOrigin(value) {
    if (!value) return ''
    return String(value).trim().replace(/\/+$/, '')
  }

  const current =
    (typeof window !== 'undefined' && normalizeOrigin(window.BACKEND_ORIGIN)) || ''
  const meta =
    typeof document !== 'undefined'
      ? normalizeOrigin(
          document.querySelector('meta[name="backend-origin"]')?.getAttribute('content')
        )
      : ''
  const host =
    typeof window !== 'undefined' && window.location && window.location.hostname
      ? window.location.hostname
      : ''

  let resolved = current || meta || normalizeOrigin(REMOTE_DEFAULT)

  if (!resolved && /^(localhost|127\.0\.0\.1)$/i.test(host)) {
    resolved = normalizeOrigin(LOCAL_DEFAULT)
  }

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'BACKEND_ORIGIN', {
      configurable: true,
      enumerable: true,
      value: resolved,
      writable: true,
    })
  }

  if (!resolved) {
    console.warn(
      '[ygsa] BACKEND_ORIGIN이 설정되지 않았습니다. backend-config.js에서 REMOTE_DEFAULT 값을 배포된 서버 주소로 수정하세요.'
    )
  }
})()


