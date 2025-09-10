-- init-sample-data.sql
-- Sample data for testing the authentication system

-- Insert roles
INSERT INTO roles (name, description, permissions, access_level) VALUES
('admin', 'System Administrator', '{"documents": "all", "users": "manage", "system": "admin"}', 3),
('manager', 'Department Manager', '{"documents": "department", "users": "view", "reports": "generate"}', 2),
('agent', 'Insurance Agent', '{"documents": "public", "customers": "view", "policies": "read"}', 1),
('underwriter', 'Underwriter', '{"documents": "underwriting", "risk_assessment": "all", "policies": "modify"}', 2),
('claims_adjuster', 'Claims Adjuster', '{"documents": "claims", "claims": "manage", "investigations": "conduct"}', 2),
('employee', 'General Employee', '{"documents": "public", "internal_info": "basic"}', 1);

-- Insert sample users (passwords are bcrypt hashed version of 'password123')
INSERT INTO users (username, email, password_hash, role_id, department, first_name, last_name) VALUES
('admin', 'admin@travelers.com', '$2b$10$TtpcJ9f3MdHURWKzIunUdeqoZYvJ5HbvqVnxFUBd2he5ay5Qsp8Ye', 
 (SELECT id FROM roles WHERE name = 'admin'), 'IT', 'System', 'Admin'),

('john.smith', 'john.smith@travelers.com', '$2b$10$TtpcJ9f3MdHURWKzIunUdeqoZYvJ5HbvqVnxFUBd2he5ay5Qsp8Ye', 
 (SELECT id FROM roles WHERE name = 'manager'), 'Underwriting', 'John', 'Smith'),

('sarah.jones', 'sarah.jones@travelers.com', '$2b$10$TtpcJ9f3MdHURWKzIunUdeqoZYvJ5HbvqVnxFUBd2he5ay5Qsp8Ye', 
 (SELECT id FROM roles WHERE name = 'agent'), 'Sales', 'Sarah', 'Jones'),

('mike.wilson', 'mike.wilson@travelers.com', '$2b$10$TtpcJ9f3MdHURWKzIunUdeqoZYvJ5HbvqVnxFUBd2he5ay5Qsp8Ye', 
 (SELECT id FROM roles WHERE name = 'underwriter'), 'Underwriting', 'Mike', 'Wilson'),

('lisa.brown', 'lisa.brown@travelers.com', '$2b$10$TtpcJ9f3MdHURWKzIunUdeqoZYvJ5HbvqVnxFUBd2he5ay5Qsp8Ye', 
 (SELECT id FROM roles WHERE name = 'claims_adjuster'), 'Claims', 'Lisa', 'Brown'),

('demo.user', 'demo@travelers.com', '$2b$10$TtpcJ9f3MdHURWKzIunUdeqoZYvJ5HbvqVnxFUBd2he5ay5Qsp8Ye', 
 (SELECT id FROM roles WHERE name = 'employee'), 'General', 'Demo', 'User');

-- Insert document permissions (assuming you have some document IDs from Neo4j)
-- These would match your actual Neo4j document IDs
INSERT INTO document_permissions (document_id, role_id, access_level, department_filter) VALUES
-- Admin can access everything
('doc_1756925519489', (SELECT id FROM roles WHERE name = 'admin'), 'read', NULL),
('doc_1756557573654', (SELECT id FROM roles WHERE name = 'admin'), 'read', NULL),

-- Managers can access documents relevant to their departments
('doc_1756925519489', (SELECT id FROM roles WHERE name = 'manager'), 'read', 'Underwriting'),
('doc_1756557573654', (SELECT id FROM roles WHERE name = 'manager'), 'read', 'Claims'),

-- Underwriters can access underwriting-related documents
('doc_1756925519489', (SELECT id FROM roles WHERE name = 'underwriter'), 'read', NULL),

-- Claims adjusters can access claims-related documents  
('doc_1756557573654', (SELECT id FROM roles WHERE name = 'claims_adjuster'), 'read', NULL),

-- Agents can access public information only
('doc_1756925519489', (SELECT id FROM roles WHERE name = 'agent'), 'restricted', NULL),

-- General employees can access basic company information
('doc_1756925519489', (SELECT id FROM roles WHERE name = 'employee'), 'restricted', NULL);

-- Sample audit log entries
INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address) VALUES
((SELECT id FROM users WHERE username = 'admin'), 'LOGIN', 'USER_SESSION', 'session_123', '{"user_agent": "Chrome/91.0", "success": true}', '192.168.1.100'),
((SELECT id FROM users WHERE username = 'john.smith'), 'DOCUMENT_ACCESS', 'DOCUMENT', 'doc_1756925519489', '{"chunks_retrieved": 3, "question": "What is our underwriting policy?"}', '192.168.1.101'),
((SELECT id FROM users WHERE username = 'sarah.jones'), 'DOCUMENT_ACCESS', 'DOCUMENT', 'doc_1756925519489', '{"chunks_retrieved": 2, "question": "Tell me about Travelers insurance"}', '192.168.1.102');