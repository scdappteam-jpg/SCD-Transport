function consolPacking(row, map) {
    // Consol Planning uses merged Excel headers.  In detail rows the quantity
    // can be separated from its PLT/CTN label by one or more blank cells, for
    // example: [26, '', 'PLT', 32, '', 'CTN', 451kg].  Reading only the cell
    // immediately left of the label silently turns every quantity into zero.
    const start = Math.max(0, map.etd >= 0 ? map.etd : 30);
    const end = map.grs > start ? map.grs : Math.min(row.length, start + 8);
    const packageCounts = {};
    let segmentStart = start;
    for (let col = start + 1; col < end; col++) {
        const label = String(row[col] ?? '').trim().toUpperCase();
        if (!/^(PLT|PALLET|CTN|CTNS|CARTON|CARTONS)$/.test(label)) continue;
        let qty = NaN;
        for (let candidate = col - 1; candidate >= segmentStart; candidate--) {
            const value = Number(String(row[candidate] ?? '').replace(/,/g, '').trim());
            if (Number.isFinite(value) && value > 0) {
                qty = value;
                break;
            }
        }
        segmentStart = col + 1;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        packageCounts[/^(PLT|PALLET)$/.test(label) ? 'PLT' : 'CTN'] = qty;
    }
    const packageType = packageCounts.PLT ? 'PLT' : packageCounts.CTN ? 'CTN' : '';
    return { packageType, pieces: packageType ? String(packageCounts[packageType]) : '', packageCounts };
}
module.exports = { consolPacking };
