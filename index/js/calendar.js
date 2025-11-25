(function () {
  const YGSA = window.YGSA
  const { dom, state } = YGSA
  const { getDateKey, formatSelectedDateTitle, formatCalendarSchedule, escapeHtml, formatPhoneStatus } = YGSA.utils

  function getMeetingsGroupedByDate() {
    const map = new Map()
    state.items.forEach((item) => {
      if (!item.meetingSchedule) return
      const date = new Date(item.meetingSchedule)
      if (Number.isNaN(date.getTime())) return
      const dateKey = getDateKey(date)
      const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey).push({
        id: item.id,
        name: item.name,
        time,
        record: item,
      })
    })
    map.forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)))
    return map
  }

  function renderCalendar(meetingsMap) {
    const year = state.calendarState.current.getFullYear()
    const month = state.calendarState.current.getMonth()
    dom.calendarCurrentMonthEl.textContent = `${year}년 ${month + 1}월`
    dom.calendarGrid.innerHTML = ''
    const fragment = document.createDocumentFragment()
    const weekdays = ['일', '월', '화', '수', '목', '금', '토']
    weekdays.forEach((label) => {
      const cell = document.createElement('div')
      cell.className = 'calendar-weekday'
      cell.textContent = label
      fragment.appendChild(cell)
    })
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDay.getDay())
    const todayKey = getDateKey(new Date())
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      const dateKey = getDateKey(date)
      const dayCell = document.createElement('div')
      dayCell.className = 'calendar-day'
      dayCell.dataset.date = dateKey
      if (date.getMonth() !== month) dayCell.classList.add('other-month')
      if (dateKey === todayKey) dayCell.classList.add('today')
      if (dateKey === state.calendarState.selectedDate) dayCell.classList.add('selected')
      const events = meetingsMap.get(dateKey) || []
      if (events.length) dayCell.classList.add('has-events')
      const dayNumber = document.createElement('div')
      dayNumber.className = 'day-number'
      dayNumber.textContent = date.getDate()
      const dayCount = document.createElement('div')
      dayCount.className = 'day-count'
      dayCount.textContent = events.length ? `${events.length}건` : ''
      dayCell.appendChild(dayNumber)
      dayCell.appendChild(dayCount)
      fragment.appendChild(dayCell)
    }
    dom.calendarGrid.appendChild(fragment)
  }

  function renderCalendarAppointments(meetingsMap) {
    const dateKey = state.calendarState.selectedDate
    dom.calendarSelectedTitleEl.textContent = formatSelectedDateTitle(dateKey)
    dom.calendarAppointmentList.innerHTML = ''
    const meetings = meetingsMap.get(dateKey) || []
    if (!meetings.length) {
      const emptyItem = document.createElement('li')
      emptyItem.className = 'calendar-empty-item'
      emptyItem.textContent = '예약된 일정이 없습니다.'
      dom.calendarAppointmentList.appendChild(emptyItem)
      return
    }
    meetings
      .map((entry) => ({
        ...entry,
        displaySchedule: formatCalendarSchedule(entry.record.meetingSchedule, entry.time, dateKey),
      }))
      .sort((a, b) => a.displaySchedule.localeCompare(b.displaySchedule))
      .forEach((entry) => {
        const li = document.createElement('li')
        li.dataset.id = entry.id
        const phoneLine = escapeHtml(entry.record.phone || '-')
        const heightLine = entry.record.height
          ? `<span class="meta-line">신장 ${escapeHtml(entry.record.height)}</span>`
          : ''
        const districtLine = entry.record.district
          ? `<span class="meta-line">거주 구 ${escapeHtml(entry.record.district)}</span>`
          : ''
        const jobLine = entry.record.job ? `<span class="meta-line">직업 ${escapeHtml(entry.record.job)}</span>` : ''
        li.innerHTML = `
          <time>${entry.displaySchedule}</time>
          <span>${escapeHtml(entry.name || '익명')} · ${formatPhoneStatus(entry.record.phoneConsultStatus)}</span>
          <span class="meta-line">연락처 ${phoneLine}</span>
          ${heightLine}
          ${districtLine}
          ${jobLine}
        `
        if (entry.record.notes) {
          const noteSpan = document.createElement('span')
          noteSpan.className = 'note-line'
          noteSpan.textContent = entry.record.notes
          li.appendChild(noteSpan)
        }
        dom.calendarAppointmentList.appendChild(li)
      })
  }

  function refreshCalendar(forceSelection = false) {
    const meetings = getMeetingsGroupedByDate()
    const todayKey = getDateKey(new Date())
    if (
      !state.calendarState.selectedDate ||
      forceSelection ||
      (state.calendarState.selectedDate && !meetings.has(state.calendarState.selectedDate))
    ) {
      if (meetings.has(todayKey)) {
        state.calendarState.selectedDate = todayKey
      } else if (meetings.size) {
        const earliest = Array.from(meetings.keys()).sort()[0]
        state.calendarState.selectedDate = earliest
      } else {
        state.calendarState.selectedDate = todayKey
      }
    }
    const selectedDateObj = new Date(state.calendarState.selectedDate)
    if (!Number.isNaN(selectedDateObj.getTime())) {
      state.calendarState.current = new Date(
        selectedDateObj.getFullYear(),
        selectedDateObj.getMonth(),
        1,
      )
    }
    renderCalendar(meetings)
    renderCalendarAppointments(meetings)
  }

  function openCalendarModal(forceRefresh = false) {
    dom.calendarModal.hidden = false
    document.body.classList.add('modal-open')
    refreshCalendar(forceRefresh)
  }

  function closeCalendarModal() {
    dom.calendarModal.hidden = true
    document.body.classList.remove('modal-open')
  }

  function changeCalendarMonth(offset) {
    state.calendarState.current = new Date(
      state.calendarState.current.getFullYear(),
      state.calendarState.current.getMonth() + offset,
      1,
    )
    const meetings = getMeetingsGroupedByDate()
    const year = state.calendarState.current.getFullYear()
    const month = String(state.calendarState.current.getMonth() + 1).padStart(2, '0')
    const monthDates = Array.from(meetings.keys())
      .filter((key) => key.startsWith(`${year}-${month}-`))
      .sort()
    if (monthDates.length) {
      state.calendarState.selectedDate = monthDates[0]
    } else {
      state.calendarState.selectedDate = getDateKey(
        new Date(state.calendarState.current.getFullYear(), state.calendarState.current.getMonth(), 1),
      )
    }
    renderCalendar(meetings)
    renderCalendarAppointments(meetings)
  }

  function goToToday() {
    const today = new Date()
    state.calendarState.current = new Date(today.getFullYear(), today.getMonth(), 1)
    state.calendarState.selectedDate = getDateKey(today)
    refreshCalendar(true)
  }

  function handleCalendarDayClick(event) {
    const dayEl = event.target.closest('.calendar-day')
    if (!dayEl || !dayEl.dataset.date) return
    state.calendarState.selectedDate = dayEl.dataset.date
    const dateObj = new Date(state.calendarState.selectedDate)
    if (!Number.isNaN(dateObj.getTime())) {
      state.calendarState.current = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1)
    }
    const meetings = getMeetingsGroupedByDate()
    renderCalendar(meetings)
    renderCalendarAppointments(meetings)
  }

  function handleCalendarAppointmentClick(event) {
    const itemEl = event.target.closest('li[data-id]')
    if (!itemEl || itemEl.classList.contains('calendar-empty-item')) return
    const { id } = itemEl.dataset
    if (id && YGSA.detail) {
      YGSA.detail.open(id)
    }
  }

  function initCalendar() {
    dom.calendarScrollBtn?.addEventListener('click', () => openCalendarModal(true))
    dom.calendarCloseBtn?.addEventListener('click', closeCalendarModal)
    dom.calendarPrevBtn?.addEventListener('click', () => changeCalendarMonth(-1))
    dom.calendarNextBtn?.addEventListener('click', () => changeCalendarMonth(1))
    dom.calendarTodayBtn?.addEventListener('click', goToToday)
    dom.calendarModal?.addEventListener('click', (event) => {
      if (event.target === dom.calendarModal) closeCalendarModal()
    })
    dom.calendarGrid?.addEventListener('click', handleCalendarDayClick)
    dom.calendarAppointmentList?.addEventListener('click', handleCalendarAppointmentClick)
  }

  YGSA.calendar = {
    init: initCalendar,
    open: openCalendarModal,
    close: closeCalendarModal,
    refresh: refreshCalendar,
  }
})()



