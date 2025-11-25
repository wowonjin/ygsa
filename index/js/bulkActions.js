(function () {
  const YGSA = window.YGSA
  const { dom, state, api } = YGSA
  const { showToast } = YGSA.utils

  async function deleteRecords(ids) {
    const unique = Array.from(new Set((ids || []).filter(Boolean)))
    if (!unique.length) return
    state.suppressDeleteToast = true
    try {
      const res = await fetch(api.consult, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unique }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message || '삭제에 실패했습니다.')
      }
      const idSet = new Set(unique)
      state.items = state.items.filter((item) => !idSet.has(item.id))
      unique.forEach((id) => state.selectedIds.delete(id))
      YGSA.cards.syncSelectionWithItems()
      YGSA.filters.syncOptions()
      YGSA.cards.render()
      YGSA.calendar.refresh(true)
      showToast(`${body.count ?? unique.length}건을 삭제했습니다.`)
    } catch (error) {
      state.suppressDeleteToast = false
      console.error(error)
      showToast(error.message || '삭제에 실패했습니다.')
    } finally {
      setTimeout(() => {
        state.suppressDeleteToast = false
      }, 2000)
    }
  }

  function initBulkActions() {
    dom.deleteSelectedBtn?.addEventListener('click', () => {
      if (!state.selectedIds.size) return
      if (!confirm('선택한 상담을 삭제할까요?')) return
      deleteRecords(Array.from(state.selectedIds))
    })
  }

  YGSA.bulkActions = { init: initBulkActions }
})()



