// Public truck status page opened from the QR link. No login: the link token
// is the only credential and only shows this truck's Houses.
(function () {
    "use strict";
    const token = new URLSearchParams(location.search).get("t") || "";
    const box = document.getElementById("truck");
    const button = document.getElementById("arrived");
    const note = document.getElementById("arrivedNote");
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const time = iso => iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

    async function load() {
        if (!token) { box.className = "card error"; box.innerHTML = "<p>ลิงก์ไม่ครบ กรุณาสแกน QR ใหม่</p>"; return; }
        try {
            const res = await fetch("/api/truck-link/view?t=" + encodeURIComponent(token), { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "โหลดไม่สำเร็จ");
            box.className = "card";
            box.innerHTML = `<div class="plate">${esc(data.vehiclePlate)}</div>
              <p class="muted">${esc([data.company, data.driverName].filter(Boolean).join(" · "))} · ลิงก์ใช้ได้ถึง ${esc(time(data.expiresAt))}</p>
              ${data.houses.map(h => `<div class="house"><b>${esc(h.houseNumber)}</b><span><span class="step">${esc(h.step)}</span>${h.pieces ? ` · ${esc(h.pieces)}` : ""}</span>${h.dock ? `<span class="dock">${esc(h.dock)}</span>` : ""}${h.etaWh3At ? `<span class="muted">ถึง WH3 ประมาณ ${esc(time(h.etaWh3At))}</span>` : ""}</div>`).join("")}`;
            button.hidden = false;
            if (data.arrivedReportedAt) note.innerHTML = `<span class="done">แจ้งถึงคลังแล้ว ${esc(time(data.arrivedReportedAt))}</span>`;
        } catch (error) {
            box.className = "card error";
            box.innerHTML = `<p>${esc(error.message)}</p>`;
            button.hidden = true;
        }
    }

    function position() {
        return new Promise(resolve => {
            if (!navigator.geolocation) return resolve({});
            navigator.geolocation.getCurrentPosition(p => resolve({ gpsLat: p.coords.latitude, gpsLong: p.coords.longitude }), () => resolve({}), { timeout: 8000, maximumAge: 60000 });
        });
    }

    button.addEventListener("click", async () => {
        button.disabled = true;
        note.textContent = "กำลังแจ้งเจ้าหน้าที่…";
        try {
            const res = await fetch("/api/truck-link/arrived", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, ...(await position()) }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "แจ้งไม่สำเร็จ");
            note.innerHTML = `<span class="done">แจ้งเจ้าหน้าที่แล้ว ${esc(time(data.arrivedReportedAt))} กรุณารอเรียกเข้าท่า</span>`;
        } catch (error) {
            note.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    });

    load();
    setInterval(() => { if (!document.hidden) load(); }, 60000);
})();
