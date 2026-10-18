(function (root) {
    function clean(value) {
        return String(value ?? "").trim().replace(/^(\d+)\.0$/, "$1").toUpperCase();
    }

    function ownReferences(job) {
        const house = clean(job.houseNumber);
        return {
            onhand: clean(job.onhandNumber) || (/^F\d{8,}$/.test(house) ? house : ""),
            hawb: clean(job.hawbNumber) || (!/^F\d{8,}$/.test(house) ? house : "")
        };
    }

    function createIndex(jobs) {
        const index = new Map();
        index.masters = new Map();
        function add(key, value) {
            if (!key || key === "AIR") return;
            if (!index.has(key)) index.set(key, new Set());
            if (value) index.get(key).add(value);
        }
        for (const job of jobs || []) {
            const { onhand, hawb } = ownReferences(job);
            const master = clean(job.mawbNumber || job.masterAwb || job.awbNumber || job.scannedMasterAwb);
            for (const key of [onhand, hawb]) {
                if (!key || key === "AIR" || !master) continue;
                if (!index.masters.has(key)) index.masters.set(key, new Set());
                index.masters.get(key).add(master);
            }
            if (onhand && hawb) {
                add(onhand, hawb);
                add(hawb, onhand);
            }
        }
        return index;
    }

    function grouped(job, index) {
        const ids = identifiers(job, index);
        const masters = new Set([clean(job.mawbNumber || job.masterAwb || job.awbNumber || job.scannedMasterAwb)].filter(Boolean));
        for (const id of ids) for (const master of index?.masters?.get(id) || []) masters.add(master);
        return {
            onhand: ids.filter(id => /^F\d{8,}$/.test(id)),
            master: [...masters],
            house: ids.filter(id => !/^F\d{8,}$/.test(id) && id !== "AIR"),
            pendingHouse: ids.includes("AIR")
        };
    }

    function matches(job, query, index) {
        const normalize = value => clean(value).replace(/[\s-]/g, "");
        const term = normalize(query);
        const refs = grouped(job, index);
        return !term || [...refs.onhand, ...refs.master, ...refs.house, ...(job.mergedHouseNumbers || [])]
            .some(value => normalize(value).includes(term));
    }

    function identifiers(job, index) {
        const { onhand, hawb } = ownReferences(job);
        const result = new Set([onhand, hawb, clean(job.houseNumber)].filter(Boolean));
        for (const key of [...result]) {
            for (const value of index?.get(key) || []) result.add(value);
        }
        // HAWB leads for operations; ONHAND remains visible for customers.
        // AIR is a pending marker, so keep the usable F reference before it.
        const priority = value => value === "AIR" ? 2 : /^F\d/.test(value) ? 1 : 0;
        return [...result].sort((a, b) => priority(a) - priority(b));
    }

    const api = {
        createIndex,
        identifiers,
        grouped,
        matches,
        label: (job, index) => identifiers(job, index).join(" · "),
        pickupReferences: (onhand, hawb) => ({ onhandNumber: clean(onhand), hawbNumber: clean(hawb) })
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.ShipmentReferences = api;
})(typeof window !== "undefined" ? window : globalThis);
