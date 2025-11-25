(function () {
  const YGSA = window.YGSA
  const { dom, state } = YGSA
  const {
    renderCardAttachments,
    renderEntry,
    escapeHtml,
    formatDate,
    formatPhoneStatus,
    getStatusClass,
    formatSalaryRange,
    showToast,
  } = YGSA.utils

  function getPreparedItems() {
    const { viewState } = state
    let result = state.items.slice()
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

  function render() {
    if (!dom.cardsEl || !dom.emptyEl) return
    const prepared = getPreparedItems()
    dom.cardsEl.innerHTML = ''
    if (!prepared.length) {
      dom.emptyEl.hidden = false
      return
    }
    dom.emptyEl.hidden = true
    const fragment = document.createDocumentFragment()
    prepared.forEach((item) => {
      const card = document.createElement('article')
      card.className = 'card'
      card.dataset.id = item.id || ''
      const idAttr = escapeHtml(item.id || '')
      const isSelected = state.selectedIds.has(item.id)
      card.innerHTML = `
        <div class="card-top">
          <div>
            <div class="card-title">
              <h2>${escapeHtml(item.name || '익명')}</h2>
              <span class="status-chip ${escapeHtml(getStatusClass(item.phoneConsultStatus))}">
                ${escapeHtml(formatPhoneStatus(item.phoneConsultStatus))}
              </span>
            </div>
            <div class="meta">${formatDate(item.createdAt)} 접수</div>
          </div>
          <div class="card-controls">
            <input
              type="checkbox"
              class="select-checkbox"
              data-id="${idAttr}"
              ${isSelected ? 'checked' : ''}
              aria-label="상담 선택"
            />
          </div>
        </div>
        <dl>
          ${renderEntry('연락처', item.phone)}
          ${renderEntry('성별', item.gender)}
          ${renderEntry('생년(생일)', item.birth)}
          ${renderEntry('최종학력', item.education)}
          ${renderEntry('직업', item.job)}
          ${renderEntry('신장', item.height)}
          ${renderEntry('MBTI', item.mbti)}
          ${renderEntry('연봉', formatSalaryRange(item.salaryRange))}
          ${renderEntry('거주 구', item.district)}
        </dl>
        ${renderCardAttachments(item)}
      `
      fragment.appendChild(card)
    })
    dom.cardsEl.appendChild(fragment)
  }

  function updateSelectionInfo() {
    if (!dom.selectionInfoEl || !dom.bulkActionBar || !dom.deleteSelectedBtn) return
    const count = state.selectedIds.size
    dom.selectionInfoEl.textContent = count ? `${count}건 선택됨` : ''
    dom.bulkActionBar.hidden = count === 0
    dom.deleteSelectedBtn.disabled = count === 0
  }

  function syncSelectionWithItems() {
    const validIds = new Set(state.items.map((item) => item.id))
    Array.from(state.selectedIds).forEach((id) => {
      if (!validIds.has(id)) state.selectedIds.delete(id)
    })
    updateSelectionInfo()
  }

  function handleCardChange(event) {
    const target = event.target
    if (!target.classList.contains('select-checkbox')) return
    const id = target.dataset.id
    if (!id) return
    if (target.checked) {
      state.selectedIds.add(id)
    } else {
      state.selectedIds.delete(id)
    }
    updateSelectionInfo()
  }

  function handleCardClick(event) {
    const card = event.target.closest('.card')
    if (!card) return
    const checkbox = event.target.closest('.select-checkbox')
    if (checkbox) return
    const { id } = card.dataset
    if (id && YGSA.detail) {
      YGSA.detail.open(id)
    } else if (!YGSA.detail) {
      showToast('상세 모듈이 초기화되지 않았습니다.')
    }
  }

  function initCards() {
    dom.cardsEl?.addEventListener('change', handleCardChange)
    dom.cardsEl?.addEventListener('click', handleCardClick)
  }

  YGSA.cards = {
    init: initCards,
    render,
    syncSelectionWithItems,
    updateSelectionInfo,
  }
})()



