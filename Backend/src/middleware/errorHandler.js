export default function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.name === "ValidationError" || error.name === "CastError" ? 400 :
    error.code === 11000 ? 409 : error.status || 500;
  const message = status >= 500 ? "Internal server error" : error.code === 11000
    ? `${Object.keys(error.keyPattern || {})[0] || "Value"} already exists`
    : error.message || "Request could not be completed";
  if (status >= 500) console.error(error);
  res.status(status).json({ message });
}
