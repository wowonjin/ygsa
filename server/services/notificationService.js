const { EMAIL_RECIPIENTS, SMS_RECIPIENTS } = require('../config/constants')
const { emailTransport, smsClient } = require('../config/clients')

async function triggerNotifications(record) {
  await Promise.all([sendEmailNotification(record), sendSmsNotifications(record)])
}

async function sendEmailNotification(record) {
  if (!emailTransport) {
    console.warn('[mail] 메일 전송 설정이 비어있습니다. .env를 확인하세요.')
    return
  }

  const recipients = EMAIL_RECIPIENTS.map((item) => item?.email).filter(Boolean)
  if (!recipients.length) {
    console.warn('[mail] 수신 이메일 정보가 없습니다.')
    return
  }

  const from =
    process.env.EMAIL_FROM ||
    process.env.GMAIL_USER ||
    process.env.SMTP_USER ||
    'noreply@ygsa.co.kr'

  const message = buildNotificationMessage(record)
  const subject = '새로운 상담 신청이 접수되었습니다'

  try {
    await emailTransport.sendMail({
      from,
      to: recipients.join(', '),
      subject,
      text: message,
    })
  } catch (error) {
    console.error('[mail] 전송 실패', error)
    throw error
  }
}

async function sendSmsNotifications(record) {
  if (!smsClient) {
    console.warn('[sms] SMS 전송 설정이 비어있습니다. .env를 확인하세요.')
    return
  }

  const recipients = SMS_RECIPIENTS.map((item) => item?.phone).filter(Boolean)
  if (!recipients.length) {
    console.warn('[sms] 수신 전화번호 정보가 없습니다.')
    return
  }

  const from = process.env.TWILIO_PHONE_NUMBER
  if (!from) {
    console.warn('[sms] 발신 번호가 설정되지 않았습니다.')
    return
  }

  const message = buildNotificationMessage(record, true)
  const { toE164 } = require('../utils/formatters')

  try {
    await Promise.all(
      recipients.map((to) => {
        const e164 = toE164(to)
        if (!e164) {
          console.warn(`[sms] 번호 변환 실패: ${to}`)
          return Promise.resolve()
        }
        return smsClient.messages.create({
          from: toE164(from),
          to: e164,
          body: message,
        })
      }),
    )
  } catch (error) {
    console.error('[sms] 전송 실패', error)
    throw error
  }
}

function buildNotificationMessage(record, compact = false) {
  if (compact) {
    return [
      `새로운 상담 신청`,
      `이름: ${record.name || '-'}`,
      `연락처: ${record.phone || '-'}`,
      `신장: ${record.height || '-'}`,
      `거주 구: ${record.district || '-'}`,
      `직업: ${record.job || '-'}`,
      `최종학력: ${record.education || '-'}`,
    ].join('\n')
  }

  return [
    '새로운 상담 신청이 접수되었습니다.',
    `이름: ${record.name || '-'}`,
    `연락처: ${record.phone || '-'}`,
    `성별: ${record.gender || '-'}`,
    `생년월일: ${record.birth || '-'}`,
    `신장: ${record.height || '-'}`,
    `거주 구: ${record.district || '-'}`,
    `직업: ${record.job || '-'}`,
    `최종학력: ${record.education || '-'}`,
    `신청시각: ${new Date(record.createdAt || Date.now()).toLocaleString('ko-KR')}`,
  ].join('\n')
}

module.exports = {
  triggerNotifications,
  sendEmailNotification,
  sendSmsNotifications,
  buildNotificationMessage,
}

