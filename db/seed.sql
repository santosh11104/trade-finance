-- Seed data for Trade Finance LC System
-- Passwords are hashed as 'password' (bcrypt hash)

INSERT INTO users (username, password_hash, role, org_msp) VALUES
('importer1', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxadisLKqMZWlTnPG', 'importer', 'Org1MSP'),
('exporter1', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxadisLKqMZWlTnPG', 'exporter', 'Org2MSP'),
('bank1', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxadisLKqMZWlTnPG', 'bank', 'Org3MSP'),
('bank2', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxadisLKqMZWlTnPG', 'bank', 'Org4MSP'),
('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxadisLKqMZWlTnPG', 'admin', 'Org1MSP');
