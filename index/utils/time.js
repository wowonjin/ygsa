import { TIME_SLOT_START_HOUR, TIME_SLOT_END_HOUR, TIME_SLOT_INTERVAL_MINUTES } from '../constants.js'

export function splitLocalDateTime(value) {
  if (!value) return { date: '', time: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: '', time: '' }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  }
}

export function generateTimeSlots() {
  const slots = []
  for (let hour = TIME_SLOT_START_HOUR; hour <= TIME_SLOT_END_HOUR; hour += 1) {
    for (let minute = 0; minute < 60; minute += TIME_SLOT_INTERVAL_MINUTES) {
      if (hour === TIME_SLOT_END_HOUR && minute > 0) break
      const h = String(hour).padStart(2, '0')
      const m = String(minute).padStart(2, '0')
      slots.push(`${h}:${m}`)
    }
  }
  return slots
}

export function getDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatSelectedDateTitle(dateKey) {
  if (!dateKey) return '선택된 일정'
  const [year, month, day] = dateKey.split('-').map((value) => Number(value))
  if ([year, month, day].some((value) => Number.isNaN(value))) return '선택된 일정'
  return `${year}년 ${month}월 ${day}일 일정`
}

export function formatCalendarSchedule(schedule, fallbackTime, fallbackDateKey) {
  if (schedule) {
    const date = new Date(schedule)
    if (!Number.isNaN(date.getTime())) {
      const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      return `${String(date.getFullYear())}년 ${String(date.getMonth() + 1)}월 ${String(
        date.getDate(),
      )}일 ${time}`
    }
  }
  return `${fallbackDateKey} ${fallbackTime}`
}



