#!/usr/bin/env node
/*
 * Creates or updates Supabase Auth accounts for existing legacy users.
 *
 * Run only from a trusted admin machine.  Passwords are supplied at runtime,
 * never stored in app_state, source code, or a committed environment file.
 *
 * Example:
 * SCD_AUTH_BOOTSTRAP_PASSWORDS_JSON='{"u_admin_01":"..."}' \
 * node scripts/provision-supabase-auth.cjs --apply
 */

const required = [ "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCD_AUTH_BOOTSTRAP_PASSWORDS_JSON" ];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
    process.exit(1);
}

const apply = process.argv.includes("--apply");
let passwordMap;
try {
    passwordMap = JSON.parse(process.env.SCD_AUTH_BOOTSTRAP_PASSWORDS_JSON);
} catch (_) {
    console.error("SCD_AUTH_BOOTSTRAP_PASSWORDS_JSON must be a JSON object keyed by legacy user id.");
    process.exit(1);
}

if (!passwordMap || Array.isArray(passwordMap) || typeof passwordMap !== "object") {
    console.error("SCD_AUTH_BOOTSTRAP_PASSWORDS_JSON must be a JSON object keyed by legacy user id.");
    process.exit(1);
}

const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
};

async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${body.msg || body.message || body.error || "unknown error"}`);
    return body;
}

async function main() {
    const legacyIds = Object.keys(passwordMap).map(value => String(value).trim()).filter(Boolean);
    if (!legacyIds.length) throw new Error("No user ids provided.");
    // The internal user directory is small and this avoids composing an
    // unsafe PostgREST filter from account identifiers.
    const allProfiles = await request("/rest/v1/user_profiles?select=legacy_user_id,login_email,auth_user_id,display_name,status");
    const profiles = allProfiles.filter(profile => legacyIds.includes(profile.legacy_user_id));
    const byLegacyId = new Map(profiles.map(profile => [ profile.legacy_user_id, profile ]));
    const missingProfiles = legacyIds.filter(id => !byLegacyId.has(id));
    if (missingProfiles.length) throw new Error(`No user profile found for: ${missingProfiles.join(", ")}. Apply migration 20261011_009 first.`);

    const users = await request("/auth/v1/admin/users?page=1&per_page=1000");
    const authUsers = users.users || [];
    const byEmail = new Map(authUsers.filter(user => user.email).map(user => [ user.email.toLowerCase(), user ]));
    const summary = [];
    for (const legacyId of legacyIds) {
        const profile = byLegacyId.get(legacyId);
        const password = String(passwordMap[legacyId] || "");
        if (password.length < 8) throw new Error(`${legacyId}: password must be at least 8 characters.`);
        const existing = profile.auth_user_id ? authUsers.find(user => user.id === profile.auth_user_id) : byEmail.get(profile.login_email.toLowerCase());
        summary.push({ legacyId, email: profile.login_email, action: existing ? "update" : "create" });
        if (!apply) continue;
        const payload = {
            email: profile.login_email,
            password,
            email_confirm: true,
            user_metadata: { legacy_user_id: legacyId, display_name: profile.display_name }
        };
        if (existing) await request(`/auth/v1/admin/users/${encodeURIComponent(existing.id)}`, { method: "PUT", body: JSON.stringify(payload) });
        else await request("/auth/v1/admin/users", { method: "POST", body: JSON.stringify(payload) });
    }
    console.log(JSON.stringify({ apply, accounts: summary }, null, 2));
    if (!apply) console.log("Dry run only. Re-run with --apply after verifying the account list.");
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
