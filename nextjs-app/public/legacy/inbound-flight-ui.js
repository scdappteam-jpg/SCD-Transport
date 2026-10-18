(function (root) {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const $ = selector => document.querySelector(selector);
    const timeLabel = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ยังไม่ระบุ';
    const localTime = value => value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16) : '';
    let pending = null;
    function sync(job) {
        const panel = $('#flightHistoryPanel');
        if (!panel) return;
        const key = job ? JSON.stringify([job.houseNumber, job.flightRevision || 0, job.flightNo, job.flightTime, job.cargoCutoffAt]) : '';
        if (panel.dataset.key !== key) {
            panel.dataset.key = key;
            $('#flightChanged').value = 'No';
            $('#updatedFlightNo').value = '';
            $('#updatedFlightTime').value = localTime(job?.flightTime);
            $('#updatedCargoCutoffAt').value = localTime(job?.cargoCutoffAt);
            $('#flightChangeReason').value = '';
            $('#flightPreviewResult').innerHTML = '';
            pending = null;
        }
        $('#flightChangeFields').hidden = $('#flightChanged').value !== 'Yes';
        $('#houseScanBtn').textContent = $('#flightChanged').value === 'Yes' ? 'บันทึก Flight ของ House นี้' : 'Scan House / ตรวจข้อมูล';
        const history = job?.flightChangeHistory || [];
        panel.innerHTML = job ? `<section class="receipt-card"><strong>Flight ปัจจุบัน ${esc(job.flightNo || '-')}</strong><p>ออกบิน ${esc(timeLabel(job.flightTime))} เวลาไทย · House ${esc(job.houseNumber)} · รุ่น ${job.flightRevision || 0}</p>${job.trackReprintRequired ? '<p><b>Flight เปลี่ยนแล้ว ต้องตรวจและพิมพ์ป้าย Flight ใหม่ก่อนใช้งาน</b></p>' : ''}<button type="button" data-flight-print>เปิดป้ายข้อมูล Flight สำหรับพิมพ์</button><p>ตรวจป้ายกับของจริงก่อนติด ระบบไม่ถือว่าพิมพ์สำเร็จเพียงแค่เปิดหน้านี้</p><details><summary>ประวัติเปลี่ยน Flight ${history.length} รายการ</summary>${history.length ? history.slice().reverse().map(row => `<article><p><b>${esc(row.oldFlightNo)} → ${esc(row.newFlightNo)}</b></p><p>${esc(timeLabel(row.oldFlightTime))} → ${esc(timeLabel(row.newFlightTime))}</p><p>เหตุผล ${esc(row.reason)} · ผู้แก้ ${esc(row.changedBy)} · ${esc(timeLabel(row.changedAt))} · รุ่น ${row.revision}</p></article>`).join('') : '<p>ยังไม่มีประวัติเปลี่ยน Flight ที่บันทึกด้วยฟังก์ชันนี้</p>'}</details></section>` : '';
        panel.querySelector('[data-flight-print]')?.addEventListener('click', () => printLabel(job));
    }
    function payload(job) {
        if (!job) throw new Error('กรุณาเลือก House ให้ถูกต้อง');
        const base = { houseNumber: job.houseNumber, trackType: $('#trackType').value, flightChanged: $('#flightChanged').value === 'Yes' };
        if (!base.flightChanged) return base;
        const number = $('#updatedFlightNo').value.trim().toUpperCase();
        const time = $('#updatedFlightTime').value;
        const reason = $('#flightChangeReason').value.trim();
        const cutoff = $('#updatedCargoCutoffAt').value;
        if (!number) throw new Error('กรุณากรอกเลข Flight ใหม่');
        if (!time || !Number.isFinite(Date.parse(time + ':00+07:00'))) throw new Error('กรุณาระบุวันเวลาออกบินใหม่ เวลาไทย');
        if (!reason) throw new Error('กรุณาระบุเหตุผลเปลี่ยน Flight');
        const data = { ...base, updatedFlightNo: number, updatedFlightTime: time + ':00+07:00', flightChangeReason: reason, expectedFlightRevision: job.flightRevision || 0, expectedFlightNo: job.flightNo || '', expectedFlightTime: job.flightTime || '', expectedCargoCutoffAt: job.cargoCutoffAt || '', updatedCargoCutoffAt: cutoff ? cutoff + ':00+07:00' : '' };
        const signature = JSON.stringify(data);
        if (pending?.signature !== signature) pending = { signature, requestId: crypto.randomUUID() };
        return { ...data, requestId: pending.requestId };
    }
    async function preview(job, api) {
        const data = payload(job);
        if (!data.flightChanged) throw new Error('เลือก Flight เปลี่ยน ก่อนดูผลจำลอง');
        const result = await api('/api/inbound/flight/preview', data);
        if (result.preview !== true || result.persisted !== false) throw new Error('ยังไม่ได้รับผลจำลอง กรุณาตรวจการเชื่อมต่อแล้วลองใหม่');
        $('#flightPreviewResult').innerHTML = `<section class="receipt-card receipt-preview"><b>ผลจำลองเปลี่ยน Flight ยังไม่บันทึกข้อมูลจริง</b><p>แก้เฉพาะ House ${esc(result.after.houseNumber)} เท่านั้น House อื่นใน Master ไม่เปลี่ยน</p><p>${esc(result.before.flightNo)} · ${esc(timeLabel(result.before.flightTime))}<br>→ ${esc(result.after.flightNo)} · ${esc(timeLabel(result.after.flightTime))}</p><p>สถานะ ${esc(result.before.status)} → ${esc(result.after.status)} · Location ${esc(result.after.locationId || 'ยังไม่มี')} · ยอดรับและเลขอ้างอิงคงเดิม</p><p>กำหนดถึงสนามบิน ${esc(timeLabel(result.after.sla?.effectiveAirportDueAt))}</p>${root.ReceiptUI.master(result.masterReceipt, true)}</section>`;
        $('#flightPreviewResult').scrollIntoView({ block: 'nearest' });
        return result;
    }
    async function runPreview(button, job, api, onError) {
        button.disabled = true;
        try { await preview(job, api); } catch (error) { onError(error.message); } finally { button.disabled = false; }
    }
    function committed(job, data) {
        const row = (job.flightChangeHistory || []).find(item => item.requestId === data.requestId);
        return Boolean(row && row.revision === job.flightRevision && row.newFlightNo === String(data.updatedFlightNo || '').trim().toUpperCase() && Date.parse(row.newFlightTime) === Date.parse(data.updatedFlightTime) && row.reason === data.flightChangeReason && (row.newCargoCutoffAt || '') === (job.cargoCutoffAt || '') && job.flightNo === row.newFlightNo && Date.parse(job.flightTime) === Date.parse(row.newFlightTime));
    }
    function printLabel(job) {
        const win = root.open('', '_blank');
        if (!win) return root.alert('กรุณาอนุญาตเปิดหน้าป้ายสำหรับพิมพ์');
        win.document.write(`<!doctype html><html lang="th"><meta charset="utf-8"><title>Flight ${esc(job.houseNumber)}</title><style>body{font:20px Tahoma,sans-serif;margin:24px;color:#000}h1{font-size:32px}dt{font-weight:bold;margin-top:14px}dd{margin:0}button{padding:12px}@media print{button,.instruction{display:none}}</style><h1>SCD ป้ายข้อมูล Flight</h1><dl><dt>House</dt><dd>${esc(job.houseNumber)}</dd><dt>Onhand</dt><dd>${esc(job.onhandNumber || '-')}</dd><dt>Master</dt><dd>${esc(job.mawbNumber || '-')}</dd><dt>Flight</dt><dd>${esc(job.flightNo || '-')}</dd><dt>ออกบิน เวลาไทย</dt><dd>${esc(timeLabel(job.flightTime))}</dd><dt>รุ่น Flight</dt><dd>${job.flightRevision || 0}</dd></dl><p class="instruction">ตรวจเลขและรุ่นกับระบบก่อนติดป้ายใหม่ ป้ายนี้เป็นข้อมูล Flight ให้ใช้คู่กับบาร์โค้ด House เดิมที่ตรงกัน</p><button onclick="window.print()">พิมพ์ป้าย</button></html>`);
        win.document.close();
    }
    root.FlightUI = { sync, payload, preview, runPreview, committed };
})(window);
