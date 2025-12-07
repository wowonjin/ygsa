const { nanoid } = require('nanoid')
const consultationRepository = require('../repositories/consultationRepository')
const { broadcast } = require('../utils/broadcast')
const notificationService = require('./notificationService')
const Consultation = require('../models/Consultation')

class ConsultationService {
  /**
   * 모든 상담 기록 조회
   * @returns {Promise<Consultation[]>}
   */
  async getAll() {
    return await consultationRepository.findAll()
  }

  /**
   * 새 상담 기록 생성
   * @param {Object} body 
   * @returns {Promise<Consultation>}
   */
  async create(body) {
    // 모델 인스턴스 생성
    const consultation = new Consultation({
      id: nanoid(),
      ...body,
      depositStatus: body.depositStatus || 'pending',
      phoneConsultStatus: body.phoneConsultStatus || 'pending',
      meetingSchedule: '',
      status: 'new',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // 유효성 검증
    if (!consultation.isValid()) {
      const error = new Error('필수 정보가 누락되었습니다.')
      error.statusCode = 400
      throw error
    }

    const list = await consultationRepository.findAll()
    list.push(consultation)
    await consultationRepository.saveAll(list)
    
    broadcast({ type: 'consult:new', payload: consultation.toJSON() })
    notificationService.triggerNotifications(consultation.toJSON()).catch((error) =>
      console.error('[notify] 전송 실패', error),
    )
    
    return consultation
  }

  /**
   * 상담 기록 수정
   * @param {string} id 
   * @param {Object} updates 
   * @returns {Promise<Consultation>}
   */
  async update(id, updates) {
    const consultation = await consultationRepository.findById(id)
    if (!consultation) {
      const error = new Error('대상을 찾을 수 없습니다.')
      error.statusCode = 404
      throw error
    }

    // 업데이트된 모델 인스턴스 생성
    const updated = new Consultation({
      ...consultation.toJSON(),
      ...updates,
      updatedAt: new Date().toISOString(),
    })

    const list = await consultationRepository.findAll()
    const index = list.findIndex((item) => item.id === id)
    list[index] = updated
    
    await consultationRepository.saveAll(list)
    broadcast({ type: 'consult:update', payload: updated.toJSON() })
    
    return updated
  }

  /**
   * 여러 상담 기록 삭제
   * @param {string[]} ids 
   */
  async deleteMany(ids) {
    const list = await consultationRepository.findAll()
    const filtered = list.filter((item) => !ids.includes(item.id))
    await consultationRepository.saveAll(filtered)
    broadcast({ type: 'consult:delete', payload: { ids } })
  }

  /**
   * 프로필 초안 조회
   * @param {string} phoneKey 
   * @returns {Promise<Consultation>}
   */
  async getProfileDraft(phoneKey) {
    const consultation = await consultationRepository.findByPhone(phoneKey)
    if (!consultation) {
      const error = new Error('제출된 프로필을 찾을 수 없습니다.')
      error.statusCode = 404
      throw error
    }
    // Consultation 모델 그대로 반환 (toJSON()으로 직렬화됨)
    return consultation.toJSON()
  }

  /**
   * 프로필 업데이트 (복잡한 로직은 기존 server.js 재사용)
   * @param {Object} body 
   * @returns {Promise<{record: Consultation, created: boolean}>}
   */
  async updateProfile(body) {
    // TODO: 복잡한 로직이므로 나중에 완전히 리팩토링
    // 현재는 기본 구현만
    const { normalizePhoneNumber } = require('../utils/sanitizers')
    const phone = normalizePhoneNumber(body?.phone)
    
    if (!phone) {
      const error = new Error('연락처를 확인할 수 없습니다.')
      error.statusCode = 400
      throw error
    }

    let consultation = await consultationRepository.findByPhone(phone)
    let created = false

    if (!consultation) {
      // 새 프로필 생성
      consultation = new Consultation({
        id: nanoid(),
        ...body,
        phone,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      created = true
    } else {
      // 기존 프로필 업데이트
      consultation = new Consultation({
        ...consultation.toJSON(),
        ...body,
        phone,
        updatedAt: new Date().toISOString(),
      })
    }

    const list = await consultationRepository.findAll()
    if (created) {
      list.push(consultation)
    } else {
      const index = list.findIndex(item => normalizePhoneNumber(item.phone) === phone)
      if (index !== -1) {
        list[index] = consultation
      }
    }

    await consultationRepository.saveAll(list)
    broadcast({
      type: created ? 'consult:new' : 'consult:update',
      payload: consultation.toJSON(),
    })

    return { record: consultation, created }
  }

  /**
   * 프로필 공유 링크 생성 (복잡한 로직은 나중에)
   * @param {string} id 
   * @param {Object} req 
   * @returns {Promise<Object>}
   */
  async createProfileLink(id, req) {
    // TODO: ensureProfileShare, buildProfileShareUrl 구현 필요
    const error = new Error('아직 구현되지 않았습니다. 기존 server.js를 사용하세요.')
    error.statusCode = 501
    throw error
  }
}

module.exports = new ConsultationService()

