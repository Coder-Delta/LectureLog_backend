import { randomUUID } from "node:crypto";

export const nowIso = () => new Date().toISOString();

export const withBaseRow = (payload) => {
  const timestamp = nowIso();

  return {
    id: randomUUID(),
    created_at: timestamp,
    updated_at: timestamp,
    ...payload
  };
};

export const normalizeEmail = (value) => String(value).trim().toLowerCase();

export const defineSqlModel = ({
  name,
  table,
  columns,
  indexes = [],
  foreignKeys = [],
  checks = []
}) => ({
  name,
  table,
  primaryKey: ["id"],
  columns: {
    id: { type: "uuid", nullable: false, default: "gen_random_uuid()" },
    created_at: { type: "timestamptz", nullable: false, default: "now()" },
    updated_at: { type: "timestamptz", nullable: false, default: "now()" },
    ...columns
  },
  indexes,
  foreignKeys,
  checks
});
