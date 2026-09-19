#!/usr/bin/env node
/*
 * One-time migration from legacy /storage URLs to the private
 * `scd-documents` bucket. Requires SUPABASE_DB_URL, SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. Set LEGACY_APP_ORIGIN to the running legacy app.
 */

const { execFileSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");

const dbUrl = process.env.SUPABASE_DB_URL;
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const legacyOrigin = String(process.env.LEGACY_APP_ORIGIN || "https://scd-transport.onrender.com").replace(/\/$/, "");
const bucket = "scd-documents";

if (!dbUrl || !supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_DB_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation"
};

function objectPathFor(attachment) {
    const createdAt = new Date(attachment.createdAt || Date.now());
    const date = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
    const safeHouse = String(attachment.houseNumber || "unassigned").replace(/[^A-Za-z0-9_-]/g, "_");
    const filename = String(attachment.url || "").split("/").pop() || `${attachment.fileId || "document"}.bin`;
    return `${safeHouse}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${attachment.fileId}${path.extname(filename).toLowerCase() || ".bin"}`;
}

async function loadJobsByHouse(houses) {
    const result = new Map();
    for (let offset = 0; offset < houses.length; offset += 100) {
        const chunk = houses.slice(offset, offset + 100);
        const url = new URL(`${supabaseUrl}/rest/v1/jobs`);
        url.searchParams.set("select", "id,house_number");
        url.searchParams.set("house_number", `in.(${chunk.map(value => `\"${String(value).replace(/\"/g, "\\\"")}\"`).join(",")})`);
        const response = await fetch(url, { headers: restHeaders });
        if (!response.ok) throw new Error(`Unable to read jobs: ${response.status} ${await response.text()}`);
        for (const job of await response.json()) result.set(job.house_number, job.id);
    }
    return result;
}

async function upload(attachment, content) {
    const objectPath = objectPathFor(attachment);
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`, {
        method: "PUT",
        headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": attachment.mimeType || "application/octet-stream",
            "x-upsert": "true"
        },
        body: content
    });
    if (!response.ok) throw new Error(`Storage upload failed: ${response.status} ${await response.text()}`);
    return objectPath;
}

async function main() {
    const output = execFileSync("psql", [ dbUrl, "--tuples-only", "--no-align", "--command", "select coalesce(data->'attachments', '[]'::jsonb)::text from public.app_state where id = 'scd-transport'" ], { encoding: "utf8" }).trim();
    const attachments = output ? JSON.parse(output) : [];
    const jobIds = await loadJobsByHouse([ ...new Set(attachments.map(item => item.houseNumber).filter(Boolean)) ]);
    const rows = [];
    const failures = [];

    for (const attachment of attachments) {
        const jobId = jobIds.get(attachment.houseNumber);
        if (!attachment.fileId || !attachment.url || !jobId) {
            failures.push({ fileId: attachment.fileId || null, reason: "missing metadata or job" });
            continue;
        }
        try {
            const response = await fetch(`${legacyOrigin}${attachment.url}`);
            if (!response.ok) throw new Error(`legacy download ${response.status}`);
            const content = Buffer.from(await response.arrayBuffer());
            if (content.length > 10 * 1024 * 1024) throw new Error("file exceeds 10 MB policy");
            const objectPath = await upload(attachment, content);
            rows.push({
                legacy_file_id: attachment.fileId,
                job_id: jobId,
                bucket_id: bucket,
                object_path: objectPath,
                file_type: attachment.fileType || "FieldDocument",
                original_filename: path.basename(attachment.url),
                mime_type: attachment.mimeType || response.headers.get("content-type") || null,
                byte_size: content.length,
                checksum: crypto.createHash("sha256").update(content).digest("hex"),
                uploaded_by: attachment.userId || null,
                created_at: attachment.createdAt || new Date().toISOString()
            });
        } catch (error) {
            failures.push({ fileId: attachment.fileId, reason: error.message });
        }
    }

    if (rows.length) {
        const response = await fetch(`${supabaseUrl}/rest/v1/job_attachments?on_conflict=legacy_file_id`, {
            method: "POST",
            headers: restHeaders,
            body: JSON.stringify(rows)
        });
        if (!response.ok) throw new Error(`Unable to store attachment metadata: ${response.status} ${await response.text()}`);
    }
    console.log(JSON.stringify({ total: attachments.length, migrated: rows.length, failed: failures.length, failures }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
