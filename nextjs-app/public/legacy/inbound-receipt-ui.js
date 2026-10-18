(function (root) {
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const label = row => row.ambiguous ? "ต้องตรวจคู่ House" : ({ unconfirmed: "ยังไม่ยืนยันยอดรับ", not_received: "ยังไม่รับสินค้า", partial: "รับบางส่วน", complete: "รับครบ", over: "ยอดเกิน ต้องตรวจสอบ", invalid: "ต้องตรวจยอดและหน่วย", plan_missing: "ยังไม่ยืนยันยอดแผน" }[row.state]);
    const format = counts => Object.entries(counts || {}).map(([unit, qty]) => `${qty} ${esc(unit)}`).join(" · ") || "ยังไม่ทราบหน่วย";
    function house(row) {
        return `<section class="receipt-card"><strong>ยอดรับ House ${esc(row.houseNumber)}</strong><span class="receipt-badge ${row.complete ? "complete" : "pending"}">${label(row)}</span><div class="receipt-totals"><span>ตามแผน<b>${format(row.planned)}</b></span><span>รับจริงยืนยัน<b>${row.confirmed ? format(row.received) : "ยังไม่ยืนยัน"}</b></span><span>ค้างรับหรือค้างยืนยัน<b>${format(row.remaining)}</b></span></div>${Object.values(row.over).some(qty => qty > 0) ? `<p>ยอดเกิน ${format(row.over)}</p>` : ""}<small>สถานะจัดเก็บและ Location แสดงขั้นตอนปฏิบัติงานแยกจากการรับครบตามยอด</small></section>`;
    }
    function master(group) {
        if (!group) return "";
        return `<section class="receipt-card receipt-master"><strong>Master ${esc(group.master)}</strong><span class="receipt-badge ${group.complete ? "complete" : "pending"}">รับครบ ${group.completeHouses}/${group.totalHouses} House</span><div class="receipt-totals"><span>ตามแผน<b>${format(group.planned)}</b></span><span>รับจริงยืนยัน<b>${format(group.received)}</b></span><span>ค้างรับหรือค้างยืนยัน<b>${format(group.remaining)}</b></span></div><small>มีของรับยืนยัน ${group.receivedHouses}/${group.totalHouses} House · ยังไม่ยืนยันยอด ${group.unconfirmedHouses} House</small><div class="receipt-table-wrap"><table><thead><tr><th>House</th><th>รับจริงยืนยัน</th><th>ค้าง</th><th>ผลยอดรับ</th></tr></thead><tbody>${group.houses.map(row => `<tr><td>${esc(row.houseNumber)}</td><td>${row.confirmed ? format(row.received) : "ยังไม่ยืนยัน"}</td><td>${format(row.remaining)}</td><td>${label(row)}</td></tr>`).join("")}</tbody></table></div></section>`;
    }
    function panel(jobs, job, editable, authoritativeMasters) {
        if (!job) return "";
        const overview = root.InboundReceipts.overview(jobs);
        const row = overview.byHouse.get(root.InboundReceipts.houseKey(job));
        const masterKey = root.InboundReceipts.masterKey(job);
        const group = authoritativeMasters ? authoritativeMasters.find(group => String(group.master).replace(/[\s-]/g, "").toUpperCase() === masterKey) : overview.masters.get(masterKey);
        const inputs = Object.keys(row.planned).map(unit => `<label>รับสะสม ${esc(unit)}<input type="number" min="0" step="1" inputmode="numeric" data-receipt-unit="${esc(unit)}" value="${row.confirmed ? row.received[unit] : ""}" placeholder="กรอกยอดนับจริง"></label>`).join("");
        return house(row) + (editable ? `<section class="receipt-card receipt-form" data-house="${esc(row.houseNumber)}" data-revision="${row.revision}"><strong>ยืนยันยอดรับสะสมของ House นี้</strong><p>กรอกยอดรวมที่รับแล้วทุกครั้ง แยกทุกหน่วย ไม่กรอกเฉพาะยอดเพิ่มของรอบนี้</p><div class="receipt-inputs">${inputs}</div><label>หมายเหตุหรือเหตุผลแก้ยอดลดลง<input data-receipt-reason type="text" maxlength="1000"></label><button type="button" data-receipt-save ${!row.planKnown || row.ambiguous ? "disabled" : ""}>ยืนยันยอดรับจริง</button></section>` : "") + master(group);
    }
    function payload(container) {
        const form = container.querySelector('.receipt-form');
        const counts = {};
        for (const input of form.querySelectorAll('[data-receipt-unit]')) {
            if (!root.InboundReceipts.valid(input.value)) throw new Error('กรอกยอดรับจริงเป็นจำนวนเต็มตั้งแต่ 0 ให้ครบทุกหน่วย');
            counts[input.dataset.receiptUnit] = Number(input.value);
        }
        return { houseNumber: form.dataset.house, counts, expectedRevision: Number(form.dataset.revision), requestId: crypto.randomUUID(), reason: form.querySelector('[data-receipt-reason]').value.trim() };
    }
    root.ReceiptUI = { house, master, panel, payload, format, label };
})(window);
