import { dom } from '../dom.js'
import { state } from '../state.js'

let handleDelete = null

export function updateSelectionInfo() {
  if (!dom.selectionInfoEl || !dom.bulkActionBar || !dom.deleteSelectedBtn) return
  const count = state.selectedIds.size
  dom.selectionInfoEl.textContent = count ? `${count}건 선택됨` : ''
  dom.bulkActionBar.hidden = count === 0
  dom.deleteSelectedBtn.disabled = count === 0
}

export function syncSelectionWithItems(items) {
  const validIds = new Set(items.map((item) => item.id))
  Array.from(state.selectedIds).forEach((id) => {
    if (!validIds.has(id)) state.selectedIds.delete(id)
  })
  updateSelectionInfo()
}

export function initBulkActions({ onDelete }) {
  handleDelete = onDelete
  dom.deleteSelectedBtn?.addEventListener('click', () => {
    if (!state.selectedIds.size) return
    if (!confirm('선택한 상담을 삭제할까요?')) return
    if (typeof handleDelete === 'function') {
      handleDelete(Array.from(state.selectedIds))
    }
  })
}



