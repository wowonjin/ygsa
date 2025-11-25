import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

import {
  PHONE_STATUS_OPTIONS,
  SALARY_RANGE_OPTIONS,
  PREFERRED_HEIGHT_OPTIONS,
  PREFERRED_AGE_OPTIONS,
  VALUES_OPTIONS,
  SORT_OPTIONS,
  QUICK_LINKS,
  ASIDE_MEMO_STORAGE_KEY,
} from '../constants'
import { useConsultations } from '../hooks/useConsultations'
import {
  calculateStats,
  filterAndSortItems,
  formatDateTime,
  formatPhoneNumber,
  formatPhoneStatus,
  formatSalaryRange,
  generateTimeSlots,
  getDateKey,
  getDraftForPhone,
  getReservedTimes,
  groupMeetingsByDate,
  normalizeHeightValue,
  resolveShareUrl,
  splitLocalDateTime,
  formatSelectedDateTitle,
  formatCalendarSchedule,
  copyToClipboard,
  getStatusClass,
  PHONE_STATUS_VALUES,
} from '../utils/consultations'

const initialDetailForm = {
  name: '',
  phone: '',
  gender: '',
  birth: '',
  education: '',
  job: '',
  height: '',
  district: '',
  mbti: '',
  university: '',
  salaryRange: '',
  jobDetail: '',
  profileAppeal: '',
  smoking: '',
  religion: '',
  longDistance: '',
  dink: '',
  lastRelationship: '',
  marriageTiming: '',
  relationshipCount: '',
  carOwnership: '',
  tattoo: '',
  divorceStatus: '',
  preferredHeights: [],
  preferredAges: [],
  values: [],
  valuesCustom: '',
  sufficientCondition: '',
  necessaryCondition: '',
  likesDislikes: '',
  aboutMe: '',
  notes: '',
}

export default function Dashboard() {
  const [viewState, setViewState] = useState({ search: '', gender: 'all', height: 'all', sort: 'latest' })
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [detailState, setDetailState] = useState({ open: false, recordId: null })
  const [detailForm, setDetailForm] = useState(initialDetailForm)
  const [detailPhoneStatus, setDetailPhoneStatus] = useState('pending')
  const [detailSchedule, setDetailSchedule] = useState({ date: '', time: '' })
  const [detailProfileLink, setDetailProfileLink] = useState({ visible: false, url: '', status: '' })
  const [draftData, setDraftData] = useState(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarState, setCalendarState] = useState(() => ({
    current: new Date(),
    selectedDate: '',
  }))
  const [toastMessage, setToastMessage] = useState('')
  const [profileLinkLoading, setProfileLinkLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [isAsideOpen, setIsAsideOpen] = useState(false)
  const [asideMemo, setAsideMemo] = useState('')

  const toastTimerRef = useRef(null)
  const excelInputRef = useRef(null)
  const suppressUpdateToastRef = useRef(false)
  const suppressDeleteToastRef = useRef(false)

  const { items, loading, error, patchItem, deleteItems, importItems, createProfileLink } =
    useConsultations(handleServerEvent)

  const preparedItems = useMemo(() => filterAndSortItems(items, viewState), [items, viewState])
  const stats = useMemo(() => calculateStats(items), [items])
  const meetingsMap = useMemo(() => groupMeetingsByDate(items), [items])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('modal-open', detailState.open || calendarOpen)
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [detailState.open, calendarOpen])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ASIDE_MEMO_STORAGE_KEY)
      if (saved) {
        setAsideMemo(saved)
      }
    } catch (error) {
      console.warn('[aside:memo] 불러오기 실패', error)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(ASIDE_MEMO_STORAGE_KEY, asideMemo)
    } catch (error) {
      console.warn('[aside:memo] 저장 실패', error)
    }
  }, [asideMemo])

  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(items.map((item) => item.id))
      const next = new Set()
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id)
      })
      return next
    })
  }, [items])

  function handleServerEvent(event) {
    if (!event) return
    if (event.type === 'consult:new') {
      showToast('새로운 상담 신청이 도착했습니다!')
    } else if (event.type === 'consult:import') {
      showToast('엑셀 데이터가 반영되었습니다.')
    } else if (event.type === 'consult:update') {
      if (suppressUpdateToastRef.current) {
        suppressUpdateToastRef.current = false
      } else if (event.record?.name) {
        showToast(`${event.record.name} 님의 정보가 업데이트되었습니다.`)
      }
    } else if (event.type === 'consult:delete') {
      if (suppressDeleteToastRef.current) {
        suppressDeleteToastRef.current = false
      } else if (event.ids?.length) {
        showToast(`${event.ids.length}건이 삭제되었습니다.`)
      }
    } else if (event.type === 'events:error') {
      showToast('실시간 연결이 끊겼습니다. 잠시 후 자동 재연결됩니다.')
    }
  }

  function showToast(message) {
    if (!message) return
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }
    setToastMessage(message)
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 2500)
  }

  function handleSearchChange(event) {
    setViewState((prev) => ({ ...prev, search: event.target.value }))
  }

  function handleGenderFilter(event) {
    setViewState((prev) => ({ ...prev, gender: event.target.value }))
  }

  function handleHeightFilter(event) {
    setViewState((prev) => ({ ...prev, height: event.target.value }))
  }

  function handleSortChange(event) {
    setViewState((prev) => ({ ...prev, sort: event.target.value }))
  }

  function toggleSelection(id, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  function openDetail(record) {
    if (!record) return
    setDetailState({ open: true, recordId: record.id })
    setDetailForm({
      name: record.name || '',
      phone: formatPhoneNumber(record.phone),
      gender: record.gender || '',
      birth: record.birth || '',
      education: record.education || '',
      job: record.job || '',
      height: normalizeHeightValue(record.height || record.region),
      district: record.district || '',
      mbti: record.mbti || '',
      university: record.university || '',
      salaryRange: record.salaryRange || '',
      jobDetail: record.jobDetail || '',
      profileAppeal: record.profileAppeal || '',
      smoking: record.smoking || '',
      religion: record.religion || '',
      longDistance: record.longDistance || '',
      dink: record.dink || '',
      lastRelationship: record.lastRelationship || '',
      marriageTiming: record.marriageTiming || '',
      relationshipCount: record.relationshipCount || '',
      carOwnership: record.carOwnership || '',
      tattoo: record.tattoo || '',
      divorceStatus: record.divorceStatus || '',
      preferredHeights: record.preferredHeights || [],
      preferredAges: record.preferredAges || [],
      values: Array.isArray(record.values) ? record.values.slice(0, 1) : [],
      valuesCustom: record.valuesCustom || '',
      sufficientCondition: record.sufficientCondition || '',
      necessaryCondition: record.necessaryCondition || '',
      likesDislikes: record.likesDislikes || '',
      aboutMe: record.aboutMe || '',
      notes: record.notes || '',
    })
    const { date, time } = splitLocalDateTime(record.meetingSchedule)
    setDetailSchedule({ date, time })
    setDetailPhoneStatus(
      PHONE_STATUS_VALUES.includes(record.phoneConsultStatus) ? record.phoneConsultStatus : 'pending',
    )
    setDetailProfileLink({ visible: false, url: '', status: '' })
    const draft = getDraftForPhone(record.phone)
    setDraftData(draft)
  }

  function closeDetail() {
    setDetailState({ open: false, recordId: null })
    setDetailForm(initialDetailForm)
    setDetailSchedule({ date: '', time: '' })
    setDetailPhoneStatus('pending')
    setDetailProfileLink({ visible: false, url: '', status: '' })
    setDraftData(null)
  }

  async function handleDetailSubmit(event) {
    event.preventDefault()
    if (!detailState.recordId) return
    if (!PHONE_STATUS_VALUES.includes(detailPhoneStatus)) {
      showToast('전화 상담 상태를 선택해 주세요.')
      return
    }
    const trimmedForm = trimDetailForm(detailForm)
    if (detailSchedule.date && !detailSchedule.time) {
      showToast('상담 시간을 선택해 주세요.')
      return
    }
    if (!detailSchedule.date && detailSchedule.time) {
      showToast('상담 날짜를 선택해 주세요.')
      return
    }

    let meetingSchedule = ''
    if (detailSchedule.date && detailSchedule.time) {
      const date = new Date(`${detailSchedule.date}T${detailSchedule.time}`)
      if (Number.isNaN(date.getTime())) {
        showToast('유효한 상담 일정을 선택해 주세요.')
        return
      }
      meetingSchedule = date.toISOString()
    }

    const payload = {
      ...trimmedForm,
      preferredHeights: trimmedForm.preferredHeights || [],
      preferredAges: trimmedForm.preferredAges || [],
      values: (trimmedForm.values || []).slice(0, 1),
      phoneConsultStatus: detailPhoneStatus,
      meetingSchedule,
      notes: trimmedForm.notes || '',
    }

    try {
      suppressUpdateToastRef.current = true
      await patchItem(detailState.recordId, payload)
      showToast('상세 정보를 저장했습니다.')
      closeDetail()
    } catch (err) {
      showToast(err?.message || '상세 정보를 저장하지 못했습니다.')
    } finally {
      setTimeout(() => {
        suppressUpdateToastRef.current = false
      }, 1200)
    }
  }

  async function handleDeleteSelected() {
    if (!selectedIds.size) return
    if (!window.confirm('선택한 상담을 삭제할까요?')) return
    const ids = Array.from(selectedIds)
    try {
      suppressDeleteToastRef.current = true
      await deleteItems(ids)
      setSelectedIds(new Set())
      showToast(`${ids.length}건을 삭제했습니다.`)
    } catch (err) {
      showToast(err?.message || '삭제에 실패했습니다.')
    } finally {
      setTimeout(() => {
        suppressDeleteToastRef.current = false
      }, 2000)
    }
  }

  function handleExport() {
    if (!preparedItems.length) {
      showToast('내보낼 데이터가 없습니다.')
      return
    }
    const rows = preparedItems.map((item, index) => ({
      번호: index + 1,
      성명: item.name || '',
      성별: item.gender || '',
      연락처: item.phone || '',
      생년월일: item.birth || '',
      최종학력: item.education || '',
      직업: item.job || '',
      신장: item.height || '',
      MBTI: item.mbti || '',
      대학교: item.university || '',
      연봉구간: formatSalaryRange(item.salaryRange) || '',
      흡연: item.smoking || '',
      종교: item.religion || '',
      선호키: (item.preferredHeights || []).join(', '),
      선호나이: (item.preferredAges || []).join(', '),
      거주구: item.district || '',
      직무상세: item.jobDetail || '',
      추가어필: item.profileAppeal || '',
      충분조건: item.sufficientCondition || '',
      필요조건: item.necessaryCondition || '',
      좋아하는것싫어하는것: item.likesDislikes || '',
      가치관: (item.values || []).join(', '),
      가치관기타: item.valuesCustom || '',
      자기소개: item.aboutMe || '',
      신분증파일: item.documents?.idCard?.name || '',
      재직증빙파일: item.documents?.employmentProof?.name || '',
      사진파일: (item.photos || []).map((photo) => photo.name).join(', '),
      접수시간: formatDateTime(item.createdAt),
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '상담 신청')
    const dateLabel = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `consultations-${dateLabel}.xlsx`)
    showToast('엑셀 파일이 다운로드되었습니다.')
  }

  async function handleImport(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setImporting(true)
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        showToast('시트를 찾을 수 없습니다.')
        return
      }
      const sheet = workbook.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      if (!json.length) {
        showToast('엑셀에서 데이터를 찾지 못했습니다.')
        return
      }
      const normalized = json.map((row) => ({
        id: row.id || row.ID || row.Id || String(Math.random()).slice(2),
        name: row.성명 || row.이름 || row.name || '',
        gender: row.성별 || row.gender || '',
        phone: row.연락처 || row.phone || '',
        birth: row.생년월일 || row.birth || '',
        job: row.직업 || row.job || row.occupation || '',
        height:
          row.신장 ||
          row['신장(cm)'] ||
          row.height ||
          row.거주지역 ||
          row.지역 ||
          row.region ||
          '',
        district: row.거주구 || row['거주 구'] || row.구 || row.district || '',
        education: row.최종학력 || row.education || '',
        createdAt: row.접수시간
          ? new Date(row.접수시간).toISOString()
          : row.createdAt || new Date().toISOString(),
      }))
      await importItems(normalized)
      showToast(`엑셀 데이터 ${normalized.length}건을 반영했습니다.`)
      setSelectedIds(new Set())
    } catch (err) {
      console.error(err)
      showToast(err?.message || '엑셀 파일 처리에 실패했습니다.')
    } finally {
      setImporting(false)
      if (excelInputRef.current) {
        excelInputRef.current.value = ''
      }
    }
  }

  function handleProfileLinkReset() {
    setDetailProfileLink({ visible: false, url: '', status: '' })
  }

  async function handleProfileLinkRequest() {
    if (!detailState.recordId) {
      showToast('먼저 상세 정보를 열어주세요.')
      return
    }
    setDetailProfileLink({ visible: false, url: '', status: '' })
    setProfileLinkLoading(true)
    try {
      const share = await createProfileLink(detailState.recordId)
      const resolvedUrl = resolveShareUrl(share?.shareUrl)
      if (!resolvedUrl) {
        throw new Error('프로필 카드 링크를 생성하지 못했습니다.')
      }
      const previewWindow = window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
      const copied = await copyToClipboard(resolvedUrl)
      if (!copied || !previewWindow) {
        openShareLinkPrompt(resolvedUrl, copied, !previewWindow)
      }
      const previewMessage = previewWindow
        ? '새 탭에서 프로필 카드를 열었습니다.'
        : '팝업이 차단되어 브라우저에서 새 탭을 열지 못했습니다.'
      const copyMessage = copied ? '클립보드에 링크를 복사했습니다.' : '복사가 필요해 안내창을 표시했습니다.'
      showToast(`프로필 카드 링크를 준비했습니다. ${previewMessage} ${copyMessage}`)
      setDetailProfileLink({
        visible: true,
        url: resolvedUrl,
        status: `${previewMessage} ${copied ? '복사 완료' : '복사 필요'}`,
      })
    } catch (err) {
      console.error(err)
      showToast(err?.message || '프로필 카드 링크를 생성하지 못했습니다.')
      handleProfileLinkReset()
    } finally {
      setProfileLinkLoading(false)
    }
  }

  async function handleProfileLinkCopy() {
    if (!detailProfileLink.url) {
      showToast('먼저 프로필 카드 링크를 생성해주세요.')
      return
    }
    const copied = await copyToClipboard(detailProfileLink.url)
    if (copied) {
      showToast('프로필 카드 링크를 복사했습니다.')
    } else {
      openShareLinkPrompt(detailProfileLink.url, false, false)
    }
  }

  function handleProfileLinkOpen(event) {
    event?.preventDefault()
    if (!detailProfileLink.url) {
      showToast('먼저 프로필 카드 링크를 생성해주세요.')
      return
    }
    const opened = window.open(detailProfileLink.url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      openShareLinkPrompt(detailProfileLink.url, false, true)
    }
  }

  function openShareLinkPrompt(link, copied = false, previewBlocked = false) {
    if (!link) return
    const messages = []
    if (copied) {
      messages.push('프로필 카드 링크가 복사되었습니다.')
    } else {
      messages.push('클립보드 복사를 지원하지 않아 수동 복사가 필요합니다.')
    }
    if (previewBlocked) {
      messages.push('팝업이 차단된 경우 직접 링크를 열어주세요.')
    }
    messages.push('아래 주소를 복사해 주세요.')
    window.prompt(messages.join('\n\n'), link)
  }

  function openCalendar(forceRefresh = false) {
    const todayKey = getDateKey(new Date())
    const selectedDate = calendarState.selectedDate || todayKey
    setCalendarState((prev) => ({
      current: new Date(selectedDate),
      selectedDate,
    }))
    setCalendarOpen(true)
  }

  function closeCalendar() {
    setCalendarOpen(false)
  }

  function changeCalendarMonth(offset) {
    setCalendarState((prev) => {
      const nextCurrent = new Date(prev.current.getFullYear(), prev.current.getMonth() + offset, 1)
      return {
        current: nextCurrent,
        selectedDate: getDateKey(
          new Date(nextCurrent.getFullYear(), nextCurrent.getMonth(), Math.min(15, nextCurrent.getDate())),
        ),
      }
    })
  }

  function goToToday() {
    const today = new Date()
    setCalendarState({ current: new Date(today.getFullYear(), today.getMonth(), 1), selectedDate: getDateKey(today) })
  }

  function handleCalendarDayClick(dateKey) {
    setCalendarState((prev) => ({
      current: new Date(new Date(dateKey).getFullYear(), new Date(dateKey).getMonth(), 1),
      selectedDate: dateKey,
    }))
  }

  function handleCalendarAppointmentClick(id) {
    const record = items.find((item) => item.id === id)
    if (record) {
      openDetail(record)
    }
  }

  const genderOptions = useMemo(() => {
    const set = new Set(items.map((item) => item.gender).filter(Boolean))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko-KR'))
  }, [items])

  const heightOptions = useMemo(() => {
    const set = new Set(items.map((item) => item.height).filter(Boolean))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko-KR'))
  }, [items])

  const activeRecord = detailState.recordId
    ? items.find((item) => item.id === detailState.recordId)
    : null

  return (
    <>
      <AsideNavigation
        open={isAsideOpen}
        links={QUICK_LINKS}
        memo={asideMemo}
        onToggle={() => setIsAsideOpen((prev) => !prev)}
        onMemoChange={setAsideMemo}
      />
      <HeaderSection />
      <StatsSummary stats={stats} />
      <main>
        <Toolbar
          viewState={viewState}
          onSearchChange={handleSearchChange}
          onGenderChange={handleGenderFilter}
          onHeightChange={handleHeightFilter}
          onSortChange={handleSortChange}
          genderOptions={genderOptions}
          heightOptions={heightOptions}
          onExport={handleExport}
          onImportClick={() => excelInputRef.current?.click()}
          importing={importing}
          onCalendar={() => openCalendar(true)}
        />
        <input
          type="file"
          accept=".xlsx,.xls"
          ref={excelInputRef}
          hidden
          onChange={handleImport}
        />
        {loading ? (
          <div className="empty">상담 정보를 불러오는 중입니다...</div>
        ) : error ? (
          <div className="empty">{error}</div>
        ) : preparedItems.length ? (
          <CardsGrid
            items={preparedItems}
            selectedIds={selectedIds}
            onToggleSelection={toggleSelection}
            onOpenDetail={(record) => openDetail(record)}
          />
        ) : (
          <div className="empty">표시할 상담 정보가 없습니다.</div>
        )}
      </main>
      <BulkActionBar count={selectedIds.size} onDelete={handleDeleteSelected} />
      <DetailModal
        open={detailState.open}
        record={activeRecord}
        form={detailForm}
        onClose={closeDetail}
        onChange={setDetailForm}
        phoneStatus={detailPhoneStatus}
        onPhoneStatusChange={setDetailPhoneStatus}
        schedule={detailSchedule}
        onScheduleChange={setDetailSchedule}
        onSubmit={handleDetailSubmit}
        preferredOptions={{ heights: PREFERRED_HEIGHT_OPTIONS, ages: PREFERRED_AGE_OPTIONS, values: VALUES_OPTIONS }}
        salaryOptions={SALARY_RANGE_OPTIONS}
        onProfileLinkRequest={handleProfileLinkRequest}
        profileLink={detailProfileLink}
        onProfileLinkReset={handleProfileLinkReset}
        onProfileLinkCopy={handleProfileLinkCopy}
        onProfileLinkOpen={handleProfileLinkOpen}
        profileLinkLoading={profileLinkLoading}
        draftData={draftData}
        onApplyDraft={() => {
          if (draftData) {
            setDetailForm((prev) => ({
              ...prev,
              ...mapDraftToForm(draftData),
            }))
            showToast('임시 저장된 데이터를 적용했습니다.')
          } else {
            showToast('불러올 임시 데이터가 없습니다.')
          }
        }}
        reservedTimes={getReservedTimes(items, detailSchedule.date, detailState.recordId)}
      />
      <CalendarModal
        open={calendarOpen}
        onClose={closeCalendar}
        calendarState={calendarState}
        meetingsMap={meetingsMap}
        onDayClick={handleCalendarDayClick}
        onAppointmentClick={handleCalendarAppointmentClick}
        onPrev={() => changeCalendarMonth(-1)}
        onNext={() => changeCalendarMonth(1)}
        onToday={goToToday}
      />
      <Toast message={toastMessage} />
      <StickyNote />
    </>
  )
}

function HeaderSection() {
  return (
    <header>
      <div className="header-left">
        <h1>연결사 상담 대시보드</h1>
      </div>
    </header>
  )
}

function StatsSummary({ stats }) {
  return (
    <section className="stats-summary">
      <span>총 상담 인원: {stats.total.toLocaleString('ko-KR')}명</span>
      <span>월간 상담 인원: {stats.monthly.toLocaleString('ko-KR')}명</span>
      <span>주간 상담 인원: {stats.weekly.toLocaleString('ko-KR')}명</span>
      <span>오늘 상담 인원: {stats.daily.toLocaleString('ko-KR')}명</span>
    </section>
  )
}

function Toolbar({
  viewState,
  onSearchChange,
  onGenderChange,
  onHeightChange,
  onSortChange,
  genderOptions,
  heightOptions,
  onExport,
  onImportClick,
  importing,
  onCalendar,
}) {
  return (
    <section className="toolbar">
      <div className="toolbar-filters">
        <input
          type="text"
          placeholder="이름, 연락처, 키, 거주 구 등 검색"
          value={viewState.search}
          onChange={onSearchChange}
        />
        <select value={viewState.gender} onChange={onGenderChange}>
          <option value="all">성별 전체</option>
          {genderOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select value={viewState.height} onChange={onHeightChange}>
          <option value="all">신장 전체</option>
          {heightOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select value={viewState.sort} onChange={onSortChange}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-actions">
        <button type="button" onClick={onExport}>
          엑셀로 내보내기
        </button>
        <button type="button" onClick={onImportClick} disabled={importing}>
          {importing ? '가져오는 중...' : '엑셀에서 가져오기'}
        </button>
        <button type="button" onClick={onCalendar}>
          예약 일정 확인
        </button>
      </div>
    </section>
  )
}

function CardsGrid({ items, selectedIds, onToggleSelection, onOpenDetail }) {
  return (
    <section className="cards" id="cardsContainer">
      {items.map((item) => (
        <article className="card" key={item.id} data-id={item.id} onClick={() => onOpenDetail(item)}>
          <div className="card-top">
            <div>
              <div className="card-title">
                <h2>{item.name || '익명'}</h2>
                <span className={`status-chip ${getStatusClass(item.phoneConsultStatus)}`}>
                  {formatPhoneStatus(item.phoneConsultStatus)}
                </span>
              </div>
              <div className="meta">{formatDateTime(item.createdAt)} 접수</div>
            </div>
            <div className="card-controls" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                className="select-checkbox"
                checked={selectedIds.has(item.id)}
                onChange={(event) => onToggleSelection(item.id, event.target.checked)}
                aria-label="상담 선택"
              />
            </div>
          </div>
          <dl>
            <CardEntry label="연락처" value={item.phone} />
            <CardEntry label="성별" value={item.gender} />
            <CardEntry label="생년(생일)" value={item.birth} />
            <CardEntry label="최종학력" value={item.education} />
            <CardEntry label="직업" value={item.job} />
            <CardEntry label="신장" value={item.height} />
            <CardEntry label="MBTI" value={item.mbti} />
            <CardEntry label="연봉" value={formatSalaryRange(item.salaryRange)} />
            <CardEntry label="거주 구" value={item.district} />
          </dl>
          <CardAttachments item={item} />
        </article>
      ))}
    </section>
  )
}

function CardEntry({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '-'}</dd>
    </div>
  )
}

function CardAttachments({ item }) {
  const attachments = []
  const documents = item.documents || {}
  if (documents.idCard?.downloadURL) {
    attachments.push({
      label: '신분증',
      url: documents.idCard.downloadURL,
      name: documents.idCard.name || '신분증',
    })
  }
  if (documents.employmentProof?.downloadURL) {
    attachments.push({
      label: '재직 증빙',
      url: documents.employmentProof.downloadURL,
      name: documents.employmentProof.name || '재직 증빙',
    })
  }
  const photos = Array.isArray(item.photos) ? item.photos : []
  photos.forEach((photo, index) => {
    if (photo?.downloadURL) {
      attachments.push({
        label: `사진 ${index + 1}`,
        url: photo.downloadURL,
        name: photo.name || `사진 ${index + 1}`,
      })
    }
  })
  if (!attachments.length) return null
  return (
    <div className="card-attachments" onClick={(event) => event.stopPropagation()}>
      <div className="card-attachments-title">업로드 자료</div>
      <ul className="card-attachments-list">
        {attachments.map((file) => (
          <li key={`${file.label}-${file.url}`}>
            <span className="label">{file.label}</span>
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              {file.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BulkActionBar({ count, onDelete }) {
  return (
    <div className="bulk-action-bar" hidden={!count}>
      <span>{count ? `${count}건 선택됨` : ''}</span>
      <button type="button" onClick={onDelete} disabled={!count}>
        정보 삭제하기
      </button>
    </div>
  )
}

function Toast({ message }) {
  return <div className={`toast ${message ? 'show' : ''}`}>{message}</div>
}

function StickyNote() {
  return (
    <div className="sticky-note">
      [아임웹 아이디 비번 비밀번호]
      <br />
      ID: yeongyeolsa@gmail.com
      <br />
      PS: 10Aksghldnjs!
      <br />
      <br />
      [구글 아이디 비번 비밀번호]
      <br />
      ID: yeongyeolsa@gmail.com
      <br />
      PS: 10aksghldnjs
    </div>
  )
}

function trimDetailForm(form) {
  const entries = Object.entries(form).map(([key, value]) => {
    if (typeof value === 'string') {
      return [key, value.trim()]
    }
    return [key, value]
  })
  return Object.fromEntries(entries)
}

function mapDraftToForm(draft) {
  const mapped = {}
  Object.entries(draft).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      mapped[key] = value
    } else if (typeof value === 'string') {
      mapped[key] = value
    }
  })
  return mapped
}

function DetailModal({
  open,
  record,
  form,
  onClose,
  onChange,
  phoneStatus,
  onPhoneStatusChange,
  schedule,
  onScheduleChange,
  reservedTimes,
  preferredOptions,
  salaryOptions,
  onSubmit,
  onProfileLinkRequest,
  profileLink,
  onProfileLinkReset,
  onProfileLinkCopy,
  onProfileLinkOpen,
  profileLinkLoading,
  draftData,
  onApplyDraft,
}) {
  if (!open || !record) return null
  const timeSlots = generateTimeSlots()
  const handleInput = (field) => (event) => onChange((prev) => ({ ...prev, [field]: event.target.value }))
  const scheduleInfo =
    schedule.date && schedule.time
      ? `선택한 일정: ${schedule.date} ${schedule.time}`
      : record.meetingSchedule
      ? `현재 예약: ${formatDateTime(record.meetingSchedule)}`
      : '대면 상담 일정이 아직 없습니다.'

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title-group">
            <h2>{record.name || '상담 신청'}</h2>
            <p className="modal-subtitle">
              {[
                record.phone ? `연락처 ${record.phone}` : null,
                record.job ? `직업 ${record.job}` : null,
                record.mbti ? `MBTI ${record.mbti}` : null,
                record.height ? `신장 ${record.height}` : null,
                record.district ? `거주 구 ${record.district}` : null,
                record.createdAt ? `신청 ${formatDateTime(record.createdAt)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            닫기
          </button>
        </div>
        <form className="modal-form" onSubmit={onSubmit}>
          <div className="detail-fields">
            <div className="field-grid">
              <DetailField label="이름">
                <input type="text" value={form.name} onChange={handleInput('name')} required />
              </DetailField>
              <DetailField label="연락처">
                <input type="tel" value={form.phone} onChange={handleInput('phone')} required />
              </DetailField>
              <DetailField label="성별">
                <input type="text" value={form.gender} onChange={handleInput('gender')} />
              </DetailField>
              <DetailField label="생년월일">
                <input type="text" value={form.birth} onChange={handleInput('birth')} />
              </DetailField>
              <DetailField label="전화 상담 상태">
                <select value={phoneStatus} onChange={(event) => onPhoneStatusChange(event.target.value)}>
                  {PHONE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </DetailField>
              <DetailField label="대면 상담 일정" className="full-width">
                <div className="inline-group">
                  <input
                    type="date"
                    value={schedule.date}
                    onChange={(event) => onScheduleChange((prev) => ({ ...prev, date: event.target.value }))}
                  />
                  <select
                    className="time-select"
                    value={schedule.time}
                    onChange={(event) => onScheduleChange((prev) => ({ ...prev, time: event.target.value }))}
                    disabled={!schedule.date}
                  >
                    <option value="">시간 선택</option>
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot} disabled={reservedTimes?.has?.(slot)}>
                        {reservedTimes?.has?.(slot) ? `${slot} (예약됨)` : slot}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => onScheduleChange({ date: '', time: '' })}>
                    일정 지우기
                  </button>
                </div>
                <p className="modal-subtitle">{scheduleInfo}</p>
              </DetailField>
              <DetailField label="프로필 카드 공유" className="full-width">
                <div className="detail-share-actions">
                  <button type="button" className="primary" onClick={onProfileLinkRequest} disabled={profileLinkLoading}>
                    {profileLinkLoading ? '생성 중...' : '링크 생성'}
                  </button>
                  {profileLink.visible && (
                    <>
                      <a href={profileLink.url} className="detail-share-link" onClick={onProfileLinkOpen}>
                        링크 열기
                      </a>
                      <button type="button" className="detail-share-copy" onClick={onProfileLinkCopy}>
                        링크 복사
                      </button>
                    </>
                  )}
                </div>
                {profileLink.visible && (
                  <div className="detail-share-result">
                    <div className="detail-share-message">
                      <strong>공유 링크</strong>
                      <span>{profileLink.url}</span>
                      <span>{profileLink.status}</span>
                    </div>
                    <button type="button" className="ghost" onClick={onProfileLinkReset}>
                      숨기기
                    </button>
                  </div>
                )}
              </DetailField>
              {draftData && (
                <DetailField label="임시 데이터" className="full-width">
                  <button type="button" className="secondary" onClick={onApplyDraft}>
                    임시 데이터 불러오기
                  </button>
                </DetailField>
              )}
              <DetailField label="최종학력">
                <input type="text" value={form.education} onChange={handleInput('education')} />
              </DetailField>
              <DetailField label="직업">
                <input type="text" value={form.job} onChange={handleInput('job')} />
              </DetailField>
              <DetailField label="신장">
                <input type="text" value={form.height} onChange={handleInput('height')} />
              </DetailField>
              <DetailField label="거주 구">
                <input type="text" value={form.district} onChange={handleInput('district')} />
              </DetailField>
              <DetailField label="MBTI">
                <input type="text" value={form.mbti} onChange={handleInput('mbti')} />
              </DetailField>
              <DetailField label="대학교">
                <input type="text" value={form.university} onChange={handleInput('university')} />
              </DetailField>
              <DetailField label="연봉 (세전 기준)">
                <select value={form.salaryRange} onChange={handleInput('salaryRange')}>
                  <option value="">선택</option>
                  {salaryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </DetailField>
              <DetailField label="직업/직무 상세" className="full-width">
                <textarea value={form.jobDetail} onChange={handleInput('jobDetail')} />
              </DetailField>
              <DetailField label="추가 어필" className="full-width">
                <textarea value={form.profileAppeal} onChange={handleInput('profileAppeal')} />
              </DetailField>
              <DetailField label="흡연">
                <select value={form.smoking} onChange={handleInput('smoking')}>
                  <option value="">선택</option>
                  <option value="비흡연">비흡연</option>
                  <option value="사회적 흡연">사회적 흡연</option>
                  <option value="흡연">흡연</option>
                </select>
              </DetailField>
              <DetailField label="종교">
                <select value={form.religion} onChange={handleInput('religion')}>
                  <option value="">선택</option>
                  <option value="무교">무교</option>
                  <option value="기독교">기독교</option>
                  <option value="천주교">천주교</option>
                  <option value="불교">불교</option>
                  <option value="기타">기타</option>
                </select>
              </DetailField>
              <DetailField label="장거리 연애 가능 여부">
                <select value={form.longDistance} onChange={handleInput('longDistance')}>
                  <option value="">선택</option>
                  <option value="가능">가능</option>
                  <option value="불가능">불가능</option>
                  <option value="상황에 따라">상황에 따라</option>
                </select>
              </DetailField>
              <DetailField label="딩크 여부">
                <select value={form.dink} onChange={handleInput('dink')}>
                  <option value="">선택</option>
                  <option value="딩크를 원합니다">딩크를 원합니다</option>
                  <option value="딩크를 고려 중입니다">딩크를 고려 중입니다</option>
                  <option value="딩크를 원하지 않습니다">딩크를 원하지 않습니다</option>
                </select>
              </DetailField>
              <DetailField label="마지막 연애 시기">
                <input type="text" value={form.lastRelationship} onChange={handleInput('lastRelationship')} />
              </DetailField>
              <DetailField label="결혼을 생각하는 시기">
                <select value={form.marriageTiming} onChange={handleInput('marriageTiming')}>
                  <option value="">선택</option>
                  <option value="결혼생각 없음">결혼생각 없음</option>
                  <option value="연애 시작 후 3개월 안에 결혼준비 시작">연애 시작 후 3개월 안에 결혼준비 시작</option>
                  <option value="연애 시작 후 6개월 안에 결혼준비 시작">연애 시작 후 6개월 안에 결혼준비 시작</option>
                  <option value="연애 시작 후 1년 정도에 결혼준비 시작">연애 시작 후 1년 정도에 결혼준비 시작</option>
                  <option value="연애 시작 후 1년 6개월 정도에 결혼준비 시작">
                    연애 시작 후 1년 6개월 정도에 결혼준비 시작
                  </option>
                  <option value="연애 시작 후 2년정도에 결혼준비 시작">연애 시작 후 2년정도에 결혼준비 시작</option>
                  <option value="연애 시작 후 2년 이상에 결혼준비 시작">연애 시작 후 2년 이상에 결혼준비 시작</option>
                </select>
              </DetailField>
              <DetailField label="성인 후 연애 횟수">
                <select value={form.relationshipCount} onChange={handleInput('relationshipCount')}>
                  <option value="">선택</option>
                  <option value="0회">0회</option>
                  <option value="1~3회">1~3회</option>
                  <option value="4~6회">4~6회</option>
                  <option value="7~9회">7~9회</option>
                  <option value="10~12회">10~12회</option>
                  <option value="13~15회">13~15회</option>
                  <option value="16~19회">16~19회</option>
                  <option value="20회 이상">20회 이상</option>
                </select>
              </DetailField>
              <DetailField label="자차 유무">
                <select value={form.carOwnership} onChange={handleInput('carOwnership')}>
                  <option value="">선택</option>
                  <option value="있음">있음</option>
                  <option value="없음">없음</option>
                  <option value="구입 계획 있음">구입 계획 있음</option>
                </select>
              </DetailField>
              <DetailField label="문신 여부">
                <select value={form.tattoo} onChange={handleInput('tattoo')}>
                  <option value="">선택</option>
                  <option value="문신 없음">문신 없음</option>
                  <option value="문신 있음">문신 있음</option>
                  <option value="비공개">비공개</option>
                </select>
              </DetailField>
              <DetailField label="돌싱 여부">
                <select value={form.divorceStatus} onChange={handleInput('divorceStatus')}>
                  <option value="">선택</option>
                  <option value="돌싱입니다(자녀o)">돌싱입니다(자녀o)</option>
                  <option value="돌싱입니다(자녀x)">돌싱입니다(자녀x)</option>
                  <option value="미혼입니다">미혼입니다</option>
                </select>
              </DetailField>
            </div>
          </div>
          <div className="detail-preferences-grid">
            <MultiCheckboxField
              label="선호 키"
              options={preferredOptions.heights}
              selected={form.preferredHeights || []}
              onChange={(values) => onChange((prev) => ({ ...prev, preferredHeights: values }))}
              hint="여러 항목 선택 가능"
            />
            <MultiCheckboxField
              label="선호 나이"
              options={preferredOptions.ages}
              selected={form.preferredAges || []}
              onChange={(values) => onChange((prev) => ({ ...prev, preferredAges: values }))}
              hint="여러 항목 선택 가능"
            />
            <MultiCheckboxField
              label="인생의 주요 가치관 (한 개)"
              options={preferredOptions.values}
              selected={form.values || []}
              onChange={(values) =>
                onChange((prev) => ({
                  ...prev,
                  values: values.slice(0, 1),
                }))
              }
              limit={1}
            />
            <DetailField label="기타 가치관">
              <input type="text" value={form.valuesCustom} onChange={handleInput('valuesCustom')} />
            </DetailField>
          </div>
          <DetailField label="충분조건" className="full-width">
            <textarea value={form.sufficientCondition} onChange={handleInput('sufficientCondition')} />
          </DetailField>
          <DetailField label="필요조건" className="full-width">
            <textarea value={form.necessaryCondition} onChange={handleInput('necessaryCondition')} />
          </DetailField>
          <DetailField label="좋아하는 것 / 싫어하는 것" className="full-width">
            <textarea value={form.likesDislikes} onChange={handleInput('likesDislikes')} />
          </DetailField>
          <DetailField label="'저는 이런 사람입니다'" className="full-width">
            <textarea value={form.aboutMe} onChange={handleInput('aboutMe')} />
          </DetailField>
          <DetailField label="관리자 메모" className="full-width">
            <textarea value={form.notes} onChange={handleInput('notes')} />
          </DetailField>
          <AttachmentSection record={record} />
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="primary">
              저장하기
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DetailField({ label, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      <label>{label}</label>
      {children}
    </div>
  )
}

function MultiCheckboxField({ label, options, selected = [], onChange, hint, limit }) {
  const selectedSet = new Set(selected)

  const handleChange = (event) => {
    const { value, checked } = event.target
    const next = new Set(selectedSet)
    if (checked) {
      if (limit && next.size >= limit) {
        event.target.checked = false
        return
      }
      next.add(value)
    } else {
      next.delete(value)
    }
    onChange(Array.from(next))
  }

  return (
    <div className="field">
      <label>
        {label}
        {hint && <span className="select-hint">{hint}</span>}
      </label>
      <div className="multi-checkbox-list">
        {options.map((option) => (
          <label key={option} className="multi-checkbox-item">
            <input
              type="checkbox"
              value={option}
              checked={selectedSet.has(option)}
              onChange={handleChange}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function AttachmentSection({ record }) {
  const documents = []
  const docs = record.documents || {}
  if (docs.idCard?.downloadURL) {
    documents.push({ label: '신분증', file: docs.idCard })
  }
  if (docs.employmentProof?.downloadURL) {
    documents.push({ label: '재직 증빙', file: docs.employmentProof })
  }
  const photos = Array.isArray(record.photos) ? record.photos.filter((photo) => photo?.downloadURL) : []
  if (!documents.length && !photos.length) return null

  return (
    <section className="detail-attachments">
      <h3>증빙 자료 및 사진</h3>
      <div className="attachment-items">
        {documents.map(({ label, file }) => (
          <div key={label} className="attachment-item">
            <h4>{label}</h4>
            <a href={file.downloadURL} target="_blank" rel="noopener noreferrer" download={file.name || label}>
              {file.name || label} 다운로드
            </a>
            <div className="attachment-url">{file.downloadURL}</div>
          </div>
        ))}
        {photos.length > 0 && (
          <div className="attachment-item">
            <h4>프로필 사진</h4>
            <div className="attachment-photo-grid">
              {photos.map((photo, index) => (
                <div key={`${photo.downloadURL}-${index}`} className="attachment-photo-item">
                  <a href={photo.downloadURL} target="_blank" rel="noopener noreferrer" download={photo.name || `사진 ${index + 1}`}>
                    <img src={photo.downloadURL} alt={photo.name || `사진 ${index + 1}`} />
                  </a>
                  <div className="attachment-url">{photo.downloadURL}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function AsideNavigation({ open, onToggle, links, memo, onMemoChange }) {
  return (
    <>
      <button
        type="button"
        className={`aside-floating-btn ${open ? 'active' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? '사이드 메뉴 닫기' : '사이드 메뉴 열기'}
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
      >
        ☰
      </button>
      <aside className={`quick-aside-panel ${open ? 'open' : ''}`}>
        <div className="quick-aside-inner">
          <div className="quick-aside-header">
            <h3>빠른 사이드 메뉴</h3>
            <button type="button" className="quick-aside-close" onClick={onToggle} aria-label="사이드 메뉴 닫기">
              닫기
            </button>
          </div>
          <div className="quick-aside-links">
            {(links || []).map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
          </div>
          <div className="quick-aside-memo">
            <label htmlFor="asideMemo">메모</label>
            <textarea
              id="asideMemo"
              value={memo}
              onChange={(event) => onMemoChange(event.target.value)}
              placeholder="중요 메모를 남겨주세요."
            />
          </div>
        </div>
      </aside>
      {open && <div className="quick-aside-backdrop" onClick={onToggle} aria-hidden="true" />}
    </>
  )
}

function CalendarModal({
  open,
  onClose,
  calendarState,
  meetingsMap,
  onDayClick,
  onAppointmentClick,
  onPrev,
  onNext,
  onToday,
}) {
  if (!open) return null
  const year = calendarState.current.getFullYear()
  const month = calendarState.current.getMonth()
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const firstDay = new Date(year, month, 1)
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - firstDay.getDay())
  const todayKey = getDateKey(new Date())
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)
    const dateKey = getDateKey(date)
    return {
      date,
      dateKey,
      isCurrentMonth: date.getMonth() === month,
      isToday: dateKey === todayKey,
      isSelected: dateKey === calendarState.selectedDate,
      count: meetingsMap.get(dateKey)?.length || 0,
    }
  })
  const selectedMeetings = meetingsMap.get(calendarState.selectedDate) || []
  return (
    <div className="calendar-overlay">
      <div className="calendar-dialog">
        <div className="calendar-controls">
          <div className="calendar-nav">
            <button type="button" onClick={onPrev}>
              이전
            </button>
            <h3>
              {year}년 {month + 1}월
            </h3>
            <button type="button" onClick={onNext}>
              다음
            </button>
          </div>
          <button type="button" className="calendar-today" onClick={onToday}>
            오늘
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="calendar-layout">
          <div className="calendar-grid">
            {weekdays.map((label) => (
              <div key={label} className="calendar-weekday">
                {label}
              </div>
            ))}
            {days.map((day) => (
              <div
                key={day.dateKey}
                className={[
                  'calendar-day',
                  !day.isCurrentMonth ? 'other-month' : '',
                  day.isToday ? 'today' : '',
                  day.isSelected ? 'selected' : '',
                  day.count ? 'has-events' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onDayClick(day.dateKey)}
              >
                <div className="day-number">{day.date.getDate()}</div>
                <div className="day-count">{day.count ? `${day.count}건` : ''}</div>
              </div>
            ))}
          </div>
          <div className="calendar-panel">
            <h4>{formatSelectedDateTitle(calendarState.selectedDate)}</h4>
            <ul className="calendar-appointments">
              {selectedMeetings.length ? (
                selectedMeetings
                  .map((entry) => ({
                    ...entry,
                    displaySchedule: formatCalendarSchedule(entry.record.meetingSchedule, entry.time, calendarState.selectedDate),
                  }))
                  .sort((a, b) => a.displaySchedule.localeCompare(b.displaySchedule))
                  .map((entry) => (
                    <li key={entry.id} data-id={entry.id} onClick={() => onAppointmentClick(entry.id)}>
                      <time>{entry.displaySchedule}</time>
                      <span>
                        {entry.name || '익명'} · {formatPhoneStatus(entry.record.phoneConsultStatus)}
                      </span>
                      <span className="meta-line">연락처 {entry.record.phone || '-'}</span>
                      {entry.record.height && (
                        <span className="meta-line">신장 {entry.record.height}</span>
                      )}
                      {entry.record.district && (
                        <span className="meta-line">거주 구 {entry.record.district}</span>
                      )}
                      {entry.record.job && (
                        <span className="meta-line">직업 {entry.record.job}</span>
                      )}
                      {entry.record.notes && (
                        <span className="note-line">{entry.record.notes}</span>
                      )}
                    </li>
                  ))
              ) : (
                <li className="calendar-empty-item">예약된 일정이 없습니다.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

