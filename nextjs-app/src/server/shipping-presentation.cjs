/* eslint-disable @typescript-eslint/no-require-imports -- Shipping document projections. */
const receipts = require('./inbound-receipts.cjs');
function packageCounts(jobs) {
    const total = {};
    for (const job of jobs) for (const [unit, count] of Object.entries(receipts.house(job).planned)) {
        if (Number(count) > 0) total[unit] = (total[unit] || 0) + Number(count);
    }
    return total;
}
function quantity(job) {
    return Object.entries(packageCounts([job])).map(([unit, count]) => `${count} ${unit}`).join(' / ') || 'ยังไม่ยืนยันหน่วย';
}
function csHistory(job) {
    return {
        houseNumber: job.houseNumber, onhandNumber: job.onhandNumber || '',
        mawbNumber: job.mawbNumber || job.masterNumber || '',
        masterNumber: job.masterNumber || job.mawbNumber || '',
        packageCounts: packageCounts([job]), customerName: job.customerName || '',
        csInvoiceNo: job.csInvoiceNo || '', csConfirmedBy: job.csConfirmedBy || '',
        csContactName: job.csContactName || '',
        csContactPhone: job.csContactPhone || job.pickupPhone || job.tel || '',
        csConfirmedAt: job.csConfirmedAt, pieceCount: job.pieceCount || '',
        pickupDate: job.pickupDate || '', status: job.status
    };
}
function sourceLinks(db, master) {
    const key=value=>String(value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
    if(!key(master))throw new Error('กรุณาระบุ Master ที่ต้องการตรวจเชื่อม');
    const targets=(db.jobs||[]).filter(j=>key(j.mawbNumber||j.masterNumber)===key(master)&&j.source==='GlobalConsolCSV');
    return (db.jobs||[]).filter(j=>j.source==='PickupReportXlsx').flatMap(source=>{
        const target=targets.find(j=>j.houseNumber===source.hawbNumber);
        if(!target)return [];
        return [{onhand:source.houseNumber,hawb:target.houseNumber,pickupPieces:Number(source.pieceCount),consolPieces:Number(target.pieceCount),quantityCheck:Number(source.pieceCount)===Number(target.pieceCount)?'equal':'different_units',source:{sheetRow:'Pickup HAWB matches Consol House; imported source values',units:packageCounts([target])}}];
    });
}
module.exports = {packageCounts, quantity, csHistory, sourceLinks};
