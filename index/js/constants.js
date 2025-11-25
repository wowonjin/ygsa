window.YGSA = window.YGSA || {}
const YGSA = window.YGSA

const HOSTNAME = window.location && window.location.hostname
const IS_LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/i.test(HOSTNAME || '')
const DEFAULT_BACKEND_ORIGIN = IS_LOCAL_HOST ? 'http://localhost:5000' : 'https://ygsa-backend.onrender.com'
const BACKEND_ORIGIN_RAW = (window.BACKEND_ORIGIN || '').trim()
const BACKEND_ORIGIN = (BACKEND_ORIGIN_RAW || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, '')

if (!BACKEND_ORIGIN_RAW) {
  console.info(`[ygsa] BACKEND_ORIGIN 미설정 – 기본값 ${BACKEND_ORIGIN} 사용`)
}

YGSA.api = {
  baseUrl: BACKEND_ORIGIN,
  consult: `${BACKEND_ORIGIN}/api/consult`,
  import: `${BACKEND_ORIGIN}/api/consult/import`,
  events: `${BACKEND_ORIGIN}/events`,
}

YGSA.constants = {
  ADMIN_ID: 'admin',
  ADMIN_PASSWORD: 'admin',
  AUTH_STORAGE_KEY: 'ygsa_admin_auth',
  AUTH_DURATION_MS: 60 * 60 * 1000,
  DRAFT_STORAGE_KEY: 'alphaProfileDraft_v1',
  PHONE_STATUS_VALUES: ['pending', 'scheduled', 'done'],
  PHONE_STATUS_LABELS: {
    pending: '상담 전',
    scheduled: '상담 예정',
    done: '상담 완료',
  },
  STATUS_CLASS_NAMES: {
    pending: 'status-before',
    scheduled: 'status-scheduled',
    done: 'status-complete',
  },
  TIME_SLOT_START_HOUR: 9,
  TIME_SLOT_END_HOUR: 21,
  TIME_SLOT_INTERVAL_MINUTES: 15,
  SALARY_RANGE_LABELS: {
    '1': '3000만원 미만',
    '2': '3000-4000만원',
    '3': '4000-6000만원',
    '4': '6000-8000만원',
    '5': '8000-1억원',
    '6': '1억-2억원',
    '7': '2억-3억원',
    '8': '3억원 이상',
  },
}

YGSA.state = {
  items: [],
  selectedIds: new Set(),
  suppressDeleteToast: false,
  suppressUpdateToast: false,
  detailRecordId: null,
  detailValuesSelection: [],
  currentDraftData: null,
  calendarState: {
    current: new Date(),
    selectedDate: '',
  },
  viewState: {
    search: '',
    gender: 'all',
    height: 'all',
    sort: 'latest',
  },
  appInitialized: false,
}

const getById = (id) => document.getElementById(id)

YGSA.dom = {
  authOverlay: getById('authOverlay'),
  authForm: getById('authForm'),
  authIdInput: getById('authId'),
  authPasswordInput: getById('authPassword'),
  authErrorEl: getById('authError'),
  appContentEl: getById('appContent'),
  cardsEl: getById('cardsContainer'),
  emptyEl: getById('emptyState'),
  exportBtn: getById('exportBtn'),
  importBtn: getById('importBtn'),
  excelInput: getById('excelInput'),
  deleteSelectedBtn: getById('deleteSelectedBtn'),
  selectionInfoEl: getById('selectionInfo'),
  bulkActionBar: getById('bulkActionBar'),
  toastEl: getById('toast'),
  statTotalEl: getById('statTotal'),
  statMonthlyEl: getById('statMonthly'),
  statWeeklyEl: getById('statWeekly'),
  statDailyEl: getById('statDaily'),
  searchInput: getById('searchInput'),
  genderFilter: getById('genderFilter'),
  heightFilter: getById('heightFilter'),
  sortSelect: getById('sortSelect'),
  detailModal: getById('detailModal'),
  detailForm: getById('detailForm'),
  detailCancelBtn: getById('detailCancelBtn'),
  detailTitleEl: getById('detailTitle'),
  detailSubtitleEl: getById('detailSubtitle'),
  detailNameInput: getById('detailName'),
  detailPhoneInput: getById('detailPhone'),
  detailGenderSelect: getById('detailGender'),
  detailBirthInput: getById('detailBirth'),
  detailHeightInput: getById('detailHeight'),
  detailEducationSelect: getById('detailEducation'),
  detailJobInput: getById('detailJob'),
  detailDistrictInput: getById('detailDistrict'),
  detailMbtiInput: getById('detailMbti'),
  detailUniversityInput: getById('detailUniversity'),
  detailSalaryRangeSelect: getById('detailSalaryRange'),
  detailJobDetailInput: getById('detailJobDetail'),
  detailProfileAppealInput: getById('detailProfileAppeal'),
  detailSmokingSelect: getById('detailSmoking'),
  detailReligionSelect: getById('detailReligion'),
  detailLongDistanceSelect: getById('detailLongDistance'),
  detailDinkSelect: getById('detailDink'),
  detailLastRelationshipInput: getById('detailLastRelationship'),
  detailMarriageTimingSelect: getById('detailMarriageTiming'),
  detailRelationshipCountSelect: getById('detailRelationshipCount'),
  detailCarOwnershipSelect: getById('detailCarOwnership'),
  detailTattooSelect: getById('detailTattoo'),
  detailDivorceStatusSelect: getById('detailDivorceStatus'),
  detailPreferredHeightsSelect: getById('detailPreferredHeights'),
  detailPreferredAgesSelect: getById('detailPreferredAges'),
  detailSufficientConditionInput: getById('detailSufficientCondition'),
  detailNecessaryConditionInput: getById('detailNecessaryCondition'),
  detailLikesDislikesInput: getById('detailLikesDislikes'),
  detailValuesSelect: getById('detailValues'),
  detailValuesCustomInput: getById('detailValuesCustom'),
  detailAboutMeInput: getById('detailAboutMe'),
  detailPhoneStatusEl: getById('detailPhoneStatus'),
  detailDateInput: getById('detailDate'),
  detailTimeSelect: getById('detailTime'),
  detailClearScheduleBtn: getById('detailClearSchedule'),
  detailNotesInput: getById('detailNotes'),
  detailScheduleInfo: getById('detailScheduleInfo'),
  detailAttachmentsSection: getById('detailAttachmentsSection'),
  detailIdCardItem: getById('detailIdCardItem'),
  detailIdCardLink: getById('detailIdCardLink'),
  detailEmploymentItem: getById('detailEmploymentItem'),
  detailEmploymentLink: getById('detailEmploymentLink'),
  detailPhotosItem: getById('detailPhotosItem'),
  detailPhotosGrid: getById('detailPhotosGrid'),
  detailDraftLoadBtn: getById('detailDraftLoadBtn'),
  detailProfileLinkBtn: getById('detailProfileLinkBtn'),
  detailProfileLinkResult: getById('detailProfileLinkResult'),
  detailProfileLinkStatus: getById('detailProfileLinkStatus'),
  detailProfileLinkAnchor: getById('detailProfileLinkAnchor'),
  detailProfileLinkCopyBtn: getById('detailProfileLinkCopyBtn'),
  calendarScrollBtn: getById('calendarScrollBtn'),
  calendarModal: getById('calendarModal'),
  calendarCloseBtn: getById('calendarCloseBtn'),
  calendarPrevBtn: getById('calendarPrevBtn'),
  calendarNextBtn: getById('calendarNextBtn'),
  calendarTodayBtn: getById('calendarTodayBtn'),
  calendarCurrentMonthEl: getById('calendarCurrentMonth'),
  calendarSelectedTitleEl: getById('calendarSelectedTitle'),
  calendarAppointmentList: getById('calendarAppointmentList'),
  calendarGrid: getById('calendarGrid'),
  multiSelectCheckboxGroups: document.querySelectorAll('[data-multi-select]'),
}



