const OpenAI = require('openai')
const nodemailer = require('nodemailer')
const twilio = require('twilio')
const { MATCH_AI_DEFAULT_MODEL, FIREBASE_REQUIRED_KEYS } = require('./constants')

function sanitizeEnvValue(value) {
  if (typeof value === 'string') {
    return value.trim()
  }
  return ''
}

function initialiseOpenAiClient() {
  const apiKey = sanitizeEnvValue(process.env.OPENAI_API_KEY)
  if (!apiKey) return null
  try {
    return new OpenAI({ apiKey })
  } catch (error) {
    console.error('[openai:init] 클라이언트 생성 실패', error)
    return null
  }
}

function initialiseMailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, GMAIL_USER, GMAIL_PASS } =
    process.env

  try {
    if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
      return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    }

    if (GMAIL_USER && GMAIL_PASS) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: GMAIL_USER,
          pass: GMAIL_PASS,
        },
      })
    }
  } catch (error) {
    console.error('[mail:init] 메일 트랜스포터 생성 실패', error)
  }

  return null
}

function initialiseSmsClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return null
  }

  try {
    return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  } catch (error) {
    console.error('[sms:init] Twilio 초기화 실패', error)
    return null
  }
}

function getFirebaseConfigFromEnv() {
  const rawConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  }
  const storageRoot = sanitizeEnvValue(process.env.FIREBASE_STORAGE_ROOT)
  const sanitizedEntries = Object.entries(rawConfig)
    .map(([key, value]) => [key, sanitizeEnvValue(value)])
    .filter(([, value]) => Boolean(value))
  if (storageRoot) {
    sanitizedEntries.push(['storageRoot', storageRoot])
  }
  const sanitized = Object.fromEntries(sanitizedEntries)
  const missing = FIREBASE_REQUIRED_KEYS.filter((key) => !sanitized[key])
  return { config: sanitized, missing }
}

const MATCH_AI_MODEL =
  sanitizeEnvValue(process.env.OPENAI_MATCH_MODEL) || MATCH_AI_DEFAULT_MODEL

const openAiClient = initialiseOpenAiClient()
if (openAiClient) {
  console.info(`[openai] 매칭 설명 모델 ${MATCH_AI_MODEL} 사용`)
} else {
  console.info('[openai] OPENAI_API_KEY 미설정 – 매칭 AI 설명 비활성화')
}

const emailTransport = initialiseMailTransport()
const smsClient = initialiseSmsClient()

module.exports = {
  openAiClient,
  emailTransport,
  smsClient,
  MATCH_AI_MODEL,
  getFirebaseConfigFromEnv,
}

