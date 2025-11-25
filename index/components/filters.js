import { dom } from '../dom.js'
import { state } from '../state.js'
import { uniqueSorted } from '../utils/data.js'
import { populateSelect } from '../utils/forms.js'

let handleChange = null

export function initFilters({ onChange }) {
  handleChange = onChange
  dom.searchInput?.addEventListener('input', (event) => {
    state.viewState.search = event.target.value.trim()
    handleChange?.()
  })
  dom.genderFilter?.addEventListener('change', (event) => {
    state.viewState.gender = event.target.value
    handleChange?.()
  })
  dom.heightFilter?.addEventListener('change', (event) => {
    state.viewState.height = event.target.value
    handleChange?.()
  })
  dom.sortSelect?.addEventListener('change', (event) => {
    state.viewState.sort = event.target.value
    handleChange?.()
  })
}

export function syncFilterOptions(items) {
  populateSelect(dom.genderFilter, uniqueSorted(items.map((item) => item.gender)), '성별 전체', 'gender', state)
  populateSelect(dom.heightFilter, uniqueSorted(items.map((item) => item.height)), '신장 전체', 'height', state)
}



