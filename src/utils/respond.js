import ApiResponse from "./apiResponse.js";

export const send = (res, statusCode, message, data = null) =>
  res.status(statusCode).json(new ApiResponse(statusCode, message, data));

export const ok = (res, message, data = null) => send(res, 200, message, data);

export const created = (res, message, data = null) => send(res, 201, message, data);
