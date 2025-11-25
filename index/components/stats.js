import { dom } from '../dom.js'

function formatLabeledCount(label, value) {
  return `${label}: ${Number(value || 0).toLocaleString('ko-KR')}명`
}

export function updateStats(items) {
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
  for (const item of items) {
    if (!item?.createdAt) continue
    const created = new Date(item.createdAt)
    if (Number.isNaN(created.getTime())) continue
    if (created >= startOfMonth && created <= now) monthly += 1
    if (created >= startOfWeek && created <= now) weekly += 1
    if (created >= startOfDay && created <= now) daily += 1
  }

  dom.statTotalEl.textContent = formatLabeledCount('총 상담 인원', items.length)
  dom.statMonthlyEl.textContent = formatLabeledCount('월간 상담 인원', monthly)
  dom.statWeeklyEl.textContent = formatLabeledCount('주간 상담 인원', weekly)
  dom.statDailyEl.textContent = formatLabeledCount('오늘 상담 인원', daily)
}



