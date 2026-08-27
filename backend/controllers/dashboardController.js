import prisma from "../config/prisma.js";

const getAdminDashboard = async (req, res) => {
  try {
    const [pendingCsrs, totalCsrs, activeCerts, totalUsers] = await Promise.all([
      prisma.csr_requests.count({ where: { status: "pending" } }),
      prisma.csr_requests.count(),
      prisma.issued_certificates.count({ where: { status: "active" } }),
      prisma.users.count({ where: { role: "client" } }),
    ]);
    res.json({
      success: true,
      data: {
        pending_csrs: String(pendingCsrs),
        total_csrs: String(totalCsrs),
        active_certs: String(activeCerts),
        total_users: String(totalUsers),
      },
    });
  } catch (error) {
    console.error("Error fetching admin dashboard:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching admin dashboard" });
  }
};

const getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const [pendingCsrs, totalCsrs, activeCerts] = await Promise.all([
      prisma.csr_requests.count({ where: { user_id: userId, status: "pending" } }),
      prisma.csr_requests.count({ where: { user_id: userId } }),
      prisma.issued_certificates.count({ where: { user_id: userId, status: "active" } }),
    ]);
    res.json({
      success: true,
      data: {
        pending_csrs: String(pendingCsrs),
        total_csrs: String(totalCsrs),
        active_certs: String(activeCerts),
      },
    });
  } catch (error) {
    console.error("Error fetching user dashboard:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching user dashboard" });
  }
};

export { getAdminDashboard, getUserDashboard };
