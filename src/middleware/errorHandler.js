import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

export const notFoundHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const apiErrorHandler = (error, _req, res, _next) => {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const message = error.message || "Internal server error";
  const details = error instanceof ApiError ? error.details : null;

  res.status(statusCode).json(new ApiResponse(statusCode, message, details));
};
