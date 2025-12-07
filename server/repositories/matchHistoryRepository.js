const fs = require('fs/promises')
const { DATA_DIR, MATCH_HISTORY_FILE, MATCH_HISTORY_LIMIT } = require('../config/constants')
const { MatchHistory } = require('../models/MatchHistory')

class MatchHistoryRepository {
  /**
   * 모든 매칭 기록 조회
   * @returns {Promise<MatchHistory[]>}
   */
  async findAll() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true })
      const raw = await fs.readFile(MATCH_HISTORY_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      
      if (!Array.isArray(parsed)) {
        return []
      }
      
      return parsed
        .map(data => {
          const match = new MatchHistory(data)
          return match.isValid() ? match : null
        })
        .filter(Boolean)
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.writeFile(MATCH_HISTORY_FILE, '[]', 'utf-8')
        return []
      }
      throw error
    }
  }

  /**
   * 전체 매칭 기록 저장
   * @param {MatchHistory[]} data 
   */
  async saveAll(data) {
    const matches = Array.isArray(data)
      ? data.map(item => item instanceof MatchHistory ? item : new MatchHistory(item))
      : []
    
    const valid = matches.filter(m => m.isValid())
    const limited = valid.slice(0, MATCH_HISTORY_LIMIT)
    const jsonData = limited.map(m => m.toJSON())
    
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(MATCH_HISTORY_FILE, JSON.stringify(jsonData, null, 2), 'utf-8')
  }

  /**
   * ID로 매칭 기록 조회
   * @param {string} id 
   * @returns {Promise<MatchHistory|null>}
   */
  async findById(id) {
    const list = await this.findAll()
    return list.find((item) => item.id === id) || null
  }

  /**
   * 특정 회원의 매칭 기록 조회
   * @param {string} targetId 
   * @returns {Promise<MatchHistory[]>}
   */
  async findByTargetId(targetId) {
    const list = await this.findAll()
    return list.filter((item) => item.targetId === targetId)
  }

  /**
   * 전화번호로 매칭 기록 조회
   * @param {string} phone 
   * @returns {Promise<MatchHistory[]>}
   */
  async findByTargetPhone(phone) {
    const { normalizePhoneNumber } = require('../utils/sanitizers')
    const phoneKey = normalizePhoneNumber(phone)
    const list = await this.findAll()
    return list.filter((item) => normalizePhoneNumber(item.targetPhone) === phoneKey)
  }
}

module.exports = new MatchHistoryRepository()

