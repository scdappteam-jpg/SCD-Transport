(function (root) {
    const clean = value => String(value ?? "").trim().toUpperCase();
    const unit = value => ({ PALLET: "PLT", PALLETS: "PLT", PLTS: "PLT", CARTON: "CTN", CARTONS: "CTN", CTNS: "CTN", BOX: "CTN", BOXES: "CTN", PIECES: "PCS", PIECE: "PCS" }[clean(value)] || clean(value));
    const valid = value => ["number", "string"].includes(typeof value) && String(value).trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
    const masterKey = job => clean(job.mawbNumber || job.masterAwb || job.awbNumber).replace(/[\s-]/g, "");
    const houseKey = job => clean(job.hawbNumber) && clean(job.hawbNumber) !== "AIR" ? clean(job.hawbNumber) : clean(job.houseNumber);

    function planned(job) {
        const counts = {};
        let known = true;
        const packages = Object.entries(job.packageCounts || {});
        const source = packages.length ? packages : [[job.packageType || "", job.pieceCount]];
        for (const [rawUnit, rawQty] of source) {
            const key = unit(rawUnit);
            if (!key || !valid(rawQty)) { known = false; continue; }
            const qty = Number(rawQty);
            if (!qty) continue;
            if (counts[key] !== undefined && counts[key] !== qty) known = false;
            counts[key] = qty;
        }
        return { counts, known: known && Object.keys(counts).length > 0 };
    }

    function house(job) {
        const plan = planned(job);
        const receipt = job.inboundReceipt;
        const confirmed = Boolean(receipt?.confirmedAt && receipt?.confirmedBy && Number.isSafeInteger(receipt.revision) && receipt.revision > 0);
        const received = {}, remaining = {}, over = {};
        let countsValid = confirmed;
        for (const [key, qty] of Object.entries(plan.counts)) {
            const raw = receipt?.counts?.[key];
            if (!valid(raw)) countsValid = false;
            received[key] = confirmed && valid(raw) ? Number(raw) : 0;
            remaining[key] = Math.max(0, qty - received[key]);
            over[key] = Math.max(0, received[key] - qty);
        }
        if (confirmed && Object.entries(receipt.counts || {}).some(([key, qty]) => !Object.hasOwn(plan.counts, key) && Number(qty) !== 0)) countsValid = false;
        const exceeded = Object.values(over).some(qty => qty > 0);
        const complete = plan.known && countsValid && !exceeded && Object.values(remaining).every(qty => qty === 0);
        return { houseNumber: job.houseNumber, onhandNumber: job.onhandNumber || "", master: job.mawbNumber || job.masterAwb || job.awbNumber || "", planned: plan.counts, planKnown: plan.known, received, remaining, over, confirmed, complete, revision: receipt?.revision || 0,
            state: !plan.known ? "plan_missing" : !confirmed ? "unconfirmed" : !countsValid ? "invalid" : exceeded ? "over" : complete ? "complete" : "partial" };
    }

    function canonical(jobs) {
        const groups = new Map();
        for (const job of jobs || []) {
            const key = houseKey(job);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(job);
        }
        return [...groups.entries()].map(([key, group]) => {
            const primary = group.filter(job => clean(job.houseNumber) === key);
            const job = primary[0] || group[0];
            const ambiguous = primary.length > 1 || (!primary.length && group.length > 1);
            return { key, job, ambiguous };
        });
    }

    function overview(jobs) {
        const rows = canonical(jobs);
        const byHouse = new Map(), masters = new Map();
        for (const row of rows) {
            const summary = { ...house(row.job), ambiguous: row.ambiguous };
            if (row.ambiguous) summary.complete = false;
            byHouse.set(row.key, summary);
            const key = masterKey(row.job);
            if (!key) continue;
            if (!masters.has(key)) masters.set(key, { master: summary.master, houses: [], planned: {}, received: {}, remaining: {}, over: {} });
            masters.get(key).houses.push(summary);
        }
        for (const group of masters.values()) {
            for (const row of group.houses) for (const field of ["planned", "received", "remaining", "over"]) {
                for (const [key, qty] of Object.entries(row[field])) group[field][key] = (group[field][key] || 0) + qty;
            }
            group.totalHouses = group.houses.length;
            group.completeHouses = group.houses.filter(row => row.complete).length;
            group.receivedHouses = group.houses.filter(row => Object.values(row.received).some(qty => qty > 0)).length;
            group.unconfirmedHouses = group.houses.filter(row => !row.confirmed).length;
            group.complete = group.totalHouses > 0 && group.completeHouses === group.totalHouses;
        }
        return { byHouse, masters };
    }
    const closeConfirmed = (job, payload) => Boolean(payload?.requestId && job.inboundCloseRequestId === payload.requestId && job.inboundClosedAt && job.inboundClosedRevision === job.inboundReceipt?.revision && house(job).complete);
    const api = { planned, house, canonical, overview, houseKey, masterKey, valid, closeConfirmed };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.InboundReceipts = api;
})(typeof window !== "undefined" ? window : globalThis);
