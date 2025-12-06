const ADMIN_ID = 'admin'
      const ADMIN_PASSWORD = 'admin'
      const AUTH_STORAGE_KEY = 'ygsa_admin_auth'
      const AUTH_DURATION_MS = 60 * 60 * 1000
      const PROFILE_CARD_CHARACTER_NAMES = [
        '루나',
        '카이',
        '아린',
        '라온',
        '세라',
        '레온',
        '이든',
        '소라',
        '리안',
        '제이드',
        '하린',
        '도윤',
        '미카',
        '유나',
        '지안',
        '네로',
        '하루',
        '라일라',
        '준호',
        '세이',
      ]
      const REFERRAL_SOURCE_LABELS = [
        '쓰레드',
        '프립',
        '지인 추천',
        '문토',
        '인스타그램',
        '네이버블로그',
      ]
      const REFERRAL_SOURCE_FALLBACK_LABEL = '기타/미입력'
      const profileCardNameCache = new WeakMap()
      const authOverlay = document.getElementById('authOverlay')
      const authForm = document.getElementById('authForm')
      const authIdInput = document.getElementById('authId')
      const authPasswordInput = document.getElementById('authPassword')
      const authErrorEl = document.getElementById('authError')
      const appContentEl = document.getElementById('appContent')
      let isAuthenticated = false
      let appInitialized = false
      const MATCH_CONFIRMED_STORAGE_KEY = 'YGSA_CONFIRMED_MATCHES'
      const MATCH_INITIATOR_STORAGE_KEY = 'YGSA_MATCH_INITIATORS_V1'
      let pendingExternalMatchSelection = extractSelectionFromHash()
      let confirmedMatches = loadConfirmedMatches()
      let matchInitiatorCache = loadMatchInitiators()

      function initializeApp() {
        if (appInitialized) return
        appInitialized = true
        updateStats()
        loadData()
        setupSSE()
        updateMatchedCouplesButton()
      }

      function extractSelectionFromHash() {
        if (typeof location === 'undefined' || !location.hash) return null
        const hash = location.hash
        const queryIndex = hash.indexOf('?')
        if (queryIndex === -1) return null
        const queryString = hash.slice(queryIndex + 1)
        const params = new URLSearchParams(queryString)
        const encoded = params.get('selection')
        if (!encoded) return null
        try {
          const decoded = decodeURIComponent(encoded)
          const json = decodeBase64(decoded)
          const data = JSON.parse(json)
          cleanupSelectionInHash(hash.slice(1, queryIndex))
          return data
        } catch (error) {
          console.warn('[match-select] URL 해석 실패', error)
          cleanupSelectionInHash(hash.slice(1, queryIndex))
          return null
        }
      }

      function loadConfirmedMatches() {
        try {
          const raw = localStorage.getItem(MATCH_CONFIRMED_STORAGE_KEY)
          if (!raw) return []
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return []
          return parsed
            .map((entry) => ({
              ...entry,
              confirmedAt: entry.confirmedAt || Date.now(),
              week: entry.week || buildWeekMeta(entry.confirmedAt || Date.now()),
              category: MATCH_HISTORY_CATEGORY.CONFIRMED,
            }))
            .sort((a, b) => (b.confirmedAt || 0) - (a.confirmedAt || 0))
        } catch (error) {
          console.warn('[match-confirmed] 불러오기 실패', error)
          return []
        }
      }

      function saveConfirmedMatches() {
        try {
          localStorage.setItem(MATCH_CONFIRMED_STORAGE_KEY, JSON.stringify(confirmedMatches))
        } catch (error) {
          console.warn('[match-confirmed] 저장 실패', error)
        }
      }

      function loadMatchInitiators() {
        try {
          const raw = localStorage.getItem(MATCH_INITIATOR_STORAGE_KEY)
          if (!raw) return {}
          const parsed = JSON.parse(raw)
          return parsed && typeof parsed === 'object' ? parsed : {}
        } catch (error) {
          console.warn('[match:initiator] 불러오기 실패', error)
          return {}
        }
      }

      function saveMatchInitiators() {
        try {
          localStorage.setItem(MATCH_INITIATOR_STORAGE_KEY, JSON.stringify(matchInitiatorCache || {}))
        } catch (error) {
          console.warn('[match:initiator] 저장 실패', error)
        }
      }

      function buildWeekKey(weekInfo) {
        if (!weekInfo) return ''
        const year = Number(weekInfo.year || weekInfo.yearNumber)
        const weekNumber = Number(weekInfo.week || weekInfo.weekNumber)
        if (!Number.isFinite(year) || !Number.isFinite(weekNumber)) return ''
        return `${year}-W${String(weekNumber).padStart(2, '0')}`
      }

      function rememberMatchInitiatorByEntry(entry) {
        if (!entry?.week) return
        const weekKey = buildWeekKey(entry.week)
        const pairKey = buildMatchPairKey(entry)
        if (!weekKey || !pairKey) return
        if (!matchInitiatorCache) {
          matchInitiatorCache = {}
        }
        if (!matchInitiatorCache[weekKey]) {
          matchInitiatorCache[weekKey] = {}
        }
        matchInitiatorCache[weekKey][pairKey] = {
          source: {
            target: entry.target || null,
            targetId: entry.target?.id || entry.targetId || '',
            targetPhone: entry.target?.phone || entry.targetPhone || '',
            candidate: entry.candidate || null,
            candidateId: entry.candidate?.id || entry.candidateId || '',
            candidatePhone: entry.candidate?.phone || entry.candidatePhone || '',
          },
          savedAt: Date.now(),
        }
        pruneMatchInitiatorCache()
        saveMatchInitiators()
      }

      function pruneMatchInitiatorCache(limit = 8) {
        if (!matchInitiatorCache) return
        const keys = Object.keys(matchInitiatorCache)
        if (keys.length <= limit) return
        keys
          .sort()
          .slice(0, Math.max(0, keys.length - limit))
          .forEach((key) => {
            delete matchInitiatorCache[key]
          })
      }

      function getCachedInitiatorSource(weekInfo, pairKey) {
        if (!matchInitiatorCache) return null
        const weekKey = buildWeekKey(weekInfo)
        if (!weekKey || !pairKey) return null
        return matchInitiatorCache?.[weekKey]?.[pairKey]?.source || null
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
      const MATCH_HISTORY_API_URL = `${API_BASE_URL}/api/match-history`
      const MATCH_AI_SUMMARY_URL = `${API_BASE_URL}/api/match/ai-notes`
      const MATCH_AI_MAX_REQUEST = 5
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
            { label: '유입 경로', key: 'referralSource', formatter: formatReferralSource },
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
      const statusFilter = document.getElementById('statusFilter')
      const genderStatsEl = document.getElementById('genderStats')
      const genderChartBtn = document.getElementById('genderChartBtn')
      const genderChartModal = document.getElementById('genderChartModal')
      const genderChartCloseBtn = document.getElementById('genderChartCloseBtn')
      const genderChartCanvas = document.getElementById('genderChartCanvas')
      const genderChartLegend = document.getElementById('genderChartLegend')
      const genderChartCenter = document.getElementById('genderChartCenter')
      const genderChartSummary = document.getElementById('genderChartSummary')
      const genderChartBars = document.getElementById('genderChartBars')
      const referralChartBtn = document.getElementById('referralChartBtn')
      const referralChartModal = document.getElementById('referralChartModal')
      const referralChartCloseBtn = document.getElementById('referralChartCloseBtn')
      const referralChartList = document.getElementById('referralChartList')
      const referralChartSummary = document.getElementById('referralChartSummary')
      const referralChartEmpty = document.getElementById('referralChartEmpty')
      const matchBtn = document.getElementById('matchBtn')
      const matchedCouplesBtn = document.getElementById('matchedCouplesBtn')
      const matchedCouplesModal = document.getElementById('matchedCouplesModal')
      const matchedCouplesCloseBtn = document.getElementById('matchedCouplesCloseBtn')
      const matchedCouplesList = document.getElementById('matchedCouplesList')
      const matchedCouplesSubtitle = document.getElementById('matchedCouplesSubtitle')
      const matchModal = document.getElementById('matchModal')
      const matchCloseBtn = document.getElementById('matchCloseBtn')
      const matchTargetInput = document.getElementById('matchTargetInput')
      const matchResetBtn = document.getElementById('matchResetBtn')
      const matchMemberOptions = document.getElementById('matchMemberOptions')
      const matchTargetInfo = document.getElementById('matchTargetInfo')
      const matchPreferredHeightEl = document.getElementById('matchPreferredHeight')
      const matchPreferredAgeEl = document.getElementById('matchPreferredAge')
      const matchPreferredLifestyleEl = document.getElementById('matchPreferredLifestyle')
      const matchStatusEl = document.getElementById('matchStatus')
      const matchResultsList = document.getElementById('matchResultsList')
      const matchSelectionCountEl = document.getElementById('matchSelectionCount')
      const matchSelectionList = document.getElementById('matchSelectionList')
      const matchSelectionEmptyEl = document.getElementById('matchSelectionEmpty')
      const matchHistoryList = document.getElementById('matchHistoryList')
      const matchHistorySummaryEl = document.getElementById('matchHistorySummary')
      const matchHistoryTitleEl = document.getElementById('matchHistoryTitle')
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
      const detailReferralSourceSelect = document.getElementById('detailReferralSource')
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
      const detailPreferredHeightMinInput = document.getElementById('detailPreferredHeightMin')
      const detailPreferredHeightMaxInput = document.getElementById('detailPreferredHeightMax')
      const detailPreferredAgeYoungestInput = document.getElementById('detailPreferredAgeYoungest')
      const detailPreferredAgeOldestInput = document.getElementById('detailPreferredAgeOldest')
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
      const detailMembershipTypeSelect = document.getElementById('detailMembershipType')
      const detailPaymentAmountInput = document.getElementById('detailPaymentAmount')
      const detailPaymentDateInput = document.getElementById('detailPaymentDate')
      const detailPaymentAddBtn = document.getElementById('detailPaymentAddBtn')
      const detailNotesInput = document.getElementById('detailNotes')
      const detailPaymentTotalEl = document.getElementById('detailPaymentTotal')
      const matchFeedbackList = document.getElementById('matchFeedbackList')
      const matchFeedbackEmptyState = document.getElementById('matchFeedbackEmpty')
      const matchFeedbackRoundInput = document.getElementById('matchFeedbackRound')
      const matchFeedbackPartnerInput = document.getElementById('matchFeedbackPartner')
      const matchFeedbackRatingSelect = document.getElementById('matchFeedbackRating')
      const matchFeedbackNoteInput = document.getElementById('matchFeedbackNote')
      const matchFeedbackSaveBtn = document.getElementById('matchFeedbackSaveBtn')
      const moimDetailView = document.getElementById('moimDetailView')
      const detailScheduleInfo = document.getElementById('detailScheduleInfo')
      const detailAttachmentsSection = document.getElementById('detailAttachmentsSection')
      const detailIdCardItem = document.getElementById('detailIdCardItem')
      const detailIdCardLink = document.getElementById('detailIdCardLink')
      const detailEmploymentItem = document.getElementById('detailEmploymentItem')
      const detailEmploymentLink = document.getElementById('detailEmploymentLink')
      const detailPhotosItem = document.getElementById('detailPhotosItem')
      const detailPhotosGrid = document.getElementById('detailPhotosGrid')
      const detailPhotoFaceBtn = document.getElementById('detailPhotoFaceBtn')
      const detailPhotoFullBtn = document.getElementById('detailPhotoFullBtn')
      const detailPhotoFaceInput = document.getElementById('detailPhotoFaceInput')
      const detailPhotoFullInput = document.getElementById('detailPhotoFullInput')
      const detailIdCardUploadBtn = document.getElementById('detailIdCardUploadBtn')
      const detailEmploymentUploadBtn = document.getElementById('detailEmploymentUploadBtn')
      const profileCardModal = document.getElementById('profileCardModal')
      const profileCardPreviewEl = document.getElementById('profileCardPreview')
      const profileCardCloseBtn = document.getElementById('profileCardCloseBtn')
      const detailIdCardUploadInput = document.getElementById('detailIdCardUploadInput')
      const detailEmploymentUploadInput = document.getElementById('detailEmploymentUploadInput')
      const detailAttachmentUploadStatus = document.getElementById('detailAttachmentUploadStatus')
      const detailIdCardDeleteBtn = document.getElementById('detailIdCardDeleteBtn')
      const detailEmploymentDeleteBtn = document.getElementById('detailEmploymentDeleteBtn')
      const detailDraftLoadBtn = document.getElementById('detailDraftLoadBtn')
      const paymentHistoryList = document.getElementById('paymentHistoryList')
      const paymentHistoryEmpty = document.getElementById('paymentHistoryEmpty')
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
      let detailCurrentRecord = null
      let detailPhotoUploads = []
      let detailDocumentUploads = {
        idCard: null,
        employmentProof: null,
      }
      let detailPaymentEntries = []
      const detailDocumentDirty = new Set()
      const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
      const UPLOAD_SIZE_LABEL = '10MB'
      const pendingUploadPaths = new Set()
      let firebaseStorageInstance = null
      let firebaseInitPromise = null
      let firebaseInitError = null
      let depositStatusUpdating = false
      let activeDetailSectionId = null
      let matchSelectedMemberId = null
      let matchSelectionTargetId = null
      let matchModalHideTimer = null
      let profileCardHideTimer = null
      let matchSelectedCandidates = []
      let matchHistory = loadMatchHistory()
      const matchedCandidateIds = new Set(
        matchHistory.map((entry) => entry.candidateId).filter(Boolean),
      )
      let matchSelectionTargetPhoneKey = ''
      let profileCardRecord = null
      let matchLatestResults = []
      let matchLatestAiRequestId = 0
      const matchAiInsightCache = new Map()
      let matchAiFeatureDisabled = false
      const viewState = {
        search: '',
        status: 'all',
        gender: 'all',
        height: 'all',
        sort: 'latest',
        weekRange: IS_MOIM_VIEW ? getCurrentWeekRange() : null,
      }
      const HEIGHT_PREFERENCE_MAP = [
        { label: '160cm 이하', min: 0, max: 160 },
        { label: '161-165cm', min: 161, max: 165 },
        { label: '166-170cm', min: 166, max: 170 },
        { label: '171-175cm', min: 171, max: 175 },
        { label: '176-180cm', min: 176, max: 180 },
        { label: '181cm 이상', min: 181, max: Infinity },
      ]
      const AGE_PREFERENCE_MAP = [
        { label: '20대 초반', min: 20, max: 24 },
        { label: '20대 중반', min: 25, max: 27 },
        { label: '20대 후반', min: 28, max: 29 },
        { label: '30대 초반', min: 30, max: 33 },
        { label: '30대 중반', min: 34, max: 36 },
        { label: '30대 후반 이상', min: 37, max: 80 },
      ]
      const MATCH_RESULT_LIMIT = null
      const HAS_MATCH_RESULT_LIMIT =
        Number.isFinite(MATCH_RESULT_LIMIT) && MATCH_RESULT_LIMIT > 0
      const MATCH_RESULT_LIMIT_VALUE = HAS_MATCH_RESULT_LIMIT ? MATCH_RESULT_LIMIT : Infinity
      const MATCH_SCORE_MAX = 3
      const MATCH_HISTORY_STORAGE_KEY = 'ygsa_match_history_v1'
      const MATCH_HISTORY_RESYNC_KEY = 'ygsa_match_history_resync_at'
      const MATCH_HISTORY_RESYNC_INTERVAL_MS = 6 * 60 * 60 * 1000
      const MATCH_HISTORY_CATEGORY = {
        INTRO: 'intro',
        CONFIRMED: 'confirmed',
      }
      const MATCH_FEEDBACK_MAX = 12
      let genderStatsData = { male: 0, female: 0 }
      let referralStatsData = { total: 0, breakdown: [] }
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
      updateMatchSelectionSummary()
      updateMatchHistoryUI()
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
      matchFeedbackSaveBtn?.addEventListener('click', (event) => {
        event.preventDefault()
        handleMatchFeedbackSave()
      })
      matchFeedbackList?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null
        if (!target) return
        const deleteButton = target.closest('.match-feedback-entry-delete')
        if (deleteButton) {
          const entry = deleteButton.closest('.match-feedback-entry')
          entry?.remove()
          updateMatchFeedbackEmptyState()
          resetMatchFeedbackForm()
        }
      })
      detailPhotoFaceBtn?.addEventListener('click', () => detailPhotoFaceInput?.click())
      detailPhotoFullBtn?.addEventListener('click', () => detailPhotoFullInput?.click())
      detailPhotoFaceInput?.addEventListener('change', (event) =>
        handlePhotoUploadInputChange(event, 'face'),
      )
      detailPhotoFullInput?.addEventListener('change', (event) =>
        handlePhotoUploadInputChange(event, 'full'),
      )
      detailIdCardUploadBtn?.addEventListener('click', () => detailIdCardUploadInput?.click())
      detailEmploymentUploadBtn?.addEventListener('click', () =>
        detailEmploymentUploadInput?.click(),
      )
      detailIdCardUploadInput?.addEventListener('change', (event) =>
        handleDocumentUploadInputChange(event, 'idCard'),
      )
      detailEmploymentUploadInput?.addEventListener('change', (event) =>
        handleDocumentUploadInputChange(event, 'employmentProof'),
      )
      detailIdCardDeleteBtn?.addEventListener('click', () => handleDocumentDelete('idCard'))
      detailEmploymentDeleteBtn?.addEventListener('click', () =>
        handleDocumentDelete('employmentProof'),
      )
      detailPhotosGrid?.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof HTMLElement)) return
        const actionButton = target.closest('[data-attachment-action]')
        if (!actionButton) return
        const action = actionButton.dataset.attachmentAction
        const attachmentId = actionButton.dataset.attachmentId
        if (!attachmentId) return
        if (action === 'delete' && actionButton.dataset.attachmentType === 'photo') {
          handlePhotoDelete(attachmentId)
          return
        }
        if (action === 'move') {
          const direction = actionButton.dataset.direction === 'up' ? -1 : 1
          handlePhotoReorder(attachmentId, direction)
        }
      })
      profileCardCloseBtn?.addEventListener('click', closeProfileCardModal)
      profileCardModal?.addEventListener('click', (event) => {
        if (event.target === profileCardModal) {
          closeProfileCardModal()
        }
      })
      if (detailValuesSelect) {
        detailValuesSelect.addEventListener('change', () =>
          enforceMultiSelectLimit(detailValuesSelect, 1),
        )
      }
      genderChartBtn?.addEventListener('click', () => openGenderChartModal())
      genderChartCloseBtn?.addEventListener('click', () => closeGenderChartModal())
      genderChartModal?.addEventListener('click', (event) => {
        if (event.target === genderChartModal) closeGenderChartModal()
      })
      referralChartBtn?.addEventListener('click', () => openReferralChartModal())
      referralChartCloseBtn?.addEventListener('click', () => closeReferralChartModal())
      referralChartModal?.addEventListener('click', (event) => {
        if (event.target === referralChartModal) closeReferralChartModal()
      })
      matchBtn?.addEventListener('click', () => openMatchModal())
      matchedCouplesBtn?.addEventListener('click', () => {
        renderMatchedCouplesModal()
        openMatchedCouplesModal()
      })
      matchedCouplesCloseBtn?.addEventListener('click', closeMatchedCouplesModal)
      matchedCouplesModal?.addEventListener('click', (event) => {
        if (event.target === matchedCouplesModal) {
          closeMatchedCouplesModal()
        }
      })
      matchCloseBtn?.addEventListener('click', closeMatchModal)
      matchModal?.addEventListener('click', (event) => {
        if (event.target === matchModal) closeMatchModal()
      })
      matchTargetInput?.addEventListener('change', () => {
        handleMatchTargetSelection()
        runMatchRecommendation()
      })
      matchTargetInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          handleMatchTargetSelection()
          runMatchRecommendation()
        }
      })
      matchTargetInput?.addEventListener('blur', () => handleMatchTargetSelection(false))
      matchResultsList?.addEventListener('click', handleMatchResultsClick)
      matchSelectionList?.addEventListener('click', handleMatchSelectionClick)
      matchHistoryList?.addEventListener('click', handleMatchHistoryClick)
      matchResetBtn?.addEventListener('click', () => clearMatchTarget())
      matchedCouplesList?.addEventListener('click', handleMatchedCouplesListClick)
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
        const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''
        if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'q') {
          event.preventDefault()
          if (matchModal?.hidden) {
            openMatchModal()
          } else {
            closeMatchModal()
          }
          return
        }
        if (event.key !== 'Escape') return
        if (weeklyModal && !weeklyModal.hidden) {
          closeWeeklyModal()
          return
        }
        if (!detailModal.hidden) {
          closeDetailModal()
          return
        }
        if (profileCardModal && !profileCardModal.hidden) {
          closeProfileCardModal()
          return
        }
        if (matchModal && !matchModal.hidden) {
          closeMatchModal()
          return
        }
        if (referralChartModal && !referralChartModal.hidden) {
          closeReferralChartModal()
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
      if (statusFilter) {
        statusFilter.addEventListener('change', (event) => {
          viewState.status = event.target.value
          render()
        })
      }
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
          syncMatchMemberOptions()
          updateStats()
          render()
          await refreshMatchHistoryFromServer()
          if (!calendarModal.hidden) {
            refreshCalendar(true)
          }
          maybeApplyPendingMatchSelection()
          refreshMatchedCouplesFromServer()
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
        updateGenderStatsDisplay(prepared)
        updateReferralStats(prepared)
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
        const ratingChip = buildMatchRatingChip(item)
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
                ${ratingChip}
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
          ${renderCardPreferences(item)}
          ${renderCardAttachments(item)}
          ${renderProfileCardButtonSection(item.id)}
        `
        return card
      }

      function buildMatchRatingChip(record) {
        if (!record || record.phoneConsultStatus !== 'done') return ''
        const average = Number(record.matchRatingAverage)
        if (!Number.isFinite(average) || average <= 0) return ''
        const ratingCount = Array.isArray(record.matchReviews)
          ? record.matchReviews.filter((entry) => Number(entry.rating) > 0).length
          : 0
        const displayValue = average.toFixed(1)
        const countLabel = ratingCount ? ` · ${ratingCount}회` : ''
        return `
          <span class="match-rating-chip" title="평균 평점 ${displayValue}${countLabel}">
            ⭐ ${displayValue}
          </span>
        `
      }

      function renderCardPreferences(record) {
        if (!record) return ''
        const entries = []
        if (record.preferredHeightLabel) {
          entries.push(`
            <li class="card-preferences-item">
              <span>선호 키</span>
              <strong>${escapeHtml(record.preferredHeightLabel)}</strong>
            </li>
          `)
        }
        if (record.preferredAgeLabel) {
          entries.push(`
            <li class="card-preferences-item">
              <span>선호 나이</span>
              <strong>${escapeHtml(record.preferredAgeLabel)}</strong>
            </li>
          `)
        }
        if (!entries.length) return ''
        return `
          <div class="card-preferences">
            <p class="card-preferences-title">선호 조건</p>
            <ul class="card-preferences-list">
              ${entries.join('')}
            </ul>
          </div>
        `
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
          ${renderProfileCardButtonSection(item.id)}
        `
        return card
      }

      function renderProfileCardButtonSection(id) {
        if (!id) return ''
        const safeId = escapeHtml(id)
        return `
          <div class="card-actions">
            <button type="button" class="profile-card-btn" data-profile-card-id="${safeId}">
              프로필 카드 보기
            </button>
          </div>
        `
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

      function generateMatchFeedbackId() {
        return `mfb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      }

      function clearMatchFeedbackEntries() {
        if (!matchFeedbackList) return
        matchFeedbackList.innerHTML = ''
        updateMatchFeedbackEmptyState()
      }

      function updateMatchFeedbackEmptyState() {
        if (!matchFeedbackEmptyState) return
        const hasItems = Boolean(
          matchFeedbackList?.querySelector &&
            matchFeedbackList.querySelector('.match-feedback-entry'),
        )
        matchFeedbackEmptyState.hidden = hasItems
      }

      function encodeFeedbackComment(value) {
        return encodeURIComponent(value || '')
      }

      function decodeFeedbackComment(value) {
        if (!value) return ''
        try {
          return decodeURIComponent(value)
        } catch (error) {
          return value
        }
      }

      function getMatchFeedbackEntryCount() {
        if (!matchFeedbackList) return 0
        return matchFeedbackList.querySelectorAll('.match-feedback-entry').length
      }

      function formatMatchFeedbackComment(comment) {
        if (!comment) {
          return '<span class="match-feedback-entry-comment-empty">내용 미입력</span>'
        }
        return escapeHtml(comment).replace(/\n/g, '<br />')
      }

      function createMatchFeedbackEntryElement(entry) {
        const item = document.createElement('li')
        item.className = 'match-feedback-entry'
        const entryId = typeof entry.id === 'string' && entry.id ? entry.id : generateMatchFeedbackId()
        const roundLabel =
          typeof entry.roundLabel === 'string' && entry.roundLabel.trim()
            ? entry.roundLabel.trim()
            : '회차 미입력'
        const partnerName = typeof entry.partnerName === 'string' ? entry.partnerName.trim() : ''
        const ratingValue = Number(entry.rating)
        const hasRating = Number.isFinite(ratingValue) && ratingValue >= 1 && ratingValue <= 5
        const comment = typeof entry.comment === 'string' ? entry.comment : ''
        const recordedAt = entry.recordedAt || ''
        item.dataset.feedbackId = entryId
        item.dataset.roundLabel = roundLabel
        item.dataset.partnerName = partnerName
        item.dataset.rating = hasRating ? String(ratingValue) : ''
        item.dataset.comment = encodeFeedbackComment(comment)
        item.dataset.recordedAt = recordedAt
        const details = []
        if (partnerName) {
          details.push(`<span>${escapeHtml(partnerName)}</span>`)
        }
        if (hasRating) {
          details.push(`<span class="match-feedback-entry-score">평점 ${ratingValue}점</span>`)
        }
        const timestampLabel = recordedAt ? formatDate(recordedAt) : ''
        item.innerHTML = `
          <div class="match-feedback-entry-head">
            <div class="match-feedback-entry-details">
              <strong>${escapeHtml(roundLabel)}</strong>
              ${details.join('')}
            </div>
            <div class="match-feedback-entry-actions">
              ${
                timestampLabel
                  ? `<span class="match-feedback-entry-time">${escapeHtml(timestampLabel)}</span>`
                  : ''
              }
              <button type="button" class="match-feedback-entry-delete" aria-label="후기 삭제">
                삭제
              </button>
            </div>
          </div>
          <p class="match-feedback-entry-comment">${formatMatchFeedbackComment(comment)}</p>
        `
        return item
      }

      function appendMatchFeedbackEntry(entry) {
        if (!matchFeedbackList) return null
        const item = createMatchFeedbackEntryElement(entry)
        matchFeedbackList.appendChild(item)
        updateMatchFeedbackEmptyState()
        return item
      }

      function renderMatchFeedbackEntries(entries) {
        if (!matchFeedbackList) return
        clearMatchFeedbackEntries()
        const source = Array.isArray(entries) ? entries.slice() : []
        if (source.length) {
          source
            .sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0))
            .forEach((entry) => appendMatchFeedbackEntry(entry))
        }
        updateMatchFeedbackEmptyState()
        resetMatchFeedbackForm()
      }

      function resetMatchFeedbackForm() {
        const nextIndex = getMatchFeedbackEntryCount() + 1
        if (matchFeedbackRoundInput) {
          matchFeedbackRoundInput.value = `${nextIndex}회차`
        }
        if (matchFeedbackPartnerInput) {
          matchFeedbackPartnerInput.value = ''
        }
        if (matchFeedbackRatingSelect) {
          matchFeedbackRatingSelect.value = ''
        }
        if (matchFeedbackNoteInput) {
          matchFeedbackNoteInput.value = ''
        }
      }

      resetMatchFeedbackForm()

      function handleMatchFeedbackSave() {
        if (!matchFeedbackList) return
        const currentCount = getMatchFeedbackEntryCount()
        if (currentCount >= MATCH_FEEDBACK_MAX) {
          showToast(`후기는 최대 ${MATCH_FEEDBACK_MAX}개까지 저장할 수 있습니다.`)
          return
        }
        const roundLabel = matchFeedbackRoundInput?.value.trim() || ''
        const partnerName = matchFeedbackPartnerInput?.value.trim() || ''
        const comment = matchFeedbackNoteInput?.value.trim() || ''
        const ratingValueRaw = Number(matchFeedbackRatingSelect?.value)
        const ratingValue =
          Number.isFinite(ratingValueRaw) && ratingValueRaw >= 1 && ratingValueRaw <= 5
            ? ratingValueRaw
            : null
        if (!roundLabel && !partnerName && !comment && ratingValue == null) {
          showToast('후기 내용을 입력해주세요.')
          return
        }
        const entry = {
          id: generateMatchFeedbackId(),
          roundLabel: roundLabel || `${currentCount + 1}회차`,
          partnerName,
          rating: ratingValue,
          comment,
          recordedAt: new Date().toISOString(),
        }
        appendMatchFeedbackEntry(entry)
        resetMatchFeedbackForm()
      }

      function collectMatchFeedbackEntries() {
        if (!matchFeedbackList) return []
        const items = Array.from(matchFeedbackList.querySelectorAll('.match-feedback-entry'))
        return items
          .map((item, index) => {
            const roundLabel = item.dataset.roundLabel || ''
            const partnerName = item.dataset.partnerName || ''
            const ratingValue = Number(item.dataset.rating)
            const hasRating = Number.isFinite(ratingValue) && ratingValue >= 1 && ratingValue <= 5
            const comment = decodeFeedbackComment(item.dataset.comment || '')
            const hasContent = roundLabel || partnerName || comment || hasRating
            if (!hasContent) return null
            const storedId = item.dataset.feedbackId || generateMatchFeedbackId()
            const recordedAt = item.dataset.recordedAt || new Date().toISOString()
            return {
              id: storedId,
              sequence: index + 1,
              roundLabel,
              partnerName,
              rating: hasRating ? ratingValue : null,
              comment,
              recordedAt,
            }
          })
          .filter(Boolean)
      }

      function sanitizePaymentAmount(value) {
        if (value == null) return ''
        const digits = String(value).replace(/[^\d]/g, '')
        if (!digits) return ''
        const trimmed = digits.replace(/^0+/, '')
        return trimmed || '0'
      }

      function formatPaymentAmountLabel(value) {
        const digits = sanitizePaymentAmount(value)
        if (!digits) return ''
        return `${Number(digits).toLocaleString('ko-KR')}원`
      }

      function setupPaymentAmountInput() {
        if (!detailPaymentAmountInput) return
        const applyFormattedValue = () => {
          const digits = sanitizePaymentAmount(detailPaymentAmountInput.value)
          if (!digits) {
            detailPaymentAmountInput.value = ''
            return
          }
          const formatted = `${Number(digits).toLocaleString('ko-KR')}원`
          detailPaymentAmountInput.value = formatted
          const caretPos = Math.max(0, formatted.length - 1)
          requestAnimationFrame(() => {
            detailPaymentAmountInput.setSelectionRange(caretPos, caretPos)
          })
        }
        detailPaymentAmountInput.addEventListener('input', applyFormattedValue)
        detailPaymentAmountInput.addEventListener('focus', applyFormattedValue)
        detailPaymentAmountInput.addEventListener('blur', applyFormattedValue)
      }
      function handlePaymentHistoryAdd() {
        if (!detailCurrentRecord) {
          showToast('대상을 찾을 수 없습니다.')
          return
        }
        const membershipType = detailMembershipTypeSelect?.value?.trim() || ''
        const paymentAmount = sanitizePaymentAmount(detailPaymentAmountInput?.value || '')
        const paymentDateValue = detailPaymentDateInput?.value?.trim() || ''
        if (!membershipType && !paymentAmount && !paymentDateValue) {
          showToast('회원권, 결제 대금 또는 입금 날짜를 입력해주세요.')
          return
        }
        const normalized = normalizePaymentHistoryEntry(
          {
            id: `temp_${Date.now()}`,
            membershipType,
            paymentAmount,
            paymentDate: paymentDateValue,
            recordedAt: new Date().toISOString(),
          },
          0,
        )
        if (!normalized) {
          showToast('결제 정보를 다시 확인해주세요.')
          return
        }
        detailPaymentEntries = [normalized, ...detailPaymentEntries]
        detailCurrentRecord.paymentHistory = detailPaymentEntries.slice()
        detailCurrentRecord.membershipType = normalized.membershipType
        detailCurrentRecord.paymentAmount = normalized.paymentAmount
        detailCurrentRecord.paymentDate = normalized.paymentDate
        renderPaymentHistory(detailPaymentEntries)
        setSelectValue(detailMembershipTypeSelect, '')
        if (detailPaymentAmountInput) {
          detailPaymentAmountInput.value = ''
          detailPaymentAmountInput.dispatchEvent(new Event('blur'))
        }
        if (detailPaymentDateInput) detailPaymentDateInput.value = ''
      }
      setupPaymentAmountInput()
      detailPaymentAddBtn?.addEventListener('click', handlePaymentHistoryAdd)

      function normalizePaymentHistoryEntry(entry, index = 0) {
        if (!entry || typeof entry !== 'object') return null
        const membershipType =
          entry.membershipType != null ? String(entry.membershipType).trim() : ''
        const paymentAmount = sanitizePaymentAmount(entry.paymentAmount ?? entry.amount ?? '')
        const paymentDateRaw =
          typeof entry.paymentDate === 'string' && entry.paymentDate.trim()
            ? entry.paymentDate.trim()
            : typeof entry.depositDate === 'string' && entry.depositDate.trim()
            ? entry.depositDate.trim()
            : ''
        const memo = entry.memo != null ? String(entry.memo).trim() : ''
        let recordedAt = ''
        const recordedSource = entry.recordedAt || entry.savedAt || ''
        if (recordedSource) {
          const parsed = new Date(recordedSource)
          if (!Number.isNaN(parsed.getTime())) {
            recordedAt = parsed.toISOString()
          }
        }
        if (!membershipType && !paymentAmount && !paymentDateRaw && !memo) {
          return null
        }
        const id =
          typeof entry.id === 'string' && entry.id.trim()
            ? entry.id.trim()
            : `pay_${index + 1}`
        return {
          id,
          membershipType,
          paymentAmount,
          paymentDate: paymentDateRaw,
          memo,
          recordedAt,
        }
      }

      function getPaymentHistoryEntries(record) {
        if (!record) return []
        const source = Array.isArray(record.paymentHistory) ? record.paymentHistory.slice() : []
        if (!source.length) {
          const fallback = normalizePaymentHistoryEntry(
            {
              membershipType: record.membershipType,
              paymentAmount: record.paymentAmount,
              paymentDate: record.paymentDate,
            },
            0,
          )
          if (fallback) {
            source.push(fallback)
          }
        }
        source.sort((a, b) => {
          const aTime = a.recordedAt ? new Date(a.recordedAt).getTime() : 0
          const bTime = b.recordedAt ? new Date(b.recordedAt).getTime() : 0
          return bTime - aTime
        })
        return source
      }

      function getLatestPaymentEntry(record) {
        if (!record) return null
        const history = getPaymentHistoryEntries(record)
        if (history.length) return history[0]
        if (
          record.membershipType ||
          record.paymentAmount ||
          record.paymentDate
        ) {
          return {
            membershipType: record.membershipType || '',
            paymentAmount: record.paymentAmount || '',
            paymentDate: record.paymentDate || '',
          }
        }
        return null
      }

      function getPaymentTotalAmount(entries) {
        if (!Array.isArray(entries) || !entries.length) return 0
        return entries.reduce((sum, entry) => {
          const digits = sanitizePaymentAmount(entry?.paymentAmount || '')
          const amount = digits ? Number(digits) : 0
          return sum + (Number.isFinite(amount) ? amount : 0)
        }, 0)
      }

      function updatePaymentTotalDisplay(entries) {
        if (!detailPaymentTotalEl) return
        const totalAmount = getPaymentTotalAmount(entries)
        if (totalAmount > 0) {
          detailPaymentTotalEl.textContent = `총 결제 금액 ${totalAmount.toLocaleString('ko-KR')}원`
          detailPaymentTotalEl.classList.remove('payment-total-empty')
        } else {
          detailPaymentTotalEl.textContent = '총 결제 금액 0원'
          detailPaymentTotalEl.classList.add('payment-total-empty')
        }
      }

      function renderPaymentHistory(source) {
        if (!paymentHistoryList || !paymentHistoryEmpty) return
        if (Array.isArray(source)) {
          detailPaymentEntries = source.slice()
        } else if (source) {
          detailPaymentEntries = getPaymentHistoryEntries(source)
        }
        const entries = Array.isArray(detailPaymentEntries) ? detailPaymentEntries : []
        updatePaymentTotalDisplay(entries)
        paymentHistoryList.innerHTML = ''
        if (!entries.length) {
          paymentHistoryEmpty.hidden = false
          return
        }
        paymentHistoryEmpty.hidden = true
        entries.forEach((entry, index) => {
          const item = document.createElement('li')
          item.className = 'payment-history-item'
          const membershipLabel = entry.membershipType || '-'
          const amountLabel = formatPaymentAmountLabel(entry.paymentAmount) || '-'
          const depositLabel = entry.paymentDate || '-'
          const recordedLabel = entry.recordedAt ? formatDate(entry.recordedAt) : ''
          const orderLabel = `${index + 1}회차`
          item.innerHTML = `
            <div class="payment-history-line">
              <span>회원권 · ${escapeHtml(orderLabel)}</span>
              <strong>${escapeHtml(membershipLabel || '-')}</strong>
            </div>
            <div class="payment-history-line">
              <span>결제 대금</span>
              <strong>${escapeHtml(amountLabel || '-')}</strong>
            </div>
            <div class="payment-history-line">
              <span>입금 날짜</span>
              <strong>${escapeHtml(depositLabel || '-')}</strong>
            </div>
            ${entry.memo ? `<p class="payment-history-memo">${escapeHtml(entry.memo)}</p>` : ''}
            ${
              recordedLabel
                ? `<p class="payment-history-meta">기록 시각 ${escapeHtml(recordedLabel)}</p>`
                : ''
            }
          `
          paymentHistoryList.appendChild(item)
        })
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

        detailCurrentRecord = record
        detailPhotoUploads = Array.isArray(record.photos) ? record.photos.slice() : []
        const currentDocuments =
          record?.documents && typeof record.documents === 'object' ? record.documents : {}
        detailDocumentUploads = {
          idCard: currentDocuments.idCard || null,
          employmentProof: currentDocuments.employmentProof || null,
        }
        detailDocumentDirty.clear()
        if (!detailCurrentRecord.documents) {
          detailCurrentRecord.documents = { ...currentDocuments }
        }
        setAttachmentUploadStatus('')

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
        setSelectValue(detailReferralSourceSelect, record.referralSource || '')
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
        if (detailPreferredHeightMinInput)
          detailPreferredHeightMinInput.value = record.preferredHeightMin || ''
        if (detailPreferredHeightMaxInput)
          detailPreferredHeightMaxInput.value = record.preferredHeightMax || ''
        if (detailPreferredAgeYoungestInput)
          detailPreferredAgeYoungestInput.value = record.preferredAgeYoungest || ''
        if (detailPreferredAgeOldestInput)
          detailPreferredAgeOldestInput.value = record.preferredAgeOldest || ''
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
        renderMatchFeedbackEntries(record.matchReviews || [])
        const latestPaymentEntry = getLatestPaymentEntry(record)
        if (detailMembershipTypeSelect)
          setSelectValue(detailMembershipTypeSelect, latestPaymentEntry?.membershipType || '')
        if (detailPaymentAmountInput)
          detailPaymentAmountInput.value = formatPaymentAmountLabel(
            latestPaymentEntry?.paymentAmount || '',
          )
        if (detailPaymentDateInput)
          detailPaymentDateInput.value = latestPaymentEntry?.paymentDate || ''
        renderPaymentHistory(getPaymentHistoryEntries(record))

        const { date: scheduledDate, time: scheduledTime } = splitLocalDateTime(
          record.meetingSchedule,
        )
        detailDateInput.value = scheduledDate
        updateTimeOptions(scheduledDate, scheduledTime, id)
        detailNotesInput.value = record.notes || ''
        detailScheduleInfo.textContent = ''

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

        refreshDetailAttachments()
        const hasBasicSection = detailSectionButtons.some(
          (button) => button.dataset.detailSectionTarget === 'basic',
        )
        if (hasBasicSection) {
          setActiveDetailSection('basic')
        } else {
          resetDetailSectionTabs()
        }

        detailModal.hidden = false
        document.body.classList.add('modal-open')
        if (detailForm) detailForm.scrollTop = 0
      }

      function closeDetailModal(options = {}) {
        const keepPendingUploads = Boolean(options.keepPendingUploads)
        detailModal.hidden = true
        document.body.classList.remove('modal-open')
        if (detailForm) detailForm.scrollTop = 0
        detailRecordId = null
        detailCurrentRecord = null
        detailPhotoUploads = []
        detailDocumentUploads = { idCard: null, employmentProof: null }
        detailDocumentDirty.clear()
        setAttachmentUploadStatus('')
        if (keepPendingUploads) {
          pendingUploadPaths.clear()
        } else {
          cleanupPendingUploads().catch((error) =>
            console.warn('[firebase] pending cleanup failed', error),
          )
        }
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
        setSelectValue(detailReferralSourceSelect, '')
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
        if (detailPreferredHeightMinInput) detailPreferredHeightMinInput.value = ''
        if (detailPreferredHeightMaxInput) detailPreferredHeightMaxInput.value = ''
        if (detailPreferredAgeYoungestInput) detailPreferredAgeYoungestInput.value = ''
        if (detailPreferredAgeOldestInput) detailPreferredAgeOldestInput.value = ''
        setMultiSelectValues(detailPreferredLifestyleSelect, [])
        setSelectValue(detailPreferredAppearanceSelect, '')
        setMultiSelectValues(detailValuesSelect, [])
        detailValuesSelection = []
        if (detailValuesCustomInput) detailValuesCustomInput.value = ''
        if (detailSufficientConditionInput) detailSufficientConditionInput.value = ''
        if (detailNecessaryConditionInput) detailNecessaryConditionInput.value = ''
        if (detailLikesDislikesInput) detailLikesDislikesInput.value = ''
        if (detailAboutMeInput) detailAboutMeInput.value = ''
        if (detailMembershipTypeSelect) setSelectValue(detailMembershipTypeSelect, '')
        if (detailPaymentAmountInput) detailPaymentAmountInput.value = ''
        if (detailPaymentDateInput) detailPaymentDateInput.value = ''
        detailPaymentEntries = []
        renderPaymentHistory([])
        clearMatchFeedbackEntries()
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

      function renderProfileCard(record) {
        const slides = buildProfileCardSlides(record)
        const slideCount = slides.length || 1
        return `
          <div
            class="profile-card-slider"
            data-profile-card-slider
            data-slide-count="${slideCount}"
          >
            ${slides
              .map(
                (slide, index) => `
              <div
                class="profile-card-slide ${slide.className} ${index === 0 ? 'is-active' : ''}"
                data-profile-card-slide
                data-slide-index="${index}"
              >
                ${slide.content}
              </div>
            `,
              )
              .join('')}
            ${slideCount > 1 ? renderProfileCardSliderExtras(slideCount) : ''}
          </div>
        `
      }

      function buildProfileCardSlides(record) {
        const slides = []
        const facePhotos = getProfileCardPhotos(record, 'face')
        facePhotos.forEach((photo, index) => {
          slides.push({
            className: 'profile-card-slide-photo',
            content: renderProfileCardPhotoSlide(
              photo,
              `얼굴 사진 ${index + 1}`,
            ),
          })
        })
        const fullPhotos = getProfileCardPhotos(record, 'full')
        fullPhotos.forEach((photo, index) => {
          slides.push({
            className: 'profile-card-slide-photo',
            content: renderProfileCardPhotoSlide(photo, `전신 사진 ${index + 1}`),
          })
        })
        const infoContent = renderProfileCardInfoSection(record)
        if (infoContent) {
          slides.push({
            className: 'profile-card-slide-info',
            content: infoContent,
          })
        }
        const appealContent = renderProfileCardAppealSection(record)
        if (appealContent) {
          slides.push({
            className: 'profile-card-slide-info profile-card-slide-appeal',
            content: appealContent,
          })
        }
        return slides
      }

      function renderProfileCardSliderExtras(count) {
        return `
          <div class="profile-card-slider-hint" aria-hidden="true">탭/클릭 →</div>
          <div class="profile-card-slider-controls" role="group" aria-label="슬라이드 제어">
            <button
              type="button"
              class="profile-card-slider-arrow profile-card-slider-arrow-prev"
              data-slide-action="prev"
              aria-label="이전 슬라이드"
            >
              ‹
            </button>
            <button
              type="button"
              class="profile-card-slider-arrow profile-card-slider-arrow-next"
              data-slide-action="next"
              aria-label="다음 슬라이드"
            >
              ›
            </button>
          </div>
          <div class="profile-card-slider-dots" data-profile-card-dots role="tablist">
            ${Array.from({ length: count })
              .map(
                (_, index) => `
              <button
                type="button"
                class="profile-card-slider-dot ${index === 0 ? 'is-active' : ''}"
                data-slide-to="${index}"
                aria-label="${index + 1}번째 슬라이드 보기"
              ></button>
            `,
              )
              .join('')}
          </div>
        `
      }

      function renderProfileCardInfoSection(record) {
        if (!record) {
          return `
            <div class="profile-card-info">
              <span class="profile-card-info-label">회원 정보</span>
              <h2>연결사 회원</h2>
              <div class="profile-chip-row">
                <span class="profile-chip muted">정보 준비 중</span>
              </div>
              <div class="profile-card-stats">
                <div class="profile-card-stat">
                  <span>INFO</span>
                  <strong>업데이트 예정</strong>
                </div>
              </div>
            </div>
          `
        }
        const chips =
          getProfileCardChips(record)
            .map((chip) => `<span class="profile-chip">${escapeHtml(chip)}</span>`)
            .join('') || '<span class="profile-chip muted">정보 준비 중</span>'
        const stats =
          getProfileCardStats(record)
            .map(
              ({ label, value }) => `
                <div class="profile-card-stat">
                  <span>${escapeHtml(label)}</span>
                  <strong>${escapeHtml(value || '-')}</strong>
                </div>
              `,
            )
            .join('') || `
            <div class="profile-card-stat">
              <span>INFO</span>
              <strong>업데이트 예정</strong>
            </div>
          `
        const lifestyle =
          getProfileCardLifestyle(record)
            .map((item) => `<span class="profile-chip">${escapeHtml(item)}</span>`)
            .join('') || '<span class="profile-chip muted">라이프스타일 업데이트 예정</span>'
        return `
          <div class="profile-card-info">
            <span class="profile-card-info-label">회원 정보</span>
            <h2>${escapeHtml(getProfileCardDisplayName(record))}</h2>
            <div class="profile-chip-row">
              ${chips}
            </div>
            <div class="profile-card-stats">
              ${stats}
            </div>
            <div class="profile-card-lifestyle">
              <span class="label">선호 라이프스타일</span>
              <div class="profile-chip-row">
                ${lifestyle}
              </div>
            </div>
          </div>
        `
      }

      function renderProfileCardAppealSection(record) {
        const blocks = getProfileCardAppealBlocks(record)
        const body =
          blocks.length > 0
            ? blocks
                .map(
                  ({ label, value }) => `
                <section class="profile-card-appeal-block">
                  <span class="label">${escapeHtml(label)}</span>
                  <p>${formatProfileCardAppealValue(value)}</p>
                </section>
              `,
                )
                .join('')
            : `<p class="profile-card-appeal-empty">추가 어필 정보가 준비 중입니다.</p>`
        return `
          <div class="profile-card-info profile-card-info-appeal">
            <div class="profile-card-appeal-header">
              <span class="profile-card-info-label">추가 어필</span>
              <span class="profile-card-appeal-pill">연결사 추천</span>
            </div>
            <div class="profile-card-appeal-body">
              ${body}
            </div>
          </div>
        `
      }

      function getProfileCardDisplayName(record) {
        if (!record || typeof record !== 'object') {
          return '연결사 회원'
        }
        if (record.characterName) {
          return record.characterName
        }
        if (profileCardNameCache.has(record)) {
          return profileCardNameCache.get(record)
        }
        const seedSource =
          record.id ||
          record.uuid ||
          record.key ||
          record.phoneNumber ||
          record.phone ||
          record.email ||
          record.createdAt ||
          record.consultingDate
        const alias = getRandomProfileCardName(seedSource)
        profileCardNameCache.set(record, alias)
        return alias
      }

      function getRandomProfileCardName(seedSource) {
        const pool = Array.isArray(PROFILE_CARD_CHARACTER_NAMES)
          ? PROFILE_CARD_CHARACTER_NAMES
          : []
        if (!pool.length) {
          return '연결사 회원'
        }
        if (seedSource !== undefined && seedSource !== null) {
          const seedString = String(seedSource).trim()
          if (seedString) {
            const hash = seedString
              .split('')
              .reduce((acc, char) => acc + char.charCodeAt(0), 0)
            return pool[hash % pool.length]
          }
        }
        const randomIndex = Math.floor(Math.random() * pool.length)
        return pool[randomIndex]
      }

      function renderProfileCardPhotoSlide(photo, fallbackLabel) {
        if (!photo?.source) return ''
        const label = fallbackLabel || '프로필 사진'
        return `
          <div class="profile-card-photo">
            <img src="${escapeHtml(photo.source)}" alt="${escapeHtml(label)}" loading="lazy" />
            <span class="profile-card-photo-label">${escapeHtml(label)}</span>
          </div>
        `
      }

      function getProfileCardPhotos(record, preferredType) {
        if (!record) return []
        const normalized = preferredType === 'full' ? 'full' : 'face'
        const photos = Array.isArray(record.photos) ? record.photos : []
        const seen = new Set()
        return photos
          .map((photo) => {
            const role = getProfilePhotoRole(photo)
            if (!isProfilePhotoRoleMatch(role, normalized)) return null
            const source = getFileSource(photo)
            if (!source || seen.has(source)) return null
            seen.add(source)
            return {
              source,
              label: photo.name || (normalized === 'face' ? '얼굴 사진' : '전신 사진'),
            }
          })
          .filter(Boolean)
      }

      function getProfilePhotoRole(photo) {
        const meta = photo?.meta || {}
        return String(
          photo?.role || meta.type || meta.category || meta.tag || meta.label || '',
        )
          .trim()
          .toLowerCase()
      }

      function isProfilePhotoRoleMatch(role, preferredType) {
        if (!role) return false
        if (preferredType === 'full') {
          return /full|body|전신/.test(role)
        }
        return /face|프로필|상반|portrait/.test(role)
      }

      function initProfileCardSlider(previewEl) {
        if (!previewEl) return
        const slider = previewEl.querySelector('[data-profile-card-slider]')
        if (!slider || slider.dataset.initialized === 'true') return
        slider.dataset.initialized = 'true'
        slider.dataset.currentIndex = '0'
        slider.tabIndex = 0
        slider.addEventListener('click', handleProfileCardSliderClick)
        slider.addEventListener('keydown', handleProfileCardSliderKeydown)
      }

      function handleProfileCardSliderClick(event) {
        const slider = event.currentTarget
        const dot = event.target.closest('[data-slide-to]')
        if (dot) {
          event.stopPropagation()
          setProfileCardSliderIndex(slider, Number(dot.dataset.slideTo || 0))
          return
        }
        const arrow = event.target.closest('[data-slide-action]')
        if (arrow) {
          event.stopPropagation()
          const action = arrow.dataset.slideAction
          advanceProfileCardSlider(slider, action === 'prev' ? -1 : 1)
          return
        }
        const interactive = event.target.closest('button, a')
        if (interactive && !interactive.dataset.slideTo && !interactive.dataset.slideAction) return
        const rect = slider.getBoundingClientRect?.()
        if (rect && Number.isFinite(rect.width) && rect.width > 0) {
          const clickX = event.clientX ?? rect.left
          const relativeX = clickX - rect.left
          const goPrev = relativeX < rect.width / 2
          advanceProfileCardSlider(slider, goPrev ? -1 : 1)
        } else {
          advanceProfileCardSlider(slider)
        }
      }

      function handleProfileCardSliderKeydown(event) {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          advanceProfileCardSlider(event.currentTarget, 1)
          return
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          advanceProfileCardSlider(event.currentTarget, -1)
          return
        }
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          advanceProfileCardSlider(event.currentTarget, 1)
        }
      }

      function advanceProfileCardSlider(slider, step = 1) {
        if (!slider) return
        const slides = slider.querySelectorAll('[data-profile-card-slide]')
        const count = slides.length
        if (!count) return
        const current = Number(slider.dataset.currentIndex || 0)
        const next = (current + step + count) % count
        setProfileCardSliderIndex(slider, next)
      }

      function setProfileCardSliderIndex(slider, index) {
        if (!slider) return
        const slides = slider.querySelectorAll('[data-profile-card-slide]')
        const dots = slider.querySelectorAll('[data-slide-to]')
        const count = slides.length
        if (!count) return
        const nextIndex = Math.max(0, Math.min(count - 1, Number(index) || 0))
        slides.forEach((slide, idx) => {
          slide.classList.toggle('is-active', idx === nextIndex)
        })
        dots.forEach((dot) => {
          dot.classList.toggle('is-active', Number(dot.dataset.slideTo) === nextIndex)
        })
        slider.dataset.currentIndex = String(nextIndex)
      }

      function getProfileCardTagline(record) {
        if (record?.profileAppeal) return record.profileAppeal
        if (record?.aboutMe) return record.aboutMe
        if (record?.sufficientCondition) return record.sufficientCondition
        return '연결사가 엄선한 프리미엄 인연'
      }

      function getProfileCardAppealBlocks(record) {
        if (!record) return []
        const blocks = []
        const addBlock = (label, value) => {
          const text = typeof value === 'string' ? value.trim() : ''
          if (!text) return
          blocks.push({ label, value: text })
        }
        if (record.profileAppeal || record.aboutMe || record.sufficientCondition) {
          addBlock('대표 어필', getProfileCardTagline(record))
        }
        addBlock('충분 조건', record.sufficientCondition)
        addBlock('필수 조건', record.necessaryCondition)
        addBlock('선호 / 비선호', record.likesDislikes)
        const values = Array.isArray(record.values) ? record.values.filter(Boolean) : []
        if (values.length) {
          addBlock('가치관', values.join(' · '))
        }
        addBlock('가치관 (기타)', record.valuesCustom)
        addBlock('자기 소개', record.aboutMe)
        addBlock('노트', record.notes)
        return blocks
      }

      function formatProfileCardAppealValue(value) {
        const safe = typeof value === 'string' ? value : String(value || '')
        return escapeHtml(safe).replace(/\n/g, '<br />')
      }

      function getProfileCardChips(record) {
        const chips = []
        if (record?.job) chips.push(record.job)
        if (record?.education) chips.push(record.education)
        if (record?.district) chips.push(record.district)
        if (record?.university) chips.push(record.university)
        return chips.slice(0, 3)
      }

      function getProfileCardStats(record) {
        if (!record) return []
        const stats = [
          { label: 'BIRTH', value: formatProfileBirthLabel(record.birth) },
          { label: 'HEIGHT', value: normalizeHeightValue(record.height || record.region) || '-' },
          { label: 'CAREER', value: record.job || '-' },
          { label: 'MBTI', value: (record.mbti || '-').toUpperCase() },
        ]
        const salaryLabel = formatSalaryRange(record.salaryRange)
        const universityLabel =
          typeof record.university === 'string' ? record.university.trim() : ''
        if (salaryLabel) {
          stats.push({ label: 'SALARY', value: salaryLabel })
          if (universityLabel) {
            stats.push({ label: 'UNIV', value: universityLabel })
          }
        } else if (record.education) {
          stats.push({ label: 'EDU', value: record.education })
          if (universityLabel) {
            stats.push({ label: 'UNIV', value: universityLabel })
          }
        } else if (universityLabel) {
          stats.push({ label: 'UNIV', value: universityLabel })
        }
        return stats
      }

      function getProfileCardLifestyle(record) {
        if (!record) return []
        const preferred = Array.isArray(record.preferredLifestyle)
          ? record.preferredLifestyle.filter(Boolean)
          : []
        if (preferred.length) {
          return preferred.slice(0, 3)
        }
        if (record.likesDislikes) {
          return record.likesDislikes
            .split(/[,·]/)
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 3)
        }
        return []
      }

      function formatProfileBirthLabel(value) {
        const digits = String(value || '').replace(/[^0-9]/g, '')
        if (digits.length >= 4) {
          return `${digits.slice(0, 4)}`
        }
        return value || '-'
      }

      function formatProfileCardDate(value) {
        if (!value) return '신청 대기'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return '신청 대기'
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
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
      function parseBirthYearInput(value) {
        if (!value) return null
        const trimmed = String(value).trim()
        if (!trimmed) return null
        const fullMatch = trimmed.match(/(19|20)\d{2}/)
        if (fullMatch) {
          const year = Number(fullMatch[0])
          return Number.isFinite(year) ? year : null
        }
        const shortMatch = trimmed.match(/\d{2}/)
        if (!shortMatch) return null
        const short = Number(shortMatch[0])
        if (!Number.isFinite(short)) return null
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentTwoDigit = currentYear % 100
        const baseCentury = currentYear - currentTwoDigit
        const inferred =
          short <= currentTwoDigit ? baseCentury + short : baseCentury - 100 + short
        if (inferred < 1900 || inferred > currentYear) return null
        return inferred
      }
      function formatBirthYearLabel(year) {
        if (!Number.isFinite(year)) return ''
        return `${String(year).slice(-2)}년생`
      }
      function getHeightPreferenceLabels(minValue, maxValue) {
        const hasMin = Number.isFinite(minValue)
        const hasMax = Number.isFinite(maxValue)
        if (!hasMin && !hasMax) return []
        const rangeMin = hasMin ? minValue : 0
        const rangeMax = hasMax ? maxValue : Infinity
        return HEIGHT_PREFERENCE_MAP.filter(({ min, max }) => {
          const start = Math.max(rangeMin, min)
          const end = Math.min(rangeMax, max)
          return start <= end
        }).map(({ label }) => label)
      }
      function getAgePreferenceLabels(minAge, maxAge) {
        const hasMin = Number.isFinite(minAge)
        const hasMax = Number.isFinite(maxAge)
        if (!hasMin && !hasMax) return []
        const rangeMin = hasMin ? minAge : AGE_PREFERENCE_MAP[0].min
        const rangeMax = hasMax ? maxAge : AGE_PREFERENCE_MAP[AGE_PREFERENCE_MAP.length - 1].max
        return AGE_PREFERENCE_MAP.filter(({ min, max }) => {
          const start = Math.max(rangeMin, min)
          const end = Math.min(rangeMax, max)
          return start <= end
        }).map(({ label }) => label)
      }
      function buildPreferredHeightRangeValues(minRaw, maxRaw) {
        const minValue = parseHeightValue(minRaw)
        const maxValue = parseHeightValue(maxRaw)
        let rangeMin = Number.isFinite(minValue) ? minValue : null
        let rangeMax = Number.isFinite(maxValue) ? maxValue : null
        if (rangeMin != null && rangeMax != null && rangeMin > rangeMax) {
          ;[rangeMin, rangeMax] = [rangeMax, rangeMin]
        }
        const minLabel = rangeMin != null ? `${rangeMin}cm` : ''
        const maxLabel = rangeMax != null ? `${rangeMax}cm` : ''
        let label = ''
        if (minLabel && maxLabel) {
          label = `${minLabel} ~ ${maxLabel}`
        } else if (minLabel) {
          label = `${minLabel} 이상`
        } else if (maxLabel) {
          label = `${maxLabel} 이하`
        }
        const buckets = getHeightPreferenceLabels(rangeMin, rangeMax)
        return { minLabel, maxLabel, label, buckets }
      }
      function buildPreferredAgeRangeValues(youngRaw, oldRaw) {
        const youngestYear = parseBirthYearInput(youngRaw)
        const oldestYear = parseBirthYearInput(oldRaw)
        const years = [youngestYear, oldestYear].filter((value) => Number.isFinite(value))
        if (!years.length) {
          return {
            youngestLabel: '',
            oldestLabel: '',
            label: '',
            buckets: [],
          }
        }
        const sorted = years.slice().sort((a, b) => b - a)
        const resolvedYoungest = sorted[0]
        const resolvedOldest = sorted[sorted.length - 1]
        const youngestLabel = formatBirthYearLabel(resolvedYoungest)
        const oldestLabel = formatBirthYearLabel(resolvedOldest)
        let label = ''
        if (youngestLabel && oldestLabel && youngestLabel !== oldestLabel) {
          label = `${youngestLabel} ~ ${oldestLabel}`
        } else {
          label = youngestLabel || oldestLabel
        }
        const currentYear = new Date().getFullYear()
        const youngestAge = Number.isFinite(resolvedYoungest) ? currentYear - resolvedYoungest : null
        const oldestAge = Number.isFinite(resolvedOldest) ? currentYear - resolvedOldest : null
        let minAge = Number.isFinite(youngestAge) ? youngestAge : null
        let maxAge = Number.isFinite(oldestAge) ? oldestAge : null
        if (minAge != null && maxAge != null && minAge > maxAge) {
          ;[minAge, maxAge] = [maxAge, minAge]
        }
        const buckets = getAgePreferenceLabels(minAge, maxAge)
        return {
          youngestLabel,
          oldestLabel,
          label,
          buckets,
        }
      }
      function buildPreferredHeightDisplay(record) {
        const minLabel = normalizeHeightValue(record.preferredHeightMin || '')
        const maxLabel = normalizeHeightValue(record.preferredHeightMax || '')
        if (minLabel && maxLabel) return `${minLabel} ~ ${maxLabel}`
        if (minLabel) return `${minLabel} 이상`
        if (maxLabel) return `${maxLabel} 이하`
        if (Array.isArray(record.preferredHeights) && record.preferredHeights.length) {
          return record.preferredHeights.join(', ')
        }
        return ''
      }
      function buildPreferredAgeDisplay(record) {
        const youngest = record.preferredAgeYoungest
        const oldest = record.preferredAgeOldest
        if (youngest && oldest && youngest !== oldest) return `${youngest} ~ ${oldest}`
        if (youngest || oldest) return youngest || oldest
        if (Array.isArray(record.preferredAges) && record.preferredAges.length) {
          return record.preferredAges.join(', ')
        }
        return ''
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

      function normalizeIdentifier(value) {
        return String(value || '').trim()
      }

      function normalizePhoneKey(raw) {
        let digits = String(raw || '').replace(/[^0-9]/g, '')
        if (!digits) return ''
        digits = digits.replace(/^00+/, '')
        if (digits.startsWith('82')) {
          const rest = digits.slice(2)
          if (!rest) return ''
          if (rest.startsWith('0')) return rest
          return `0${rest}`
        }
        if (!digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) {
          return `0${digits}`
        }
        return digits
      }

      function normalizeMatchHistoryCategory(value) {
        const normalized = String(value || '').trim().toLowerCase()
        return normalized === MATCH_HISTORY_CATEGORY.CONFIRMED
          ? MATCH_HISTORY_CATEGORY.CONFIRMED
          : MATCH_HISTORY_CATEGORY.INTRO
      }

      function isConfirmedMatchEntry(entry) {
        return normalizeMatchHistoryCategory(entry?.category) === MATCH_HISTORY_CATEGORY.CONFIRMED
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
        const validPhotos = list.filter((photo) => {
          const source = getFileSource(photo)
          return Boolean(source)
        })
        const hasMultiple = validPhotos.length > 1
        validPhotos.forEach((photo, index) => {
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
            const attachmentId =
              photo.id || photo.storagePath || `photo-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`
            photo.id = attachmentId
            const deleteBtn = document.createElement('button')
            deleteBtn.type = 'button'
            deleteBtn.className = 'attachment-delete-btn'
            deleteBtn.textContent = '삭제'
            deleteBtn.dataset.attachmentAction = 'delete'
            deleteBtn.dataset.attachmentType = 'photo'
            deleteBtn.dataset.attachmentId = attachmentId
            const actions = document.createElement('div')
            actions.className = 'attachment-photo-actions'
            if (hasMultiple) {
              const moveUpBtn = document.createElement('button')
              moveUpBtn.type = 'button'
              moveUpBtn.className = 'attachment-reorder-btn'
              moveUpBtn.textContent = '위로'
              moveUpBtn.dataset.attachmentAction = 'move'
              moveUpBtn.dataset.direction = 'up'
              moveUpBtn.dataset.attachmentId = attachmentId
              moveUpBtn.disabled = index === 0
              moveUpBtn.setAttribute('aria-label', `${label}을(를) 위로 이동`)
              const moveDownBtn = document.createElement('button')
              moveDownBtn.type = 'button'
              moveDownBtn.className = 'attachment-reorder-btn'
              moveDownBtn.textContent = '아래로'
              moveDownBtn.dataset.attachmentAction = 'move'
              moveDownBtn.dataset.direction = 'down'
              moveDownBtn.dataset.attachmentId = attachmentId
              moveDownBtn.disabled = index === validPhotos.length - 1
              moveDownBtn.setAttribute('aria-label', `${label}을(를) 아래로 이동`)
              actions.appendChild(moveUpBtn)
              actions.appendChild(moveDownBtn)
            }
            deleteBtn.setAttribute('aria-label', `${label} 삭제`)
            actions.appendChild(deleteBtn)
            item.appendChild(link)
            item.appendChild(urlBox)
            item.appendChild(actions)
            container.appendChild(item)
          })
        return container.childElementCount
      }

      function updateDetailAttachments(record, options = {}) {
        if (!detailAttachmentsSection) return
        const documents =
          options.documents !== undefined ? options.documents : record?.documents || {}
        const photos = Array.isArray(options?.photos)
          ? options.photos
          : Array.isArray(record?.photos)
          ? record.photos
          : []

        const hasIdCard = setAttachmentLink(detailIdCardLink, documents.idCard, '신분증')
        if (detailIdCardItem) detailIdCardItem.hidden = !hasIdCard
        if (detailIdCardDeleteBtn) {
          detailIdCardDeleteBtn.hidden = !hasIdCard
          detailIdCardDeleteBtn.disabled = !hasIdCard
        }

        const hasEmployment = setAttachmentLink(
          detailEmploymentLink,
          documents.employmentProof,
          '재직 증빙'
        )
        if (detailEmploymentItem) detailEmploymentItem.hidden = !hasEmployment
        if (detailEmploymentDeleteBtn) {
          detailEmploymentDeleteBtn.hidden = !hasEmployment
          detailEmploymentDeleteBtn.disabled = !hasEmployment
        }

        const photoCount = renderPhotoAttachments(detailPhotosGrid, photos)
        if (detailPhotosItem) detailPhotosItem.hidden = photoCount === 0

        const hasAny = hasIdCard || hasEmployment || photoCount > 0
        const hasUploadControls = Boolean(detailPhotoFaceBtn || detailPhotoFullBtn)
        detailAttachmentsSection.hidden = !hasAny && !hasUploadControls
        toggleAttachmentsTab(hasAny || hasUploadControls)
      }

      function refreshDetailAttachments() {
        if (!detailAttachmentsSection) return
        const documents = {}
        Object.entries(detailDocumentUploads || {}).forEach(([key, value]) => {
          if (value) {
            documents[key] = value
          }
        })
        updateDetailAttachments(detailCurrentRecord || {}, {
          documents,
          photos: detailPhotoUploads,
        })
      }

      function sanitizeFileName(name) {
        return String(name || 'upload')
          .replace(/[^0-9a-zA-Z._-]/g, '_')
          .replace(/_+/g, '_')
          .slice(-80)
      }

      function getStorageRootPrefix() {
        const root =
          typeof window.FIREBASE_STORAGE_ROOT === 'string' &&
          window.FIREBASE_STORAGE_ROOT.trim()
            ? window.FIREBASE_STORAGE_ROOT.trim()
            : ''
        if (!root) return ''
        return root.replace(/\/+$/, '') + '/'
      }

      function buildStoragePath({ phoneKey, subfolder, fileName }) {
        const normalizedPhone = phoneKey || 'unknown'
        const prefix = getStorageRootPrefix()
        const sanitizedFolder = subfolder ? subfolder.replace(/^\/+|\/+$/g, '') : ''
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeFileName(
          fileName,
        )}`
        const folderSegment = sanitizedFolder ? `${sanitizedFolder}/` : ''
        return `${prefix}${normalizedPhone}/${folderSegment}${name}`
      }

      async function ensureFirebaseStorage() {
        if (firebaseStorageInstance) return firebaseStorageInstance
        if (firebaseInitError) throw firebaseInitError
        if (firebaseInitPromise) return firebaseInitPromise

        firebaseInitPromise = (async () => {
          if (typeof firebase === 'undefined' || typeof firebase.initializeApp !== 'function') {
            throw new Error('Firebase SDK를 불러오지 못했습니다.')
          }
          let config = window.FIREBASE_CONFIG
          if (!config || !config.apiKey) {
            const configPromise = window.__FIREBASE_CONFIG_PROMISE__
            if (configPromise && typeof configPromise.then === 'function') {
              config = await configPromise
            }
          }
          if (!config || !config.apiKey) {
            throw new Error('Firebase 설정을 불러오지 못했습니다.')
          }
          if (!firebase.apps || !firebase.apps.length) {
            try {
              firebase.initializeApp(config)
            } catch (error) {
              if (!/already exists/i.test(error?.message || '')) {
                throw error
              }
            }
          }
          firebaseStorageInstance = firebase.storage()
          return firebaseStorageInstance
        })()
          .catch((error) => {
            firebaseInitError =
              error instanceof Error ? error : new Error('Firebase 초기화에 실패했습니다.')
            throw firebaseInitError
          })
          .finally(() => {
            firebaseInitPromise = null
          })

        return firebaseInitPromise
      }

      function setAttachmentUploadStatus(message, variant = 'info') {
        if (!detailAttachmentUploadStatus) return
        detailAttachmentUploadStatus.textContent = message || ''
        detailAttachmentUploadStatus.classList.remove('is-error', 'is-success')
        if (variant === 'error') {
          detailAttachmentUploadStatus.classList.add('is-error')
        } else if (variant === 'success') {
          detailAttachmentUploadStatus.classList.add('is-success')
        }
      }

      function getPhotoRoleLabel(role) {
        return role === 'full' ? '전신 사진' : '얼굴 사진'
      }

      async function uploadFileToFirebase({ file, phoneKey, subfolder, metadata = {}, onProgress }) {
        const storage = await ensureFirebaseStorage()
        const storagePath = buildStoragePath({
          phoneKey,
          subfolder,
          fileName: file?.name || 'upload',
        })
        const storageRef = storage.ref().child(storagePath)
        const uploadMetadata = {
          contentType: file?.type || metadata.contentType || 'application/octet-stream',
          customMetadata: {
            phone: phoneKey,
            ...(metadata.customMetadata || {}),
          },
        }

        return await new Promise((resolve, reject) => {
          const uploadTask = storageRef.put(file, uploadMetadata)
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              if (typeof onProgress === 'function' && snapshot?.totalBytes) {
                const progress = snapshot.totalBytes
                  ? snapshot.bytesTransferred / snapshot.totalBytes
                  : 0
                onProgress(progress)
              }
            },
            (error) => reject(error),
            async () => {
              try {
                const downloadURL = await storageRef.getDownloadURL()
                resolve({
                  storagePath,
                  downloadURL,
                  bucket: storageRef.bucket || storage?.app?.options?.storageBucket || '',
                  contentType: uploadMetadata.contentType,
                  uploadedAt: Date.now(),
                })
              } catch (error) {
                reject(error)
              }
            },
          )
        })
      }

      async function deleteAttachmentFile(storagePath) {
        if (!storagePath) return
        try {
          const storage = await ensureFirebaseStorage()
          const ref = storage.ref().child(storagePath)
          await ref.delete()
        } catch (error) {
          console.warn('[firebase] 파일 삭제 실패', error)
        }
      }

      function rememberPendingUpload(storagePath) {
        if (!storagePath) return
        pendingUploadPaths.add(storagePath)
      }

      async function cleanupPendingUploads() {
        if (!pendingUploadPaths.size) return
        const targets = Array.from(pendingUploadPaths)
        pendingUploadPaths.clear()
        await Promise.all(targets.map((path) => deleteAttachmentFile(path)))
      }

      function collectRecordStoragePaths(record) {
        const paths = []
        if (!record || typeof record !== 'object') return paths
        const documents =
          record.documents && typeof record.documents === 'object' ? record.documents : {}
        Object.values(documents).forEach((entry) => {
          const path =
            typeof entry?.storagePath === 'string' && entry.storagePath.trim()
              ? entry.storagePath.trim()
              : ''
          if (path) paths.push(path)
        })
        const photos = Array.isArray(record.photos) ? record.photos : []
        photos.forEach((photo) => {
          const path =
            typeof photo?.storagePath === 'string' && photo.storagePath.trim()
              ? photo.storagePath.trim()
              : ''
          if (path) paths.push(path)
        })
        return paths
      }

      function buildPhoneUsageMap(list) {
        const usage = new Map()
        if (!Array.isArray(list)) return usage
        list.forEach((record) => {
          const phoneKey = normalizePhoneKey(record?.phone)
          if (!phoneKey) return
          usage.set(phoneKey, (usage.get(phoneKey) || 0) + 1)
        })
        return usage
      }

      async function deleteFolderRecursively(folderRef) {
        try {
          const snapshot = await folderRef.listAll()
          const deleteItems = snapshot.items.map((itemRef) =>
            itemRef.delete().catch((error) => {
              console.warn('[firebase] 개별 파일 삭제 실패', error)
            }),
          )
          const deletePrefixes = snapshot.prefixes.map((childRef) => deleteFolderRecursively(childRef))
          await Promise.allSettled([...deleteItems, ...deletePrefixes])
        } catch (error) {
          if (error?.code === 'storage/object-not-found') {
            return
          }
          throw error
        }
      }

      async function deleteFirebaseFolderForPhone(phoneKey) {
        if (!phoneKey) return
        try {
          const storage = await ensureFirebaseStorage()
          const prefix = getStorageRootPrefix()
          const folderPath = `${prefix}${phoneKey}`.replace(/\/+$/, '')
          if (!folderPath) return
          const folderRef = storage.ref().child(folderPath)
          await deleteFolderRecursively(folderRef)
        } catch (error) {
          if (error?.code === 'storage/object-not-found') return
          console.warn('[firebase] 회원 폴더 삭제 실패', error)
        }
      }

      async function cleanupFirebaseForDeletedRecords(records, usageBeforeDelete) {
        if (!Array.isArray(records) || !records.length) return
        const storagePaths = new Set()
        const phoneDeleteCounts = new Map()
        records.forEach((record) => {
          collectRecordStoragePaths(record).forEach((path) => storagePaths.add(path))
          const phoneKey = normalizePhoneKey(record?.phone)
          if (phoneKey) {
            phoneDeleteCounts.set(phoneKey, (phoneDeleteCounts.get(phoneKey) || 0) + 1)
          }
        })
        const usageMap = usageBeforeDelete instanceof Map ? usageBeforeDelete : buildPhoneUsageMap(items)
        const folderTargets = Array.from(phoneDeleteCounts.entries())
          .filter(([phoneKey, deleteCount]) => {
            if (!phoneKey) return false
            const currentUsage = usageMap.get(phoneKey) || 0
            return deleteCount >= currentUsage
          })
          .map(([phoneKey]) => phoneKey)

        const tasks = [
          ...Array.from(storagePaths).map((path) => deleteAttachmentFile(path)),
          ...folderTargets.map((phoneKey) => deleteFirebaseFolderForPhone(phoneKey)),
        ]
        if (!tasks.length) return
        await Promise.allSettled(tasks)
      }

      async function handlePhotoUploadInputChange(event, role) {
        const input = event?.target
        const files = input?.files ? Array.from(input.files) : []
        if (input) input.value = ''
        if (!files.length) return
        if (!detailRecordId || !detailCurrentRecord) {
          setAttachmentUploadStatus('상세 정보를 연 뒤에 업로드할 수 있습니다.', 'error')
          showToast('먼저 상세 정보를 연 뒤에 사진을 첨부해주세요.')
          return
        }
        const phoneValue = detailPhoneInput?.value || detailCurrentRecord?.phone || ''
        const phoneKey = normalizePhoneKey(phoneValue)
        if (!phoneKey) {
          setAttachmentUploadStatus('연락처를 입력한 뒤에 업로드해주세요.', 'error')
          showToast('연락처가 있어야 사진을 올릴 수 있습니다.')
          return
        }

        const label = getPhotoRoleLabel(role)
        let successCount = 0
        let lastError = null

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index]
          if (!file) continue
          if (file.size > MAX_UPLOAD_SIZE_BYTES) {
            lastError = new Error(`${file.name} 파일이 ${UPLOAD_SIZE_LABEL}를 초과했습니다.`)
            setAttachmentUploadStatus(lastError.message, 'error')
            showToast(lastError.message)
            continue
          }
          try {
            setAttachmentUploadStatus(
              `${label} ${index + 1}/${files.length} 업로드 중...`,
              'info',
            )
            const uploadResult = await uploadFileToFirebase({
              file,
              phoneKey,
              subfolder: role === 'full' ? 'photos/full' : 'photos/face',
              onProgress: (progress) => {
                const percent = Math.round(progress * 100)
                setAttachmentUploadStatus(
                  `${label} ${index + 1}/${files.length} 업로드 중 · ${percent}%`,
                  'info',
                )
              },
              metadata: {
                customMetadata: {
                  role,
                  category: role,
                },
              },
            })
            const record = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: file?.name || '사진',
              size: file?.size || 0,
              type: file?.type || uploadResult.contentType || '',
              downloadURL: uploadResult.downloadURL,
              url: uploadResult.downloadURL,
              storagePath: uploadResult.storagePath,
              bucket: uploadResult.bucket,
              contentType: uploadResult.contentType,
              uploadedAt: uploadResult.uploadedAt,
              group: 'photos',
              category: role,
              role,
              persistLevel: 'profile',
            }
            rememberPendingUpload(uploadResult.storagePath)
            detailPhotoUploads = [...detailPhotoUploads, record]
            if (!detailCurrentRecord.photos) detailCurrentRecord.photos = []
            detailCurrentRecord.photos.push(record)
            successCount += 1
          } catch (error) {
            console.error('[photo-upload]', error)
            lastError = error instanceof Error ? error : new Error('사진 업로드에 실패했습니다.')
          }
        }

        if (successCount > 0) {
          if (detailCurrentRecord) {
            detailCurrentRecord.photos = detailPhotoUploads.slice()
          }
          refreshDetailAttachments()
          setAttachmentUploadStatus('사진 업로드를 완료했습니다.', 'success')
          showToast('사진이 업로드되었습니다.')
        } else if (lastError) {
          setAttachmentUploadStatus(lastError.message, 'error')
          showToast(lastError.message)
        } else {
          setAttachmentUploadStatus('업로드된 새 사진이 없습니다.')
        }
      }

      async function handleDocumentUploadInputChange(event, docKey) {
        const input = event?.target
        const files = input?.files ? Array.from(input.files) : []
        if (input) input.value = ''
        if (!files.length) return
        const file = files[0]
        if (!file) return
        if (!detailRecordId || !detailCurrentRecord) {
          setAttachmentUploadStatus('상세 정보를 연 뒤에 업로드할 수 있습니다.', 'error')
          showToast('먼저 상세 정보를 연 뒤에 증빙 자료를 첨부해주세요.')
          return
        }
        const phoneValue = detailPhoneInput?.value || detailCurrentRecord?.phone || ''
        const phoneKey = normalizePhoneKey(phoneValue)
        if (!phoneKey) {
          setAttachmentUploadStatus('연락처를 입력한 뒤에 업로드해주세요.', 'error')
          showToast('연락처가 있어야 증빙 자료를 업로드할 수 있습니다.')
          return
        }
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
          const message = `${file.name} 파일이 ${UPLOAD_SIZE_LABEL}를 초과했습니다.`
          setAttachmentUploadStatus(message, 'error')
          showToast(message)
          return
        }
        const folder = docKey === 'employmentProof' ? 'employment-proof' : 'id-card'
        const label = docKey === 'employmentProof' ? '재직 증빙' : '신분증'
        try {
          setAttachmentUploadStatus(`${label} 업로드 중...`, 'info')
          const uploadResult = await uploadFileToFirebase({
            file,
            phoneKey,
            subfolder: folder,
            metadata: {
              customMetadata: {
                category: docKey,
                role: docKey,
              },
            },
            onProgress: (progress) => {
              const percent = Math.round(progress * 100)
              setAttachmentUploadStatus(`${label} 업로드 중 · ${percent}%`, 'info')
            },
          })
          const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file?.name || label,
            size: file?.size || 0,
            type: file?.type || uploadResult.contentType || '',
            downloadURL: uploadResult.downloadURL,
            url: uploadResult.downloadURL,
            storagePath: uploadResult.storagePath,
            bucket: uploadResult.bucket,
            contentType: uploadResult.contentType,
            uploadedAt: uploadResult.uploadedAt,
            group: 'documents',
            category: docKey,
            role: docKey,
            persistLevel: 'profile',
          }
          rememberPendingUpload(uploadResult.storagePath)
          detailDocumentUploads = {
            ...detailDocumentUploads,
            [docKey]: entry,
          }
          detailDocumentDirty.add(docKey)
          if (!detailCurrentRecord.documents) detailCurrentRecord.documents = {}
          detailCurrentRecord.documents[docKey] = entry
          refreshDetailAttachments()
          setAttachmentUploadStatus(`${label} 업로드를 완료했습니다.`, 'success')
          showToast(`${label}을 업로드했습니다.`)
        } catch (error) {
          console.error('[document-upload]', error)
          const message =
            error instanceof Error ? error.message : `${label} 업로드에 실패했습니다.`
          setAttachmentUploadStatus(message, 'error')
          showToast(message)
        }
      }

      async function handleDocumentDelete(docKey) {
        const entry = detailDocumentUploads?.[docKey]
        const label = docKey === 'employmentProof' ? '재직 증빙' : '신분증'
        if (!entry) {
          showToast(`${label} 자료가 없습니다.`)
          return
        }
        if (!window.confirm(`${label}을 삭제할까요?`)) return
        if (entry.storagePath) {
          await deleteAttachmentFile(entry.storagePath)
          pendingUploadPaths.delete(entry.storagePath)
        }
        detailDocumentUploads = {
          ...detailDocumentUploads,
          [docKey]: null,
        }
        detailDocumentDirty.add(docKey)
        if (detailCurrentRecord) {
          if (!detailCurrentRecord.documents) detailCurrentRecord.documents = {}
          delete detailCurrentRecord.documents[docKey]
        }
        refreshDetailAttachments()
        setAttachmentUploadStatus(`${label}을 삭제했습니다.`, 'success')
        showToast(`${label}을 삭제했습니다.`)
      }

      async function handlePhotoDelete(attachmentId) {
        if (!attachmentId) return
        const index = detailPhotoUploads.findIndex((photo) => {
          const photoId = photo?.id || photo?.storagePath
          return photoId === attachmentId
        })
        if (index === -1) return
        const target = detailPhotoUploads[index]
        if (!window.confirm('선택한 사진을 삭제할까요?')) return
        if (target?.storagePath) {
          await deleteAttachmentFile(target.storagePath)
          pendingUploadPaths.delete(target.storagePath)
        }
        detailPhotoUploads = [
          ...detailPhotoUploads.slice(0, index),
          ...detailPhotoUploads.slice(index + 1),
        ]
        if (Array.isArray(detailCurrentRecord?.photos)) {
          detailCurrentRecord.photos = detailPhotoUploads.slice()
        }
        refreshDetailAttachments()
        showToast('사진을 삭제했습니다.')
      }

      function handlePhotoReorder(attachmentId, step) {
        if (!attachmentId || !Number.isFinite(step) || !detailPhotoUploads.length) return
        const currentIndex = detailPhotoUploads.findIndex((photo) => {
          const photoId = photo?.id || photo?.storagePath
          return photoId === attachmentId
        })
        if (currentIndex === -1) return
        const targetIndex = currentIndex + step
        if (targetIndex < 0 || targetIndex >= detailPhotoUploads.length) return
        const nextList = detailPhotoUploads.slice()
        const [moved] = nextList.splice(currentIndex, 1)
        nextList.splice(targetIndex, 0, moved)
        detailPhotoUploads = nextList
        if (Array.isArray(detailCurrentRecord?.photos)) {
          detailCurrentRecord.photos = nextList.slice()
        }
        refreshDetailAttachments()
        showToast('사진 순서를 변경했습니다.')
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
        if (detailReferralSourceSelect && draft.referralSource !== undefined)
          setSelectValue(detailReferralSourceSelect, draft.referralSource || '')
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
        if (detailPreferredHeightMinInput && draft.preferredHeightMin !== undefined)
          detailPreferredHeightMinInput.value = draft.preferredHeightMin || ''
        if (detailPreferredHeightMaxInput && draft.preferredHeightMax !== undefined)
          detailPreferredHeightMaxInput.value = draft.preferredHeightMax || ''
        if (detailPreferredAgeYoungestInput && draft.preferredAgeYoungest !== undefined)
          detailPreferredAgeYoungestInput.value = draft.preferredAgeYoungest || ''
        if (detailPreferredAgeOldestInput && draft.preferredAgeOldest !== undefined)
          detailPreferredAgeOldestInput.value = draft.preferredAgeOldest || ''
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

      function normalizeReferralSourceLabel(value, options = {}) {
        const emptyFallback = Boolean(options.emptyFallback)
        const trimmed = typeof value === 'string' ? value.trim() : ''
        if (!trimmed) {
          return emptyFallback ? REFERRAL_SOURCE_FALLBACK_LABEL : ''
        }
        const match = REFERRAL_SOURCE_LABELS.find((label) => label === trimmed)
        return match || REFERRAL_SOURCE_FALLBACK_LABEL
      }

      function formatReferralSource(value) {
        return normalizeReferralSourceLabel(value) || ''
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
        } else if (!dateValue && !timeValue) {
          detailScheduleInfo.textContent = ''
        }
      }

      function handleClearSchedule(event) {
        event.preventDefault()
        detailDateInput.value = ''
        updateTimeOptions('', '', detailRecordId)
        detailScheduleInfo.textContent = ''
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
        const referralSourceValue = detailReferralSourceSelect?.value || ''
        setSelectValue(detailReferralSourceSelect, referralSourceValue)
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
        const preferredLifestyle = getMultiSelectValues(detailPreferredLifestyleSelect)
        const preferredAppearanceValue = detailPreferredAppearanceSelect?.value || ''
        setSelectValue(detailPreferredAppearanceSelect, preferredAppearanceValue)
        const preferredHeightRange = buildPreferredHeightRangeValues(
          detailPreferredHeightMinInput?.value || '',
          detailPreferredHeightMaxInput?.value || '',
        )
        if (detailPreferredHeightMinInput)
          detailPreferredHeightMinInput.value = preferredHeightRange.minLabel || ''
        if (detailPreferredHeightMaxInput)
          detailPreferredHeightMaxInput.value = preferredHeightRange.maxLabel || ''
        const preferredAgeRange = buildPreferredAgeRangeValues(
          detailPreferredAgeYoungestInput?.value || '',
          detailPreferredAgeOldestInput?.value || '',
        )
        if (detailPreferredAgeYoungestInput)
          detailPreferredAgeYoungestInput.value = preferredAgeRange.youngestLabel || ''
        if (detailPreferredAgeOldestInput)
          detailPreferredAgeOldestInput.value = preferredAgeRange.oldestLabel || ''
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
        const membershipTypeValue = detailMembershipTypeSelect?.value || ''
        setSelectValue(detailMembershipTypeSelect, membershipTypeValue)
        const paymentAmountRaw = (detailPaymentAmountInput?.value || '').trim()
        const paymentAmountValue = sanitizePaymentAmount(paymentAmountRaw)
        const paymentDateValue = detailPaymentDateInput?.value || ''

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
          referralSource: referralSourceValue,
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
          preferredHeightMin: preferredHeightRange.minLabel || '',
          preferredHeightMax: preferredHeightRange.maxLabel || '',
          preferredHeightLabel: preferredHeightRange.label || '',
          preferredHeights: preferredHeightRange.buckets,
          preferredAgeYoungest: preferredAgeRange.youngestLabel || '',
          preferredAgeOldest: preferredAgeRange.oldestLabel || '',
          preferredAgeLabel: preferredAgeRange.label || '',
          preferredAges: preferredAgeRange.buckets,
          preferredLifestyle,
          preferredAppearance: preferredAppearanceValue,
          sufficientCondition: sufficientConditionValue,
          necessaryCondition: necessaryConditionValue,
          likesDislikes: likesDislikesValue,
          values: valuesSelected,
          valuesCustom: valuesCustomValue,
          aboutMe: aboutMeValue,
          membershipType: membershipTypeValue,
          paymentAmount: paymentAmountValue,
          paymentDate: paymentDateValue,
          paymentHistory: detailPaymentEntries.slice(),
          phoneConsultStatus: phoneStatus,
          meetingSchedule,
          notes: detailNotesInput.value?.trim() || '',
        }
        if (matchFeedbackList) {
          payload.matchReviews = collectMatchFeedbackEntries()
        }
        const existingRecord = items.find((item) => item.id === detailRecordId) || {}
        if (detailDocumentDirty.size) {
          payload.documents = {}
          detailDocumentDirty.forEach((key) => {
            payload.documents[key] = detailDocumentUploads[key] || null
          })
        }
        payload.photos = Array.isArray(detailPhotoUploads)
          ? detailPhotoUploads.slice()
          : existingRecord.photos || []

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
            detailCurrentRecord = updated
            detailPhotoUploads = Array.isArray(updated.photos) ? updated.photos.slice() : []
            const updatedDocuments =
              updated?.documents && typeof updated.documents === 'object'
                ? updated.documents
                : {}
            detailDocumentUploads = {
              idCard: updatedDocuments.idCard || null,
              employmentProof: updatedDocuments.employmentProof || null,
            }
            detailDocumentDirty.clear()
            detailPaymentEntries = getPaymentHistoryEntries(updated)
            renderPaymentHistory(detailPaymentEntries)
            refreshDetailAttachments()
          }
          syncFilterOptions()
          syncMatchMemberOptions()
          syncSelectionWithItems()
          updateStats()
          render()
          if (!calendarModal.hidden) {
            refreshCalendar(true)
          }
          showToast('상세 정보를 저장했습니다.')
          closeDetailModal({ keepPendingUploads: true })
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
          detailScheduleInfo.textContent = ''
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
        normalized.preferredHeightMin = normalizeHeightValue(normalized.preferredHeightMin)
        normalized.preferredHeightMax = normalizeHeightValue(normalized.preferredHeightMax)
        const normalizeBirthLabel = (value) => {
          if (value == null) return ''
          const raw = String(value).trim()
          if (!raw) return ''
          const parsed = parseBirthYearInput(raw)
          if (parsed) return formatBirthYearLabel(parsed)
          return raw
        }
        normalized.preferredAgeYoungest = normalizeBirthLabel(normalized.preferredAgeYoungest)
        normalized.preferredAgeOldest = normalizeBirthLabel(normalized.preferredAgeOldest)
        if (typeof normalized.district !== 'string') {
          normalized.district = normalized.district != null ? String(normalized.district) : ''
        }
        if (typeof normalized.referralSource !== 'string') {
          normalized.referralSource =
            normalized.referralSource != null ? String(normalized.referralSource) : ''
        }
        normalized.referralSource =
          normalizeReferralSourceLabel(normalized.referralSource.trim()) || ''
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
        normalized.membershipType =
          normalized.membershipType != null ? String(normalized.membershipType).trim() : ''
        normalized.paymentAmount = sanitizePaymentAmount(normalized.paymentAmount)
        normalized.paymentDate =
          typeof normalized.paymentDate === 'string' ? normalized.paymentDate.trim() : ''
        normalized.paymentHistory = Array.isArray(normalized.paymentHistory)
          ? normalized.paymentHistory
              .map((entry, index) => normalizePaymentHistoryEntry(entry, index))
              .filter(Boolean)
          : []
        normalized.matchReviews = Array.isArray(normalized.matchReviews)
          ? normalized.matchReviews
              .map((entry, index) => normalizeMatchReviewEntry(entry, index))
              .filter(Boolean)
          : []
        if (normalized.matchReviews.length) {
          normalized.matchReviews.sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        }
        normalized.matchRatingAverage = calculateMatchRatingAverage(normalized.matchReviews)
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
        normalized.preferredHeightLabel = buildPreferredHeightDisplay(normalized)
        normalized.preferredAgeLabel = buildPreferredAgeDisplay(normalized)
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

      function normalizeMatchReviewEntry(entry, index = 0) {
        if (!entry || typeof entry !== 'object') return null
        const id =
          typeof entry.id === 'string' && entry.id.trim()
            ? entry.id.trim()
            : generateMatchFeedbackId()
        const sequenceRaw = Number(entry.sequence ?? entry.roundIndex ?? index + 1)
        const sequence = Number.isFinite(sequenceRaw) && sequenceRaw > 0 ? sequenceRaw : index + 1
        const roundLabel =
          entry.roundLabel != null ? String(entry.roundLabel).trim() : String(entry.round || '').trim()
        const partnerName =
          entry.partnerName != null
            ? String(entry.partnerName).trim()
            : String(entry.partner || '').trim()
        const comment =
          entry.comment != null
            ? String(entry.comment).trim()
            : entry.note != null
            ? String(entry.note).trim()
            : ''
        const ratingValue = Number(entry.rating)
        const rating =
          Number.isFinite(ratingValue) && ratingValue > 0 && ratingValue <= 5
            ? Number(ratingValue.toFixed(2))
            : null
        let recordedAt = ''
        if (entry.recordedAt) {
          const parsed = new Date(entry.recordedAt)
          if (!Number.isNaN(parsed.getTime())) {
            recordedAt = parsed.toISOString()
          }
        }
        if (!roundLabel && !partnerName && !comment && rating == null) {
          return null
        }
        return {
          id,
          sequence,
          roundLabel,
          partnerName,
          comment,
          rating,
          recordedAt,
        }
      }

      function calculateMatchRatingAverage(entries) {
        if (!Array.isArray(entries) || !entries.length) return null
        const ratings = entries
          .map((entry) => Number(entry.rating))
          .filter((value) => Number.isFinite(value) && value > 0)
        if (!ratings.length) return null
        const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length
        return Number(average.toFixed(1))
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
              'referralSource',
            'membershipType',
            'paymentAmount',
            'paymentDate',
            ]
              .map((key) => String(item[key] || '').toLowerCase())
              .some((value) => value.includes(term))
          )
        }
        if (viewState.status !== 'all') {
          result = result.filter(
            (item) => (item.phoneConsultStatus || 'pending') === viewState.status,
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
        if (selectEl === statusFilter) {
          viewState.status = selectEl.value
        }
      }
      if (statusFilter) {
        statusFilter.value = viewState.status || 'all'
      }

      function uniqueSorted(values) {
        return Array.from(
          new Set(values.filter((value) => value && value.trim()))
        ).sort((a, b) => a.localeCompare(b, 'ko-KR'))
      }

      function syncMatchMemberOptions() {
        if (!matchMemberOptions) return
        const fragment = document.createDocumentFragment()
        const sorted = items
          .slice()
          .filter((item) => item?.name)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR'))
        sorted.forEach((item) => {
          const descriptor = buildMatchOptionLabel(item)
          const primaryOption = createMatchOptionElement(item, descriptor)
          if (primaryOption) {
            fragment.appendChild(primaryOption)
          }
          const phoneValues = new Set()
          const phoneLabel = buildMatchPhoneOptionLabel(item) || descriptor
          ;[
            formatPhoneNumber(item.phone),
            item.phone,
            normalizePhoneKey(item.phone),
          ].forEach((value) => {
            const trimmed = typeof value === 'string' ? value.trim() : ''
            if (!trimmed || phoneValues.has(trimmed)) return
            phoneValues.add(trimmed)
            const option = createMatchOptionElement(item, trimmed, phoneLabel)
            if (option) {
              fragment.appendChild(option)
            }
          })
        })
        matchMemberOptions.innerHTML = ''
        matchMemberOptions.appendChild(fragment)
      }

      function normalizeGenderValue(value) {
        const normalized = String(value || '')
          .trim()
          .toLowerCase()
        if (!normalized) return ''
        if (normalized.startsWith('남')) return 'male'
        if (normalized.startsWith('여')) return 'female'
        return ''
      }

      function openGenderChartModal() {
        if (!genderChartModal) return
        genderChartModal.hidden = false
        drawGenderChart()
      }

      function closeGenderChartModal() {
        if (!genderChartModal) return
        genderChartModal.hidden = true
      }

      function drawGenderChart() {
        if (!genderChartCanvas || !genderChartLegend) return
        const ctx = genderChartCanvas.getContext('2d')
        const width = genderChartCanvas.width
        const height = genderChartCanvas.height
        ctx.clearRect(0, 0, width, height)
        const { male, female, malePercent = 0, femalePercent = 0 } = genderStatsData
        const total = male + female
        if (!total) {
          ctx.fillStyle = '#8b949e'
          ctx.font = '16px Pretendard, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('표시할 데이터가 없습니다.', width / 2, height / 2)
          genderChartLegend.textContent = '데이터 없음'
          if (genderChartCenter) {
            genderChartCenter.innerHTML = `<span style="color:#8b949e;font-size:13px;">데이터 없음</span>`
          }
          return
        }
        const dominant =
          male === female ? '균형' : male > female ? '남성 비중이 더 높음' : '여성 비중이 더 높음'
        if (genderChartSummary) {
          genderChartSummary.textContent = `${dominant} · 남 ${malePercent}% / 여 ${femalePercent}%`
        }
        const data = [
          { value: male, color: '#3b82f6', label: `남 ${male}명 (${malePercent}%)` },
          { value: female, color: '#ec4899', label: `여 ${female}명 (${femalePercent}%)` },
        ]
        let startAngle = -Math.PI / 2
        const centerX = width / 2
        const centerY = height / 2
        const radius = Math.min(width, height) / 2 - 10
        data.forEach(({ value, color }) => {
          const sliceAngle = (value / total) * Math.PI * 2
          ctx.beginPath()
          ctx.moveTo(centerX, centerY)
          ctx.fillStyle = color
          ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle)
          ctx.closePath()
          ctx.fill()
          startAngle += sliceAngle
        })
        ctx.beginPath()
        ctx.fillStyle = '#101010'
        ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2)
        ctx.fill()
        if (genderChartCenter) {
          genderChartCenter.innerHTML = `
            <strong style="color:#3b82f6">남 ${malePercent}%</strong>
            <strong style="color:#ec4899">여 ${femalePercent}%</strong>
            <span style="font-size:12px;color:#9da4b0;">남 ${male}명 · 여 ${female}명</span>
          `
        }
        genderChartLegend.innerHTML = data
          .map((item) => `<span style="color:${item.color}">${item.label}</span>`)
          .join('')
        if (genderChartBars) {
          genderChartBars.innerHTML = data
            .map(
              (item) => `
              <div class="gender-chart-bar">
                <span style="color:${item.color}">${item.label}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${Math.min(
                    100,
                    Math.max(0, (item.value / total) * 100),
                  )}%;background:${item.color};"></div>
                </div>
              </div>
            `,
            )
            .join('')
        }
      }

      function updateGenderStatsDisplay(list) {
        if (!genderStatsEl) return
        let male = 0
        let female = 0
        list.forEach((item) => {
          const type = normalizeGenderValue(item.gender)
          if (type === 'male') male += 1
          if (type === 'female') female += 1
        })
        const total = male + female
        const malePercent = total ? Math.round((male / total) * 100) : 0
        const femalePercent = total ? Math.round((female / total) * 100) : 0
        genderStatsData = { male, female, malePercent, femalePercent }
        genderStatsEl.textContent = `남 ${male}명 (${malePercent}%) · 여 ${female}명 (${femalePercent}%)`
      }

      function updateReferralStats(list) {
        const sourceList = Array.isArray(list) ? list : []
        const counts = new Map()
        REFERRAL_SOURCE_LABELS.forEach((label) => counts.set(label, 0))
        counts.set(REFERRAL_SOURCE_FALLBACK_LABEL, 0)
        sourceList.forEach((item) => {
          const label = normalizeReferralSourceLabel(item?.referralSource, { emptyFallback: true })
          if (!label) return
          counts.set(label, (counts.get(label) || 0) + 1)
        })
        const total = sourceList.length
        const breakdown = REFERRAL_SOURCE_LABELS.map((label) => {
          const count = counts.get(label) || 0
          return {
            label,
            count,
            percent: total ? Math.round((count / total) * 100) : 0,
          }
        })
        const fallbackCount = counts.get(REFERRAL_SOURCE_FALLBACK_LABEL) || 0
        if (fallbackCount) {
          breakdown.push({
            label: REFERRAL_SOURCE_FALLBACK_LABEL,
            count: fallbackCount,
            percent: total ? Math.round((fallbackCount / total) * 100) : 0,
          })
        }
        referralStatsData = { total, breakdown }
        if (referralChartModal && !referralChartModal.hidden) {
          renderReferralChart()
        }
      }

      function openReferralChartModal() {
        if (!referralChartModal) return
        referralChartModal.hidden = false
        renderReferralChart()
      }

      function closeReferralChartModal() {
        if (!referralChartModal) return
        referralChartModal.hidden = true
      }

      function renderReferralChart() {
        if (!referralChartList) return
        const { total, breakdown } = referralStatsData
        if (!total) {
          if (referralChartSummary) {
            referralChartSummary.textContent = '표시할 데이터가 없습니다.'
          }
          referralChartList.innerHTML = ''
          if (referralChartEmpty) referralChartEmpty.hidden = false
          return
        }
        if (referralChartEmpty) referralChartEmpty.hidden = true
        if (referralChartSummary) {
          referralChartSummary.textContent = `총 ${total}명 · 유입 경로 통계`
        }
        referralChartList.innerHTML = breakdown
          .map((entry) => {
            return `
              <li class="referral-chart-item">
                <div class="referral-chart-label">
                  <strong>${escapeHtml(entry.label)}</strong>
                  <span>${entry.count.toLocaleString('ko-KR')}명 · ${entry.percent}%</span>
                </div>
                <div class="referral-chart-bar">
                  <span style="width:${entry.percent}%;"></span>
                </div>
              </li>
            `
          })
          .join('')
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

      function buildWeekMeta(timestamp) {
        const info = getWeekInfo(new Date(timestamp))
        return {
          label: info.label,
          startTime: info.start.getTime(),
          endTime: info.end.getTime(),
          year: info.year,
          week: info.week,
        }
      }

      function decodeBase64(value) {
        try {
          return decodeURIComponent(escape(atob(value)))
        } catch (error) {
          return ''
        }
      }

      function cleanupSelectionInHash(hashBase) {
        if (typeof window === 'undefined' || typeof location === 'undefined') return
        const base = hashBase ? `#${hashBase}` : ''
        const newUrl = `${location.pathname}${location.search}${base}`
        try {
          window.history.replaceState(null, '', newUrl)
        } catch (error) {
          location.hash = base
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

      function openMatchModal(initialId) {
        if (!matchModal || !isAuthenticated) return
        if (matchModalHideTimer) {
          clearTimeout(matchModalHideTimer)
          matchModalHideTimer = null
        }
        syncMatchMemberOptions()
        matchModal.hidden = false
        requestAnimationFrame(() => matchModal.classList.add('visible'))
        const targetId = initialId || matchSelectedMemberId
        if (targetId) {
          const record = items.find((item) => item.id === targetId)
          if (record) {
            setMatchTarget(record)
            runMatchRecommendation()
          }
        } else {
          renderMatchTargetInfo(null)
          renderMatchResults([])
          if (matchStatusEl) {
            matchStatusEl.textContent = '대상자를 선택하면 추천 리스트가 표시됩니다.'
          }
          updateMatchResetVisibility(false)
        }
        if (matchTargetInput) {
          matchTargetInput.focus()
          matchTargetInput.select?.()
        }
      }

      function closeMatchModal() {
        if (!matchModal || matchModal.hidden) return
        matchModal.classList.remove('visible')
        matchModalHideTimer = window.setTimeout(() => {
          matchModal.hidden = true
          matchModalHideTimer = null
        }, 180)
      }

      function handleMatchTargetSelection(shouldRun = true) {
        if (!matchTargetInput) return
        const value = matchTargetInput.value.trim()
        if (!value) {
          clearMatchTarget()
          return
        }
        const record = resolveMatchTargetValue(value)
        if (!record) {
          updateMatchResetVisibility(Boolean(matchSelectedMemberId))
          return
        }
        setMatchTarget(record)
        if (shouldRun) {
          runMatchRecommendation()
        }
      }

      function resolveMatchTargetValue(value) {
        if (!value) return null
        if (matchMemberOptions) {
          const optionNode = Array.from(matchMemberOptions.children || []).find(
            (option) => option.value === value,
          )
          if (optionNode?.dataset?.id) {
            const byId = items.find((item) => item.id === optionNode.dataset.id)
            if (byId) return byId
          }
        }
        const normalized = value.toLowerCase()
        return (
          items.find((item) =>
            [item.name, item.phone]
              .map((field) => String(field || '').toLowerCase())
              .some((field) => field.includes(normalized)),
          ) || null
        )
      }

      function setMatchTarget(record) {
        matchSelectedMemberId = record?.id || null
        if (record && matchTargetInput) {
          matchTargetInput.value = buildMatchOptionLabel(record)
        }
        const nextTargetId = record?.id || null
        const nextPhoneKey = normalizePhoneKey(record?.phone)
        const targetChanged =
          nextTargetId !== matchSelectionTargetId || nextPhoneKey !== matchSelectionTargetPhoneKey
        matchSelectionTargetId = nextTargetId
        matchSelectionTargetPhoneKey = nextPhoneKey
        if (targetChanged) {
          matchSelectedCandidates = []
          updateMatchSelectionSummary()
          updateMatchHistoryUI()
        }
        renderMatchTargetInfo(record)
        updateMatchHistoryTitle(record)
        updateMatchResetVisibility(Boolean(matchSelectedMemberId))
      }

      function updateMatchHistoryTitle(record) {
        if (!matchHistoryTitleEl) return
        const name = typeof record?.name === 'string' ? record.name.trim() : ''
        matchHistoryTitleEl.textContent = name ? `${name}님의 이번주 소개` : '대상자님의 이번주 소개'
      }

      function renderMatchTargetInfo(record) {
        if (!matchTargetInfo) return
        if (!record) {
          matchTargetInfo.innerHTML =
            '<p class="match-placeholder">대상자를 선택하면 기본 정보와 선호 조건이 표시됩니다.</p>'
          updateMatchPreferenceSummary(null)
          return
        }
        const age = getAgeFromBirth(record.birth)
        const metaPieces = [
          record.gender || '',
          age ? `${age}세` : '',
          record.height || '',
          record.mbti ? `MBTI ${record.mbti}` : '',
          record.job || '',
        ].filter(Boolean)
        const metaHtml = metaPieces.length
          ? metaPieces.map((text) => `<span>${escapeHtml(text)}</span>`).join('')
          : '<span class="match-placeholder">추가 정보가 없습니다.</span>'
        matchTargetInfo.innerHTML = `
          <h5>${escapeHtml(record.name || '이름 미입력')}</h5>
          <div class="match-target-meta">
            ${metaHtml}
          </div>
        `
        updateMatchPreferenceSummary(record)
      }

      function updateMatchPreferenceSummary(record) {
        if (matchPreferredHeightEl) {
          const heightText =
            record?.preferredHeightLabel ||
            formatPreferenceText(record?.preferredHeights, '')
          matchPreferredHeightEl.textContent = heightText || '선호 키 정보가 없습니다.'
        }
        if (matchPreferredAgeEl) {
          const ageText =
            record?.preferredAgeLabel || formatPreferenceText(record?.preferredAges, '')
          matchPreferredAgeEl.textContent = ageText || '선호 나이 정보가 없습니다.'
        }
        if (matchPreferredLifestyleEl) {
          if (Array.isArray(record?.preferredLifestyle) && record.preferredLifestyle.length) {
            matchPreferredLifestyleEl.innerHTML = record.preferredLifestyle
              .map((value) => `<span class="match-chip">${escapeHtml(value)}</span>`)
              .join('')
          } else {
            matchPreferredLifestyleEl.textContent = '선호 라이프스타일 정보가 없습니다.'
          }
        }
      }

      function runMatchRecommendation() {
        if (!matchStatusEl || !matchResultsList) return
        const target = matchSelectedMemberId
          ? items.find((item) => item.id === matchSelectedMemberId)
          : null
        if (!target) {
          matchStatusEl.textContent = '대상자를 먼저 선택해주세요.'
          renderMatchResults([])
          return
        }
        const hasPreferences =
          (Array.isArray(target.preferredHeights) && target.preferredHeights.length) ||
          (Array.isArray(target.preferredAges) && target.preferredAges.length) ||
          (Array.isArray(target.preferredLifestyle) && target.preferredLifestyle.length)
        const introducedCandidateKeys = buildTargetCandidateHistorySet(target)
        const { list, total } = computeMatchResults(target, introducedCandidateKeys)
        const priorityEntries = buildPriorityMatchResults(target)
        const merged = mergePriorityMatchResults(priorityEntries, list)
        const displayList = merged.list
        const priorityDisplayed = merged.displayedPriorityCount
        const hasPriority = priorityDisplayed > 0
        const hasResultLimit = HAS_MATCH_RESULT_LIMIT
        const limitValue = MATCH_RESULT_LIMIT_VALUE
        if (!displayList.length) {
          matchStatusEl.textContent = '조건에 맞는 추천 후보가 없습니다.'
          renderMatchResults([])
          return
        }
        if (!hasPreferences) {
          matchStatusEl.textContent =
            '선호 조건이 없어도 상담 완료 회원을 모두 보여줍니다. 조건을 입력하면 우선순위가 더 정확해집니다.'
        } else if (hasPriority) {
          const fragments = []
          if (priorityEntries.length > priorityDisplayed) {
            fragments.push(
              `선매칭 ${priorityEntries.length}명 중 상위 ${priorityDisplayed}명 우선 표시`,
            )
          } else {
            fragments.push(`선매칭 ${priorityDisplayed}명 우선 표시`)
          }
          const additionalCount = displayList.length - priorityDisplayed
          if (hasResultLimit) {
            const remainingSlots = Math.max(limitValue - priorityDisplayed, 0)
            if (additionalCount > 0 && total > remainingSlots) {
              fragments.push(`조건 일치 ${total}명 중 ${remainingSlots}명 추가 노출`)
            } else if (additionalCount > 0) {
              fragments.push(`조건 일치 ${additionalCount}명 추가 노출`)
            } else if (total > displayList.length) {
              fragments.push('조건 일치 후보는 자리 확보 후 노출됩니다.')
            }
          } else {
            if (additionalCount > 0) {
              fragments.push(`조건 일치 ${additionalCount}명 추가 노출`)
            }
            fragments.push(`조건 일치 ${total}명 모두 표시 중`)
          }
          matchStatusEl.textContent = fragments.join(' · ')
        } else if (hasResultLimit && total > limitValue) {
          matchStatusEl.textContent = `${total}명 중 상위 ${limitValue}명만 표시합니다.`
        } else if (hasResultLimit) {
          matchStatusEl.textContent = `${total}명 추천되었습니다.`
        } else {
          matchStatusEl.textContent = `${total}명 모두 표시합니다.`
        }
        matchLatestAiRequestId += 1
        const decoratedResults = displayList.map((entry) => {
          const cachedSummary = getCachedMatchAiSummary(target, entry.candidate)
          return {
            ...entry,
            aiSummary: cachedSummary || '',
            aiStatus: cachedSummary ? 'ready' : 'pending',
          }
        })
        matchLatestResults = decoratedResults
        renderMatchResults(matchLatestResults)
        if (!matchAiFeatureDisabled) {
          hydrateMatchResultsWithAi(target, matchLatestResults)
        }
      }

      function renderMatchResults(results) {
        if (!matchResultsList) return
        if (!results.length) {
          matchResultsList.innerHTML =
            '<li class="match-placeholder">조건에 맞는 후보가 없습니다.</li>'
          return
        }
        matchResultsList.innerHTML = results
          .map((entry) => {
            const metaParts = [
              entry.meta.gender,
              entry.meta.birthLabel || entry.meta.ageLabel,
              entry.meta.heightLabel,
            ]
              .filter(Boolean)
              .join(' · ')
            const aiStatus = entry.aiStatus || ''
            let aiReasonHtml = ''
            if (aiStatus === 'loading') {
              aiReasonHtml =
                '<li class="match-ai-reason is-loading">커플매니저 코멘트를 불러오는 중입니다...</li>'
            } else if (aiStatus === 'error') {
              aiReasonHtml =
                '<li class="match-ai-reason is-error">AI 코멘트를 불러오지 못했습니다.</li>'
            } else if (entry.aiSummary) {
              aiReasonHtml = `<li class="match-ai-reason">${escapeHtml(entry.aiSummary)}</li>`
            }
            const fallbackReasons = (entry.reasons || [])
              .map((reason) => `<li>${escapeHtml(reason)}</li>`)
              .join('')
            const reasonsHtml = `${aiReasonHtml}${fallbackReasons}`
            return `
              <li class="match-result-card" data-id="${escapeHtml(entry.candidate.id || '')}">
                <div class="match-result-head">
                  <div>
                    <strong>${escapeHtml(entry.candidate.name || '이름 미입력')}</strong>
                    <div class="match-meta-row">
                      ${metaParts ? `<span>${escapeHtml(metaParts)}</span>` : ''}
                      ${
                        entry.meta.statusLabel
                          ? `<span class="match-state-badge ${escapeHtml(
                              entry.meta.statusClass,
                            )}">${escapeHtml(entry.meta.statusLabel)}</span>`
                          : ''
                      }
                    </div>
                  </div>
                  <div class="match-result-head-actions">
                    ${
                      entry.priority
                        ? '<span class="match-priority-chip">선매칭</span>'
                        : ''
                    }
                    <span class="match-score">점수 ${entry.score}/${MATCH_SCORE_MAX}</span>
                    <button type="button" class="match-result-add-btn match-select-btn">선택하기</button>
                  </div>
                </div>
                <ul class="match-reasons" data-ai-state="${escapeHtml(aiStatus)}">
                  ${reasonsHtml}
                </ul>
              </li>
            `
          })
          .join('')
      }

      function computeMatchResults(target, introducedCandidateKeys) {
        const evaluated = items
          .map((candidate) => evaluateMatchCandidate(target, candidate, introducedCandidateKeys))
          .filter(Boolean)
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            if (b.meta.lifestyleOverlapCount !== a.meta.lifestyleOverlapCount) {
              return b.meta.lifestyleOverlapCount - a.meta.lifestyleOverlapCount
            }
            return (b.meta.createdAt || 0) - (a.meta.createdAt || 0)
          })
        const limitedList = HAS_MATCH_RESULT_LIMIT
          ? evaluated.slice(0, MATCH_RESULT_LIMIT_VALUE)
          : evaluated
        return {
          list: limitedList,
          total: evaluated.length,
        }
      }

      function evaluateMatchCandidate(target, candidate, introducedCandidateKeys) {
        if (!target || !candidate || target.id === candidate.id) return null
        if (matchSelectedCandidates.some((entry) => entry.id === candidate.id)) return null
        const candidateKey = getMatchCandidateKey(candidate)
        if (
          introducedCandidateKeys instanceof Set &&
          candidateKey &&
          introducedCandidateKeys.has(candidateKey)
        ) {
          return null
        }
        const previouslyMatched = isCandidateMatched(candidate.id)
        const candidateStatus = PHONE_STATUS_VALUES.includes(candidate.phoneConsultStatus)
          ? candidate.phoneConsultStatus
          : 'pending'
        if (candidateStatus === 'pending') return null
        const targetGender = normalizeMatchGender(target.gender)
        const candidateGender = normalizeMatchGender(candidate.gender)
        if (targetGender && candidateGender && targetGender === candidateGender) return null
        let score = 0
        const reasons = []
        const candidateHeight = parseHeightValue(candidate.height)
        const heightMatch = getHeightMatch(target.preferredHeights, candidateHeight)
        if (heightMatch.matched) {
          score += 1
          reasons.push(
            `${candidate.height || (candidateHeight ? `${candidateHeight}cm` : '키 정보 미입력')}이(가) ${heightMatch.label} 선호 범위에 속합니다.`,
          )
        }
        const candidateAge = getAgeFromBirth(candidate.birth)
        const candidateBirthLabel = formatBirthLabel(candidate.birth)
        const ageMatch = getAgeMatch(target.preferredAges, candidateAge)
        if (ageMatch.matched) {
          score += 1
          const ageText = candidateBirthLabel || (candidateAge ? `${candidateAge}세` : '나이 정보')
          reasons.push(`${ageText}가 ${ageMatch.label} 조건과 일치합니다.`)
        }
        const lifestyleOverlap = getLifestyleOverlap(
          target.preferredLifestyle,
          candidate.preferredLifestyle,
        )
        if (lifestyleOverlap.length) {
          score += 1
          reasons.push(`라이프스타일 공통분모: ${lifestyleOverlap.join(', ')}`)
        }
        const createdAt = candidate.createdAt ? new Date(candidate.createdAt).getTime() : 0
        const statusKey = candidateStatus
        const meta = {
          gender: candidate.gender || '',
          birthLabel: candidateBirthLabel,
          ageLabel: formatAgeLabel(candidateAge),
          heightLabel: candidateHeight ? `${candidateHeight}cm` : candidate.height || '',
          lifestyleOverlapCount: lifestyleOverlap.length,
          createdAt,
          statusLabel: PHONE_STATUS_LABELS[statusKey] || '',
          statusClass: STATUS_CLASS_NAMES[statusKey] || '',
          previouslyMatched,
        }
        if (!score) {
          reasons.push('선호 조건과 정확히 일치하지 않지만 상담 완료 회원입니다.')
        }
        if (previouslyMatched) {
          reasons.push('최근 다른 대상자에게 소개된 이력이 있습니다.')
        }
        return {
          candidate,
          score,
          reasons,
          meta,
        }
      }

      function buildTargetCandidateHistorySet(targetRecord) {
        const introducedSet = new Set()
        if (!targetRecord || !Array.isArray(matchHistory) || !matchHistory.length) {
          return introducedSet
        }
        const targetId = targetRecord.id || ''
        const targetPhoneKey = normalizePhoneKey(targetRecord.phone)
        matchHistory.forEach((entry) => {
          if (!doesHistoryEntryMatchTarget(entry, targetId, targetPhoneKey)) return
          const candidateKey =
            entry?.candidateId ||
            entry?.candidate?.id ||
            normalizePhoneKey(entry?.candidatePhone || entry?.candidate?.phone || '')
          if (candidateKey) {
            introducedSet.add(candidateKey)
          }
        })
        return introducedSet
      }

      function doesHistoryEntryMatchTarget(entry, targetId, targetPhoneKey) {
        if (!entry) return false
        if (targetId && entry.targetId === targetId) {
          return true
        }
        if (!targetPhoneKey) return false
        const entryTargetPhoneKey = normalizePhoneKey(
          entry.targetPhone ||
            entry.target?.phone ||
            entry.target?.phoneMasked ||
            entry.target?.phoneOriginal ||
            '',
        )
        return Boolean(entryTargetPhoneKey && entryTargetPhoneKey === targetPhoneKey)
      }

      function buildPriorityMatchResults(targetRecord) {
        if (!targetRecord) return []
        const reverseEntries = getReverseMatchEntriesForTarget(targetRecord)
        if (!reverseEntries.length) return []
        return reverseEntries
          .map(({ record, matchedAt }) => {
            if (isCandidateInSelection(record)) {
              return null
            }
            const evaluated = evaluateMatchCandidate(targetRecord, record)
            if (evaluated) {
              return {
                ...evaluated,
                reasons: [
                  '이번 주 선매칭에서 이미 연결된 남성 후보입니다.',
                  ...evaluated.reasons,
                ],
                priority: true,
                priorityMatchedAt: matchedAt || 0,
              }
            }
            return buildFallbackPriorityMatchEntry(record, matchedAt)
          })
          .filter(Boolean)
      }

      function buildFallbackPriorityMatchEntry(record, matchedAt) {
        if (!record) return null
        const candidateAge = getAgeFromBirth(record.birth)
        const candidateHeight = parseHeightValue(record.height)
        const statusKey = PHONE_STATUS_VALUES.includes(record.phoneConsultStatus)
          ? record.phoneConsultStatus
          : 'pending'
        if (statusKey === 'pending') return null
        const candidateBirthLabel = formatBirthLabel(record.birth)
        return {
          candidate: record,
          score: 0,
          reasons: ['이번 주 선매칭에서 이미 연결된 남성 후보입니다.'],
          meta: {
            gender: record.gender || '',
            birthLabel: candidateBirthLabel,
            ageLabel: formatAgeLabel(candidateAge),
            heightLabel: candidateHeight ? `${candidateHeight}cm` : record.height || '',
            lifestyleOverlapCount: 0,
            createdAt: record.createdAt ? new Date(record.createdAt).getTime() : 0,
            statusLabel: PHONE_STATUS_LABELS[statusKey] || '',
            statusClass: STATUS_CLASS_NAMES[statusKey] || '',
          },
          priority: true,
          priorityMatchedAt: matchedAt || 0,
        }
      }

      function isCandidateInSelection(record) {
        if (!record) return false
        const candidateKey = record.id || normalizePhoneKey(record.phone)
        if (!candidateKey) return false
        return matchSelectedCandidates.some((entry) => entry.id === candidateKey)
      }

      function getReverseMatchEntriesForTarget(targetRecord) {
        if (!targetRecord) return []
        if (!Array.isArray(matchHistory) || !matchHistory.length) return []
        const currentWeek = getWeekInfo(new Date())
        const targetId = targetRecord.id || ''
        const targetPhoneKey = normalizePhoneKey(targetRecord.phone)
        if (!targetId && !targetPhoneKey) return []
        const seenIds = new Set()
        return matchHistory
          .filter((entry) => {
            if (!entry || isConfirmedMatchEntry(entry)) return false
            const sameId = targetId && entry.candidateId === targetId
            const entryPhoneKey = normalizePhoneKey(entry.candidatePhone || entry.candidate?.phone || '')
            const samePhone = targetPhoneKey && entryPhoneKey === targetPhoneKey
            if (!sameId && !samePhone) return false
            if (!entry.week) return true
            return entry.week.year === currentWeek.year && entry.week.week === currentWeek.week
          })
          .map((entry) => {
            const record = findMemberByIdOrPhone(entry.targetId, entry.target?.phone)
            if (!record) return null
            const recordKey = record.id || normalizePhoneKey(record.phone)
            if (recordKey && seenIds.has(recordKey)) return null
            if (recordKey) seenIds.add(recordKey)
            return {
              record,
              matchedAt: entry.matchedAt || 0,
            }
          })
          .filter(Boolean)
          .sort((a, b) => (b.matchedAt || 0) - (a.matchedAt || 0))
      }

      function findMemberByIdOrPhone(id, phone) {
        if (id) {
          const byId = items.find((item) => item.id === id)
          if (byId) return byId
        }
        const phoneKey = normalizePhoneKey(phone)
        if (!phoneKey) return null
        return items.find((item) => normalizePhoneKey(item.phone) === phoneKey) || null
      }

      function mergePriorityMatchResults(priorityEntries, regularEntries) {
        const merged = []
        const seen = new Set()
        let displayedPriorityCount = 0
        const priorityList = Array.isArray(priorityEntries) ? priorityEntries : []
        const regularList = Array.isArray(regularEntries) ? regularEntries : []
        const enforceLimit = HAS_MATCH_RESULT_LIMIT
        const limitValue = MATCH_RESULT_LIMIT_VALUE
        priorityList.forEach((entry) => {
          if (!entry || !entry.candidate) return
          if (enforceLimit && merged.length >= limitValue) return
          const candidateId = entry.candidate.id || ''
          const candidateKey = candidateId || normalizePhoneKey(entry.candidate.phone)
          if (candidateKey && seen.has(candidateKey)) return
          merged.push(entry)
          displayedPriorityCount += 1
          if (candidateKey) seen.add(candidateKey)
        })
        regularList.forEach((entry) => {
          if (enforceLimit && merged.length >= limitValue) return
          const candidateId = entry?.candidate?.id || ''
          const candidateKey = candidateId || normalizePhoneKey(entry?.candidate?.phone)
          if (candidateKey && seen.has(candidateKey)) return
          merged.push(entry)
          if (candidateKey) seen.add(candidateKey)
        })
        return {
          list: merged,
          priorityCount: priorityList.length,
          displayedPriorityCount,
        }
      }

      function hydrateMatchResultsWithAi(targetRecord, resultEntries) {
        if (
          !targetRecord ||
          matchAiFeatureDisabled ||
          !Array.isArray(resultEntries) ||
          !resultEntries.length
        ) {
          return
        }
        const pendingEntries = resultEntries.filter((entry) => entry.aiStatus !== 'ready')
        if (!pendingEntries.length) return
        const requestPayload = buildMatchAiRequestPayload(targetRecord, pendingEntries)
        if (!requestPayload) {
          let needsRender = false
          pendingEntries.forEach((entry) => {
            if (entry.aiStatus !== 'ready') {
              entry.aiStatus = 'error'
              needsRender = true
            }
          })
          if (needsRender) {
            renderMatchResults(resultEntries)
          }
          return
        }
        pendingEntries.forEach((entry) => {
          entry.aiStatus = 'loading'
        })
        renderMatchResults(resultEntries)
        const requestId = ++matchLatestAiRequestId
        const requestedIds = new Set(requestPayload.candidates.map((candidate) => candidate.id))
        fetchMatchAiSummaries(requestPayload)
          .then((data) => {
            if (requestId !== matchLatestAiRequestId) return
            applyMatchAiSummaries(targetRecord, data?.summaries || {})
          })
          .catch((error) => {
            if (error?.code === 'ai_disabled') {
              matchAiFeatureDisabled = true
              matchLatestResults = (matchLatestResults || []).map((entry) =>
                entry.aiStatus === 'loading' ? { ...entry, aiStatus: 'idle' } : entry,
              )
              renderMatchResults(matchLatestResults)
              return
            }
            if (requestId !== matchLatestAiRequestId) return
            let shouldRender = false
            matchLatestResults = (matchLatestResults || []).map((entry) => {
              const candidateKey = getMatchCandidateKey(entry?.candidate)
              if (!candidateKey || !requestedIds.has(candidateKey)) {
                return entry
              }
              if (entry.aiStatus === 'loading') {
                shouldRender = true
                return { ...entry, aiStatus: 'error' }
              }
              return entry
            })
            if (shouldRender) {
              renderMatchResults(matchLatestResults)
            }
            console.warn('[match-ai] 추천 멘트 생성 실패', error)
          })
      }

      function buildMatchAiRequestPayload(targetRecord, entries) {
        const targetPayload = buildMatchAiTargetPayload(targetRecord)
        if (!targetPayload) return null
        const seen = new Set()
        const candidates = []
        for (const entry of entries) {
          if (candidates.length >= MATCH_AI_MAX_REQUEST) break
          const candidatePayload = buildMatchAiCandidatePayload(entry)
          if (!candidatePayload || seen.has(candidatePayload.id)) continue
          candidates.push(candidatePayload)
          seen.add(candidatePayload.id)
        }
        if (!candidates.length) return null
        return {
          target: targetPayload,
          candidates,
        }
      }

      function buildMatchAiTargetPayload(record) {
        if (!record) return null
        const id = getMatchCandidateKey(record)
        if (!id) return null
        return {
          id,
          name: record.name || '',
          gender: record.gender || '',
          birth: record.birth || '',
          height: record.height || '',
          job: record.job || '',
          mbti: record.mbti || '',
          district: record.district || '',
          preferredHeights: Array.isArray(record.preferredHeights) ? record.preferredHeights : [],
          preferredAges: Array.isArray(record.preferredAges) ? record.preferredAges : [],
          preferredLifestyle: Array.isArray(record.preferredLifestyle)
            ? record.preferredLifestyle
            : [],
        }
      }

      function buildMatchAiCandidatePayload(entry) {
        if (!entry || !entry.candidate) return null
        const id = getMatchCandidateKey(entry.candidate)
        if (!id) return null
        return {
          id,
          name: entry.candidate.name || '',
          gender: entry.candidate.gender || '',
          birth: entry.candidate.birth || '',
          height: entry.candidate.height || '',
          job: entry.candidate.job || '',
          mbti: entry.candidate.mbti || '',
          reasons: Array.isArray(entry.reasons) ? entry.reasons : [],
          score: entry.score || 0,
        }
      }

      async function fetchMatchAiSummaries(payload) {
        const response = await fetch(MATCH_AI_SUMMARY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body?.ok) {
          const error = new Error(body?.message || 'AI 추천 멘트를 생성하지 못했습니다.')
          error.code = body?.code || ''
          throw error
        }
        return body.data || {}
      }

      function applyMatchAiSummaries(targetRecord, summariesMap) {
        if (!targetRecord || !summariesMap || !matchLatestResults?.length) return
        let shouldRender = false
        matchLatestResults = matchLatestResults.map((entry) => {
          const candidateKey = getMatchCandidateKey(entry?.candidate)
          if (!candidateKey) return entry
          const summary = summariesMap[candidateKey]
          if (!summary) return entry
          const cacheKey = buildMatchAiCacheKey(targetRecord, entry.candidate)
          if (cacheKey) {
            matchAiInsightCache.set(cacheKey, summary)
          }
          if (entry.aiSummary === summary && entry.aiStatus === 'ready') return entry
          shouldRender = true
          return {
            ...entry,
            aiSummary: summary,
            aiStatus: 'ready',
          }
        })
        if (shouldRender) {
          renderMatchResults(matchLatestResults)
        }
      }

      function getCachedMatchAiSummary(targetRecord, candidateRecord) {
        const cacheKey = buildMatchAiCacheKey(targetRecord, candidateRecord)
        if (!cacheKey) return ''
        return matchAiInsightCache.get(cacheKey) || ''
      }

      function buildMatchAiCacheKey(targetRecord, candidateRecord) {
        const targetKey = getMatchCandidateKey(targetRecord)
        const candidateKey = getMatchCandidateKey(candidateRecord)
        if (!targetKey || !candidateKey) return ''
        const targetVersion = targetRecord?.updatedAt || targetRecord?.matchedAt || ''
        const candidateVersion = candidateRecord?.updatedAt || candidateRecord?.matchedAt || ''
        return `${targetKey}:${targetVersion}|${candidateKey}:${candidateVersion}`
      }

      function getMatchCandidateKey(record) {
        if (!record || typeof record !== 'object') return ''
        return record.id || normalizePhoneKey(record.phone) || ''
      }

      function getHeightMatch(preferences, heightValue) {
        if (!Array.isArray(preferences) || !preferences.length || !Number.isFinite(heightValue)) {
          return { matched: false, label: '' }
        }
        for (const label of preferences) {
          const range = HEIGHT_PREFERENCE_MAP.find((entry) => entry.label === label)
          if (!range) continue
          const minOk = heightValue >= range.min
          const maxOk = heightValue <= range.max
          if (minOk && maxOk) {
            return { matched: true, label: range.label }
          }
        }
        return { matched: false, label: '' }
      }

      function getAgeMatch(preferences, ageValue) {
        if (!Array.isArray(preferences) || !preferences.length || !Number.isFinite(ageValue)) {
          return { matched: false, label: '' }
        }
        for (const label of preferences) {
          const range = AGE_PREFERENCE_MAP.find((entry) => entry.label === label)
          if (!range) continue
          const minOk = ageValue >= range.min
          const maxOk = ageValue <= range.max
          if (minOk && maxOk) {
            return { matched: true, label: range.label }
          }
        }
        return { matched: false, label: '' }
      }

      function getBirthYear(value) {
        if (!value) return null
        return parseBirthYearInput(value)
      }

      function getAgeFromBirth(value) {
        const year = getBirthYear(value)
        if (!year) return null
        const now = new Date()
        const age = now.getFullYear() - year
        if (age < 15 || age > 90) return null
        return age
      }

      function formatAgeLabel(age) {
        if (!Number.isFinite(age)) return ''
        const bracket = getAgeBracket(age)
        return bracket ? `${age}세 (${bracket})` : `${age}세`
      }

      function formatBirthLabel(value) {
        const year = getBirthYear(value)
        return Number.isFinite(year) ? formatBirthYearLabel(year) : ''
      }

      function getAgeBracket(age) {
        const found = AGE_PREFERENCE_MAP.find((entry) => age >= entry.min && age <= entry.max)
        return found ? found.label : ''
      }

      function parseHeightValue(value) {
        if (!value) return null
        const match = String(value).match(/(\d{2,3})/)
        return match ? Number(match[1]) : null
      }

      function getLifestyleOverlap(source, target) {
        if (!Array.isArray(source) || !source.length) return []
        if (!Array.isArray(target) || !target.length) return []
        const set = new Set(target.map((item) => item?.trim()).filter(Boolean))
        return source.filter((item) => set.has(item))
      }

      function buildMatchOptionLabel(item) {
        if (!item) return ''
        const descriptor = [
          item.name || '',
          item.gender || '',
          item.height || '',
          item.phone || '',
        ]
          .filter(Boolean)
          .join(' · ')
        return descriptor || String(item.name || '')
      }

      function buildMatchPhoneOptionLabel(item) {
        if (!item) return ''
        const descriptor = [
          formatPhoneNumber(item.phone) || item.phone || '',
          item.name || '',
          item.gender || '',
          item.height || '',
        ]
          .filter(Boolean)
          .join(' · ')
        return descriptor || String(item.phone || '')
      }

      function createMatchOptionElement(item, value, displayLabel) {
        if (!value) return null
        const option = document.createElement('option')
        option.value = value
        if (displayLabel) {
          option.label = displayLabel
        }
        if (item?.id) {
          option.dataset.id = item.id
        }
        option.dataset.phone = item?.phone || ''
        return option
      }

      function formatPreferenceText(values, fallback) {
        if (Array.isArray(values) && values.length) {
          return values.join(', ')
        }
        return fallback
      }
      function normalizeMatchGender(value) {
        const normalized = String(value || '')
          .trim()
          .toLowerCase()
        if (!normalized) return ''
        if (normalized.startsWith('남')) return 'male'
        if (normalized.startsWith('여')) return 'female'
        return ''
      }

      function isCandidateMatched(candidateId) {
        if (!candidateId) return false
        return matchedCandidateIds.has(candidateId)
      }

      function addCandidateToSelectionById(candidateId) {
        if (!candidateId) return
        const record = items.find((item) => item.id === candidateId)
        if (!record) {
          showToast('대상 회원 정보를 찾을 수 없습니다.')
          return
        }
        addCandidateToSelection(record)
      }

      function addCandidateToSelection(record) {
        if (!matchSelectionTargetId || !matchSelectedMemberId) {
          showToast('대상자를 먼저 선택해주세요.')
          return
        }
        if (!record?.id) {
          showToast('후보 정보가 올바르지 않습니다.')
          return
        }
        if (record.id === matchSelectedMemberId) {
          showToast('대상자 본인은 후보로 선택할 수 없습니다.')
          return
        }
        if (matchSelectedCandidates.some((entry) => entry.id === record.id)) {
          showToast('이미 선택된 후보입니다.')
          return
        }
        matchSelectedCandidates.push({
          id: record.id,
          snapshot: buildCandidateSnapshot(record),
          createdAt: Date.now(),
        })
        updateMatchSelectionSummary()
        showToast(`${record.name || '이름 미입력'} 님을 후보에 추가했습니다.`)
        runMatchRecommendation()
      }

      function handleMatchSelectionClick(event) {
        const card = event.target.closest('.match-selection-card')
        if (!card) return
        const candidateId = card.dataset.id
        if (!candidateId) return
        if (event.target.closest('.match-selection-remove')) {
          removeCandidateFromSelection(candidateId)
          return
        }
        if (event.target.closest('.match-selection-confirm')) {
          confirmCandidateSelection(candidateId)
        }
      }

      function removeCandidateFromSelection(candidateId) {
        const index = matchSelectedCandidates.findIndex((entry) => entry.id === candidateId)
        if (index === -1) return
        matchSelectedCandidates.splice(index, 1)
        updateMatchSelectionSummary()
        runMatchRecommendation()
      }

      function confirmCandidateSelection(candidateId) {
        const index = matchSelectedCandidates.findIndex((entry) => entry.id === candidateId)
        if (index === -1) return
        const [entry] = matchSelectedCandidates.splice(index, 1)
        const candidateRecord = items.find((item) => item.id === candidateId)
        const targetRecord = items.find((item) => item.id === matchSelectionTargetId)
        const historyEntry = buildMatchHistoryEntry(entry.snapshot || candidateRecord, targetRecord)
        matchHistory.unshift(historyEntry)
        rememberMatchInitiatorByEntry(historyEntry)
        if (historyEntry.candidateId) {
          matchedCandidateIds.add(historyEntry.candidateId)
        }
        saveMatchHistory()
        syncMatchHistoryEntryWithServer(historyEntry, targetRecord)
        updateMatchSelectionSummary()
        updateMatchHistoryUI()
        runMatchRecommendation()
        showToast(`${historyEntry.candidate?.name || '후보'} 님을 이번주 소개에 추가했습니다.`)
      }

      function updateMatchSelectionSummary() {
        if (!matchSelectionList || !matchSelectionCountEl || !matchSelectionEmptyEl) return
        matchSelectionCountEl.textContent = `${matchSelectedCandidates.length}명`
        matchSelectionEmptyEl.hidden = matchSelectedCandidates.length > 0
        if (!matchSelectedCandidates.length) {
          matchSelectionList.innerHTML = ''
          return
        }
        matchSelectionList.innerHTML = matchSelectedCandidates
          .map((entry) => {
            const snapshot = entry.snapshot || {}
            return `
              <li class="match-selection-card" data-id="${escapeHtml(entry.id || '')}">
                <div class="match-selection-name-row">
                  <strong>${escapeHtml(snapshot.name || '이름 미입력')}</strong>
                  <div class="match-selection-actions">
                    <button type="button" class="match-selection-confirm">확정</button>
                    <button type="button" class="match-selection-remove">제거</button>
                  </div>
                </div>
                <p class="match-selection-meta">${escapeHtml(
                  buildCandidateMetaLine(snapshot),
                )}</p>
              </li>
            `
          })
          .join('')
      }

      function buildCandidateMetaLine(snapshot) {
        const ageLabel = snapshot.ageLabel || ''
        const parts = [
          snapshot.gender || '',
          ageLabel,
          snapshot.job || '',
          snapshot.height ? `${snapshot.height}` : '',
        ].filter(Boolean)
        return parts.length ? parts.join(' · ') : '추가 정보 없음'
      }

      function handleMatchResultsClick(event) {
        const card = event.target.closest('.match-result-card')
        if (!card) return
        const candidateId = card.dataset.id
        if (!candidateId) return
        if (event.target.closest('.match-result-add-btn')) {
          addCandidateToSelectionById(candidateId)
          event.stopPropagation()
          return
        }
        openDetailModal(candidateId)
      }

      function buildCandidateSnapshot(record) {
        if (!record) return {}
        const age = getAgeFromBirth(record.birth)
        return {
          id: record.id || '',
          name: record.name || '',
          gender: record.gender || '',
          ageLabel: age ? `${age}세` : '',
          job: record.job || '',
          height: record.height || '',
          phone: record.phone || '',
        }
      }

      function buildMatchHistoryEntry(candidateRecord, targetRecord) {
        const now = Date.now()
        const candidateSnapshot = buildCandidateSnapshot(candidateRecord)
        const targetSnapshot = targetRecord ? buildCandidateSnapshot(targetRecord) : null
        const targetPhoneKey = normalizePhoneKey(targetSnapshot?.phone)
        const weekInfo = getWeekInfo(new Date(now))
        return {
          id: `${candidateSnapshot.id || 'candidate'}-${now}`,
          candidateId: candidateSnapshot.id || '',
          candidate: candidateSnapshot,
          target: targetSnapshot,
          targetId: targetSnapshot?.id || targetRecord?.id || '',
          targetPhone: targetPhoneKey,
          matchedAt: now,
          week: {
            label: weekInfo.label,
            startTime: weekInfo.start.getTime(),
            endTime: weekInfo.end.getTime(),
            year: weekInfo.year,
            week: weekInfo.week,
          },
          category: MATCH_HISTORY_CATEGORY.INTRO,
          targetSelected: false,
        }
      }

      function updateMatchHistoryUI() {
        updateMatchedCouplesButton()
        if (!matchHistoryList || !matchHistorySummaryEl) return
        const activeEntries = getActiveMatchHistoryEntries()
        const enrichedEntries = mergeConfirmedEntriesForActiveTarget(activeEntries)
        matchHistorySummaryEl.textContent = `${enrichedEntries.length}명`
        if (!matchSelectionTargetId && !matchSelectionTargetPhoneKey) {
        matchHistoryList.innerHTML =
          '<p class="match-history-empty">대상자를 선택하면 이번주 소개가 표시됩니다.</p>'
          return
        }
        if (!enrichedEntries.length) {
          matchHistoryList.innerHTML =
          '<p class="match-history-empty">이 대상자에 대한 이번주 소개가 없습니다.</p>'
          return
        }
        const groups = buildMatchHistoryGroups(enrichedEntries)
        matchHistoryList.innerHTML = groups.length
          ? groups
          .map(
            (group) => `
              <div class="match-history-group">
                <div class="match-history-group-title">
                  <strong>${escapeHtml(group.label)}</strong>
                  <span>${escapeHtml(group.rangeLabel)}</span>
                </div>
                <div class="match-history-items">
                  ${group.items
                    .map((item) => {
                      const name = item.candidate?.name || '이름 미입력'
                      const partner = item.target?.name ? `· 대상 ${item.target.name}` : ''
                      const dateLabel = formatDate(item.matchedAt)
                      const statusLabel = getMatchHistoryStatusLabel(item)
                      const metaLabel = statusLabel ? `${dateLabel} · ${statusLabel}` : dateLabel
                      return `<div class="match-history-item" data-id="${escapeHtml(
                        item.id || '',
                      )}"><div class="match-history-item-row"><span>${escapeHtml(
                        name,
                      )} ${escapeHtml(
                        partner,
                      )}</span><div class="match-history-item-actions"><small>${escapeHtml(
                        metaLabel,
                      )}</small><button type="button" class="match-history-remove" aria-label="기록 삭제">×</button></div></div></div>`
                    })
                    .join('')}
                </div>
              </div>
            `,
          )
          .join('')
          : '<p class="match-history-empty">이 대상자에 대한 이번주 소개가 없습니다.</p>'
      }

      function getActiveMatchHistoryEntries() {
        if (!matchSelectionTargetId && !matchSelectionTargetPhoneKey) {
          return []
        }
        const normalizedKey = matchSelectionTargetPhoneKey
        return matchHistory.filter((entry) => {
          if (matchSelectionTargetId && entry.targetId === matchSelectionTargetId) return true
          if (!normalizedKey) return false
          const entryPhone = normalizePhoneKey(entry.targetPhone || entry.target?.phone || '')
          return entryPhone && entryPhone === normalizedKey
        })
      }

      function mergeConfirmedEntriesForActiveTarget(activeEntries = []) {
        const list = Array.isArray(activeEntries) ? [...activeEntries] : []
        if (!matchSelectionTargetId && !matchSelectionTargetPhoneKey) {
          return list
        }
        const seenIds = new Set(list.map((entry) => entry.id).filter(Boolean))
        const currentWeek = getWeekInfo(new Date())
        const isCurrentWeekEntry = (week = null) =>
          week &&
          Number(week.year) === currentWeek.year &&
          Number(week.week) === currentWeek.week
        const targetId = matchSelectionTargetId || ''
        const targetPhoneKey = matchSelectionTargetPhoneKey || ''
        const confirmedForTarget = confirmedMatches
          .filter((entry) => doesHistoryEntryMatchTarget(entry, targetId, targetPhoneKey))
          .filter((entry) => isCurrentWeekEntry(entry.week))
          .filter((entry) => !seenIds.has(entry.id))
          .map(mapConfirmedMatchToHistoryEntry)
          .filter(Boolean)
        if (!confirmedForTarget.length) {
          return list
        }
        confirmedForTarget.forEach((entry) => {
          if (entry?.id) {
            seenIds.add(entry.id)
          }
          list.push(entry)
        })
        return list.sort((a, b) => (b.matchedAt || 0) - (a.matchedAt || 0))
      }

      function buildMatchHistoryGroups(history) {
        const map = new Map()
        history.forEach((entry) => {
          const weekKey = entry.week ? `${entry.week.year}-W${entry.week.week}` : ''
          const startDate =
            entry.week && entry.week.startTime ? new Date(entry.week.startTime) : null
          const endDate =
            entry.week && entry.week.endTime ? new Date(entry.week.endTime) : null
          if (!map.has(weekKey)) {
            map.set(weekKey, {
              key: weekKey,
              label: entry.week?.label || '기록',
              rangeLabel:
                startDate && endDate ? formatWeekRange(startDate, endDate) : '기간 정보 없음',
              items: [],
            })
          }
          map.get(weekKey).items.push(entry)
        })
        return Array.from(map.values())
      }

      function mapConfirmedMatchToHistoryEntry(entry) {
        if (!entry) return null
        return {
          id: entry.id || `${entry.targetId || 'target'}-${entry.candidateId || 'candidate'}`,
          candidateId: entry.candidateId || entry.candidate?.id || '',
          candidate: entry.candidate || null,
          targetId: entry.targetId || entry.target?.id || '',
          target: entry.target || null,
          targetPhone: entry.targetPhone || entry.target?.phone || '',
          matchedAt: entry.confirmedAt || entry.matchedAt || Date.now(),
          week: entry.week || null,
          category: MATCH_HISTORY_CATEGORY.CONFIRMED,
          targetSelected: true,
        }
      }

      function getMatchHistoryStatusLabel(entry) {
        if (isConfirmedMatchEntry(entry)) {
          return isAdditionalConfirmedMatch(entry) ? '추가 매칭 완료' : '매칭 완료'
        }
        if (entry?.targetSelected) {
          return '회원 확인'
        }
        return ''
      }

      function isAdditionalConfirmedMatch(entry) {
        if (!isConfirmedMatchEntry(entry)) return false
        const pairKey = buildMatchPairKey(entry)
        if (!pairKey) return false
        const weekMeta = entry.week || null
        const introExists = matchHistory.some((historyEntry) => {
          if (!historyEntry) return false
          if (normalizeMatchHistoryCategory(historyEntry.category) !== MATCH_HISTORY_CATEGORY.INTRO) {
            return false
          }
          if (buildMatchPairKey(historyEntry) !== pairKey) return false
          if (weekMeta && historyEntry.week && !isSameWeek(historyEntry.week, weekMeta)) {
            return false
          }
          return true
        })
        return !introExists
      }

      function getCurrentWeekConfirmedMatches() {
        const weekInfo = getWeekInfo(new Date())
        const currentWeekEntries = confirmedMatches.filter(
          (entry) =>
            isConfirmedMatchEntry(entry) &&
            entry.week?.year === weekInfo.year &&
            entry.week?.week === weekInfo.week,
        )
        return dedupeConfirmedCouples(currentWeekEntries)
      }

      function dedupeConfirmedCouples(entries = []) {
        const currentWeekInfo = getWeekInfo(new Date())
        const pairMap = new Map()
        entries.forEach((entry) => {
          const pairKey = buildMatchPairKey(entry)
          const mapKey = pairKey || `__${entry?.id || pairMap.size}`
          const entryTime = Number(entry?.confirmedAt || entry?.matchedAt || 0)
          if (!pairMap.has(mapKey)) {
            pairMap.set(mapKey, {
              pairKey: mapKey,
              confirmed: [],
              earliestEntry: entry,
              earliestTime: entryTime,
              latestEntry: entry,
              latestTime: entryTime,
            })
          } else {
            const record = pairMap.get(mapKey)
            if (entryTime < record.earliestTime) {
              record.earliestEntry = entry
              record.earliestTime = entryTime
            }
            if (entryTime > record.latestTime) {
              record.latestEntry = entry
              record.latestTime = entryTime
            }
          }
          pairMap.get(mapKey).confirmed.push(entry)
        })
        const historyIndex = buildMatchHistoryPairIndex((historyEntry) =>
          isSameWeek(historyEntry.week, currentWeekInfo),
        )
        return Array.from(pairMap.values())
          .map((record) => {
            const cachedSource = getCachedInitiatorSource(currentWeekInfo, record.pairKey)
            if (cachedSource) {
              return applyParticipantOrientation(record.latestEntry, cachedSource)
            }
            const orientationSource =
              findOrientationSource(record.pairKey, historyIndex) || record.earliestEntry
            return applyParticipantOrientation(record.latestEntry, orientationSource)
          })
          .sort(
            (a, b) =>
              Number(b?.confirmedAt || b?.matchedAt || 0) -
              Number(a?.confirmedAt || a?.matchedAt || 0),
          )
      }

      function buildMatchHistoryPairIndex(filterFn) {
        const map = new Map()
        if (!Array.isArray(matchHistory) || !matchHistory.length) {
          return map
        }
        matchHistory.forEach((entry) => {
          if (!entry) return
          if (typeof filterFn === 'function' && !filterFn(entry)) {
            return
          }
          const pairKey = buildMatchPairKey(entry)
          if (!pairKey) return
          if (!map.has(pairKey)) {
            map.set(pairKey, [])
          }
          map.get(pairKey).push(entry)
        })
        map.forEach((list, key) => {
          map.set(
            key,
            list.sort(
              (a, b) =>
                Number(a?.matchedAt || a?.confirmedAt || 0) -
                Number(b?.matchedAt || b?.confirmedAt || 0),
            ),
          )
        })
        return map
      }

      function findOrientationSource(pairKey, historyIndex) {
        if (!pairKey || !historyIndex) return null
        const list = historyIndex.get(pairKey)
        if (!Array.isArray(list) || !list.length) return null
        const introEntry = list.find(
          (entry) => normalizeMatchHistoryCategory(entry?.category) === MATCH_HISTORY_CATEGORY.INTRO,
        )
        if (introEntry) return introEntry
        const pendingEntry = list.find((entry) => entry && entry.targetSelected === false)
        if (pendingEntry) return pendingEntry
        return list[0]
      }

      function isSameWeek(weekMeta, referenceWeek) {
        if (!weekMeta || !referenceWeek) return false
        return (
          Number(weekMeta.year) === Number(referenceWeek.year) &&
          Number(weekMeta.week) === Number(referenceWeek.week)
        )
      }

      function buildMatchPairKey(entry) {
        if (!entry) return ''
        const targetKey = getMatchParticipantKey(entry, 'target')
        const candidateKey = getMatchParticipantKey(entry, 'candidate')
        if (!targetKey && !candidateKey) return ''
        const orderedKeys = [
          targetKey || `target:${entry?.id || ''}`,
          candidateKey || `candidate:${entry?.id || ''}`,
        ]
          .map((value) => String(value))
          .sort()
        return orderedKeys.join('__')
      }

      function getMatchParticipantKey(entry, role) {
        if (!entry) return ''
        const participant =
          role === 'target' ? entry.target : role === 'candidate' ? entry.candidate : null
        const fallbackId = role === 'target' ? entry.targetId : entry.candidateId
        const fallbackPhone =
          role === 'target'
            ? entry.targetPhone || participant?.phoneMasked
            : entry.candidatePhone || participant?.phoneMasked
        const normalizedId =
          (participant && normalizeIdentifier(participant.id)) || normalizeIdentifier(fallbackId)
        if (normalizedId) {
          return normalizedId
        }
        const phoneKey = normalizePhoneKey(
          (participant && (participant.phone || participant.phoneMasked)) || fallbackPhone,
        )
        return phoneKey || ''
      }

      function applyParticipantOrientation(preferredEntry, orientationSource) {
        if (!preferredEntry) return preferredEntry
        const orientationMeta = buildParticipantOrientationMeta(orientationSource)
        if (!orientationMeta) {
          return {
            ...preferredEntry,
            displayTarget: preferredEntry.target || preferredEntry.candidate || null,
            displayCandidate: preferredEntry.candidate || preferredEntry.target || null,
          }
        }
        const resolvedTarget = resolveParticipantFromMeta(preferredEntry, orientationMeta.first)
        const resolvedCandidate = resolveParticipantFromMeta(preferredEntry, orientationMeta.second)
        return {
          ...preferredEntry,
          displayTarget: resolvedTarget || orientationMeta.first.snapshot || preferredEntry.target,
          displayCandidate:
            resolvedCandidate || orientationMeta.second.snapshot || preferredEntry.candidate,
        }
      }

      function buildParticipantOrientationMeta(entry) {
        if (!entry) return null
        const targetMeta = buildParticipantMeta(entry, 'target')
        const candidateMeta = buildParticipantMeta(entry, 'candidate')
        if (!targetMeta && !candidateMeta) return null
        return {
          first: targetMeta,
          second: candidateMeta,
        }
      }

      function buildParticipantMeta(entry, role) {
        if (!entry) return null
        const participant = role === 'target' ? entry.target : entry.candidate
        const idField = role === 'target' ? entry.targetId : entry.candidateId
        const nameField = role === 'target' ? entry.targetName : entry.candidateName
        const genderField = role === 'target' ? entry.targetGender : entry.candidateGender
        const rawPhone =
          role === 'target'
            ? entry.targetPhone || entry.target?.phone || entry.target?.phoneMasked
            : entry.candidatePhone || entry.candidate?.phone || entry.candidate?.phoneMasked
        if (!participant && !idField && !rawPhone && !nameField) {
          return null
        }
        const normalizedId = normalizeIdentifier(participant?.id || idField)
        const phoneKey = normalizePhoneKey(participant?.phone || participant?.phoneMasked || rawPhone)
        return {
          role,
          id: normalizedId,
          phone: phoneKey,
          name: participant?.name || nameField || '',
          gender: participant?.gender || genderField || '',
          snapshot:
            participant ||
            buildParticipantFallback({
              id: normalizedId,
              name: participant?.name || nameField || '',
              gender: participant?.gender || genderField || '',
              phone: rawPhone,
            }),
        }
      }

      function buildParticipantFallback({ id = '', name = '', gender = '', phone = '' } = {}) {
        const formattedPhone = formatPhoneNumber(phone)
        return {
          id,
          name,
          gender,
          phone: formattedPhone,
          phoneMasked: formattedPhone,
        }
      }

      function resolveParticipantFromMeta(entry, meta) {
        if (!meta) return null
        const candidates = []
        if (entry.target) candidates.push(entry.target)
        if (entry.candidate) candidates.push(entry.candidate)
        const matched = candidates.find((participant) => participantMatchesMeta(participant, meta))
        if (matched) return matched
        return meta.snapshot || null
      }

      function participantMatchesMeta(participant, meta) {
        if (!participant || !meta) return false
        const participantId = normalizeIdentifier(participant.id)
        if (participantId && meta.id && participantId === meta.id) {
          return true
        }
        const participantPhone = normalizePhoneKey(participant.phone || participant.phoneMasked)
        if (participantPhone && meta.phone && participantPhone === meta.phone) {
          return true
        }
        return false
      }

      function updateMatchedCouplesButton() {
        if (!matchedCouplesBtn) return
        const currentWeekMatches = getCurrentWeekConfirmedMatches()
        const count = currentWeekMatches.length
        matchedCouplesBtn.textContent = count ? `매칭된 커플 ${count}` : '매칭된 커플'
        matchedCouplesBtn.dataset.count = String(count)
      }

      function renderMatchedCouplesModal() {
        if (!matchedCouplesList) return
        const weekInfo = getWeekInfo(new Date())
        if (matchedCouplesSubtitle) {
          matchedCouplesSubtitle.textContent = `${weekInfo.label} · ${formatWeekRange(
            weekInfo.start,
            weekInfo.end,
          )}`
        }
        const entries = getCurrentWeekConfirmedMatches()
        matchedCouplesList.innerHTML = entries.length
          ? entries
              .map((entry) => {
                const targetParticipant = entry.displayTarget || entry.target
                const candidateParticipant = entry.displayCandidate || entry.candidate
                const targetName = targetParticipant?.name || '대상자'
                const candidateName = candidateParticipant?.name || '추천 후보'
                const candidateMeta = candidateParticipant
                  ? buildCandidateMetaLine(candidateParticipant)
                  : '프로필 정보 준비 중'
                const matchedLabel = formatDate(entry.confirmedAt)
                const targetPhone = formatPhoneNumber(
                  targetParticipant?.phone ||
                    entry.targetPhone ||
                    targetParticipant?.phoneMasked ||
                    '',
                )
                const candidatePhone = formatPhoneNumber(
                  candidateParticipant?.phone || entry.candidatePhone || '',
                )
                return `
                  <li class="matched-couples-item" data-match-id="${escapeHtml(entry.id || '')}">
                    <div class="matched-couples-names">
                      <strong>${escapeHtml(targetName)}</strong>
                      <span class="matched-couples-connector">×</span>
                      <strong>${escapeHtml(candidateName)}</strong>
                    </div>
                    <p class="matched-couples-meta">${escapeHtml(candidateMeta)}</p>
                    <p class="matched-couples-meta">
                      <span>대상자 ${escapeHtml(targetPhone || '연락처 없음')}</span>
                      <span>·</span>
                      <span>후보 ${escapeHtml(candidatePhone || '연락처 없음')}</span>
                    </p>
                    <div class="matched-couples-footer">
                      <span class="matched-couples-date">${escapeHtml(matchedLabel)}</span>
                      <button type="button" class="matched-couples-remove">삭제</button>
                    </div>
                  </li>
                `
              })
              .join('')
          : '<li class="matched-couples-empty">이번 주차에는 확정된 커플이 없습니다.</li>'
      }

      function handleMatchedCouplesListClick(event) {
        const button = event.target.closest('.matched-couples-remove')
        if (!button) return
        const item = button.closest('.matched-couples-item')
        if (!item) return
        const matchId = item.dataset.matchId
        if (!matchId) return
        if (!window.confirm('해당 매칭을 삭제하고 매칭 전 상태로 되돌릴까요?')) {
          return
        }
        deleteMatchedCouple(matchId)
      }

      async function deleteMatchedCouple(matchId) {
        const removedEntry = confirmedMatches.find((entry) => entry.id === matchId)
        try {
          const response = await fetch(`${MATCH_HISTORY_API_URL}/${encodeURIComponent(matchId)}`, {
            method: 'DELETE',
          })
          if (!response.ok) {
            const message = await response
              .json()
              .then((body) => body?.message)
              .catch(() => '')
            throw new Error(message || `HTTP ${response.status}`)
          }
          confirmedMatches = confirmedMatches.filter((entry) => entry.id !== matchId)
          saveConfirmedMatches()
          updateMatchedCouplesButton()
          renderMatchedCouplesModal()
          rebuildMatchedCandidateIds()
          showToast('이번주 소개를 삭제했습니다.')
        } catch (error) {
          console.error('[match-confirmed] 삭제 실패', error)
          showToast(error?.message || '매칭 삭제에 실패했습니다.')
        }
      }

      function openMatchedCouplesModal() {
        if (!matchedCouplesModal || !isAuthenticated) return
        matchedCouplesModal.hidden = false
      }

      function closeMatchedCouplesModal() {
        if (!matchedCouplesModal) return
        matchedCouplesModal.hidden = true
      }

      function maybeApplyPendingMatchSelection() {
        if (!pendingExternalMatchSelection || !isAuthenticated) return
        if (!Array.isArray(items) || !items.length) return
        applyExternalMatchSelection(pendingExternalMatchSelection)
        pendingExternalMatchSelection = null
      }

      function applyExternalMatchSelection(selection) {
        if (!selection) return
        const targetRecord = findTargetRecordForSelection(selection.target)
        if (!targetRecord) {
          showToast('대상자를 찾지 못했습니다. 관리자 대시보드에서 직접 선택해주세요.')
          return
        }
        setMatchTarget(targetRecord)
        openMatchModal()
        if (selection.candidate?.id) {
          addCandidateToSelectionById(selection.candidate.id)
        }
        recordConfirmedCouple(selection, targetRecord, { persist: false })
      }

      function findTargetRecordForSelection(targetInfo = {}) {
        if (!targetInfo) return null
        if (targetInfo.id) {
          const recordById = items.find((item) => item.id === targetInfo.id)
          if (recordById) return recordById
        }
        const phoneKey = normalizePhoneKey(targetInfo.phone || targetInfo.phoneMasked || '')
        if (phoneKey) {
          const recordByPhone = items.find(
            (item) => normalizePhoneKey(item.phone) === phoneKey,
          )
          if (recordByPhone) return recordByPhone
        }
        return null
      }

      function recordConfirmedCouple(selection, targetRecord, options = {}) {
        if (!selection?.candidate || !selection?.target) return
        const candidateSnapshot = selection.candidate
        const targetSnapshot = targetRecord
          ? buildCandidateSnapshot(targetRecord)
          : selection.target
        const candidateId = candidateSnapshot.id || ''
        const targetId = targetSnapshot.id || ''
        confirmedMatches = confirmedMatches.filter(
          (entry) => entry.candidate?.id !== candidateId || entry.target?.id !== targetId,
        )
        const confirmedAt = Date.now()
        const matchEntry = {
          id: `${targetId || 'target'}-${candidateId || 'candidate'}-${confirmedAt}`,
          target: targetSnapshot,
          candidate: candidateSnapshot,
          confirmedAt,
          week: buildWeekMeta(confirmedAt),
          targetPhone: targetRecord?.phone || selection.targetPhone || '',
          category: MATCH_HISTORY_CATEGORY.CONFIRMED,
        }
        confirmedMatches.unshift(matchEntry)
        saveConfirmedMatches()
        upsertConfirmedHistoryEntry(matchEntry)
        updateMatchedCouplesButton()
        rebuildMatchedCandidateIds()
        if (options.persist !== false) {
          persistMatchToServer(matchEntry, {
            targetPhone: targetRecord?.phone || selection.targetPhone || '',
          })
        }
      }

      async function persistMatchToServer(entry, overrides = {}) {
        const payload = buildMatchHistoryPayload(entry, overrides)
        if (!payload) return
        try {
          const response = await fetch(MATCH_HISTORY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!response.ok) {
            console.warn('[match-confirmed] 서버 저장 실패', await response.text())
          } else {
            refreshMatchedCouplesFromServer()
          }
        } catch (error) {
          console.warn('[match-confirmed] 서버 저장 실패', error)
        }
      }

      function buildMatchHistoryPayload(entry, overrides = {}) {
        if (!entry) return null
        const candidateId = overrides.candidateId || entry.candidate?.id || entry.candidateId || ''
        const targetId = overrides.targetId || entry.target?.id || entry.targetId || ''
        const targetPhoneRaw =
          overrides.targetPhone || entry.targetPhone || entry.target?.phone || ''
        const targetPhone = normalizePhoneKey(targetPhoneRaw)
        const candidatePhone = normalizePhoneKey(
          overrides.candidatePhone || entry.candidatePhone || entry.candidate?.phone,
        )
        if (!candidateId || !targetId || !targetPhone) return null
        const matchedAt = overrides.matchedAt || entry.confirmedAt || entry.matchedAt || Date.now()
        return {
          id: overrides.id || entry.id || `${targetId}-${candidateId}-${matchedAt}`,
          candidateId,
          targetId,
          targetPhone,
          matchedAt,
          week: entry.week || buildWeekMeta(matchedAt),
          category: MATCH_HISTORY_CATEGORY.CONFIRMED,
          candidateName: overrides.candidateName || entry.candidate?.name || entry.candidateName || '',
          candidateGender:
            overrides.candidateGender || entry.candidate?.gender || entry.candidateGender || '',
          candidatePhone,
          targetName: overrides.targetName || entry.target?.name || entry.targetName || '',
          targetGender: overrides.targetGender || entry.target?.gender || entry.targetGender || '',
        }
      }

      async function refreshMatchedCouplesFromServer() {
        try {
          const response = await fetch(MATCH_HISTORY_API_URL)
          const body = await response.json().catch(() => ({}))
          if (!response.ok || body?.ok === false) {
            throw new Error(body?.message || '응답이 올바르지 않습니다.')
          }
          const rawEntries = Array.isArray(body?.data) ? body.data : []
          confirmedMatches = rawEntries
            .map((entry) => mapServerMatchEntry(entry))
            .filter((entry) => entry && isConfirmedMatchEntry(entry))
          saveConfirmedMatches()
          updateMatchedCouplesButton()
          rebuildMatchedCandidateIds()
        } catch (error) {
          console.warn('[match-confirmed] 서버 매칭 기록 불러오기 실패', error)
        }
      }

      function mapServerMatchEntry(entry) {
        if (!entry) return null
        const confirmedAt = entry.matchedAt || entry.confirmedAt || Date.now()
        const targetRecord = items.find((item) => item.id === entry.targetId)
        const candidateRecord = items.find((item) => item.id === entry.candidateId)
        const category = normalizeMatchHistoryCategory(entry.category || entry.type)
        const formattedTargetPhone = formatPhoneNumber(entry.targetPhone || '')
        const formattedCandidatePhone = formatPhoneNumber(entry.candidatePhone || '')
        const targetSnapshot = targetRecord
          ? buildCandidateSnapshot(targetRecord)
          : {
              id: entry.targetId || '',
              name: entry.targetName || '',
              gender: entry.targetGender || '',
              phone: formattedTargetPhone,
              phoneMasked: formattedTargetPhone || entry.targetPhoneMasked || '',
            }
        if (!targetSnapshot.phone && formattedTargetPhone) {
          targetSnapshot.phone = formattedTargetPhone
        }
        const candidateSnapshot = candidateRecord
          ? buildCandidateSnapshot(candidateRecord)
          : {
              id: entry.candidateId || '',
              name: entry.candidateName || '',
              gender: entry.candidateGender || '',
              phone: formattedCandidatePhone,
            }
        if (!candidateSnapshot.phone && formattedCandidatePhone) {
          candidateSnapshot.phone = formattedCandidatePhone
        }
        return {
          id: entry.id || `${targetSnapshot.id}-${candidateSnapshot.id}-${confirmedAt}`,
          target: targetSnapshot,
          candidate: candidateSnapshot,
          confirmedAt,
          week: entry.week || buildWeekMeta(confirmedAt),
          targetPhone: entry.targetPhone || '',
          candidatePhone: entry.candidatePhone || '',
          category,
        }
      }

      function loadMatchHistory() {
        try {
          const raw = localStorage.getItem(MATCH_HISTORY_STORAGE_KEY)
          if (!raw) return []
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return []
        return parsed
          .map((entry) => {
            const matchedAt = entry.matchedAt || Date.now()
            const weekData = entry.week && entry.week.startTime
              ? entry.week
              : (() => {
                  const info = getWeekInfo(new Date(matchedAt))
                  return {
                    label: info.label,
                    startTime: info.start.getTime(),
                    endTime: info.end.getTime(),
                    year: info.year,
                    week: info.week,
                  }
                })()
            return {
              ...entry,
              matchedAt,
              week: weekData,
              category: normalizeMatchHistoryCategory(entry.category),
            }
          })
            .sort((a, b) => (b.matchedAt || 0) - (a.matchedAt || 0))
        } catch (error) {
          console.warn('[match] 기록 불러오기 실패', error)
          return []
        }
      }

      function saveMatchHistory() {
        try {
          localStorage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(matchHistory))
        } catch (error) {
          console.warn('[match] 기록 저장 실패', error)
        }
      }

      function rebuildMatchedCandidateIds() {
        matchedCandidateIds.clear()
        matchHistory.forEach((entry) => {
          if (!entry || !entry.candidateId) return
          if (!isConfirmedMatchEntry(entry)) return
          matchedCandidateIds.add(entry.candidateId)
        })
        confirmedMatches.forEach((entry) => {
          const candidateId = entry?.candidate?.id || entry?.candidateId
          if (!candidateId) return
          if (isConfirmedMatchEntry(entry)) {
            matchedCandidateIds.add(candidateId)
          }
        })
      }

      async function refreshMatchHistoryFromServer() {
        if (!MATCH_HISTORY_API_URL || typeof fetch !== 'function') {
          attemptMatchHistoryResync()
          return
        }
        try {
          const serverEntries = await fetchMatchHistoryFromServerRaw()
          if (!serverEntries.length) {
            attemptMatchHistoryResync()
            return
          }
          const merged = mergeMatchHistoryEntries(serverEntries, matchHistory)
          matchHistory = merged
          rebuildMatchedCandidateIds()
          saveMatchHistory()
          updateMatchHistoryUI()
        } catch (error) {
          console.warn('[match] 서버 매칭 기록 불러오기 실패', error)
        } finally {
          attemptMatchHistoryResync()
        }
      }

      async function fetchMatchHistoryFromServerRaw() {
        const response = await fetch(MATCH_HISTORY_API_URL)
        const body = await response.json().catch(() => ({}))
        if (!response.ok || body?.ok === false) {
          throw new Error(body?.message || `HTTP ${response.status}`)
        }
        return Array.isArray(body?.data) ? body.data : []
      }

      function mergeMatchHistoryEntries(serverEntries, localEntries) {
        const localMap = new Map()
        localEntries.forEach((entry) => {
          if (!entry?.id) return
          localMap.set(entry.id, entry)
        })
        serverEntries
          .map((entry) => hydrateMatchHistoryEntry(entry))
          .filter(Boolean)
          .forEach((entry) => {
            const existing = localMap.get(entry.id) || {}
            localMap.set(entry.id, {
              ...existing,
              ...entry,
              candidate: entry.candidate || existing.candidate || null,
              target: entry.target || existing.target || null,
            })
          })
        return Array.from(localMap.values()).sort(
          (a, b) => (b.matchedAt || 0) - (a.matchedAt || 0),
        )
      }

      function hydrateMatchHistoryEntry(entry) {
        if (!entry?.candidateId) return null
        const candidateRecord = items.find((item) => item.id === entry.candidateId)
        const targetRecord = items.find((item) => item.id === entry.targetId)
        const category = normalizeMatchHistoryCategory(entry.category)
        return {
          ...entry,
          candidate: candidateRecord ? buildCandidateSnapshot(candidateRecord) : entry.candidate || null,
          target: targetRecord ? buildCandidateSnapshot(targetRecord) : entry.target || null,
          category,
        }
      }

      function attemptMatchHistoryResync() {
        if (!matchHistory.length || !MATCH_HISTORY_API_URL || typeof fetch !== 'function') {
          return
        }
        const now = Date.now()
        let lastSync = 0
        try {
          lastSync = Number(localStorage.getItem(MATCH_HISTORY_RESYNC_KEY) || 0)
        } catch (error) {
          console.warn('[match] 매칭 기록 동기화 시각 확인 실패', error)
        }
        if (Number.isFinite(lastSync) && now - lastSync < MATCH_HISTORY_RESYNC_INTERVAL_MS) {
          return
        }
        const targetMap = new Map(items.map((record) => [record.id, record]))
        matchHistory.forEach((entry) => {
          const targetId = entry?.target?.id
          const targetRecord =
            (targetId && targetMap.get(targetId)) ||
            (entry?.target?.phone
              ? items.find(
                  (record) => normalizePhoneKey(record?.phone) === normalizePhoneKey(entry.target.phone),
                )
              : null)
          syncMatchHistoryEntryWithServer(entry, targetRecord, { silent: true })
        })
        try {
          localStorage.setItem(MATCH_HISTORY_RESYNC_KEY, String(now))
        } catch (error) {
          console.warn('[match] 매칭 기록 동기화 시각 저장 실패', error)
        }
      }

      function syncMatchHistoryEntryWithServer(entry, targetRecord, options = {}) {
        if (!entry || !MATCH_HISTORY_API_URL || typeof fetch !== 'function') return
        const payload = buildMatchHistorySyncPayload(entry, targetRecord)
        if (!payload) return
        fetch(MATCH_HISTORY_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(async (response) => {
            if (response.ok) return
            let message = ''
            try {
              const body = await response.json()
              message = body?.message || ''
            } catch (_) {}
            reportMatchHistorySyncError(
              message || `서버 응답 ${response.status}`,
              options,
            )
          })
          .catch((error) => {
            reportMatchHistorySyncError(error?.message, options)
          })
      }

      function reportMatchHistorySyncError(message, options = {}) {
        const text = message || '이번주 소개를 서버에 저장하지 못했습니다.'
        if (!options?.silent) {
          showToast(text)
        }
        console.warn('[match] 서버 매칭 기록 동기화 실패:', text)
      }

      function buildMatchHistorySyncPayload(entry, targetRecord) {
        if (!entry?.candidateId) return null
        const targetId = entry.target?.id || targetRecord?.id || matchSelectionTargetId
        const phoneSource = entry.target?.phone || targetRecord?.phone || ''
        const targetPhone = normalizePhoneKey(phoneSource)
        const candidatePhone = normalizePhoneKey(entry.candidate?.phone || entry.candidatePhone)
        if (!targetId || !targetPhone) return null
        return {
          id: entry.id,
          candidateId: entry.candidateId,
          targetId,
          targetPhone,
          matchedAt: entry.matchedAt,
          week: entry.week,
          category: MATCH_HISTORY_CATEGORY.INTRO,
          candidateName: entry.candidate?.name || entry.candidateName || '',
          candidateGender: entry.candidate?.gender || entry.candidateGender || '',
          candidatePhone,
          targetName: entry.target?.name || targetRecord?.name || '',
          targetGender: entry.target?.gender || targetRecord?.gender || '',
          targetSelected: Boolean(entry.targetSelected),
        }
      }

      function deleteMatchHistoryEntryOnServer(entryId) {
        if (!entryId || !MATCH_HISTORY_API_URL || typeof fetch !== 'function') return
        fetch(`${MATCH_HISTORY_API_URL}/${encodeURIComponent(entryId)}`, {
          method: 'DELETE',
        }).catch((error) => {
          console.warn('[match] 서버 매칭 기록 삭제 실패', error)
        })
      }

      function handleMatchHistoryClick(event) {
        const button = event.target.closest('.match-history-remove')
        if (!button) return
        const container = button.closest('.match-history-item')
        if (!container) return
        const entryId = container.dataset.id
        if (!entryId) return
        removeMatchHistoryEntry(entryId)
      }

      function removeMatchHistoryEntry(entryId) {
        const index = matchHistory.findIndex((entry) => entry.id === entryId)
        if (index === -1) return
        const [removed] = matchHistory.splice(index, 1)
        if (removed?.candidateId) {
          matchedCandidateIds.delete(removed.candidateId)
        }
        saveMatchHistory()
        deleteMatchHistoryEntryOnServer(removed?.id)
        updateMatchHistoryUI()
        runMatchRecommendation()
        showToast('이번주 소개에서 제거했습니다.')
      }

      function clearMatchTarget() {
        matchSelectedMemberId = null
        matchSelectionTargetId = null
        matchSelectionTargetPhoneKey = ''
        matchSelectedCandidates = []
        if (matchTargetInput) {
          matchTargetInput.value = ''
        }
        renderMatchTargetInfo(null)
        renderMatchResults([])
        if (matchStatusEl) {
          matchStatusEl.textContent = '대상자를 선택하면 추천 리스트가 표시됩니다.'
        }
        updateMatchResetVisibility(false)
        updateMatchSelectionSummary()
        updateMatchHistoryUI()
        updateMatchHistoryTitle(null)
      }

      function updateMatchResetVisibility(isActive) {
        if (!matchResetBtn) return
        matchResetBtn.hidden = !isActive
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
        const profileButton = event.target.closest('[data-profile-card-id]')
        if (profileButton) {
          event.preventDefault()
          const targetId = profileButton.dataset.profileCardId
          if (targetId) {
            openProfileCardById(targetId)
          }
          return
        }
        const card = event.target.closest('.card')
        if (!card) return
        const checkbox = event.target.closest('.select-checkbox')
        if (checkbox) return
        const { id } = card.dataset
        if (id) openDetailModal(id)
      }

      function openProfileCardById(id) {
        if (!id) return
        const record = items.find((item) => item.id === id)
        if (!record) {
          showToast('대상 정보를 찾지 못했습니다.')
          return
        }
        openProfileCardModal(record)
      }

      function openProfileCardModal(record) {
        if (!profileCardModal || !profileCardPreviewEl) return
        if (profileCardHideTimer) {
          clearTimeout(profileCardHideTimer)
          profileCardHideTimer = null
        }
        profileCardRecord = record
        applyProfileCardTheme(record)
        profileCardPreviewEl.innerHTML = renderProfileCard(record)
        initProfileCardSlider(profileCardPreviewEl)
        profileCardModal.hidden = false
        requestAnimationFrame(() => profileCardModal.classList.add('visible'))
      }

      function closeProfileCardModal() {
        if (!profileCardModal || profileCardModal.hidden) return
        profileCardModal.classList.remove('visible')
        profileCardHideTimer = window.setTimeout(() => {
          profileCardModal.hidden = true
          profileCardHideTimer = null
          profileCardRecord = null
          if (profileCardPreviewEl) {
            profileCardPreviewEl.className = 'profile-card-preview'
            profileCardPreviewEl.innerHTML = ''
          }
        }, 180)
      }

      function applyProfileCardTheme(record) {
        if (!profileCardPreviewEl) return
        const theme = getProfileCardTheme(record)
        profileCardPreviewEl.className = 'profile-card-preview'
        if (theme) {
          profileCardPreviewEl.classList.add(theme)
        }
      }

      function getProfileCardTheme(record) {
        const gender = String(record?.gender || '').trim().toLowerCase()
        if (!gender) return ''
        if (gender.startsWith('여')) return 'profile-card-preview-female'
        if (gender.startsWith('남')) return 'profile-card-preview-male'
        return ''
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
          syncMatchMemberOptions()
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
        const itemMap = new Map(items.map((item) => [item.id, item]))
        const recordsToDelete = unique.map((id) => itemMap.get(id)).filter(Boolean)
        const phoneUsageBeforeDelete = buildPhoneUsageMap(items)
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
          syncMatchMemberOptions()
          updateStats()
          render()
          if (!calendarModal.hidden) {
            refreshCalendar(true)
          }
          showToast(`${body.count ?? unique.length}건을 삭제했습니다.`)
          if (recordsToDelete.length) {
            cleanupFirebaseForDeletedRecords(recordsToDelete, phoneUsageBeforeDelete).catch(
              (error) => {
                console.warn('[firebase] 삭제된 회원 파일 정리 실패', error)
              },
            )
          }
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

      function handleSseConfirmedMatch(entry) {
        if (!entry) return
        try {
          const merged = mergeMatchHistoryEntries([entry], matchHistory)
          matchHistory = merged
          saveMatchHistory()
        } catch (error) {
          console.warn('[sse] match history merge 실패', error)
        }
        rebuildMatchedCandidateIds()
        const mapped = mapServerMatchEntry(entry)
        if (mapped) {
          const existingIndex = confirmedMatches.findIndex((item) => item.id === mapped.id)
          if (existingIndex !== -1) {
            confirmedMatches.splice(existingIndex, 1)
          }
          confirmedMatches.unshift(mapped)
          saveConfirmedMatches()
          upsertConfirmedHistoryEntry(mapped)
        }
        updateMatchedCouplesButton()
        if (matchedCouplesModal && !matchedCouplesModal.hidden) {
          renderMatchedCouplesModal()
        }
        updateMatchHistoryUI()
        if (entry?.candidateName && entry?.targetName) {
          showToast(`${entry.targetName} × ${entry.candidateName} 커플이 확정되었습니다.`)
        } else {
          showToast('새로운 커플이 확정되었습니다.')
        }
      }

      function upsertConfirmedHistoryEntry(matchEntry) {
        const historyEntry = mapConfirmedMatchToHistoryEntry(matchEntry)
        if (!historyEntry || !historyEntry.id) return
        const existingIndex = matchHistory.findIndex((entry) => entry.id === historyEntry.id)
        if (existingIndex !== -1) {
          matchHistory[existingIndex] = {
            ...matchHistory[existingIndex],
            ...historyEntry,
          }
        } else {
          matchHistory.unshift(historyEntry)
        }
        saveMatchHistory()
      }

      function handleSseMatchDeletion(entry) {
        const matchId = entry?.id || entry
        if (!matchId) return
        const beforeConfirmed = confirmedMatches.length
        confirmedMatches = confirmedMatches.filter((item) => item.id !== matchId)
        if (beforeConfirmed !== confirmedMatches.length) {
          saveConfirmedMatches()
        }
        const beforeHistory = matchHistory.length
        matchHistory = matchHistory.filter((item) => item.id !== matchId)
        if (beforeHistory !== matchHistory.length) {
          saveMatchHistory()
        }
        rebuildMatchedCandidateIds()
        updateMatchedCouplesButton()
        if (matchedCouplesModal && !matchedCouplesModal.hidden) {
          renderMatchedCouplesModal()
        }
        updateMatchHistoryUI()
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
              syncMatchMemberOptions()
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
              syncMatchMemberOptions()
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
              syncMatchMemberOptions()
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
              syncMatchMemberOptions()
              updateStats()
              render()
              if (!calendarModal.hidden) refreshCalendar(true)
              if (suppressDeleteToast) {
                suppressDeleteToast = false
              } else if (before !== items.length) {
                showToast(`${ids.length}건이 삭제되었습니다.`)
              }
            } else if (payload?.type === 'match:confirmed') {
              handleSseConfirmedMatch(payload.payload)
            } else if (payload?.type === 'match:deleted') {
              handleSseMatchDeletion(payload.payload)
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
          선호키: item.preferredHeightLabel || (item.preferredHeights || []).join(', '),
          선호나이: item.preferredAgeLabel || (item.preferredAges || []).join(', '),
          거주구: item.district || '',
          유입경로: formatReferralSource(item.referralSource) || '',
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

