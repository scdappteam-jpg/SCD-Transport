#!/usr/bin/env node

const crypto = require("crypto");

const password = process.env.SCD_AUTH_PASSWORD;

if (!password) {
    console.error("Set SCD_AUTH_PASSWORD in your shell, then run this script again.");
    console.error("Example: read -s SCD_AUTH_PASSWORD; export SCD_AUTH_PASSWORD; node scripts/generate-auth-password-hash.cjs");
    process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
console.log(`scrypt$${salt.toString("base64")}$${hash.toString("base64")}`);
