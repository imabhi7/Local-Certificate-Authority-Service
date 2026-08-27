import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);

dotenv.config({ path: path.join(moduleDirectory, "../.env") });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendOTPEmail = async (email, otp, purpose) => {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const type = purpose === "signup" ? "signup" : "reset";
  const verifyUrl = `${baseUrl}/verify-otp?email=${encodeURIComponent(
    email
  )}&type=${type}`;
  console.log(`Sending OTP email to ${email} with verify URL: ${verifyUrl}`);

  const subjectMap = {
    signup: "Email Verification OTP for Signup",
    resetPassword: "Password Reset OTP",
  };

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: subjectMap[purpose],
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; border-radius: 10px; max-width: 600px; margin: auto; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://i.imgur.com/RkL1FrV.png" alt="Company Logo" style="max-width: 150px; border-radius: 5px;">
        </div>
        <div style="background-color: #ffffff; padding: 20px; border-radius: 10px;">
          <h2 style="color: #333333; text-align: center; font-size: 24px; margin-bottom: 10px;">
            ${
              purpose === "signup"
                ? "Welcome to Our Service!"
                : "Password Reset Request"
            }
          </h2>
          <p style="font-size: 16px; color: #555555; text-align: center; margin-bottom: 20px;">
            Your ${
              purpose === "signup" ? "email verification" : "password reset"
            } OTP is:
          </p>
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 28px; font-weight: bold; color: #4CAF50; background-color: #f0f0f0; padding: 10px 20px; border-radius: 5px; letter-spacing: 3px;">
              ${otp}
            </span>
          </div>
          <p style="font-size: 14px; color: #777777; text-align: center; margin-bottom: 10px;">
            This OTP will expire in <strong>10 minutes</strong>.
          </p>
          <p style="font-size: 14px; color: #777777; text-align: center; margin-bottom: 20px;">
            If you did not request this, please ignore this email.
          </p>
          <div style="text-align: center; margin-top: 20px;">
            <a href="${verifyUrl}" style="text-decoration: none; background-color: #4CAF50; color: white; padding: 10px 30px; border-radius: 5px; font-size: 16px;">
              Verify Now
            </a>
          </div>
          <p style="font-size: 14px; color: #777777; text-align: center; margin-top: 10px;">
            Or paste this link in your browser: <a href="${verifyUrl}">${verifyUrl}</a>
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px;">
          <p style="font-size: 12px; color: #999999;">
            © ${new Date().getFullYear()} Your Company Name. All rights reserved.
          </p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email} with type: ${type}`);
    return true;
  } catch (error) {
    console.error("Email sending failed:", error.message);

    if (error.responseCode === 534 || error.code === "EAUTH") {
      throw new Error(
        "Gmail rejected the SMTP login. Enable 2-Step Verification and set EMAIL_PASSWORD to a Google App Password."
      );
    }

    throw new Error("Failed to send OTP email");
  }
};

const sendCertificateDeactivationEmail = async (
  email,
  username,
  domain,
  issuedAt
) => {
  const issuedDate = new Date(issuedAt).toLocaleDateString();
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Certificate deactivated for ${domain}`,
    text: `Hello ${username || "there"}, your certificate for ${domain} was deactivated because it has been active for one month (issued ${issuedDate}).`,
  });
};

export { sendOTPEmail, sendCertificateDeactivationEmail };
