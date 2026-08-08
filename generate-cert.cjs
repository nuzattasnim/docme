// One-shot helper: generate a self-signed cert for dmqhre.slsblx.com and write
// .cert/dev-cert.pem + .cert/dev-key.pem. Run with: node generate-cert.js
const fs = require("node:fs");
const path = require("node:path");
const selfsigned = require("selfsigned");

(async () => {
  const DOMAIN = "dmqhre.slsblx.com";
  const certDir = path.join(__dirname, ".cert");
  const certPath = path.join(certDir, "dev-cert.pem");
  const keyPath = path.join(certDir, "dev-key.pem");

  fs.mkdirSync(certDir, { recursive: true });

  const attrs = [{ name: "commonName", value: DOMAIN }];
  const pems = await selfsigned.generate(attrs, {
    algorithm: "sha256",
    days: 365,
    keySize: 2048,
    extensions: [
      { name: "basicConstraints", cA: false },
      {
        name: "subjectAltName",
        altNames: [{ type: 2, value: DOMAIN }],
      },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    ],
  });

  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);

  console.log(`Wrote ${certPath}`);
  console.log(`Wrote ${keyPath}`);
  console.log(`Thumbprint: ${pems.fingerprint}`);
  console.log("Now import the cert to the user Root store so the browser trusts it.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
