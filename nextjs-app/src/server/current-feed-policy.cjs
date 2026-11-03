const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function dateOnly(value) {
    if (!value) return "";
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    return bangkokDate(text);
}

function jobBusinessDates(job = {}) {
    const operational = [
        job.workDate,
        job.planDate,
        job.pickupDate,
        job.readyTime,
        job.closeTime,
        job.flightTime
    ].map(dateOnly).filter(Boolean);
    if (operational.length) return [...new Set(operational)];
    const created = dateOnly(job.createdAt);
    return created ? [created] : [];
}

function jobBelongsToDate(job, date) {
    return jobBusinessDates(job).includes(dateOnly(date));
}

function minimumImportDate(db) {
    return dateOnly(db?.integrations?.minimumImportDate);
}

function allowsImportDate(db, ...values) {
    const minimum = minimumImportDate(db);
    if (!minimum) return true;
    const dates = values.map(dateOnly).filter(Boolean);
    return !dates.length || dates.some(date => date >= minimum);
}

module.exports = { dateOnly, jobBusinessDates, jobBelongsToDate, minimumImportDate, allowsImportDate };
