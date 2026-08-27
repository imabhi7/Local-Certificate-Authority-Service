import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import cron from "node-cron";
import dotenv from "dotenv";
import prisma from "./config/prisma.js";
import authRoutes from "./routes/auth.js";
import certificateRoutes from "./routes/certificates.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import { seedCaCredentials } from "./services/caCredentials.js";
import { deactivateExpiredCertificates } from "./services/certificateDeactivation.js";

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
      console.log(`Admin user created successfully with ID: ${result.id}`);
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
        console.log("Admin user updated successfully");
      }
    }
  } catch (err) {
    console.error("Error with admin user:", err);
  }
};

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 5001;

const runCertificateDeactivationJob = async () => {
  try {
    const result = await deactivateExpiredCertificates();
    console.log("Certificate deactivation job completed:", result);
  } catch (error) {
    console.error("Certificate deactivation job failed:", error);
  }
};

cron.schedule("0 0 * * *", runCertificateDeactivationJob);

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await seedCaCredentials();
  await createAdminIfNotExists();
  await runCertificateDeactivationJob();
});
