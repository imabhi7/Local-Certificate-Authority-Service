import express from "express";
const router = express.Router();
import {
  getPendingCSRs,
  getAllCSRs,
  getUserCSRs,
  getIssuedCertificates,
  approveCSR,
  rejectCSR,
  deactivateOldCertificates,
  submitCSR,
  generateCSR,
  downloadFile,
  downloadCertificate,
} from "../controllers/certificateController.js";
import { authenticateToken, authorizeAdmin } from "../middleware/auth.js";

router.post("/generate-csr", authenticateToken, generateCSR);
router.post("/submit", authenticateToken, submitCSR);
router.get("/download/:filename", authenticateToken, downloadFile);
router.get("/download-cert/:certId", authenticateToken, downloadCertificate);
router.get("/pending-csrs", authenticateToken, authorizeAdmin, getPendingCSRs);
router.get("/all-csrs", authenticateToken, authorizeAdmin, getAllCSRs);
router.get("/csrs", authenticateToken, getUserCSRs);
router.get("/issued", authenticateToken, getIssuedCertificates);
router.post("/approve/:csrId", authenticateToken, authorizeAdmin, approveCSR);
router.post("/reject/:csrId", authenticateToken, authorizeAdmin, rejectCSR);
router.post("/deactivate-old", authenticateToken, authorizeAdmin, deactivateOldCertificates);

export default router;