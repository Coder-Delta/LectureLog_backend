import { ApiError } from "./index.js";

export const assertRequired = (payload, fields) => {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === "");
  if (missing.length > 0) {
    throw new ApiError(400, `Missing required fields: ${missing.join(", ")}`);
  }
};
