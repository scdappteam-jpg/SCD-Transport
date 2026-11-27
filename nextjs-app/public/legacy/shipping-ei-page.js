// Shipping · EI page: one work queue for the EI / Shipping team.
// Tabs: documents to prepare, trucks at WH3 waiting to file the permit,
// permits to check (after the fact, does not block the dock), and outbound
// EI approval. Uses the legacy globals: api, safeHtml, toast, runAction,
// formatBangkok, filesToCompressedBase64, fileToCompressedBase64, currentWebUser, scdPrompt.
(function () {
    "use strict";
    const REASONS = { NoInvoice: "ยังไม่ได้ Invoice จากลูกค้า", CustomerNotConfirmed: "ลูกค้ายังไม่ยืนยันเอกสารหรือใบขน", CustomsFeePending: "รอการชำระค่าธรรมเนียมศุลกากร", ShippingInTransit: "Shipping อยู่ระหว่างเดินทาง", Other: "อื่นๆ" };
    const TABS = [
        [ "prep", "เตรียมเอกสาร", "รถออกจากโรงงานแล้ว เอกสารยังไม่เสร็จ" ],
        [ "arrived", "รถถึงแล้ว รอยื่นตรวจปล่อย", "รถถึง WH3 แล้ว เรียงตามไฟล์ทด่วนก่อน" ],
        [ "permit", "ตรวจใบตรวจปล่อย", "คนขับแนบแล้ว ตรวจย้อนหลังได้ ไม่ขวางคิว Dock" ],
        [ "outbound", "อนุมัติ EI ขาออก", "เบิกสินค้าแล้ว รออนุมัติ EI พร้อมรูปเอกสาร" ]
    ];
    const TAB_KEY = "scdShippingTab";
    let data = null, tab = "prep", search = "";
    const selected = new Set();
    try { tab = localStorage.getItem(TAB_KEY) || "prep"; } catch (error) {}

    const host = () => document.getElementById("shippingEiHost");
    const when = iso => iso ? formatBangkok(iso) : "-";
    const matches = row => !search || [ row.houseNumber, row.hawbNumber, row.mawbNumber, row.flightNo, row.customerName, row.vehiclePlate ].some(v => String(v || "").toLowerCase().includes(search));

    function docPill(status) {
        if (status?.state === "Completed") return '<span class="ship-doc-pill done">เอกสารเสร็จแล้ว</span>';
        if (status?.state === "InProgress") return '<span class="ship-doc-pill doing">กำลังทำ</span>';
        return '<span class="ship-doc-pill">ยังไม่เริ่ม</span>';
    }
    function reasonsText(status) {
        return (status?.reasons || []).map(code => REASONS[code] + (code === "Other" && status.note ? `: ${status.note}` : "")).join(" · ");
    }
    function head(row, extra = "") {
        return `<div class="ei-row-head"><strong>${safeHtml(row.houseNumber)}</strong>${row.isLithium ? '<span class="job-flag invoice-pending">Lithium</span>' : ""}${row.heldOnTruck ? '<span class="job-flag invoice-pending">ค้างบนรถ</span>' : ""}${extra}</div>
          <div class="ei-row-meta"><span>${safeHtml(row.customerName || "-")}</span><span>Flight ${safeHtml(row.flightNo || "-")}${row.flightTime ? " · " + safeHtml(when(row.flightTime)) : ""}</span><span>Master ${safeHtml(row.mawbNumber || "-")}</span>${row.vehiclePlate ? `<span>รถ ${safeHtml(row.vehiclePlate)}</span>` : ""}</div>`;
    }

    function rowsFor(key) {
        const rows = (data?.[key] || []).filter(matches);
        if (!rows.length) return `<div class="empty-state compact"><p>${search ? "ไม่พบงานที่ค้นหา" : "ไม่มีงานในแท็บนี้"}</p></div>`;
        if (key === "prep") return rows.map(row => `<label class="ei-row selectable">
            <input type="checkbox" class="ei-pick" value="${safeHtml(row.houseNumber)}" ${selected.has(row.houseNumber) ? "checked" : ""}>
            <div class="ei-row-body">${head(row, docPill(row.shippingDocStatus))}
              <div class="ei-row-meta"><span>ออกจากโรงงาน ${safeHtml(when(row.completedAt))}</span><span>ETA ถึง WH3 ${safeHtml(when(row.etaWh3At))}</span></div>
              ${reasonsText(row.shippingDocStatus) ? `<p class="ei-row-note">${safeHtml(reasonsText(row.shippingDocStatus))}</p>` : ""}</div></label>`).join("");
        if (key === "arrived") return rows.map(row => `<div class="ei-row"><div class="ei-row-body">${head(row, docPill(row.shippingDocStatus))}
              <div class="ei-row-meta"><span>ถึง WH3 ${safeHtml(when(row.arrivedWh3At))}</span></div>
              ${reasonsText(row.shippingDocStatus) ? `<p class="ei-row-note">${safeHtml(reasonsText(row.shippingDocStatus))}</p>` : ""}</div>
              ${row.shippingDocStatus?.state === "Completed" ? "" : `<button type="button" class="ghost-button" data-ei-done="${safeHtml(row.houseNumber)}">เอกสารเสร็จแล้ว</button>`}</div>`).join("");
        if (key === "permit") return rows.map(row => `<div class="ei-row"><div class="ei-row-body">${head(row)}
              <div class="ei-row-meta"><span>คนขับแนบ ${safeHtml(when(row.releaseDocumentReceivedAt))}</span>${row.releaseDocumentNumber ? `<span>เลขที่ ${safeHtml(row.releaseDocumentNumber)}</span>` : ""}</div>
              <div class="ei-permit-files">${row.permitFiles.length ? row.permitFiles.map((file, i) => /pdf/i.test(file.mimeType || file.url) ? `<a href="${safeHtml(file.url)}" target="_blank" rel="noopener">เปิดไฟล์ ${i + 1} (PDF)</a>` : `<a href="${safeHtml(file.url)}" target="_blank" rel="noopener"><img src="${safeHtml(file.url)}" alt="ใบตรวจปล่อย ${safeHtml(row.houseNumber)} ไฟล์ ${i + 1}" loading="lazy"></a>`).join("") : "<small>ไม่พบไฟล์แนบ</small>"}</div></div>
              ${data.canReview ? `<div class="ei-row-actions"><button type="button" class="primary-button" data-permit="Approved" data-house="${safeHtml(row.houseNumber)}">อนุมัติ</button><button type="button" class="ghost-button danger" data-permit="Rejected" data-house="${safeHtml(row.houseNumber)}">ตีกลับ</button></div>` : ""}</div>`).join("");
        return rows.map(row => `<div class="ei-row"><div class="ei-row-body">${head(row)}
              <div class="ei-row-meta"><span>เบิกสินค้า ${safeHtml(when(row.outboundPickedAt))}</span></div></div>
              ${data.canReview ? `<form class="ei-outbound-form" data-house="${safeHtml(row.houseNumber)}"><label>รูปเอกสาร EI ที่เซ็นแล้ว<input type="file" accept="image/*" capture="environment" required></label><button type="submit" class="primary-button">อนุมัติ EI</button></form>` : ""}</div>`).join("");
    }

    function bulkBar() {
        if (tab !== "prep" || !data?.canReview && ![ "CS" ].includes(currentWebUser()?.role)) return "";
        return `<form class="ei-bulk" id="eiBulkForm"><div class="ei-bulk-head"><strong>เลือกแล้ว <span id="eiPickedCount">${selected.size}</span> House</strong><button type="button" class="ghost-button" data-ei-all>เลือกทั้งหมดที่แสดง</button></div>
          <fieldset><legend>สาเหตุที่ยังไม่เสร็จ</legend>${Object.entries(REASONS).map(([code, text]) => `<label><input type="checkbox" name="reason" value="${code}"> ${safeHtml(text)}</label>`).join("")}
          <input name="note" id="eiBulkNote" placeholder="หมายเหตุ (บังคับเมื่อเลือก อื่นๆ)"></fieldset>
          <div class="ship-doc-actions"><button type="submit" name="state" value="InProgress" class="ghost-button">บันทึก: กำลังทำ</button><button type="submit" name="state" value="Completed" class="primary-button">เอกสารเสร็จแล้ว</button></div></form>`;
    }

    function draw() {
        const box = host();
        if (!box || !data) return;
        const info = TABS.find(t => t[0] === tab) || TABS[0];
        box.innerHTML = `
          ${(data.alerts || []).length ? `<div class="ei-alerts" aria-label="แจ้งเตือนล่าสุด">${data.alerts.slice(0, 3).map(a => `<div class="ei-alert ${safeHtml(a.severity || "info")}"><strong>${safeHtml(a.title || "แจ้งเตือน")}</strong><span>${safeHtml(a.message)}</span><small>${safeHtml(when(a.createdAt))}</small></div>`).join("")}</div>` : ""}
          <div class="ei-toolbar"><input id="eiSearch" type="search" placeholder="ค้นหา House, Master, Flight, ลูกค้า, ทะเบียน" value="${safeHtml(search)}" aria-label="ค้นหางาน"><button type="button" class="ghost-button" id="eiReload">รีเฟรช</button></div>
          <div class="ei-tabs" role="tablist" aria-label="งาน Shipping · EI">${TABS.map(([key, label]) => `<button type="button" role="tab" class="ei-tab" data-ei-tab="${key}" aria-selected="${key === tab}">${label}<b>${data.counts?.[key] || 0}</b></button>`).join("")}</div>
          <p class="ei-tab-hint">${safeHtml(info[2])}</p>
          ${bulkBar()}
          <div class="ei-list">${rowsFor(tab)}</div>`;
    }

    async function load() {
        const box = host();
        if (box && !data) box.innerHTML = '<div class="empty-state compact"><p>กำลังโหลดงาน Shipping · EI</p></div>';
        try {
            data = await api("/api/shipping/queue", null, "GET");
            if (!TABS.some(t => t[0] === tab)) tab = "prep";
            draw();
        } catch (error) {
            if (box) box.innerHTML = typeof loadErrorHtml === "function" ? loadErrorHtml("โหลดงาน Shipping · EI ไม่สำเร็จ", error, "ShippingEiPage.render()") : `<div class="empty-state"><p>${safeHtml(error.message)}</p></div>`;
        }
    }

    async function saveDocs(houses, state, reasons, note) {
        await api("/api/shipping/doc-status", { houseNumbers: houses, state, reasons: state === "Completed" ? [] : reasons, note });
        toast(state === "Completed" ? `เอกสารเสร็จแล้ว ${houses.length} House` : `บันทึกสถานะ ${houses.length} House แล้ว`);
        selected.clear();
        await load();
    }

    document.addEventListener("click", event => {
        const box = host();
        if (!box || !box.contains(event.target)) return;
        const tabBtn = event.target.closest("[data-ei-tab]");
        if (tabBtn) { tab = tabBtn.dataset.eiTab; try { localStorage.setItem(TAB_KEY, tab); } catch (error) {} draw(); return; }
        if (event.target.closest("#eiReload")) { load(); return; }
        if (event.target.closest("[data-ei-all]")) { (data.prep || []).filter(matches).forEach(row => selected.add(row.houseNumber)); draw(); return; }
        const done = event.target.closest("[data-ei-done]");
        if (done) { runAction(done, () => saveDocs([ done.dataset.eiDone ], "Completed", [], "")); return; }
        const permit = event.target.closest("[data-permit]");
        if (permit) {
            runAction(permit, async () => {
                let reason = "";
                if (permit.dataset.permit === "Rejected") {
                    reason = (await scdPrompt({ title: "ตีกลับใบตรวจปล่อย " + permit.dataset.house, note: "ระบบจะแจ้งหัวหน้าคลังให้พิจารณาพักสินค้า", label: "เหตุผล", okText: "ตีกลับ" }) || "").trim();
                    if (!reason) return;
                }
                await api("/api/shipping/permit-review", { houseNumber: permit.dataset.house, decision: permit.dataset.permit, reason });
                toast(permit.dataset.permit === "Approved" ? "อนุมัติใบตรวจปล่อยแล้ว" : "ตีกลับแล้ว แจ้งหัวหน้าคลังแล้ว");
                await load();
            });
        }
    });
    document.addEventListener("change", event => {
        const pick = event.target.closest?.(".ei-pick");
        if (!pick) return;
        if (pick.checked) selected.add(pick.value); else selected.delete(pick.value);
        const count = document.getElementById("eiPickedCount");
        if (count) count.textContent = String(selected.size);
    });
    document.addEventListener("input", event => {
        if (event.target.id !== "eiSearch") return;
        search = event.target.value.trim().toLowerCase();
        const list = host()?.querySelector(".ei-list");
        if (list) list.innerHTML = rowsFor(tab);
    });
    document.addEventListener("submit", event => {
        const bulk = event.target.closest?.("#eiBulkForm");
        const outbound = event.target.closest?.(".ei-outbound-form");
        if (!bulk && !outbound) return;
        event.preventDefault();
        if (bulk) {
            const state = event.submitter?.value || "InProgress";
            const reasons = [ ...bulk.querySelectorAll('input[name="reason"]:checked') ].map(input => input.value);
            runAction(event.submitter, async () => {
                if (!selected.size) throw new Error("เลือก House อย่างน้อย 1 รายการ");
                await saveDocs([ ...selected ], state, reasons, document.getElementById("eiBulkNote").value.trim());
            });
            return;
        }
        runAction(event.submitter, async () => {
            const proof = await fileToCompressedBase64(outbound.querySelector('input[type="file"]'));
            await api("/api/outbound/ei-approve", { houseNumber: outbound.dataset.house, imageBase64: proof.base64, mimeType: proof.mimeType });
            toast("อนุมัติ EI แล้ว");
            await load();
        });
    });

    window.ShippingEiPage = { render: load };
})();
