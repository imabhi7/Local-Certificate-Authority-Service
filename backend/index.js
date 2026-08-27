import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import prisma from "./config/prisma.js";
import authRoutes from "./routes/auth.js";
import certificateRoutes from "./routes/certificates.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import { seedCaCredentials } from "./services/caCredentials.js";

dotenv.config();

const app = express();

const corsOptions = {
  origin: [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/certificate", certificateRoutes);
app.use("/api/dashboard", dashboardRoutes);


// Function to create admin user if it doesn't exist
const createAdminIfNotExists = async () => {
  try {
    // Check if admin exists
    const adminCheck = await prisma.users.findUnique({ where: { username: "admin" } });

    console.log(`Admin check found ${adminCheck ? 1 : 0} rows`);

    if (!adminCheck) {
      console.log("Admin user does not exist, creating...");
      const hashedPassword = await bcrypt.hash("admin@123", 10);
      const result = await prisma.users.create({
        data: {
          username: "admin",
          email: "caservice2025@gmail.com",
          password: hashedPassword,
          role: "admin",
          is_verified: true,
        },
        select: { id: true },
      });
      console.log(`✅ Admin user created successfully with ID: ${result.id}`);
    } else {
      const adminUser = adminCheck;
      console.log(
        `Admin user exists with ID: ${adminUser.id}, role: ${adminUser.role}, verified: ${adminUser.is_verified}`
      );

      if (adminUser.role !== "admin" || !adminUser.is_verified) {
        console.log("Updating admin user role and verification status");
        await prisma.users.update({
          where: { username: "admin" },
          data: { role: "admin", is_verified: true },
        });
        console.log("✅ Admin user updated successfully");
      }
    }
  } catch (err) {
    console.error("Error with admin user:", err);
  }
};

// Debug endpoint to check database connection
app.get("/api/debug/db", async (req, res) => {
  try {
    await prisma.users.count();
    res.json({
      success: true,
      message: "Database connection successful",
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Debug endpoint to check admin user
app.get("/api/debug/admin", async (req, res) => {
  try {
    const result = await prisma.users.findUnique({
      where: { username: "admin" },
      select: { id: true, username: true, email: true, role: true, is_verified: true },
    });
    if (result) {
      res.json({
        success: true,
        admin: result,
      });
    } else {
      res.json({
        success: false,
        message: "Admin user not found",
      });
    }
  } catch (error) {
    console.error("Admin check error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking admin user",
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  await seedCaCredentials();
  await createAdminIfNotExists();
});
