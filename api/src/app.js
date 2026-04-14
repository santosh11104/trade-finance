const tracing = require('./tracing');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { signToken, authorize, permit } = require('./auth');
const db = require('./db');
const caClient = require('./caClient');
const lcRoutes = require('./routes/lc');
const eventListener = require('./eventListener');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// Seed database with test users (for development only)
app.post('/admin/seed', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password', salt);

    const users = [
      { username: 'importer1', role: 'importer', org: 'Org1MSP' },
      { username: 'exporter1', role: 'exporter', org: 'Org2MSP' },
      { username: 'bank1', role: 'bank', org: 'Org3MSP' },
      { username: 'bank2', role: 'bank', org: 'Org4MSP' },
      { username: 'admin', role: 'admin', org: 'Org1MSP' }
    ];

    for (const user of users) {
      await db.query(
        'INSERT INTO users (username, password_hash, role, org_msp) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING',
        [user.username, passwordHash, user.role, user.org]
      );
      try {
        await caClient.registerAndEnrollUser(user.username, user.role, user.org);
      } catch (caErr) {
        console.warn(`CA registration failed for ${user.username}: ${caErr.message}`);
      }
    }

    res.json({ success: true, message: 'Database seeded with test users and Fabric identities' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User registration (admin only)
app.post('/auth/register', authorize, permit('admin'), async (req, res) => {
  const { username, password, role, orgMsp } = req.body;

  // Validate required fields
  if (!username || !password || !role || !orgMsp) {
    return res.status(400).json({
      error: 'username, password, role, and orgMsp are required',
      validRoles: ['importer', 'exporter', 'bank', 'admin'],
      validOrgs: ['Org1MSP', 'Org2MSP', 'Org3MSP', 'Org4MSP']
    });
  }

  // Validate role
  const validRoles = ['importer', 'exporter', 'bank', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      error: 'invalid role',
      validRoles
    });
  }

  // Validate org MSP
  const validOrgs = ['Org1MSP', 'Org2MSP', 'Org3MSP', 'Org4MSP'];
  if (!validOrgs.includes(orgMsp)) {
    return res.status(400).json({
      error: 'invalid orgMsp',
      validOrgs
    });
  }

  // Validate password strength
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      'INSERT INTO users (username, password_hash, role, org_msp) VALUES ($1, $2, $3, $4) RETURNING username, role, org_msp',
      [username, passwordHash, role, orgMsp]
    );

    // Register with Fabric CA
    try {
      await caClient.registerAndEnrollUser(username, role, orgMsp);
    } catch (caErr) {
      console.error(`Fabric CA registration failed for ${username}:`, caErr);
      // Optional: you might want to rollback the database insert if CA registration fails
      // for now we'll just return a success but with a warning or fail the whole request
      return res.status(500).json({ error: `User created in DB but Fabric CA registration failed: ${caErr.message}` });
    }

    res.status(201).json({
      success: true,
      message: 'user created successfully and enrolled with Fabric CA',
      user: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// User login
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const userResult = await db.query('SELECT username, password_hash, role, org_msp FROM users WHERE username=$1', [username]);
    if (!userResult.rows.length) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const user = userResult.rows[0];

    // Verify password against hash
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = signToken({ username: user.username, role: user.role, orgMsp: user.org_msp });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/lc', authorize, lcRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const start = async () => {
  try {
    await db.initDb();
    await caClient.enrollAdmin();
    await eventListener.startEventListener();
    app.listen(config.port, () => {
      console.log(`Trade Finance API listening on port ${config.port}`);
      console.log(`API Endpoints:`);
      console.log(`  POST /auth/login    - Authenticate user`);
      console.log(`  POST /lc/create     - Create LC (importer)`);
      console.log(`  POST /lc/issue      - Issue LC (importer proposes, bank approves)`);
      console.log(`  POST /lc/advise     - Advise LC (advising bank)`);
      console.log(`  POST /lc/confirm    - Confirm LC (advising bank)`);
      console.log(`  POST /lc/ship       - Submit documents (exporter)`);
      console.log(`  POST /lc/verify     - Verify documents (issuing bank)`);
      console.log(`  POST /lc/pay        - Release payment (exporter proposes, bank approves)`);
      console.log(`  POST /lc/amend      - Amend LC (importer/bank)`);
      console.log(`  POST /lc/cancel     - Cancel LC (importer/bank)`);
      console.log(`  GET  /lc/:id        - Query LC by ID`);
      console.log(`  GET  /lc/:id/history - Get LC status history`);
    });
  } catch (err) {
    console.error('Failed to start API', err);
    process.exit(1);
  }
};

start();
