import { dom } from '../dom.js'

let toastTimer = null

export function showToast(message) {
  if (!dom.toastEl) return
  dom.toastEl.textContent = message
  dom.toastEl.classList.add('show')
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastTimer = setTimeout(() => {
    dom.toastEl.classList.remove('show')
  }, 2500)
}



