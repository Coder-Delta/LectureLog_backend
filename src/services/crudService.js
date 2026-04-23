import ApiError from "../utils/apiError.js";
import { createEntity, updateTimestamp } from "../data/store.js";

const requireEntity = (collection, id, label) => {
  const item = collection.find((entry) => entry.id === id);
  if (!item) {
    throw new ApiError(404, `${label} not found`);
  }
  return item;
};

export const createItem = (collection, payload) => {
  const item = createEntity(payload);
  collection.push(item);
  return item;
};

export const listItems = (collection) => collection;

export const getItemById = (collection, id, label) => requireEntity(collection, id, label);

export const updateItemById = (collection, id, payload, label) => {
  const index = collection.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new ApiError(404, `${label} not found`);
  }
  const next = updateTimestamp({ ...collection[index], ...payload });
  collection[index] = next;
  return next;
};

export const deleteItemById = (collection, id, label) => {
  const index = collection.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new ApiError(404, `${label} not found`);
  }
  const [deleted] = collection.splice(index, 1);
  return deleted;
};
