export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
export const API_TIMEOUT = 30000;

export const CERTIFICATE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  REVOKED: "revoked",
  ACTIVE: "active",
};
