/**
 * 매칭 기록 데이터 모델
 * 
 * match-history.json에 저장되는 매칭 정보의 스키마를 정의합니다.
 */

class MatchHistory {
  constructor(data = {}) {
    // 고유 식별자
    this.id = data.id || ''
    
    // 매칭 참여자
    this.candidateId = data.candidateId || ''        // 추천받은 회원 ID
    this.candidateName = data.candidateName || ''
    this.candidateGender = data.candidateGender || ''
    this.candidatePhone = data.candidatePhone || ''
    
    this.targetId = data.targetId || ''              // 대상 회원 ID
    this.targetName = data.targetName || ''
    this.targetGender = data.targetGender || ''
    this.targetPhone = data.targetPhone || ''
    
    // 매칭 정보
    this.matchedAt = data.matchedAt || Date.now()
    this.week = data.week || null                    // 주차 정보 { label, year, week, startTime, endTime }
    this.category = data.category || 'intro'         // 'intro' | 'confirmed'
    
    // 상태 플래그
    this.targetSelected = data.targetSelected !== undefined ? Boolean(data.targetSelected) : false
    this.extraMatch = data.extraMatch !== undefined ? Boolean(data.extraMatch) : false
  }
  
  /**
   * 필수 필드가 모두 있는지 검증
   */
  isValid() {
    return Boolean(
      this.candidateId &&
      this.targetId &&
      this.targetPhone &&
      this.matchedAt
    )
  }
  
  /**
   * 매칭 완료 여부 확인
   */
  isConfirmed() {
    return this.category === 'confirmed'
  }
  
  /**
   * 이번주 소개인지 확인
   */
  isIntro() {
    return this.category === 'intro'
  }
  
  /**
   * 추가 매칭인지 확인 (서로 이번주 소개되지 않은 경우)
   */
  isExtraMatch() {
    return Boolean(this.extraMatch)
  }
  
  /**
   * JSON 직렬화
   */
  toJSON() {
    return {
      id: this.id,
      candidateId: this.candidateId,
      candidateName: this.candidateName,
      candidateGender: this.candidateGender,
      candidatePhone: this.candidatePhone,
      targetId: this.targetId,
      targetName: this.targetName,
      targetGender: this.targetGender,
      targetPhone: this.targetPhone,
      matchedAt: this.matchedAt,
      week: this.week,
      category: this.category,
      targetSelected: this.targetSelected,
      extraMatch: this.extraMatch,
    }
  }
}

/**
 * 주차 정보 모델
 */
class WeekDescriptor {
  constructor(data = {}) {
    this.label = data.label || ''
    this.year = data.year || 0
    this.week = data.week || 0
    this.startTime = data.startTime || 0
    this.endTime = data.endTime || 0
  }
  
  toJSON() {
    return { ...this }
  }
}

module.exports = {
  MatchHistory,
  WeekDescriptor,
}

