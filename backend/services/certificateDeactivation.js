import prisma from "../config/prisma.js";
import { sendCertificateDeactivationEmail } from "./emailService.js";

const getExpirationThreshold = () => {
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - 1);
  return threshold;
};

export async function deactivateExpiredCertificates() {
  const expiredCertificates = await prisma.issued_certificates.findMany({
    where: {
      status: "active",
      issued_at: { not: null, lte: getExpirationThreshold() },
    },
    select: {
      id: true,
      domain: true,
      issued_at: true,
      users: { select: { email: true, username: true } },
    },
  });

  let deactivatedCount = 0;
  let emailFailureCount = 0;

  for (const certificate of expiredCertificates) {
    const updated = await prisma.issued_certificates.updateMany({
      where: { id: certificate.id, status: "active" },
      data: { status: "deactivated" },
    });

    if (updated.count === 0) continue;
    deactivatedCount += 1;

    if (!certificate.users?.email) continue;
    try {
      await sendCertificateDeactivationEmail(
        certificate.users.email,
        certificate.users.username,
        certificate.domain,
        certificate.issued_at
      );
    } catch (error) {
      emailFailureCount += 1;
      console.error(
        `Deactivation email failed for certificate ${certificate.id}:`,
        error.message
      );
    }
  }

  return { deactivatedCount, emailFailureCount };
}