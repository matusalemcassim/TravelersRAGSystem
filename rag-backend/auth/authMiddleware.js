// backend/auth/authMiddleware.js
const jwt = require('jsonwebtoken');
const { authDb } = require('./database');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// Middleware to verify JWT token and add user info to request
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get fresh user data from database (in case permissions changed)
    const user = await authDb.getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'User not found or deactivated',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if session is still valid
    if (decoded.sessionId) {
      const session = await authDb.getSession(decoded.sessionId);
      if (!session) {
        return res.status(401).json({ 
          error: 'Session expired or invalid',
          code: 'SESSION_INVALID'
        });
      }
      
      // Update session activity
      await authDb.updateSessionActivity(decoded.sessionId);
    }

    // Add user info to request object
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role_name,
      permissions: user.permissions,
      accessLevel: user.access_level,
      department: user.department,
      sessionId: decoded.sessionId
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    } else {
      return res.status(500).json({ 
        error: 'Authentication service error',
        code: 'AUTH_ERROR'
      });
    }
  }
};

// Middleware to check if user has specific permission
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const userPermissions = req.user.permissions || {};
    
    // Check if user has the required permission
    if (!hasPermission(userPermissions, permission)) {
      // Log unauthorized access attempt
      authDb.logAudit(
        req.user.id,
        req.user.sessionId,
        'UNAUTHORIZED_ACCESS',
        'PERMISSION',
        permission,
        { requiredPermission: permission, userPermissions },
        req.ip
      );

      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: permission
      });
    }

    next();
  };
};

// Middleware to check access level (1=basic, 2=elevated, 3=admin)
const requireAccessLevel = (minLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    if (req.user.accessLevel < minLevel) {
      return res.status(403).json({ 
        error: 'Insufficient access level',
        code: 'INSUFFICIENT_ACCESS_LEVEL',
        required: minLevel,
        current: req.user.accessLevel
      });
    }

    next();
  };
};

// Helper function to check permissions
const hasPermission = (userPermissions, requiredPermission) => {
  // Split permission like "documents:read" into resource and action
  const [resource, action] = requiredPermission.split(':');
  
  if (!userPermissions[resource]) {
    return false;
  }

  const resourcePermission = userPermissions[resource];
  
  // Check for exact match or wildcard
  return resourcePermission === action || 
         resourcePermission === 'all' || 
         (Array.isArray(resourcePermission) && resourcePermission.includes(action));
};

// Helper function to get user's document access permissions
const getUserDocumentAccess = async (userId) => {
  try {
    const permissions = await authDb.getUserDocumentPermissions(userId);
    return permissions.reduce((acc, perm) => {
      acc[perm.document_id] = {
        accessLevel: perm.access_level,
        departmentFilter: perm.department_filter
      };
      return acc;
    }, {});
  } catch (error) {
    console.error('Error getting document permissions:', error);
    return {};
  }
};

// Optional middleware - only authenticate if token is present
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // No token provided, continue without authentication
    req.user = null;
    return next();
  }

  // Token provided, try to authenticate
  return authenticateToken(req, res, next);
};

module.exports = {
  authenticateToken,
  requirePermission,
  requireAccessLevel,
  optionalAuth,
  hasPermission,
  getUserDocumentAccess
};