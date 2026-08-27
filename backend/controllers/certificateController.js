import prisma from "../config/prisma.js";
import forge from "node-forge";
import fs from "fs";
import { promises as fsPromises } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import nodemailer from "nodemailer";
import { getCaCredentials } from "../services/caCredentials.js";
import { deactivateExpiredCertificates } from "../services/certificateDeactivation.js";

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);
const CERT_DIR = path.join(moduleDirectory, "../certificates");

// Ensure certificate files can still be written for certificate issuance.
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
}

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Retry utility for email sending
async function withRetry(fn, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.warn(
        `Email attempt ${attempt} failed: ${error.message}. Retrying in ${delayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

const generateCSR = async (req, res) => {
  try {
    const {
      domain,
      company,
      division = "N/A",
      city,
      state,
      country,
      email,
      rootLength,
      username,
    } = req.body;

    if (
      !domain ||
      !company ||
      !city ||
      !state ||
      !country ||
      !email ||
      !rootLength ||
      !username
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Fetch user ID
    const user = await prisma.users.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const user_id = user.id;

    // Generate CSR and private key
    const tempDirectory = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), "local-ca-csr-")
    );
    const csrFilePath = path.join(tempDirectory, "request.pem");
    const privateKeyPath = path.join(tempDirectory, "private-key.pem");

    // Escape shell arguments
    const escapeShellArg = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;
    const subj = `/C=${escapeShellArg(country)}/ST=${escapeShellArg(
      state
    )}/L=${escapeShellArg(city)}/O=${escapeShellArg(
      company
    )}/OU=${escapeShellArg(division)}/CN=${escapeShellArg(
      domain
    )}/emailAddress=${escapeShellArg(email)}`;

    const opensslCmd = `openssl req -new -newkey rsa:${rootLength} -nodes -keyout ${escapeShellArg(
      privateKeyPath
    )} -out ${escapeShellArg(csrFilePath)} -subj ${subj}`;

    await new Promise((resolve, reject) => {
      exec(opensslCmd, (error, stdout, stderr) => {
        if (error) {
          console.error("OpenSSL error:", { error, stderr, stdout });
          reject(
            new Error(`CSR generation failed: ${stderr || error.message}`)
          );
        }
        resolve();
      });
    });

    // Read CSR and private key
    let csrContent, privateKeyContent;
    try {
      csrContent = await fsPromises.readFile(csrFilePath, "utf8");
      privateKeyContent = await fsPromises.readFile(privateKeyPath, "utf8");
    } catch (readError) {
      console.error("Error reading files:", readError);
      throw new Error(
        `Failed to read CSR or private key: ${readError.message}`
      );
    }

    // Insert into database
    const result = await prisma.csr_requests.create({
      data: {
        user_id,
        domain,
        company,
        division,
        city,
        state,
        country,
        email,
        root_length: Number(rootLength),
        csr: csrContent,
        status: "pending",
      },
      select: { id: true, created_at: true },
    });
    const csrId = result.id;
    const created_at = result.created_at;

    await Promise.all([
      fsPromises.unlink(csrFilePath),
      fsPromises.unlink(privateKeyPath),
      fsPromises.rmdir(tempDirectory),
    ]);

    res.status(201).json({
      success: true,
      message: "CSR generated successfully",
      csrFile: `csr_${csrId}.pem`,
      csr: csrContent,
      privateKey: privateKeyContent,
      data: { id: csrId, domain, status: "pending", created_at },
    });
  } catch (error) {
    console.error("Error in generateCSR:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

const submitCSR = async (req, res) => {
  const {
    domain,
    company,
    division = "N/A",
    city,
    state,
    country,
    email,
    root_length,
    csr,
  } = req.body;
  const userId = req.user.id;

  try {
    try {
      const csrObj = forge.pki.certificationRequestFromPem(csr);
      if (!csrObj.verify()) {
        return res.status(400).json({
          success: false,
          message: "Invalid CSR: signature verification failed",
        });
      }
    } catch (csrError) {
      console.error("Error parsing CSR:", csrError);
      return res.status(400).json({
        success: false,
        message: "Invalid CSR format",
      });
    }

    const result = await prisma.csr_requests.create({
      data: {
        user_id: userId,
        domain,
        company,
        division,
        city,
        state,
        country,
        email,
        root_length: Number(root_length),
        csr,
        status: "pending",
      },
      select: { id: true, domain: true, status: true, created_at: true },
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error("Error submitting CSR:", error);
    res.status(500).json({ success: false, message: "Error submitting CSR" });
  }
};

const downloadFile = async (req, res) => {
  const fileName = req.params.filename;
  const userId = req.user.id;

  try {
    // Extract CSR ID from filename
    const csrIdMatch = fileName.match(/^csr_(\d+)\.pem$/);
    if (!csrIdMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid CSR filename format" });
    }
    const csrId = csrIdMatch[1];

    // Verify user ownership
    const csrCheck = await prisma.csr_requests.findUnique({
      where: { id: Number(csrId) },
      select: { user_id: true, domain: true, csr: true },
    });
    if (!csrCheck || csrCheck.user_id !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized to download this CSR" });
    }

    if (!csrCheck.csr) {
      return res.status(404).json({
        success: false,
        message: "CSR content not found in database",
      });
    }

    res.setHeader("Content-Type", "application/pkcs10");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );
    res.send(csrCheck.csr);
  } catch (error) {
    console.error("Error in downloadFile:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const downloadCertificate = async (req, res) => {
  const { certId } = req.params;
  const userId = req.user.id;

  try {
    const cert = await prisma.issued_certificates.findFirst({
      where: { id: Number(certId), user_id: userId },
      select: { certificate: true, domain: true },
    });

    if (!cert) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found or not authorized",
      });
    }

    const { certificate, domain } = cert;
    const fileName = `${domain}_cert.pem`;

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(certificate);
  } catch (error) {
    console.error("Error downloading certificate:", error);
    res
      .status(500)
      .json({ success: false, message: "Error downloading certificate" });
  }
};

const getUserCSRs = async (req, res) => {
  try {
    const userId = req.user.id;
    const csrs = await prisma.csr_requests.findMany({
      where: { user_id: userId },
      select: { id: true, domain: true, csr: true, status: true, rejection_reason: true, created_at: true },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: csrs });
  } catch (error) {
    console.error("Error fetching user CSRs:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching user CSRs" });
  }
};

const getIssuedCertificates = async (req, res) => {
  try {
    const userId = req.user.id;
    const certificates = await prisma.issued_certificates.findMany({
      where: { user_id: userId },
      select: { id: true, domain: true, certificate: true, status: true, issued_at: true, valid_till: true },
      orderBy: { issued_at: "desc" },
    });
    res.json({ success: true, data: certificates });
  } catch (error) {
    console.error("Error fetching issued certificates:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching issued certificates" });
  }
};

const getPendingCSRs = async (req, res) => {
  try {
    const csrs = await prisma.csr_requests.findMany({
      where: { status: "pending" },
      select: {
        id: true, domain: true, csr: true, status: true, rejection_reason: true, created_at: true,
        users: { select: { username: true, email: true } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: csrs.map(({ users, ...csr }) => ({ ...csr, ...users })) });
  } catch (error) {
    console.error("Error fetching pending CSRs:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching pending CSRs" });
  }
};

const getAllCSRs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const [csrs, total] = await Promise.all([
      prisma.csr_requests.findMany({
        skip: offset,
        take: limit,
        select: {
          id: true, domain: true, csr: true, status: true, rejection_reason: true, created_at: true,
          users: { select: { username: true, email: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.csr_requests.count(),
    ]);
    const data = csrs.map(({ users, ...csr }) => ({ ...csr, ...users }));

    res.json({
      success: true,
      data,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + data.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching all CSRs:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching all CSRs" });
  }
};

const getUserDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const [totalCsrs, pendingCsrs, approvedCsrs, activeCerts] = await Promise.all([
      prisma.csr_requests.count({ where: { user_id: userId } }),
      prisma.csr_requests.count({ where: { user_id: userId, status: "pending" } }),
      prisma.csr_requests.count({ where: { user_id: userId, status: "approved" } }),
      prisma.issued_certificates.count({ where: { user_id: userId, status: "active" } }),
    ]);
    res.json({ success: true, data: { total_csrs: String(totalCsrs), pending_csrs: String(pendingCsrs), approved_csrs: String(approvedCsrs), active_certs: String(activeCerts) } });
  } catch (error) {
    console.error("Error fetching user dashboard stats:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching user dashboard stats" });
  }
};

const getAdminDashboardStats = async (req, res) => {
  try {
    const [totalCsrs, pendingCsrs, approvedCsrs, activeCerts] = await Promise.all([
      prisma.csr_requests.count(),
      prisma.csr_requests.count({ where: { status: "pending" } }),
      prisma.csr_requests.count({ where: { status: "approved" } }),
      prisma.issued_certificates.count({ where: { status: "active" } }),
    ]);
    res.json({ success: true, data: { total_csrs: String(totalCsrs), pending_csrs: String(pendingCsrs), approved_csrs: String(approvedCsrs), active_certs: String(activeCerts) } });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admin dashboard stats",
    });
  }
};

const approveCSR = async (req, res) => {
  const { csrId } = req.params;
  try {
    const csrResult = await prisma.csr_requests.findFirst({
      where: { id: Number(csrId), status: "pending" },
      include: { users: { select: { email: true, username: true } } },
    });

    if (!csrResult) {
      return res.status(404).json({
        success: false,
        message: "CSR not found or already processed",
      });
    }

    const { id, domain, csr, user_id, users } = csrResult;
    const { email, username } = users;

    await prisma.csr_requests.update({
      where: { id },
      data: { status: "approved" },
    });

    const { certificate: caCertPem, private_key: caKeyPem } =
      await getCaCredentials();

    let caCert, caKey;
    try {
      caCert = forge.pki.certificateFromPem(caCertPem);
      caKey = forge.pki.privateKeyFromPem(caKeyPem);
    } catch (parseError) {
      console.error("Error parsing CA certificate or key:", parseError);
      throw new Error("Invalid CA certificate or key format");
    }

    let csrObj;
    try {
      csrObj = forge.pki.certificationRequestFromPem(csr);
    } catch (csrError) {
      console.error("Error parsing CSR:", csrError);
      throw new Error("Invalid CSR format");
    }

    if (!csrObj.verify()) {
      throw new Error("Invalid CSR signature");
    }

    const cert = forge.pki.createCertificate();
    cert.publicKey = csrObj.publicKey;
    cert.serialNumber = Date.now().toString();
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(
      cert.validity.notBefore.getFullYear() + 1
    );

    cert.setSubject(csrObj.subject.attributes);
    cert.setIssuer(caCert.subject.attributes);

    cert.setExtensions([
      {
        name: "basicConstraints",
        cA: false,
      },
      {
        name: "keyUsage",
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: "extKeyUsage",
        serverAuth: true,
      },
      {
        name: "subjectAltName",
        altNames: [
          {
            type: 2,
            value: domain,
          },
        ],
      },
    ]);

    cert.sign(caKey, forge.md.sha256.create());
    const certPem = forge.pki.certificateToPem(cert);

    const issuedCert = await prisma.issued_certificates.create({
      data: {
        user_id,
        csr_id: id,
        domain,
        certificate: certPem,
        status: "active",
        valid_till: new Date(cert.validity.notAfter),
      },
      select: { id: true, domain: true, issued_at: true, valid_till: true },
    });

    const certFilePath = path.join(CERT_DIR, `cert_${id}.pem`);
    await fsPromises.writeFile(certFilePath, certPem);

    await sendCertificateApprovalEmail(
      email,
      username,
      domain,
      issuedCert.id
    );

    res.json({
      success: true,
      message: "CSR approved and certificate issued",
      data: issuedCert,
    });
  } catch (error) {
    console.error("Error approving CSR:", error);
    res.status(500).json({
      success: false,
      message: "Error approving CSR",
      error: error.message,
    });
  }
};

const rejectCSR = async (req, res) => {
  try {
    const { csrId } = req.params;
    const { reason = "No reason provided" } = req.body;

    const csrResult = await prisma.csr_requests.findFirst({
      where: { id: Number(csrId), status: "pending" },
      include: { users: { select: { email: true, username: true } } },
    });

    if (!csrResult) {
      return res.status(404).json({
        success: false,
        message: "CSR not found or already processed",
      });
    }

    const csrData = csrResult;

    const rejectedCsr = await prisma.csr_requests.update({
      where: { id: Number(csrId) },
      data: { status: "rejected", rejection_reason: reason },
      select: { id: true, domain: true, status: true, rejection_reason: true },
    });

    await sendCertificateRejectionEmail(
      csrData.users.email,
      csrData.users.username,
      csrData.domain,
      reason
    );

    res.json({
      success: true,
      message: "CSR rejected successfully",
      data: rejectedCsr,
    });
  } catch (error) {
    console.error("Error rejecting CSR:", error);
    res.status(500).json({ success: false, message: "Error rejecting CSR" });
  }
};

const deactivateOldCertificates = async (req, res) => {
  try {
    const result = await deactivateExpiredCertificates();
    res.json({
      success: true,
      message: `${result.deactivatedCount} certificate(s) deactivated`,
      ...result,
    });
  } catch (error) {
    console.error("Error deactivating old certificates:", error);
    res.status(500).json({
      success: false,
      message: "Error deactivating old certificates",
    });
  }
};

async function sendCertificateApprovalEmail(
  email,
  username,
  domain,
  certificateId
) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Certificate Issued for ${domain}`,
      html: `
        <h2>Certificate Issued</h2>
        <p>Dear ${username},</p>
        <p>Your CSR for domain <strong>${domain}</strong> has been approved, and a certificate has been issued.</p>
        <p>Certificate ID: ${certificateId}</p>
        <p>Please log in to your dashboard to download the certificate.</p>
        <p>Best regards,<br>Certificate Authority Team</p>
      `,
    };

    await withRetry(() => transporter.sendMail(mailOptions));
    console.log(`Approval email sent to ${email} for domain ${domain}`);
  } catch (error) {
    console.error("Error sending approval email:", error);
  }
}

async function sendCertificateRejectionEmail(email, username, domain, reason) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `CSR Rejected for ${domain}`,
      html: `
        <h2>CSR Rejected</h2>
        <p>Dear ${username},</p>
        <p>Your CSR for domain <strong>${domain}</strong> has been rejected.</p>
        <p>Reason: ${reason}</p>
        <p>Please review the rejection reason and submit a new CSR if necessary.</p>
        <p>Best regards,<br>Certificate Authority Team</p>
      `,
    };

    await withRetry(() => transporter.sendMail(mailOptions));
    console.log(`Rejection email sent to ${email} for domain ${domain}`);
  } catch (error) {
    console.error("Error sending rejection email:", error);
  }
}

export {
  generateCSR,
  submitCSR,
  downloadFile,
  downloadCertificate,
  getUserCSRs,
  getIssuedCertificates,
  getPendingCSRs,
  getAllCSRs,
  getUserDashboardStats,
  getAdminDashboardStats,
  approveCSR,
  rejectCSR,
  deactivateOldCertificates,
};
