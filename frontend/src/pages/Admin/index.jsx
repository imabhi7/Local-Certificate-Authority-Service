import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getPendingCSRs, getAllCSRs, approveCSR, rejectCSR } from '../../api/adminApi';
import { fetchAdminDashboard } from '../../api/dashboard';
import './Admin.css';

// Icons (unchanged)
const ShieldCheck = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const Shield = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const CheckCircle = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCSRs, setPendingCSRs] = useState([]);
  const [historyCSRs, setHistoryCSRs] = useState([]);
  const [displayedHistoryCSRs, setDisplayedHistoryCSRs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 10;

  const fetchData = async (isLoadMore = false) => {
    try {
      setLoading(!isLoadMore);
      const promises = [
        getPendingCSRs(),
        getAllCSRs(limit, isLoadMore ? offset : 0),
        fetchAdminDashboard(),
      ];

      const [pendingResponse, allResponse, statsData] = await Promise.all(promises);

      if (pendingResponse.success) {
        setPendingCSRs(pendingResponse.data);
      } else {
        setError('Failed to fetch pending CSRs');
      }

      if (allResponse.success) {
        // Filter out pending CSRs to show only approved/rejected in history
        const history = allResponse.data.filter(csr => csr.status !== 'pending');
        if (isLoadMore) {
          setDisplayedHistoryCSRs(prev => [...prev, ...history]);
        } else {
          setDisplayedHistoryCSRs(history);
        }
        setHistoryCSRs(allResponse.data);
        setHasMore(allResponse.pagination.hasMore);
        if (isLoadMore) {
          setOffset(prev => prev + limit);
        } else {
          setOffset(limit);
        }
      } else {
        setError('Failed to fetch history CSRs');
      }

      if (statsData) {
        setDashboardStats(statsData);
      } else {
        setError('Failed to fetch dashboard stats');
      }

      setError('');
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
      setError('Error fetching dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Polling for updates (every 5 minutes)
    const pollInterval = setInterval(() => fetchData(), 300000);
    return () => clearInterval(pollInterval);
  }, []);

  const handleLoadMore = () => {
    fetchData(true);
  };

  const handleApprove = async (csrId) => {
    try {
      const response = await approveCSR(csrId);
      if (response.success) {
        await fetchData();
        setError('');
      } else {
        setError(response.message || 'Failed to approve CSR');
      }
    } catch (err) {
      console.error('Error approving CSR:', err);
      setError('Error approving CSR');
    }
  };

  const handleReject = async (csrId, reason) => {
    try {
      const response = await rejectCSR(csrId, reason);
      if (response.success) {
        await fetchData();
        setError('');
      } else {
        setError(response.message || 'Failed to reject CSR');
      }
    } catch (err) {
      console.error('Error rejecting CSR:', err);
      setError('Error rejecting CSR');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.error('Error logging out:', err);
      setError('Error logging out');
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), 'MM/dd/yyyy HH:mm');
    } catch {
      return 'Invalid Date';
    }
  };

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header" data-aos="fade-down">
        <div className="header-content">
          <div className="logo-container">
            <ShieldCheck className="logo-icon" />
            <span className="logo-text">CA Service - Admin</span>
          </div>
          <div className="user-info">
            <span>Welcome, {user?.username || 'Admin'}</span>
            <button className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-welcome" data-aos="fade-up">
          <h1>Admin Dashboard</h1>
          <p>Manage certificate signing requests and certificates</p>
          {error && (
            <div className="error-message">
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Dashboard Stats */}
        <div className="dashboard-stats" data-aos="fade-up" data-aos-delay="100">
          <h2>System Statistics</h2>
          {loading ? (
            <div className="loading">Loading stats...</div>
          ) : dashboardStats ? (
            <div className="stats-grid">
              <div className="stat-card" data-aos="zoom-in" data-aos-delay="200">
                <Shield className="stat-icon" />
                <h3>Total CSRs</h3>
                <div className="stat-value">{dashboardStats.total_csrs}</div>
                <p>All CSR requests</p>
              </div>
              <div className="stat-card" data-aos="zoom-in" data-aos-delay="300">
                <Shield className="stat-icon" />
                <h3>Pending CSRs</h3>
                <div className="stat-value">{dashboardStats.pending_csrs}</div>
                <p>Awaiting approval</p>
              </div>
              <div className="stat-card" data-aos="zoom-in" data-aos-delay="400">
                <ShieldCheck className="stat-icon active" />
                <h3>Approved CSRs</h3>
                <div className="stat-value">{dashboardStats.approved_csrs}</div>
                <p>Certificates issued</p>
              </div>
              <div className="stat-card" data-aos="zoom-in" data-aos-delay="500">
                <ShieldCheck className="stat-icon active" />
                <h3>Active Certificates</h3>
                <div className="stat-value">{dashboardStats.active_certs}</div>
                <p>Valid certificates</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">No stats available</div>
          )}
        </div>

        {/* Pending CSRs */}
        <div className="pending-csrs certificate-table-container" data-aos="fade-up" data-aos-delay="200">
          <div className="table-header">
            <h2>Pending CSRs</h2>
            <p>Review and manage pending certificate signing requests</p>
          </div>
          {loading ? (
            <div className="loading">Loading pending CSRs...</div>
          ) : pendingCSRs.length === 0 ? (
            <div className="empty-state">No pending CSRs</div>
          ) : (
            <table className="certificate-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Created At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingCSRs.map((csr) => (
                  <tr key={csr.id}>
                    <td>{csr.domain}</td>
                    <td>{csr.username}</td>
                    <td>{csr.email}</td>
                    <td>{formatDate(csr.created_at)}</td>
                    <td>
                      <span className={`status-badge ${csr.status}`}>
                        {csr.status.charAt(0).toUpperCase() + csr.status.slice(1)}
                      </span>
                    </td>
                    <td className="request-actions">
                      <button
                        className="action-button approve"
                        onClick={() => handleApprove(csr.id)}
                      >
                        Approve
                      </button>
                      <button
                        className="action-button reject"
                        onClick={() =>
                          handleReject(
                            csr.id,
                            prompt('Enter rejection reason:') || 'No reason provided'
                          )
                        }
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* History CSRs */}
        <div className="history-csrs certificate-table-container" data-aos="fade-up" data-aos-delay="300">
          <div className="table-header">
            <h2>History CSRs</h2>
            <p>View all processed certificate signing requests</p>
          </div>
          {loading ? (
            <div className="loading">Loading history CSRs...</div>
          ) : displayedHistoryCSRs.length === 0 ? (
            <div className="empty-state">No history CSRs</div>
          ) : (
            <>
              <table className="certificate-table">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Created At</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedHistoryCSRs.map((csr) => (
                    <tr key={csr.id}>
                      <td>{csr.domain}</td>
                      <td>{csr.username}</td>
                      <td>{csr.email}</td>
                      <td>{formatDate(csr.created_at)}</td>
                      <td>
                        <span className={`status-badge ${csr.status}`}>
                          {csr.status.charAt(0).toUpperCase() + csr.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasMore && (
                <div className="load-more-container">
                  <button className="load-more-button" onClick={handleLoadMore}>
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;