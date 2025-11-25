(function () {
  const YGSA = window.YGSA
  const { dom, state } = YGSA
  const { uniqueSorted, populateSelect, bindMultiSelectCheckboxes } = YGSA.utils

  function syncFilterOptions() {
    populateSelect(dom.genderFilter, uniqueSorted(state.items.map((item) => item.gender)), '성별 전체', 'gender', state)
    populateSelect(dom.heightFilter, uniqueSorted(state.items.map((item) => item.height)), '신장 전체', 'height', state)
  }

  function initFilters(onChange) {
    bindMultiSelectCheckboxes()
    dom.searchInput?.addEventListener('input', (event) => {
      state.viewState.search = event.target.value.trim()
      onChange?.()
    })
    dom.genderFilter?.addEventListener('change', (event) => {
      state.viewState.gender = event.target.value
      onChange?.()
    })
    dom.heightFilter?.addEventListener('change', (event) => {
      state.viewState.height = event.target.value
      onChange?.()
    })
    dom.sortSelect?.addEventListener('change', (event) => {
      state.viewState.sort = event.target.value
      onChange?.()
    })
  }

  YGSA.filters = {
    init: initFilters,
    syncOptions: syncFilterOptions,
  }
})()



