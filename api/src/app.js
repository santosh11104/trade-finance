const tracing = require('./tracing');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const config = require('./config');
const { signToken, authorize } = require('./auth');
const db = require('./db');
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
    }

    res.json({ success: true, message: 'Database seeded with test users' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const userResult = await db.query('SELECT username, role, org_msp FROM users WHERE username=$1', [username]);
    if (!userResult.rows.length) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const user = userResult.rows[0];
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
