function scheduleSnapshot(job) {
    return { flightNo: job.flightNo || "", flightTime: job.flightTime || "" };
}

function sameInstant(left, right) {
    if ((left || "") === (right || "")) return true;
    const a = Date.parse(left), b = Date.parse(right);
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function scheduleChanges(existing, incoming) {
    const changes = [];
    if ((existing.flightNo || "") !== (incoming.flightNo || "")) changes.push("FLIGHT_CHANGED");
    if (!sameInstant(existing.flightTime, incoming.flightTime)) changes.push("FLIGHT_TIME_CHANGED");
    return changes;
}

module.exports = { scheduleChanges, scheduleSnapshot };
