;(function () {
  if (typeof window === 'undefined') return

  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
    return
  }

  let resolvedConfig = null

  const globalConfig =
    typeof window !== 'undefined' && typeof window.__FIREBASE_CONFIG__ !== 'undefined'
      ? window.__FIREBASE_CONFIG__
      : null

  if (globalConfig && typeof globalConfig === 'object') {
    resolvedConfig = globalConfig
  }

  if (!resolvedConfig) {
    const metaEl = document.querySelector('meta[name="firebase-config"]')
    if (metaEl) {
      try {
        const parsed = JSON.parse(metaEl.getAttribute('content') || '{}')
        if (parsed && typeof parsed === 'object' && parsed.apiKey) {
          resolvedConfig = parsed
        }
      } catch (error) {
        console.warn('[firebase-config] meta firebase-config 파싱 실패', error)
      }
    }
  }

  if (!resolvedConfig) {
    resolvedConfig = window.FIREBASE_CONFIG || {}
  }

  if (!resolvedConfig.apiKey) {
    console.warn(
      '[firebase-config] Firebase 설정(FIREBASE_CONFIG)이 제공되지 않았습니다. firebase-config.js 또는 meta 태그를 통해 설정을 주입하세요.',
    )
  }

  window.FIREBASE_CONFIG = resolvedConfig
})()
;(function () {
  const globalScope = typeof window !== 'undefined' ? window : globalThis

  function parseMetaContent(metaName) {
    if (typeof document === 'undefined') return null
    const meta = document.querySelector(`meta[name="${metaName}"]`)
    if (!meta) return null
    const raw = meta.getAttribute('content')
    if (!raw) return null
    if (metaName === 'firebase-config') {
      try {
        return JSON.parse(raw)
      } catch (error) {
        console.warn('[ygsa] firebase-config 메타 태그를 JSON으로 파싱하지 못했습니다.', error)
        return null
      }
    }
    return raw.trim()
  }

  const existingConfig =
    (globalScope && globalScope.FIREBASE_CONFIG) || parseMetaContent('firebase-config')

  const resolvedConfig = existingConfig && typeof existingConfig === 'object' ? existingConfig : null

  Object.defineProperty(globalScope, 'FIREBASE_CONFIG', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: resolvedConfig,
  })

  const defaultStorageRoot = 'profile-uploads'
  const resolvedStorageRoot =
    (typeof globalScope.FIREBASE_STORAGE_ROOT === 'string'
      ? globalScope.FIREBASE_STORAGE_ROOT
      : parseMetaContent('firebase-storage-root')) || defaultStorageRoot

  Object.defineProperty(globalScope, 'FIREBASE_STORAGE_ROOT', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: resolvedStorageRoot,
  })

  if (!resolvedConfig || !resolvedConfig.apiKey || !resolvedConfig.storageBucket) {
    console.warn(
      '[ygsa] Firebase 설정이 누락되었습니다. firebase-config.js 또는 firebase-config 메타 태그에서 FIREBASE_CONFIG를 설정하세요.'
    )
  }
})()


