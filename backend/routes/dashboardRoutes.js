import express from "express";
const router = express.Router();
import {
  getAdminDashboardStats,
  getUserDashboardStats,
} from "../controllers/certificateController.js";
import { authenticateToken, authorizeAdmin } from "../middleware/auth.js";

router.get("/admin", authenticateToken, authorizeAdmin, getAdminDashboardStats);
router.get("/user", authenticateToken, getUserDashboardStats);

export default router;