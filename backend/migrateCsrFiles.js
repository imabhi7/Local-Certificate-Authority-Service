import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "./config/prisma.js";

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);
const CSR_DIR = path.join(moduleDirectory, "csr_files"); // Correct path: backend/csr_files

async function migrateCsrFiles() {
  try {
    const csrs = await prisma.csr_requests.findMany({ select: { id: true, domain: true } });
    console.log(`Found ${csrs.length} CSRs in the database`);

    for (const { id, domain } of csrs) {
      const newFile = path.join(CSR_DIR, `csr_${id}.pem`);
      const legacyFiles = [
        path.join(CSR_DIR, `csr_${domain}.pem`), // e.g., csr_caauth.com.pem
        path.join(CSR_DIR, `${domain}.csr`), // e.g., caauth.com.csr
      ];

      console.log(`Checking CSR ID=${id}, domain=${domain}`);
      if (
        await fs
          .access(newFile)
          .then(() => true)
          .catch(() => false)
      ) {
        console.log(`  Already exists: ${newFile}`);
        continue;
      }

      for (const oldFile of legacyFiles) {
        if (
          await fs
            .access(oldFile)
            .then(() => true)
            .catch(() => false)
        ) {
          await fs.rename(oldFile, newFile);
          console.log(`  Renamed ${oldFile} to ${newFile}`);
        } else {
          console.log(`  Not found: ${oldFile}`);
        }
      }
    }
    console.log("CSR file migration complete");
  } catch (error) {
    console.error("Error migrating CSR files:", error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateCsrFiles();
