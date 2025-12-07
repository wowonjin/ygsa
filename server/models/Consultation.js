/**
 * 상담 신청 데이터 모델
 * 
 * consultations.json에 저장되는 회원 정보의 스키마를 정의합니다.
 */

class Consultation {
  constructor(data = {}) {
    // 기본 정보
    this.id = data.id || ''
    this.name = data.name || ''
    this.gender = data.gender || ''
    this.phone = data.phone || ''
    this.birth = data.birth || ''
    this.height = data.height || ''
    this.job = data.job || ''
    this.district = data.district || ''
    this.education = data.education || ''
    this.referralSource = data.referralSource || ''
    
    // 폼 타입
    this.formType = data.formType || 'consult' // 'consult' | 'moim'
    
    // 상담 상태
    this.phoneConsultStatus = data.phoneConsultStatus || 'pending' // 'pending' | 'scheduled' | 'done'
    this.meetingSchedule = data.meetingSchedule || ''
    this.depositStatus = data.depositStatus || 'pending' // 'pending' | 'completed'
    this.status = data.status || 'new'
    
    // 프로필 상세
    this.mbti = data.mbti || ''
    this.university = data.university || ''
    this.salaryRange = data.salaryRange || ''
    this.jobDetail = data.jobDetail || ''
    this.profileAppeal = data.profileAppeal || ''
    this.smoking = data.smoking || ''
    this.religion = data.religion || ''
    this.longDistance = data.longDistance || ''
    this.dink = data.dink || ''
    this.lastRelationship = data.lastRelationship || ''
    this.marriageTiming = data.marriageTiming || ''
    this.relationshipCount = data.relationshipCount || ''
    this.carOwnership = data.carOwnership || ''
    this.tattoo = data.tattoo || ''
    this.divorceStatus = data.divorceStatus || ''
    this.sufficientCondition = data.sufficientCondition || ''
    this.necessaryCondition = data.necessaryCondition || ''
    this.likesDislikes = data.likesDislikes || ''
    this.valuesCustom = data.valuesCustom || ''
    this.aboutMe = data.aboutMe || ''
    
    // 모임 관련 (formType === 'moim')
    this.workStyle = data.workStyle || ''
    this.relationshipStatus = data.relationshipStatus || ''
    this.participationGoal = data.participationGoal || ''
    this.socialEnergy = data.socialEnergy || ''
    this.weekendPreference = data.weekendPreference || ''
    
    // 선호 조건
    this.preferredHeights = data.preferredHeights || []
    this.preferredAges = data.preferredAges || []
    this.preferredLifestyle = data.preferredLifestyle || []
    this.preferredAppearance = data.preferredAppearance || ''
    this.values = data.values || []
    
    // 결제 정보
    this.membershipType = data.membershipType || ''
    this.paymentAmount = data.paymentAmount || ''
    this.paymentDate = data.paymentDate || ''
    this.paymentHistory = data.paymentHistory || []
    
    // 동의 정보
    this.agreements = data.agreements || {
      info: false,
      manners: false,
      refund: false,
    }
    
    // 증빙 자료
    this.documents = data.documents || {}
    this.photos = data.photos || []
    
    // 매칭 후기
    this.matchReviews = data.matchReviews || []
    
    // 프로필 공유
    this.profileShare = data.profileShare || null
    
    // 관리자 메모
    this.notes = data.notes || ''
    
    // 타임스탬프
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || new Date().toISOString()
  }
  
  /**
   * 필수 필드가 모두 입력되었는지 검증
   */
  isValid() {
    const required = ['name', 'gender', 'phone', 'birth', 'height', 'job', 'district', 'education']
    return required.every(field => this[field] && this[field].trim())
  }
  
  /**
   * JSON 직렬화
   */
  toJSON() {
    return { ...this }
  }
}

module.exports = Consultation

