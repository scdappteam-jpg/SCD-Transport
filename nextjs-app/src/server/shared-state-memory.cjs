// Keep the JSON data contract without materializing a second, database-sized
// UTF-16 string while a persistence snapshot is being copied.
function sanitizedClone(value) {
    const ancestors = new Set();
    function copy(item, key = '') {
        if (item && typeof item.toJSON === 'function') item = item.toJSON(key);
        if (typeof item === 'string') return item.replace(/[\uFFFD\uFFFE\uFFFF]/g, '');
        if (typeof item === 'number') return Number.isFinite(item) ? item : null;
        if (typeof item === 'bigint') throw new TypeError('BigInt cannot be serialized');
        if (item === null || typeof item === 'boolean') return item;
        if (typeof item !== 'object') return undefined;
        if (ancestors.has(item)) throw new TypeError('Circular JSON state');
        ancestors.add(item);
        const result = Array.isArray(item) ? item.map((v, i) => copy(v, String(i)) ?? null) : {};
        if (!Array.isArray(item)) for (const [k, v] of Object.entries(item)) {
            const next = copy(v, k);
            if (next !== undefined) Object.defineProperty(result, k, {value: next, enumerable: true, writable: true, configurable: true});
        }
        ancestors.delete(item);
        return result;
    }
    return copy(value);
}

async function loadStateChunks({kind, count, idFor, fetchRows, hash}) {
    const items = [], hashes = [];
    // Loading all job chunks in one JSON response doubled the live database
    // during refresh and exhausted Render's heap after larger daily imports.
    for (let start = 0; start < count; start += 2) {
        const ids = Array.from({length: Math.min(2, count - start)}, (_, offset) => idFor(kind, start + offset));
        const rows = await fetchRows(ids);
        const byId = new Map((rows || []).map(row => [row.id, row.data?.items]));
        for (const id of ids) {
            const chunk = byId.get(id);
            if (!Array.isArray(chunk)) throw new Error(`Missing shared-state chunk: ${id}`);
            hashes.push(hash(chunk));
            items.push(...chunk);
        }
    }
    return {items, hashes};
}

module.exports = {sanitizedClone, loadStateChunks};
