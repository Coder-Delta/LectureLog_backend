import { defineSqlModel, normalizeEmail, withBaseRow } from "./base.model.js";

export const USER_ROLES = ["admin", "faculty", "student"];

export const userModel = defineSqlModel({
  name: "User",
  table: "users",
  columns: {
    name: { type: "varchar(120)", nullable: false },
    email: { type: "varchar(255)", nullable: false, unique: true },
    password_hash: { type: "text", nullable: true },
    role: { type: "varchar(20)", nullable: false, default: "'student'" },
    phone: { type: "varchar(30)", nullable: true },
    avatar_url: { type: "text", nullable: true },
    is_active: { type: "boolean", nullable: false, default: "true" },
    last_login_at: { type: "timestamptz", nullable: true }
  },
  indexes: [
    { name: "idx_users_role_active", columns: ["role", "is_active"] }
  ],
  checks: [
    {
      name: "chk_users_role",
      expression: `role IN (${USER_ROLES.map((role) => `'${role}'`).join(", ")})`
    }
  ]
});

export const createUser = ({
  name,
  email,
  role = "student",
  phone = null,
  avatarUrl = null,
  passwordHash = null,
  isActive = true,
  lastLoginAt = null
}) =>
  withBaseRow({
    name: String(name).trim(),
    email: normalizeEmail(email),
    role,
    phone,
    avatar_url: avatarUrl,
    password_hash: passwordHash,
    is_active: isActive,
    last_login_at: lastLoginAt
  });

export default userModel;
