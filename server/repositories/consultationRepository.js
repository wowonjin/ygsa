const fs = require('fs/promises')
const { DATA_DIR, DATA_FILE } = require('../config/constants')
const Consultation = require('../models/Consultation')

class ConsultationRepository {
  /**
   * 모든 상담 기록 조회
   * @returns {Promise<Consultation[]>}
   */
  async findAll() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true })
      const raw = await fs.readFile(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      
      if (Array.isArray(parsed)) {
        return this._dedupeByPhone(parsed.map(data => new Consultation(data)))
      }
      if (parsed && typeof parsed === 'object') {
        return [new Consultation(parsed)]
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

  /**
   * 전체 상담 기록 저장
   * @param {Consultation[]} data 
   */
  async saveAll(data) {
    const consultations = Array.isArray(data)
      ? data.map(item => item instanceof Consultation ? item : new Consultation(item))
      : []
    
    const deduped = this._dedupeByPhone(consultations)
    const jsonData = deduped.map(c => c.toJSON())
    await fs.writeFile(DATA_FILE, JSON.stringify(jsonData, null, 2), 'utf-8')
  }

  /**
   * ID로 상담 기록 조회
   * @param {string} id 
   * @returns {Promise<Consultation|null>}
   */
  async findById(id) {
    const list = await this.findAll()
    return list.find((item) => item.id === id) || null
  }

  /**
   * 전화번호로 상담 기록 조회
   * @param {string} phone 
   * @returns {Promise<Consultation|null>}
   */
  async findByPhone(phone) {
    const list = await this.findAll()
    const { normalizePhoneNumber } = require('../utils/sanitizers')
    const phoneKey = normalizePhoneNumber(phone)
    return list.find((item) => normalizePhoneNumber(item.phone) === phoneKey) || null
  }

  /**
   * 전화번호로 중복 제거
   * @private
   */
  _dedupeByPhone(list = []) {
    const { normalizePhoneNumber } = require('../utils/sanitizers')
    const result = []
    const indexByPhone = new Map()
    
    list.forEach((consultation) => {
      if (!consultation || !(consultation instanceof Consultation)) return
      const phoneKey = normalizePhoneNumber(consultation.phone)
      
      if (!phoneKey) {
        result.push(consultation)
        return
      }
      
      const existingIndex = indexByPhone.get(phoneKey)
      if (existingIndex == null) {
        indexByPhone.set(phoneKey, result.length)
        result.push(consultation)
      } else {
        // 최신 데이터 우선
        const existing = result[existingIndex]
        const existingTime = new Date(existing.updatedAt).getTime() || 0
        const newTime = new Date(consultation.updatedAt).getTime() || 0
        if (newTime > existingTime) {
          result[existingIndex] = consultation
        }
      }
    })
    
    return result
  }
}

module.exports = new ConsultationRepository()

