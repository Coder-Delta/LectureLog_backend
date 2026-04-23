import { randomUUID } from "node:crypto";

export const store = {
  users: [{ id: "u1", name: "Admin User", email: "admin@lecturelog.dev", role: "admin" }],
  sessions: [],
  students: [],
  classrooms: [],
  subjects: [],
  attendances: [],
  rechecks: [],
  authTokens: new Map()
};

export const createEntity = (payload) => ({
  id: randomUUID(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...payload
});

export const updateTimestamp = (entity) => ({
  ...entity,
  updatedAt: new Date().toISOString()
});
