import https from 'https';
import forge from 'node-forge';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import app from './app.js';

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// Generate or load self-signed certificate
function ensureCertificate(): { cert: string; key: string } {
  const certPath = './ssl-cert.pem';
  const keyPath = './ssl-key.pem';
  
  if (existsSync(certPath) && existsSync(keyPath)) {
    console.log('📜 Loading existing certificate...');
    return {
      cert: readFileSync(certPath, 'utf8'),
      key: readFileSync(keyPath, 'utf8')
    };
  }
  
  console.log('📜 Generating self-signed certificate...');
  
  // Generate a key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);
  
  // Create a certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  
  const attrs = [{
    name: 'commonName',
    value: '192.168.1.90'
  }];
  
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  
  // Self-sign certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());
  
  // Convert to PEM format
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  
  // Save to files
  writeFileSync(certPath, certPem);
  writeFileSync(keyPath, keyPem);
  
  console.log('✅ Certificate generated successfully');
  
  return {
    cert: certPem,
    key: keyPem
  };
}

// Start server
if (USE_HTTPS) {
  // For local development with mobile testing - use HTTPS with self-signed cert
  const credentials = ensureCertificate();
  
  https.createServer(credentials, app).listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 madetogether server running on https://0.0.0.0:${PORT}`);
    console.log(`📱 Network access: https://192.168.1.90:${PORT}`);
    console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/madetogether'}`);
    console.log(`\n⚠️  Using self-signed certificate - IMPORTANT STEPS FOR iPHONE:`);
    console.log(`   1. Open Safari on iPhone and go to: https://192.168.1.90:${PORT}/api/health`);
    console.log(`   2. Tap "Show Details" → "visit this website" → "Visit Website"`);
    console.log(`   3. After accepting the certificate, reload your app\n`);
  });
} else {
  // Regular HTTP server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 madetogether server running on http://localhost:${PORT}`);
    console.log(`📱 Network access: http://192.168.1.90:${PORT}`);
    console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/madetogether'}`);
  });
}
