const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs/promises')
const fsSync = require('fs')
const { nanoid } = require('nanoid')
const nodemailer = require('nodemailer')
const twilio = require('twilio')
require('dotenv').config()

const app = express()
const PORT = Number(process.env.PORT) || 5000
const DATA_ROOT = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data')
const DATA_FILE_NAME = process.env.DATA_FILE || 'consultations.json'
const DATA_DIR = DATA_ROOT
const DATA_FILE = path.join(DATA_DIR, DATA_FILE_NAME)
const MATCH_HISTORY_FILE = path.join(DATA_DIR, 'match-history.json')
const MATCH_HISTORY_LIMIT = 5000
const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist')
const FRONTEND_INDEX = path.join(FRONTEND_DIST, 'index.html')
const HAS_FRONTEND_BUILD = fsSync.existsSync(FRONTEND_INDEX)

console.info(`[ygsa] 상담 데이터 저장 위치: ${DATA_FILE}`)

const sseClients = new Set()
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

const emailTransport = initialiseMailTransport()
const smsClient = initialiseSmsClient()

app.use(cors())
app.use(express.json({ limit: '1mb' }))
if (HAS_FRONTEND_BUILD) {
  app.use(express.static(FRONTEND_DIST))
}
app.use(express.static(__dirname))

app.get('/profile-card.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'profile-card.html'))
})

app.get('/api/firebase-config', (req, res) => {
  const { config, missing } = getFirebaseConfigFromEnv()
  if (missing.length) {
    console.warn('[firebase-config] Missing required keys:', missing.join(', '))
    return res.status(503).json({
      ok: false,
      message: `Firebase 설정이 구성되지 않았습니다. 누락된 항목: ${missing.join(', ')}`,
    })
  }
  console.info('[firebase-config] Served config keys:', Object.keys(config))
  res.json({ ok: true, config })
})

app.get('/api/consult', async (req, res) => {
  try {
    const list = await readConsultations()
    res.json({ ok: true, data: list })
  } catch (error) {
    console.error('[consult:list]', error)
    res.status(500).json({ ok: false, message: '데이터를 불러오지 못했습니다.' })
  }
})

app.post('/api/consult', async (req, res) => {
  const payload = sanitizePayload(req.body)
  const errors = validatePayload(payload)
  if (errors.length) {
    return res.status(400).json({ ok: false, errors })
  }

  const timestamp = new Date().toISOString()
  const record = {
    id: nanoid(),
    ...payload,
    depositStatus: payload.depositStatus || 'pending',
    phoneConsultStatus: normalizePhoneStatus(payload.phoneConsultStatus, 'pending'),
    meetingSchedule: '',
    notes: sanitizeNotes(payload.notes),
    status: 'new',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  try {
    const list = await readConsultations()
    list.push(record)
    await writeConsultations(list)
    broadcast({ type: 'consult:new', payload: record })
    triggerNotifications(record).catch((error) =>
      console.error('[notify] 전송 실패', error),
    )
    res.status(201).json({ ok: true, data: record })
  } catch (error) {
    console.error('[consult:create]', error)
    res.status(500).json({ ok: false, message: '신청 저장에 실패했습니다.' })
  }
})

app.post('/api/consult/profile', async (req, res) => {
  const { phone, updates, agreements } = sanitizeProfileUpdate(req.body)
  if (!phone) {
    return res.status(400).json({ ok: false, message: '연락처를 확인할 수 없습니다.' })
  }

  try {
    const list = await readConsultations()
    const index = list.findIndex((item) => normalizePhoneNumber(item.phone) === phone)
    if (index === -1) {
      return res.status(404).json({ ok: false, message: '예약한 번호가 없습니다.' })
    }

    const updatedAt = new Date().toISOString()
    const existing = list[index] || {}
    const updatedRecord = normalizeStoredRecord({
      ...existing,
      ...updates,
      agreements: {
        ...(existing.agreements || {}),
        ...agreements,
      },
      updatedAt,
    })

    list[index] = updatedRecord
    await writeConsultations(list)
    broadcast({ type: 'consult:update', payload: updatedRecord })
    res.json({ ok: true, data: updatedRecord })
  } catch (error) {
    console.error('[consult:profile]', error)
    res.status(500).json({ ok: false, message: '프로필 정보를 저장하지 못했습니다.' })
  }
})

app.post('/api/consult/:id/profile-link', async (req, res) => {
  const { id } = req.params
  if (!id) {
    return res.status(400).json({ ok: false, message: '대상 정보를 확인할 수 없습니다.' })
  }

  try {
    const list = await readConsultations()
    const index = list.findIndex((item) => item.id === id)
    if (index === -1) {
      return res.status(404).json({ ok: false, message: '대상을 찾을 수 없습니다.' })
    }

    const record = list[index]
    const share = ensureProfileShare(record)
    const nextRecord = {
      ...record,
      profileShare: share,
    }
    list[index] = nextRecord
    await writeConsultations(list)

    const shareUrl = buildProfileShareUrl(req, share.token)
    res.json({
      ok: true,
      data: {
        token: share.token,
        shareUrl,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt,
      },
    })
  } catch (error) {
    console.error('[profile-share:link]', error)
    res.status(500).json({ ok: false, message: '프로필 카드 링크를 생성하지 못했습니다.' })
  }
})

app.post('/api/profile-share/verify', async (req, res) => {
  const token = sanitizeText(req.body?.token)
  const phoneInput = sanitizeText(req.body?.phone)
  const phoneKey = normalizePhoneNumber(phoneInput)

  if (!token || !phoneKey) {
    return res.status(400).json({ ok: false, message: '토큰과 연락처를 모두 입력해주세요.' })
  }

  try {
    const list = await readConsultations()
    const index = list.findIndex(
      (item) => item?.profileShare && item.profileShare.token === token,
    )
    if (index === -1) {
      return res.status(404).json({ ok: false, message: '유효하지 않은 링크입니다.' })
    }

    if (!phoneExistsInConsultations(list, phoneKey)) {
      return res.status(403).json({
        ok: false,
        code: 'share_invalid_phone',
        message: '등록되지 않은 번호입니다.',
      })
    }

    const record = list[index]
    const share = ensureProfileShare(record)
    share.grants = share.grants || {}
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const existingGrant = share.grants[phoneKey]

    if (existingGrant) {
      const expires = new Date(existingGrant.expiresAt).getTime()
      if (Number.isNaN(expires) || expires < now) {
        return res.status(410).json({
          ok: false,
          code: 'share_expired',
          message: '접속이 불가능합니다. 기간이 만료되었습니다.',
        })
      }
      share.grants[phoneKey] = {
        ...existingGrant,
        phone: existingGrant.phone || phoneInput,
        lastVerifiedAt: nowIso,
      }
    } else {
      const expiresAt = new Date(now + PROFILE_SHARE_VIEW_DURATION_MS).toISOString()
      share.grants[phoneKey] = {
        phone: phoneInput,
        phoneKey,
        grantedAt: nowIso,
        lastVerifiedAt: nowIso,
        expiresAt,
      }
    }

    share.updatedAt = nowIso
    const nextRecord = {
      ...record,
      profileShare: share,
    }
    list[index] = nextRecord
    await writeConsultations(list)

    const activeGrant = share.grants[phoneKey]
    res.json({
      ok: true,
      data: {
        profile: buildSharedProfilePayload(nextRecord),
        grant: {
          phone: activeGrant.phone,
          grantedAt: activeGrant.grantedAt,
          expiresAt: activeGrant.expiresAt,
          lastVerifiedAt: activeGrant.lastVerifiedAt,
        },
      },
    })
  } catch (error) {
    console.error('[profile-share:verify]', error)
    res
      .status(500)
      .json({ ok: false, message: '프로필 카드를 확인하지 못했습니다.' })
  }
})

app.get('/api/match-history', async (_req, res) => {
  try {
    const history = await readMatchHistory()
    res.json({ ok: true, data: history })
  } catch (error) {
    console.error('[match-history:list]', error)
    res.status(500).json({ ok: false, message: '매칭 기록을 불러오지 못했습니다.' })
  }
})

app.post('/api/match-history', async (req, res) => {
  const entry = sanitizeMatchHistoryPayload(req.body)
  if (!entry) {
    return res.status(400).json({ ok: false, message: '유효한 매칭 데이터가 필요합니다.' })
  }

  try {
    const history = await readMatchHistory()
    const index = history.findIndex((item) => item.id === entry.id)
    if (index !== -1) {
      history[index] = entry
    } else {
      history.unshift(entry)
    }
    await writeMatchHistory(history)
    res.json({ ok: true, data: entry })
  } catch (error) {
    console.error('[match-history:create]', error)
    res.status(500).json({ ok: false, message: '매칭 기록을 저장하지 못했습니다.' })
  }
})

app.delete('/api/match-history/:id', async (req, res) => {
  const id = sanitizeText(req.params?.id)
  if (!id) {
    return res.status(400).json({ ok: false, message: '삭제할 매칭 ID가 필요합니다.' })
  }

  try {
    const history = await readMatchHistory()
    const index = history.findIndex((entry) => entry.id === id)
    if (index === -1) {
      return res.status(404).json({ ok: false, message: '해당 매칭 기록을 찾을 수 없습니다.' })
    }
    const [removed] = history.splice(index, 1)
    await writeMatchHistory(history)
    res.json({ ok: true, data: removed })
  } catch (error) {
    console.error('[match-history:delete]', error)
    res.status(500).json({ ok: false, message: '매칭 기록을 삭제하지 못했습니다.' })
  }
})

app.post('/api/match-history/lookup', async (req, res) => {
  const phoneKey = normalizePhoneNumber(req.body?.phone)
  const requestedWeek = sanitizeText(req.body?.week)
  const limitRaw = Number(req.body?.limit)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 6) : 3

  if (!phoneKey) {
    return res.status(400).json({ ok: false, message: '전화번호를 입력해주세요.' })
  }

  try {
    const [records, history] = await Promise.all([readConsultations(), readMatchHistory()])
    const targetRecord = records.find((item) => normalizePhoneNumber(item.phone) === phoneKey)
    if (!targetRecord) {
      return res.status(404).json({ ok: false, message: '등록된 회원을 찾지 못했습니다.' })
    }

    const relevant = history
      .filter((entry) => entry.targetPhone === phoneKey || entry.targetId === targetRecord.id)
      .sort((a, b) => (b.matchedAt || 0) - (a.matchedAt || 0))

    if (!relevant.length) {
      return res.status(404).json({ ok: false, message: '매칭 기록이 없습니다.' })
    }

    let activeWeekKey = requestedWeek && requestedWeek.trim() ? requestedWeek.trim() : ''
    if (!activeWeekKey) {
      activeWeekKey = buildWeekKey(relevant[0]?.week)
    }

    const weekFiltered = activeWeekKey
      ? relevant.filter((entry) => buildWeekKey(entry.week) === activeWeekKey)
      : relevant

    const selection = []
    const seen = new Set()
    const sourceList = weekFiltered.length ? weekFiltered : relevant

    for (const entry of sourceList) {
      if (!entry?.candidateId || seen.has(entry.candidateId)) continue
      const candidateRecord = records.find((item) => item.id === entry.candidateId)
      if (!candidateRecord) continue
      selection.push({ entry, record: candidateRecord })
      seen.add(entry.candidateId)
      if (selection.length >= limit) break
    }

    if (!selection.length) {
      return res.status(404).json({ ok: false, message: '표시할 매칭 후보를 찾지 못했습니다.' })
    }

    const responseWeek = selection[0].entry?.week || null
    res.json({
      ok: true,
      data: {
        target: buildMatchTargetPayload(targetRecord),
        week: responseWeek,
        matches: selection.map(({ record }) => buildMatchCardPayload(record)),
      },
    })
  } catch (error) {
    console.error('[match-history:lookup]', error)
    res.status(500).json({ ok: false, message: '매칭 정보를 불러오지 못했습니다.' })
  }
})

app.post('/api/consult/import', async (req, res) => {
  const rows = Array.isArray(req.body?.items) ? req.body.items : []
  if (!rows.length) {
    return res.status(400).json({ ok: false, message: '데이터가 비어있습니다.' })
  }

  const prepared = []
  const usedSchedules = new Set()
  for (const row of rows) {
    const payload = sanitizePayload(row)
    const errors = validatePayload(payload)
    if (errors.length) {
      return res.status(400).json({
        ok: false,
        message: '유효하지 않은 행이 있습니다.',
        errors,
      })
    }

     const phoneStatus = normalizePhoneStatus(
      row.phoneConsultStatus || row.phone_status || row.status,
      'pending',
    )

    let meetingSchedule = ''
    const rawSchedule =
      row.meetingSchedule || row.meeting_schedule || row['대면 상담 일정'] || row['meeting']
    if (rawSchedule) {
      try {
        meetingSchedule = normalizeMeetingSchedule(rawSchedule)
      } catch (error) {
        return res.status(400).json({ ok: false, message: `엑셀 데이터 오류: ${error.message}` })
      }
      if (meetingSchedule && usedSchedules.has(meetingSchedule)) {
        return res
          .status(409)
          .json({ ok: false, message: '엑셀 데이터에 중복된 상담 일정이 있습니다.' })
      }
      if (meetingSchedule) usedSchedules.add(meetingSchedule)
    }

    const createdAt = safeToISOString(row.createdAt, new Date().toISOString())
    const updatedAt = safeToISOString(row.updatedAt, createdAt)

    prepared.push({
      id: String(row.id || row.ID || nanoid()),
      ...payload,
      phoneConsultStatus: phoneStatus,
      meetingSchedule,
      notes: sanitizeNotes(row.notes || row.memo || row['특이사항']),
      status: 'new',
      createdAt,
      updatedAt,
    })
  }

  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(prepared, null, 2), 'utf-8')
    broadcast({ type: 'consult:import', payload: prepared })
    res.json({ ok: true, count: prepared.length })
  } catch (error) {
    console.error('[consult:import]', error)
    res.status(500).json({ ok: false, message: '엑셀 데이터를 반영하지 못했습니다.' })
  }
})

app.patch('/api/consult/:id', async (req, res) => {
  const { id } = req.params
  if (!id) {
    return res.status(400).json({ ok: false, message: '대상 정보를 확인할 수 없습니다.' })
  }

  const updates = {}

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'phoneConsultStatus')) {
    updates.phoneConsultStatus = normalizePhoneStatus(
      req.body.phoneConsultStatus,
      null,
    )
    if (!updates.phoneConsultStatus) {
      return res.status(400).json({ ok: false, message: '유효한 상담 상태가 아닙니다.' })
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'meetingSchedule')) {
    try {
      updates.meetingSchedule = normalizeMeetingSchedule(req.body.meetingSchedule)
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message })
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {
    updates.notes = sanitizeNotes(req.body.notes)
  }

  const mutableTextFields = ['name', 'gender', 'phone', 'birth', 'job', 'district', 'education']
  for (const field of mutableTextFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      updates[field] = sanitizeText(req.body[field])
    }
  }

  const optionalDetailTextFields = {
    mbti: sanitizeText,
    university: sanitizeText,
    salaryRange: sanitizeText,
    smoking: sanitizeText,
    religion: sanitizeText,
    longDistance: sanitizeText,
    dink: sanitizeText,
    lastRelationship: sanitizeText,
    marriageTiming: sanitizeText,
    relationshipCount: sanitizeText,
    carOwnership: sanitizeText,
    tattoo: sanitizeText,
    divorceStatus: sanitizeText,
    preferredAppearance: sanitizeText,
  }

  Object.entries(optionalDetailTextFields).forEach(([field, sanitizer]) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      updates[field] = sanitizer(req.body[field])
    }
  })

  const optionalDetailNoteFields = {
    jobDetail: sanitizeNotes,
    profileAppeal: sanitizeNotes,
    sufficientCondition: sanitizeNotes,
    necessaryCondition: sanitizeNotes,
    likesDislikes: sanitizeNotes,
    valuesCustom: sanitizeNotes,
    aboutMe: sanitizeNotes,
  }

  Object.entries(optionalDetailNoteFields).forEach(([field, sanitizer]) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      updates[field] = sanitizer(req.body[field])
    }
  })

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'preferredHeights')) {
    updates.preferredHeights = sanitizeStringArray(req.body.preferredHeights)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'preferredAges')) {
    updates.preferredAges = sanitizeStringArray(req.body.preferredAges)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'preferredLifestyle')) {
    updates.preferredLifestyle = sanitizeStringArray(req.body.preferredLifestyle)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'values')) {
    updates.values = sanitizeStringArray(req.body.values).slice(0, 2)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'height')) {
    updates.height = normalizeHeight(req.body.height)
  } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'region')) {
    updates.height = normalizeHeight(req.body.region)
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'depositStatus')) {
    const status = sanitizeDepositStatus(req.body.depositStatus, '')
    if (!status) {
      return res.status(400).json({ ok: false, message: '유효한 입금 상태가 아닙니다.' })
    }
    updates.depositStatus = status
  }

  if (req.body && typeof req.body.documents === 'object') {
    const documentsRaw = req.body.documents
    const nextDocuments = {}
    let hasDocumentPatch = false
    ;['idCard', 'employmentProof'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(documentsRaw, key)) {
        hasDocumentPatch = true
        const sanitized = sanitizeUploadEntry(documentsRaw[key], {
          fallbackName: key === 'employmentProof' ? '재직 증빙' : '신분증',
          defaultRole: key,
        })
        if (sanitized) {
          nextDocuments[key] = sanitized
        } else {
          nextDocuments[key] = null
        }
      }
    })
    if (hasDocumentPatch) {
      updates.documents = nextDocuments
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'photos')) {
    const photosRaw = Array.isArray(req.body.photos) ? req.body.photos : []
    const sanitizedPhotos = photosRaw
      .map((photo) =>
        sanitizeUploadEntry(photo, {
          fallbackName: '사진',
          defaultRole: sanitizeText(photo?.role || photo?.category || photo?.meta?.type || ''),
        }),
      )
      .filter(Boolean)
    updates.photos = sanitizedPhotos
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ ok: false, message: '변경할 항목이 없습니다.' })
  }

  try {
    const list = await readConsultations()
    const index = list.findIndex((item) => item.id === id)
    if (index === -1) {
      return res.status(404).json({ ok: false, message: '대상을 찾을 수 없습니다.' })
    }

    if (
      updates.meetingSchedule &&
      list.some(
        (item, idx) =>
          idx !== index && item.meetingSchedule && item.meetingSchedule === updates.meetingSchedule,
      )
    ) {
      return res.status(409).json({ ok: false, message: '이미 예약된 일정입니다.' })
    }

    const candidate = { ...list[index], ...updates }
    const requiresValidation = PATCH_VALIDATION_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(updates, field),
    )
    if (requiresValidation) {
      const validationErrors = validatePayload(candidate)
      if (validationErrors.length) {
        const [firstError] = validationErrors
        return res.status(400).json({
          ok: false,
          message: firstError?.message || '유효한 상담 정보가 아닙니다.',
          errors: validationErrors,
        })
      }
    }

    const updatedAt = new Date().toISOString()
    const updatedRecord = {
      ...list[index],
      ...updates,
      updatedAt,
    }

    list[index] = updatedRecord
    await writeConsultations(list)
    broadcast({ type: 'consult:update', payload: updatedRecord })
    res.json({ ok: true, data: updatedRecord })
  } catch (error) {
    console.error('[consult:update]', error)
    res.status(500).json({ ok: false, message: '정보를 업데이트하지 못했습니다.' })
  }
})

app.delete('/api/consult', async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id) => String(id).trim()).filter(Boolean)
    : []

  if (!ids.length) {
    return res.status(400).json({ ok: false, message: '삭제할 대상을 선택하세요.' })
  }

  try {
    const list = await readConsultations()
    const idSet = new Set(ids)
    const removed = list.filter((item) => idSet.has(item.id))

    if (!removed.length) {
      return res.status(404).json({ ok: false, message: '일치하는 데이터를 찾지 못했습니다.' })
    }

    const remaining = list.filter((item) => !idSet.has(item.id))
    await writeConsultations(remaining)
    broadcast({ type: 'consult:delete', payload: { ids: removed.map((item) => item.id) } })
    res.json({ ok: true, count: removed.length })
  } catch (error) {
    console.error('[consult:delete]', error)
    res.status(500).json({ ok: false, message: '삭제에 실패했습니다.' })
  }
})

app.get('/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  res.write('retry: 15000\n\n')

  const client = { id: nanoid(), res }
  sseClients.add(client)

  res.write(`event: ready\ndata: {}\n\n`)

  const keepAlive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAlive)
      return
    }
    res.write(': keep-alive\n\n')
  }, 25000)

  req.on('close', () => {
    clearInterval(keepAlive)
    sseClients.delete(client)
  })
})

app.get('*', (req, res) => {
  if (HAS_FRONTEND_BUILD) {
    return res.sendFile(FRONTEND_INDEX)
  }
  return res.sendFile(path.join(__dirname, 'index.html'))
})

async function readConsultations() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeStoredRecord)
    }
    if (parsed && typeof parsed === 'object') {
      return [normalizeStoredRecord(parsed)]
    }
    await fs.writeFile(DATA_FILE, '[]', 'utf-8')
    return []
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(DATA_FILE, '[]', 'utf-8')
      return []
    }
    throw error
  }
}

async function writeConsultations(data) {
  const normalized = Array.isArray(data)
    ? data.map(normalizeStoredRecord)
    : data && typeof data === 'object'
    ? [normalizeStoredRecord(data)]
    : []
  await fs.writeFile(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf-8')
}

async function readMatchHistory() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const raw = await fs.readFile(MATCH_HISTORY_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map((entry) => normalizeMatchHistoryEntry(entry)).filter(Boolean)
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(MATCH_HISTORY_FILE, '[]', 'utf-8')
      return []
    }
    throw error
  }
}

async function writeMatchHistory(data) {
  const normalized = Array.isArray(data)
    ? data.map((entry) => normalizeMatchHistoryEntry(entry)).filter(Boolean)
    : []
  const limited = normalized.slice(0, MATCH_HISTORY_LIMIT)
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(MATCH_HISTORY_FILE, JSON.stringify(limited, null, 2), 'utf-8')
}

function sanitizeMatchHistoryPayload(body) {
  if (!body || typeof body !== 'object') return null
  return normalizeMatchHistoryEntry(body)
}

function normalizeMatchHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const candidateId = sanitizeText(entry.candidateId)
  const targetId = sanitizeText(entry.targetId)
  const targetPhone = normalizePhoneNumber(entry.targetPhone || entry.targetPhoneKey)
  if (!candidateId || !targetId || !targetPhone) return null
  const matchedAt = Number(entry.matchedAt)
  const normalizedMatchedAt =
    Number.isFinite(matchedAt) && matchedAt > 0 ? matchedAt : Date.now()
  return {
    id: sanitizeText(entry.id) || `match_${nanoid()}`,
    candidateId,
    targetId,
    targetPhone,
    matchedAt: normalizedMatchedAt,
    week: sanitizeWeekDescriptor(entry.week, normalizedMatchedAt),
  }
}

function sanitizeWeekDescriptor(week, fallbackTime) {
  if (week && typeof week === 'object') {
    const year = Number(week.year)
    const weekNo = Number(week.week)
    const startTime = Number(week.startTime)
    const endTime = Number(week.endTime)
    if (Number.isFinite(year) && Number.isFinite(weekNo)) {
      return {
        label:
          sanitizeText(week.label) || `${year}년 ${String(weekNo).padStart(2, '0')}주차`,
        year,
        week: weekNo,
        startTime: Number.isFinite(startTime) ? startTime : undefined,
        endTime: Number.isFinite(endTime) ? endTime : undefined,
      }
    }
  }
  const fallback = Number.isFinite(fallbackTime) ? fallbackTime : Date.now()
  return getWeekInfoFromDate(new Date(fallback))
}

function getWeekInfoFromDate(dateInput) {
  const date = new Date(dateInput)
  const day = date.getDay() || 7
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (day - 1))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const utcDay = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - utcDay)
  const isoYear = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7)

  return {
    label: `${isoYear}년 ${String(weekNo).padStart(2, '0')}주차`,
    year: isoYear,
    week: weekNo,
    startTime: start.getTime(),
    endTime: end.getTime(),
  }
}

function buildWeekKey(week) {
  if (!week || typeof week !== 'object') return ''
  const year = Number(week.year)
  const weekNo = Number(week.week)
  if (!Number.isFinite(year) || !Number.isFinite(weekNo)) return ''
  return `${year}-W${String(weekNo).padStart(2, '0')}`
}

function buildMatchCardPayload(record) {
  const payload = buildSharedProfilePayload(record)
  delete payload.phone
  delete payload.email
  return payload
}

function buildMatchTargetPayload(record) {
  if (!record || typeof record !== 'object') return {}
  return {
    id: record.id || '',
    name: record.name || '',
    gender: record.gender || '',
    phoneMasked: maskPhoneNumber(record.phone),
  }
}

function maskPhoneNumber(value) {
  const digits = normalizePhoneNumber(value)
  if (!digits) return ''
  if (digits.length <= 4) return digits
  const head = digits.slice(0, 3)
  const tail = digits.slice(-4)
  const middleLength = Math.max(3, digits.length - 7)
  const middle = '*'.repeat(middleLength)
  return `${head}-${middle}-${tail}`
}

function sanitizeUploadEntry(entry, { fallbackName = '', defaultRole = '' } = {}) {
  if (!entry) return null
  if (typeof entry === 'string') {
    const source = sanitizeText(entry)
    if (!source) return null
    return {
      id: nanoid(),
      name: fallbackName || '',
      size: 0,
      type: '',
      downloadURL: source,
      url: source,
      storagePath: '',
      uploadedAt: Date.now(),
      group: '',
      category: '',
      persistLevel: '',
      role: defaultRole,
    }
  }
  if (typeof entry !== 'object') return null

  const downloadURL =
    sanitizeText(entry.downloadURL) ||
    sanitizeText(entry.url) ||
    sanitizeText(entry.dataUrl)
  if (!downloadURL) return null

  const size = Number(entry.size)
  const uploadedAt = Number(entry.uploadedAt)
  const sanitized = {
    id: sanitizeText(entry.id) || nanoid(),
    name: sanitizeText(entry.name) || fallbackName || '',
    size: Number.isFinite(size) && size > 0 ? size : 0,
    type: sanitizeText(entry.type),
    downloadURL,
    url: downloadURL,
    storagePath: sanitizeText(entry.storagePath),
    uploadedAt: Number.isFinite(uploadedAt) && uploadedAt > 0 ? uploadedAt : Date.now(),
    group: sanitizeText(entry.group),
    category: sanitizeText(entry.category),
    persistLevel: sanitizeText(entry.persistLevel),
    role: sanitizeText(entry.role || entry.category || entry.meta?.type || defaultRole),
  }

  const bucket = sanitizeText(entry.bucket)
  if (bucket) sanitized.bucket = bucket
  const contentType = sanitizeText(entry.contentType || entry.type)
  if (contentType) sanitized.contentType = contentType
  const dataUrl = sanitizeText(entry.dataUrl)
  if (dataUrl) sanitized.dataUrl = dataUrl

  return sanitized
}

function sanitizeProfileUpdate(body) {
  const phone = normalizePhoneNumber(body?.phone)
  const updates = {
    mbti: sanitizeText(body?.mbti),
    university: sanitizeText(body?.university),
    salaryRange: sanitizeText(body?.salaryRange),
    jobDetail: sanitizeNotes(body?.jobDetail),
    profileAppeal: sanitizeNotes(body?.profileAppeal),
    smoking: sanitizeText(body?.smoking),
    religion: sanitizeText(body?.religion),
    longDistance: sanitizeText(body?.longDistance),
    dink: sanitizeText(body?.dink),
    lastRelationship: sanitizeText(body?.lastRelationship),
    marriageTiming: sanitizeText(body?.marriageTiming),
    relationshipCount: sanitizeText(body?.relationshipCount),
    carOwnership: sanitizeText(body?.carOwnership),
    tattoo: sanitizeText(body?.tattoo),
    divorceStatus: sanitizeText(body?.divorceStatus),
    sufficientCondition: sanitizeNotes(body?.sufficientCondition),
    necessaryCondition: sanitizeNotes(body?.necessaryCondition),
    likesDislikes: sanitizeNotes(body?.likesDislikes),
    valuesCustom: sanitizeNotes(body?.valuesCustom),
    aboutMe: sanitizeNotes(body?.aboutMe),
    preferredHeights: sanitizeStringArray(body?.preferredHeights),
    preferredAges: sanitizeStringArray(body?.preferredAges),
    preferredLifestyle: sanitizeStringArray(body?.preferredLifestyle),
    preferredAppearance: sanitizeText(body?.preferredAppearance),
    values: sanitizeStringArray(body?.values).slice(0, 2),
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, 'depositStatus')) {
    const nextStatus = sanitizeDepositStatus(body?.depositStatus, '')
    if (nextStatus) {
      updates.depositStatus = nextStatus
    }
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, 'job')) {
    updates.job = sanitizeText(body.job)
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, 'height')) {
    updates.height = normalizeHeight(body.height)
  }

  const documentsRaw =
    body?.documents && typeof body.documents === 'object' ? body.documents : {}
  const sanitizedDocuments = {
    idCard: sanitizeUploadEntry(documentsRaw.idCard, {
      fallbackName: '신분증',
      defaultRole: 'idCard',
    }),
    employmentProof: sanitizeUploadEntry(documentsRaw.employmentProof, {
      fallbackName: '재직 증빙',
      defaultRole: 'employmentProof',
    }),
  }
  const documentEntries = Object.entries(sanitizedDocuments).filter(([, value]) => Boolean(value))
  if (documentEntries.length) {
    updates.documents = Object.fromEntries(documentEntries)
  }

  const photosRaw = Array.isArray(body?.photos) ? body.photos : []
  const sanitizedPhotos = photosRaw
    .map((photo) =>
      sanitizeUploadEntry(photo, {
        fallbackName: '사진',
        defaultRole: sanitizeText(photo?.role || photo?.category || photo?.meta?.type || ''),
      }),
    )
    .filter(Boolean)
  if (sanitizedPhotos.length) {
    updates.photos = sanitizedPhotos
  }

  const agreements = {
    info: Boolean(body?.agreements?.info),
    manners: Boolean(body?.agreements?.manners),
  }

  return { phone, updates, agreements }
}

function normalizePhoneNumber(value) {
  return sanitizeText(value).replace(/\D/g, '')
}

function sanitizePayload(body) {
  const agreementsSource =
    body?.agreements && typeof body.agreements === 'object' ? body.agreements : {}
  const payload = {
    name: sanitizeText(body?.name),
    gender: sanitizeText(body?.gender),
    phone: sanitizeText(body?.phone),
    birth: sanitizeText(body?.birth),
    job: sanitizeText(body?.job),
    height: normalizeHeight(body?.height ?? body?.region),
    district: sanitizeText(body?.district),
    education: sanitizeText(body?.education),
    workStyle: sanitizeText(body?.workStyle),
    relationshipStatus: sanitizeText(body?.relationshipStatus || body?.relationship),
    participationGoal: sanitizeText(body?.participationGoal || body?.goal),
    socialEnergy: sanitizeText(body?.socialEnergy),
    weekendPreference: sanitizeText(body?.weekendPreference),
    depositStatus: sanitizeDepositStatus(body?.depositStatus, 'pending'),
    formType: sanitizeFormType(body?.formType || body?.applicationType, body),
  }

  payload.agreements = {
    info: Boolean(agreementsSource.info ?? body?.agree),
    manners: Boolean(agreementsSource.manners ?? agreementsSource.rules ?? body?.rulesAgree),
    refund: Boolean(agreementsSource.refund ?? body?.refundAgree),
  }

  return payload
}

function hasMoimIndicators(source) {
  if (!source || typeof source !== 'object') return false
  const candidates = [
    source.workStyle,
    source.relationshipStatus || source.relationship,
    source.participationGoal || source.goal,
    source.socialEnergy,
    source.weekendPreference,
  ]
  return candidates.some((value) => typeof value === 'string' && value.trim())
}

function sanitizeFormType(value, context) {
  const normalized = sanitizeText(value).toLowerCase()
  if (normalized === 'moim') return 'moim'
  if (hasMoimIndicators(context)) return 'moim'
  return 'consult'
}

function sanitizeDepositStatus(value, fallback = 'pending') {
  const normalized = sanitizeText(value).toLowerCase()
  if (DEPOSIT_STATUS_VALUES.includes(normalized)) return normalized
  return fallback
}

function normalizeStoredRecord(entry) {
  if (!entry || typeof entry !== 'object') return {}
  const record = { ...entry }
  record.formType = sanitizeFormType(record.formType, record)
  record.id = sanitizeText(record.id) || nanoid()
  record.name = sanitizeText(record.name)
  record.gender = sanitizeText(record.gender)
  record.phone = sanitizeText(record.phone)
  record.birth = sanitizeText(record.birth)
  record.education = sanitizeText(record.education)
  record.height = normalizeHeight(
    record.height ??
      record.heightCm ??
      record['신장'] ??
      record['신장(cm)'] ??
      record.region ??
      '',
  )
  record.job = sanitizeText(
    record.job ??
      record.occupation ??
      record.jobTitle ??
      record.company ??
      record.companyName ??
      record.employer ??
      record['직업'] ??
      record['회사'] ??
      '',
  )
  record.district = sanitizeText(
    record.district ??
      record.regionDetail ??
      record.areaDetail ??
      record.subRegion ??
      record['거주구'] ??
      record['거주 구'] ??
      '',
  )
  record.workStyle = sanitizeText(record.workStyle)
  record.relationshipStatus = sanitizeText(record.relationshipStatus || record.relationship)
  record.participationGoal = sanitizeText(record.participationGoal)
  record.socialEnergy = sanitizeText(record.socialEnergy)
  record.weekendPreference = sanitizeText(record.weekendPreference)
  record.mbti = sanitizeText(record.mbti)
  record.university = sanitizeText(record.university)
  record.salaryRange = sanitizeText(record.salaryRange)
  record.jobDetail = sanitizeNotes(record.jobDetail)
  record.profileAppeal = sanitizeNotes(record.profileAppeal)
  record.smoking = sanitizeText(record.smoking)
  record.religion = sanitizeText(record.religion)
  record.longDistance = sanitizeText(record.longDistance)
  record.dink = sanitizeText(record.dink)
  record.lastRelationship = sanitizeText(record.lastRelationship)
  record.marriageTiming = sanitizeText(record.marriageTiming)
  record.relationshipCount = sanitizeText(record.relationshipCount)
  record.carOwnership = sanitizeText(record.carOwnership)
  record.tattoo = sanitizeText(record.tattoo)
  record.divorceStatus = sanitizeText(record.divorceStatus)
  record.sufficientCondition = sanitizeNotes(record.sufficientCondition)
  record.necessaryCondition = sanitizeNotes(record.necessaryCondition)
  record.likesDislikes = sanitizeNotes(record.likesDislikes)
  record.valuesCustom = sanitizeNotes(record.valuesCustom)
  record.aboutMe = sanitizeNotes(record.aboutMe)
  record.preferredHeights = sanitizeStringArray(record.preferredHeights)
  record.preferredAges = sanitizeStringArray(record.preferredAges)
  record.preferredLifestyle = sanitizeStringArray(record.preferredLifestyle)
  record.preferredAppearance = sanitizeText(record.preferredAppearance)
  record.values = sanitizeStringArray(record.values)
  const agreementsRaw =
    record.agreements && typeof record.agreements === 'object' ? record.agreements : {}
  record.agreements = {
    info: Boolean(agreementsRaw.info ?? record.agree),
    manners: Boolean(agreementsRaw.manners ?? agreementsRaw.rules ?? record.rulesAgree),
    refund: Boolean(agreementsRaw.refund ?? record.refundAgree),
  }
  record.depositStatus = sanitizeDepositStatus(record.depositStatus, 'pending')
  const documentsRaw =
    record.documents && typeof record.documents === 'object' ? record.documents : {}
  const normalizedDocuments = {
    idCard: sanitizeUploadEntry(documentsRaw.idCard, {
      fallbackName: '신분증',
      defaultRole: 'idCard',
    }),
    employmentProof: sanitizeUploadEntry(documentsRaw.employmentProof, {
      fallbackName: '재직 증빙',
      defaultRole: 'employmentProof',
    }),
  }
  record.documents = {}
  Object.entries(normalizedDocuments).forEach(([key, value]) => {
    if (value) {
      record.documents[key] = value
    }
  })
  if (!Object.keys(record.documents).length) {
    record.documents = {}
  }
  const photosRaw = Array.isArray(record.photos) ? record.photos : []
  record.photos = photosRaw
    .map((photo) =>
      sanitizeUploadEntry(photo, {
        fallbackName: '사진',
        defaultRole: sanitizeText(photo?.role || photo?.category || photo?.meta?.type || ''),
      }),
    )
    .filter(Boolean)
  record.meetingSchedule = sanitizeText(record.meetingSchedule)
  record.notes = sanitizeNotes(record.notes)
  const shareData = sanitizeProfileShare(record.profileShare)
  if (shareData) {
    record.profileShare = shareData
  } else {
    delete record.profileShare
  }
  record.createdAt = safeToISOString(record.createdAt, new Date().toISOString())
  record.updatedAt = safeToISOString(record.updatedAt, record.createdAt)
  record.phoneConsultStatus = normalizePhoneStatus(record.phoneConsultStatus, 'pending')
  return record
}

function sanitizeStringArray(input) {
  if (Array.isArray(input)) {
    return input.map((value) => sanitizeText(value)).filter(Boolean)
  }
  if (typeof input === 'string') {
    const value = sanitizeText(input)
    return value ? [value] : []
  }
  return []
}

function sanitizeProfileShare(entry) {
  if (!entry || typeof entry !== 'object') return null
  const token = sanitizeText(entry.token)
  const createdAt = safeToISOString(entry.createdAt, '')
  const updatedAt = safeToISOString(entry.updatedAt, '')
  const grantsRaw =
    entry.grants && typeof entry.grants === 'object' ? entry.grants : {}
  const grants = {}

  Object.entries(grantsRaw).forEach(([key, value]) => {
    const phoneKey = normalizePhoneNumber(key || value?.phone || '')
    const sanitizedGrant = sanitizeShareGrant(phoneKey, value)
    if (phoneKey && sanitizedGrant) {
      grants[phoneKey] = sanitizedGrant
    }
  })

  if (!token && !Object.keys(grants).length) {
    return null
  }

  const share = {
    token,
    createdAt: createdAt || '',
    updatedAt: updatedAt || '',
    grants,
  }

  if (!share.token) delete share.token
  if (!share.createdAt) delete share.createdAt
  if (!share.updatedAt) delete share.updatedAt
  return share
}

function sanitizeShareGrant(phoneKey, grant) {
  if (!phoneKey || !grant || typeof grant !== 'object') return null
  const grantedAt = safeToISOString(grant.grantedAt, null)
  const expiresAt = safeToISOString(grant.expiresAt, null)
  if (!grantedAt || !expiresAt) return null
  const lastVerifiedAt = safeToISOString(grant.lastVerifiedAt, grantedAt)
  return {
    phoneKey,
    phone: sanitizeText(grant.phone),
    grantedAt,
    expiresAt,
    lastVerifiedAt,
  }
}

function ensureProfileShare(record) {
  const existing = sanitizeProfileShare(record?.profileShare)
  const nowIso = new Date().toISOString()
  const grants = existing?.grants ? { ...existing.grants } : {}
  return {
    token: existing?.token || nanoid(32),
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    grants,
  }
}

function buildProfileShareUrl(req, token) {
  const encodedToken = encodeURIComponent(token)
  const base =
    getProfileShareBaseUrl(req) ||
    sanitizeEnvValue(process.env.API_BASE_URL) ||
    `${req.protocol || 'https'}://${req.get('host') || ''}`.replace(/\/+$/, '')

  if (base) {
    return `${base}/${PROFILE_SHARE_PAGE}?token=${encodedToken}`
  }
  return `${PROFILE_SHARE_PAGE}?token=${encodedToken}`
}

function getProfileShareBaseUrl(req) {
  const override = sanitizeEnvValue(process.env.PROFILE_SHARE_BASE_URL)
  if (override) {
    return override.replace(/\/+$/, '')
  }
  const host = req.get('host') || ''
  if (!host) return ''
  const forwarded = req.get('x-forwarded-proto')
  const protocol =
    (forwarded && forwarded.split(',')[0]) || req.protocol || 'https'
  return `${protocol}://${host}`.replace(/\/+$/, '')
}

function phoneExistsInConsultations(list, phoneKey) {
  if (!phoneKey) return false
  return list.some((item) => normalizePhoneNumber(item.phone) === phoneKey)
}

function buildSharedProfilePayload(record) {
  if (!record || typeof record !== 'object') return {}
  return {
    id: record.id || '',
    name: record.name || '',
    gender: record.gender || '',
    birth: record.birth || '',
    height: record.height || '',
    job: record.job || '',
    jobDetail: record.jobDetail || '',
    district: record.district || '',
    phone: record.phone || '',
    email: record.email || '',
    mbti: record.mbti || '',
    education: record.education || '',
    university: record.university || '',
    salaryRange: record.salaryRange || '',
    profileAppeal: record.profileAppeal || '',
    aboutMe: record.aboutMe || '',
    sufficientCondition: record.sufficientCondition || '',
    necessaryCondition: record.necessaryCondition || '',
    likesDislikes: record.likesDislikes || '',
    smoking: record.smoking || '',
    religion: record.religion || '',
    longDistance: record.longDistance || '',
    dink: record.dink || '',
    carOwnership: record.carOwnership || '',
    tattoo: record.tattoo || '',
    divorceStatus: record.divorceStatus || '',
    lastRelationship: record.lastRelationship || '',
    marriageTiming: record.marriageTiming || '',
    relationshipCount: record.relationshipCount || '',
    preferredHeights: Array.isArray(record.preferredHeights)
      ? record.preferredHeights
      : [],
    preferredAges: Array.isArray(record.preferredAges)
      ? record.preferredAges
      : [],
    preferredLifestyle: Array.isArray(record.preferredLifestyle)
      ? record.preferredLifestyle
      : [],
    preferredAppearance: record.preferredAppearance || '',
    values: Array.isArray(record.values) ? record.values : [],
    valuesCustom: record.valuesCustom || '',
    photos: Array.isArray(record.photos) ? record.photos : [],
  }
}


function validatePayload(payload) {
  const errors = []
  if (!payload.name) errors.push({ field: 'name', message: '성명을 입력해주세요.' })
  if (!payload.gender) errors.push({ field: 'gender', message: '성별을 선택해주세요.' })
  if (!payload.phone) errors.push({ field: 'phone', message: '연락처를 입력해주세요.' })
  if (!payload.birth) errors.push({ field: 'birth', message: '생년월일을 입력해주세요.' })
  if (!payload.height) errors.push({ field: 'height', message: '신장을 입력해주세요.' })
  if (!payload.job) errors.push({ field: 'job', message: '직업을 입력해주세요.' })
  if (!payload.district) errors.push({ field: 'district', message: '거주 구를 입력해주세요.' })
  if (!payload.education) errors.push({ field: 'education', message: '최종학력을 선택해주세요.' })
  return errors
}

function broadcast(message) {
  const data = `data: ${JSON.stringify(message)}\n\n`
  for (const client of Array.from(sseClients)) {
    try {
      if (client.res.writableEnded) {
        sseClients.delete(client)
        continue
      }
      client.res.write(data)
    } catch (error) {
      console.warn('[sse] 전송 실패, 클라이언트를 제거합니다.', error)
      sseClients.delete(client)
      try {
        client.res.end()
      } catch (_) {}
    }
  }
}

async function triggerNotifications(record) {
  await Promise.all([sendEmailNotification(record), sendSmsNotifications(record)])
}

async function sendEmailNotification(record) {
  if (!emailTransport) {
    console.warn('[mail] 메일 전송 설정이 비어있습니다. .env를 확인하세요.')
    return
  }

  const recipients = EMAIL_RECIPIENTS.map((item) => item?.email).filter(Boolean)
  if (!recipients.length) {
    console.warn('[mail] 수신 이메일 정보가 없습니다.')
    return
  }

  const from =
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    process.env.SMTP_USERNAME ||
    process.env.GMAIL_USER

  if (!from) {
    console.warn('[mail] 발신 이메일 정보를 찾을 수 없습니다.')
    return
  }

  const subject = `[무료 상담 신청] ${record.name || '이름 미입력'}`
  const text = buildNotificationMessage(record)

  await emailTransport.sendMail({
    from,
    to: recipients.join(', '),
    subject,
    text,
  })
}

async function sendSmsNotifications(record) {
  if (!smsClient) {
    console.warn('[sms] SMS 전송 설정이 비어있습니다. .env를 확인하세요.')
    return
  }

  const from = process.env.TWILIO_FROM_NUMBER
  if (!from) {
    console.warn('[sms] 발신 번호 설정이 없습니다.')
    return
  }

  const targets = SMS_RECIPIENTS.map((item) => ({
    ...item,
    phone: toE164(item.phone),
  })).filter((item) => item.phone)

  if (!targets.length) {
    console.warn('[sms] 수신 번호가 없습니다.')
    return
  }

  const body = buildNotificationMessage(record, true)
  await Promise.all(
    targets.map((target) =>
      smsClient.messages.create({
        from,
        to: target.phone,
        body,
      }),
    ),
  )
}

function buildNotificationMessage(record, compact = false) {
  if (compact) {
    return [
      '새 상담 신청',
      `이름: ${record.name || '-'}`,
      `연락처: ${record.phone || '-'}`,
      `신장: ${record.height || '-'}`,
      `거주 구: ${record.district || '-'}`,
      `직업: ${record.job || '-'}`,
      `최종학력: ${record.education || '-'}`,
    ].join('\n')
  }

  return [
    '새로운 상담 신청이 접수되었습니다.',
    `이름: ${record.name || '-'}`,
    `연락처: ${record.phone || '-'}`,
    `성별: ${record.gender || '-'}`,
    `생년월일: ${record.birth || '-'}`,
    `신장: ${record.height || '-'}`,
    `거주 구: ${record.district || '-'}`,
    `직업: ${record.job || '-'}`,
    `최종학력: ${record.education || '-'}`,
    `신청시각: ${new Date(record.createdAt || Date.now()).toLocaleString('ko-KR')}`,
  ].join('\n')
}

function initialiseMailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, GMAIL_USER, GMAIL_PASS } =
    process.env

  try {
    if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
      return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    }

    if (GMAIL_USER && GMAIL_PASS) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: GMAIL_USER,
          pass: GMAIL_PASS,
        },
      })
    }
  } catch (error) {
    console.error('[mail:init] 메일 트랜스포터 생성 실패', error)
  }

  return null
}

function initialiseSmsClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return null
  }

  try {
    return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  } catch (error) {
    console.error('[sms:init] Twilio 초기화 실패', error)
    return null
  }
}

function toE164(value) {
  if (!value) return null
  let digits = String(value).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) {
    digits = `82${digits.slice(1)}`
  }
  if (!digits.startsWith('+')) {
    digits = `+${digits}`
  }
  return digits
}

function sanitizeText(value) {
  return String(value ?? '').trim()
}

function sanitizeNotes(value) {
  return sanitizeText(value)
}

function normalizeHeight(value) {
  const raw = sanitizeText(value)
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '').slice(0, 3)
  if (!digits) return ''
  return `${digits}cm`
}

function normalizePhoneStatus(value, fallback = 'pending') {
  const normalized = sanitizeText(value)
  if (!normalized && fallback) return fallback
  if (PHONE_STATUS_OPTIONS.includes(normalized)) {
    return normalized
  }
  return fallback
}

function normalizeMeetingSchedule(value) {
  const raw = sanitizeText(value)
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new Error('유효한 상담 일정을 입력해 주세요.')
  }
  if (
    date.getUTCMinutes() % 15 !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  ) {
    throw new Error('상담 일정은 15분 단위로만 예약할 수 있습니다.')
  }
  return date.toISOString()
}

function safeToISOString(value, fallback) {
  const raw = sanitizeText(value)
  if (!raw) return fallback
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toISOString()
}

function sanitizeEnvValue(value) {
  if (typeof value === 'string') {
    return value.trim()
  }
  return ''
}

function getFirebaseConfigFromEnv() {
  const rawConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  }
  const storageRoot = sanitizeEnvValue(process.env.FIREBASE_STORAGE_ROOT)
  const sanitizedEntries = Object.entries(rawConfig)
    .map(([key, value]) => [key, sanitizeEnvValue(value)])
    .filter(([, value]) => Boolean(value))
  if (storageRoot) {
    sanitizedEntries.push(['storageRoot', storageRoot])
  }
  const sanitized = Object.fromEntries(sanitizedEntries)
  const missing = FIREBASE_REQUIRED_KEYS.filter((key) => !sanitized[key])
  return { config: sanitized, missing }
}

app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`)
})

