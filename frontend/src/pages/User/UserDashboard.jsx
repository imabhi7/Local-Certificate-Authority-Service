"use client"

import React, { useEffect, useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useNavigate } from "react-router-dom"
import { generateCSR, getUserCSRs, getIssuedCertificates, downloadCSR, downloadCertificate } from "../../api/certificateApi"
import { fetchUserDashboard } from '../../api/dashboard'
import "./UserDashboard.css"

const fallbackCountries = [
  { name: "Australia", code: "AU" },
  { name: "Brazil", code: "BR" },
  { name: "Canada", code: "CA" },
  { name: "China", code: "CN" },
  { name: "France", code: "FR" },
  { name: "Germany", code: "DE" },
  { name: "India", code: "IN" },
  { name: "Japan", code: "JP" },
  { name: "New Zealand", code: "NZ" },
  { name: "Singapore", code: "SG" },
  { name: "South Africa", code: "ZA" },
  { name: "United Arab Emirates", code: "AE" },
  { name: "United Kingdom", code: "GB" },
  { name: "United States", code: "US" },
]

// Icons
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
)

const PlusCircle = ({ className }) => (
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
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
)

const Search = ({ className }) => (
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
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const RefreshCw = ({ className }) => (
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
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
)

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
)

const ShieldX = ({ className }) => (
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
    <line x1="9" y1="9" x2="15" y2="15" />
    <line x1="15" y1="9" x2="9" y2="15" />
  </svg>
)

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
)

const Bell = ({ className }) => (
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
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const UserDashboard = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [formError, setFormError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [countries, setCountries] = useState([])
  const [csrs, setCsrs] = useState([])
  const [issuedCertificates, setIssuedCertificates] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [dashboardStats, setDashboardStats] = useState(null)
  const [error, setError] = useState('')
  const [visibleCSRsCount, setVisibleCSRsCount] = useState(10)
  const [visibleCertsCount, setVisibleCertsCount] = useState(10)
  const [visibleNotificationsCount, setVisibleNotificationsCount] = useState(5)
  const [invalidCSRsCount, setInvalidCSRsCount] = useState(0)
  // Added formData state
  const [formData, setFormData] = useState({
    domain: "",
    company: "",
    division: "",
    city: "",
    state: "",
    country: "",
    email: "",
    rootLength: "2048",
  })

  // Check authentication and redirect to login if token or user is missing
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!user || !token) {
      navigate("/login")
    }
  }, [user, navigate])

  // Reset pagination when search term changes
  useEffect(() => {
    setVisibleCSRsCount(10)
    setVisibleCertsCount(10)
  }, [searchTerm])

  useEffect(() => {
    setCountries(fallbackCountries)

    // Use the API when available, while keeping the form usable offline.
    fetch("https://restcountries.com/v3.1/all")
      .then((response) => {
        if (!response.ok) throw new Error(`Countries request failed: ${response.status}`)
        return response.json()
      })
      .then((data) => {
        const countryList = data
          .filter((country) => country.cca2 && country.name?.common)
          .map((country) => ({
            name: country.name.common,
            code: country.cca2,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
        if (countryList.length > 0) setCountries(countryList)
      })
      .catch((error) => console.warn("Using local country list:", error.message))

    // Load notifications from localStorage
    const storedNotifications = localStorage.getItem("userNotifications")
    if (storedNotifications) {
      try {
        setNotifications(JSON.parse(storedNotifications))
      } catch (err) {
        console.error("Error parsing stored notifications:", err)
      }
    }

    // Initial data fetch
    const loadData = async () => {
      try {
        setLoading(true)
        const [csrData, certData, statsData] = await Promise.all([
          getUserCSRs(),
          getIssuedCertificates(),
          fetchUserDashboard(),
        ])

        // Log full CSR response for debugging
        console.log("Raw CSR API Response:", csrData)

        // Validate and filter CSRs (relaxed validation)
        let invalidCount = 0
        const validCsrs = csrData.success
          ? csrData.data.filter((csr) => {
              if (!csr.id || !csr.domain) {
                console.warn("Invalid CSR data (missing id or domain):", {
                  csr,
                  missing: {
                    id: !csr.id,
                    domain: !csr.domain,
                    company: !csr.company,
                    status: !csr.status,
                  },
                })
                invalidCount++
                return false
              }
              return true
            })
          : []
        setCsrs(validCsrs.map((csr) => ({
          ...csr,
          company: csr.company || "Unknown",
          status: csr.status || "unknown",
        })))
        setInvalidCSRsCount(invalidCount)

        // Validate and filter Certificates
        const validCerts = certData.success
          ? certData.data.filter((cert) => {
              if (!cert.id || !cert.domain || !cert.status) {
                console.warn("Invalid Certificate data:", cert)
                return false
              }
              return true
            })
          : []
        setIssuedCertificates(validCerts)

        setDashboardStats(
          statsData || {
            total_csrs: 0,
            pending_csrs: 0,
            approved_csrs: 0,
            active_certs: 0,
          }
        )
        setError('')

        // Generate notifications for non-pending CSRs
        const newNotifications = validCsrs
          .filter((csr) => (csr.status || "unknown") !== 'pending')
          .map((csr) => ({
            id: csr.id,
            message: `CSR for ${csr.domain} has been ${csr.status || "unknown"}.`,
            type: csr.status || "unknown",
            date: csr.updated_at || csr.created_at || new Date().toISOString(),
          }))

        // Merge with existing notifications
        const existingNotifications = storedNotifications
          ? JSON.parse(storedNotifications)
          : []
        const updatedNotifications = [
          ...newNotifications,
          ...existingNotifications.filter(
            (notif) => !newNotifications.some((n) => n.id === notif.id)
          ),
        ].sort((a, b) => new Date(b.date) - new Date(a.date))
        const limitedNotifications = updatedNotifications.slice(0, 50)
        setNotifications(limitedNotifications)
        localStorage.setItem("userNotifications", JSON.stringify(limitedNotifications))
      } catch (error) {
        console.error("Error loading user dashboard:", error)
        setError("Error loading dashboard data")
      } finally {
        setLoading(false)
      }
    }

    loadData()

    // Polling for updates
    const pollInterval = setInterval(loadData, 300000)
    return () => clearInterval(pollInterval)
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleCSRSubmit = async (e) => {
    e.preventDefault()
    setFormError("")
    setSuccessMessage("")

    try {
      const username = user?.username
      if (!username) {
        throw new Error("User not authenticated")
      }

      // Validate required fields
      const requiredFields = ['domain', 'company', 'division', 'city', 'state', 'country', 'email', 'rootLength']
      for (const field of requiredFields) {
        if (!formData[field]) {
          throw new Error(`Missing required field: ${field}`)
        }
      }

      const formDataWithUser = { ...formData, username }
      const result = await generateCSR(formDataWithUser)

      if (result.success) {
        const { csr, privateKey } = result
        setSuccessMessage("CSR generated and submitted successfully!")

        // Download CSR
        const csrBlob = new Blob([csr], { type: "text/plain" })
        const csrURL = URL.createObjectURL(csrBlob)
        const csrLink = document.createElement("a")
        csrLink.href = csrURL
        csrLink.download = `csr_${formData.domain}.pem`
        document.body.appendChild(csrLink)
        csrLink.click()
        document.body.removeChild(csrLink)
        URL.revokeObjectURL(csrURL)

        // Download Private Key
        const keyBlob = new Blob([privateKey], { type: "text/plain" })
        const keyURL = URL.createObjectURL(keyBlob)
        const keyLink = document.createElement("a")
        keyLink.href = keyURL
        keyLink.download = `${formData.domain}_key.pem`
        document.body.appendChild(keyLink)
        keyLink.click()
        document.body.removeChild(keyLink)
        URL.revokeObjectURL(keyURL)

        // Refresh CSRs
        const csrResponse = await getUserCSRs()
        if (csrResponse.success) {
          setCsrs(csrResponse.data.filter((csr) => csr.id && csr.domain).map((csr) => ({
            ...csr,
            company: csr.company || "Unknown",
            status: csr.status || "unknown",
          })))
        }

        closeDialog()
      } else {
        setFormError(result.message || "Failed to generate CSR. Please check your inputs and try again.")
      }
    } catch (err) {
      console.error("Error generating CSR:", err)
      setFormError(err.message || "Something went wrong while generating the CSR.")
    }
  }

  const handleDownload = async (id, domain, type = "csr") => {
    try {
      if (type === "csr") {
        await downloadCSR(`csr_${id}.pem`)
        if (isDialogOpen) closeDialog()
      } else if (type === "certificate") {
        await downloadCertificate(id, domain)
      }
    } catch (error) {
      console.error(`Error downloading ${type}:`, error)
      setFormError(`Failed to download ${type} file.`)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/')
    } catch (err) {
      console.error("Error logging out:", err)
      setError("Error logging out")
    }
  }

  const handleLoadMoreCSRs = () => {
    setVisibleCSRsCount((prev) => prev + 10)
  }

  const handleLoadMoreCerts = () => {
    setVisibleCertsCount((prev) => prev + 10)
  }

  const handleLoadMoreNotifications = () => {
    setVisibleNotificationsCount((prev) => prev + 5)
  }

  const closeDialog = () => {
    setIsDialogOpen(false)
    setFormError("")
    setSuccessMessage("")
    setFormData({
      domain: "",
      company: "",
      division: "",
      city: "",
      state: "",
      country: "",
      email: "",
      rootLength: "2048",
    })
  }

  const formatDate = (dateString) => {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    return isNaN(date.getTime())
      ? "N/A"
      : date.toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
  }

  const getStatusBadge = (status) => {
    switch ((status || "unknown").toLowerCase()) {
      case "active":
        return (
          <span className="status-badge active">
            <ShieldCheck className="badge-icon" />
            Active
          </span>
        )
      case "pending":
        return (
          <span className="status-badge pending">
            <Shield className="badge-icon" />
            Pending
          </span>
        )
      case "approved":
        return (
          <span className="status-badge approved">
            <ShieldCheck className="badge-icon" />
            Approved
          </span>
        )
      case "rejected":
        return (
          <span className="status-badge rejected">
            <ShieldX className="badge-icon" />
            Rejected
          </span>
        )
      case "revoked":
        return (
          <span className="status-badge expired">
            <ShieldX className="badge-icon" />
            Revoked
          </span>
        )
      default:
        return (
          <span className="status-badge">
            <Shield className="badge-icon" />
            {status || "Unknown"}
          </span>
        )
    }
  }

  const filteredCertificates = issuedCertificates.filter((cert) =>
    (cert.domain || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (cert.status || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredCSRs = csrs.filter((csr) =>
    (csr.domain || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (csr.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (csr.status || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="dashboard-container">
      <header className="dashboard-header" data-aos="fade-down">
        <div className="header-content">
          <div className="logo-container">
            <ShieldCheck className="logo-icon" />
            <span className="logo-text">CA Service</span>
          </div>
          <div className="user-info">
            <span>Welcome, {user?.username || "User"}</span>
            <button
              className="notifications-button"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              title="Notifications"
            >
              <Bell className="bell-icon" />
            </button>
            <button className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
        {isNotificationsOpen && (
          <div className="notifications-dropdown" data-aos="fade-in">
            <div className="notifications-header">
              <h3>Notifications</h3>
            </div>
            {notifications.length === 0 ? (
              <div className="empty-notifications">No notifications available</div>
            ) : (
              <div className="notifications-list">
                {notifications.slice(0, visibleNotificationsCount).map((notification) => (
                  <div
                    key={notification.id}
                    className={`notification-item ${notification.type}`}
                  >
                    <CheckCircle className="notification-icon" />
                    <div className="notification-content">
                      <span className="notification-message">{notification.message}</span>
                      <span className="notification-date">{formatDate(notification.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {notifications.length > visibleNotificationsCount && (
              <div className="load-more-container">
                <button className="load-more-button" onClick={handleLoadMoreNotifications}>
                  Load More
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="dashboard-main">
        <div className="dashboard-welcome" data-aos="fade-up">
          <div className="welcome-text">
            <h1>Certificate Management</h1>
            <p>Request and manage your SSL/TLS certificates</p>
            {successMessage && (
              <div className="success-message">
                <CheckCircle className="success-icon" />
                <span>{successMessage}</span>
              </div>
            )}
            {error && <div className="error-message">{error}</div>}
            {formError && <div className="error-message">{formError}</div>}
          </div>
          <button className="generate-button" onClick={() => setIsDialogOpen(true)}>
            <PlusCircle className="button-icon" />
            Generate New CSR
          </button>
        </div>

        {dashboardStats ? (
          <div className="dashboard-stats" data-aos="fade-up" data-aos-delay="100">
            <h2>Dashboard Statistics</h2>
            <div className="stat-card" data-aos="zoom-in" data-aos-delay="200">
              <Shield className="stat-icon" />
              <h3>Total CSRs</h3>
              <div className="stat-value">{dashboardStats.total_csrs}</div>
              <p className="stat-description">All CSR requests</p>
            </div>
            <div className="stat-card" data-aos="zoom-in" data-aos-delay="300">
              <Shield className="stat-icon" />
              <h3>Pending CSRs</h3>
              <div className="stat-value">{dashboardStats.pending_csrs}</div>
              <p className="stat-description">Awaiting approval</p>
            </div>
            <div className="stat-card" data-aos="zoom-in" data-aos-delay="400">
              <ShieldCheck className="stat-icon active" />
              <h3>Approved CSRs</h3>
              <div className="stat-value">{dashboardStats.approved_csrs}</div>
              <p className="stat-description">Certificates issued</p>
            </div>
            <div className="stat-card" data-aos="zoom-in" data-aos-delay="500">
              <ShieldCheck className="stat-icon active" />
              <h3>Active Certificates</h3>
              <div className="stat-value">{dashboardStats.active_certs}</div>
              <p className="stat-description">Valid certificates</p>
            </div>
          </div>
        ) : (
          <p>Loading dashboard stats...</p>
        )}

        <div className="certificate-table-container" data-aos="fade-up" data-aos-delay="200">
          <div className="table-header">
            <h2>CSR Requests</h2>
            <p>View and manage your certificate signing requests</p>
            <div className="table-actions">
              <div className="search-container">
                <Search className="search-icon" />
                <input
                  type="search"
                  placeholder="Search CSRs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <button
                className="refresh-button"
                onClick={() => {
                  setLoading(true)
                  getUserCSRs().then((res) => {
                    if (res.success) {
                      setCsrs(res.data.filter((csr) => csr.id && csr.domain).map((csr) => ({
                        ...csr,
                        company: csr.company || "Unknown",
                        status: csr.status || "unknown",
                      })))
                    }
                    setLoading(false)
                  })
                }}
              >
                <RefreshCw className="refresh-icon" />
                Refresh
              </button>
            </div>
          </div>

          <table className="certificate-table">
            <thead>
              <tr>
                <th>Domain Name</th>
                <th>Organization</th>
                <th>Submitted</th>
                <th>Status</th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="empty-table">Loading...</td>
                </tr>
              ) : filteredCSRs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-table">
                    {invalidCSRsCount > 0
                      ? `No valid CSRs found. ${invalidCSRsCount} CSR(s) were filtered due to invalid data. Please contact support.`
                      : "No CSRs found"}
                  </td>
                </tr>
              ) : (
                filteredCSRs.slice(0, visibleCSRsCount).map((csr) => (
                  <tr key={csr.id}>
                    <td className="domain-column">{csr.domain}</td>
                    <td>{csr.company}</td>
                    <td>{formatDate(csr.created_at)}</td>
                    <td>{getStatusBadge(csr.status)}</td>
                    <td className="actions-column">
                      {csr.status === "pending" && (
                        <button
                          className="download-button"
                          onClick={() => handleDownload(csr.id, csr.domain, "csr")}
                        >
                          Download CSR
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filteredCSRs.length > visibleCSRsCount && (
            <div className="load-more-container">
              <button className="load-more-button" onClick={handleLoadMoreCSRs}>
                Load More
              </button>
            </div>
          )}
        </div>

        <div className="certificate-table-container" data-aos="fade-up" data-aos-delay="300">
          <div className="table-header">
            <h2>Issued Certificates</h2>
            <p>View and manage your issued certificates</p>
            <div className="table-actions">
              <div className="search-container">
                <Search className="search-icon" />
                <input
                  type="search"
                  placeholder="Search certificates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <button
                className="refresh-button"
                onClick={() => {
                  setLoading(true)
                  getIssuedCertificates().then((res) => {
                    if (res.success) {
                      setIssuedCertificates(res.data.filter((cert) => cert.id && cert.domain && cert.status))
                    }
                    setLoading(false)
                  })
                }}
              >
                <RefreshCw className="refresh-icon" />
                Refresh
              </button>
            </div>
          </div>

          <table className="certificate-table">
            <thead>
              <tr>
                <th>Domain Name</th>
                <th>Issued Date</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="empty-table">Loading...</td>
                </tr>
              ) : filteredCertificates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-table">No certificates found</td>
                </tr>
              ) : (
                filteredCertificates.slice(0, visibleCertsCount).map((certificate) => (
                  <tr key={certificate.id}>
                    <td className="domain-column">{certificate.domain}</td>
                    <td>{formatDate(certificate.issued_at)}</td>
                    <td>{formatDate(certificate.valid_till)}</td>
                    <td>{getStatusBadge(certificate.status)}</td>
                    <td className="actions-column">
                      {certificate.status === "active" && (
                        <button
                          className="download-button"
                          onClick={() => handleDownload(certificate.id, certificate.domain, "certificate")}
                        >
                          Download Certificate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filteredCertificates.length > visibleCertsCount && (
            <div className="load-more-container">
              <button className="load-more-button" onClick={handleLoadMoreCerts}>
                Load More
              </button>
            </div>
          )}
        </div>
      </main>

      {isDialogOpen && (
        <div className="dialog-overlay">
          <div className="dialog-container">
            <div className="dialog-header">
              <div className="dialog-title">
                <ShieldCheck className="dialog-icon" />
                Generate Certificate Signing Request
              </div>
              <p className="dialog-description">
                Fill out the form below to generate a new Certificate Signing Request (CSR).
              </p>
            </div>

            <form onSubmit={handleCSRSubmit} className="csr-form">
              <div className="form-tabs">
                <button type="button" className="form-tab active">
                  Certificate Details
                </button>
                <button type="button" className="form-tab">
                  Advanced Options
                </button>
              </div>

              <div className="form-content">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="domain">Domain:</label>
                    <input
                      type="text"
                      id="domain"
                      name="domain"
                      placeholder="example.com"
                      required
                      value={formData.domain}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="company">Company:</label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      placeholder="Your Company, Inc."
                      required
                      value={formData.company}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="division">Division:</label>
                    <input
                      type="text"
                      id="division"
                      name="division"
                      placeholder="IT Department"
                      required
                      value={formData.division}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email:</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder="admin@example.com"
                      required
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="form-row three-columns">
                  <div className="form-group">
                    <label htmlFor="city">City/Locality:</label>
                    <input
                      type="text"
                      id="city"
                      name="city"
                      placeholder="San Francisco"
                      required
                      value={formData.city}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="state">State/Province:</label>
                    <input
                      type="text"
                      id="state"
                      name="state"
                      placeholder="California"
                      required
                      value={formData.state}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="country">Country:</label>
                    <select id="country" name="country" value={formData.country} onChange={handleChange} required>
                      <option value="">Select a country</option>
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="rootLength">Root Length:</label>
                    <select
                      id="rootLength"
                      name="rootLength"
                      value={formData.rootLength}
                      onChange={handleChange}
                      required
                    >
                      <option value="2048">2048-bit (Standard)</option>
                      <option value="4096">4096-bit (High Security)</option>
                    </select>
                  </div>
                </div>
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="form-actions">
                <button type="button" className="cancel-button" onClick={closeDialog}>
                  Cancel
                </button>
                <button type="submit" className="submit-button">
                  Generate CSR
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  )
}

export default UserDashboard