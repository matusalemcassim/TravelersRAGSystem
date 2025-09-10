// rag_backend/auth/authRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { authDb } = require('./database');
const { authenticateToken } = require('./authMiddleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// Login endpoint with enhanced debugging
router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe = false } = req.body;

    console.log('🔐 Login attempt started');
    console.log('📝 Username:', username);
    console.log('🔑 Password length:', password ? password.length : 0);
    console.log('💾 Remember me:', rememberMe);

    // Validate input
    if (!username || !password) {
      console.log('❌ Missing credentials');
      return res.status(400).json({
        error: 'Username and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Find user in database
    console.log('🔍 Searching for user in database...');
    const user = await authDb.findUser(username);
    
    if (!user) {
      console.log('❌ User not found in database');
      // Log failed login attempt
      await authDb.logAudit(
        null,
        null,
        'LOGIN_FAILED',
        'USER_AUTH',
        username,
        { reason: 'User not found' },
        req.ip
      );

      return res.status(401).json({
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    console.log('✅ User found in database');
    console.log('👤 User ID:', user.id);
    console.log('📧 User email:', user.email);
    console.log('🏢 User role:', user.role_name);
    console.log('🔒 Stored hash exists:', !!user.password_hash);
    console.log('🔒 Stored hash length:', user.password_hash ? user.password_hash.length : 'null');
    console.log('🔒 Hash starts with:', user.password_hash ? user.password_hash.substring(0, 10) + '...' : 'null');

    // Verify password
    console.log('🔐 Comparing password with stored hash...');
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log('✅ Password match result:', passwordMatch);

    if (!passwordMatch) {
      console.log('❌ Password comparison failed');
      // Log failed login attempt
      await authDb.logAudit(
        user.id,
        null,
        'LOGIN_FAILED',
        'USER_AUTH',
        user.username,
        { reason: 'Invalid password' },
        req.ip
      );

      return res.status(401).json({
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    console.log('✅ Password verification successful');

    // Create session
    const sessionId = uuidv4();
    const expiresIn = rememberMe ? '7d' : JWT_EXPIRES_IN;
    const expiresAt = new Date();
    
    if (rememberMe) {
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
    } else {
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours
    }

    console.log('📝 Creating session...');
    console.log('🆔 Session ID:', sessionId);
    console.log('⏰ Expires at:', expiresAt);

    // Store session in database
    await authDb.createSession(
      sessionId,
      user.id,
      req.ip,
      req.get('User-Agent'),
      expiresAt
    );

    // Update last login time
    await authDb.updateLastLogin(user.id);

    // Create JWT token
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role_name,
      sessionId: sessionId
    };

    console.log('🎫 Creating JWT token...');
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
    console.log('✅ JWT token created successfully');

    // Log successful login
    await authDb.logAudit(
      user.id,
      sessionId,
      'LOGIN_SUCCESS',
      'USER_AUTH',
      user.username,
      { rememberMe, expiresAt },
      req.ip
    );

    console.log('✅ Login successful for user:', user.username);

    // Return user info and token
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role_name,
        department: user.department,
        accessLevel: user.access_level,
        permissions: user.permissions
      },
      sessionId,
      expiresAt
    });

  } catch (error) {
    console.error('💥 Login error:', error);
    console.error('📍 Error stack:', error.stack);
    res.status(500).json({
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.user;

    console.log('🚪 Logout request for session:', sessionId);

    if (sessionId) {
      // Deactivate session in database
      await authDb.deactivateSession(sessionId);

      // Log logout
      await authDb.logAudit(
        req.user.id,
        sessionId,
        'LOGOUT',
        'USER_AUTH',
        req.user.username,
        { voluntaryLogout: true },
        req.ip
      );

      console.log('✅ Session deactivated:', sessionId);
    }

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout service error',
      code: 'LOGOUT_ERROR'
    });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await authDb.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role_name,
        department: user.department,
        accessLevel: user.access_level,
        permissions: user.permissions,
        lastLogin: user.last_login
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'User service error',
      code: 'USER_SERVICE_ERROR'
    });
  }
});

// Verify token endpoint (for frontend to check if token is still valid)
router.get('/verify', authenticateToken, (req, res) => {
  console.log('🔍 Token verification for user:', req.user.username);
  
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      permissions: req.user.permissions
    }
  });
});

// Get user's document permissions
router.get('/permissions/documents', authenticateToken, async (req, res) => {
  try {
    const permissions = await authDb.getUserDocumentPermissions(req.user.id);
    
    res.json({
      documentPermissions: permissions.reduce((acc, perm) => {
        acc[perm.document_id] = {
          accessLevel: perm.access_level,
          departmentFilter: perm.department_filter
        };
        return acc;
      }, {})
    });

  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      error: 'Permissions service error',
      code: 'PERMISSIONS_ERROR'
    });
  }
});

// Change password endpoint
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current password and new password are required',
        code: 'MISSING_PASSWORDS'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters long',
        code: 'PASSWORD_TOO_SHORT'
      });
    }

    // Get current user
    const user = await authDb.getUserById(req.user.id);
    
    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      await authDb.logAudit(
        req.user.id,
        req.user.sessionId,
        'PASSWORD_CHANGE_FAILED',
        'USER_SECURITY',
        req.user.username,
        { reason: 'Invalid current password' },
        req.ip
      );

      return res.status(401).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await authDb.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    // Log password change
    await authDb.logAudit(
      req.user.id,
      req.user.sessionId,
      'PASSWORD_CHANGED',
      'USER_SECURITY',
      req.user.username,
      { },
      req.ip
    );

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Password change service error',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
});

// Get user's active sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const result = await authDb.query(
      `SELECT session_id, ip_address, user_agent, created_at, last_activity, expires_at
       FROM user_sessions 
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
       ORDER BY last_activity DESC`,
      [req.user.id]
    );

    res.json({
      sessions: result.rows.map(session => ({
        sessionId: session.session_id,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        createdAt: session.created_at,
        lastActivity: session.last_activity,
        expiresAt: session.expires_at,
        isCurrent: session.session_id === req.user.sessionId
      }))
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      error: 'Sessions service error',
      code: 'SESSIONS_ERROR'
    });
  }
});

// Test endpoint to manually verify bcrypt
router.post('/test-bcrypt', async (req, res) => {
  try {
    const { password, hash } = req.body;
    
    if (!password || !hash) {
      return res.status(400).json({
        error: 'Both password and hash are required for testing'
      });
    }

    console.log('🧪 Testing bcrypt comparison');
    console.log('📝 Password:', password);
    console.log('🔒 Hash:', hash);

    const result = await bcrypt.compare(password, hash);
    console.log('✅ Bcrypt result:', result);

    res.json({
      password,
      hash,
      match: result
    });

  } catch (error) {
    console.error('Bcrypt test error:', error);
    res.status(500).json({
      error: 'Bcrypt test failed',
      details: error.message
    });
  }
});

module.exports = router;