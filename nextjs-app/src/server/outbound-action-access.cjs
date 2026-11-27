// Keep WH3 loading and Terminal receipt distinct even though the legacy UI
// submits both milestones through /outbound/load-bay.
const terminalRoles = ["Admin", "Executive", "Terminal"];
function loadBayRoles(payload = {}) {
    if (payload.phase === "wh3-load-start") {
        return [...terminalRoles, "WH3_TeamLeader", "WH_Staff", "Team_Transport"];
    }
    if (!payload.phase && (payload.arrived === false || payload.arrived === undefined)) {
        return [...terminalRoles, "WH3_TeamLeader", "WH_Staff"];
    }
    return terminalRoles;
}
const terminalDocumentRoles = [...terminalRoles, "WH3_TeamLeader", "WH_Staff", "Check_House"];
module.exports = { loadBayRoles, terminalDocumentRoles };
