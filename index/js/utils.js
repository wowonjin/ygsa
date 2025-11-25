(function () {
  const YGSA = window.YGSA
  const { constants, dom } = YGSA

  function formatDate(value) {
    if (!value) return '-'
    try {
      return new Date(value).toLocaleString('ko-KR')
    } catch (error) {
      return value
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function renderEntry(label, value) {
    return `
      <div>
        <dt>${label}</dt>
        <dd>${escapeHtml(value || '-')}</dd>
      </div>
    `
  }

  function formatPhoneStatus(status) {
    return constants.PHONE_STATUS_LABELS[status] || constants.PHONE_STATUS_LABELS.pending
  }

  function getStatusClass(status) {
    return constants.STATUS_CLASS_NAMES[status] || constants.STATUS_CLASS_NAMES.pending
  }

  function formatSalaryRange(value) {
    return constants.SALARY_RANGE_LABELS[value] || ''
  }

  function normalizeHeightValue(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '').slice(0, 3)
    return digits ? `${digits}cm` : ''
  }

  function formatPhoneNumber(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '')
    if (!digits) return ''
    if (digits.length < 4) return digits
    if (digits.length < 8) return digits.replace(/(\d{3})(\d+)/, '$1-$2')
    return digits.replace(/(\d{3})(\d{3,4})(\d{0,4}).*/, '$1-$2-$3')
  }

  function normalizePhoneKey(raw) {
    return String(raw || '').replace(/[^0-9]/g, '')
  }

  function setSelectValue(selectEl, value) {
    if (!selectEl) return
    const options = Array.from(selectEl.options || []).map((opt) => opt.value)
    selectEl.value = options.includes(value) ? value : ''
  }

  function setMultiSelectValues(selectEl, values) {
    if (!selectEl) return
    const list = Array.isArray(values) ? values : []
    if (!selectEl.multiple) {
      selectEl.value = list[0] || ''
      syncCheckboxGroupFromSelect(selectEl)
      return
    }
    const valueSet = new Set(list.map((value) => String(value)))
    Array.from(selectEl.options || []).forEach((option) => {
      option.selected = valueSet.has(option.value)
    })
    syncCheckboxGroupFromSelect(selectEl)
  }

  function getMultiSelectValues(selectEl) {
    if (!selectEl) return []
    if (!selectEl.multiple) {
      const value = selectEl.value
      return value ? [value] : []
    }
    return Array.from(selectEl.selectedOptions || [])
      .map((option) => option.value)
      .filter(Boolean)
  }

  function generateTimeSlots() {
    const slots = []
    for (let hour = constants.TIME_SLOT_START_HOUR; hour <= constants.TIME_SLOT_END_HOUR; hour += 1) {
      for (let minute = 0; minute < 60; minute += constants.TIME_SLOT_INTERVAL_MINUTES) {
        if (hour === constants.TIME_SLOT_END_HOUR && minute > 0) break
        const h = String(hour).padStart(2, '0')
        const m = String(minute).padStart(2, '0')
        slots.push(`${h}:${m}`)
      }
    }
    return slots
  }

  function getDateKey(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function formatSelectedDateTitle(dateKey) {
    if (!dateKey) return '선택된 일정'
    const [year, month, day] = dateKey.split('-').map((value) => Number(value))
    if ([year, month, day].some((value) => Number.isNaN(value))) return '선택된 일정'
    return `${year}년 ${month}월 ${day}일 일정`
  }

  function formatCalendarSchedule(schedule, fallbackTime, fallbackDateKey) {
    if (schedule) {
      const date = new Date(schedule)
      if (!Number.isNaN(date.getTime())) {
        const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        return `${String(date.getFullYear())}년 ${String(date.getMonth() + 1)}월 ${String(date.getDate())}일 ${time}`
      }
    }
    return `${fallbackDateKey} ${fallbackTime}`
  }

  function getFileSource(fileData) {
    if (!fileData) return ''
    if (typeof fileData === 'string') return fileData
    if (typeof fileData.dataUrl === 'string' && fileData.dataUrl.trim()) return fileData.dataUrl.trim()
    if (typeof fileData.downloadURL === 'string' && fileData.downloadURL.trim()) return fileData.downloadURL.trim()
    if (typeof fileData.url === 'string' && fileData.url.trim()) return fileData.url.trim()
    if (typeof fileData.src === 'string' && fileData.src.trim()) return fileData.src.trim()
    if (typeof fileData.data === 'string' && fileData.data.trim()) {
      const data = fileData.data.trim()
      if (data.startsWith('data:')) return data
      const mime =
        typeof fileData.type === 'string' && fileData.type.trim() ? fileData.type.trim() : 'application/octet-stream'
      return `data:${mime};base64,${data}`
    }
    if (typeof fileData.base64 === 'string' && fileData.base64.trim()) {
      const mime =
        typeof fileData.type === 'string' && fileData.type.trim() ? fileData.type.trim() : 'application/octet-stream'
      return `data:${mime};base64,${fileData.base64.trim()}`
    }
    return ''
  }

  function setAttachmentLink(linkEl, fileData, fallbackLabel) {
    if (!linkEl || !fileData) return false
    const source = getFileSource(fileData)
    if (!source) return false
    const name = fileData.name || fallbackLabel || '첨부파일'
    linkEl.href = source
    linkEl.download = name
    linkEl.textContent = `${name} 다운로드`
    linkEl.target = '_blank'
    linkEl.rel = 'noopener noreferrer'
    linkEl.title = source
    let urlContainer = linkEl.nextElementSibling
    if (!urlContainer || !urlContainer.classList.contains('attachment-url')) {
      urlContainer = document.createElement('div')
      urlContainer.className = 'attachment-url'
      linkEl.insertAdjacentElement('afterend', urlContainer)
    }
    urlContainer.textContent = source
    urlContainer.title = source
    urlContainer.hidden = false
    return true
  }

  function renderPhotoAttachments(container, photos) {
    if (!container) return 0
    container.innerHTML = ''
    const list = Array.isArray(photos) ? photos : []
    list
      .map((photo) => ({ source: getFileSource(photo), photo }))
      .filter(({ source }) => Boolean(source))
      .forEach(({ source, photo }, index) => {
        const item = document.createElement('div')
        item.className = 'attachment-photo-item'
        const link = document.createElement('a')
        link.href = source
        const label = photo?.name || `사진 ${index + 1}`
        link.download = label
        link.title = `${label} 다운로드`
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        const img = document.createElement('img')
        img.src = source
        img.alt = label
        link.appendChild(img)
        const urlBox = document.createElement('div')
        urlBox.className = 'attachment-url'
        urlBox.textContent = source
        urlBox.title = source
        item.appendChild(link)
        item.appendChild(urlBox)
        container.appendChild(item)
      })
    return container.childElementCount
  }

  function renderCardAttachments(item) {
    if (!item) return ''
    const attachments = []
    const documents = item.documents || {}
    if (documents.idCard) {
      const rendered = renderAttachmentListItem('신분증', documents.idCard, '신분증')
      if (rendered) attachments.push(rendered)
    }
    if (documents.employmentProof) {
      const rendered = renderAttachmentListItem('재직 증빙', documents.employmentProof, '재직 증빙')
      if (rendered) attachments.push(rendered)
    }
    const photos = Array.isArray(item.photos) ? item.photos : []
    const facePhotos = photos.filter((photo) => (photo.role || photo.meta?.type) === 'face')
    const fullPhotos = photos.filter((photo) => (photo.role || photo.meta?.type) === 'full')
    facePhotos.forEach((photo, index) => {
      const rendered = renderAttachmentListItem(`얼굴 사진 ${index + 1}`, photo, '얼굴 사진')
      if (rendered) attachments.push(rendered)
    })
    fullPhotos.forEach((photo, index) => {
      const rendered = renderAttachmentListItem(`전신 사진 ${index + 1}`, photo, '전신 사진')
      if (rendered) attachments.push(rendered)
    })
    if (!attachments.length) return ''
    return `
      <div class="card-attachments">
        <div class="card-attachments-title">업로드 자료</div>
        <ul class="card-attachments-list">
          ${attachments.join('')}
        </ul>
      </div>
    `
  }

  function renderAttachmentListItem(label, file, fallbackName) {
    if (!file) return ''
    const displayName = escapeHtml(file?.name || fallbackName || label)
    const safeLabel = escapeHtml(label || '첨부파일')
    const safeUrl = escapeHtml(file?.downloadURL || file?.url || file?.dataUrl || '')
    if (!safeUrl) return ''
    return `
      <li>
        <span class="label">${safeLabel}</span>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" download="${displayName}">
          ${displayName}
        </a>
      </li>
    `
  }

  function showToast(message) {
    if (!dom.toastEl) return
    dom.toastEl.textContent = message
    dom.toastEl.classList.add('show')
    setTimeout(() => dom.toastEl.classList.remove('show'), 2500)
  }

  function uniqueSorted(values) {
    return Array.from(new Set((values || []).filter((value) => value && value.trim()))).sort((a, b) =>
      a.localeCompare(b, 'ko-KR'),
    )
  }

  function populateSelect(selectEl, values, placeholder, viewStateKey, state) {
    if (!selectEl) return
    const previous = selectEl.value || 'all'
    selectEl.innerHTML = ''
    const fragment = document.createDocumentFragment()
    const allOption = document.createElement('option')
    allOption.value = 'all'
    allOption.textContent = placeholder
    fragment.appendChild(allOption)
    values
      .filter(Boolean)
      .forEach((value) => {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        fragment.appendChild(option)
      })
    selectEl.appendChild(fragment)
    if (values.includes(previous)) {
      selectEl.value = previous
    } else {
      selectEl.value = 'all'
    }
    if (state && viewStateKey) {
      state.viewState[viewStateKey] = selectEl.value
    }
  }

  function splitLocalDateTime(value) {
    if (!value) return { date: '', time: '' }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return { date: '', time: '' }
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
    }
  }

  function syncCheckboxGroupFromSelect(selectEl) {
    if (!selectEl || !selectEl.id) return
    const group = document.querySelector(`[data-multi-select="${selectEl.id}"]`)
    if (!group) return
    const selectedValues = new Set(
      Array.from(selectEl.options || [])
        .filter((option) => option.selected)
        .map((option) => option.value),
    )
    Array.from(group.querySelectorAll('input[type="checkbox"]')).forEach((checkbox) => {
      checkbox.checked = selectedValues.has(checkbox.value)
    })
  }

  function bindMultiSelectCheckboxes() {
    dom.multiSelectCheckboxGroups.forEach((group) => {
      group.addEventListener('change', (event) => {
        const checkbox = event.target
        if (!checkbox || checkbox.type !== 'checkbox') return
        const targetId = group.dataset.multiSelect
        if (!targetId) return
        const selectEl = document.getElementById(targetId)
        if (!selectEl) return
        Array.from(selectEl.options || []).forEach((option) => {
          if (option.value === checkbox.value) {
            option.selected = checkbox.checked
          }
        })
        selectEl.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const targetId = group.dataset.multiSelect
      const selectEl = targetId ? document.getElementById(targetId) : null
      if (selectEl) {
        syncCheckboxGroupFromSelect(selectEl)
      }
    })
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

  async function tryCopyToClipboard(text) {
    if (!text || !navigator?.clipboard?.writeText) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.warn('[clipboard]', error)
      return false
    }
  }

  YGSA.utils = {
    formatDate,
    escapeHtml,
    renderEntry,
    renderCardAttachments,
    normalizeHeightValue,
    formatPhoneNumber,
    normalizePhoneKey,
    setSelectValue,
    setMultiSelectValues,
    getMultiSelectValues,
    generateTimeSlots,
    getDateKey,
    formatSelectedDateTitle,
    formatCalendarSchedule,
    getFileSource,
    setAttachmentLink,
    renderPhotoAttachments,
    showToast,
    uniqueSorted,
    populateSelect,
    formatPhoneStatus,
    getStatusClass,
    formatSalaryRange,
    splitLocalDateTime,
    bindMultiSelectCheckboxes,
    resolveShareUrl,
    tryCopyToClipboard,
  }
})()



