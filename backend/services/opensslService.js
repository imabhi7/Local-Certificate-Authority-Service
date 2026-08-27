import openssl from "openssl-nodejs";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

const CSR_DIR = path.join(moduleDirectory, "csrs");

// Ensure the directory exists
if (!fs.existsSync(CSR_DIR)) {
  fs.mkdirSync(CSR_DIR);
}

// API to generate CSR
app.post("/api/generate-csr", (req, res) => {
  const { domain, company, division, city, state, country, email, rootLength, signatureAlgorithm } = req.body;

  if (!domain || !company || !division || !city || !state || !country || !email) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const privateKeyPath = path.join(CSR_DIR, `${domain}-private.key`);
  const csrPath = path.join(CSR_DIR, `${domain}.csr`);

  // OpenSSL config file contents
  const configContent = `
[ req ]
default_bits = ${rootLength}
distinguished_name = req_distinguished_name
prompt = no

[ req_distinguished_name ]
CN = ${domain}
O = ${company}
OU = ${division}
L = ${city}
ST = ${state}
C = ${country}
emailAddress = ${email}
  `;

  const configPath = path.join(CSR_DIR, `${domain}-config.cnf`);
  fs.writeFileSync(configPath, configContent);

  // OpenSSL command to generate CSR and private key
  const opensslCommand = `openssl req -new -newkey rsa:${rootLength} -nodes -keyout "${privateKeyPath}" -out "${csrPath}" -config "${configPath}" -${signatureAlgorithm.toLowerCase()}`;

  exec(opensslCommand, (error, stdout, stderr) => {
    if (error) {
      console.error("Error generating CSR:", error);
      return res.status(500).json({ success: false, message: "CSR generation failed" });
    }

    console.log("CSR generated successfully:", stdout);
    res.json({
      success: true,
      message: "CSR generated successfully",
      csrFile: `${domain}.csr`,
      privateKeyFile: `${domain}-private.key`,
    });
  });
});

export const generateCSR = (csrDetails) => {
  return new Promise((resolve, reject) => {
    const { commonName, organization, country, state, city, email } = csrDetails;

    const subj = `/CN=${commonName}/O=${organization}/C=${country}/ST=${state}/L=${city}/emailAddress=${email}`;

    // OpenSSL command to generate a private key and CSR
    const opensslCmd = [
      'req', '-new',
      '-newkey', 'rsa:2048',
      '-nodes',
      '-keyout', '/dev/stdout',
      '-out', '/dev/stdout',
      '-subj', subj
    ];

    openssl(opensslCmd, (err, buffer) => {
      if (err) return reject(new Error('OpenSSL CSR generation failed'));

      // OpenSSL outputs both the private key and CSR together
      const output = buffer.toString();
      const privateKeyMatch = output.match(/(-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----)/);
      const csrMatch = output.match(/(-----BEGIN CERTIFICATE REQUEST-----[\s\S]+?-----END CERTIFICATE REQUEST-----)/);

      if (!privateKeyMatch || !csrMatch) {
        return reject(new Error('Failed to parse OpenSSL output'));
      }

      resolve({
        privateKey: privateKeyMatch[1],
        csr: csrMatch[1]
      });
    });
  });
};