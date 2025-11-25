(function () {
  const YGSA = window.YGSA
  const { dom, state, api, constants } = YGSA
  const {
    showToast,
    formatDate,
    formatPhoneNumber,
    normalizeHeightValue,
    setSelectValue,
    setMultiSelectValues,
    getMultiSelectValues,
    renderPhotoAttachments,
    setAttachmentLink,
    splitLocalDateTime,
    generateTimeSlots,
    formatPhoneStatus,
    formatSelectedDateTitle,
    formatCalendarSchedule,
    getDateKey,
    resolveShareUrl,
    tryCopyToClipboard,
  } = YGSA.utils

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
      dom.detailScheduleInfo.textContent = '대면 상담 일정이 아직 없습니다.'
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
  }

  function openDetailModal(id) {
    const record = state.items.find((item) => item.id === id)
    if (!record) {
      showToast('상세 정보를 불러오지 못했습니다.')
      return
    }
    state.detailRecordId = id
    dom.detailTitleEl.textContent = record.name || '상담 신청'
    dom.detailSubtitleEl.textContent = [
      record.phone ? `연락처 ${record.phone}` : null,
      record.job ? `직업 ${record.job}` : null,
      record.mbti ? `MBTI ${record.mbti}` : null,
      record.height ? `신장 ${record.height}` : null,
      record.district ? `거주 구 ${record.district}` : null,
      record.createdAt ? `신청 ${formatDate(record.createdAt)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    dom.detailPhoneStatusEl.value = constants.PHONE_STATUS_VALUES.includes(record.phoneConsultStatus)
      ? record.phoneConsultStatus
      : 'pending'

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

    updateDetailAttachments(record)

    dom.detailModal.hidden = false
    document.body.classList.add('modal-open')
    dom.detailForm?.scrollTo({ top: 0 })
  }

  function closeDetailModal() {
    dom.detailModal.hidden = true
    document.body.classList.remove('modal-open')
    dom.detailForm?.scrollTo({ top: 0 })
    state.detailRecordId = null
    state.currentDraftData = null
    hideProfileLinkResult()
    dom.detailForm?.reset()
    if (dom.detailTimeSelect) {
      dom.detailTimeSelect.innerHTML = '<option value="">시간 선택</option>'
      dom.detailTimeSelect.disabled = true
    }
    dom.detailScheduleInfo.textContent = ''
    dom.detailAttachmentsSection.hidden = true
  }

  async function handleDetailProfileLink() {
    hideProfileLinkResult()
    if (!state.detailRecordId) {
      showToast('먼저 상세 정보를 열어주세요.')
      return
    }
    dom.detailProfileLinkBtn.disabled = true
    try {
      const res = await fetch(`${api.consult}/${state.detailRecordId}/profile-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message || '프로필 카드 링크를 생성하지 못했습니다.')
      }
      const shareUrl = resolveShareUrl(body.data?.shareUrl)
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
    } catch (error) {
      console.warn('[share:copy:manual]', error)
      openShareLinkPrompt(link, false, false)
    } finally {
      dom.detailProfileLinkCopyBtn.disabled = false
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
    event?.preventDefault()
    const opened = window.open(link, '_blank', 'noopener,noreferrer')
    if (!opened) {
      openShareLinkPrompt(link, false, true)
    }
  }

  async function handleDetailSubmit(event) {
    event.preventDefault()
    if (!state.detailRecordId) {
      showToast('대상을 찾을 수 없습니다.')
      return
    }
    if (!dom.detailForm.reportValidity()) {
      return
    }
    const payload = {
      name: (dom.detailNameInput?.value || '').trim(),
      gender: dom.detailGenderSelect?.value || '',
      phone: formatPhoneNumber(dom.detailPhoneInput?.value),
      birth: (dom.detailBirthInput?.value || '').trim(),
      education: dom.detailEducationSelect?.value || '',
      job: (dom.detailJobInput?.value || '').trim(),
      height: normalizeHeightValue(dom.detailHeightInput?.value),
      district: (dom.detailDistrictInput?.value || '').trim(),
      mbti: (dom.detailMbtiInput?.value || '').trim(),
      university: (dom.detailUniversityInput?.value || '').trim(),
      salaryRange: dom.detailSalaryRangeSelect?.value || '',
      jobDetail: (dom.detailJobDetailInput?.value || '').trim(),
      profileAppeal: (dom.detailProfileAppealInput?.value || '').trim(),
      smoking: dom.detailSmokingSelect?.value || '',
      religion: dom.detailReligionSelect?.value || '',
      longDistance: dom.detailLongDistanceSelect?.value || '',
      dink: dom.detailDinkSelect?.value || '',
      lastRelationship: (dom.detailLastRelationshipInput?.value || '').trim(),
      marriageTiming: dom.detailMarriageTimingSelect?.value || '',
      relationshipCount: dom.detailRelationshipCountSelect?.value || '',
      carOwnership: dom.detailCarOwnershipSelect?.value || '',
      tattoo: dom.detailTattooSelect?.value || '',
      divorceStatus: dom.detailDivorceStatusSelect?.value || '',
      preferredHeights: getMultiSelectValues(dom.detailPreferredHeightsSelect),
      preferredAges: getMultiSelectValues(dom.detailPreferredAgesSelect),
      sufficientCondition: (dom.detailSufficientConditionInput?.value || '').trim(),
      necessaryCondition: (dom.detailNecessaryConditionInput?.value || '').trim(),
      likesDislikes: (dom.detailLikesDislikesInput?.value || '').trim(),
      values: getMultiSelectValues(dom.detailValuesSelect).slice(0, 1),
      valuesCustom: (dom.detailValuesCustomInput?.value || '').trim(),
      aboutMe: (dom.detailAboutMeInput?.value || '').trim(),
      phoneConsultStatus: dom.detailPhoneStatusEl.value,
      notes: dom.detailNotesInput.value?.trim() || '',
    }

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
    payload.meetingSchedule = ''
    if (dateValue && timeValue) {
      const date = new Date(`${dateValue}T${timeValue}`)
      if (Number.isNaN(date.getTime())) {
        showToast('유효한 상담 일정을 선택해 주세요.')
        return
      }
      payload.meetingSchedule = date.toISOString()
    }

    const existingRecord = state.items.find((item) => item.id === state.detailRecordId) || {}
    payload.documents = existingRecord.documents || {}
    payload.photos = existingRecord.photos || []

    try {
      const res = await fetch(`${api.consult}/${state.detailRecordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message || '상세 정보를 저장하지 못했습니다.')
      }
      const updated = body.data || {}
      const index = state.items.findIndex((item) => item.id === updated.id)
      if (index !== -1) {
        state.items[index] = updated
      } else {
        state.items.push(updated)
      }
      YGSA.cards.render()
      YGSA.cards.syncSelectionWithItems()
      YGSA.filters.syncOptions()
      YGSA.calendar?.refresh(true)
      showToast('상세 정보를 저장했습니다.')
      closeDetailModal()
    } catch (error) {
      console.error(error)
      showToast(error?.message || '상세 정보를 저장하지 못했습니다.')
    }
  }

  function initDetailModal() {
    dom.detailCancelBtn?.addEventListener('click', (event) => {
      event.preventDefault()
      closeDetailModal()
    })
    dom.detailModal?.addEventListener('click', (event) => {
      if (event.target === dom.detailModal) closeDetailModal()
    })
    dom.detailForm?.addEventListener('submit', handleDetailSubmit)
    dom.detailDateInput?.addEventListener('change', () => {
      updateTimeOptions(dom.detailDateInput.value, '', state.detailRecordId)
    })
    dom.detailTimeSelect?.addEventListener('change', () => {
      const dateValue = dom.detailDateInput.value
      const timeValue = dom.detailTimeSelect.value
      if (dateValue && timeValue) {
        dom.detailScheduleInfo.textContent = `선택한 일정: ${dateValue} ${timeValue}`
      } else if (dateValue) {
        dom.detailScheduleInfo.textContent = '상담 시간을 선택해 주세요.'
      }
    })
    dom.detailClearScheduleBtn?.addEventListener('click', (event) => {
      event.preventDefault()
      dom.detailDateInput.value = ''
      updateTimeOptions('', '', state.detailRecordId)
      dom.detailScheduleInfo.textContent = '대면 상담 일정이 아직 없습니다.'
    })
    dom.detailProfileLinkBtn?.addEventListener('click', handleDetailProfileLink)
    dom.detailProfileLinkCopyBtn?.addEventListener('click', handleDetailProfileLinkCopy)
    dom.detailProfileLinkAnchor?.addEventListener('click', handleDetailProfileLinkOpen)
  }

  YGSA.detail = {
    init: initDetailModal,
    open: openDetailModal,
    close: closeDetailModal,
    updateTimeOptions,
    hideProfileLinkResult,
  }
})()



