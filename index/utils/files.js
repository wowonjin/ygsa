export function getFileSource(fileData) {
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

export function setAttachmentLink(linkEl, fileData, fallbackLabel) {
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

export function renderPhotoAttachments(container, photos) {
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



