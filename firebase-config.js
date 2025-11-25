;(function () {
  if (typeof window === 'undefined') return

  const globalScope = window
  if (
    globalScope.__FIREBASE_CONFIG_PROMISE__ &&
    typeof globalScope.__FIREBASE_CONFIG_PROMISE__.then === 'function'
  ) {
    return
  }

  let resolvePromise
  let rejectPromise
  let settled = false

  const configPromise = new Promise((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  Object.defineProperty(globalScope, '__FIREBASE_CONFIG_PROMISE__', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: configPromise,
  })

  const REQUIRED_KEYS = ['apiKey', 'projectId', 'storageBucket']

  const parseMetaContent = (name) => {
    if (typeof document === 'undefined') return null
    const meta = document.querySelector(`meta[name="${name}"]`)
    if (!meta) return null
    const raw = meta.getAttribute('content')
    if (!raw) return null
    if (name === 'firebase-config') {
      try {
        return JSON.parse(raw)
      } catch (error) {
        console.warn('[firebase-config] firebase-config 메타 태그 파싱 실패', error)
        return null
      }
    }
    return raw.trim()
  }

  const normalizeConfig = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return null
    const normalized = { ...candidate }
    const hasRequired = REQUIRED_KEYS.every((key) =>
      normalized[key] && String(normalized[key]).trim(),
    )
    return hasRequired ? normalized : null
  }

  const finalize = (config) => {
    if (settled) return true
    const normalized = normalizeConfig(config)
    if (!normalized) return false
    if (typeof normalized.storageRoot === 'string') {
      const root = normalized.storageRoot.trim()
      if (root) {
        globalScope.FIREBASE_STORAGE_ROOT = root
      }
    }
    globalScope.FIREBASE_CONFIG = normalized
    settled = true
    resolvePromise(normalized)
    return true
  }

  const fail = (error) => {
    if (settled) return
    settled = true
    const message =
      error instanceof Error
        ? error.message
        : String(error || 'Firebase 설정(FIREBASE_CONFIG)이 필요합니다.')
    const err =
      error instanceof Error ? error : new Error(message || 'Firebase 설정(FIREBASE_CONFIG)이 필요합니다.')
    rejectPromise(err)
    console.warn('[firebase-config]', err.message)
  }

  if (finalize(globalScope.__FIREBASE_CONFIG__)) return
  if (finalize(parseMetaContent('firebase-config'))) return
  if (finalize(globalScope.FIREBASE_CONFIG)) return

  const resolveEndpoint = () => {
    const metaEndpoint = parseMetaContent('firebase-config-endpoint')
    if (metaEndpoint) return metaEndpoint
    const origin = (globalScope.BACKEND_ORIGIN || '').trim()
    if (origin) {
      return `${origin.replace(/\/$/, '')}/api/firebase-config`
    }
    return '/api/firebase-config'
  }

  const endpoint = resolveEndpoint()

  if (typeof fetch !== 'function') {
    fail(new Error('Firebase 설정을 불러올 수 없습니다. 브라우저가 fetch를 지원하지 않습니다.'))
    return
  }

  fetch(endpoint, { credentials: 'omit', cache: 'no-store' })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Firebase 설정을 불러오지 못했습니다. (status ${res.status})`)
      }
      return res.json()
    })
    .then((payload) => {
      const config =
        payload && typeof payload === 'object'
          ? payload.config || payload.data || payload.firebaseConfig || payload
          : null
      if (!finalize(config)) {
        throw new Error('서버에서 제공한 Firebase 설정이 올바르지 않습니다.')
      }
    })
    .catch((error) => {
      fail(error)
    })

  configPromise.catch(() => {})
})()

;(function () {
  const globalScope = typeof window !== 'undefined' ? window : globalThis

  const parseMetaString = (name) => {
    if (typeof document === 'undefined') return null
    const meta = document.querySelector(`meta[name="${name}"]`)
    if (!meta) return null
    const raw = meta.getAttribute('content')
    return raw ? raw.trim() : null
  }

  const configStorageRoot =
    globalScope.FIREBASE_CONFIG && typeof globalScope.FIREBASE_CONFIG.storageRoot === 'string'
      ? globalScope.FIREBASE_CONFIG.storageRoot.trim()
      : ''

  const storageRoot =
    (typeof globalScope.FIREBASE_STORAGE_ROOT === 'string' &&
      globalScope.FIREBASE_STORAGE_ROOT.trim()) ||
    configStorageRoot ||
    parseMetaString('firebase-storage-root') ||
    'profile-uploads'

  Object.defineProperty(globalScope, 'FIREBASE_STORAGE_ROOT', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: storageRoot,
  })
})()
