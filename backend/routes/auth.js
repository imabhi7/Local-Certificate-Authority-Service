import express from "express";
const router = express.Router();
import * as authController from "../controllers/authController.js";
import { authenticateToken, authorizeAdmin } from "../middleware/auth.js";

// Routes
router.post("/signin", authController.signin);
router.post("/signup", authController.signup);
router.post("/verify-email", authController.verifyEmail);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// Admin check route
router.get("/admin", authenticateToken, authorizeAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Welcome, Admin!",
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    },
  });
});

// User check route
router.get("/user", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Welcome, User!",
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    },
  });
});

export default router;