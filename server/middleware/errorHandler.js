class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.statusCode = 400
    this.name = 'ValidationError'
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.statusCode = 404
    this.name = 'NotFoundError'
  }
}

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500
  const message = err.message || '서버 오류가 발생했습니다.'
  
  console.error(`[${req.method} ${req.path}]`, err)
  
  if (err.errors) {
    return res.status(statusCode).json({ ok: false, message, errors: err.errors })
  }
  
  res.status(statusCode).json({ ok: false, message })
}

module.exports = errorHandler
module.exports.ValidationError = ValidationError
module.exports.NotFoundError = NotFoundError
