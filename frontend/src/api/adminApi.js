import axios from "axios";
import { API_BASE_URL, API_TIMEOUT } from "./apiConfig";

const adminApi = axios.create({
  baseURL: `${API_BASE_URL}/certificate`,
  timeout: API_TIMEOUT,
});

export const getPendingCSRs = async () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("No token found");
    const response = await adminApi.get("/pending-csrs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching pending CSRs:", error);
    throw error;
  }
};

export const getAllCSRs = async (limit = 10, offset = 0) => {
  try {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("No token found");
    const response = await adminApi.get("/all-csrs", {
      params: { limit, offset },
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching all CSRs:", error);
    throw error;
  }
};

export const approveCSR = async (csrId) => {
  try {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("No token found");
    const response = await adminApi.post(
      `/approve/${csrId}`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error approving CSR:", error);
    throw error;
  }
};

export const rejectCSR = async (csrId, reason) => {
  try {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("No token found");
    const response = await adminApi.post(
      `/reject/${csrId}`,
      { reason },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error rejecting CSR:", error);
    throw error;
  }
};

export const deactivateOldCertificates = async () => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("No token found");
  const response = await adminApi.post(
    "/deactivate-old",
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

// Admin Certificate Operations
export const getAllCertificates = async () => {
  try {
    const token = localStorage.getItem("token");
    const response = await adminApi.get("/issued", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching certificates:", error);
    return { success: false, message: "Failed to fetch certificates" };
  }
};

export const revokeCertificate = async (certificateId, reason = "") => {
  try {
    const token = localStorage.getItem("token");
    const response = await adminApi.post(
      "/revoke",
      { certificate_id: certificateId, reason },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.error("Error revoking certificate:", error);
    return { success: false, message: "Failed to revoke certificate" };
  }
};

export const getRevokedCertificates = async () => {
  try {
    const token = localStorage.getItem("token");
    const response = await adminApi.get("/revoked", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching revoked certificates:", error);
    return { success: false, message: "Failed to fetch revoked certificates" };
  }
};

// Admin Statistics
export const getCertificateStats = async () => {
  try {
    const token = localStorage.getItem("token");
    const response = await adminApi.get("/stats/certificates", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching certificate stats:", error);
    return { success: false, message: "Failed to fetch stats" };
  }
};
