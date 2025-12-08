import express from 'express'
import fetch from 'node-fetch'

const app = express()
const PORT = process.env.PORT || 5000
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || ''

app.use(express.json())

// 간단 헬스체크
app.get('/healthz', (_, res) => res.json({ ok: true }))

// 상담 신청 수신
app.post('/api/consult', async (req, res) => {
  try {
    const body = req.body || {}
    const required = ['name', 'gender', 'phone', 'birth', 'education', 'job', 'height', 'district', 'referralSource', 'agree']
    const missing = required.filter((key) => body[key] === undefined || body[key] === null || body[key] === '')

    if (missing.length) {
      return res.status(400).json({ ok: false, message: `Missing fields: ${missing.join(', ')}` })
    }

    // 구글 스프레드시트(Apps Script 웹앱)로 전달
    if (SHEETS_WEBHOOK_URL) {
      try {
        const resp = await fetch(SHEETS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            receivedAt: new Date().toISOString(),
          }),
        })
        if (!resp.ok) {
          console.error('[sheets] forward non-200', resp.status)
        }
      } catch (err) {
        console.error('[sheets] forward failed', err)
      }
    } else {
      console.warn('[sheets] SHEETS_WEBHOOK_URL not set; skipping forward')
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, message: 'Server error' })
  }
})

app.listen(PORT, () => {
  console.log(`consult backend listening on ${PORT}`)
})

