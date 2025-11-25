import { dom } from '../dom.js'
import { showToast } from '../components/toast.js'

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

export function bindMultiSelectCheckboxes(onChange) {
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
      if (typeof onChange === 'function') {
        onChange(selectEl)
      }
    })
    const targetId = group.dataset.multiSelect
    const selectEl = targetId ? document.getElementById(targetId) : null
    if (selectEl) {
      syncCheckboxGroupFromSelect(selectEl)
    }
  })
}

export function setSelectValue(selectEl, value) {
  if (!selectEl) return
  const options = Array.from(selectEl.options || []).map((opt) => opt.value)
  selectEl.value = options.includes(value) ? value : ''
}

export function setMultiSelectValues(selectEl, values) {
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

export function getMultiSelectValues(selectEl) {
  if (!selectEl) return []
  if (!selectEl.multiple) {
    const value = selectEl.value
    return value ? [value] : []
  }
  return Array.from(selectEl.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean)
}

export function enforceMultiSelectLimit(selectEl, limit, previousSelectionRef) {
  if (!selectEl) return
  const selected = getMultiSelectValues(selectEl)
  if (!selectEl.multiple) {
    if (previousSelectionRef) previousSelectionRef.splice(0, previousSelectionRef.length, ...selected)
    return
  }
  if (selected.length > limit) {
    setMultiSelectValues(selectEl, previousSelectionRef || [])
    showToast(`가치관은 최대 ${limit}개까지 선택할 수 있습니다.`)
  } else if (previousSelectionRef) {
    previousSelectionRef.splice(0, previousSelectionRef.length, ...selected)
  }
}

export function populateSelect(selectEl, values, placeholder, viewStateKey, state) {
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



