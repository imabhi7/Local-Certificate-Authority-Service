const pool = require("../config/db");
const forge = require("node-forge");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const { exec } = require("child_process");
const nodemailer = require("nodemailer");

const CSR_DIR = path.join(__dirname, "../csr_files");
const CERT_DIR = path.join(__dirname, "../certificates");
const CA_CERT_PATH = path.join(__dirname, "../certs/ca-cert.pem");
const CA_KEY_PATH = path.join(__dirname, "../certs/ca-key.pem");

// Ensure CSR and Certificate directories exist
if (!fs.existsSync(CSR_DIR)) {
  fs.mkdirSync(CSR_DIR, { recursive: true });
}
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

exports.generateCSR = async (req, res) => {
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
    const userCheck = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (userCheck.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const user_id = userCheck.rows[0].id;

    // Generate CSR and private key
    const tempId = Date.now();
    const csrFilePath = path.join(CSR_DIR, `csr_${tempId}.pem`);
    const privateKeyPath = path.join(CSR_DIR, `key_${tempId}.pem`);

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
    const insertQuery = `
      INSERT INTO csr_requests (user_id, domain, company, division, city, state, country, email, root_length, csr, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      RETURNING id, created_at;
    `;
    const values = [
      user_id,
      domain,
      company,
      division,
      city,
      state,
      country,
      email,
      rootLength,
      csrContent,
    ];
    const result = await pool.query(insertQuery, values);
    const csrId = result.rows[0].id;
    const created_at = result.rows[0].created_at;

    // Rename CSR file to match database ID
    if (tempId !== csrId) {
      const newCsrFilePath = path.join(CSR_DIR, `csr_${csrId}.pem`);
      await fsPromises.rename(csrFilePath, newCsrFilePath);
      console.log(`Renamed ${csrFilePath} to ${newCsrFilePath}`);
    }

    // Delete private key
    try {
      await fsPromises.unlink(privateKeyPath);
      console.log(`Deleted private key: ${privateKeyPath}`);
    } catch (unlinkError) {
      console.warn(`Failed to delete private key: ${unlinkError.message}`);
    }

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

exports.submitCSR = async (req, res) => {
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

    const result = await pool.query(
      `INSERT INTO csr_requests (user_id, domain, company, division, city, state, country, email, root_length, csr, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
       RETURNING id, domain, status, created_at`,
      [
        userId,
        domain,
        company,
        division,
        city,
        state,
        country,
        email,
        root_length,
        csr,
      ]
    );

    const csrFilePath = path.join(CSR_DIR, `csr_${result.rows[0].id}.pem`);
    await fsPromises.writeFile(csrFilePath, csr);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error submitting CSR:", error);
    res.status(500).json({ success: false, message: "Error submitting CSR" });
  }
};

exports.downloadFile = async (req, res) => {
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
    const csrCheck = await pool.query(
      "SELECT user_id, domain, csr FROM csr_requests WHERE id = $1",
      [csrId]
    );
    if (csrCheck.rowCount === 0 || csrCheck.rows[0].user_id !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized to download this CSR" });
    }

    // Try serving the file
    const filePath = path.join(CSR_DIR, fileName);
    if (fs.existsSync(filePath)) {
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error("Error downloading file:", err);
          res
            .status(500)
            .json({ success: false, message: "Error downloading file" });
        }
      });
    } else {
      // Fallback to database content
      console.log(`File not found: ${filePath}, serving from database`);
      const { csr, domain } = csrCheck.rows[0];
      if (!csr) {
        return res.status(404).json({
          success: false,
          message: "CSR content not found in database",
        });
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      res.send(csr);
    }
  } catch (error) {
    console.error("Error in downloadFile:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.downloadCertificate = async (req, res) => {
  const { certId } = req.params;
  const userId = req.user.id;

  try {
    const cert = await pool.query(
      `SELECT certificate, domain
       FROM issued_certificates
       WHERE id = $1 AND user_id = $2`,
      [certId, userId]
    );

    if (cert.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found or not authorized",
      });
    }

    const { certificate, domain } = cert.rows[0];
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

exports.getUserCSRs = async (req, res) => {
  try {
    const userId = req.user.id;
    const csrs = await pool.query(
      `SELECT c.id, c.domain, c.csr, c.status, c.rejection_reason, c.created_at
       FROM csr_requests c
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
    res.json({ success: true, data: csrs.rows });
  } catch (error) {
    console.error("Error fetching user CSRs:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching user CSRs" });
  }
};

exports.getIssuedCertificates = async (req, res) => {
  try {
    const userId = req.user.id;
    const certificates = await pool.query(
      `SELECT ic.id, ic.domain, ic.certificate, ic.status, ic.issued_at, ic.valid_till
       FROM issued_certificates ic
       WHERE ic.user_id = $1
       ORDER BY ic.issued_at DESC`,
      [userId]
    );
    res.json({ success: true, data: certificates.rows });
  } catch (error) {
    console.error("Error fetching issued certificates:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching issued certificates" });
  }
};

exports.getPendingCSRs = async (req, res) => {
  try {
    const csrs = await pool.query(
      `SELECT c.id, c.domain, c.csr, c.status, c.rejection_reason, c.created_at, u.username, u.email
       FROM csr_requests c
       JOIN users u ON c.user_id = u.id
       WHERE c.status = 'pending'
       ORDER BY c.created_at DESC`
    );
    res.json({ success: true, data: csrs.rows });
  } catch (error) {
    console.error("Error fetching pending CSRs:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching pending CSRs" });
  }
};

exports.getAllCSRs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // Fetch paginated CSRs
    const csrs = await pool.query(
      `SELECT c.id, c.domain, c.csr, c.status, c.rejection_reason, c.created_at, u.username, u.email
       FROM csr_requests c
       JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Fetch total count for pagination
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM csr_requests`
    );
    const total = parseInt(totalResult.rows[0].total);

    res.json({
      success: true,
      data: csrs.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + csrs.rows.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching all CSRs:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching all CSRs" });
  }
};

exports.getUserDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM csr_requests WHERE user_id = $1) AS total_csrs,
        (SELECT COUNT(*) FROM csr_requests WHERE user_id = $1 AND status = 'pending') AS pending_csrs,
        (SELECT COUNT(*) FROM csr_requests WHERE user_id = $1 AND status = 'approved') AS approved_csrs,
        (SELECT COUNT(*) FROM issued_certificates WHERE user_id = $1 AND status = 'active') AS active_certs`,
      [userId]
    );
    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    console.error("Error fetching user dashboard stats:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching user dashboard stats" });
  }
};

exports.getAdminDashboardStats = async (req, res) => {
  try {
    const stats = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM csr_requests) AS total_csrs,
        (SELECT COUNT(*) FROM csr_requests WHERE status = 'pending') AS pending_csrs,
        (SELECT COUNT(*) FROM csr_requests WHERE status = 'approved') AS approved_csrs,
        (SELECT COUNT(*) FROM issued_certificates WHERE status = 'active') AS active_certs`
    );
    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admin dashboard stats",
    });
  }
};

exports.approveCSR = async (req, res) => {
  const { csrId } = req.params;
  try {
    const csrResult = await pool.query(
      `SELECT c.*, u.email, u.username 
       FROM csr_requests c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.id = $1 AND c.status = 'pending'`,
      [csrId]
    );

    if (csrResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "CSR not found or already processed",
      });
    }

    const { id, domain, csr, user_id, email, username } = csrResult.rows[0];

    await pool.query(
      `UPDATE csr_requests SET status = 'approved'
       WHERE id = $1
       RETURNING id, domain, status`,
      [csrId]
    );

    let caCertPem, caKeyPem;
    try {
      caCertPem = await fsPromises.readFile(CA_CERT_PATH, "utf8");
      caKeyPem = await fsPromises.readFile(CA_KEY_PATH, "utf8");
    } catch (fileError) {
      console.error("Error reading CA files:", fileError);
      throw new Error("CA certificate or key not found");
    }

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

    const issuedCert = await pool.query(
      `INSERT INTO issued_certificates (user_id, csr_id, domain, certificate, status, valid_till)
       VALUES ($1, $2, $3, $4, 'active', $5)
       RETURNING id, domain, issued_at, valid_till`,
      [user_id, id, domain, certPem, new Date(cert.validity.notAfter)]
    );

    const certFilePath = path.join(CERT_DIR, `cert_${id}.pem`);
    await fsPromises.writeFile(certFilePath, certPem);

    await sendCertificateApprovalEmail(
      email,
      username,
      domain,
      issuedCert.rows[0].id
    );

    res.json({
      success: true,
      message: "CSR approved and certificate issued",
      data: issuedCert.rows[0],
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

exports.rejectCSR = async (req, res) => {
  try {
    const { csrId } = req.params;
    const { reason = "No reason provided" } = req.body;

    const csrResult = await pool.query(
      `SELECT c.*, u.email, u.username FROM csr_requests c JOIN users u ON c.user_id = u.id WHERE c.id = $1 AND c.status = 'pending'`,
      [csrId]
    );

    if (csrResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "CSR not found or already processed",
      });
    }

    const csrData = csrResult.rows[0];

    const rejectedCsr = await pool.query(
      "UPDATE csr_requests SET status = 'rejected', rejection_reason = $1 WHERE id = $2 RETURNING id, domain, status, rejection_reason",
      [reason, csrId]
    );

    await sendCertificateRejectionEmail(
      csrData.email,
      csrData.username,
      csrData.domain,
      reason
    );

    res.json({
      success: true,
      message: "CSR rejected successfully",
      data: rejectedCsr.rows[0],
    });
  } catch (error) {
    console.error("Error rejecting CSR:", error);
    res.status(500).json({ success: false, message: "Error rejecting CSR" });
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
