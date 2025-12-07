/**
 * YGSA 연결사 서버
 * 
 * 리팩토링된 구조를 사용하는 서버 진입점입니다.
 */

const express = require('express')
const cors = require('cors')
const path = require('path')
const { nanoid } = require('nanoid')
require('dotenv').config()

const app = express()
const PORT = Number(process.env.PORT) || 5000

// 상수 및 클라이언트
const { DATA_FILE, HAS_FRONTEND_BUILD, FRONTEND_DIST, FRONTEND_INDEX } = require('./config/constants')
const { getFirebaseConfigFromEnv } = require('./config/clients')
const { broadcast, addClient, removeClient } = require('./utils/broadcast')

console.info(`[ygsa] 상담 데이터 저장 위치: ${DATA_FILE}`)

// 미들웨어
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// 정적 파일 서빙
if (HAS_FRONTEND_BUILD) {
  app.use(express.static(FRONTEND_DIST))
}
app.use(express.static(path.join(__dirname, '..')))

// 정적 파일 라우트
app.get('/profile-card.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../profile-card.html'))
})

// Firebase 설정 API
app.get('/api/firebase-config', (req, res) => {
  const { config, missing } = getFirebaseConfigFromEnv()
  if (missing.length) {
    console.warn('[firebase-config] Missing required keys:', missing.join(', '))
    return res.status(503).json({
      ok: false,
      message: `Firebase 설정이 구성되지 않았습니다. 누락된 항목: ${missing.join(', ')}`,
    })
  }
  console.info('[firebase-config] Served config keys:', Object.keys(config))
  res.json({ ok: true, config })
})

// API 라우터 연결
const consultRouter = require('./routes/consult')
const matchHistoryRouter = require('./routes/matchHistory')

app.use('/api/consult', consultRouter)
app.use('/api/match-history', matchHistoryRouter)

// SSE (Server-Sent Events)
app.get('/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  res.write('retry: 15000\n\n')

  const client = { id: nanoid(), res }
  addClient(client)

  res.write(`event: ready\ndata: {}\n\n`)

  const keepAlive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAlive)
      return
    }
    res.write(': keep-alive\n\n')
  }, 25000)

  req.on('close', () => {
    clearInterval(keepAlive)
    removeClient(client)
  })
})

// Fallback 라우트 (SPA)
app.get('*', (req, res) => {
  if (HAS_FRONTEND_BUILD) {
    return res.sendFile(FRONTEND_INDEX)
  }
  return res.sendFile(path.join(__dirname, '../index.html'))
})

// 에러 핸들러 (마지막에 적용)
const errorHandler = require('./middleware/errorHandler')
app.use(errorHandler)

// 서버 시작
app.listen(PORT, () => {
  console.log(`[server] 리팩토링된 구조로 서버 시작 - http://localhost:${PORT}`)
})

module.exports = app
