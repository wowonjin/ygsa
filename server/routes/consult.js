const express = require('express')
const router = express.Router()
const asyncHandler = require('../middleware/asyncHandler')
const consultationService = require('../services/consultationService')
const { ValidationError } = require('../middleware/errorHandler')

router.get('/', asyncHandler(async (req, res) => {
  const list = await consultationService.getAll()
  res.json({ ok: true, data: list })
}))

router.post('/', asyncHandler(async (req, res) => {
  const record = await consultationService.create(req.body)
  res.status(201).json({ ok: true, data: record })
}))

router.get('/profile', asyncHandler(async (req, res) => {
  const phoneKey = require('../utils/sanitizers').normalizePhoneNumber(
    req.query?.phone || req.query?.phoneKey
  )
  if (!phoneKey) {
    throw new ValidationError('연락처를 입력해주세요.')
  }
  const payload = await consultationService.getProfileDraft(phoneKey)
  res.json({ ok: true, data: payload })
}))

router.post('/profile', asyncHandler(async (req, res) => {
  const result = await consultationService.updateProfile(req.body)
  res.json({ ok: true, data: result.record, created: result.created })
}))

router.post('/:id/profile-link', asyncHandler(async (req, res) => {
  const { id } = req.params
  if (!id) {
    throw new ValidationError('대상 정보를 확인할 수 없습니다.')
  }
  const result = await consultationService.createProfileLink(id, req)
  res.json({ ok: true, data: result })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  if (!id) {
    throw new ValidationError('대상 정보를 확인할 수 없습니다.')
  }
  const record = await consultationService.update(id, req.body)
  res.json({ ok: true, data: record })
}))

router.delete('/', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  if (!ids.length) {
    throw new ValidationError('삭제할 항목을 선택해주세요.')
  }
  await consultationService.deleteMany(ids)
  res.json({ ok: true })
}))

module.exports = router

