(function () {
  const YGSA = window.YGSA
  const { dom, state, api } = YGSA
  const { showToast, formatSalaryRange, formatDate } = YGSA.utils

  function exportToExcel() {
    const items = state.items.slice()
    if (!items.length) {
      showToast('내보낼 데이터가 없습니다.')
      return
    }
    if (typeof XLSX === 'undefined') {
      showToast('엑셀 라이브러리를 불러오는 데 실패했습니다.')
      return
    }
    const rows = items.map((item, index) => ({
      번호: index + 1,
      성명: item.name || '',
      성별: item.gender || '',
      연락처: item.phone || '',
      생년월일: item.birth || '',
      최종학력: item.education || '',
      직업: item.job || '',
      신장: item.height || '',
      MBTI: item.mbti || '',
      대학교: item.university || '',
      연봉구간: formatSalaryRange(item.salaryRange) || '',
      흡연: item.smoking || '',
      종교: item.religion || '',
      선호키: (item.preferredHeights || []).join(', '),
      선호나이: (item.preferredAges || []).join(', '),
      거주구: item.district || '',
      직무상세: item.jobDetail || '',
      추가어필: item.profileAppeal || '',
      충분조건: item.sufficientCondition || '',
      필요조건: item.necessaryCondition || '',
      좋아하는것싫어하는것: item.likesDislikes || '',
      가치관: (item.values || []).join(', '),
      가치관기타: item.valuesCustom || '',
      자기소개: item.aboutMe || '',
      신분증파일: item.documents?.idCard?.name || '',
      재직증빙파일: item.documents?.employmentProof?.name || '',
      사진파일: (item.photos || []).map((photo) => photo.name).join(', '),
      접수시간: formatDate(item.createdAt),
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '상담 신청')
    const dateLabel = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `consultations-${dateLabel}.xlsx`)
    showToast('엑셀 파일이 다운로드되었습니다.')
  }

  async function handleExcelImport(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (typeof XLSX === 'undefined') {
      showToast('엑셀 라이브러리를 불러오는 데 실패했습니다.')
      return
    }
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        showToast('시트를 찾을 수 없습니다.')
        return
      }
      const sheet = workbook.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      if (!json.length) {
        showToast('엑셀에서 데이터를 찾지 못했습니다.')
        return
      }
      const normalized = json.map((row) => ({
        id: row.id || row.ID || row.Id || String(Math.random()).slice(2),
        name: row.성명 || row.이름 || row.name || '',
        gender: row.성별 || row.gender || '',
        phone: row.연락처 || row.phone || '',
        birth: row.생년월일 || row.birth || '',
        job: row.직업 || row.job || row.occupation || '',
        height:
          row.신장 ||
          row['신장(cm)'] ||
          row.height ||
          row.거주지역 ||
          row.지역 ||
          row.region ||
          '',
        district: row.거주구 || row['거주 구'] || row.구 || row.district || '',
        education: row.최종학력 || row.education || '',
        createdAt: row.접수시간
          ? new Date(row.접수시간).toISOString()
          : row.createdAt || new Date().toISOString(),
      }))
      const response = await fetch(api.import, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: normalized }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.ok) {
        throw new Error(body?.message || '엑셀 데이터를 반영하지 못했습니다.')
      }
      showToast(`엑셀 데이터 ${normalized.length}건을 반영했습니다.`)
      state.selectedIds.clear()
      dom.excelInput.value = ''
      YGSA.app?.loadData()
    } catch (error) {
      console.error(error)
      showToast(error.message || '엑셀 파일 처리에 실패했습니다.')
    } finally {
      dom.excelInput.value = ''
    }
  }

  function initExcelControls() {
    dom.exportBtn?.addEventListener('click', exportToExcel)
    dom.importBtn?.addEventListener('click', () => dom.excelInput?.click())
    dom.excelInput?.addEventListener('change', handleExcelImport)
  }

  YGSA.excel = {
    init: initExcelControls,
  }
})()

