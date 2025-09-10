// backend/auth/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'rag_system',
  user: process.env.POSTGRES_USER || 'rag_user',
  password: process.env.POSTGRES_PASSWORD || 'rag_password',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error acquiring client from PostgreSQL pool:', err.stack);
  } else {
    console.log('✅ PostgreSQL authentication database connected successfully');
    release();
  }
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`Executed query: ${text.substring(0, 50)}... Duration: ${duration}ms`);
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// User authentication functions
const authDb = {
  // Find user by username or email
  async findUser(identifier) {
    const result = await query(
      `SELECT u.*, r.name as role_name, r.permissions, r.access_level
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE (u.username = $1 OR u.email = $1) AND u.is_active = true`,
      [identifier]
    );
    return result.rows[0];
  },

  // Get user by ID
  async getUserById(userId) {
    const result = await query(
      `SELECT u.*, r.name as role_name, r.permissions, r.access_level
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1 AND u.is_active = true`,
      [userId]
    );
    return result.rows[0];
  },

  // Update last login time
  async updateLastLogin(userId) {
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [userId]
    );
  },

  // Create user session
  async createSession(sessionId, userId, ipAddress, userAgent, expiresAt) {
    await query(
      `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, userId, ipAddress, userAgent, expiresAt]
    );
  },

  // Get active session
  async getSession(sessionId) {
    const result = await query(
      `SELECT s.*, u.username, u.role_id, r.name as role_name, r.permissions
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE s.session_id = $1 AND s.is_active = true AND s.expires_at > NOW()`,
      [sessionId]
    );
    return result.rows[0];
  },

  // Update session activity
  async updateSessionActivity(sessionId) {
    await query(
      'UPDATE user_sessions SET last_activity = NOW() WHERE session_id = $1',
      [sessionId]
    );
  },

  // Deactivate session (logout)
  async deactivateSession(sessionId) {
    await query(
      'UPDATE user_sessions SET is_active = false WHERE session_id = $1',
      [sessionId]
    );
  },

  // Get user's document permissions
  async getUserDocumentPermissions(userId) {
    const result = await query(
      `SELECT dp.document_id, dp.access_level, dp.department_filter
       FROM document_permissions dp
       JOIN users u ON dp.role_id = u.role_id
       WHERE u.id = $1`,
      [userId]
    );
    return result.rows;
  },

  // Log audit event
  async logAudit(userId, sessionId, action, resourceType, resourceId, details, ipAddress) {
    await query(
      `INSERT INTO audit_log (user_id, session_id, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, sessionId, action, resourceType, resourceId, JSON.stringify(details), ipAddress]
    );
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing PostgreSQL pool...');
  pool.end(() => {
    console.log('PostgreSQL pool has ended');
    process.exit(0);
  });
});

module.exports = { pool, query, authDb };