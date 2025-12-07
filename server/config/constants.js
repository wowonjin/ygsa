const path = require('path')
const fsSync = require('fs')

const DATA_ROOT = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '../../data')
const DATA_FILE_NAME = process.env.DATA_FILE || 'consultations.json'
const DATA_DIR = DATA_ROOT
const DATA_FILE = path.join(DATA_DIR, DATA_FILE_NAME)
const MATCH_HISTORY_FILE = path.join(DATA_DIR, 'match-history.json')
const MATCH_HISTORY_LIMIT = 5000
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist')
const FRONTEND_INDEX = path.join(FRONTEND_DIST, 'index.html')
const HAS_FRONTEND_BUILD = fsSync.existsSync(FRONTEND_INDEX)

const FIREBASE_REQUIRED_KEYS = ['apiKey', 'projectId', 'storageBucket']

const EMAIL_RECIPIENTS = [
  { name: '공정아', email: 'chestnut01nse@gmail.com' },
  { name: '장진우', email: 'jjw78013@gmail.com' },
  { name: '연결사', email: 'yeongyeolsa@gmail.com' },
  { name: '연결사 예약팀', email: 'gyeolsay@gmail.com' },
]

const SMS_RECIPIENTS = [
  { name: '공정아', phone: '010-5382-9514' },
  { name: '장진우', phone: '010-8611-6390' },
]

const PHONE_STATUS_OPTIONS = ['pending', 'scheduled', 'done']
const DEPOSIT_STATUS_VALUES = ['pending', 'completed']
const PATCH_VALIDATION_FIELDS = [
  'name',
  'gender',
  'phone',
  'birth',
  'height',
  'job',
  'district',
  'education',
]

const PROFILE_SHARE_PAGE = 'profile-card.html'
const PROFILE_SHARE_VIEW_DURATION_MS = 3 * 24 * 60 * 60 * 1000
const MATCH_SCORE_MAX = 3
const MATCH_AI_MAX_CANDIDATES = 5
const MATCH_AI_REASON_MAX_LENGTH = 200
const MATCH_AI_SUMMARY_MAX_LENGTH = 480

const PROFILE_UPLOAD_INPUT_MAP = {
  idCard: {
    inputId: 'profileIdCard',
    group: 'documents',
    category: 'idCard',
    storageFolder: 'id-card',
    label: '신분증',
  },
  employmentProof: {
    inputId: 'profileEmploymentProof',
    group: 'documents',
    category: 'employmentProof',
    storageFolder: 'employment-proof',
    label: '재직 증빙',
  },
}

const PROFILE_PHOTO_INPUT_MAP = {
  face: {
    inputId: 'profilePhotosFace',
    group: 'photos',
    category: 'face',
    storageFolder: 'photos/face',
    label: '프로필 얼굴 사진',
  },
  full: {
    inputId: 'profilePhotosFull',
    group: 'photos',
    category: 'full',
    storageFolder: 'photos/full',
    label: '프로필 전신 사진',
  },
}

const MATCH_AI_DEFAULT_MODEL = 'gpt-4o-mini'
const MATCH_AI_TIMEOUT_MS = 20 * 1000

module.exports = {
  DATA_ROOT,
  DATA_FILE_NAME,
  DATA_DIR,
  DATA_FILE,
  MATCH_HISTORY_FILE,
  MATCH_HISTORY_LIMIT,
  FRONTEND_DIST,
  FRONTEND_INDEX,
  HAS_FRONTEND_BUILD,
  FIREBASE_REQUIRED_KEYS,
  EMAIL_RECIPIENTS,
  SMS_RECIPIENTS,
  PHONE_STATUS_OPTIONS,
  DEPOSIT_STATUS_VALUES,
  PATCH_VALIDATION_FIELDS,
  PROFILE_SHARE_PAGE,
  PROFILE_SHARE_VIEW_DURATION_MS,
  MATCH_SCORE_MAX,
  MATCH_AI_MAX_CANDIDATES,
  MATCH_AI_REASON_MAX_LENGTH,
  MATCH_AI_SUMMARY_MAX_LENGTH,
  PROFILE_UPLOAD_INPUT_MAP,
  PROFILE_PHOTO_INPUT_MAP,
  MATCH_AI_DEFAULT_MODEL,
  MATCH_AI_TIMEOUT_MS,
}

