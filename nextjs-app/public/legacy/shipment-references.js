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
        function add(key, value) {
            if (!key || key === "AIR") return;
            if (!index.has(key)) index.set(key, new Set());
            if (value) index.get(key).add(value);
        }
        for (const job of jobs || []) {
            const { onhand, hawb } = ownReferences(job);
            if (onhand && hawb) {
                add(onhand, hawb);
                add(hawb, onhand);
            }
        }
        return index;
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
        label: (job, index) => identifiers(job, index).join(" · "),
        pickupReferences: (onhand, hawb) => ({ onhandNumber: clean(onhand), hawbNumber: clean(hawb) })
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.ShipmentReferences = api;
})(typeof window !== "undefined" ? window : globalThis);
