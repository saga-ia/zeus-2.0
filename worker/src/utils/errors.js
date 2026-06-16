class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorHandler(logger) {
  return (err, req, res, _next) => {
    const status = err.status || (err.name === 'ZodError' ? 400 : 500);
    const payload = {
      error: err.message || 'internal_error',
    };
    if (err.name === 'ZodError') {
      payload.error = 'validation_error';
      payload.issues = err.issues;
    } else if (err.details) {
      payload.details = err.details;
    }
    if (status >= 500) logger.error({ err, path: req.path, method: req.method }, 'request failed');
    else logger.warn({ status, err: err.message, path: req.path }, 'request rejected');
    res.status(status).json(payload);
  };
}

module.exports = { HttpError, asyncRoute, errorHandler };
