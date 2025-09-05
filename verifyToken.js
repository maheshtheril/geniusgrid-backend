// verifyToken.js
const jwt = require('jsonwebtoken');
const secret = '8f1c9f0c8e7d3a6b5c9a7e1d4b0f2a3d8c1f9b6a3d2c7e0f8a9b1c2d3e4f5a6'; // your secret
const token = process.argv[2];
if (!token) {
  console.error('Usage: node verifyToken.js <token>');
  process.exit(2);
}
try {
  const payload = jwt.verify(token, secret);
  console.log('VERIFIED payload:', payload);
} catch (e) {
  console.error('VERIFY FAILED:', e.name, e.message);
}
