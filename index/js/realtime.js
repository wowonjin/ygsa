(function () {
  const YGSA = window.YGSA
  const { state, api } = YGSA
  const { showToast } = YGSA.utils

  function setupSSE() {
    if (!('EventSource' in window)) return
    const source = new EventSource(api.events)
    source.addEventListener('message', (event) => {
      if (!event?.data) return
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === 'consult:new') {
          state.items.push(payload.payload)
          YGSA.filters.syncOptions()
          YGSA.cards.syncSelectionWithItems()
          YGSA.cards.render()
          YGSA.calendar.refresh(true)
          YGSA.app.updateStats()
          showToast('새로운 상담 신청이 도착했습니다!')
        } else if (payload?.type === 'consult:import') {
          state.items = Array.isArray(payload.payload) ? payload.payload : []
          state.selectedIds.clear()
          YGSA.cards.syncSelectionWithItems()
          YGSA.filters.syncOptions()
          YGSA.cards.render()
          YGSA.calendar.refresh(true)
          YGSA.app.updateStats()
          showToast('엑셀 데이터가 반영되었습니다.')
        } else if (payload?.type === 'consult:update') {
          const updated = payload.payload
          if (updated?.id) {
            const index = state.items.findIndex((item) => item.id === updated.id)
            if (index !== -1) {
              state.items[index] = updated
            } else {
              state.items.push(updated)
            }
          }
          YGSA.cards.syncSelectionWithItems()
          YGSA.filters.syncOptions()
          YGSA.cards.render()
          YGSA.calendar.refresh(true)
          YGSA.app.updateStats()
          showToast(`${updated?.name || '상담'} 정보가 업데이트되었습니다.`)
        } else if (payload?.type === 'consult:delete') {
          const ids = Array.isArray(payload.payload?.ids) ? payload.payload.ids : []
          if (!ids.length) return
          const idSet = new Set(ids)
          state.items = state.items.filter((item) => !idSet.has(item.id))
          ids.forEach((id) => state.selectedIds.delete(id))
          YGSA.cards.syncSelectionWithItems()
          YGSA.filters.syncOptions()
          YGSA.cards.render()
          YGSA.calendar.refresh(true)
          YGSA.app.updateStats()
          showToast(`${ids.length}건이 삭제되었습니다.`)
        }
      } catch (error) {
        console.error(error)
      }
    })
    source.addEventListener('error', () => {
      showToast('실시간 연결이 끊겼습니다. 잠시 후 자동 재연결합니다.')
    })
  }

  YGSA.realtime = { init: setupSSE }
})()

