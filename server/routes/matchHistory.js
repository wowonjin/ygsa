const express = require('express')
const router = express.Router()
const asyncHandler = require('../middleware/asyncHandler')
const matchHistoryService = require('../services/matchHistoryService')
const { ValidationError } = require('../middleware/errorHandler')

router.get('/', asyncHandler(async (req, res) => {
  const history = await matchHistoryService.getAll()
  res.json({ ok: true, data: history })
}))

router.post('/', asyncHandler(async (req, res) => {
  const entry = await matchHistoryService.create(req.body)
  res.json({ ok: true, data: entry })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  if (!id) {
    throw new ValidationError('삭제할 매칭 ID가 필요합니다.')
  }
  const removed = await matchHistoryService.delete(id)
  res.json({ ok: true, data: removed })
}))

router.post('/lookup', asyncHandler(async (req, res) => {
  const phoneKey = require('../utils/sanitizers').normalizePhoneNumber(req.body?.phone)
  const requestedWeek = require('../utils/sanitizers').sanitizeText(req.body?.week)
  const limitRaw = Number(req.body?.limit)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 6) : 3

  if (!phoneKey) {
    throw new ValidationError('전화번호를 입력해주세요.')
  }

  const data = await matchHistoryService.lookupMatches(phoneKey, requestedWeek, limit)
  res.json({ ok: true, data })
}))

router.post('/contact', asyncHandler(async (req, res) => {
  const phoneKey = require('../utils/sanitizers').normalizePhoneNumber(req.body?.phone)
  const candidateKey = require('../utils/sanitizers').normalizeCandidateIdentifier(req.body?.candidateId)
  const matchEntryId = require('../utils/sanitizers').sanitizeText(req.body?.matchEntryId)

  if (!phoneKey) {
    throw new ValidationError('전화번호를 입력해주세요.')
  }
  if (!candidateKey && !matchEntryId) {
    throw new ValidationError('연락처를 확인할 후보 또는 매칭 ID가 필요합니다.')
  }

  const contact = await matchHistoryService.getContact(phoneKey, candidateKey, matchEntryId)
  res.json({ ok: true, data: contact })
}))

module.exports = router

