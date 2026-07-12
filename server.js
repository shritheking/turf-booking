const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const dgram = require('dgram');

const projectDir = __dirname;
const dbPath = path.join(projectDir, 'users.json');

console.log('--- STARTING VALIDATION ---');

// 1. Check file existence
const files = ['index.html', 'admin.html', 'index.css', 'index.js', 'admin.js', 'assets/images/logo.jpg', 'assets/images/hero.jpg', '.env'];
let allExist = true;

files.forEach(f => {
  if (f === '.env' && process.env.EMAIL_USER) {
    console.log(`[PASS] .env file check bypassed (using environment variables)`);
    return;
  }
  const filePath = path.join(projectDir, f);
  if (fs.existsSync(filePath)) {
    console.log(`[PASS] File exists: ${f}`);
  } else {
    console.error(`[FAIL] File NOT found: ${f} at ${filePath}`);
    allExist = false;
  }
});

if (!allExist) {
  process.exit(1);
}

// Initialize users.json if empty
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '[]', 'utf-8');
}

// 2. Load configuration from system environment or .env file
const envVars = {
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASS: process.env.EMAIL_PASS || '',
  EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
  EMAIL_PORT: process.env.EMAIL_PORT || '465',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || ''
};

const envPath = path.join(projectDir, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index > -1) {
          const key = trimmed.substring(0, index).trim();
          let val = trimmed.substring(index + 1).trim();
          
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          
          envVars[key] = val;
        }
      }
    });
    console.log('[PASS] .env file successfully loaded and parsed.');
  } catch (err) {
    console.error('Could not parse .env file:', err);
  }
} else {
  console.log('[PASS] .env file not found. Using system environment variables.');
}

console.log(`[SMTP Settings] Host: ${envVars.EMAIL_HOST}, Port: ${envVars.EMAIL_PORT}, User: ${envVars.EMAIL_USER}, Pass configured: ${!!envVars.EMAIL_PASS}`);

// 3. Validate HTML references & DOM IDs
const customerHtml = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf-8');
const adminHtml = fs.readFileSync(path.join(projectDir, 'admin.html'), 'utf-8');

const customerIds = [
  'toast-container',
  'main-header',
  'navbar',
  'ground-container',
  'date-slider',
  'slots-grid',
  'summary-bar',
  'checkout-modal',
  'my-bookings-list',
  'bookings-empty-state',
  'customer-name',
  'customer-phone',
  'customer-email'
];

const adminIds = [
  'toast-container',
  'main-header',
  'navbar',
  'admin-bookings-table-body',
  'block-date',
  'block-sport',
  'block-ground',
  'block-hour'
];

console.log('\n--- DOM ID VALIDATION ---');
let allIdsPresent = true;

console.log('Validating customer index.html:');
customerIds.forEach(id => {
  if (customerHtml.includes(`id="${id}"`) || customerHtml.includes(`id='${id}'`)) {
    console.log(`[PASS] index.html contains DOM element: #${id}`);
  } else {
    console.error(`[FAIL] index.html is missing DOM element: #${id}`);
    allIdsPresent = false;
  }
});

console.log('\nValidating admin.html:');
adminIds.forEach(id => {
  if (adminHtml.includes(`id="${id}"`) || adminHtml.includes(`id='${id}'`)) {
    console.log(`[PASS] admin.html contains DOM element: #${id}`);
  } else {
    console.error(`[FAIL] admin.html is missing DOM element: #${id}`);
    allIdsPresent = false;
  }
});

// Check if links are correct
if (customerHtml.includes('href="index.css"') && customerHtml.includes('src="index.js"') && customerHtml.includes('src="env.js"')) {
  console.log('\n[PASS] index.html correctly links index.css, index.js, and env.js');
} else {
  console.error('\n[FAIL] Script or style tags are incorrect in index.html');
  allIdsPresent = false;
}

if (adminHtml.includes('href="index.css"') && adminHtml.includes('src="admin.js"') && adminHtml.includes('src="env.js"')) {
  console.log('[PASS] admin.html correctly links index.css, admin.js, and env.js');
} else {
  console.error('[FAIL] Script or style tags are incorrect in admin.html');
  allIdsPresent = false;
}

if (!allIdsPresent) {
  console.error('\nValidation failed. Please correct DOM errors.');
  process.exit(1);
}

console.log('\n--- ALL VALIDATIONS PASSED ---');
console.log('Starting local testing web server on port 8080...');

// Helper to fetch authoritative time from pool.ntp.org (Port 123 UDP)
function getNTPTime() {
  return new Promise((resolve) => {
    const server = 'pool.ntp.org';
    const port = 123;
    const client = dgram.createSocket('udp4');
    
    const buffer = Buffer.alloc(48);
    buffer[0] = 0x1B; // LI = 0, VN = 3, Mode = 3 (client)
    
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.close();
        console.log('[NTP] Request timed out. Falling back to local system time.');
        resolve(new Date());
      }
    }, 4000);
    
    client.on('message', (msg) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      client.close();
      
      const secondsSince1900 = msg.readUInt32BE(40);
      const unixEpochSeconds = secondsSince1900 - 2208988800;
      const ntpDate = new Date(unixEpochSeconds * 1000);
      console.log(`[NTP] Time successfully synchronized: ${ntpDate.toISOString()}`);
      resolve(ntpDate);
    });
    
    client.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      client.close();
      console.log('[NTP] Socket error. Falling back to local system time:', err.message);
      resolve(new Date());
    });
    
    client.send(buffer, 0, buffer.length, port, server, (err) => {
      if (err) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        client.close();
        console.log('[NTP] Send error. Falling back to local system time:', err.message);
        resolve(new Date());
      }
    });
  });
}

// Helper to read and write local users database
function readUsers() {
  try {
    const data = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(dbPath, JSON.stringify(users, null, 2), 'utf-8');
}

// Custom SMTP client using raw TLS socket (No npm dependencies)
function sendSMTPEmail({ host, port, user, pass, from, to, subject, body }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, family: 4, rejectUnauthorized: false }, () => {
      // Socket connected
    });

    let step = 0;
    let timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    }, 15000);

    socket.on('data', (data) => {
      const response = data.toString();
      const code = response.substring(0, 3);
      
      if (step === 0 && code === '220') {
        socket.write('EHLO localhost\r\n');
        step = 1;
      } else if (step === 1 && code === '250') {
        if (response.includes('\n250 ') || !response.includes('250-')) {
          socket.write('AUTH LOGIN\r\n');
          step = 2;
        }
      } else if (step === 2 && code === '334') {
        socket.write(Buffer.from(user).toString('base64') + '\r\n');
        step = 3;
      } else if (step === 3 && code === '334') {
        socket.write(Buffer.from(pass).toString('base64') + '\r\n');
        step = 4;
      } else if (step === 4 && code === '235') {
        socket.write(`MAIL FROM:<${from}>\r\n`);
        step = 5;
      } else if (step === 5 && code === '250') {
        socket.write(`RCPT TO:<${to}>\r\n`);
        step = 6;
      } else if (step === 6 && code === '250') {
        socket.write('DATA\r\n');
        step = 7;
      } else if (step === 7 && code === '354') {
        const mailContent = 
          `From: ${from}\r\n` +
          `To: ${to}\r\n` +
          `Subject: ${subject}\r\n` +
          `MIME-Version: 1.0\r\n` +
          `Content-Type: text/html; charset=utf-8\r\n\r\n` +
          `${body}\r\n` +
          `.\r\n`;
        socket.write(mailContent);
        step = 8;
      } else if (step === 8 && code === '250') {
        socket.write('QUIT\r\n');
        step = 9;
      } else if (step === 9 && (code === '221' || code === '250')) {
        clearTimeout(timeout);
        socket.end();
        resolve(true);
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    socket.on('end', () => {
      clearTimeout(timeout);
      if (step < 9) {
        reject(new Error('SMTP connection closed prematurely by server'));
      }
    });
  });
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// 5. Start development server with API routing
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  let reqUrl = req.url === '/' ? '/index.html' : req.url;
  
  if (reqUrl.includes('?')) {
    reqUrl = reqUrl.split('?')[0];
  }
  
  // Dynamic env.js route
  if (reqUrl === '/env.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    const payload = `window.ENV = { RAZORPAY_KEY_ID: "${envVars.RAZORPAY_KEY_ID || ''}" };`;
    res.end(payload, 'utf-8');
    return;
  }

  // --- API ROUTING SECTION ---

  // 1. SIGN UP ROUTE
  if (reqUrl === '/api/auth/signup' && req.method === 'POST') {
    const data = await readJsonBody(req);
    if (!data || !data.name || !data.email || !data.phone || !data.password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Missing required signup fields.' }));
      return;
    }

    const users = readUsers();
    const existing = users.find(u => u.email.toLowerCase() === data.email.toLowerCase() && u.verified);
    if (existing) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Email address already registered.' }));
      return;
    }

    // Generate 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 15 * 60 * 1000; // 15 mins expiry

    // Send Real Email OTP
    let emailSent = false;
    let fallbackNotice = '';
    const hasSmtpConfig = envVars.EMAIL_USER && !envVars.EMAIL_USER.includes('your-email') && envVars.EMAIL_PASS && !envVars.EMAIL_PASS.includes('your-gmail');

    if (!hasSmtpConfig) {
      console.log(`\n======================================================`);
      console.log(`[DEVELOPER OTP FALLBACK] Code for ${data.email}: ${otpCode}`);
      console.log(`======================================================\n`);
      fallbackNotice = '(SMTP credentials not configured in .env. Falling back: printed code to console)';
      emailSent = true;
    } else {
      try {
        await sendSMTPEmail({
          host: envVars.EMAIL_HOST,
          port: parseInt(envVars.EMAIL_PORT),
          user: envVars.EMAIL_USER,
          pass: envVars.EMAIL_PASS,
          from: envVars.EMAIL_USER,
          to: data.email,
          subject: 'GOAT Turf Registration Verification OTP',
          body: `<div style="font-family:sans-serif; max-width:500px; padding:20px; border:1px solid #dadce0; border-radius:8px;">
            <h2 style="color:#1e8e3e; font-weight:500;">Verify Your Email Address</h2>
            <p>Thank you for signing up with GOAT Turf Madurai.</p>
            <p>Please use the following 6-digit code to verify your account registration:</p>
            <div style="font-size:28px; font-weight:700; color:#1a73e8; letter-spacing:2px; margin:20px 0; text-align:center; padding:10px; background-color:#f1f3f4; border-radius:4px;">${otpCode}</div>
            <p style="color:#5f6368; font-size:12px;">This verification code is valid for 15 minutes.</p>
          </div>`
        });
        emailSent = true;
      } catch (err) {
        console.error('SMTP Mail Sending Failure:', err);
        console.log(`\n======================================================`);
        console.log(`[DEVELOPER OTP FALLBACK] Code for ${data.email}: ${otpCode}`);
        console.log(`======================================================\n`);
        fallbackNotice = `(SMTP mail send failed: ${err ? (err.message || err.toString()) : 'Unknown error'}. Falling back: printed code to console)`;
        emailSent = true;
      }
    }

    if (emailSent) {
      // Save or update unverified user details
      const filtered = users.filter(u => u.email.toLowerCase() !== data.email.toLowerCase());
      filtered.push({
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
        verified: false,
        otp: otpCode,
        otpExpiry: otpExpiry
      });
      writeUsers(filtered);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, fallbackNotice }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Could not send verification OTP.' }));
    }
    return;
  }

  // 2. VERIFY OTP ROUTE
  if (reqUrl === '/api/auth/verify-otp' && req.method === 'POST') {
    const data = await readJsonBody(req);
    if (!data || !data.email || !data.otp) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Missing email or OTP fields.' }));
      return;
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === data.email.toLowerCase());
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'No profile found for verification.' }));
      return;
    }

    if (user.otp === data.otp && user.otpExpiry > Date.now()) {
      user.verified = true;
      delete user.otp;
      delete user.otpExpiry;
      writeUsers(users);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Incorrect or expired verification code.' }));
    }
    return;
  }

  // 6. RESEND OTP ROUTE
  if (reqUrl === '/api/auth/resend-otp' && req.method === 'POST') {
    const data = await readJsonBody(req);
    if (!data || !data.email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Missing email field.' }));
      return;
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === data.email.toLowerCase());
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'No registered user found.' }));
      return;
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 15 * 60 * 1000;

    let emailSent = false;
    let fallbackNotice = '';
    const hasSmtpConfig = envVars.EMAIL_USER && !envVars.EMAIL_USER.includes('your-email') && envVars.EMAIL_PASS && !envVars.EMAIL_PASS.includes('your-gmail');

    if (!hasSmtpConfig) {
      console.log(`\n======================================================`);
      console.log(`[DEVELOPER OTP FALLBACK] Resent Code for ${data.email}: ${otpCode}`);
      console.log(`======================================================\n`);
      fallbackNotice = '(SMTP credentials not configured in .env. Falling back: printed code to console)';
      emailSent = true;
    } else {
      try {
        await sendSMTPEmail({
          host: envVars.EMAIL_HOST,
          port: parseInt(envVars.EMAIL_PORT),
          user: envVars.EMAIL_USER,
          pass: envVars.EMAIL_PASS,
          from: envVars.EMAIL_USER,
          to: data.email,
          subject: 'GOAT Turf Registration Verification OTP (Resent)',
          body: `<div style="font-family:sans-serif; max-width:500px; padding:20px; border:1px solid #dadce0; border-radius:8px;">
            <h2 style="color:#1e8e3e; font-weight:500;">Verify Your Email Address</h2>
            <p>Thank you for signing up with GOAT Turf Madurai.</p>
            <p>Your resent 6-digit verification code is:</p>
            <div style="font-size:28px; font-weight:700; color:#1a73e8; letter-spacing:2px; margin:20px 0; text-align:center; padding:10px; background-color:#f1f3f4; border-radius:4px;">${otpCode}</div>
            <p style="color:#5f6368; font-size:12px;">This verification code is valid for 15 minutes.</p>
          </div>`
        });
        emailSent = true;
      } catch (err) {
        console.error('SMTP Mail Sending Failure (Resend):', err);
        console.log(`\n======================================================`);
        console.log(`[DEVELOPER OTP FALLBACK] Resent Code for ${data.email}: ${otpCode}`);
        console.log(`======================================================\n`);
        fallbackNotice = `(SMTP mail send failed: ${err ? (err.message || err.toString()) : 'Unknown error'}. Falling back: printed code to console)`;
        emailSent = true;
      }
    }

    if (emailSent) {
      user.otp = otpCode;
      user.otpExpiry = otpExpiry;
      writeUsers(users);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, fallbackNotice }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Could not send verification OTP.' }));
    }
    return;
  }

  // 3. LOGIN ROUTE
  if (reqUrl === '/api/auth/login' && req.method === 'POST') {
    const data = await readJsonBody(req);
    if (!data || !data.email || !data.password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Missing email or password.' }));
      return;
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === data.email.toLowerCase() && u.password === data.password);
    
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid email or password.' }));
      return;
    }

    if (!user.verified) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Email address has not been verified yet.', unverified: true }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    }));
    return;
  }

  // 4. FORGOT PASSWORD ROUTE
  if (reqUrl === '/api/auth/forgot-password' && req.method === 'POST') {
    const data = await readJsonBody(req);
    if (!data || !data.email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Missing email field.' }));
      return;
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === data.email.toLowerCase() && u.verified);
    
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'No verified account found with this email.' }));
      return;
    }

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpiry = Date.now() + 15 * 60 * 1000;

    let emailSent = false;
    let fallbackNotice = '';
    const hasSmtpConfig = envVars.EMAIL_USER && !envVars.EMAIL_USER.includes('your-email') && envVars.EMAIL_PASS && !envVars.EMAIL_PASS.includes('your-gmail');

    if (!hasSmtpConfig) {
      console.log(`\n======================================================`);
      console.log(`[DEVELOPER PASSWORD RESET] Code for ${data.email}: ${resetCode}`);
      console.log(`======================================================\n`);
      fallbackNotice = '(SMTP credentials not configured in .env. Falling back: printed code to console)';
      emailSent = true;
    } else {
      try {
        await sendSMTPEmail({
          host: envVars.EMAIL_HOST,
          port: parseInt(envVars.EMAIL_PORT),
          user: envVars.EMAIL_USER,
          pass: envVars.EMAIL_PASS,
          from: envVars.EMAIL_USER,
          to: data.email,
          subject: 'GOAT Turf Password Reset Verification Code',
          body: `<div style="font-family:sans-serif; max-width:500px; padding:20px; border:1px solid #dadce0; border-radius:8px;">
            <h2 style="color:#d93025; font-weight:500;">Password Reset Verification</h2>
            <p>You requested a password reset for your GOAT Turf Madurai account.</p>
            <p>Please use the following 6-digit code to complete your password reset:</p>
            <div style="font-size:28px; font-weight:700; color:#d93025; letter-spacing:2px; margin:20px 0; text-align:center; padding:10px; background-color:#f1f3f4; border-radius:4px;">${resetCode}</div>
            <p style="color:#5f6368; font-size:12px;">This password reset code is valid for 15 minutes. If you did not request this, please ignore this email.</p>
          </div>`
        });
        emailSent = true;
      } catch (err) {
        console.error('SMTP Mail Reset Failure:', err);
        console.log(`\n======================================================`);
        console.log(`[DEVELOPER PASSWORD RESET] Code for ${data.email}: ${resetCode}`);
        console.log(`======================================================\n`);
        fallbackNotice = `(SMTP mail send failed: ${err ? (err.message || err.toString()) : 'Unknown error'}. Falling back: printed code to console)`;
        emailSent = true;
      }
    }

    if (emailSent) {
      user.resetCode = resetCode;
      user.resetExpiry = resetExpiry;
      writeUsers(users);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, fallbackNotice }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Could not send reset OTP.' }));
    }
    return;
  }

  // 5. RESET PASSWORD ROUTE
  if (reqUrl === '/api/auth/reset-password' && req.method === 'POST') {
    const data = await readJsonBody(req);
    if (!data || !data.email || !data.code || !data.newPassword) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Missing required reset password fields.' }));
      return;
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === data.email.toLowerCase() && u.verified);
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'User account not found.' }));
      return;
    }

    if (user.resetCode === data.code && user.resetExpiry > Date.now()) {
      user.password = data.newPassword;
      delete user.resetCode;
      delete user.resetExpiry;
      writeUsers(users);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Incorrect or expired reset verification code.' }));
    }
    return;
  }

  // NTP TIME ROUTE
  if (reqUrl === '/api/time' && req.method === 'GET') {
    try {
      const ntpTime = await getNTPTime();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ntpTime: ntpTime.toISOString() }));
    } catch (err) {
      console.error('NTP API Error:', err);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ntpTime: new Date().toISOString() })); // fallback to local system time
    }
    return;
  }

  // --- END OF API ROUTING SECTION ---

  const filePath = path.join(projectDir, reqUrl);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  GOAT Turf Booking web application is live!`);
  console.log(`  Local server address: http://localhost:${PORT}`);
  console.log(`  Admin Console: http://localhost:${PORT}/admin.html`);
  console.log(`======================================================`);
});
