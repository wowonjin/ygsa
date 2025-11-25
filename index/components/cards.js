import { dom } from '../dom.js'
import { escapeHtml, formatDate, formatPhoneStatus, getStatusClass, formatSalaryRange } from '../utils/format.js'

let handleSelectionChange = null
let handleOpenDetail = null

function renderEntry(label, value) {
  return `
    <div>
      <dt>${label}</dt>
      <dd>${escapeHtml(value || '-')}</dd>
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

export function renderCards(items, selectedIds) {
  if (!dom.cardsEl || !dom.emptyEl) return
  dom.cardsEl.innerHTML = ''
  if (!items.length) {
    dom.emptyEl.hidden = false
    return
  }
  dom.emptyEl.hidden = true
  const fragment = document.createDocumentFragment()
  items.forEach((item) => {
    const card = document.createElement('article')
    card.className = 'card'
    card.dataset.id = item.id || ''
    const idAttr = escapeHtml(item.id || '')
    const isSelected = selectedIds.has(item.id)
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

function handleCardChange(event) {
  const target = event.target
  if (!target.classList.contains('select-checkbox')) return
  const id = target.dataset.id
  if (!id) return
  if (typeof handleSelectionChange === 'function') {
    handleSelectionChange(id, target.checked)
  }
}

function handleCardClick(event) {
  const card = event.target.closest('.card')
  if (!card) return
  const checkbox = event.target.closest('.select-checkbox')
  if (checkbox) return
  const { id } = card.dataset
  if (id && typeof handleOpenDetail === 'function') {
    handleOpenDetail(id)
  }
}

export function initCards({ onSelectionChange, onOpenDetail }) {
  handleSelectionChange = onSelectionChange
  handleOpenDetail = onOpenDetail
  dom.cardsEl?.addEventListener('change', handleCardChange)
  dom.cardsEl?.addEventListener('click', handleCardClick)
}



