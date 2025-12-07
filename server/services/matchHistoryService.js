const matchHistoryRepository = require('../repositories/matchHistoryRepository')
const consultationRepository = require('../repositories/consultationRepository')
const { MatchHistory } = require('../models/MatchHistory')
const { broadcast } = require('../utils/broadcast')

class MatchHistoryService {
  /**
   * 모든 매칭 기록 조회
   * @returns {Promise<MatchHistory[]>}
   */
  async getAll() {
    return await matchHistoryRepository.findAll()
  }

  /**
   * 새 매칭 기록 생성
   * @param {Object} body 
   * @returns {Promise<MatchHistory>}
   */
  async create(body) {
    const match = new MatchHistory(body)
    
    if (!match.isValid()) {
      const error = new Error('유효한 매칭 데이터가 필요합니다.')
      error.statusCode = 400
      throw error
    }

    const history = await matchHistoryRepository.findAll()
    const index = history.findIndex((item) => item.id === match.id)
    
    if (index !== -1) {
      // 기존 기록 업데이트
      history[index] = match
    } else {
      history.unshift(match)
    }
    
    // 상호 매칭 프로모션 (양쪽이 모두 선택한 경우 confirmed로 변경)
    this._promoteMutualMatches(history, match)
    
    await matchHistoryRepository.saveAll(history)
    
    if (match.isConfirmed()) {
      broadcast({ type: 'match:confirmed', payload: match.toJSON() })
    }
    
    return match
  }

  /**
   * 매칭 기록 삭제
   * @param {string} id 
   * @returns {Promise<MatchHistory|null>}
   */
  async delete(id) {
    const history = await matchHistoryRepository.findAll()
    const index = history.findIndex((item) => item.id === id)
    
    if (index === -1) {
      const error = new Error('해당 매칭 기록을 찾을 수 없습니다.')
      error.statusCode = 404
      throw error
    }
    
    const [removed] = history.splice(index, 1)
    await matchHistoryRepository.saveAll(history)
    
    if (removed && removed.isConfirmed()) {
      broadcast({ type: 'match:deleted', payload: removed.toJSON() })
    }
    
    return removed
  }

  /**
   * 회원의 매칭 조회 (apply.html에서 사용)
   * @param {string} phoneKey 
   * @param {string} requestedWeek 
   * @param {number} limit 
   * @returns {Promise<Object>}
   */
  async lookupMatches(phoneKey, requestedWeek, limit) {
    const [records, history] = await Promise.all([
      consultationRepository.findAll(),
      matchHistoryRepository.findAll(),
    ])

    const { normalizePhoneNumber } = require('../utils/sanitizers')
    const targetRecord = records.find(
      (item) => normalizePhoneNumber(item.phone) === phoneKey
    )

    if (!targetRecord) {
      const error = new Error('등록된 회원을 찾지 못했습니다.')
      error.statusCode = 404
      throw error
    }

    const relevant = history
      .filter(
        (entry) =>
          entry.targetPhone === phoneKey || entry.targetId === targetRecord.id
      )
      .sort((a, b) => (b.matchedAt || 0) - (a.matchedAt || 0))

    if (!relevant.length) {
      const error = new Error('매칭 기록이 없습니다.')
      error.statusCode = 404
      throw error
    }

    const introEntries = relevant.filter((entry) => !entry.isConfirmed())
    const confirmedEntries = relevant.filter((entry) => entry.isConfirmed())

    const viewerId = targetRecord.id || ''
    const viewerPhoneKey = normalizePhoneNumber(
      targetRecord.phone || targetRecord.phoneNumber || ''
    )

    const getCounterpartMeta = (entry) =>
      this._getCounterpartMetaForViewer(entry, viewerId, viewerPhoneKey)

    const matchedCandidateIds = Array.from(
      new Set(
        confirmedEntries
          .map((entry) => getCounterpartMeta(entry).partnerId)
          .filter(Boolean)
      )
    )

    const matchedCandidates = confirmedEntries.map((entry) => {
      const counterpart = getCounterpartMeta(entry)
      return {
        candidateId: counterpart.partnerId,
        matchedAt: entry.matchedAt,
        candidateName: counterpart.partnerName,
        candidatePhone: counterpart.partnerPhone,
        candidatePhoneMasked: counterpart.partnerPhoneMasked,
        targetName: targetRecord.name || entry.targetName || '',
        targetPhone: viewerPhoneKey,
      }
    })

    if (!introEntries.length && !confirmedEntries.length) {
      const error = new Error('이번주 소개가 없습니다.')
      error.statusCode = 404
      throw error
    }

    let activeWeekKey = requestedWeek && requestedWeek.trim() ? requestedWeek.trim() : ''
    if (!activeWeekKey) {
      const fallbackEntry = introEntries[0] || confirmedEntries[0] || null
      if (fallbackEntry && fallbackEntry.week) {
        activeWeekKey = this._buildWeekKey(fallbackEntry.week)
      }
    }

    const weekFilteredIntro = activeWeekKey
      ? introEntries.filter((entry) => this._buildWeekKey(entry.week) === activeWeekKey)
      : introEntries
    const weekFilteredConfirmed = activeWeekKey
      ? confirmedEntries.filter((entry) => this._buildWeekKey(entry.week) === activeWeekKey)
      : confirmedEntries

    const selection = []
    const seen = new Set()

    const tryPushEntry = (entry) => {
      if (!entry?.candidateId) return false
      const candidateId = entry.candidateId
      if (seen.has(candidateId)) return false
      const candidateRecord = records.find((item) => item.id === candidateId)
      if (!candidateRecord) return false
      selection.push({ entry, record: candidateRecord })
      seen.add(candidateId)
      return true
    }

    const confirmedPrioritySource = weekFilteredConfirmed.length
      ? weekFilteredConfirmed
      : confirmedEntries
    confirmedPrioritySource.forEach((entry) => {
      tryPushEntry(entry)
    })

    let introSlots = Math.max(limit, 0)
    const introSource = weekFilteredIntro.length ? weekFilteredIntro : introEntries
    for (const entry of introSource) {
      if (introSlots <= 0) break
      if (tryPushEntry(entry)) {
        introSlots -= 1
      }
    }

    if (!selection.length && confirmedEntries.length) {
      confirmedEntries.forEach((entry) => {
        tryPushEntry(entry)
      })
    }

    if (!selection.length) {
      const error = new Error('표시할 매칭 후보를 찾지 못했습니다.')
      error.statusCode = 404
      throw error
    }

    const responseWeek = selection[0].entry?.week || introEntries[0]?.week || null
    
    // "나와 연결되고 싶은 사람" 목록 생성 (extraMatch 로직 포함)
    const incomingRequests = this._buildIncomingRequests(
      targetRecord,
      records,
      history
    )

    const confirmedMatchCards = confirmedEntries
      .map((entry) => {
        const counterpart = getCounterpartMeta(entry)
        if (!counterpart.partnerId && !counterpart.partnerName) return null
        const candidateRecord = counterpart.partnerId
          ? records.find((r) => r.id === counterpart.partnerId)
          : null
        const basePayload = candidateRecord
          ? this._buildMatchCardPayload(candidateRecord)
          : {
              id: counterpart.partnerId || `${entry.id || 'match'}-counterpart`,
              name: counterpart.partnerName || '확정 매칭 카드',
              gender: counterpart.partnerGender || '',
              profileAppeal: '확정된 매칭 카드입니다.',
              aboutMe: '',
              photos: [],
              preferredLifestyle: [],
            }
        return {
          ...basePayload,
          matchEntryId: entry.id,
          matchRecordedAt: entry.matchedAt,
          matchCandidateId: counterpart.partnerId || basePayload.id,
          matchCategory: entry.category,
          targetSelected: true,
        }
      })
      .filter(Boolean)

    return {
      target: this._buildMatchTargetPayload(targetRecord),
      week: responseWeek,
      matches: selection.map(({ entry, record }) => {
        const payload = this._buildMatchCardPayload(record)
        return {
          ...payload,
          matchEntryId: entry.id,
          matchRecordedAt: entry.matchedAt,
          matchCandidateId: entry.candidateId,
          matchCategory: entry.category,
          targetSelected: Boolean(entry.targetSelected),
        }
      }),
      matchedCandidateIds,
      matchedCandidates,
      incomingRequests,
      confirmedMatchCards,
    }
  }

  /**
   * 매칭 상대방 연락처 조회
   * @param {string} phoneKey 
   * @param {string} candidateKey 
   * @param {string} matchEntryId 
   * @returns {Promise<Object>}
   */
  async getContact(phoneKey, candidateKey, matchEntryId) {
    // 복잡한 로직이므로 기존 server.js 로직 재사용
    // 향후 리팩토링 예정
    const error = new Error('아직 구현되지 않았습니다. 기존 server.js를 사용하세요.')
    error.statusCode = 501
    throw error
  }

  /**
   * 상호 매칭 프로모션 (private)
   * 양쪽이 서로를 선택한 경우 category를 'confirmed'로 변경
   * @private
   */
  _promoteMutualMatches(history, updatedEntry) {
    if (!updatedEntry || !updatedEntry.targetSelected) return
    
    const candidateId = updatedEntry.candidateId
    const targetId = updatedEntry.targetId
    
    // 반대 방향의 선택 찾기
    const reverseEntry = history.find(
      (entry) =>
        entry.id !== updatedEntry.id &&
        entry.candidateId === targetId &&
        entry.targetId === candidateId &&
        entry.targetSelected
    )
    
    if (reverseEntry) {
      // 양쪽 모두 confirmed로 변경
      updatedEntry.category = 'confirmed'
      reverseEntry.category = 'confirmed'
    }
  }

  /**
   * "나와 연결되고 싶은 사람" 목록 생성 (extraMatch 로직 포함)
   * @private
   */
  _buildIncomingRequests(viewer, records, history) {
    if (!viewer || !Array.isArray(records) || !Array.isArray(history)) return []
    const viewerId = viewer.id
    if (!viewerId) return []

    const requestMap = new Map()
    
    // 현재 주차 정보
    const currentWeek = this._getWeekInfoFromDate(new Date())
    const currentWeekKey = this._buildWeekKey(currentWeek)

    history
      .filter((entry) => entry.candidateId === viewerId && entry.targetSelected)
      .forEach((entry) => {
        const requester = records.find((item) => item.id === entry.targetId)
        if (!requester) return
        
        const category = entry.category
        const existing = requestMap.get(requester.id)
        
        if (!existing || (entry.matchedAt || 0) > (existing.requestRecordedAt || 0)) {
          // requester(test3)가 viewer(test1)를 이번주 소개받았는지 확인
          const requesterIntros = history.filter(
            (h) =>
              h.targetId === requester.id &&
              h.candidateId === viewerId &&
              this._buildWeekKey(h.week) === currentWeekKey &&
              h.category !== 'confirmed'
          )
          const isThisWeekIntro = requesterIntros.length > 0

          requestMap.set(requester.id, {
            requestId: entry.id,
            requesterId: requester.id,
            candidateId: entry.candidateId,
            requestRecordedAt: entry.matchedAt || Date.now(),
            requestWeek: entry.week || null,
            status: category,
            // requester 입장에서 extraMatch 계산
            extraMatch: !isThisWeekIntro,
            profile: this._buildMatchCardPayload(requester),
            contact: {
              name: requester.name || '',
              phone: require('../utils/sanitizers').normalizePhoneNumber(requester.phone),
              phoneMasked: require('../utils/sanitizers').normalizePhoneNumber(requester.phone), // 전체 번호 공개
              gender: requester.gender || '',
            },
          })
        }
      })

    return Array.from(requestMap.values()).sort(
      (a, b) => (b.requestRecordedAt || 0) - (a.requestRecordedAt || 0)
    )
  }

  /**
   * 상대방 정보 추출 (private)
   * @private
   */
  _getCounterpartMetaForViewer(entry, viewerId, viewerPhoneKey) {
    if (!entry) {
      return {
        viewerIsTarget: false,
        partnerId: '',
        partnerName: '',
        partnerPhone: '',
        partnerPhoneMasked: '',
        partnerGender: '',
      }
    }

    const { normalizePhoneNumber } = require('../utils/sanitizers')
    const viewerIsTarget =
      (viewerId && entry.targetId === viewerId) ||
      (viewerPhoneKey && normalizePhoneNumber(entry.targetPhone) === viewerPhoneKey)

    const partnerId = viewerIsTarget ? entry.candidateId : entry.targetId
    const partnerName = viewerIsTarget ? entry.candidateName : entry.targetName
    const partnerPhone = viewerIsTarget ? entry.candidatePhone : entry.targetPhone
    const partnerGender = viewerIsTarget ? entry.candidateGender : entry.targetGender

    return {
      viewerIsTarget,
      partnerId: partnerId || '',
      partnerName: partnerName || '',
      partnerPhone: partnerPhone || '',
      partnerPhoneMasked: require('../utils/formatters').maskPhoneNumber(partnerPhone),
      partnerGender: partnerGender || '',
    }
  }

  /**
   * 주차 키 생성 (private)
   * @private
   */
  _buildWeekKey(week) {
    if (!week || typeof week !== 'object') return ''
    const year = Number(week.year)
    const weekNumber = Number(week.week)
    if (!Number.isFinite(year) || !Number.isFinite(weekNumber)) return ''
    return `${year}-W${String(weekNumber).padStart(2, '0')}`
  }

  /**
   * 날짜로부터 주차 정보 생성 (private)
   * @private
   */
  _getWeekInfoFromDate(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
    if (Number.isNaN(date.getTime())) return null

    // ISO 8601 주차 계산
    const tempDate = new Date(date.getTime())
    tempDate.setHours(0, 0, 0, 0)
    tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7))
    const week1 = new Date(tempDate.getFullYear(), 0, 4)
    const weekNumber = Math.ceil(((tempDate - week1) / 86400000 + 1) / 7)

    return {
      year: tempDate.getFullYear(),
      week: weekNumber,
      label: `${tempDate.getFullYear()}년 ${weekNumber}주차`,
    }
  }

  /**
   * 매칭 카드 페이로드 생성 (private)
   * @private
   */
  _buildMatchCardPayload(record) {
    if (!record) return {}
    return {
      id: record.id || '',
      name: record.name || '',
      gender: record.gender || '',
      birth: record.birth || '',
      height: record.height || '',
      job: record.job || '',
      district: record.district || '',
      mbti: record.mbti || '',
      university: record.university || '',
      salaryRange: record.salaryRange || '',
      smoking: record.smoking || '',
      religion: record.religion || '',
      profileAppeal: record.profileAppeal || '',
      aboutMe: record.aboutMe || '',
      photos: record.photos || [],
      preferredLifestyle: record.preferredLifestyle || [],
    }
  }

  /**
   * 대상 회원 페이로드 생성 (private)
   * @private
   */
  _buildMatchTargetPayload(record) {
    if (!record || typeof record !== 'object') return {}
    return {
      id: record.id || '',
      name: record.name || '',
      gender: record.gender || '',
      phoneMasked: require('../utils/formatters').maskPhoneNumber(record.phone),
    }
  }
}

module.exports = new MatchHistoryService()

