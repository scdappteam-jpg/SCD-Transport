/* Mobile: tag/QA scan, inbound condition inspection and per-piece scan.
 * Uses the shared mobile helpers from mobile.js (api, runAction, toast,
 * currentUser, fileToCompressedBase64, normalizeHouseBarcode, openLiveScan).
 * The server stays the authority: role checks, barcode reading from the
 * photo and revision checks all happen in the API. */
(function () {
    const byId = id => document.getElementById(id);
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const TAGGERS = [ "WH_Staff", "WH3_TeamLeader", "Tagging_Staff" ];
    const INSPECTORS = [ "QA_Inspector", "Check_House" ];
    const role = () => (typeof currentUser === "function" ? currentUser()?.role : "") || "";
    const houseOf = value => (typeof normalizeHouseBarcode === "function" ? normalizeHouseBarcode(value) : String(value || "").trim());
    const time = value => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "-";
    const scanWithCamera = onCode => {
        if (typeof openLiveScan !== "function") return toast("อุปกรณ์นี้เปิดกล้องสแกนไม่ได้ ให้พิมพ์หรือยิงบาร์โค้ดแทน");
        openLiveScan(code => { if (code) onCode(String(code).trim()); });
    };

    // Photos for barcode reading: keep more detail than ordinary evidence.
    async function barcodePhotos(input) {
        const out = [];
        for (const file of Array.from(input.files || [])) out.push(await fileToCompressedBase64({ files: [ file ] }, 1800, .88));
        return out;
    }

    // ---------- Tag / QA tab ----------
    let qualityJob = null;
    function renderQuality() {
        const box = byId("mqJob");
        if (!box) return;
        const r = role(), canTag = TAGGERS.includes(r), canQa = INSPECTORS.includes(r);
        byId("mqTagBtn").hidden = !canTag;
        byId("mqQaBtn").hidden = !canQa;
        if (!qualityJob) { box.innerHTML = ""; return; }
        const j = qualityJob, tag = j.tagInspection, qa = j.qaApproval;
        const qaCurrent = Boolean(j.qaApproved && qa);
        box.innerHTML = `<div class="m-quality-card"><b>${esc(j.houseNumber)}</b>${j.onhandNumber ? ` <small>· Onhand ${esc(j.onhandNumber)}</small>` : ""}
            <small>${esc(j.customerName || "")}${j.master ? " · Master " + esc(j.master) : ""} · ${esc(j.status || "")}</small>
            <span class="m-quality-row"><span>แท็ก</span><b>${tag ? `ลงทะเบียนแล้ว · rev ${esc(tag.revision)} · ${esc(tag.taggedBy || "")} · ${esc(time(tag.taggedAt))}` : "ยังไม่ติดแท็ก"}</b></span>
            <span class="m-quality-row"><span>QA</span><b>${qaCurrent ? `ผ่าน · ${esc(qa.approvedBy || "")} · ${esc(time(qa.approvedAt))}` : tag ? "รอ QA สแกนตรวจ" : "รอติดแท็กก่อน"}</b></span></div>`;
        if (tag?.mode) byId("mqMode").value = tag.mode;
        if (tag?.stickerColor && !byId("mqColor").value) byId("mqColor").value = tag.stickerColor;
    }
    async function findQuality(raw) {
        const house = houseOf(raw);
        if (!house) throw new Error("กรอกหรือสแกนเลข House ก่อน");
        const data = await api("/api/warehouse/quality?query=" + encodeURIComponent(house), null, "GET");
        const match = (data.jobs || []).find(j => [ j.houseNumber, j.hawbNumber, j.onhandNumber ].includes(house));
        if (!match) throw new Error(`ไม่พบ House ${house} ที่ยังเปิดงานอยู่`);
        qualityJob = match;
        byId("mqHouse").value = match.houseNumber;
        renderQuality();
    }
    async function submitQuality(kind) {
        if (!qualityJob) throw new Error("ค้นหา House ก่อน");
        const scanImages = await barcodePhotos(byId("mqImages"));
        if (!scanImages.length) throw new Error("ถ่ายรูปบาร์โค้ดแท็กก่อน");
        if (scanImages.length > 2) throw new Error("แนบรูปได้ไม่เกิน 2 รูป (Pair)");
        await api("/api/warehouse/quality/" + kind, {
            houseNumber: qualityJob.houseNumber,
            tagMode: byId("mqMode").value,
            stickerColor: byId("mqColor").value.trim(),
            expectedRevision: qualityJob.tagInspection?.revision || 0,
            scanImages
        });
        byId("mqImages").value = "";
        byId("mqMsg").textContent = kind === "tag" ? "ลงทะเบียนแท็กแล้ว รอ QA คนละบัญชีสแกนตรวจ" : "QA ผ่าน ระบบอ่านบาร์โค้ดตรงกับ House แล้ว";
        toast(byId("mqMsg").textContent);
        await findQuality(qualityJob.houseNumber);
    }

    // ---------- Inbound: inspection and per-piece scan ----------
    const inboundHouse = () => houseOf(byId("scanHouse")?.value);
    let pieceState = null;
    function renderPieces() {
        const box = byId("mPieces");
        if (!box || !pieceState) return;
        const p = pieceState, units = Object.keys(p.planned || {});
        const select = byId("mPieceUnit");
        if (units.length && [...select.options].map(o => o.value).join() !== units.join()) {
            select.innerHTML = units.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
        }
        box.innerHTML = `<p class="m-piece-total">${units.map(u => `<b>${esc(u)}</b> สแกนแล้ว ${p.scanned?.[u] || 0}/${p.planned[u]}`).join(" · ") || "ยังไม่มีแผนจำนวน"}${p.complete ? ' · <b class="m-ok">ครบตามแผน</b>' : ""}</p>`
            + (p.scans || []).slice(-6).reverse().map(x => `<small>${esc(x.code)} · ${esc(x.unit)} · ${esc(time(x.at))}</small>`).join("");
    }
    async function loadPieces() {
        const house = inboundHouse();
        if (!house) throw new Error("สแกน House ในช่องด้านบนก่อน");
        pieceState = await api("/api/inbound/piece-scan?houseNumber=" + encodeURIComponent(house), null, "GET");
        renderPieces();
        await loadInspection(house);
    }
    async function scanPiece(code) {
        const house = inboundHouse();
        if (!house) throw new Error("สแกน House ในช่องด้านบนก่อน");
        if (!code) return;
        pieceState = await api("/api/inbound/piece-scan", { houseNumber: house, unit: byId("mPieceUnit").value, code });
        renderPieces();
        byId("mPieceMsg").textContent = "สแกนแล้ว " + code;
        byId("mPieceCode").value = "";
    }
    function usePieceCounts() {
        if (!pieceState) throw new Error("โหลดยอดสแกนก่อน");
        const inputs = [...document.querySelectorAll("#inboundReceiptPanel [data-receipt-unit]")];
        if (!inputs.length) throw new Error("ยังไม่มีช่องยืนยันยอดรับ ให้เปิดรับเข้าก่อน");
        for (const input of inputs) input.value = pieceState.scanned?.[input.dataset.receiptUnit] || 0;
        byId("mPieceMsg").textContent = "ใส่ยอดสแกนในช่องยอดรับแล้ว ตรวจแล้วกด ยืนยันยอดรับจริง";
        inputs[0].closest(".receipt-form")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    let inspectRevision = 0;
    async function loadInspection(house) {
        const s = await api("/api/warehouse/inbound-control?houseNumber=" + encodeURIComponent(house), null, "GET");
        inspectRevision = s.job?.inboundControlRevision || 0;
        const checks = s.job?.inboundInspection?.checks || {};
        document.querySelectorAll(".m-inspect-check").forEach(box => { box.checked = Boolean(checks[box.value]); });
        byId("mInspectMsg").textContent = s.job?.inboundInspection ? "บันทึกตรวจสภาพแล้ว " + time(s.job.inboundInspection.at) : "";
    }
    async function saveInspection() {
        const house = inboundHouse();
        if (!house) throw new Error("สแกน House ในช่องด้านบนก่อน");
        await loadInspection(house);
        const checks = Object.fromEntries([...document.querySelectorAll(".m-inspect-check")].map(box => [ box.value, box.checked ]));
        if (!Object.values(checks).every(Boolean)) throw new Error("ติ๊กตรวจให้ครบทุกข้อก่อนบันทึก");
        await api("/api/warehouse/inbound-control", {
            action: "inspection", houseNumber: house, expectedRevision: inspectRevision, requestId: crypto.randomUUID(), checks,
            wdChecklist: [...document.querySelectorAll(".inbound-wd-check:checked")].map(box => box.value)
        });
        byId("mInspectMsg").textContent = "บันทึกตรวจสภาพครบแล้ว";
        toast("บันทึกตรวจสภาพแล้ว");
    }

    function bind() {
        if (!byId("tab-quality")) return;
        // Actions here refresh their own panel; runAction also refreshes the app.
        const act = (id, task) => byId(id).addEventListener("click", event => runAction(event.currentTarget, task));
        act("mqFindBtn", () => findQuality(byId("mqHouse").value));
        byId("mqHouse").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); byId("mqFindBtn").click(); } });
        byId("mqCameraBtn").addEventListener("click", () => scanWithCamera(code => { byId("mqHouse").value = code; byId("mqFindBtn").click(); }));
        act("mqTagBtn", () => submitQuality("tag"));
        act("mqQaBtn", () => submitQuality("scan"));
        act("mInspectBtn", saveInspection);
        act("mPieceLoadBtn", loadPieces);
        byId("mPieceUseBtn").addEventListener("click", () => { try { usePieceCounts(); } catch (e) { toast(e.message); } });
        byId("mPieceCode").addEventListener("keydown", e => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            scanPiece(e.currentTarget.value.trim()).catch(err => { byId("mPieceMsg").textContent = err.message; e.currentTarget.select(); });
        });
        byId("mPieceCameraBtn").addEventListener("click", () => scanWithCamera(code => scanPiece(code).catch(err => { byId("mPieceMsg").textContent = err.message; })));
        document.querySelector('[data-operation-target="inbound-scan"]')?.addEventListener("click", () => { if (inboundHouse()) loadPieces().catch(err => { byId("mPieceMsg").textContent = err.message; }); });
        byId("scanHouse")?.addEventListener("change", () => { pieceState = null; byId("mPieces").innerHTML = '<p class="step-note">กดโหลดยอดสแกนของ House นี้</p>'; });
        renderQuality();
    }
    window.MobileQuality = { findQuality, loadPieces, renderQuality };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
})();
