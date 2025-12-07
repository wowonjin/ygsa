function toE164(value) {
  if (!value) return null
  let digits = String(value).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) {
    digits = `82${digits.slice(1)}`
  }
  if (!digits.startsWith('+')) {
    digits = `+${digits}`
  }
  return digits
}

function maskPhoneNumber(value) {
  const { normalizePhoneNumber } = require('./sanitizers')
  const digits = normalizePhoneNumber(value)
  if (!digits) return ''
  if (digits.length <= 4) return digits
  const head = digits.slice(0, 3)
  const tail = digits.slice(-4)
  const middleLength = Math.max(3, digits.length - 7)
  const middle = '*'.repeat(middleLength)
  return `${head}-${middle}-${tail}`
}

module.exports = {
  toE164,
  maskPhoneNumber,
}

