(function () {
  const YGSA = window.YGSA
  const { dom, state, api } = YGSA
  const { showToast } = YGSA.utils

  function updateStats() {
    if (!dom.statTotalEl || !dom.statMonthlyEl || !dom.statWeeklyEl || !dom.statDailyEl) return
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfWeek = new Date(startOfDay)
    const weekDay = (startOfDay.getDay() + 6) % 7
    startOfWeek.setDate(startOfDay.getDate() - weekDay)

    let monthly = 0
    let weekly = 0
    let daily = 0
    state.items.forEach((item) => {
      if (!item?.createdAt) return
      const created = new Date(item.createdAt)
      if (Number.isNaN(created.getTime())) return
      if (created >= startOfMonth && created <= now) monthly += 1
      if (created >= startOfWeek && created <= now) weekly += 1
      if (created >= startOfDay && created <= now) daily += 1
    })
    dom.statTotalEl.textContent = `총 상담 인원: ${state.items.length.toLocaleString('ko-KR')}명`
    dom.statMonthlyEl.textContent = `월간 상담 인원: ${monthly.toLocaleString('ko-KR')}명`
    dom.statWeeklyEl.textContent = `주간 상담 인원: ${weekly.toLocaleString('ko-KR')}명`
    dom.statDailyEl.textContent = `오늘 상담 인원: ${daily.toLocaleString('ko-KR')}명`
  }

  async function loadData() {
    try {
      const res = await fetch(api.consult)
      const body = await res.json()
      if (!body?.ok) throw new Error(body?.message || '데이터 오류')
      state.items = Array.isArray(body.data) ? body.data : []
      YGSA.cards.syncSelectionWithItems()
      YGSA.filters.syncOptions()
      YGSA.cards.render()
      YGSA.calendar.refresh(true)
      updateStats()
    } catch (error) {
      console.error(error)
      showToast('데이터를 불러오는데 실패했습니다.')
    }
  }

  function initializeApp() {
    if (state.appInitialized) return
    state.appInitialized = true
    updateStats()
    loadData()
    YGSA.realtime.init()
  }

  function initModules() {
    YGSA.filters.init(() => {
      YGSA.cards.render()
      YGSA.cards.updateSelectionInfo()
    })
    YGSA.cards.init()
    YGSA.detail.init()
    YGSA.calendar.init()
    YGSA.bulkActions.init()
    YGSA.excel.init()
  }

  initModules()
  YGSA.auth.init(initializeApp)

  YGSA.app = {
    loadData,
    updateStats,
  }
})()



