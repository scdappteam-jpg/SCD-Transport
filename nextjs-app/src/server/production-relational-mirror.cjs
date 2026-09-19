/*
 * Additive bridge from the existing app_state document to the relational
 * production schema.  Reads still come from app_state during the transition.
 * Every payload uses a stable legacy key, so retries are safe.
 */

const crypto = require("crypto");

const fs = require("fs");

const path = require("path");

function asText(value, fallback = "") {
    return value === undefined || value === null ? fallback : String(value);
}

function asNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function asIso(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function stableHash(value) {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function createProductionRelationalMirror({ url, key, storageDir, storageBucket = "scd-documents", enabled = true, logger = console } = {}) {
    let mirrorPromise = Promise.resolve();
    let lastSnapshotHash = "";

    if (!enabled || !url || !key) {
        return { schedule() {}, async flush() {}, isEnabled: false };
    }

    const baseUrl = String(url).replace(/\/$/, "");
    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
    };

    async function upsert(table, conflictColumn, rows) {
        if (!rows.length) return [];
        const response = await fetch(`${baseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
            method: "POST",
            headers,
            body: JSON.stringify(rows)
        });
        if (!response.ok) throw new Error(`Relational mirror ${table}: ${response.status} ${await response.text()}`);
        return response.json();
    }

    async function uploadDocument(objectPath, mimeType, buffer) {
        const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
        const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(storageBucket)}/${encodedPath}`, {
            method: "PUT",
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": mimeType || "application/octet-stream",
                "x-upsert": "true"
            },
            body: buffer
        });
        if (!response.ok) throw new Error(`Storage upload ${response.status}: ${await response.text()}`);
    }

    function localAttachmentFile(attachment) {
        if (!storageDir || !attachment?.url?.startsWith("/storage/")) return null;
        const relative = decodeURIComponent(attachment.url.slice("/storage/".length));
        const root = path.resolve(storageDir);
        const filePath = path.resolve(root, relative);
        return filePath.startsWith(root + path.sep) ? filePath : null;
    }

    async function mirrorAttachments(attachments, jobIds) {
        const rows = [];
        let skipped = 0;
        for (const attachment of attachments) {
            const jobId = jobIds.get(asText(attachment.houseNumber));
            const filePath = localAttachmentFile(attachment);
            if (!jobId || !filePath || !fs.existsSync(filePath)) {
                skipped++;
                continue;
            }
            const content = fs.readFileSync(filePath);
            const createdAt = asIso(attachment.createdAt) || new Date().toISOString();
            const date = new Date(createdAt);
            const extension = path.extname(filePath).toLowerCase() || ".bin";
            const safeHouse = asText(attachment.houseNumber, "unassigned").replace(/[^A-Za-z0-9_-]/g, "_");
            const objectPath = `${safeHouse}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${attachment.fileId}${extension}`;
            await uploadDocument(objectPath, attachment.mimeType, content);
            rows.push({
                legacy_file_id: asText(attachment.fileId),
                job_id: jobId,
                bucket_id: storageBucket,
                object_path: objectPath,
                file_type: asText(attachment.fileType, "FieldDocument"),
                original_filename: path.basename(filePath),
                mime_type: asText(attachment.mimeType) || null,
                byte_size: content.length,
                checksum: crypto.createHash("sha256").update(content).digest("hex"),
                uploaded_by: asText(attachment.userId) || null,
                created_at: createdAt
            });
        }
        await upsert("job_attachments", "legacy_file_id", rows);
        return { uploaded: rows.length, skipped };
    }

    async function mirror(db) {
        const source = {
            jobs: db.jobs || [],
            customers: db.customers || [],
            activityLogs: db.activityLogs || [],
            attachments: db.attachments || [],
            importHistory: db.importHistory || [],
            warehouseMap: db.warehouseMap || { zones: [], locations: [] }
        };
        const snapshotHash = stableHash(source);
        if (snapshotHash === lastSnapshotHash) return { skipped: true };

        const customers = source.customers.map(customer => ({
            external_id: asText(customer.id),
            name: asText(customer.name, "ไม่ระบุลูกค้า"),
            tax_id: asText(customer.taxId) || null,
            contact: {
                billingEmail: customer.billingEmail || "",
                phone: customer.phone || "",
                contactPerson: customer.contactPerson || "",
                address: customer.address || "",
                creditTerm: customer.creditTerm || 0
            },
            updated_at: new Date().toISOString()
        })).filter(row => row.external_id);
        const storedCustomers = await upsert("customers", "external_id", customers);
        const customerIds = new Map(storedCustomers.map(row => [ row.external_id, row.id ]));

        const jobs = source.jobs.map(job => ({
            house_number: asText(job.houseNumber).trim(),
            legacy_job_id: asText(job.id || job.jobId) || null,
            customer_id: customerIds.get(asText(job.customerId)) || null,
            customer_name: asText(job.customerName),
            status: asText(job.status, "Pending"),
            route_status: asText(job.routeStatus || job.routeType) || null,
            cargo_type: asText(job.cargoType) || null,
            package_type: asText(job.packageType) || null,
            carton_count: asNumber(job.cartonCount ?? job.pieceCount),
            pallet_count: asNumber(job.palletCount ?? job.warehousePallets),
            flight_number: asText(job.flightNo || job.flightNumber) || null,
            flight_etd: asIso(job.flightTime || job.flightEtd),
            sla_due_at: asIso(job.slaDueAt || job.flightDeadlineAt),
            pickup: {
                destination: job.pickupDestination || job.pickupAddress || "",
                route: job.route || "",
                contact: job.contactName || "",
                phone: job.contactPhone || ""
            },
            source_data: job,
            created_at: asIso(job.createdAt) || new Date().toISOString(),
            updated_at: asIso(job.updatedAt) || new Date().toISOString(),
            cancelled_at: job.status === "Cancelled" ? (asIso(job.cancelledAt) || new Date().toISOString()) : null,
            cancellation_reason: asText(job.cancellationReason) || null
        })).filter(row => row.house_number);
        const storedJobs = await upsert("jobs", "house_number", jobs);
        const jobIds = new Map(storedJobs.map(row => [ row.house_number, row.id ]));
        const attachmentResult = await mirrorAttachments(source.attachments, jobIds);

        const zones = (source.warehouseMap.zones || []).map(zone => ({
            legacy_zone_id: asText(zone.id),
            code: asText(zone.prefix || zone.id),
            name: asText(zone.name, "ไม่ระบุโซน"),
            storage_mode: asText(zone.storageMode, "Flexible"),
            max_pallets: asNumber(zone.maxPallets),
            layout: zone,
            active: true,
            updated_at: new Date().toISOString()
        })).filter(row => row.legacy_zone_id);
        const storedZones = await upsert("warehouse_zones", "legacy_zone_id", zones);
        const zoneIds = new Map(storedZones.map(row => [ row.legacy_zone_id, row.id ]));

        const locations = (source.warehouseMap.locations || []).map(location => ({
            legacy_location_id: asText(location.id),
            zone_id: zoneIds.get(asText(location.zoneId)),
            code: asText(location.code),
            capacity_pallets: asNumber(location.maxLevels),
            is_active: true,
            layout: location,
            updated_at: new Date().toISOString()
        })).filter(row => row.legacy_location_id && row.zone_id && row.code);
        await upsert("warehouse_locations", "legacy_location_id", locations);

        const reservations = source.jobs.filter(job => job.warehouseReservationStatus === "Reserved" && job.warehouseReservedZoneId).map(job => ({
            legacy_reservation_key: `reservation:${job.houseNumber}`,
            job_id: jobIds.get(asText(job.houseNumber)),
            zone_id: zoneIds.get(asText(job.warehouseReservedZoneId)),
            reserved_pallets: Math.max(0, asNumber(job.warehouseReservedPallets) || 0),
            status: "Reserved",
            reserved_by: asText(job.warehouseReservedBy) || null,
            reserved_at: asIso(job.warehouseReservedAt) || new Date().toISOString()
        })).filter(row => row.job_id && row.zone_id);
        await upsert("warehouse_reservations", "legacy_reservation_key", reservations);

        const placements = [];
        for (const location of source.warehouseMap.locations || []) {
            for (const occupancy of location.occupiedBy || []) {
                const houseNumber = asText(occupancy.houseNumber);
                const job = source.jobs.find(row => asText(row.houseNumber) === houseNumber);
                const zoneId = zoneIds.get(asText(location.zoneId));
                const jobId = jobIds.get(houseNumber);
                if (!jobId || !zoneId) continue;
                placements.push({
                    legacy_placement_key: `placement:${houseNumber}:${location.id}:${occupancy.level || 1}`,
                    job_id: jobId,
                    zone_id: zoneId,
                    pallets: Math.max(0, asNumber(occupancy.pallets ?? job.warehousePallets) || 0),
                    cartons: Math.max(0, asNumber(occupancy.boxes ?? job.warehouseBoxes ?? job.pieceCount) || 0),
                    status: "Stored",
                    placed_by: asText(occupancy.userId) || null,
                    placed_at: asIso(occupancy.placedAt) || new Date().toISOString()
                });
            }
        }
        await upsert("warehouse_placements", "legacy_placement_key", placements);

        const statusEvents = source.jobs.map(job => ({
            legacy_event_key: `status:${job.houseNumber}:${job.updatedAt || job.createdAt || job.status}`,
            job_id: jobIds.get(asText(job.houseNumber)),
            from_status: null,
            to_status: asText(job.status, "Pending"),
            stage: "legacy_snapshot",
            actor_id: null,
            actor_name: null,
            source: "legacy_adapter",
            occurred_at: asIso(job.updatedAt || job.createdAt) || new Date().toISOString(),
            metadata: { migratedFrom: "app_state" }
        })).filter(row => row.job_id);
        const activityEvents = source.activityLogs.map(log => ({
            legacy_event_key: `activity:${log.logId}`,
            job_id: jobIds.get(asText(log.houseNumber)),
            from_status: null,
            to_status: "ActivityRecorded",
            stage: asText(log.activityType, "activity"),
            actor_id: asText(log.userId) || null,
            actor_name: null,
            source: "legacy_adapter",
            occurred_at: asIso(log.createdAt || log.startTime) || new Date().toISOString(),
            metadata: log
        })).filter(row => row.job_id && row.legacy_event_key !== "activity:");
        await upsert("job_status_events", "legacy_event_key", [ ...statusEvents, ...activityEvents ]);

        const batches = source.importHistory.map(entry => ({
            source: `legacy:${asText(entry.source, "Manual")}`,
            content_hash: stableHash({ id: entry.id, fileName: entry.fileName }),
            received_at: asIso(entry.importedAt) || new Date().toISOString(),
            processed_at: asIso(entry.importedAt) || new Date().toISOString(),
            status: "Completed",
            summary: entry
        }));
        await upsert("import_batches", "source,content_hash", batches);

        lastSnapshotHash = snapshotHash;
        return { jobs: jobs.length, zones: zones.length, locations: locations.length, events: statusEvents.length + activityEvents.length, attachments: attachmentResult };
    }

    function schedule(db) {
        mirrorPromise = mirrorPromise.catch(error => logger.warn(`[mirror] previous sync failed: ${error.message}`)).then(() => mirror(db));
        mirrorPromise.catch(error => logger.error(`[mirror] relational sync failed: ${error.message}`));
    }

    return {
        schedule,
        async flush() { await mirrorPromise; },
        isEnabled: true
    };
}

module.exports = { createProductionRelationalMirror };
