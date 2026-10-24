/* Warehouse planning is deliberately opened by WH, never by CS confirmation. */
window.WarehouseReservationsPage = (() => {
    let generation = 0;
    async function render() {
        const host = document.getElementById('warehouseReservationsPage');
        if (!host) return;
        const current = ++generation;
        host.textContent = 'กำลังโหลดงานที่ CS ยืนยันแล้ว…';
        try {
            const data = await api('/api/warehouse/reservations');
            if (current !== generation) return;
            await loadWarehouseMap();
            if (current !== generation) return;
            const jobs = data.jobs || [];
            const index = ShipmentReferences.createIndex(jobs);
            const zoneNames = new Map((whMapState.zones || []).map(zone => [zone.id, zone.name]));
            host.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0"><input id="whReservationSearch" class="form-input" style="flex:1;min-width:240px" aria-label="ค้นหางานจองพื้นที่" placeholder="ค้นหา Onhand / Master / House / ลูกค้า / Invoice"><select id="whReservationFilter" class="form-input" aria-label="สถานะการจอง"><option value="all">ทั้งหมด</option><option value="unreserved">ยังไม่จอง</option><option value="reserved">จองแล้ว</option></select><button id="whReservationRefresh" class="btn btn-outline">รีเฟรช</button></div><p id="whReservationCount"></p><button id="whReservationBook" class="btn" disabled>จอง / แก้ไขรายการที่เลือก</button><p style="color:var(--muted)">จองเฉพาะงานเข้าคลัง WH3 ที่ยังไม่ได้จัดเก็บ หากเป็น CTN จะไม่แปลงเป็น PLT อัตโนมัติ</p><div style="overflow-x:auto"><table class="data-table" style="width:100%"><thead><tr><th><input id="whReservationSelectAll" type="checkbox" aria-label="เลือกทั้งหมดในหน้านี้"></th><th>Onhand · Master · House</th><th>ลูกค้า / Invoice</th><th>วันรับ / Flight</th><th>จำนวนตามแผน</th><th>การจองปัจจุบัน</th></tr></thead><tbody id="whReservationRows"></tbody></table></div><div style="display:flex;gap:10px;align-items:center;margin-top:16px"><button id="whReservationPrevious" class="btn btn-outline">ก่อนหน้า</button><span id="whReservationPage"></span><button id="whReservationNext" class="btn btn-outline">ถัดไป</button></div>`;
            let page = 0;
            const size = 100;
            const search = host.querySelector('#whReservationSearch');
            const filter = host.querySelector('#whReservationFilter');
            const book = host.querySelector('#whReservationBook');
            const selectAll = host.querySelector('#whReservationSelectAll');
            const rows = host.querySelector('#whReservationRows');
            const selectedJobs = () => Array.from(rows.querySelectorAll('input:checked')).map(input => jobs[Number(input.value)]);
            function updateSelection() {
                const count = selectedJobs().length;
                book.disabled = count === 0;
                book.textContent = `จอง / แก้ไขรายการที่เลือก${count ? ` (${count})` : ''}`;
            }
            function draw() {
                const query = search.value.trim();
                const lower = query.toLowerCase();
                const matches = jobs.map((job, i) => ({job, i})).filter(({job}) => {
                    const reserved = job.warehouseReservationStatus === 'Reserved';
                    return (filter.value === 'all' || reserved === (filter.value === 'reserved')) &&
                        (!query || ShipmentReferences.matches(job, query, index) || [job.customerName, job.invoiceNo].some(value => String(value || '').toLowerCase().includes(lower)));
                });
                const pages = Math.max(1, Math.ceil(matches.length / size));
                page = Math.min(page, pages - 1);
                const visible = matches.slice(page * size, (page + 1) * size);
                rows.innerHTML = visible.length ? visible.map(({job, i}) => {
                    const refs = ShipmentReferences.grouped(job, index);
                    const references = [['Onhand', refs.onhand.join(' · ')], ['Master', refs.master.join(' · ')], ['House', refs.house.join(' · ') || (refs.pendingHouse ? 'AIR (รอเลข House)' : '')]];
                    const reserved = job.warehouseReservationStatus === 'Reserved';
                    const reservation = reserved ? `${safeHtml(zoneNames.get(job.warehouseReservedZoneId) || job.warehouseReservedZoneId)}<br>${Number(job.warehouseReservedPallets) > 0 ? `${Number(job.warehouseReservedPallets)} PLT` : 'จองโซน · ยังไม่ระบุพาเลท'}` : 'ยังไม่จอง';
                    return `<tr><td><input type="checkbox" value="${i}" aria-label="เลือก ${safeHtml(job.houseNumber)}"></td><td>${references.map(([label, value]) => `<div><small>${label}</small> <b>${safeHtml(value || 'ยังไม่มีเลข')}</b></div>`).join('')}</td><td>${safeHtml(job.customerName || '-')}<br><small>Invoice: ${safeHtml(job.invoiceNo || '-')}</small></td><td>${safeHtml(job.pickupDate || '-')}<br>${safeHtml(job.flightNo || 'TBC')}</td><td>${safeHtml(jobPackingLabel(job))}</td><td>${reservation}</td></tr>`;
                }).join('') : '<tr><td colspan="6">ไม่พบงานที่ตรงเงื่อนไข</td></tr>';
                host.querySelector('#whReservationCount').textContent = `งานตรงเงื่อนไข ${matches.length} / งานที่ CS Confirm แล้วและรอเข้าคลัง ${jobs.length}`;
                host.querySelector('#whReservationPage').textContent = `หน้า ${page + 1} / ${pages}`;
                host.querySelector('#whReservationPrevious').disabled = page === 0;
                host.querySelector('#whReservationNext').disabled = page === pages - 1;
                selectAll.checked = false;
                updateSelection();
            }
            search.addEventListener('input', () => {page = 0; draw();});
            filter.addEventListener('change', () => {page = 0; draw();});
            rows.addEventListener('change', updateSelection);
            selectAll.addEventListener('change', () => {rows.querySelectorAll('input').forEach(input => {input.checked = selectAll.checked;}); updateSelection();});
            host.querySelector('#whReservationPrevious').addEventListener('click', () => {page--; draw();});
            host.querySelector('#whReservationNext').addEventListener('click', () => {page++; draw();});
            host.querySelector('#whReservationRefresh').addEventListener('click', render);
            book.addEventListener('click', async () => {
                book.disabled = true;
                try {await openWarehouseReservationModal(selectedJobs());}
                catch (error) {toast(error.message || 'เปิดการจองไม่สำเร็จ', 'error');}
                finally {updateSelection();}
            });
            draw();
        } catch (error) {
            if (current !== generation) return;
            host.textContent = error.message || 'โหลดแผนจองพื้นที่ไม่สำเร็จ กรุณารีเฟรช';
        }
    }
    return {render};
})();
