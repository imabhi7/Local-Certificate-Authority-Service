import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);
const certificatePath = path.join(moduleDirectory, "../certs/ca-cert.pem");
const privateKeyPath = path.join(moduleDirectory, "../certs/ca-key.pem");

export async function seedCaCredentials() {
  const existingCredentials = await prisma.ca_credentials.findUnique({
    where: { id: 1 },
  });

  if (existingCredentials) return;

  const [certificate, privateKey] = await Promise.all([
    fs.readFile(certificatePath, "utf8"),
    fs.readFile(privateKeyPath, "utf8"),
  ]);

  await prisma.ca_credentials.create({
    data: {
      id: 1,
      certificate,
      private_key: privateKey,
    },
  });

  console.log("CA credentials stored in the database");
}

export async function getCaCredentials() {
  const credentials = await prisma.ca_credentials.findUnique({
    where: { id: 1 },
    select: { certificate: true, private_key: true },
  });

  if (!credentials) {
    throw new Error("CA credentials are not configured in the database");
  }

  return credentials;
}