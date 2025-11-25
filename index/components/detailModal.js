import { dom } from '../dom.js'
import { state } from '../state.js'
import { showToast } from './toast.js'
import { formatDate, formatPhoneNumber, normalizeHeightValue, formatPhoneStatus } from '../utils/format.js'
import { setSelectValue, setMultiSelectValues, getMultiSelectValues, enforceMultiSelectLimit } from '../utils/forms.js'
import { renderPhotoAttachments, setAttachmentLink } from '../utils/files.js'
import { splitLocalDateTime, generateTimeSlots } from '../utils/time.js'
import { getDraftForPhone, toOptionArray } from '../utils/drafts.js'
import { requestProfileShareLink, patchConsultation } from '../services/api.js'
import { normalizeRecord } from '../utils/data.js'

let afterSubmit = () => {}
let afterCalendarUpdate = () => {}
let afterFiltersSync = () => {}
let afterRender = () => {}

export function initDetailModal({ onAfterSubmit, onAfterCalendarUpdate, onAfterFilters, onAfterRender }) {
  afterSubmit = onAfterSubmit || (() => {})
  afterCalendarUpdate = onAfterCalendarUpdate || (() => {})
  afterFiltersSync = onAfterFilters || (() => {})
  afterRender = onAfterRender || (() => {})

  dom.detailCancelBtn?.addEventListener('click', (event) => {
    event.preventDefault()
    closeDetailModal()
  })

  dom.detailModal?.addEventListener('click', (event) => {
    if (event.target === dom.detailModal) {
      closeDetailModal()
    }
  })

  dom.detailForm?.addEventListener('submit', handleDetailSubmit)
  dom.detailDateInput?.addEventListener('change', handleDetailDateChange)
  dom.detailTimeSelect?.addEventListener('change', handleDetailTimeChange)
  dom.detailClearScheduleBtn?.addEventListener('click', handleClearSchedule)
  dom.detailProfileLinkBtn?.addEventListener('click', handleDetailProfileLink)
  dom.detailProfileLinkCopyBtn?.addEventListener('click', handleDetailProfileLinkCopy)
  dom.detailProfileLinkAnchor?.addEventListener('click', handleDetailProfileLinkOpen)
  if (dom.detailValuesSelect) {
    dom.detailValuesSelect.addEventListener('change', () =>
      enforceMultiSelectLimit(dom.detailValuesSelect, 1, state.detailValuesSelection),
    )
  }
  dom.detailDraftLoadBtn?.addEventListener('click', () => {
    if (!state.currentDraftData) {
      showToast('불러올 임시 데이터가 없습니다.')
      return
    }
    applyDraftToDetailForm(state.currentDraftData)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.detailModal && !dom.detailModal.hidden) {
      closeDetailModal()
    }
  })

  if (dom.detailBirthInput) {
    dom.detailBirthInput.addEventListener('input', () => {
      dom.detailBirthInput.value = dom.detailBirthInput.value.replace(/[^0-9년]/g, '')
    })
  }
  if (dom.detailPhoneInput) {
    dom.detailPhoneInput.addEventListener('input', () => {
      let v = dom.detailPhoneInput.value.replace(/[^0-9]/g, '')
      if (v.length < 4) {
        dom.detailPhoneInput.value = v
        return
      }
      if (v.length < 8) {
        dom.detailPhoneInput.value = v.replace(/(\d{3})(\d+)/, '$1-$2')
        return
      }
      dom.detailPhoneInput.value = v.replace(/(\d{3})(\d{3,4})(\d{0,4}).*/, '$1-$2-$3')
    })
  }
  if (dom.detailHeightInput) {
    const formatDetailHeight = () => {
      const digits = dom.detailHeightInput.value.replace(/[^0-9]/g, '').slice(0, 3)
      if (!digits) {
        dom.detailHeightInput.value = ''
        return
      }
      const formatted = `${digits}cm`
      dom.detailHeightInput.value = formatted
      if (document.activeElement === dom.detailHeightInput) {
        const caretPos = digits.length
        requestAnimationFrame(() => {
          dom.detailHeightInput.setSelectionRange(caretPos, caretPos)
        })
      }
    }
    dom.detailHeightInput.addEventListener('focus', () => {
      const digits = dom.detailHeightInput.value.replace(/[^0-9]/g, '').slice(0, 3)
      dom.detailHeightInput.value = digits
      requestAnimationFrame(() => {
        const pos = dom.detailHeightInput.value.length
        dom.detailHeightInput.setSelectionRange(pos, pos)
      })
    })
    dom.detailHeightInput.addEventListener('input', formatDetailHeight)
    dom.detailHeightInput.addEventListener('blur', formatDetailHeight)
  }
}

function hideProfileLinkResult() {
  if (dom.detailProfileLinkResult) dom.detailProfileLinkResult.hidden = true
  if (dom.detailProfileLinkAnchor) {
    dom.detailProfileLinkAnchor.removeAttribute('href')
    dom.detailProfileLinkAnchor.textContent = '링크 열기'
  }
  if (dom.detailProfileLinkStatus) dom.detailProfileLinkStatus.textContent = ''
  if (dom.detailProfileLinkCopyBtn) {
    dom.detailProfileLinkCopyBtn.dataset.shareLink = ''
    dom.detailProfileLinkCopyBtn.disabled = false
  }
}

function resolveShareUrl(link) {
  if (!link) return ''
  try {
    const url = new URL(link, window.location.href).toString()
    console.info('[share:url:resolved]', { input: link, resolved: url })
    return url
  } catch (error) {
    console.warn('[share:url:resolve]', error)
    return link
  }
}

function showProfileLinkResult(link, statusText) {
  if (!dom.detailProfileLinkResult || !dom.detailProfileLinkAnchor || !dom.detailProfileLinkStatus) return
  const resolvedLink = resolveShareUrl(link)
  dom.detailProfileLinkAnchor.href = resolvedLink || '#'
  dom.detailProfileLinkAnchor.textContent = resolvedLink || '링크 열기'
  dom.detailProfileLinkAnchor.dataset.shareLink = resolvedLink
  dom.detailProfileLinkStatus.textContent = statusText || ''
  dom.detailProfileLinkResult.hidden = false
  if (dom.detailProfileLinkCopyBtn) {
    dom.detailProfileLinkCopyBtn.dataset.shareLink = resolvedLink
    dom.detailProfileLinkCopyBtn.disabled = false
  }
}

function openShareLinkPrompt(link, copied = false, previewBlocked = false) {
  if (!link) return
  try {
    const messages = []
    if (copied) {
      messages.push('프로필 카드 링크가 복사되었습니다.')
    } else {
      messages.push('클립보드 복사를 지원하지 않아 수동 복사가 필요합니다.')
    }
    if (previewBlocked) {
      messages.push('팝업이 차단된 경우 직접 링크를 열어주세요.')
    }
    messages.push('아래 주소를 복사해 주세요.')
    window.prompt(messages.join('\n\n'), link)
  } catch (error) {
    console.warn('[share:prompt]', error)
  }
}

export function openDetailModal(id) {
  const record = state.items.find((item) => item.id === id)
  if (!record) {
    showToast('상세 정보를 불러오지 못했습니다.')
    return
  }

  state.detailRecordId = id
  dom.detailTitleEl.textContent = record.name || '상담 신청'
  const heightLine = record.height ? `신장 ${record.height}` : null
  const districtLine = record.district ? `거주 구 ${record.district}` : null
  const mbtiLine = record.mbti ? `MBTI ${record.mbti}` : null
  dom.detailSubtitleEl.textContent = [
    record.phone ? `연락처 ${record.phone}` : null,
    record.job ? `직업 ${record.job}` : null,
    mbtiLine,
    heightLine,
    districtLine,
    record.createdAt ? `신청 ${formatDate(record.createdAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const status = record.phoneConsultStatus
  dom.detailPhoneStatusEl.value = status

  if (dom.detailNameInput) dom.detailNameInput.value = record.name || ''
  if (dom.detailPhoneInput) dom.detailPhoneInput.value = formatPhoneNumber(record.phone)
  setSelectValue(dom.detailGenderSelect, record.gender || '')
  if (dom.detailBirthInput) dom.detailBirthInput.value = record.birth || ''
  if (dom.detailHeightInput) dom.detailHeightInput.value = normalizeHeightValue(record.height || record.region)
  setSelectValue(dom.detailEducationSelect, record.education || '')
  if (dom.detailJobInput) dom.detailJobInput.value = record.job || ''
  if (dom.detailDistrictInput) dom.detailDistrictInput.value = record.district || ''
  if (dom.detailMbtiInput) dom.detailMbtiInput.value = record.mbti || ''
  if (dom.detailUniversityInput) dom.detailUniversityInput.value = record.university || ''
  setSelectValue(dom.detailSalaryRangeSelect, record.salaryRange || '')
  if (dom.detailJobDetailInput) dom.detailJobDetailInput.value = record.jobDetail || ''
  if (dom.detailProfileAppealInput) dom.detailProfileAppealInput.value = record.profileAppeal || ''
  setSelectValue(dom.detailSmokingSelect, record.smoking || '')
  setSelectValue(dom.detailReligionSelect, record.religion || '')
  setSelectValue(dom.detailLongDistanceSelect, record.longDistance || '')
  setSelectValue(dom.detailDinkSelect, record.dink || '')
  if (dom.detailLastRelationshipInput) dom.detailLastRelationshipInput.value = record.lastRelationship || ''
  setSelectValue(dom.detailMarriageTimingSelect, record.marriageTiming || '')
  setSelectValue(dom.detailRelationshipCountSelect, record.relationshipCount || '')
  setSelectValue(dom.detailCarOwnershipSelect, record.carOwnership || '')
  setSelectValue(dom.detailTattooSelect, record.tattoo || '')
  setSelectValue(dom.detailDivorceStatusSelect, record.divorceStatus || '')
  setMultiSelectValues(dom.detailPreferredHeightsSelect, record.preferredHeights || [])
  setMultiSelectValues(dom.detailPreferredAgesSelect, record.preferredAges || [])
  state.detailValuesSelection = Array.isArray(record.values) ? record.values.slice(0, 1) : []
  setMultiSelectValues(dom.detailValuesSelect, state.detailValuesSelection)
  if (dom.detailValuesCustomInput) dom.detailValuesCustomInput.value = record.valuesCustom || ''
  if (dom.detailSufficientConditionInput) dom.detailSufficientConditionInput.value = record.sufficientCondition || ''
  if (dom.detailNecessaryConditionInput) dom.detailNecessaryConditionInput.value = record.necessaryCondition || ''
  if (dom.detailLikesDislikesInput) dom.detailLikesDislikesInput.value = record.likesDislikes || ''
  if (dom.detailAboutMeInput) dom.detailAboutMeInput.value = record.aboutMe || ''
  if (dom.detailNotesInput) dom.detailNotesInput.value = record.notes || ''

  const { date: scheduledDate, time: scheduledTime } = splitLocalDateTime(record.meetingSchedule)
  dom.detailDateInput.value = scheduledDate
  updateTimeOptions(scheduledDate, scheduledTime, id)
  dom.detailScheduleInfo.textContent = record.meetingSchedule
    ? `현재 예약: ${formatDate(record.meetingSchedule)}`
    : '대면 상담 일정이 아직 없습니다.'

  state.currentDraftData = getDraftForPhone(record.phone)
  if (dom.detailDraftLoadBtn) {
    if (state.currentDraftData) {
      dom.detailDraftLoadBtn.hidden = false
      const savedAt = state.currentDraftData.savedAt
      dom.detailDraftLoadBtn.title = savedAt ? `저장 시각: ${new Date(savedAt).toLocaleString('ko-KR')}` : ''
    } else {
      dom.detailDraftLoadBtn.hidden = true
      dom.detailDraftLoadBtn.title = ''
    }
  }

  updateDetailAttachments(record)

  dom.detailModal.hidden = false
  document.body.classList.add('modal-open')
  if (dom.detailForm) dom.detailForm.scrollTop = 0
}

export function closeDetailModal() {
  dom.detailModal.hidden = true
  document.body.classList.remove('modal-open')
  if (dom.detailForm) dom.detailForm.scrollTop = 0
  state.detailRecordId = null
  state.currentDraftData = null
  hideProfileLinkResult()
  dom.detailForm?.reset()
  if (dom.detailTimeSelect) {
    dom.detailTimeSelect.innerHTML = '<option value="">시간 선택</option>'
    dom.detailTimeSelect.disabled = true
  }
  if (dom.detailScheduleInfo) dom.detailScheduleInfo.textContent = ''
  if (dom.detailHeightInput) dom.detailHeightInput.value = ''
  if (dom.detailPhoneInput) dom.detailPhoneInput.value = ''
  if (dom.detailMbtiInput) dom.detailMbtiInput.value = ''
  if (dom.detailUniversityInput) dom.detailUniversityInput.value = ''
  setSelectValue(dom.detailSalaryRangeSelect, '')
  if (dom.detailJobDetailInput) dom.detailJobDetailInput.value = ''
  if (dom.detailProfileAppealInput) dom.detailProfileAppealInput.value = ''
  setSelectValue(dom.detailSmokingSelect, '')
  setSelectValue(dom.detailReligionSelect, '')
  setSelectValue(dom.detailLongDistanceSelect, '')
  setSelectValue(dom.detailDinkSelect, '')
  if (dom.detailLastRelationshipInput) dom.detailLastRelationshipInput.value = ''
  setSelectValue(dom.detailMarriageTimingSelect, '')
  setSelectValue(dom.detailRelationshipCountSelect, '')
  setSelectValue(dom.detailCarOwnershipSelect, '')
  setSelectValue(dom.detailTattooSelect, '')
  setSelectValue(dom.detailDivorceStatusSelect, '')
  setMultiSelectValues(dom.detailPreferredHeightsSelect, [])
  setMultiSelectValues(dom.detailPreferredAgesSelect, [])
  setMultiSelectValues(dom.detailValuesSelect, [])
  state.detailValuesSelection = []
  if (dom.detailValuesCustomInput) dom.detailValuesCustomInput.value = ''
  if (dom.detailSufficientConditionInput) dom.detailSufficientConditionInput.value = ''
  if (dom.detailNecessaryConditionInput) dom.detailNecessaryConditionInput.value = ''
  if (dom.detailLikesDislikesInput) dom.detailLikesDislikesInput.value = ''
  if (dom.detailAboutMeInput) dom.detailAboutMeInput.value = ''
  if (dom.detailAttachmentsSection) dom.detailAttachmentsSection.hidden = true
  if (dom.detailIdCardItem) dom.detailIdCardItem.hidden = true
  if (dom.detailEmploymentItem) dom.detailEmploymentItem.hidden = true
  if (dom.detailPhotosItem) dom.detailPhotosItem.hidden = true
  if (dom.detailPhotosGrid) dom.detailPhotosGrid.innerHTML = ''
  if (dom.detailDraftLoadBtn) {
    dom.detailDraftLoadBtn.hidden = true
    dom.detailDraftLoadBtn.title = ''
  }
}

function updateDetailAttachments(record) {
  if (!dom.detailAttachmentsSection) return
  const documents = record?.documents || {}
  const photos = Array.isArray(record?.photos) ? record.photos : []

  const hasIdCard = setAttachmentLink(dom.detailIdCardLink, documents.idCard, '신분증')
  if (dom.detailIdCardItem) dom.detailIdCardItem.hidden = !hasIdCard

  const hasEmployment = setAttachmentLink(dom.detailEmploymentLink, documents.employmentProof, '재직 증빙')
  if (dom.detailEmploymentItem) dom.detailEmploymentItem.hidden = !hasEmployment

  const photoCount = renderPhotoAttachments(dom.detailPhotosGrid, photos)
  if (dom.detailPhotosItem) dom.detailPhotosItem.hidden = photoCount === 0

  const hasAny = hasIdCard || hasEmployment || photoCount > 0
  dom.detailAttachmentsSection.hidden = !hasAny
}

function handleDetailDateChange() {
  const dateValue = dom.detailDateInput.value
  updateTimeOptions(dateValue, '', state.detailRecordId)
  handleDetailTimeChange()
}

function handleDetailTimeChange() {
  const dateValue = dom.detailDateInput.value
  const timeValue = dom.detailTimeSelect.value
  if (dateValue && timeValue) {
    dom.detailScheduleInfo.textContent = `선택한 일정: ${dateValue} ${timeValue}`
  } else if (dateValue && !timeValue) {
    dom.detailScheduleInfo.textContent = '상담 시간을 선택해 주세요.'
  }
}

function handleClearSchedule(event) {
  event.preventDefault()
  dom.detailDateInput.value = ''
  updateTimeOptions('', '', state.detailRecordId)
  dom.detailScheduleInfo.textContent = '대면 상담 일정이 아직 없습니다.'
}

function getReservedTimes(dateValue, currentId) {
  const reserved = new Set()
  if (!dateValue) return reserved
  state.items.forEach((item) => {
    if (!item.meetingSchedule || item.id === currentId) return
    const { date, time } = splitLocalDateTime(item.meetingSchedule)
    if (date === dateValue && time) {
      reserved.add(time)
    }
  })
  return reserved
}

function updateTimeOptions(dateValue, selectedTime, currentId) {
  if (!dom.detailTimeSelect) return
  dom.detailTimeSelect.innerHTML = '<option value="">시간 선택</option>'
  if (!dateValue) {
    dom.detailTimeSelect.disabled = true
    if (dom.detailScheduleInfo) dom.detailScheduleInfo.textContent = '대면 상담 일정이 아직 없습니다.'
    return
  }
  const reserved = getReservedTimes(dateValue, currentId)
  let hasAvailable = false
  generateTimeSlots().forEach((slot) => {
    const option = document.createElement('option')
    option.value = slot
    option.textContent = slot
    if (reserved.has(slot) && slot !== selectedTime) {
      option.disabled = true
      option.textContent = `${slot} (예약됨)`
    } else {
      hasAvailable = true
    }
    dom.detailTimeSelect.appendChild(option)
  })
  dom.detailTimeSelect.disabled = false
  dom.detailTimeSelect.value = selectedTime || ''
  if (!hasAvailable && !selectedTime) {
    dom.detailScheduleInfo.textContent = '선택한 날짜에는 예약 가능한 시간이 없습니다.'
  } else if (!selectedTime) {
    dom.detailScheduleInfo.textContent = '예약된 시간은 자동으로 비활성화됩니다.'
  }
}

async function handleDetailProfileLink() {
  hideProfileLinkResult()
  if (!state.detailRecordId) {
    showToast('먼저 상세 정보를 열어주세요.')
    return
  }
  const record = state.items.find((item) => item.id === state.detailRecordId)
  if (!record) {
    showToast('프로필 정보를 찾지 못했습니다.')
    return
  }
  if (!dom.detailProfileLinkBtn) return
  dom.detailProfileLinkBtn.disabled = true
  try {
    const share = await requestProfileShareLink(state.detailRecordId)
    const shareUrlRaw = share?.shareUrl || ''
    if (!shareUrlRaw) {
      throw new Error('프로필 카드 링크를 생성하지 못했습니다.')
    }
    const shareUrl = resolveShareUrl(shareUrlRaw)
    if (!shareUrl) {
      throw new Error('프로필 카드 링크 주소를 확인하지 못했습니다.')
    }
    const previewWindow = window.open(shareUrl, '_blank', 'noopener,noreferrer')
    const copied = await tryCopyToClipboard(shareUrl)
    if (!copied || !previewWindow) {
      openShareLinkPrompt(shareUrl, copied, !previewWindow)
    }
    const previewMessage = previewWindow
      ? '새 탭에서 프로필 카드를 열었습니다.'
      : '팝업이 차단되어 브라우저에서 새 탭을 열지 못했습니다.'
    const copyMessage = copied ? '클립보드에 링크를 복사했습니다.' : '복사가 필요해 안내창을 표시했습니다.'
    showToast(`프로필 카드 링크를 준비했습니다. ${previewMessage} ${copyMessage}`)
    showProfileLinkResult(shareUrl, `${previewMessage} ${copied ? '복사 완료' : '복사 필요'}`)
  } catch (error) {
    console.error('[share:profile-link]', error)
    showToast(error?.message || '프로필 카드 링크를 생성하지 못했습니다.')
    hideProfileLinkResult()
  } finally {
    dom.detailProfileLinkBtn.disabled = false
  }
}

async function tryCopyToClipboard(text) {
  if (!text || !navigator?.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.warn('[share:clipboard]', error)
    return false
  }
}

async function handleDetailProfileLinkCopy() {
  const linkRaw =
    dom.detailProfileLinkCopyBtn?.dataset?.shareLink || dom.detailProfileLinkAnchor?.href || ''
  const link = resolveShareUrl(linkRaw)
  if (!link) {
    showToast('먼저 프로필 카드 링크를 생성해주세요.')
    return
  }
  if (!navigator?.clipboard?.writeText) {
    openShareLinkPrompt(link, false, false)
    return
  }
  try {
    dom.detailProfileLinkCopyBtn.disabled = true
    await navigator.clipboard.writeText(link)
    showToast('프로필 카드 링크를 복사했습니다.')
    dom.detailProfileLinkCopyBtn.disabled = false
  } catch (error) {
    console.warn('[share:copy:manual]', error)
    dom.detailProfileLinkCopyBtn.disabled = false
    openShareLinkPrompt(link, false, false)
  }
}

function handleDetailProfileLinkOpen(event) {
  const linkRaw =
    dom.detailProfileLinkAnchor?.dataset?.shareLink || dom.detailProfileLinkAnchor?.href || ''
  const link = resolveShareUrl(linkRaw)
  if (!link) {
    showToast('먼저 프로필 카드 링크를 생성해주세요.')
    return
  }
  if (event) {
    event.preventDefault()
  }
  const opened = window.open(link, '_blank', 'noopener,noreferrer')
  if (!opened) {
    openShareLinkPrompt(link, false, true)
  }
}

function applyDraftToDetailForm(draft) {
  if (!draft || typeof draft !== 'object') return
  if (dom.detailPhoneInput && draft.phone) dom.detailPhoneInput.value = formatPhoneNumber(draft.phone)
  if (dom.detailMbtiInput && draft.mbti !== undefined) dom.detailMbtiInput.value = draft.mbti || ''
  if (dom.detailJobInput && draft.job !== undefined) dom.detailJobInput.value = draft.job || ''
  if (dom.detailJobDetailInput && draft.jobDetail !== undefined) dom.detailJobDetailInput.value = draft.jobDetail || ''
  if (dom.detailUniversityInput && draft.university !== undefined) dom.detailUniversityInput.value = draft.university || ''
  if (dom.detailSalaryRangeSelect && draft.salaryRange !== undefined)
    setSelectValue(dom.detailSalaryRangeSelect, draft.salaryRange || '')
  if (dom.detailSmokingSelect && draft.smoking !== undefined) setSelectValue(dom.detailSmokingSelect, draft.smoking || '')
  if (dom.detailReligionSelect && draft.religion !== undefined)
    setSelectValue(dom.detailReligionSelect, draft.religion || '')
  if (dom.detailLongDistanceSelect && draft.longDistance !== undefined)
    setSelectValue(dom.detailLongDistanceSelect, draft.longDistance || '')
  if (dom.detailDinkSelect && draft.dink !== undefined) setSelectValue(dom.detailDinkSelect, draft.dink || '')
  if (dom.detailLastRelationshipInput && draft.lastRelationship !== undefined)
    dom.detailLastRelationshipInput.value = draft.lastRelationship || ''
  if (dom.detailMarriageTimingSelect && draft.marriageTiming !== undefined)
    setSelectValue(dom.detailMarriageTimingSelect, draft.marriageTiming || '')
  if (dom.detailRelationshipCountSelect && draft.relationshipCount !== undefined)
    setSelectValue(dom.detailRelationshipCountSelect, draft.relationshipCount || '')
  if (dom.detailCarOwnershipSelect && draft.carOwnership !== undefined)
    setSelectValue(dom.detailCarOwnershipSelect, draft.carOwnership || '')
  if (dom.detailTattooSelect && draft.tattoo !== undefined) setSelectValue(dom.detailTattooSelect, draft.tattoo || '')
  if (dom.detailDivorceStatusSelect && draft.divorceStatus !== undefined)
    setSelectValue(dom.detailDivorceStatusSelect, draft.divorceStatus || '')
  if (dom.detailProfileAppealInput && draft.profileAppeal !== undefined)
    dom.detailProfileAppealInput.value = draft.profileAppeal || ''
  if (dom.detailLikesDislikesInput && draft.likesDislikes !== undefined)
    dom.detailLikesDislikesInput.value = draft.likesDislikes || ''
  if (dom.detailSufficientConditionInput && draft.sufficientCondition !== undefined)
    dom.detailSufficientConditionInput.value = draft.sufficientCondition || ''
  if (dom.detailNecessaryConditionInput && draft.necessaryCondition !== undefined)
    dom.detailNecessaryConditionInput.value = draft.necessaryCondition || ''
  if (dom.detailAboutMeInput && draft.aboutMe !== undefined) dom.detailAboutMeInput.value = draft.aboutMe || ''
  if (dom.detailPreferredHeightsSelect && draft.preferredHeights !== undefined)
    setMultiSelectValues(dom.detailPreferredHeightsSelect, toOptionArray(draft.preferredHeights))
  if (dom.detailPreferredAgesSelect && draft.preferredAges !== undefined)
    setMultiSelectValues(dom.detailPreferredAgesSelect, toOptionArray(draft.preferredAges))
  const draftValues = Array.isArray(draft.values) ? draft.values.slice(0, 1) : []
  if (dom.detailValuesSelect) {
    setMultiSelectValues(dom.detailValuesSelect, draftValues)
  }
  state.detailValuesSelection = draftValues
  showToast('임시 저장된 데이터를 적용했습니다.')
}

async function handleDetailSubmit(event) {
  event.preventDefault()
  if (!state.detailRecordId) {
    showToast('대상을 찾을 수 없습니다.')
    return
  }

  const phoneStatus = dom.detailPhoneStatusEl.value
  if (!phoneStatus) {
    showToast('전화 상담 상태를 선택해 주세요.')
    return
  }

  if (!dom.detailForm.reportValidity()) {
    return
  }

  const nameValue = (dom.detailNameInput?.value || '').trim()
  if (dom.detailNameInput) dom.detailNameInput.value = nameValue
  const phoneValue = formatPhoneNumber(dom.detailPhoneInput?.value)
  if (dom.detailPhoneInput) dom.detailPhoneInput.value = phoneValue
  const genderValue = dom.detailGenderSelect?.value || ''
  const birthValue = (dom.detailBirthInput?.value || '').trim()
  if (dom.detailBirthInput) dom.detailBirthInput.value = birthValue
  const educationValue = dom.detailEducationSelect?.value || ''
  const jobValue = (dom.detailJobInput?.value || '').trim()
  if (dom.detailJobInput) dom.detailJobInput.value = jobValue
  const districtValue = (dom.detailDistrictInput?.value || '').trim()
  if (dom.detailDistrictInput) dom.detailDistrictInput.value = districtValue
  const heightValue = normalizeHeightValue(dom.detailHeightInput?.value)
  if (dom.detailHeightInput) dom.detailHeightInput.value = heightValue
  const mbtiValue = (dom.detailMbtiInput?.value || '').trim()
  if (dom.detailMbtiInput) dom.detailMbtiInput.value = mbtiValue
  const universityValue = (dom.detailUniversityInput?.value || '').trim()
  if (dom.detailUniversityInput) dom.detailUniversityInput.value = universityValue
  const salaryRangeValue = dom.detailSalaryRangeSelect?.value || ''
  setSelectValue(dom.detailSalaryRangeSelect, salaryRangeValue)
  const jobDetailValue = (dom.detailJobDetailInput?.value || '').trim()
  if (dom.detailJobDetailInput) dom.detailJobDetailInput.value = jobDetailValue
  const profileAppealValue = (dom.detailProfileAppealInput?.value || '').trim()
  if (dom.detailProfileAppealInput) dom.detailProfileAppealInput.value = profileAppealValue
  const smokingValue = dom.detailSmokingSelect?.value || ''
  setSelectValue(dom.detailSmokingSelect, smokingValue)
  const religionValue = dom.detailReligionSelect?.value || ''
  setSelectValue(dom.detailReligionSelect, religionValue)
  const longDistanceValue = dom.detailLongDistanceSelect?.value || ''
  setSelectValue(dom.detailLongDistanceSelect, longDistanceValue)
  const dinkValue = dom.detailDinkSelect?.value || ''
  setSelectValue(dom.detailDinkSelect, dinkValue)
  const lastRelationshipValue = (dom.detailLastRelationshipInput?.value || '').trim()
  if (dom.detailLastRelationshipInput) dom.detailLastRelationshipInput.value = lastRelationshipValue
  const marriageTimingValue = dom.detailMarriageTimingSelect?.value || ''
  setSelectValue(dom.detailMarriageTimingSelect, marriageTimingValue)
  const relationshipCountValue = dom.detailRelationshipCountSelect?.value || ''
  setSelectValue(dom.detailRelationshipCountSelect, relationshipCountValue)
  const carOwnershipValue = dom.detailCarOwnershipSelect?.value || ''
  setSelectValue(dom.detailCarOwnershipSelect, carOwnershipValue)
  const tattooValue = dom.detailTattooSelect?.value || ''
  setSelectValue(dom.detailTattooSelect, tattooValue)
  const divorceStatusValue = dom.detailDivorceStatusSelect?.value || ''
  setSelectValue(dom.detailDivorceStatusSelect, divorceStatusValue)
  const preferredHeights = getMultiSelectValues(dom.detailPreferredHeightsSelect)
  const preferredAges = getMultiSelectValues(dom.detailPreferredAgesSelect)
  const valuesSelected = getMultiSelectValues(dom.detailValuesSelect).slice(0, 1)
  if (valuesSelected.length > 1) {
    showToast('가치관은 한 개만 선택할 수 있습니다.')
    return
  }
  state.detailValuesSelection = valuesSelected
  const valuesCustomValue = (dom.detailValuesCustomInput?.value || '').trim()
  if (dom.detailValuesCustomInput) dom.detailValuesCustomInput.value = valuesCustomValue
  const sufficientConditionValue = (dom.detailSufficientConditionInput?.value || '').trim()
  if (dom.detailSufficientConditionInput) dom.detailSufficientConditionInput.value = sufficientConditionValue
  const necessaryConditionValue = (dom.detailNecessaryConditionInput?.value || '').trim()
  if (dom.detailNecessaryConditionInput) dom.detailNecessaryConditionInput.value = necessaryConditionValue
  const likesDislikesValue = (dom.detailLikesDislikesInput?.value || '').trim()
  if (dom.detailLikesDislikesInput) dom.detailLikesDislikesInput.value = likesDislikesValue
  const aboutMeValue = (dom.detailAboutMeInput?.value || '').trim()
  if (dom.detailAboutMeInput) dom.detailAboutMeInput.value = aboutMeValue

  const dateValue = dom.detailDateInput.value
  const timeValue = dom.detailTimeSelect.disabled ? '' : dom.detailTimeSelect.value

  if (dateValue && !timeValue) {
    showToast('상담 시간을 선택해 주세요.')
    return
  }
  if (!dateValue && timeValue) {
    showToast('상담 날짜를 선택해 주세요.')
    return
  }

  let meetingSchedule = ''
  if (dateValue && timeValue) {
    const date = new Date(`${dateValue}T${timeValue}`)
    if (Number.isNaN(date.getTime())) {
      showToast('유효한 상담 일정을 선택해 주세요.')
      return
    }
    meetingSchedule = date.toISOString()
  }

  const payload = {
    name: nameValue,
    gender: genderValue,
    phone: phoneValue,
    birth: birthValue,
    education: educationValue,
    job: jobValue,
    height: heightValue,
    district: districtValue,
    mbti: mbtiValue,
    university: universityValue,
    salaryRange: salaryRangeValue,
    jobDetail: jobDetailValue,
    profileAppeal: profileAppealValue,
    smoking: smokingValue,
    religion: religionValue,
    longDistance: longDistanceValue,
    dink: dinkValue,
    lastRelationship: lastRelationshipValue,
    marriageTiming: marriageTimingValue,
    relationshipCount: relationshipCountValue,
    carOwnership: carOwnershipValue,
    tattoo: tattooValue,
    divorceStatus: divorceStatusValue,
    preferredHeights,
    preferredAges,
    sufficientCondition: sufficientConditionValue,
    necessaryCondition: necessaryConditionValue,
    likesDislikes: likesDislikesValue,
    values: valuesSelected,
    valuesCustom: valuesCustomValue,
    aboutMe: aboutMeValue,
    phoneConsultStatus: phoneStatus,
    meetingSchedule,
    notes: dom.detailNotesInput.value?.trim() || '',
  }
  const existingRecord = state.items.find((item) => item.id === state.detailRecordId) || {}
  payload.documents = existingRecord.documents || {}
  payload.photos = existingRecord.photos || []

  state.suppressUpdateToast = true
  try {
    const updated = normalizeRecord(await patchConsultation(state.detailRecordId, payload))
    if (updated?.id) {
      const index = state.items.findIndex((item) => item.id === updated.id)
      if (index !== -1) {
        state.items[index] = updated
      } else {
        state.items.push(updated)
      }
    }
    afterFiltersSync()
    afterRender()
    afterCalendarUpdate()
    afterSubmit()
    showToast('상세 정보를 저장했습니다.')
    closeDetailModal()
  } catch (error) {
    state.suppressUpdateToast = false
    console.error(error)
    showToast(error.message || '상세 정보를 저장하지 못했습니다.')
  } finally {
    setTimeout(() => {
      state.suppressUpdateToast = false
    }, 1000)
  }
}

