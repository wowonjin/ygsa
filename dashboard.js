const ADMIN_ID = 'admin'
      const ADMIN_PASSWORD = 'admin'
      const AUTH_STORAGE_KEY = 'ygsa_admin_auth'
      const AUTH_DURATION_MS = 60 * 60 * 1000
      const authOverlay = document.getElementById('authOverlay')
      const authForm = document.getElementById('authForm')
      const authIdInput = document.getElementById('authId')
      const authPasswordInput = document.getElementById('authPassword')
      const authErrorEl = document.getElementById('authError')
      const appContentEl = document.getElementById('appContent')
      let isAuthenticated = false
      let appInitialized = false

      function initializeApp() {
        if (appInitialized) return
        appInitialized = true
        updateStats()
        loadData()
        setupSSE()
      }

      function recordAuthentication() {
        try {
          const expiresAt = Date.now() + AUTH_DURATION_MS
          localStorage.setItem(AUTH_STORAGE_KEY, String(expiresAt))
        } catch (error) {
          console.warn('[auth] 세션 저장 실패', error)
        }
      }

      function hasValidSession() {
        try {
          const raw = localStorage.getItem(AUTH_STORAGE_KEY)
          if (!raw) return false
          const expiresAt = Number(raw)
          if (!Number.isFinite(expiresAt)) return false
          if (Date.now() >= expiresAt) {
            localStorage.removeItem(AUTH_STORAGE_KEY)
            return false
          }
          return true
        } catch (error) {
          console.warn('[auth] 세션 확인 실패', error)
          return false
        }
      }

      function unlockApp() {
        isAuthenticated = true
        if (authOverlay) {
          authOverlay.classList.add('hidden')
          setTimeout(() => authOverlay?.setAttribute('hidden', ''), 260)
        }
        if (appContentEl) {
          appContentEl.hidden = false
        }
        document.body.classList.remove('auth-locked')
        recordAuthentication()
        initializeApp()
      }

      if (authForm) {
        authForm.addEventListener('submit', (event) => {
          event.preventDefault()
          const id = authIdInput?.value.trim()
          const pw = authPasswordInput?.value || ''
          if (id === ADMIN_ID && pw === ADMIN_PASSWORD) {
            if (authErrorEl) authErrorEl.hidden = true
            unlockApp()
          } else {
            if (authErrorEl) {
              authErrorEl.hidden = false
              authErrorEl.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.'
            }
            authPasswordInput?.focus()
            authPasswordInput?.select?.()
          }
        })
        authIdInput?.focus()
      }

      function applyVariantDecor() {
        const config = variantCopy
        if (document.body) {
          document.body.dataset.appVariant = APP_VARIANT
        }
        if (pageHeadingEl) pageHeadingEl.textContent = config.heading
        if (statsSectionLabelEl) statsSectionLabelEl.textContent = config.sectionLabel
        if (variantSwitchBtn) {
          variantSwitchBtn.textContent = config.switchLabel
          variantSwitchBtn.href = config.switchHref
          variantSwitchBtn.setAttribute('aria-label', config.switchAria)
        }
        if (emptyEl) emptyEl.textContent = config.emptyState
        if (toastEl) toastEl.textContent = config.newToast
        if (schedulerTitleEl) schedulerTitleEl.textContent = config.schedulerTitle
        if (schedulerSubtitleEl) schedulerSubtitleEl.textContent = config.schedulerSubtitle
        if (calendarModalTitle) calendarModalTitle.textContent = config.calendarTitle
        document.title = config.title
      }

      function openStickyNote() {
        if (!stickyNoteEl) return
        if (stickyNoteHideTimer) {
          clearTimeout(stickyNoteHideTimer)
          stickyNoteHideTimer = null
        }
        stickyNoteEl.hidden = false
        requestAnimationFrame(() => stickyNoteEl.classList.add('visible'))
        noteToggleBtn?.setAttribute('aria-expanded', 'true')
      }

      function closeStickyNote() {
        if (!stickyNoteEl || stickyNoteEl.hidden) return
        stickyNoteEl.classList.remove('visible')
        noteToggleBtn?.setAttribute('aria-expanded', 'false')
        stickyNoteHideTimer = window.setTimeout(() => {
          stickyNoteEl.hidden = true
          stickyNoteHideTimer = null
        }, 180)
      }

      const HOSTNAME = window.location && window.location.hostname
      const IS_LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/i.test(HOSTNAME || '')
      const DEFAULT_BACKEND_ORIGIN = IS_LOCAL_HOST
        ? 'http://localhost:5000'
        : 'https://ygsa-backend.onrender.com'
      const BACKEND_ORIGIN_RAW = (window.BACKEND_ORIGIN || '').trim()
      const BACKEND_ORIGIN = (BACKEND_ORIGIN_RAW || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, '')
      const API_BASE_URL = BACKEND_ORIGIN
      const API_URL = `${API_BASE_URL}/api/consult`
      const API_IMPORT_URL = `${API_BASE_URL}/api/consult/import`
      const EVENTS_URL = `${API_BASE_URL}/events`
      if (!BACKEND_ORIGIN_RAW) {
        console.info(`[ygsa] BACKEND_ORIGIN 미설정 – 기본값 ${API_BASE_URL} 사용`)
      }
      const cardsEl = document.getElementById('cardsContainer')
      const emptyEl = document.getElementById('emptyState')
      const exportBtn = document.getElementById('exportBtn')
      const importBtn = document.getElementById('importBtn')
      const excelInput = document.getElementById('excelInput')
      const deleteSelectedBtn = document.getElementById('deleteSelectedBtn')
      const selectionInfoEl = document.getElementById('selectionInfo')
      const bulkActionBar = document.getElementById('bulkActionBar')
      const toastEl = document.getElementById('toast')
      const statTotalEl = document.getElementById('statTotal')
      const statMonthlyEl = document.getElementById('statMonthly')
      const statWeeklyEl = document.getElementById('statWeekly')
      const statDailyEl = document.getElementById('statDaily')
      const statsSectionLabelEl = document.getElementById('statsSectionLabel')
      const variantSwitchBtn = document.getElementById('variantSwitchBtn')
      const schedulerTitleEl = document.getElementById('schedulerTitle')
      const schedulerSubtitleEl = document.getElementById('schedulerSubtitle')
      const schedulerTotalEl = document.getElementById('schedulerTotal')
      const schedulerGridEl = document.getElementById('schedulerGrid')
      const pageHeadingEl = document.getElementById('pageHeading')
      const noteToggleBtn = document.getElementById('noteToggleBtn')
      const stickyNoteEl = document.getElementById('stickyNote')
      const stickyNoteCloseBtn = document.getElementById('stickyNoteCloseBtn')
      const calendarScrollBtn = document.getElementById('calendarScrollBtn')
      const calendarModal = document.getElementById('calendarModal')
      const calendarModalTitle = document.getElementById('calendarModalTitle')
      const calendarCloseBtn = document.getElementById('calendarCloseBtn')
      const calendarPrevBtn = document.getElementById('calendarPrevBtn')
      const calendarNextBtn = document.getElementById('calendarNextBtn')
      const calendarTodayBtn = document.getElementById('calendarTodayBtn')
      const calendarCurrentMonthEl = document.getElementById('calendarCurrentMonth')
      const calendarSelectedTitleEl = document.getElementById('calendarSelectedTitle')
      const calendarAppointmentList = document.getElementById('calendarAppointmentList')
      const calendarGrid = document.getElementById('calendarGrid')
      const weeklySummaryBtn = document.getElementById('weeklySummaryBtn')
      const weeklyModal = document.getElementById('weeklyModal')
      const weeklyCloseBtn = document.getElementById('weeklyCloseBtn')
      const weeklySummaryList = document.getElementById('weeklySummaryList')
      const weekFilterBtn = document.getElementById('weekFilterBtn')
      const weekFilterLabel = document.getElementById('weekFilterLabel')
      const weeklyDesc = weeklyModal ? weeklyModal.querySelector('.weekly-desc') : null
      const APP_VARIANT = (document.body?.dataset?.appVariant || 'consult').toLowerCase()
      const IS_MOIM_VIEW = APP_VARIANT === 'moim'
      const FORM_TYPE_DEFAULT = 'consult'
      const FORM_TYPE_MOIM = 'moim'
      const MOIM_INDICATOR_KEYS = [
        'workStyle',
        'relationshipStatus',
        'participationGoal',
        'socialEnergy',
        'weekendPreference',
      ]
      const SCHEDULER_DAY_WINDOW = 7
      const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
      const DAY_MS = 24 * 60 * 60 * 1000
      const WEEK_SUMMARY_DESC = '최근 8주 신청 인원을 확인하세요.'
      const WEEK_PICKER_DESC = '주차를 선택하면 해당 주차 신청 목록이 표시됩니다.'
      const VARIANT_CONFIG = {
        consult: {
          key: 'consult',
          title: '연결사 회원 정보 관리',
          heading: '연결사 상담 센터',
          sectionLabel: '연결사 관리자 센터',
          switchLabel: '연결사 모임',
          switchHref: 'index2.html',
          switchAria: '연결사 모임 대시보드로 이동',
          emptyState: '아직 접수된 상담 신청이 없습니다.',
          newToast: '새로운 상담 신청이 도착했습니다!',
          importToast: '엑셀 데이터가 반영되었습니다.',
          schedulerTitle: '상담 스케줄러',
          schedulerSubtitle: '최근 7일 상담 신청 흐름',
          counterUnit: '상담',
          calendarTitle: '대면 상담 캘린더',
          stats: {
            total: '총 상담 인원',
            monthly: '월간 상담 인원',
            weekly: '주간 상담 인원',
            daily: '오늘 상담 인원',
          },
          cardFields: [
            { label: '연락처', key: 'phone', formatter: formatPhoneNumber },
            { label: '성별', key: 'gender' },
            { label: '생년(생일)', key: 'birth' },
            { label: '최종학력', key: 'education' },
            { label: '직업', key: 'job' },
            { label: '신장', key: 'height' },
            { label: 'MBTI', key: 'mbti' },
            { label: '연봉', key: 'salaryRange', formatter: formatSalaryRange },
            { label: '거주 구', key: 'district' },
          ],
        },
        moim: {
          key: 'moim',
          title: '연결사 모임 신청 관리',
          heading: '연결사 모임 센터',
          sectionLabel: '연결사 모임 센터',
          switchLabel: '관리자 센터',
          switchHref: 'index.html',
          switchAria: '상담 관리자 대시보드로 이동',
          emptyState: '아직 접수된 모임 신청이 없습니다.',
          newToast: '새로운 모임 신청이 도착했습니다!',
          importToast: '모임 신청 데이터가 갱신되었습니다.',
          schedulerTitle: '모임 스케줄러',
          schedulerSubtitle: '최근 7일 모임 신청 흐름',
          counterUnit: '모임',
          calendarTitle: '모임 캘린더',
          stats: {
            total: '총 신청 인원',
            monthly: '월간 신청 인원',
            weekly: '주간 신청 인원',
            daily: '오늘 신청 인원',
          },
          cardFields: [
            { label: '연락처', key: 'phone', formatter: formatPhoneNumber },
            { label: '성별', key: 'gender' },
            { label: '출생년도', key: 'birth' },
            { label: '최종학력', key: 'education' },
            { label: '직업', key: 'job' },
            { label: '신장', key: 'height' },
            { label: '거주 구', key: 'district' },
            { label: '근무 형태', key: 'workStyle' },
            { label: '연애 상태', key: 'relationshipStatus' },
            { label: '참여 목적', key: 'participationGoal' },
            { label: '새 사람 만남', key: 'socialEnergy' },
            { label: '주말 스타일', key: 'weekendPreference' },
          ],
        },
      }
      const variantCopy = VARIANT_CONFIG[APP_VARIANT] || VARIANT_CONFIG.consult
      applyVariantDecor()
      const searchInput = document.getElementById('searchInput')
      const genderFilter = document.getElementById('genderFilter')
      const heightFilter = document.getElementById('heightFilter')
      const sortSelect = document.getElementById('sortSelect')
      const detailModal = document.getElementById('detailModal')
      const detailForm = document.getElementById('detailForm')
      const detailCancelBtn = document.getElementById('detailCancelBtn')
      const detailTitleEl = document.getElementById('detailTitle')
      const detailSubtitleEl = document.getElementById('detailSubtitle')
      const detailNameInput = document.getElementById('detailName')
      const detailPhoneInput = document.getElementById('detailPhone')
      const detailGenderSelect = document.getElementById('detailGender')
      const detailBirthInput = document.getElementById('detailBirth')
      const detailHeightInput = document.getElementById('detailHeight')
      const detailEducationSelect = document.getElementById('detailEducation')
      const detailJobInput = document.getElementById('detailJob')
      const detailDistrictInput = document.getElementById('detailDistrict')
      const detailMbtiInput = document.getElementById('detailMbti')
      const detailUniversityInput = document.getElementById('detailUniversity')
      const detailSalaryRangeSelect = document.getElementById('detailSalaryRange')
      const detailJobDetailInput = document.getElementById('detailJobDetail')
      const detailProfileAppealInput = document.getElementById('detailProfileAppeal')
      const detailSmokingSelect = document.getElementById('detailSmoking')
      const detailReligionSelect = document.getElementById('detailReligion')
      const detailLongDistanceSelect = document.getElementById('detailLongDistance')
      const detailDinkSelect = document.getElementById('detailDink')
      const detailLastRelationshipInput = document.getElementById('detailLastRelationship')
      const detailMarriageTimingSelect = document.getElementById('detailMarriageTiming')
      const detailRelationshipCountSelect = document.getElementById('detailRelationshipCount')
      const detailCarOwnershipSelect = document.getElementById('detailCarOwnership')
      const detailTattooSelect = document.getElementById('detailTattoo')
      const detailDivorceStatusSelect = document.getElementById('detailDivorceStatus')
      const detailPreferredHeightsSelect = document.getElementById('detailPreferredHeights')
      const detailPreferredAgesSelect = document.getElementById('detailPreferredAges')
      const detailPreferredLifestyleSelect = document.getElementById('detailPreferredLifestyle')
      const detailPreferredAppearanceSelect = document.getElementById('detailPreferredAppearance')
      const detailSufficientConditionInput = document.getElementById('detailSufficientCondition')
      const detailNecessaryConditionInput = document.getElementById('detailNecessaryCondition')
      const detailLikesDislikesInput = document.getElementById('detailLikesDislikes')
      const detailValuesSelect = document.getElementById('detailValues')
      const detailValuesCustomInput = document.getElementById('detailValuesCustom')
      const detailAboutMeInput = document.getElementById('detailAboutMe')
      const detailPhoneStatusEl = document.getElementById('detailPhoneStatus')
      const detailDateInput = document.getElementById('detailDate')
      const detailTimeSelect = document.getElementById('detailTime')
      const detailClearScheduleBtn = document.getElementById('detailClearSchedule')
      const detailNotesInput = document.getElementById('detailNotes')
      const moimDetailView = document.getElementById('moimDetailView')
      const detailScheduleInfo = document.getElementById('detailScheduleInfo')
      const detailAttachmentsSection = document.getElementById('detailAttachmentsSection')
      const detailIdCardItem = document.getElementById('detailIdCardItem')
      const detailIdCardLink = document.getElementById('detailIdCardLink')
      const detailEmploymentItem = document.getElementById('detailEmploymentItem')
      const detailEmploymentLink = document.getElementById('detailEmploymentLink')
      const detailPhotosItem = document.getElementById('detailPhotosItem')
      const detailPhotosGrid = document.getElementById('detailPhotosGrid')
      const detailDraftLoadBtn = document.getElementById('detailDraftLoadBtn')
      const detailSectionButtons = Array.from(
        document.querySelectorAll('[data-detail-section-target]')
      )
      const detailSections = Array.from(document.querySelectorAll('[data-detail-section]'))
      const attachmentsTabButton = document.querySelector(
        '[data-detail-section-target="attachments"]'
      )
      const DRAFT_STORAGE_KEY = 'alphaProfileDraft_v1'
      const DRAFT_STORAGE_PREFIX = `${DRAFT_STORAGE_KEY}:`
      let currentDraftData = null
      let stickyNoteHideTimer = null
      let items = []
      const selectedIds = new Set()
      let suppressDeleteToast = false
      let suppressUpdateToast = false
      let detailRecordId = null
      let depositStatusUpdating = false
      let activeDetailSectionId = null
      const viewState = {
        search: '',
        gender: 'all',
        height: 'all',
        sort: 'latest',
        weekRange: IS_MOIM_VIEW ? getCurrentWeekRange() : null,
      }
      if (IS_MOIM_VIEW) {
        updateWeekFilterLabel()
      } else {
        if (weekFilterBtn) {
          weekFilterBtn.hidden = true
        }
        if (weekFilterLabel) {
          weekFilterLabel.hidden = true
        }
      }
      initializeDetailSectionTabs()
      const calendarState = {
        current: new Date(),
        selectedDate: '',
      }
      const PHONE_STATUS_VALUES = ['pending', 'scheduled', 'done']
      const PHONE_STATUS_LABELS = {
        pending: '상담 전',
        scheduled: '상담 예정',
        done: '상담 완료',
      }
      const STATUS_CLASS_NAMES = {
        pending: 'status-before',
        scheduled: 'status-scheduled',
        done: 'status-complete',
      }
      const DEPOSIT_STATUS_VALUES = ['pending', 'completed']
      const DEPOSIT_STATUS = {
        pending: 'pending',
        completed: 'completed',
      }
      const DEPOSIT_STATUS_LABELS = {
        pending: '입금 전',
        completed: '입금 완료',
      }
      const DEPOSIT_STATUS_CLASS_NAMES = {
        pending: 'deposit-status-pending',
        completed: 'deposit-status-completed',
      }
      const TIME_SLOT_START_HOUR = 9
      const TIME_SLOT_END_HOUR = 21
      const TIME_SLOT_INTERVAL_MINUTES = 15
      const SALARY_RANGE_LABELS = {
        '1': '3000만원 미만',
        '2': '3000-4000만원',
        '3': '4000-6000만원',
        '4': '6000-8000만원',
        '5': '8000-1억원',
        '6': '1억-2억원',
        '7': '2억-3억원',
        '8': '3억원 이상',
      }
      function hasMoimIndicatorsLocal(record) {
        if (!record || typeof record !== 'object') return false
        return MOIM_INDICATOR_KEYS.some((key) => {
          const value = record[key]
          return typeof value === 'string' && value.trim()
        })
      }

      function getRecordFormType(record) {
        if (!record || typeof record !== 'object') return FORM_TYPE_DEFAULT
        const raw = typeof record.formType === 'string' ? record.formType.trim().toLowerCase() : ''
        if (raw === FORM_TYPE_MOIM) return FORM_TYPE_MOIM
        if (hasMoimIndicatorsLocal(record)) return FORM_TYPE_MOIM
        return FORM_TYPE_DEFAULT
      }

      function matchesVariant(record) {
        const type = getRecordFormType(record)
        return IS_MOIM_VIEW ? type === FORM_TYPE_MOIM : type !== FORM_TYPE_MOIM
      }

      function filterByVariant(list) {
        return (list || []).filter((item) => matchesVariant(item))
      }
      let detailValuesSelection = []
      function syncCheckboxGroupFromSelect(selectEl) {
        if (!selectEl || !selectEl.id) return
        const group = document.querySelector(`[data-multi-select="${selectEl.id}"]`)
        if (!group) return
        const selectedValues = new Set(
          Array.from(selectEl.options || [])
            .filter((option) => option.selected)
            .map((option) => option.value)
        )
        Array.from(group.querySelectorAll('input[type="checkbox"]')).forEach((checkbox) => {
          checkbox.checked = selectedValues.has(checkbox.value)
        })
      }

      function handleMultiSelectCheckboxChange(event) {
        const checkbox = event.target
        if (!checkbox || checkbox.type !== 'checkbox') return
        const group = checkbox.closest('[data-multi-select]')
        if (!group) return
        const targetId = group.dataset.multiSelect
        if (!targetId) return
        const selectEl = document.getElementById(targetId)
        if (!selectEl) return
        Array.from(selectEl.options || []).forEach((option) => {
          if (option.value === checkbox.value) {
            option.selected = checkbox.checked
          }
        })
        selectEl.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const multiSelectCheckboxGroups = Array.from(document.querySelectorAll('[data-multi-select]'))
      multiSelectCheckboxGroups.forEach((group) => {
        group.addEventListener('change', handleMultiSelectCheckboxChange)
        const targetId = group.dataset.multiSelect
        const selectEl = targetId ? document.getElementById(targetId) : null
        if (selectEl) {
          syncCheckboxGroupFromSelect(selectEl)
        }
      })

      exportBtn.addEventListener('click', exportToExcel)
      importBtn.addEventListener('click', () => excelInput.click())
      excelInput.addEventListener('change', handleExcelImport)
      deleteSelectedBtn.addEventListener('click', handleDeleteSelected)
      cardsEl.addEventListener('change', handleCardChange)
      cardsEl.addEventListener('click', handleCardButtonClick)
      moimDetailView?.addEventListener('click', handleDepositActionClick)
      detailCancelBtn.addEventListener('click', (event) => {
        event.preventDefault()
        closeDetailModal()
      })
      detailModal.addEventListener('click', (event) => {
        if (event.target === detailModal) {
          closeDetailModal()
        }
      })
      detailForm.addEventListener('submit', handleDetailSubmit)
      detailDateInput.addEventListener('change', handleDetailDateChange)
      detailTimeSelect.addEventListener('change', handleDetailTimeChange)
      detailClearScheduleBtn.addEventListener('click', handleClearSchedule)
      if (detailValuesSelect) {
        detailValuesSelect.addEventListener('change', () =>
          enforceMultiSelectLimit(detailValuesSelect, 1),
        )
      }
      detailDraftLoadBtn?.addEventListener('click', () => {
        if (!currentDraftData) {
          showToast('불러올 임시 데이터가 없습니다.')
          return
        }
        applyDraftToDetailForm(currentDraftData)
      })
      noteToggleBtn?.addEventListener('click', () => {
        if (!stickyNoteEl) return
        if (stickyNoteEl.hidden || !stickyNoteEl.classList.contains('visible')) {
          openStickyNote()
        } else {
          closeStickyNote()
        }
      })
      stickyNoteCloseBtn?.addEventListener('click', closeStickyNote)
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return
        if (weeklyModal && !weeklyModal.hidden) {
          closeWeeklyModal()
          return
        }
        if (!detailModal.hidden) {
          closeDetailModal()
          return
        }
        if (stickyNoteEl && stickyNoteEl.classList.contains('visible')) {
          closeStickyNote()
        }
      })
      if (detailBirthInput) {
        detailBirthInput.addEventListener('input', () => {
          detailBirthInput.value = detailBirthInput.value.replace(/[^0-9년]/g, '')
        })
      }
      if (detailPhoneInput) {
        detailPhoneInput.addEventListener('input', () => {
          let v = detailPhoneInput.value.replace(/[^0-9]/g, '')
          if (v.length < 4) {
            detailPhoneInput.value = v
            return
          }
          if (v.length < 8) {
            detailPhoneInput.value = v.replace(/(\d{3})(\d+)/, '$1-$2')
            return
          }
          detailPhoneInput.value = v.replace(/(\d{3})(\d{3,4})(\d{0,4}).*/, '$1-$2-$3')
        })
      }
      if (detailHeightInput) {
        const formatDetailHeight = () => {
          const digits = detailHeightInput.value.replace(/[^0-9]/g, '').slice(0, 3)
          if (!digits) {
            detailHeightInput.value = ''
            return
          }
          const formatted = `${digits}cm`
          detailHeightInput.value = formatted
          if (document.activeElement === detailHeightInput) {
            const caretPos = digits.length
            requestAnimationFrame(() => {
              detailHeightInput.setSelectionRange(caretPos, caretPos)
            })
          }
        }
        detailHeightInput.addEventListener('focus', () => {
          const digits = detailHeightInput.value.replace(/[^0-9]/g, '').slice(0, 3)
          detailHeightInput.value = digits
          requestAnimationFrame(() => {
            const pos = detailHeightInput.value.length
            detailHeightInput.setSelectionRange(pos, pos)
          })
        })
        detailHeightInput.addEventListener('input', formatDetailHeight)
        detailHeightInput.addEventListener('blur', formatDetailHeight)
      }
      if (calendarScrollBtn) {
        calendarScrollBtn.addEventListener('click', () => openCalendarModal(true))
      }
      calendarCloseBtn.addEventListener('click', closeCalendarModal)
      calendarPrevBtn.addEventListener('click', () => changeCalendarMonth(-1))
      calendarNextBtn.addEventListener('click', () => changeCalendarMonth(1))
      calendarTodayBtn.addEventListener('click', () => goToToday())
      calendarModal.addEventListener('click', (event) => {
        if (event.target === calendarModal) closeCalendarModal()
      })
      calendarGrid.addEventListener('click', handleCalendarDayClick)
      calendarAppointmentList.addEventListener('click', handleCalendarAppointmentClick)
      weeklySummaryBtn?.addEventListener('click', () => openWeeklyModal('summary'))
      weeklyCloseBtn?.addEventListener('click', closeWeeklyModal)
      weeklyModal?.addEventListener('click', (event) => {
        if (event.target === weeklyModal) closeWeeklyModal()
      })
      weekFilterBtn?.addEventListener('click', () => {
        if (!IS_MOIM_VIEW) return
        openWeeklyModal('picker')
      })
      weeklySummaryList?.addEventListener('click', handleWeeklySummaryClick)
      searchInput.addEventListener('input', (event) => {
        viewState.search = event.target.value.trim()
        render()
      })
      genderFilter.addEventListener('change', (event) => {
        viewState.gender = event.target.value
        render()
      })
      if (heightFilter) {
        heightFilter.addEventListener('change', (event) => {
          viewState.height = event.target.value
          render()
        })
      }
      sortSelect.addEventListener('change', (event) => {
        viewState.sort = event.target.value
        render()
      })
      updateSelectionInfo()

      async function loadData() {
        try {
          const res = await fetch(API_URL)
          const body = await res.json()
          if (!body?.ok) throw new Error(body?.message || '데이터 오류')
          items = filterByVariant((body.data || []).map(normalizeRecord))
          syncSelectionWithItems()
          syncFilterOptions()
          updateStats()
          render()
          if (!calendarModal.hidden) {
            refreshCalendar(true)
          }
        } catch (error) {
          console.error(error)
          showToast('데이터를 불러오는데 실패했습니다.')
        }
      }

      function updateStats() {
        if (!statTotalEl || !statMonthlyEl || !statWeeklyEl || !statDailyEl) return
        const now = new Date()
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const startOfWeek = new Date(startOfDay)
        const weekDay = (startOfDay.getDay() + 6) % 7
        startOfWeek.setDate(startOfDay.getDate() - weekDay)
        const total = items.length
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
        statTotalEl.textContent = formatLabeledCount(variantCopy.stats.total, total)
        statMonthlyEl.textContent = formatLabeledCount(variantCopy.stats.monthly, monthly)
        statWeeklyEl.textContent = formatLabeledCount(variantCopy.stats.weekly, weekly)
        statDailyEl.textContent = formatLabeledCount(variantCopy.stats.daily, daily)
        updateScheduler()
      }

      function updateScheduler() {
        if (!schedulerGridEl || !schedulerTotalEl) return
        schedulerTotalEl.textContent = `${Number(items.length || 0).toLocaleString('ko-KR')}명`
        const buckets = buildSchedulerBuckets(items, SCHEDULER_DAY_WINDOW)
        schedulerGridEl.innerHTML = ''
        buckets.forEach((bucket) => {
          const card = document.createElement('div')
          card.className = 'scheduler-card'
          if (bucket.isToday) card.classList.add('is-today')
          card.innerHTML = `
            <div class="scheduler-date">
              <span>${bucket.weekday}</span>
              <strong>${bucket.label}</strong>
            </div>
            <div class="scheduler-count">
              <span>${bucket.count.toLocaleString('ko-KR')}</span>
              <small>${variantCopy.counterUnit} 신청</small>
            </div>
          `
          schedulerGridEl.appendChild(card)
        })
      }

      function renderWeeklySummary() {
        if (!weeklySummaryList) return
        const summary = buildWeeklySummary(items, 8)
        if (!summary.length) {
          weeklySummaryList.innerHTML =
            '<li class="weekly-empty">최근 주차별 신청 데이터가 없습니다.</li>'
          return
        }
        const maxCount = Math.max(...summary.map((entry) => entry.count))
        const isPickerMode = (weeklyModal?.dataset.mode || 'summary') === 'picker'
        weeklySummaryList.innerHTML = summary
          .map((entry) => {
            const width = maxCount ? Math.round((entry.count / maxCount) * 100) : 0
            const isActive = isSameWeekRange(viewState.weekRange, entry.startTime, entry.endTime)
            const classes = ['weekly-item']
            if (isPickerMode) classes.push('is-selectable')
            if (isActive) classes.push('is-active')
            return `
              <li
                class="${classes.join(' ')}"
                data-week-start="${entry.startTime}"
                data-week-end="${entry.endTime}"
                data-week-label="${escapeHtml(entry.label)}"
                data-week-range="${escapeHtml(entry.rangeLabel)}"
              >
                <div class="weekly-row">
                  <div>
                    <strong>${escapeHtml(entry.label)}</strong>
                    <span>${escapeHtml(entry.rangeLabel)}</span>
                  </div>
                  <span class="weekly-count">${entry.count.toLocaleString('ko-KR')}명</span>
                </div>
                <div class="weekly-bar">
                  <span style="width:${width}%"></span>
                </div>
              </li>
            `
          })
          .join('')
      }

      function buildWeeklySummary(source, limit = 8) {
        const list = Array.isArray(source) ? source : []
        const map = new Map()
        list.forEach((item) => {
          if (!item?.createdAt) return
          const date = new Date(item.createdAt)
          if (Number.isNaN(date.getTime())) return
          const info = getWeekInfo(date)
          const key = `${info.year}-W${String(info.week).padStart(2, '0')}`
          if (!map.has(key)) {
            const startClone = new Date(info.start)
            startClone.setHours(0, 0, 0, 0)
            const endExclusive = new Date(startClone)
            endExclusive.setDate(startClone.getDate() + 7)
            map.set(key, {
              key,
              year: info.year,
              week: info.week,
              label: info.label,
              rangeLabel: formatWeekRange(info.start, info.end),
              startTime: startClone.getTime(),
              endTime: endExclusive.getTime(),
              count: 0,
            })
          }
          map.get(key).count += 1
        })
        const summary = Array.from(map.values()).sort((a, b) => {
          if (a.year === b.year) return b.week - a.week
          return b.year - a.year
        })
        return summary.slice(0, limit)
      }

      function getWeekInfo(date) {
        const target = new Date(date)
        const day = target.getDay() || 7
        const start = new Date(target)
        start.setHours(0, 0, 0, 0)
        start.setDate(start.getDate() - (day - 1))
        const end = new Date(start)
        end.setDate(start.getDate() + 6)

        const utcDate = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()))
        const utcDay = utcDate.getUTCDay() || 7
        utcDate.setUTCDate(utcDate.getUTCDate() + 4 - utcDay)
        const isoYear = utcDate.getUTCFullYear()
        const yearStart = new Date(Date.UTC(isoYear, 0, 1))
        const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7)

        return {
          year: isoYear,
          week: weekNo,
          label: `${isoYear}년 ${String(weekNo).padStart(2, '0')}주차`,
          start,
          end,
        }
      }

      function formatWeekRange(start, end) {
        if (!start || !end) return ''
        const format = (date) =>
          `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
        return `${format(start)} ~ ${format(end)}`
      }

      function getCurrentWeekRange() {
        return buildWeekRangeFromInfo(getWeekInfo(new Date()))
      }

      function buildWeekRangeFromInfo(info) {
        if (!info) return null
        const start = new Date(info.start)
        start.setHours(0, 0, 0, 0)
        const endExclusive = new Date(start)
        endExclusive.setDate(start.getDate() + 7)
        return {
          start,
          end: endExclusive,
          label: info.label,
          rangeLabel: formatWeekRange(info.start, info.end),
        }
      }

      function setWeekRange(range, options = {}) {
        if (!IS_MOIM_VIEW) return
        if (!range) {
          viewState.weekRange = null
        } else {
          const start = new Date(range.start)
          start.setHours(0, 0, 0, 0)
          const end = new Date(range.end)
          end.setHours(0, 0, 0, 0)
          viewState.weekRange = {
            start,
            end,
            label: range.label || '',
            rangeLabel: range.rangeLabel || '',
          }
        }
        updateWeekFilterLabel()
        render()
        if (!calendarModal.hidden) {
          refreshCalendar(true)
        }
        if (!options?.suppressClose) {
          closeWeeklyModal()
        }
      }

      function updateWeekFilterLabel() {
        if (!weekFilterLabel) return
        if (!IS_MOIM_VIEW) {
          weekFilterLabel.textContent = ''
          return
        }
        if (!viewState.weekRange) {
          weekFilterLabel.textContent = '전체 기간'
          return
        }
        const label = viewState.weekRange.label || '선택된 주차'
        const rangeLabel =
          viewState.weekRange.rangeLabel ||
          formatWeekRange(
            viewState.weekRange.start,
            new Date(viewState.weekRange.end.getTime() - DAY_MS),
          )
        weekFilterLabel.textContent = `${label} · ${rangeLabel}`
      }

      function handleWeeklySummaryClick(event) {
        if (!weeklyModal || weeklyModal.hidden) return
        if ((weeklyModal.dataset.mode || 'summary') !== 'picker') return
        const itemEl = event.target.closest('.weekly-list li.is-selectable')
        if (!itemEl) return
        const startTime = Number(itemEl.dataset.weekStart)
        const endTime = Number(itemEl.dataset.weekEnd)
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return
        const label = itemEl.dataset.weekLabel || ''
        const rangeLabel = itemEl.dataset.weekRange || ''
        setWeekRange(
          {
            start: new Date(startTime),
            end: new Date(endTime),
            label,
            rangeLabel,
          },
          { suppressClose: false },
        )
      }

      function isSameWeekRange(range, startTime, endTime) {
        if (!range) return false
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return false
        return (
          range.start.getTime() === startTime &&
          range.end.getTime() === endTime
        )
      }

      function openWeeklyModal(mode = 'summary') {
        if (!weeklyModal) return
        weeklyModal.dataset.mode = mode
        if (weeklyDesc) {
          weeklyDesc.textContent =
            mode === 'picker' ? WEEK_PICKER_DESC : WEEK_SUMMARY_DESC
        }
        renderWeeklySummary()
        weeklyModal.hidden = false
      }

      function closeWeeklyModal() {
        if (!weeklyModal) return
        weeklyModal.hidden = true
        weeklyModal.dataset.mode = 'summary'
      }

      function refreshWeeklySummaryIfOpen() {
        if (!weeklyModal || weeklyModal.hidden) return
        renderWeeklySummary()
      }

      function buildSchedulerBuckets(source, days) {
        const list = Array.isArray(source) ? source : []
        const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : SCHEDULER_DAY_WINDOW
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const buckets = []
        for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
          const start = new Date(today)
          start.setDate(today.getDate() - offset)
          const end = new Date(start)
          end.setDate(start.getDate() + 1)
          const count = countRecordsInRange(list, start, end)
          buckets.push({
            label: `${start.getMonth() + 1}/${start.getDate()}`,
            weekday: WEEKDAY_LABELS[start.getDay()],
            count,
            isToday: offset === 0,
          })
        }
        return buckets
      }

      function countRecordsInRange(list, start, end) {
        if (!Array.isArray(list) || !start || !end) return 0
        const startTime = start.getTime()
        const endTime = end.getTime()
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0
        return list.reduce((acc, item) => {
          if (!item?.createdAt) return acc
          const created = new Date(item.createdAt).getTime()
          if (Number.isNaN(created)) return acc
          if (created >= startTime && created < endTime) {
            return acc + 1
          }
          return acc
        }, 0)
      }

      function formatLabeledCount(label, value) {
        return `${label}: ${Number(value || 0).toLocaleString('ko-KR')}명`
      }

      function getCardFieldDefs() {
        if (Array.isArray(variantCopy.cardFields) && variantCopy.cardFields.length) {
          return variantCopy.cardFields
        }
        return [
          { label: '연락처', key: 'phone', formatter: formatPhoneNumber },
          { label: '성별', key: 'gender' },
          { label: '생년(생일)', key: 'birth' },
          { label: '최종학력', key: 'education' },
          { label: '직업', key: 'job' },
          { label: '신장', key: 'height' },
          { label: 'MBTI', key: 'mbti' },
          { label: '연봉', key: 'salaryRange', formatter: formatSalaryRange },
          { label: '거주 구', key: 'district' },
        ]
      }

      function render() {
        cardsEl.innerHTML = ''
        const prepared = getPreparedItems()
        if (!prepared.length) {
          if (emptyEl) {
            emptyEl.textContent =
              IS_MOIM_VIEW && viewState.weekRange
                ? `${viewState.weekRange.label} 신청이 없습니다.`
                : variantCopy.emptyState
            emptyEl.hidden = false
          }
          return
        }
        emptyEl.hidden = true
        const fragment = document.createDocumentFragment()
        const cardFields = IS_MOIM_VIEW ? null : getCardFieldDefs()
        prepared.forEach((item) => {
          const card = IS_MOIM_VIEW ? renderMoimCard(item) : renderConsultCard(item, cardFields)
          fragment.appendChild(card)
        })
        cardsEl.appendChild(fragment)
        refreshWeeklySummaryIfOpen()
      }

      function renderConsultCard(item, cardFields = getCardFieldDefs()) {
        const card = document.createElement('article')
        card.className = 'card'
        card.dataset.id = item.id || ''
        const idAttr = escapeHtml(item.id || '')
        const isSelected = selectedIds.has(item.id)
        const entries = (cardFields || [])
          .map(({ label, key, formatter }) => {
            const value = formatter ? formatter(item[key], item) : item[key]
            return renderEntry(label, value)
          })
          .join('')
        card.innerHTML = `
          <div class="card-top">
            <div>
              <div class="card-title">
                <h2>${escapeHtml(item.name || '익명')}</h2>
                <span class="status-chip ${escapeHtml(getStatusClass(item.phoneConsultStatus))}">
                  ${escapeHtml(formatPhoneStatus(item.phoneConsultStatus))}
                </span>
              </div>
              <div class="meta">${formatDate(item.createdAt)} 접수</div>
            </div>
            <div class="card-controls">
              <input
                type="checkbox"
                class="select-checkbox"
                data-id="${idAttr}"
                ${isSelected ? 'checked' : ''}
                aria-label="상담 선택"
              />
            </div>
          </div>
          <dl>
            ${entries}
          </dl>
          ${renderCardAttachments(item)}
        `
        return card
      }

      function renderMoimCard(item) {
        const card = document.createElement('article')
        card.className = 'card moim-card'
        card.dataset.id = item.id || ''
        const idAttr = escapeHtml(item.id || '')
        const isSelected = selectedIds.has(item.id)
        const phoneLine = formatPhoneNumber(item.phone)
        const depositStatus = normalizeDepositStatusValue(item.depositStatus)
        const depositChip = `
          <span class="deposit-chip ${getDepositStatusClass(depositStatus)}">
            ${escapeHtml(formatDepositStatus(depositStatus))}
          </span>
        `
        const basicSection = buildMoimSection('기본 정보', [
          { label: '출생년도', value: item.birth },
          { label: '성별', value: item.gender },
          { label: '연락처', value: phoneLine },
          { label: '거주 구', value: item.district },
        ])
        const profileSection = buildMoimSection('프로필', [
          { label: '직업', value: item.job },
          { label: '대학교 / 학과', value: item.education },
        ])
        card.innerHTML = `
          <div class="moim-card-header">
            <div>
              <h2>${escapeHtml(item.name || '이름 미입력')}</h2>
              <div class="moim-card-meta-row">
                <span class="meta">${formatDate(item.createdAt)} 접수</span>
                ${depositChip}
              </div>
            </div>
            <div class="card-controls">
              <input
                type="checkbox"
                class="select-checkbox"
                data-id="${idAttr}"
                ${isSelected ? 'checked' : ''}
                aria-label="회원 선택"
              />
            </div>
          </div>
          ${basicSection}
          ${profileSection}
        `
        return card
      }

      function buildMoimSection(title, entries) {
        if (!entries || !entries.length) return ''
        return `
          <div class="moim-card-section">
            <h3>${escapeHtml(title)}</h3>
            <dl class="moim-card-list">
              ${entries.map(({ label, value }) => renderEntry(label, value)).join('')}
            </dl>
          </div>
        `
      }

      function renderMoimHeaderLine(values, className) {
        const text = (values || []).filter((value) => value && String(value).trim() !== '').join(' · ')
        if (!text) return ''
        return `<p class="${className}">${escapeHtml(text)}</p>`
      }

      function renderMoimConsents(item, options = {}) {
        const sectionClass = options.sectionClass || 'moim-card-section'
        const badgesClass = options.badgesClass || 'moim-card-badges'
        const consentDefs = [
          { key: 'rulesAgree', label: '모임 규칙' },
          { key: 'agree', label: '개인정보' },
          { key: 'refundAgree', label: '노쇼/환불' },
        ]
        const badges = consentDefs
          .map(({ key, label }) => {
            const isChecked = Boolean(item && item[key])
            return `
              <span class="consent-badge ${isChecked ? 'is-checked' : 'is-unchecked'}">
                ${escapeHtml(label)}
              </span>
            `
          })
          .join('')
        return `
          <div class="${sectionClass}">
            <h3>필수 동의</h3>
            <div class="${badgesClass}">
              ${badges}
            </div>
          </div>
        `
      }

      function renderMoimDepositControls(item) {
        const status = normalizeDepositStatusValue(item.depositStatus)
        const description =
          status === DEPOSIT_STATUS.completed
            ? '입금이 확인된 신청자입니다.'
            : '입금 확인 전 상태입니다.'
        const action = status === DEPOSIT_STATUS.completed ? DEPOSIT_STATUS.pending : DEPOSIT_STATUS.completed
        const actionLabel =
          status === DEPOSIT_STATUS.completed ? '입금 전으로 되돌리기' : '입금 완료 처리'
        const recordId = escapeHtml(item.id || '')
        return `
          <div class="moim-detail-section moim-deposit-section">
            <h3>입금 상태</h3>
            <div class="moim-deposit-status-row">
              <span class="deposit-chip ${getDepositStatusClass(status)}">
                ${escapeHtml(formatDepositStatus(status))}
              </span>
              <p>${escapeHtml(description)}</p>
            </div>
            <button
              type="button"
              class="deposit-action-btn"
              data-deposit-action="${action}"
              data-record-id="${recordId}"
            >
              ${escapeHtml(actionLabel)}
            </button>
          </div>
        `
      }

      function renderMoimDetailSection(title, entries) {
        if (!entries || !entries.length) return ''
        return `
          <div class="moim-detail-section">
            <h3>${escapeHtml(title)}</h3>
            <dl class="moim-detail-list">
              ${entries.map(({ label, value }) => renderEntry(label, value)).join('')}
            </dl>
          </div>
        `
      }

      function renderMoimDetailView(item) {
        if (!moimDetailView || !item) return
        const sections = [
          {
            title: '기본 정보',
            entries: [
              { label: '연락처', value: formatPhoneNumber(item.phone) },
              { label: '출생년도', value: item.birth },
              { label: '성별', value: item.gender },
              { label: '신장', value: item.height },
              { label: '거주 구', value: item.district },
            ],
          },
          {
            title: '학력 · 직업',
            entries: [
              { label: '대학교 / 학과', value: item.education },
              { label: '직업', value: item.job },
            ],
          },
          {
            title: '라이프스타일 & 참여 목적',
            entries: [
              { label: '근무 분야/형태', value: item.workStyle },
              { label: '현재 연애 상태', value: item.relationshipStatus },
              { label: '참여 목적', value: item.participationGoal },
              { label: '새로운 사람 만남', value: item.socialEnergy },
              { label: '주말 스타일', value: item.weekendPreference },
            ],
          },
        ]
        const content = sections.map(({ title, entries }) => renderMoimDetailSection(title, entries)).join('')
        const consentBlock = renderMoimConsents(item, {
          sectionClass: 'moim-detail-section',
          badgesClass: 'moim-detail-badges',
        })
        const depositControls = renderMoimDepositControls(item)
        const createdLine = item.createdAt ? `<p class="moim-detail-meta">신청 ${formatDate(item.createdAt)}</p>` : ''
        moimDetailView.innerHTML = `
          ${createdLine}
          ${depositControls}
          ${content}
          ${consentBlock}
        `
        moimDetailView.hidden = false
      }

      function getFirstAvailableDetailSection() {
        const targetButton = detailSectionButtons.find((button) => !button.disabled)
        return targetButton ? targetButton.dataset.detailSectionTarget : null
      }

      function setActiveDetailSection(sectionId) {
        if (!sectionId || !detailSections.length) return
        activeDetailSectionId = sectionId
        detailSections.forEach((section) => {
          const isMatch = section.dataset.detailSection === sectionId
          section.hidden = !isMatch
        })
        detailSectionButtons.forEach((button) => {
          const isActive = button.dataset.detailSectionTarget === sectionId
          button.classList.toggle('is-active', isActive)
          button.setAttribute('aria-selected', isActive ? 'true' : 'false')
        })
      }

      function resetDetailSectionTabs() {
        const fallback = getFirstAvailableDetailSection()
        if (fallback) {
          setActiveDetailSection(fallback)
        }
      }

      function toggleAttachmentsTab(hasAttachments) {
        if (!attachmentsTabButton) return
        attachmentsTabButton.disabled = !hasAttachments
        attachmentsTabButton.setAttribute('aria-disabled', hasAttachments ? 'false' : 'true')
        if (!hasAttachments && activeDetailSectionId === 'attachments') {
          resetDetailSectionTabs()
        }
      }

      function initializeDetailSectionTabs() {
        if (!detailSectionButtons.length || !detailSections.length) return
        detailSectionButtons.forEach((button) => {
          button.addEventListener('click', () => {
            if (button.disabled) return
            setActiveDetailSection(button.dataset.detailSectionTarget)
            if (detailForm) detailForm.scrollTop = 0
          })
        })
        resetDetailSectionTabs()
      }

      function openDetailModal(id) {
        const record = items.find((item) => item.id === id)
        if (!record) {
          showToast('상세 정보를 불러오지 못했습니다.')
          return
        }

        detailRecordId = id
        detailTitleEl.textContent = record.name || '상담 신청'
        const heightLine = record.height ? `신장 ${record.height}` : null
        const districtLine = record.district ? `거주 구 ${record.district}` : null
        const mbtiLine = record.mbti ? `MBTI ${record.mbti}` : null
        detailSubtitleEl.textContent = [
          record.phone ? `연락처 ${record.phone}` : null,
          record.job ? `직업 ${record.job}` : null,
          mbtiLine,
          heightLine,
          districtLine,
          record.createdAt ? `신청 ${formatDate(record.createdAt)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')

        if (IS_MOIM_VIEW) {
          renderMoimDetailView(record)
          detailModal.hidden = false
          document.body.classList.add('modal-open')
          if (detailForm) detailForm.scrollTop = 0
          return
        }

        const status = PHONE_STATUS_VALUES.includes(record.phoneConsultStatus)
          ? record.phoneConsultStatus
          : 'pending'
        detailPhoneStatusEl.value = status

        if (detailNameInput) detailNameInput.value = record.name || ''
        if (detailPhoneInput) detailPhoneInput.value = formatPhoneNumber(record.phone)
        setSelectValue(detailGenderSelect, record.gender || '')
        if (detailBirthInput) detailBirthInput.value = record.birth || ''
        if (detailHeightInput) detailHeightInput.value = normalizeHeightValue(
          record.height || record.region,
        )
        setSelectValue(detailEducationSelect, record.education || '')
        if (detailJobInput) detailJobInput.value = record.job || ''
        if (detailDistrictInput) detailDistrictInput.value = record.district || ''
        if (detailMbtiInput) detailMbtiInput.value = record.mbti || ''
        if (detailUniversityInput) detailUniversityInput.value = record.university || ''
        setSelectValue(detailSalaryRangeSelect, record.salaryRange || '')
        if (detailJobDetailInput) detailJobDetailInput.value = record.jobDetail || ''
        if (detailProfileAppealInput) detailProfileAppealInput.value = record.profileAppeal || ''
        setSelectValue(detailSmokingSelect, record.smoking || '')
        setSelectValue(detailReligionSelect, record.religion || '')
        setSelectValue(detailLongDistanceSelect, record.longDistance || '')
        setSelectValue(detailDinkSelect, record.dink || '')
        if (detailLastRelationshipInput)
          detailLastRelationshipInput.value = record.lastRelationship || ''
        setSelectValue(detailMarriageTimingSelect, record.marriageTiming || '')
        setSelectValue(detailRelationshipCountSelect, record.relationshipCount || '')
        setSelectValue(detailCarOwnershipSelect, record.carOwnership || '')
        setSelectValue(detailTattooSelect, record.tattoo || '')
        setSelectValue(detailDivorceStatusSelect, record.divorceStatus || '')
        setMultiSelectValues(detailPreferredHeightsSelect, record.preferredHeights || [])
        setMultiSelectValues(detailPreferredAgesSelect, record.preferredAges || [])
        setMultiSelectValues(detailPreferredLifestyleSelect, record.preferredLifestyle || [])
        setSelectValue(detailPreferredAppearanceSelect, record.preferredAppearance || '')
        detailValuesSelection = Array.isArray(record.values) ? record.values.slice(0, 1) : []
        setMultiSelectValues(detailValuesSelect, detailValuesSelection)
        if (detailValuesCustomInput) detailValuesCustomInput.value = record.valuesCustom || ''
        if (detailSufficientConditionInput)
          detailSufficientConditionInput.value = record.sufficientCondition || ''
        if (detailNecessaryConditionInput)
          detailNecessaryConditionInput.value = record.necessaryCondition || ''
        if (detailLikesDislikesInput) detailLikesDislikesInput.value = record.likesDislikes || ''
        if (detailAboutMeInput) detailAboutMeInput.value = record.aboutMe || ''
        if (detailNotesInput) detailNotesInput.value = record.notes || ''

        const { date: scheduledDate, time: scheduledTime } = splitLocalDateTime(
          record.meetingSchedule,
        )
        detailDateInput.value = scheduledDate
        updateTimeOptions(scheduledDate, scheduledTime, id)
        detailNotesInput.value = record.notes || ''
        detailScheduleInfo.textContent = record.meetingSchedule
          ? `현재 예약: ${formatDate(record.meetingSchedule)}`
          : '대면 상담 일정이 아직 없습니다.'

        currentDraftData = getDraftForPhone(record.phone)
        if (detailDraftLoadBtn) {
          if (currentDraftData) {
            detailDraftLoadBtn.hidden = false
            const savedAt = currentDraftData.savedAt
            detailDraftLoadBtn.title = savedAt
              ? `저장 시각: ${new Date(savedAt).toLocaleString('ko-KR')}`
              : ''
          } else {
            detailDraftLoadBtn.hidden = true
            detailDraftLoadBtn.title = ''
          }
        }

        updateDetailAttachments(record)

        detailModal.hidden = false
        document.body.classList.add('modal-open')
        if (detailForm) detailForm.scrollTop = 0
      }

      function closeDetailModal() {
        detailModal.hidden = true
        document.body.classList.remove('modal-open')
        if (detailForm) detailForm.scrollTop = 0
        detailRecordId = null
        currentDraftData = null
        if (detailDraftLoadBtn) {
          detailDraftLoadBtn.hidden = true
          detailDraftLoadBtn.title = ''
        }
        detailForm.reset()
        detailTimeSelect.innerHTML = '<option value="">시간 선택</option>'
        detailTimeSelect.disabled = true
        detailScheduleInfo.textContent = ''
        if (detailHeightInput) detailHeightInput.value = ''
        if (detailPhoneInput) detailPhoneInput.value = ''
        if (detailMbtiInput) detailMbtiInput.value = ''
        if (detailUniversityInput) detailUniversityInput.value = ''
        setSelectValue(detailSalaryRangeSelect, '')
        if (detailJobDetailInput) detailJobDetailInput.value = ''
        if (detailProfileAppealInput) detailProfileAppealInput.value = ''
        setSelectValue(detailSmokingSelect, '')
        setSelectValue(detailReligionSelect, '')
        setSelectValue(detailLongDistanceSelect, '')
        setSelectValue(detailDinkSelect, '')
        if (detailLastRelationshipInput) detailLastRelationshipInput.value = ''
        setSelectValue(detailMarriageTimingSelect, '')
        setSelectValue(detailRelationshipCountSelect, '')
        setSelectValue(detailCarOwnershipSelect, '')
        setSelectValue(detailTattooSelect, '')
        setSelectValue(detailDivorceStatusSelect, '')
        setMultiSelectValues(detailPreferredHeightsSelect, [])
        setMultiSelectValues(detailPreferredAgesSelect, [])
        setMultiSelectValues(detailPreferredLifestyleSelect, [])
        setSelectValue(detailPreferredAppearanceSelect, '')
        setMultiSelectValues(detailValuesSelect, [])
        detailValuesSelection = []
        if (detailValuesCustomInput) detailValuesCustomInput.value = ''
        if (detailSufficientConditionInput) detailSufficientConditionInput.value = ''
        if (detailNecessaryConditionInput) detailNecessaryConditionInput.value = ''
        if (detailLikesDislikesInput) detailLikesDislikesInput.value = ''
        if (detailAboutMeInput) detailAboutMeInput.value = ''
        if (detailAttachmentsSection) detailAttachmentsSection.hidden = true
        if (detailIdCardItem) detailIdCardItem.hidden = true
        if (detailEmploymentItem) detailEmploymentItem.hidden = true
        if (detailPhotosItem) detailPhotosItem.hidden = true
        if (detailPhotosGrid) detailPhotosGrid.innerHTML = ''
        toggleAttachmentsTab(false)
        if (moimDetailView) {
          moimDetailView.innerHTML = ''
          moimDetailView.hidden = true
        }
      }

      function renderEntry(label, value) {
        return `
          <div>
            <dt>${label}</dt>
            <dd>${escapeHtml(value || '-')}</dd>
          </div>
        `
      }

      function renderCardAttachments(item) {
        if (!item) return ''
        const attachments = []
        const documents = item.documents || {}
        if (documents.idCard) {
          const rendered = renderAttachmentListItem('신분증', documents.idCard, '신분증')
          if (rendered) attachments.push(rendered)
        }
        if (documents.employmentProof) {
          const rendered = renderAttachmentListItem('재직 증빙', documents.employmentProof, '재직 증빙')
          if (rendered) attachments.push(rendered)
        }
        const photos = Array.isArray(item.photos) ? item.photos : []
        const facePhotos = photos.filter((photo) => (photo.role || photo.meta?.type) === 'face')
        const fullPhotos = photos.filter((photo) => (photo.role || photo.meta?.type) === 'full')
        facePhotos.forEach((photo, index) => {
          const rendered = renderAttachmentListItem(`얼굴 사진 ${index + 1}`, photo, '얼굴 사진')
          if (rendered) attachments.push(rendered)
        })
        fullPhotos.forEach((photo, index) => {
          const rendered = renderAttachmentListItem(`전신 사진 ${index + 1}`, photo, '전신 사진')
          if (rendered) attachments.push(rendered)
        })
        if (!attachments.length) return ''
        return `
          <div class="card-attachments">
            <div class="card-attachments-title">업로드 자료</div>
            <ul class="card-attachments-list">
              ${attachments.join('')}
            </ul>
          </div>
        `
      }

      function renderAttachmentListItem(label, file, fallbackName) {
        const source = getFileSource(file)
        if (!source) return ''
        const displayName = escapeHtml(file?.name || fallbackName || label)
        const safeLabel = escapeHtml(label || '첨부파일')
        const safeUrl = escapeHtml(source)
        return `
          <li>
            <span class="label">${safeLabel}</span>
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" download="${displayName}">
              ${displayName}
            </a>
          </li>
        `
      }

      function normalizeHeightValue(raw) {
        const digits = String(raw || '').replace(/[^0-9]/g, '').slice(0, 3)
        return digits ? `${digits}cm` : ''
      }

      function normalizeDepositStatusValue(raw) {
        const value = String(raw || '').toLowerCase().trim()
        return DEPOSIT_STATUS_VALUES.includes(value) ? value : DEPOSIT_STATUS.pending
      }

      function formatPhoneNumber(raw) {
        const digits = String(raw || '').replace(/[^0-9]/g, '')
        if (!digits) return ''
        if (digits.length < 4) return digits
        if (digits.length < 8) return digits.replace(/(\d{3})(\d+)/, '$1-$2')
        return digits.replace(/(\d{3})(\d{3,4})(\d{0,4}).*/, '$1-$2-$3')
      }

      function normalizePhoneKey(raw) {
        return String(raw || '').replace(/[^0-9]/g, '')
      }

      function setSelectValue(selectEl, value) {
        if (!selectEl) return
        const options = Array.from(selectEl.options || []).map((opt) => opt.value)
        selectEl.value = options.includes(value) ? value : ''
      }

      function setMultiSelectValues(selectEl, values) {
        if (!selectEl) return
        const list = Array.isArray(values) ? values : []
        if (!selectEl.multiple) {
          selectEl.value = list[0] || ''
          syncCheckboxGroupFromSelect(selectEl)
          return
        }
        const valueSet = new Set(list.map((value) => String(value)))
        Array.from(selectEl.options || []).forEach((option) => {
          option.selected = valueSet.has(option.value)
        })
        syncCheckboxGroupFromSelect(selectEl)
      }

      function getFileSource(fileData) {
        if (!fileData) return ''
        if (typeof fileData === 'string') return fileData
        if (typeof fileData.dataUrl === 'string' && fileData.dataUrl.trim()) return fileData.dataUrl.trim()
        if (typeof fileData.downloadURL === 'string' && fileData.downloadURL.trim())
          return fileData.downloadURL.trim()
        if (typeof fileData.url === 'string' && fileData.url.trim()) return fileData.url.trim()
        if (typeof fileData.src === 'string' && fileData.src.trim()) return fileData.src.trim()
        if (typeof fileData.data === 'string' && fileData.data.trim()) {
          const data = fileData.data.trim()
          if (data.startsWith('data:')) return data
          const mime =
            typeof fileData.type === 'string' && fileData.type.trim()
              ? fileData.type.trim()
              : 'application/octet-stream'
          return `data:${mime};base64,${data}`
        }
        if (typeof fileData.base64 === 'string' && fileData.base64.trim()) {
          const mime =
            typeof fileData.type === 'string' && fileData.type.trim()
              ? fileData.type.trim()
              : 'application/octet-stream'
          return `data:${mime};base64,${fileData.base64.trim()}`
        }
        return ''
      }

      function setAttachmentLink(linkEl, fileData, fallbackLabel) {
        if (!linkEl || !fileData) return false
        const source = getFileSource(fileData)
        if (!source) return false
        const name = fileData.name || fallbackLabel || '첨부파일'
        linkEl.href = source
        linkEl.download = name
        linkEl.textContent = `${name} 다운로드`
        linkEl.target = '_blank'
        linkEl.rel = 'noopener noreferrer'
        linkEl.title = source
        let urlContainer = linkEl.nextElementSibling
        if (!urlContainer || !urlContainer.classList.contains('attachment-url')) {
          urlContainer = document.createElement('div')
          urlContainer.className = 'attachment-url'
          linkEl.insertAdjacentElement('afterend', urlContainer)
        }
        urlContainer.textContent = source
        urlContainer.title = source
        urlContainer.hidden = false
        return true
      }

      function renderPhotoAttachments(container, photos) {
        if (!container) return 0
        container.innerHTML = ''
        const list = Array.isArray(photos) ? photos : []
        list
          .filter((photo) => {
            const source = getFileSource(photo)
            return Boolean(source)
          })
          .forEach((photo, index) => {
            const source = getFileSource(photo)
            const item = document.createElement('div')
            item.className = 'attachment-photo-item'
            const link = document.createElement('a')
            link.href = source
            const label = photo.name || `사진 ${index + 1}`
            link.download = label
            link.title = `${label} 다운로드`
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
            const img = document.createElement('img')
            img.src = source
            img.alt = label
            link.appendChild(img)
            const urlBox = document.createElement('div')
            urlBox.className = 'attachment-url'
            urlBox.textContent = source
            urlBox.title = source
            item.appendChild(link)
            item.appendChild(urlBox)
            container.appendChild(item)
          })
        return container.childElementCount
      }

      function updateDetailAttachments(record) {
        if (!detailAttachmentsSection) return
        const documents = record?.documents || {}
        const photos = Array.isArray(record?.photos) ? record.photos : []

        const hasIdCard = setAttachmentLink(detailIdCardLink, documents.idCard, '신분증')
        if (detailIdCardItem) detailIdCardItem.hidden = !hasIdCard

        const hasEmployment = setAttachmentLink(
          detailEmploymentLink,
          documents.employmentProof,
          '재직 증빙'
        )
        if (detailEmploymentItem) detailEmploymentItem.hidden = !hasEmployment

        const photoCount = renderPhotoAttachments(detailPhotosGrid, photos)
        if (detailPhotosItem) detailPhotosItem.hidden = photoCount === 0

        const hasAny = hasIdCard || hasEmployment || photoCount > 0
        detailAttachmentsSection.hidden = !hasAny
        toggleAttachmentsTab(hasAny)
      }

      function getDraftForPhone(phone) {
        const key = normalizePhoneKey(phone)
        if (!key) return null
        const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${key}`)
        if (!raw) return null
        try {
          const draft = JSON.parse(raw)
          return draft && typeof draft === 'object' ? draft : null
        } catch (error) {
          console.warn('[draft] parse failed', error)
          return null
        }
      }

      function toOptionArray(value) {
        if (Array.isArray(value)) {
          return value
            .map((item) => (item == null ? '' : String(item).trim()))
            .filter(Boolean)
        }
        if (typeof value === 'string') {
          const trimmed = value.trim()
          if (!trimmed) return []
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              const parsed = JSON.parse(trimmed)
              if (Array.isArray(parsed)) {
                return parsed
                  .map((item) => (item == null ? '' : String(item).trim()))
                  .filter(Boolean)
              }
            } catch (error) {
              /* noop */
            }
          }
          if (trimmed.includes(',')) {
            return trimmed.split(',').map((part) => part.trim()).filter(Boolean)
          }
          return [trimmed]
        }
        return []
      }

      function applyDraftToDetailForm(draft) {
        if (!draft || typeof draft !== 'object') return
        if (detailPhoneInput && draft.phone) detailPhoneInput.value = formatPhoneNumber(draft.phone)
        if (detailMbtiInput && draft.mbti !== undefined) detailMbtiInput.value = draft.mbti || ''
        if (detailJobInput && draft.job !== undefined) detailJobInput.value = draft.job || ''
        if (detailJobDetailInput && draft.jobDetail !== undefined)
          detailJobDetailInput.value = draft.jobDetail || ''
        if (detailUniversityInput && draft.university !== undefined)
          detailUniversityInput.value = draft.university || ''
        if (detailSalaryRangeSelect && draft.salaryRange !== undefined)
          setSelectValue(detailSalaryRangeSelect, draft.salaryRange || '')
        if (detailSmokingSelect && draft.smoking !== undefined)
          setSelectValue(detailSmokingSelect, draft.smoking || '')
        if (detailReligionSelect && draft.religion !== undefined)
          setSelectValue(detailReligionSelect, draft.religion || '')
        if (detailLongDistanceSelect && draft.longDistance !== undefined)
          setSelectValue(detailLongDistanceSelect, draft.longDistance || '')
        if (detailDinkSelect && draft.dink !== undefined)
          setSelectValue(detailDinkSelect, draft.dink || '')
        if (detailLastRelationshipInput && draft.lastRelationship !== undefined)
          detailLastRelationshipInput.value = draft.lastRelationship || ''
        if (detailMarriageTimingSelect && draft.marriageTiming !== undefined)
          setSelectValue(detailMarriageTimingSelect, draft.marriageTiming || '')
        if (detailRelationshipCountSelect && draft.relationshipCount !== undefined)
          setSelectValue(detailRelationshipCountSelect, draft.relationshipCount || '')
        if (detailCarOwnershipSelect && draft.carOwnership !== undefined)
          setSelectValue(detailCarOwnershipSelect, draft.carOwnership || '')
        if (detailTattooSelect && draft.tattoo !== undefined)
          setSelectValue(detailTattooSelect, draft.tattoo || '')
        if (detailDivorceStatusSelect && draft.divorceStatus !== undefined)
          setSelectValue(detailDivorceStatusSelect, draft.divorceStatus || '')
        if (detailProfileAppealInput && draft.profileAppeal !== undefined)
          detailProfileAppealInput.value = draft.profileAppeal || ''
        if (detailLikesDislikesInput && draft.likesDislikes !== undefined)
          detailLikesDislikesInput.value = draft.likesDislikes || ''
        if (detailSufficientConditionInput && draft.sufficientCondition !== undefined)
          detailSufficientConditionInput.value = draft.sufficientCondition || ''
        if (detailNecessaryConditionInput && draft.necessaryCondition !== undefined)
          detailNecessaryConditionInput.value = draft.necessaryCondition || ''
        if (detailAboutMeInput && draft.aboutMe !== undefined) detailAboutMeInput.value = draft.aboutMe || ''
        if (detailPreferredHeightsSelect && draft.preferredHeights !== undefined)
          setMultiSelectValues(detailPreferredHeightsSelect, toOptionArray(draft.preferredHeights))
        if (detailPreferredAgesSelect && draft.preferredAges !== undefined)
          setMultiSelectValues(detailPreferredAgesSelect, toOptionArray(draft.preferredAges))
        if (detailPreferredLifestyleSelect && draft.preferredLifestyle !== undefined)
          setMultiSelectValues(
            detailPreferredLifestyleSelect,
            toOptionArray(draft.preferredLifestyle),
          )
        if (detailPreferredAppearanceSelect && draft.preferredAppearance !== undefined)
          setSelectValue(detailPreferredAppearanceSelect, draft.preferredAppearance || '')
        const draftValues = Array.isArray(draft.values) ? draft.values.slice(0, 1) : []
        if (detailValuesSelect) {
          setMultiSelectValues(detailValuesSelect, draftValues)
        }
        detailValuesSelection = draftValues
        showToast('임시 저장된 데이터를 적용했습니다.')
      }

      function getMultiSelectValues(selectEl) {
        if (!selectEl) return []
        if (!selectEl.multiple) {
          const value = selectEl.value
          return value ? [value] : []
        }
        return Array.from(selectEl.selectedOptions || [])
          .map((option) => option.value)
          .filter(Boolean)
      }

      function enforceMultiSelectLimit(selectEl, limit) {
        if (!selectEl) return
        const selected = getMultiSelectValues(selectEl)
        if (!selectEl.multiple) {
          detailValuesSelection = selected
          return
        }
        if (selected.length > limit) {
          setMultiSelectValues(selectEl, detailValuesSelection)
          showToast(`가치관은 최대 ${limit}개까지 선택할 수 있습니다.`)
        } else {
          detailValuesSelection = selected
        }
      }

      function formatSalaryRange(value) {
        return SALARY_RANGE_LABELS[value] || ''
      }

      function formatPhoneStatus(status) {
        return PHONE_STATUS_LABELS[status] || PHONE_STATUS_LABELS.pending
      }

      function getStatusClass(status) {
        return STATUS_CLASS_NAMES[status] || STATUS_CLASS_NAMES.pending
      }

      function formatDepositStatus(status) {
        return DEPOSIT_STATUS_LABELS[status] || DEPOSIT_STATUS_LABELS.pending
      }

      function getDepositStatusClass(status) {
        return DEPOSIT_STATUS_CLASS_NAMES[status] || DEPOSIT_STATUS_CLASS_NAMES.pending
      }

      function handleDetailDateChange() {
        const dateValue = detailDateInput.value
        updateTimeOptions(dateValue, '', detailRecordId)
        handleDetailTimeChange()
      }

      function handleDetailTimeChange() {
        const dateValue = detailDateInput.value
        const timeValue = detailTimeSelect.value
        if (dateValue && timeValue) {
          detailScheduleInfo.textContent = `선택한 일정: ${dateValue} ${timeValue}`
        } else if (dateValue && !timeValue) {
          detailScheduleInfo.textContent = '상담 시간을 선택해 주세요.'
        }
      }

      function handleClearSchedule(event) {
        event.preventDefault()
        detailDateInput.value = ''
        updateTimeOptions('', '', detailRecordId)
        detailScheduleInfo.textContent = '대면 상담 일정이 아직 없습니다.'
      }


      async function handleDetailSubmit(event) {
        event.preventDefault()
        if (!detailRecordId) {
          showToast('대상을 찾을 수 없습니다.')
          return
        }

        const phoneStatus = detailPhoneStatusEl.value
        if (!PHONE_STATUS_VALUES.includes(phoneStatus)) {
          showToast('전화 상담 상태를 선택해 주세요.')
          return
        }

        if (!detailForm.reportValidity()) {
          return
        }

        const nameValue = (detailNameInput?.value || '').trim()
        if (detailNameInput) detailNameInput.value = nameValue
        const phoneValue = formatPhoneNumber(detailPhoneInput?.value)
        if (detailPhoneInput) detailPhoneInput.value = phoneValue
        const genderValue = detailGenderSelect?.value || ''
        const birthValue = (detailBirthInput?.value || '').trim()
        if (detailBirthInput) detailBirthInput.value = birthValue
        const educationValue = detailEducationSelect?.value || ''
        const jobValue = (detailJobInput?.value || '').trim()
        if (detailJobInput) detailJobInput.value = jobValue
        const districtValue = (detailDistrictInput?.value || '').trim()
        if (detailDistrictInput) detailDistrictInput.value = districtValue
        const heightValue = normalizeHeightValue(detailHeightInput?.value)
        if (detailHeightInput) detailHeightInput.value = heightValue
        const mbtiValue = (detailMbtiInput?.value || '').trim()
        if (detailMbtiInput) detailMbtiInput.value = mbtiValue
        const universityValue = (detailUniversityInput?.value || '').trim()
        if (detailUniversityInput) detailUniversityInput.value = universityValue
        const salaryRangeValue = detailSalaryRangeSelect?.value || ''
        setSelectValue(detailSalaryRangeSelect, salaryRangeValue)
        const jobDetailValue = (detailJobDetailInput?.value || '').trim()
        if (detailJobDetailInput) detailJobDetailInput.value = jobDetailValue
        const profileAppealValue = (detailProfileAppealInput?.value || '').trim()
        if (detailProfileAppealInput) detailProfileAppealInput.value = profileAppealValue
        const smokingValue = detailSmokingSelect?.value || ''
        setSelectValue(detailSmokingSelect, smokingValue)
        const religionValue = detailReligionSelect?.value || ''
        setSelectValue(detailReligionSelect, religionValue)
        const longDistanceValue = detailLongDistanceSelect?.value || ''
        setSelectValue(detailLongDistanceSelect, longDistanceValue)
        const dinkValue = detailDinkSelect?.value || ''
        setSelectValue(detailDinkSelect, dinkValue)
        const lastRelationshipValue = (detailLastRelationshipInput?.value || '').trim()
        if (detailLastRelationshipInput) detailLastRelationshipInput.value = lastRelationshipValue
        const marriageTimingValue = detailMarriageTimingSelect?.value || ''
        setSelectValue(detailMarriageTimingSelect, marriageTimingValue)
        const relationshipCountValue = detailRelationshipCountSelect?.value || ''
        setSelectValue(detailRelationshipCountSelect, relationshipCountValue)
        const carOwnershipValue = detailCarOwnershipSelect?.value || ''
        setSelectValue(detailCarOwnershipSelect, carOwnershipValue)
        const tattooValue = detailTattooSelect?.value || ''
        setSelectValue(detailTattooSelect, tattooValue)
        const divorceStatusValue = detailDivorceStatusSelect?.value || ''
        setSelectValue(detailDivorceStatusSelect, divorceStatusValue)
        const preferredHeights = getMultiSelectValues(detailPreferredHeightsSelect)
        const preferredAges = getMultiSelectValues(detailPreferredAgesSelect)
        const preferredLifestyle = getMultiSelectValues(detailPreferredLifestyleSelect)
        const preferredAppearanceValue = detailPreferredAppearanceSelect?.value || ''
        setSelectValue(detailPreferredAppearanceSelect, preferredAppearanceValue)
        const valuesSelected = getMultiSelectValues(detailValuesSelect).slice(0, 1)
        if (valuesSelected.length > 1) {
          showToast('가치관은 한 개만 선택할 수 있습니다.')
          return
        }
        detailValuesSelection = valuesSelected
        const valuesCustomValue = (detailValuesCustomInput?.value || '').trim()
        if (detailValuesCustomInput) detailValuesCustomInput.value = valuesCustomValue
        const sufficientConditionValue = (detailSufficientConditionInput?.value || '').trim()
        if (detailSufficientConditionInput)
          detailSufficientConditionInput.value = sufficientConditionValue
        const necessaryConditionValue = (detailNecessaryConditionInput?.value || '').trim()
        if (detailNecessaryConditionInput)
          detailNecessaryConditionInput.value = necessaryConditionValue
        const likesDislikesValue = (detailLikesDislikesInput?.value || '').trim()
        if (detailLikesDislikesInput) detailLikesDislikesInput.value = likesDislikesValue
        const aboutMeValue = (detailAboutMeInput?.value || '').trim()
        if (detailAboutMeInput) detailAboutMeInput.value = aboutMeValue

        const dateValue = detailDateInput.value
        const timeValue = detailTimeSelect.disabled ? '' : detailTimeSelect.value

        if (dateValue && !timeValue) {
          showToast('상담 시간을 선택해 주세요.')
          return
        }
        if (!dateValue && timeValue) {
          showToast('상담 날짜를 선택해 주세요.')
          return
        }

        let meetingSchedule = ''
        if (dateValue && timeValue) {
          const date = new Date(`${dateValue}T${timeValue}`)
          if (Number.isNaN(date.getTime())) {
            showToast('유효한 상담 일정을 선택해 주세요.')
            return
          }
          meetingSchedule = date.toISOString()
        }

        const payload = {
          name: nameValue,
          gender: genderValue,
          phone: phoneValue,
          birth: birthValue,
          education: educationValue,
          job: jobValue,
          height: heightValue,
          district: districtValue,
          mbti: mbtiValue,
          university: universityValue,
          salaryRange: salaryRangeValue,
          jobDetail: jobDetailValue,
          profileAppeal: profileAppealValue,
          smoking: smokingValue,
          religion: religionValue,
          longDistance: longDistanceValue,
          dink: dinkValue,
          lastRelationship: lastRelationshipValue,
          marriageTiming: marriageTimingValue,
          relationshipCount: relationshipCountValue,
          carOwnership: carOwnershipValue,
          tattoo: tattooValue,
          divorceStatus: divorceStatusValue,
          preferredHeights,
          preferredAges,
          preferredLifestyle,
          preferredAppearance: preferredAppearanceValue,
          sufficientCondition: sufficientConditionValue,
          necessaryCondition: necessaryConditionValue,
          likesDislikes: likesDislikesValue,
          values: valuesSelected,
          valuesCustom: valuesCustomValue,
          aboutMe: aboutMeValue,
          phoneConsultStatus: phoneStatus,
          meetingSchedule,
          notes: detailNotesInput.value?.trim() || '',
        }
        const existingRecord = items.find((item) => item.id === detailRecordId) || {}
        payload.documents = existingRecord.documents || {}
        payload.photos = existingRecord.photos || []

        suppressUpdateToast = true
        try {
          const res = await fetch(`${API_URL}/${detailRecordId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok || !body?.ok) {
            throw new Error(body?.message || '상세 정보를 저장하지 못했습니다.')
          }

          const updated = normalizeRecord(body.data)
          if (updated?.id) {
            const index = items.findIndex((item) => item.id === updated.id)
            if (index !== -1) {
              items[index] = updated
            } else {
              items.push(updated)
            }
          }
          syncFilterOptions()
          syncSelectionWithItems()
          updateStats()
          render()
          if (!calendarModal.hidden) {
            refreshCalendar(true)
          }
          showToast('상세 정보를 저장했습니다.')
          closeDetailModal()
        } catch (error) {
          suppressUpdateToast = false
          console.error(error)
          showToast(error.message || '상세 정보를 저장하지 못했습니다.')
        } finally {
          setTimeout(() => {
            suppressUpdateToast = false
          }, 1000)
        }
      }

      function updateTimeOptions(dateValue, selectedTime, currentId) {
        detailTimeSelect.innerHTML = '<option value="">시간 선택</option>'
        if (!dateValue) {
          detailTimeSelect.disabled = true
          detailScheduleInfo.textContent = '대면 상담 일정이 아직 없습니다.'
          return
        }

        const reserved = getReservedTimes(dateValue, currentId)
        let hasAvailable = false
        generateTimeSlots().forEach((slot) => {
          const option = document.createElement('option')
          option.value = slot
          option.textContent = slot
          if (reserved.has(slot) && slot !== selectedTime) {
            option.disabled = true
            option.textContent = `${slot} (예약됨)`
          } else {
            hasAvailable = true
          }
          detailTimeSelect.appendChild(option)
        })

        detailTimeSelect.disabled = false
        if (selectedTime) {
          detailTimeSelect.value = selectedTime
        } else {
          detailTimeSelect.value = ''
        }

        if (!hasAvailable && !selectedTime) {
          detailScheduleInfo.textContent = '선택한 날짜에는 예약 가능한 시간이 없습니다.'
        } else if (!selectedTime) {
          detailScheduleInfo.textContent =
            '예약된 시간은 자동으로 비활성화됩니다.'
        }
      }

      function generateTimeSlots() {
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

      function getReservedTimes(dateValue, currentId) {
        const reserved = new Set()
        if (!dateValue) return reserved

        items.forEach((item) => {
          if (!item.meetingSchedule || item.id === currentId) return
          const { date, time } = splitLocalDateTime(item.meetingSchedule)
          if (date === dateValue && time) {
            reserved.add(time)
          }
        })
        return reserved
      }

      function openCalendarModal(forceRefresh = false) {
        calendarModal.hidden = false
        document.body.classList.add('modal-open')
        refreshCalendar(forceRefresh)
      }

      function closeCalendarModal() {
        calendarModal.hidden = true
        document.body.classList.remove('modal-open')
      }

      function refreshCalendar(forceSelection = false) {
        const meetings = getMeetingsGroupedByDate()
        const todayKey = getDateKey(new Date())

        if (
          !calendarState.selectedDate ||
          forceSelection ||
          (calendarState.selectedDate && !meetings.has(calendarState.selectedDate))
        ) {
          if (meetings.has(todayKey)) {
            calendarState.selectedDate = todayKey
          } else if (meetings.size) {
            const earliest = Array.from(meetings.keys()).sort()[0]
            calendarState.selectedDate = earliest
          } else {
            calendarState.selectedDate = todayKey
          }
        }

        const selectedDateObj = new Date(calendarState.selectedDate)
        if (!Number.isNaN(selectedDateObj.getTime())) {
          calendarState.current = new Date(
            selectedDateObj.getFullYear(),
            selectedDateObj.getMonth(),
            1,
          )
        }

        renderCalendar(meetings)
        renderCalendarAppointments(meetings)
      }

      function changeCalendarMonth(offset) {
        calendarState.current = new Date(
          calendarState.current.getFullYear(),
          calendarState.current.getMonth() + offset,
          1,
        )
        const meetings = getMeetingsGroupedByDate()
        const year = calendarState.current.getFullYear()
        const month = String(calendarState.current.getMonth() + 1).padStart(2, '0')
        const monthDates = Array.from(meetings.keys())
          .filter((key) => key.startsWith(`${year}-${month}-`))
          .sort()

        if (monthDates.length) {
          calendarState.selectedDate = monthDates[0]
        } else {
          calendarState.selectedDate = getDateKey(
            new Date(calendarState.current.getFullYear(), calendarState.current.getMonth(), 1),
          )
        }

        renderCalendar(meetings)
        renderCalendarAppointments(meetings)
      }

      function goToToday() {
        const today = new Date()
        calendarState.current = new Date(today.getFullYear(), today.getMonth(), 1)
        calendarState.selectedDate = getDateKey(today)
        refreshCalendar(true)
      }

      function handleCalendarDayClick(event) {
        const dayEl = event.target.closest('.calendar-day')
        if (!dayEl || !dayEl.dataset.date) return
        calendarState.selectedDate = dayEl.dataset.date
        const dateObj = new Date(calendarState.selectedDate)
        if (!Number.isNaN(dateObj.getTime())) {
          calendarState.current = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1)
        }
        const meetings = getMeetingsGroupedByDate()
        renderCalendar(meetings)
        renderCalendarAppointments(meetings)
      }

      function handleCalendarAppointmentClick(event) {
        const itemEl = event.target.closest('li[data-id]')
        if (!itemEl || itemEl.classList.contains('calendar-empty-item')) return
        const { id } = itemEl.dataset
        if (id) openDetailModal(id)
      }

      function renderCalendar(meetingsMap) {
        const year = calendarState.current.getFullYear()
        const month = calendarState.current.getMonth()
        calendarCurrentMonthEl.textContent = `${year}년 ${month + 1}월`

        calendarGrid.innerHTML = ''
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
          if (dateKey === calendarState.selectedDate) dayCell.classList.add('selected')

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

        calendarGrid.appendChild(fragment)
      }

      function renderCalendarAppointments(meetingsMap) {
        const dateKey = calendarState.selectedDate
        calendarSelectedTitleEl.textContent = formatSelectedDateTitle(dateKey)
        calendarAppointmentList.innerHTML = ''

        const meetings = meetingsMap.get(dateKey) || []
        if (!meetings.length) {
          const emptyItem = document.createElement('li')
          emptyItem.className = 'calendar-empty-item'
          emptyItem.textContent = '예약된 일정이 없습니다.'
          calendarAppointmentList.appendChild(emptyItem)
          return
        }

        if (IS_MOIM_VIEW) {
          renderMoimCalendarAppointments(meetings)
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
            const jobLine = entry.record.job
              ? `<span class="meta-line">직업 ${escapeHtml(entry.record.job)}</span>`
              : ''

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
            calendarAppointmentList.appendChild(li)
          })
      }

      function renderMoimCalendarAppointments(entries) {
        entries
          .map((entry) => ({
            ...entry,
            displaySchedule: formatMoimCalendarSchedule(entry.createdAt),
          }))
          .forEach((entry) => {
            const li = document.createElement('li')
            li.dataset.id = entry.id
            const record = entry.record || {}
            const phoneLine = escapeHtml(formatPhoneNumber(record.phone) || '-')
            const birthLine = record.birth
              ? `<span class="meta-line">출생년도 ${escapeHtml(record.birth)}</span>`
              : ''
            const genderLine = record.gender
              ? `<span class="meta-line">성별 ${escapeHtml(record.gender)}</span>`
              : ''
            const districtLine = record.district
              ? `<span class="meta-line">거주 구 ${escapeHtml(record.district)}</span>`
              : ''
            const jobLine = record.job
              ? `<span class="meta-line">직업 ${escapeHtml(record.job)}</span>`
              : ''
            const goalLine = record.participationGoal
              ? `<span class="meta-line">목적 ${escapeHtml(record.participationGoal)}</span>`
              : ''

            li.innerHTML = `
              <time>${entry.displaySchedule}</time>
              <span>${escapeHtml(record.name || '익명')}</span>
              <span class="meta-line">연락처 ${phoneLine}</span>
              ${birthLine}
              ${genderLine}
              ${districtLine}
              ${jobLine}
              ${goalLine}
            `
            calendarAppointmentList.appendChild(li)
          })
      }

      function formatCalendarSchedule(schedule, fallbackTime, fallbackDateKey) {
        if (schedule) {
          const date = new Date(schedule)
          if (!Number.isNaN(date.getTime())) {
            const time = `${String(date.getHours()).padStart(2, '0')}:${String(
              date.getMinutes(),
            ).padStart(2, '0')}`
            return `${String(date.getFullYear())}년 ${String(date.getMonth() + 1)}월 ${String(
              date.getDate(),
            )}일 ${time}`
          }
        }
        return `${fallbackDateKey} ${fallbackTime}`
      }

      function formatMoimCalendarSchedule(createdAt) {
        const date = new Date(createdAt)
        if (!Number.isNaN(date.getTime())) {
          return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(
            2,
            '0',
          )} 접수`
        }
        return '접수 시간'
      }

      function getMeetingsGroupedByDate() {
        const map = new Map()

        if (IS_MOIM_VIEW) {
          items.forEach((item) => {
            if (normalizeDepositStatusValue(item.depositStatus) !== DEPOSIT_STATUS.completed) return
            if (!item?.createdAt) return
            const created = new Date(item.createdAt)
            if (Number.isNaN(created.getTime())) return
            const dateKey = getDateKey(created)
            if (!map.has(dateKey)) map.set(dateKey, [])
            map.get(dateKey).push({
              id: item.id,
              name: item.name,
              createdAt: created.getTime(),
              record: item,
            })
          })
          map.forEach((list) => list.sort((a, b) => a.createdAt - b.createdAt))
          return map
        }

        items.forEach((item) => {
          if (!item.meetingSchedule) return
          const { date, time } = splitLocalDateTime(item.meetingSchedule)
          if (!date || !time) return
          if (!map.has(date)) {
            map.set(date, [])
          }
          map.get(date).push({
            id: item.id,
            name: item.name,
            time,
            record: item,
          })
        })

        map.forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)))
        return map
      }

      function getDateKey(date) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      function formatSelectedDateTitle(dateKey) {
        const fallback = IS_MOIM_VIEW ? '선택된 모임' : '선택된 일정'
        if (!dateKey) return fallback
        const [year, month, day] = dateKey.split('-').map((value) => Number(value))
        if ([year, month, day].some((value) => Number.isNaN(value))) return fallback
        const suffix = IS_MOIM_VIEW ? '모임' : '일정'
        return `${year}년 ${month}월 ${day}일 ${suffix}`
      }


      function normalizeRecord(record) {
        if (!record || typeof record !== 'object') return record
        const normalized = { ...record }
        normalized.formType = getRecordFormType(normalized)
        if (!PHONE_STATUS_VALUES.includes(normalized.phoneConsultStatus)) {
          normalized.phoneConsultStatus = 'pending'
        }
        if (typeof normalized.meetingSchedule !== 'string') {
          normalized.meetingSchedule = ''
        }
        if (typeof normalized.notes !== 'string') {
          normalized.notes = ''
        }
        normalized.depositStatus = normalizeDepositStatusValue(normalized.depositStatus)
        if (typeof normalized.job !== 'string') {
          normalized.job = normalized.job != null ? String(normalized.job) : ''
        }
        if (typeof normalized.height !== 'string') {
          normalized.height = normalized.height != null ? String(normalized.height) : ''
        }
        normalized.height = normalizeHeightValue(normalized.height)
        if (typeof normalized.district !== 'string') {
          normalized.district = normalized.district != null ? String(normalized.district) : ''
        }
        MOIM_INDICATOR_KEYS.forEach((key) => {
          const value = normalized[key]
          normalized[key] = value != null ? String(value) : ''
        })
        normalized.mbti = normalized.mbti != null ? String(normalized.mbti) : ''
        normalized.university = normalized.university != null ? String(normalized.university) : ''
        normalized.salaryRange = normalized.salaryRange != null ? String(normalized.salaryRange) : ''
        normalized.jobDetail = normalized.jobDetail != null ? String(normalized.jobDetail) : ''
        normalized.profileAppeal =
          normalized.profileAppeal != null ? String(normalized.profileAppeal) : ''
        normalized.smoking = normalized.smoking != null ? String(normalized.smoking) : ''
        normalized.religion = normalized.religion != null ? String(normalized.religion) : ''
      normalized.longDistance =
        normalized.longDistance != null ? String(normalized.longDistance) : ''
      normalized.dink = normalized.dink != null ? String(normalized.dink) : ''
      normalized.lastRelationship =
        normalized.lastRelationship != null ? String(normalized.lastRelationship) : ''
      normalized.marriageTiming =
        normalized.marriageTiming != null ? String(normalized.marriageTiming) : ''
      normalized.relationshipCount =
        normalized.relationshipCount != null ? String(normalized.relationshipCount) : ''
      normalized.carOwnership =
        normalized.carOwnership != null ? String(normalized.carOwnership) : ''
      normalized.tattoo = normalized.tattoo != null ? String(normalized.tattoo) : ''
      normalized.divorceStatus =
        normalized.divorceStatus != null ? String(normalized.divorceStatus) : ''
        normalized.sufficientCondition =
          normalized.sufficientCondition != null ? String(normalized.sufficientCondition) : ''
        normalized.necessaryCondition =
          normalized.necessaryCondition != null ? String(normalized.necessaryCondition) : ''
        normalized.likesDislikes =
          normalized.likesDislikes != null ? String(normalized.likesDislikes) : ''
        normalized.valuesCustom = normalized.valuesCustom != null ? String(normalized.valuesCustom) : ''
        normalized.aboutMe = normalized.aboutMe != null ? String(normalized.aboutMe) : ''
        const normalizeFileEntry = (entry, fallbackName) => {
          if (!entry) return null
          if (typeof entry === 'string') {
            const source = getFileSource(entry)
            if (!source) return null
            return {
              name: fallbackName || '',
              size: 0,
              type: '',
              dataUrl: source,
              url: source,
              downloadURL: source,
              storagePath: '',
              role: '',
            }
          }
          if (typeof entry !== 'object') return null
          const source = getFileSource(entry)
          if (!source) return null
          return {
            name: entry.name != null ? String(entry.name) : fallbackName || '',
            size: Number(entry.size) || 0,
            type: entry.type != null ? String(entry.type) : '',
            dataUrl: source,
            url: source,
            downloadURL:
              typeof entry.downloadURL === 'string' && entry.downloadURL.trim()
                ? entry.downloadURL.trim()
                : source,
            storagePath:
              typeof entry.storagePath === 'string' && entry.storagePath.trim()
                ? entry.storagePath.trim()
                : '',
            role:
              typeof entry.role === 'string' && entry.role
                ? entry.role
                : typeof entry.meta?.type === 'string'
                ? entry.meta.type
                : '',
          }
        }
        const documentsRaw =
          normalized.documents && typeof normalized.documents === 'object'
            ? normalized.documents
            : {}
        normalized.documents = {
          idCard: normalizeFileEntry(documentsRaw.idCard),
          employmentProof: normalizeFileEntry(documentsRaw.employmentProof),
        }
        normalized.photos = Array.isArray(normalized.photos)
          ? normalized.photos
              .map((photo) => normalizeFileEntry(photo))
              .filter((entry) => entry && entry.dataUrl)
          : []
        const toStringArray = (input) => {
          if (Array.isArray(input)) {
            return input
              .map((value) => (value == null ? '' : String(value).trim()))
              .filter(Boolean)
          }
          if (typeof input === 'string') {
            const trimmed = input.trim()
            if (!trimmed) return []
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
              try {
                const parsed = JSON.parse(trimmed)
                if (Array.isArray(parsed)) {
                  return parsed
                    .map((value) => (value == null ? '' : String(value).trim()))
                    .filter(Boolean)
                }
              } catch (error) {
                /* noop */
              }
            }
            if (trimmed.includes(',')) {
              return trimmed
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
            }
            return [trimmed]
          }
          return []
        }
        normalized.preferredHeights = toStringArray(normalized.preferredHeights)
        normalized.preferredAges = toStringArray(normalized.preferredAges)
        normalized.preferredLifestyle = toStringArray(normalized.preferredLifestyle)
        normalized.preferredAppearance =
          normalized.preferredAppearance != null ? String(normalized.preferredAppearance) : ''
        normalized.values = Array.isArray(normalized.values)
          ? normalized.values.map((value) => String(value)).slice(0, 1)
          : []
        normalized.agreements =
          normalized.agreements && typeof normalized.agreements === 'object'
            ? {
                info: Boolean(normalized.agreements.info),
                manners: Boolean(normalized.agreements.manners),
              }
            : { info: false, manners: false }
        return normalized
      }

      function splitLocalDateTime(value) {
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

      function getPreparedItems() {
        let result = items.slice()
        if (viewState.search) {
          const term = viewState.search.toLowerCase()
          result = result.filter((item) =>
            [
              'name',
              'phone',
              'height',
              'district',
              'education',
              'job',
              'mbti',
              'university',
              'salaryRange',
              'jobDetail',
              'profileAppeal',
              'likesDislikes',
              'aboutMe',
              'valuesCustom',
              'sufficientCondition',
              'necessaryCondition',
              'longDistance',
              'dink',
              'lastRelationship',
              'marriageTiming',
              'relationshipCount',
              'preferredAppearance',
              'preferredLifestyle',
              'carOwnership',
              'tattoo',
              'divorceStatus',
            ]
              .map((key) => String(item[key] || '').toLowerCase())
              .some((value) => value.includes(term))
          )
        }
        if (viewState.gender !== 'all') {
          result = result.filter((item) => (item.gender || '') === viewState.gender)
        }
        if (viewState.height !== 'all') {
          result = result.filter((item) => (item.height || '') === viewState.height)
        }
        if (
          IS_MOIM_VIEW &&
          viewState.weekRange &&
          viewState.weekRange.start &&
          viewState.weekRange.end
        ) {
          const startTime = viewState.weekRange.start.getTime()
          const endTime = viewState.weekRange.end.getTime()
          result = result.filter((item) => {
            const created = item?.createdAt ? new Date(item.createdAt).getTime() : NaN
            return Number.isFinite(created) && created >= startTime && created < endTime
          })
        }

        switch (viewState.sort) {
          case 'oldest':
            result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            break
          case 'name':
            result.sort((a, b) =>
              String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR')
            )
            break
          case 'height':
            result.sort((a, b) =>
              String(a.height || '').localeCompare(String(b.height || ''), 'ko-KR')
            )
            break
          case 'latest':
          default:
            result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            break
        }

        return result
      }

      function syncFilterOptions() {
        populateSelect(
          genderFilter,
          uniqueSorted(items.map((item) => item.gender)),
          '성별 전체'
        )
        if (heightFilter) {
          populateSelect(
            heightFilter,
            uniqueSorted(items.map((item) => item.height)),
            '신장 전체'
          )
        }
      }

      function populateSelect(selectEl, values, placeholder) {
        if (!selectEl) return
        const previous = selectEl.value || 'all'
        selectEl.innerHTML = ''
        const fragment = document.createDocumentFragment()
        const allOption = document.createElement('option')
        allOption.value = 'all'
        allOption.textContent = placeholder
        fragment.appendChild(allOption)
        values
          .filter(Boolean)
          .forEach((value) => {
            const option = document.createElement('option')
            option.value = value
            option.textContent = value
            fragment.appendChild(option)
          })
        selectEl.appendChild(fragment)
        if (values.includes(previous)) {
          selectEl.value = previous
        } else {
          selectEl.value = 'all'
        }
        if (selectEl === genderFilter) {
          viewState.gender = selectEl.value
        }
        if (selectEl === heightFilter) {
          viewState.height = selectEl.value
        }
      }

      function uniqueSorted(values) {
        return Array.from(
          new Set(values.filter((value) => value && value.trim()))
        ).sort((a, b) => a.localeCompare(b, 'ko-KR'))
      }

      function syncSelectionWithItems() {
        const validIds = new Set(items.map((item) => item.id))
        Array.from(selectedIds).forEach((id) => {
          if (!validIds.has(id)) selectedIds.delete(id)
        })
        updateSelectionInfo()
      }

      function updateSelectionInfo() {
        const count = selectedIds.size
        selectionInfoEl.textContent = count ? `${count}건 선택됨` : ''
        bulkActionBar.hidden = count === 0
        deleteSelectedBtn.disabled = count === 0
      }

      function formatDate(value) {
        if (!value) return '-'
        try {
          return new Date(value).toLocaleString('ko-KR')
        } catch (error) {
          return value
        }
      }

      function escapeHtml(str) {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
      }

      function showToast(message) {
        toastEl.textContent = message
        toastEl.classList.add('show')
        setTimeout(() => toastEl.classList.remove('show'), 2500)
      }

      function handleCardChange(event) {
        const target = event.target
        if (!target.classList.contains('select-checkbox')) return
        const id = target.dataset.id
        if (!id) return
        if (target.checked) {
          selectedIds.add(id)
        } else {
          selectedIds.delete(id)
        }
        updateSelectionInfo()
      }

      function handleCardButtonClick(event) {
        const card = event.target.closest('.card')
        if (!card) return
        const checkbox = event.target.closest('.select-checkbox')
        if (checkbox) return
        const { id } = card.dataset
        if (id) openDetailModal(id)
      }

      function handleDepositActionClick(event) {
        if (!IS_MOIM_VIEW) return
        const button = event.target.closest('[data-deposit-action]')
        if (!button) return
        event.preventDefault()
        if (!detailRecordId) {
          showToast('대상을 찾을 수 없습니다.')
          return
        }
        const action = button.dataset.depositAction
        if (!action) return
        const record = items.find((item) => item.id === detailRecordId)
        if (!record) {
          showToast('대상을 찾을 수 없습니다.')
          return
        }
        const nextStatus =
          action === DEPOSIT_STATUS.completed ? DEPOSIT_STATUS.completed : DEPOSIT_STATUS.pending
        if (normalizeDepositStatusValue(record.depositStatus) === nextStatus) {
          showToast('이미 해당 상태입니다.')
          return
        }
        updateDepositStatus(record, nextStatus, button)
      }

      async function updateDepositStatus(record, nextStatus, buttonEl) {
        if (depositStatusUpdating) return
        const targetId = record?.id
        if (!targetId) {
          showToast('대상 정보를 확인할 수 없습니다.')
          return
        }
        depositStatusUpdating = true
        const previousLabel = buttonEl?.textContent
        if (buttonEl) {
          buttonEl.disabled = true
          buttonEl.textContent = '처리 중...'
        }
        try {
          const res = await fetch(`${API_URL}/${encodeURIComponent(targetId)}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              depositStatus: nextStatus,
            }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok || !body?.ok) {
            throw new Error(body?.message || '입금 상태를 변경하지 못했습니다.')
          }
          const updated = normalizeRecord(body.data)
          if (updated?.id) {
            const index = items.findIndex((item) => item.id === updated.id)
            if (index !== -1) {
              items[index] = updated
            } else if (matchesVariant(updated)) {
              items.push(updated)
            }
          }
          syncFilterOptions()
          syncSelectionWithItems()
          updateStats()
          render()
          if (!calendarModal.hidden) {
            refreshCalendar(true)
          }
          if (updated && detailRecordId === updated.id && IS_MOIM_VIEW) {
            renderMoimDetailView(updated)
          }
          const statusLabel = formatDepositStatus(updated?.depositStatus || nextStatus)
          showToast(`입금 상태를 '${statusLabel}'(으)로 변경했습니다.`)
        } catch (error) {
          console.error(error)
          showToast(error.message || '입금 상태를 변경하지 못했습니다.')
        } finally {
          depositStatusUpdating = false
          if (buttonEl) {
            buttonEl.disabled = false
            buttonEl.textContent = previousLabel || buttonEl.textContent
          }
        }
      }

      function handleDeleteSelected() {
        if (!selectedIds.size) return
        if (!confirm('선택한 상담을 삭제할까요?')) return
        deleteRecords(Array.from(selectedIds))
      }

      async function deleteRecords(ids) {
        const unique = Array.from(new Set((ids || []).filter(Boolean)))
        if (!unique.length) return
        suppressDeleteToast = true
        try {
          const res = await fetch(API_URL, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: unique }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok || !body?.ok) {
            throw new Error(body?.message || '삭제에 실패했습니다.')
          }
          const idSet = new Set(unique)
          items = items.filter((item) => !idSet.has(item.id))
          unique.forEach((id) => selectedIds.delete(id))
          syncSelectionWithItems()
          syncFilterOptions()
          updateStats()
          render()
          if (!calendarModal.hidden) {
            refreshCalendar(true)
          }
          showToast(`${body.count ?? unique.length}건을 삭제했습니다.`)
        } catch (error) {
          suppressDeleteToast = false
          console.error(error)
          showToast(error.message || '삭제에 실패했습니다.')
        } finally {
          setTimeout(() => {
            suppressDeleteToast = false
          }, 2000)
        }
      }

      function setupSSE() {
        if (!('EventSource' in window)) return
        const source = new EventSource(EVENTS_URL)
        source.addEventListener('message', (event) => {
          if (!event?.data) return
          try {
            const payload = JSON.parse(event.data)
            if (payload?.type === 'consult:new') {
              const incoming = normalizeRecord(payload.payload)
              if (!matchesVariant(incoming)) return
              items.push(incoming)
              syncFilterOptions()
              syncSelectionWithItems()
              updateStats()
              render()
              if (!calendarModal.hidden) refreshCalendar(true)
              showToast(variantCopy.newToast)
            } else if (payload?.type === 'consult:import') {
              items = Array.isArray(payload.payload)
                ? filterByVariant(payload.payload.map(normalizeRecord))
                : []
              selectedIds.clear()
              syncSelectionWithItems()
              syncFilterOptions()
              updateStats()
              render()
              if (!calendarModal.hidden) refreshCalendar(true)
              showToast(variantCopy.importToast)
            } else if (payload?.type === 'consult:update') {
              const updated = normalizeRecord(payload.payload)
              if (updated?.id) {
                const index = items.findIndex((item) => item.id === updated.id)
                if (matchesVariant(updated)) {
                  if (index !== -1) {
                    items[index] = updated
                  } else {
                    items.push(updated)
                  }
                } else if (index !== -1) {
                  items.splice(index, 1)
                }
              }
              syncSelectionWithItems()
              syncFilterOptions()
              updateStats()
              render()
              if (!calendarModal.hidden) refreshCalendar(true)
              if (suppressUpdateToast) {
                suppressUpdateToast = false
              } else if (updated?.name) {
                showToast(`${updated.name} 님의 정보가 업데이트되었습니다.`)
              }
            } else if (payload?.type === 'consult:delete') {
              const ids = Array.isArray(payload.payload?.ids) ? payload.payload.ids : []
              if (!ids.length) return
              const idSet = new Set(ids)
              const before = items.length
              items = items.filter((item) => !idSet.has(item.id))
              ids.forEach((id) => selectedIds.delete(id))
              syncSelectionWithItems()
              syncFilterOptions()
              updateStats()
              render()
              if (!calendarModal.hidden) refreshCalendar(true)
              if (suppressDeleteToast) {
                suppressDeleteToast = false
              } else if (before !== items.length) {
                showToast(`${ids.length}건이 삭제되었습니다.`)
              }
            }
          } catch (error) {
            console.error(error)
          }
        })
        source.addEventListener('error', () => {
          showToast('실시간 연결이 끊겼습니다. 잠시 후 자동 재연결합니다.')
        })
      }

      function exportToExcel() {
        const prepared = getPreparedItems()
        if (!prepared.length) {
          showToast('내보낼 데이터가 없습니다.')
          return
        }
        if (typeof XLSX === 'undefined') {
          showToast('엑셀 라이브러리를 불러오는 데 실패했습니다.')
          return
        }
        const rows = prepared.map((item, index) => ({
          번호: index + 1,
          성명: item.name || '',
          성별: item.gender || '',
          신청구분: item.formType || '',
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
          접수시간: formatDate(item.createdAt),
        }))
        const worksheet = XLSX.utils.json_to_sheet(rows)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, '상담 신청')
        const dateLabel = new Date().toISOString().slice(0, 10)
        XLSX.writeFile(workbook, `consultations-${dateLabel}.xlsx`)
        showToast('엑셀 파일이 다운로드되었습니다.')
      }

      async function handleExcelImport(event) {
        const file = event.target.files?.[0]
        if (!file) return
        if (typeof XLSX === 'undefined') {
          showToast('엑셀 라이브러리를 불러오는 데 실패했습니다.')
          return
        }

        try {
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

        const response = await fetch(API_IMPORT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ items: normalized }),
          })

          const body = await response.json()
          if (!response.ok || !body?.ok) {
            throw new Error(body?.message || '엑셀 데이터를 반영하지 못했습니다.')
          }

          showToast(`엑셀 데이터 ${normalized.length}건을 반영했습니다.`)
          selectedIds.clear()
          updateSelectionInfo()
          excelInput.value = ''
          await loadData()
        } catch (error) {
          console.error(error)
          showToast(error.message || '엑셀 파일 처리에 실패했습니다.')
        } finally {
          excelInput.value = ''
        }
      }
      if (!authForm) {
        if (appContentEl) appContentEl.hidden = false
        document.body.classList.remove('auth-locked')
        initializeApp()
      } else if (hasValidSession()) {
        unlockApp()
      }

