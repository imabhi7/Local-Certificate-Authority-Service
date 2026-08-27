import dotenv from "dotenv";
import bcrypt from "bcrypt";
import prisma from "./config/prisma.js";

dotenv.config();

async function resetAdminUser() {
  try {
    console.log("Connecting to database...");
    console.log("Deleting existing admin user if exists...");
    await prisma.users.deleteMany({ where: { username: "admin" } });

      // Create a new admin user with a known password
      const adminPassword = "admin123";
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      console.log("Creating new admin user...");
      const result = await prisma.users.create({
        data: {
          username: "admin",
          email: "admin@example.com",
          password: hashedPassword,
          role: "admin",
          is_verified: true,
        },
        select: { id: true },
      });

      console.log(
        `Admin user created successfully with ID: ${result.id}`
      );
      console.log(`Username: admin`);
      console.log(`Password: ${adminPassword}`);
  } catch (err) {
    console.error("Error resetting admin user:", err);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminUser();
