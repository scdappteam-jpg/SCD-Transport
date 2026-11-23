/* Shared by the print preview and server: never infer an inspection or signature. */
(function(root) {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const text = value => String(value ?? '').trim();
    const first = (...values) => values.find(value => text(value)) || '';
    function quantity(job, row = {}) {
        const counts = job.inboundReceipt?.confirmedAt ? job.inboundReceipt.counts : job.packageCounts;
        if (counts && Object.keys(counts).length) return Object.entries(counts).filter(([,v]) => Number.isSafeInteger(Number(v)) && Number(v) >= 0).map(([unit,n]) => `${n} ${unit}`).join(' / ');
        const n = first(job.pieceCount, row.pieces);
        const unit = first(job.packageType, row.packageType, row.unit);
        return n === '' ? '' : `${n}${unit ? ' ' + unit : ' (ไม่ระบุหน่วย)'}`;
    }
    function rowData(job, row = {}) {
        return {houseNumber:first(job.houseNumber,row.houseNumber), onhandNumber:job.onhandNumber || '', icNumber:first(job.icNumber,row.icNumber), customerName:first(job.customerName,row.customerName), destination:first(job.destAirport,job.destination,row.destination), quantity:quantity(job,row), mawbNumber:first(job.mawbNumber,job.masterAwb,job.masterNumber,job.awbNumber,row.awbNumber), flight:first(job.flightNo,job.flightNumber,row.flightNumber)};
    }
    function snapshot(jobs, payload, issuedAt, actor) {
        return {version:1, id:`CTF-${issuedAt}-${jobs[0].houseNumber}`, issuedAt, issuedBy:actor,
            date:payload.transferDate, time:payload.transferTime, from:payload.transferFrom, to:payload.transferTo,
            driver:payload.driverName, plate:payload.vehiclePlate, vehicleType:payload.vehicleType, releaseBy:payload.releaseBy,
            rows:jobs.map(job => rowData(job)), testOnly:jobs.some(job => /\bSIT\b|SIT-/i.test([job.houseNumber,job.cargoTransferNote,job.evidenceNote,payload.note,payload.driverName,payload.vehiclePlate].join(' ')))};
    }
    function localDate(value) {
        if (!value) return '';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
    }
    function common(jobs, getter) {
        const values = jobs.map(getter).map(text);
        return values.length && values.every(value => value && value === values[0]) ? values[0] : '';
    }
    function event(job, name) { return (job.terminalWorkflowEvents || []).find(item => item.status === name) || {}; }
    function groupKey(job) {
        return job.cargoTransferDocument?.id || (job.cargoTransferIssuedAt ? JSON.stringify([job.cargoTransferIssuedAt,job.cargoTransferGroup,job.cargoTransferDate,job.cargoTransferTime]) : JSON.stringify(['draft',job.aotVehiclePlate || job.vehiclePlate || '',job.terminalDestination || '']));
    }
    function models(opts) {
        const groups = new Map();
        const seen = new Set();
        for (const row of opts.rows || []) {
            if (seen.has(row.houseNumber)) continue;
            seen.add(row.houseNumber);
            const matches = (opts.jobs || []).filter(job => job.houseNumber === row.houseNumber);
            const job = matches.length === 1 ? matches[0] : {houseNumber:row.houseNumber, missing:true};
            const key = groupKey(job);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({job,row});
        }
        return [...groups.values()].map(items => {
            const jobs = items.map(item => item.job), j = jobs[0], saved = j.cargoTransferDocument;
            const issued = jobs.every(job => job.cargoTransferIssuedAt);
            const missing = jobs.some(job => job.missing);
            const details = j.cargoTransferDetails || (!issued ? {unloadBy:opts.unloadBy || ''} : {});
            const all = key => common(jobs, job => job[key]);
            const meta = {date:all('cargoTransferDate'),time:all('cargoTransferTime'),from:all('cargoTransferFrom'),to:all('terminalDestination'),driver:all('aotDriverName'),plate:all('aotVehiclePlate'),vehicleType:all('aotVehicleType'),releaseBy:all('cargoTransferReleaseBy')};
            if (saved) Object.assign(meta,saved);
            if (!issued) Object.assign(meta,{date:opts.date || '',time:opts.time || '',from:opts.from || 'WH3',to:opts.tmo || '',driver:opts.driver || '',plate:opts.plate || '',vehicleType:opts.velType || '',releaseBy:opts.relBy || ''});
            const rows = items.map(({job,row}) => {
                const original = saved?.rows?.find(r => r.houseNumber === job.houseNumber);
                return {...(original || rowData(job,row)), missing:job.missing,
                    permit:job.cargoTransferPermitAttached === true,
                    security:job.xrayStatus === 'Passed', inspected:job.qaVerified === true};
            });
            const earliest = key => { const values=jobs.map(job=>job[key]).filter(Boolean).sort(); return values[0] || ''; };
            const completed = key => jobs.every(job=>job[key]) ? jobs.map(job=>job[key]).sort().at(-1) : '';
            return {...meta, issued:issued && !missing, missing, rows, details,
                partial:Boolean(saved && rows.length !== saved.rows.length || !saved && issued && Array.isArray(j.cargoTransferGroup) && rows.length !== j.cargoTransferGroup.length),
                testOnly:Boolean(saved?.testOnly || jobs.some(job=>/\bSIT\b|SIT-/i.test([job.houseNumber,job.cargoTransferNote,job.evidenceNote,job.aotVehiclePlate].join(' ')))),
                unloadStart:first(details.unloadStartedAt,earliest('unloadingStartedAt')),
                unloadEnd:first(details.unloadFinishedAt,completed('unloadingCompletedAt')),
                driverTransferredAt:first(details.driverTransferredAt,completed('goodsLoadedAt')),
                tmoReceivedAt:details.tmoReceivedAt || '',
                queueBookedAt:earliest('aotBookedAt'), queueArrivedAt:jobs.map(job=>event(job,'VehicleQueued').at).filter(Boolean).sort()[0] || ''};
        });
    }
    const styles = `@page{size:A4 portrait;margin:7mm}*{box-sizing:border-box}.ctf-sheet{background:#fff;color:#111;width:196mm;max-width:100%;min-height:280mm;margin:0 auto;padding:2mm;font:8.5pt Arial,Tahoma,sans-serif;break-after:page;overflow-wrap:anywhere}.ctf-sheet:last-child{break-after:auto}.ctf-sheet table{width:100%;border-collapse:collapse;table-layout:fixed}.ctf-sheet td,.ctf-sheet th{border:1px solid #333;padding:1.2mm;vertical-align:top}.ctf-sheet .ctf-items td{height:6mm;vertical-align:middle;font-size:8pt}.ctf-sheet .ctf-items th{font-size:6pt;overflow-wrap:normal}.ctf-sheet .ctf-letterhead{display:flex;justify-content:space-between;min-height:17mm;font-size:7pt}.ctf-sheet .ctf-brand{font-size:20pt;font-weight:bold;font-style:italic}.ctf-sheet h2{text-align:center;font-size:12pt;margin:2mm 0}.ctf-sheet small{font-size:6.5pt}.ctf-sheet .ctf-sign td{height:11mm}.ctf-sheet .ctf-unload td{height:10mm}.ctf-sheet .ctf-status{font-weight:bold;border:1px solid #333;padding:1mm;margin:1mm 0}.ctf-sheet footer{font-size:6.5pt;margin-top:2mm}.ctf-sheet .ctf-warning{color:#9a3412}.ctf-sheet thead{display:table-header-group}.ctf-sheet tr,.ctf-sheet .ctf-sign,.ctf-sheet .ctf-unload{break-inside:avoid}@media print{html,body{margin:0!important;padding:0!important;background:#fff!important}.ctf-sheet{width:196mm;max-width:none;min-height:280mm}.no-print{display:none!important}}`;
    function sheet(model, rows, page, total) {
        const e=escape, d=model.details, cell = value => e(value) || '&nbsp;';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(model.date || '') ? model.date.split('-').reverse().join('/') : model.date;
        const tmo = model.to === 'TGINT' ? 'INTER' : model.to;
        let body=rows.map(r=>`<tr><td><b>${e(r.houseNumber)}</b>${r.missing?'<br>ไม่พบ House':''}<br><small>${e(r.onhandNumber)}</small></td><td>${cell(r.icNumber)}</td><td>${cell(r.customerName)}</td><td>${cell(r.destination)}</td><td>${cell(r.quantity)}</td><td>${cell(r.mawbNumber)}<br><small>${e(r.flight)}</small></td><td>${r.permit?'✓':''}</td><td>${r.security?'✓':''}</td><td>${r.inspected?'✓':''}</td></tr>`).join('');
        for(let i=rows.length;i<14;i++)body+='<tr>'+Array.from({length:9},()=>'<td>&nbsp;</td>').join('')+'</tr>';
        const status=[model.testOnly?'SIT — ข้อมูลทดสอบ / ห้ามใช้ส่งสินค้าจริง':'',!model.issued?'DRAFT — ยังไม่ได้ออกใบ / ไม่ใช่หลักฐานการส่งมอบ':'',model.partial?'รายการที่เลือกไม่ครบใบเดิม — ห้ามใช้แทนใบฉบับเต็ม':'',model.missing?'ไม่พบ House ในระบบ กรุณาตรวจเลข':''].filter(Boolean).join(' · ');
        return `<article class="ctf-sheet"><header class="ctf-letterhead"><div><b>Expeditors (Thailand) Ltd.</b><br>Head office: Empire Tower, South Sathorn Road, Bangkok<br>Warehouse Office: Warehouse No. 3, Free Zone,<br>Suvarnabhumi Airport, Bang Phli, Samut Prakan</div><div class="ctf-brand">Expeditors<sup>®</sup></div></header><h2>CARGO TRANSFER FORM</h2>${status?`<div class="ctf-status ctf-warning">${e(status)}</div>`:''}
        <table><tr><td>Transfer Date / วันที่ส่ง<br><b>${cell(date)}</b></td><td>Time / เวลา<br><b>${cell(model.time)}</b></td><td colspan="2">Release Shipment by<br><b>${cell(model.releaseBy)}</b></td></tr><tr><td colspan="2">Transfer From<br><b>${cell(model.from)}</b></td><td colspan="2">To TMO<br><b>${cell(tmo)}</b></td></tr><tr><td colspan="2">Driver’s Name / คนขับ<br><b>${cell(model.driver)}</b></td><td>Truck License / ทะเบียน<br><b>${cell(model.plate)}</b></td><td>Vehicle type<br>${cell(model.vehicleType)}</td></tr></table>
        <table class="ctf-items"><colgroup>${[17,14,17,7,13,20,4,4,4].map(w=>`<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${['HAWB / Onhand','IC','SHIPPER','DEST','QTY / UNIT','MAWB / FLIGHT'].map(v=>`<th>${v}</th>`).join('')}<th colspan="3">Permit / Security / Inspected</th></tr></thead><tbody>${body}</tbody></table>
        <table class="ctf-sign"><tr><td style="width:58%">WH release by / ผู้ปล่อยสินค้า: ${cell(model.releaseBy)}<br>ลายเซ็น ____________________</td><td>Date / Time<br>${cell(localDate(d.whReleasedAt))}</td></tr><tr><td>Driver Transfer Shipment / คนขับ: ${cell(model.driver)}<br>ลายเซ็น ____________________</td><td>Date / Time<br>${cell(localDate(model.driverTransferredAt))}</td></tr><tr><td>TMO Received by / ผู้รับ: ${cell(d.tmoReceivedBy)}<br>ลายเซ็น ____________________</td><td>Date / Time<br>${cell(localDate(model.tmoReceivedAt))}</td></tr></table>
        <div>Unload by / ผู้ลงสินค้า: ${cell(d.unloadBy)} <small>จองคิว: ${cell(localDate(model.queueBookedAt))} · ได้คิว: ${cell(localDate(model.queueArrivedAt))}</small></div>
        <table class="ctf-unload"><tr><td>Start unload (เริ่มลงสินค้า):<br>${cell(localDate(model.unloadStart))}</td><td>Unload finished (ลงเสร็จ):<br>${cell(localDate(model.unloadEnd))}</td></tr><tr><td>Found any damage (สินค้าเสียหาย): ${d.damage==='yes'?'พบ':d.damage==='no'?'ไม่พบ':'ยังไม่บันทึก'}</td><td>Issue cause (สาเหตุ): ${cell(d.issueCause)}</td></tr><tr><td>Seamless operation (ปัญหาการทำงาน): ${cell(d.operationNote)}</td><td>Supervisor contact (เบอร์ติดต่อหัวหน้า): ${cell(d.supervisorContact)}</td></tr></table>
        <footer>เอกสารจาก S.C.D. Transport · ${cell(model.id || 'Legacy CTF')} · ${page}/${total}<br>✓ Permit = มีไฟล์แนบ · Security = X-Ray ผ่าน · Inspected = QA ผ่าน · ชื่อที่แสดงไม่ใช่ลายเซ็น<br>${d.updatedAt?`บันทึกท้ายใบ: ${e(localDate(d.updatedAt))} โดย ${e(d.updatedBy)}`:''}</footer></article>`;
    }
    function render(opts) {
        return `<style>${styles}</style>` + models(opts).map(model=>{
            const pages=Math.max(1,Math.ceil(model.rows.length/14));
            return Array.from({length:pages},(_,i)=>sheet(model,model.rows.slice(i*14,(i+1)*14),i+1,pages)).join('');
        }).join('');
    }
    const api={snapshot,rowData,models,render,localDate};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CargoTransferDocument=api;
})(typeof window!=='undefined'?window:globalThis);
