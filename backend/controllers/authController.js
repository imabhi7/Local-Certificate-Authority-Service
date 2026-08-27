import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import otpGenerator from "otp-generator";
import { sendOTPEmail } from "../services/emailService.js";

const generateOTP = () => {
  return otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
    digits: true,
  });
};

const signup = async (req, res) => {
  const { username, email, password, role = "client" } = req.body;
  try {
    // Check if username exists
    const usernameCheck = await prisma.users.findUnique({
      where: { username },
      select: { id: true, email: true, is_verified: true },
    });
    if (usernameCheck?.is_verified) {
      return res.status(400).json({ error: "username_taken" });
    }

    // Check if email exists
    const emailCheck = await prisma.users.findUnique({
      where: { email },
      select: { id: true, username: true, is_verified: true },
    });
    if (emailCheck?.is_verified) {
      return res.status(400).json({ error: "email_taken" });
    }

    if (usernameCheck && emailCheck && usernameCheck.id !== emailCheck.id) {
      return res.status(400).json({ error: "account_conflict" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    const pendingUser = usernameCheck || emailCheck;
    const result = pendingUser
      ? await prisma.users.update({
          where: { id: pendingUser.id },
          data: {
            username,
            email,
            password: hashedPassword,
            role,
            otp,
            otp_expiry: otpExpiry,
            is_verified: false,
          },
          select: { id: true, role: true },
        })
      : await prisma.users.create({
          data: {
            username,
            email,
            password: hashedPassword,
            role,
            otp,
            otp_expiry: otpExpiry,
          },
          select: { id: true, role: true },
        });

    // Send OTP email
    await sendOTPEmail(email, otp, "signup");

    res.status(201).json({
      message:
        "User registered successfully. Please verify your email with the OTP sent.",
      userId: result.id,
      role: result.role,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: err.message });
  }
};

const verifyEmail = async (req, res) => {
  const { email, otp } = req.body;
  try {
    console.log(`Verifying OTP for email: ${email}, otp: ${otp}`);
    const result = await prisma.users.findFirst({
      where: { email, otp, otp_expiry: { gt: new Date() } },
    });

    if (!result) {
      console.log(`Invalid or expired OTP for email: ${email}`);
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Update user verification status
    await prisma.users.update({
      where: { email },
      data: { is_verified: true, otp: null, otp_expiry: null },
    });

    res.json({ message: "Email verified successfully", success: true });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: err.message });
  }
};

const signin = async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log(`Attempting login for username: "${username}"`);

    // 1. Find user by username
    const user = await prisma.users.findUnique({
      where: { username: username.trim() },
    });

    console.log(`User query returned ${user ? 1 : 0} results`);

    if (!user) {
      console.log("User not found in database");
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    console.log(
      `Found user: ${user.username}, role: ${user.role}, verified: ${user.is_verified}`
    );

    // Skip verification for admin users (for testing only)
    if (user.role === "admin" && !user.is_verified) {
      console.log("Admin user not verified - updating verification status");
      await prisma.users.update({
        where: { id: user.id },
        data: { is_verified: true },
      });
      user.is_verified = true;
    }

    // 2. Verify password
    console.log("Verifying password...");
    const isPasswordValid = await bcrypt.compare(
      password.trim(),
      user.password
    );

    console.log(`Password verification result: ${isPasswordValid}`);

    if (!isPasswordValid) {
      console.log("Password verification failed");
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // 3. Check if user is verified
    if (!user.is_verified && user.role !== "admin") {
      console.log("User not verified");
      return res.status(401).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    // 4. Generate JWT token
    console.log("Generating JWT token");
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log("Login successful, sending response");
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Signin error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    await prisma.users.update({
      where: { email },
      data: { otp, otp_expiry: otpExpiry },
    });
    await sendOTPEmail(email, otp, "resetPassword");

    res.json({ message: "Password reset OTP has been sent to your email" });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: err.message });
  }
};

const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    console.log(`Reset password attempt for email: ${email}, otp: ${otp}`);
    // Check if user exists
    const user = await prisma.users.findUnique({ where: { email } });

    if (!user) {
      console.log(`User not found for email: ${email}`);
      return res.status(404).json({ error: "User not found" });
    }

    // Since OTP was verified in verifyEmail, we only check user existence
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.users.update({
      where: { email },
      data: { password: hashedPassword },
    });

    console.log(`Password reset successful for email: ${email}`);
    res.json({ message: "Password reset successful", success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: err.message });
  }
};

export { signup, verifyEmail, signin, forgotPassword, resetPassword };
