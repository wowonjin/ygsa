import { PHONE_STATUS_VALUES } from '../constants.js'
import { normalizeHeightValue } from './format.js'
import { getFileSource } from './files.js'

export function uniqueSorted(values) {
  return Array.from(new Set((values || []).filter((value) => value && value.trim()))).sort((a, b) =>
    a.localeCompare(b, 'ko-KR'),
  )
}

export function toStringArray(input) {
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

export function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return record
  const normalized = { ...record }
  if (!PHONE_STATUS_VALUES.includes(normalized.phoneConsultStatus)) {
    normalized.phoneConsultStatus = 'pending'
  }
  if (typeof normalized.meetingSchedule !== 'string') normalized.meetingSchedule = ''
  if (typeof normalized.notes !== 'string') normalized.notes = ''

  const normalizeString = (value) => (value != null ? String(value) : '')
  normalized.job = normalizeString(normalized.job)
  normalized.height = normalizeHeightValue(normalizeString(normalized.height))
  normalized.district = normalizeString(normalized.district)
  normalized.mbti = normalizeString(normalized.mbti)
  normalized.university = normalizeString(normalized.university)
  normalized.salaryRange = normalizeString(normalized.salaryRange)
  normalized.jobDetail = normalizeString(normalized.jobDetail)
  normalized.profileAppeal = normalizeString(normalized.profileAppeal)
  normalized.smoking = normalizeString(normalized.smoking)
  normalized.religion = normalizeString(normalized.religion)
  normalized.longDistance = normalizeString(normalized.longDistance)
  normalized.dink = normalizeString(normalized.dink)
  normalized.lastRelationship = normalizeString(normalized.lastRelationship)
  normalized.marriageTiming = normalizeString(normalized.marriageTiming)
  normalized.relationshipCount = normalizeString(normalized.relationshipCount)
  normalized.carOwnership = normalizeString(normalized.carOwnership)
  normalized.tattoo = normalizeString(normalized.tattoo)
  normalized.divorceStatus = normalizeString(normalized.divorceStatus)
  normalized.sufficientCondition = normalizeString(normalized.sufficientCondition)
  normalized.necessaryCondition = normalizeString(normalized.necessaryCondition)
  normalized.likesDislikes = normalizeString(normalized.likesDislikes)
  normalized.valuesCustom = normalizeString(normalized.valuesCustom)
  normalized.aboutMe = normalizeString(normalized.aboutMe)

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
        typeof entry.downloadURL === 'string' && entry.downloadURL.trim() ? entry.downloadURL.trim() : source,
      storagePath:
        typeof entry.storagePath === 'string' && entry.storagePath.trim() ? entry.storagePath.trim() : '',
      role:
        typeof entry.role === 'string' && entry.role
          ? entry.role
          : typeof entry.meta?.type === 'string'
          ? entry.meta.type
          : '',
    }
  }

  const documentsRaw = normalized.documents && typeof normalized.documents === 'object' ? normalized.documents : {}
  normalized.documents = {
    idCard: normalizeFileEntry(documentsRaw.idCard, '신분증'),
    employmentProof: normalizeFileEntry(documentsRaw.employmentProof, '재직 증빙'),
  }
  normalized.photos = Array.isArray(normalized.photos)
    ? normalized.photos.map((photo) => normalizeFileEntry(photo)).filter((entry) => entry && entry.dataUrl)
    : []

  normalized.preferredHeights = toStringArray(normalized.preferredHeights)
  normalized.preferredAges = toStringArray(normalized.preferredAges)
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

export function getPreparedItems(items, viewState) {
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
        'carOwnership',
        'tattoo',
        'divorceStatus',
      ]
        .map((key) => String(item[key] || '').toLowerCase())
        .some((value) => value.includes(term)),
    )
  }
  if (viewState.gender !== 'all') {
    result = result.filter((item) => (item.gender || '') === viewState.gender)
  }
  if (viewState.height !== 'all') {
    result = result.filter((item) => (item.height || '') === viewState.height)
  }

  switch (viewState.sort) {
    case 'oldest':
      result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      break
    case 'name':
      result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR'))
      break
    case 'height':
      result.sort((a, b) => String(a.height || '').localeCompare(String(b.height || ''), 'ko-KR'))
      break
    case 'latest':
    default:
      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      break
  }

  return result
}



