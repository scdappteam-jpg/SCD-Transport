function consolPacking(row, map) {
    const start = Math.max(0, (map.etd >= 0 ? map.etd : 30) + 1);
    const end = map.grs > start ? map.grs : Math.min(row.length, start + 8);
    const packageCounts = {};
    for (let col = start; col < end; col++) {
        const label = String(row[col] ?? '').trim().toUpperCase();
        if (!/^(PLT|PALLET|CTN|CTNS|CARTON|CARTONS)$/.test(label)) continue;
        const qty = Number(String(row[col - 1] ?? '').replace(/,/g, '').trim());
        if (!Number.isFinite(qty) || qty <= 0) continue;
        packageCounts[/^(PLT|PALLET)$/.test(label) ? 'PLT' : 'CTN'] = qty;
    }
    const packageType = packageCounts.PLT ? 'PLT' : packageCounts.CTN ? 'CTN' : '';
    return { packageType, pieces: packageType ? String(packageCounts[packageType]) : '', packageCounts };
}
module.exports = { consolPacking };
