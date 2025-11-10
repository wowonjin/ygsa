const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs/promises')
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

console.info(`[ygsa] 상담 데이터 저장 위치: ${DATA_FILE}`)

const sseClients = new Set()

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

const emailTransport = initialiseMailTransport()
const smsClient = initialiseSmsClient()

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(express.static(__dirname))

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

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'height')) {
    updates.height = normalizeHeight(req.body.height)
  } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'region')) {
    updates.height = normalizeHeight(req.body.region)
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
    const validationErrors = validatePayload(candidate)
    if (validationErrors.length) {
      const [firstError] = validationErrors
      return res.status(400).json({
        ok: false,
        message: firstError?.message || '유효한 상담 정보가 아닙니다.',
        errors: validationErrors,
      })
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
  res.sendFile(path.join(__dirname, 'pricing.html'))
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

function sanitizePayload(body) {
  return {
    name: sanitizeText(body?.name),
    gender: sanitizeText(body?.gender),
    phone: sanitizeText(body?.phone),
    birth: sanitizeText(body?.birth),
    job: sanitizeText(body?.job),
    height: normalizeHeight(body?.height ?? body?.region),
    district: sanitizeText(body?.district),
    education: sanitizeText(body?.education),
  }
}

function normalizeStoredRecord(entry) {
  if (!entry || typeof entry !== 'object') return {}
  const record = { ...entry }
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
  record.meetingSchedule = sanitizeText(record.meetingSchedule)
  record.notes = sanitizeNotes(record.notes)
  record.createdAt = safeToISOString(record.createdAt, new Date().toISOString())
  record.updatedAt = safeToISOString(record.updatedAt, record.createdAt)
  record.phoneConsultStatus = normalizePhoneStatus(record.phoneConsultStatus, 'pending')
  return record
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

app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`)
})

