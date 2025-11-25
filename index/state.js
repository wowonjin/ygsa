export const state = {
  items: [],
  selectedIds: new Set(),
  suppressDeleteToast: false,
  suppressUpdateToast: false,
  detailRecordId: null,
  detailValuesSelection: [],
  currentDraftData: null,
  appInitialized: false,
  isAuthenticated: false,
  viewState: {
    search: '',
    gender: 'all',
    height: 'all',
    sort: 'latest',
  },
  calendarState: {
    current: new Date(),
    selectedDate: '',
  },
}



