import ApiError from "../utils/apiError.js";

export const notFoundHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const apiErrorHandler = (error, _req, res, _next) => {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const message = error.message || "Internal server error";
  const details = error instanceof ApiError ? error.details : null;

  res.status(statusCode).json({
    statusCode,
    message,
    data: details,
    success: false
  });
};
