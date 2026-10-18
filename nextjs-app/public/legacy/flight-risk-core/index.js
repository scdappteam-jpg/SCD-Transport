(function (root) {
    function noMiss(job) {
        return ['C', 'K'].includes(String(job.urgentCode || '').trim().toUpperCase()) || /^[CK][A-Z]{0,2}[-\s]*[0-9]{3,4}(?![0-9])/.test(String(job.flightNo || '').trim().toUpperCase());
    }
    function level(minutes, mustNotMiss = false, dueToday = false) {
        if (minutes === null || !Number.isFinite(minutes)) return 'Unclassified';
        if (minutes < 0) return 'Breached';
        if (minutes <= 120 || (mustNotMiss && minutes <= 240)) return 'Critical';
        if (minutes <= 240) return 'Urgent';
        if (dueToday) return 'DueToday';
        if (minutes <= 360) return 'Warning';
        return 'OnTrack';
    }
    function tier(minutes, mustNotMiss = false) {
        const status = level(minutes, mustNotMiss);
        if (status === 'Unclassified') return { key: 'none', label: 'ไม่มีกำหนด', color: '#64748B' };
        if (status === 'Breached') return { key: 'over', label: 'เลยกำหนดแล้ว', color: '#FF4D4D' };
        if (status === 'Critical') return { key: 'critical', label: 'ด่วนมาก', color: '#FF6B6B' };
        if (status === 'Urgent') return { key: 'warning', label: 'เฝ้าระวัง', color: '#FFB44D' };
        return { key: 'normal', label: 'ปกติ', color: '#5BD98A' };
    }
    const api = { noMiss, level, tier };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.FlightRiskCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
