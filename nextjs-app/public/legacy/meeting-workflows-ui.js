window.MeetingWorkflows = (() => {
    const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const get = path => api(path,undefined,'GET');
    async function files(input) {
        return Promise.all(Array.from(input.files||[]).map(file=>new Promise((resolve,reject)=>{
            if(file.size>6*1024*1024){reject(new Error('ภาพสแกนแต่ละภาพต้องไม่เกิน 6 MB กรุณาลดขนาดหรือถ่ายใหม่'));return;}
            const reader=new FileReader();reader.onload=()=>resolve({base64:reader.result,mimeType:file.type});reader.onerror=reject;reader.readAsDataURL(file);
        })));
    }
    function error(host,err){host.textContent=err.message||'ทำรายการไม่สำเร็จ';}
    async function settings() {
        const host=document.getElementById('meetingSettingsPage');host.textContent='กำลังโหลด…';
        try {
            const data=await get('/api/meeting/settings'),p=data.policy;
            host.innerHTML=`<p><b>สถานะ: ${p.enabled?'เปิดบังคับกติกาใหม่':'ขาเข้าบังคับ QA แล้ว / กติกาอื่นยังอยู่ในขอบเขตที่ตั้งไว้'}</b></p><p>พิกัด WH3 เว้นไว้ตามคำสั่ง ให้กำหนดจุดจริงจาก Google Maps ในเมนู HR ก่อนเปิด Geofencing ไม่มีการปักจุดสมมติ</p><p>ผู้ติดแท็ก: WH Staff / WH Leader / Tagging Staff • ผู้ตรวจ: Check House / QA Inspector ต้องเป็นคนละยูสกัน Admin ไม่มีปุ่มข้าม QA</p><form id="meetingPolicyForm"><label><input id="meetingEnabled" type="checkbox" ${p.enabled?'checked':''}> เปิดบังคับ Checklist/หลักฐานก่อนโหลด, QA ทุกการย้าย และคิวตาม Flight</label><br><label><input id="meetingGeo" type="checkbox" ${p.geofencingEnabled?'checked':''}> เปิด Geofencing ด้วยจุดเช็คอินจริงที่ตั้งไว้</label><p>จุดที่ตั้งไว้ ${data.geofenceLocations.length} จุด</p><label>เปิดกติกาเฉพาะชุด SIT (หนึ่งเลขต่อบรรทัด ไม่กระทบงานจริง)<textarea id="meetingSitHouses" ${data.canEdit?'':'disabled'}>${esc((p.sitHouseNumbers||[]).join("\n"))}</textarea></label><label>นาทีต่อคิว <input id="meetingQueueMinutes" type="number" min="1" max="120" value="${p.queueMinutes}" required></label><p><label><input id="meetingAcknowledge" type="checkbox"> ยืนยันว่าการเปิดกติกาจะล็อกงานเดิมที่ยังไม่มีผล QA ด้วย ต้องจัดเจ้าหน้าที่สแกนก่อนย้าย/ส่งออก</label></p><button class="btn" ${data.canEdit?'':'disabled'}>บันทึกกติกา (Admin)</button><p id="meetingPolicyStatus" role="status"></p></form>`;
            host.querySelector('form').addEventListener('submit',async e=>{
                e.preventDefault();const button=e.submitter;button.disabled=true;
                try {await api('/api/meeting/settings',{enabled:host.querySelector('#meetingEnabled').checked,geofencingEnabled:host.querySelector('#meetingGeo').checked,queueMinutes:Number(host.querySelector('#meetingQueueMinutes').value),sitHouseNumbers:host.querySelector('#meetingSitHouses').value.split(/[\s,;]+/).filter(Boolean),acknowledgeExistingJobs:host.querySelector('#meetingAcknowledge').checked});await settings();}
                catch(err){error(host.querySelector('#meetingPolicyStatus'),err);}finally{button.disabled=false;}
            });
        }catch(err){error(host,err);}
    }
    async function quality(query='') {
        const host=document.getElementById('warehouseQualityPage');host.textContent='กำลังโหลด…';
        try {
            const data=await get('/api/warehouse/quality?query='+encodeURIComponent(query));
            const intake=['Admin','WH3_TeamLeader','WH_Staff'].includes(data.actor.role);
            const tagger=['WH_Staff','WH3_TeamLeader','Tagging_Staff'].includes(data.actor.role),inspector=['QA_Inspector','Check_House'].includes(data.actor.role);
            host.innerHTML=`<p>${data.policy.enabled?'กติกากลางเปิดใช้งาน':'ขาเข้าบังคับ QA ก่อนจัดเก็บ/ย้ายและปิดรับแล้ว ส่วนกติกาอื่นเป็นไปตามการตั้งค่า'}</p><form id="qualitySearchForm" style="display:flex;gap:8px;flex-wrap:wrap"><input id="qualityQuery" class="form-input" value="${esc(query)}" placeholder="Onhand / House / Master / Invoice / ลูกค้า" aria-label="ค้นหา QA"><button class="btn">ค้นหา</button></form><p>สแกนรูปแท็กจริงเท่านั้น ไม่มีการกดยืนยันผ่านด้วยมือ แท็กคู่ใช้ภาพสแกน 2 ภาพ • แสดงสูงสุด 100 งาน ให้ค้นหาเลขเจาะจง</p><div id="qualityStatus" role="status"></div><div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>งาน / Invoice</th><th>ที่มา / QA</th><th>ชนิดแท็ก / ภาพสแกน</th><th>ดำเนินการ</th></tr></thead><tbody>${data.jobs.map((j,i)=>`<tr><td><b>${esc(j.houseNumber)}</b><br>House ${esc(j.hawbNumber||'-')}<br>Master ${esc(j.master||'-')}<br>${esc(j.customerName)}<br>Invoice ${esc(j.invoiceNo||'-')}</td><td>${esc(j.shipmentSource)}<br>${j.qaApproved?'QA ผ่าน':'รอ QA'}<br>Revision ${j.tagInspection?.revision||0}<br>ติดแท็กโดย ${esc(j.tagInspection?.taggedBy||'-')}</td><td><select class="qaMode" data-row="${i}" ${tagger?'':'disabled'}><option value="Single" ${(j.tagInspection?.mode||j.trackType)==='Single'?'selected':''}>Single</option><option value="Pair" ${(j.tagInspection?.mode||j.trackType)==='Pair'?'selected':''}>Pair</option></select><label>สีแท็ก <input class="qaSticker" data-row="${i}" value="${esc(j.stickerColor)}" maxlength="80" ${tagger?'':'disabled'}></label><input class="qaImages" data-row="${i}" type="file" accept="image/*" capture="environment" multiple aria-label="ภาพสแกน ${esc(j.houseNumber)}"></td><td>${tagger?`<button class="btn qaAction" data-row="${i}" data-action="tag">บันทึกติดแท็กจากรูปสแกน</button>`:''}${inspector?`<button class="btn qaAction" data-row="${i}" data-action="scan">สแกนตรวจ QA จากรูป</button>`:''}${!tagger&&!inspector?'บัญชีนี้ดูข้อมูลได้ ต้องใช้ยูสผู้ติดแท็กหรือ QA':''}</td></tr>`).join('')}</tbody></table></div><hr><h3>จับคู่ House ↔ Invoice / ลูกค้ามาส่งเอง</h3><form id="externalIntakeForm"><label>House <input name="houseNumber" required maxlength="80"></label><label>Invoice <input name="invoiceNo" required maxlength="160"></label><label>แหล่งที่มา <select name="shipmentSource"><option value="SCD">SCD — จับคู่กับงานที่มีอยู่</option><option value="CustomerDirect">Customer Direct — ลูกค้ามาส่งเอง</option></select></label><label>ลูกค้า (กรณีงานใหม่) <input name="customerName"></label><label>จำนวนตามแผน <input name="pieceCount" type="number" min="1" step="1"></label><label>หน่วย <select name="packageType"><option>CTN</option><option>PLT</option></select></label><p><label><input name="receivedAtFrontDesk" type="checkbox"> ลูกค้ามาส่งถึงหน้าคลังจริงแล้ว (ใช้กับงานใหม่)</label></p><button class="btn">จับคู่ / รับรายการหน้าคลัง</button></form>`;
            host.querySelector('#qualitySearchForm').addEventListener('submit',e=>{e.preventDefault();quality(host.querySelector('#qualityQuery').value);});
            host.querySelectorAll('.qaAction').forEach(button=>button.addEventListener('click',async()=>{
                button.disabled=true;const i=button.dataset.row,j=data.jobs[i];
                try {
                    const scanImages=await files(host.querySelector(`.qaImages[data-row="${i}"]`));
                    if(!scanImages.length)throw new Error('เลือก/ถ่ายรูปสแกนบาร์โค้ดก่อน');
                    await api('/api/warehouse/quality/'+button.dataset.action,{houseNumber:j.houseNumber,tagMode:host.querySelector(`.qaMode[data-row="${i}"]`).value,expectedRevision:j.tagInspection?.revision||0,stickerColor:host.querySelector(`.qaSticker[data-row="${i}"]`).value,scanImages});
                    await quality(query);
                }catch(err){error(host.querySelector('#qualityStatus'),err);}finally{button.disabled=false;}
            }));
            host.querySelector('#externalIntakeForm').hidden=!intake;
            host.querySelector('#externalIntakeForm').previousElementSibling.hidden=!intake;
            host.querySelector('#externalIntakeForm').addEventListener('submit',async e=>{
                e.preventDefault();const button=e.submitter;button.disabled=true;
                try {
                    const form=new FormData(e.target),p=Object.fromEntries(form);p.receivedAtFrontDesk=form.has('receivedAtFrontDesk');
                    const found=await get('/api/warehouse/quality?query='+encodeURIComponent(p.houseNumber));
                    const match=found.jobs.find(j=>[j.houseNumber,j.hawbNumber,j.onhandNumber].includes(p.houseNumber));p.expectedUpdatedAt=match?.updatedAt;
                    const result=await api('/api/warehouse/external-intake',p);await quality(result.houseNumber);
                }catch(err){error(host.querySelector('#qualityStatus'),err);}finally{button.disabled=false;}
            });
        }catch(err){error(host,err);}
    }
    async function driverLog() {
        const host=document.getElementById('driverTimeLogPage');
        host.innerHTML=`<p>รายงานอ้างอิงเวลาในระบบ แยกจากใบ Cargo เดิม ไม่สั่งพิมพ์ใบปะหน้าซ้ำ</p><form id="driverLogFilters"><label>ตั้งแต่ <input name="from" type="date"></label><label>ถึง <input name="to" type="date"></label><label>ค้นหา <input name="query" placeholder="House / Master / ลูกค้า / คนขับ"></label><label><input name="includeSIT" type="checkbox" value="true"> รวม SIT (แสดงเครื่องหมายจำลอง)</label><button class="btn">ดูรายงาน</button></form><p id="driverLogStatus" role="status"></p><button id="driverLogPrint" class="btn btn-outline" hidden>พิมพ์ Driver Log</button><iframe id="driverLogFrame" title="Driver Time Log Report" sandbox="allow-same-origin allow-modals" style="width:100%;height:70vh;border:1px solid #d1dbe5" hidden></iframe>`;
        host.querySelector('form').addEventListener('submit',async e=>{
            e.preventDefault();const button=e.submitter;button.disabled=true;
            try{const params=new URLSearchParams(new FormData(e.target));params.set('format','html');const result=await get('/api/driver/time-log?'+params);const frame=host.querySelector('iframe');frame.srcdoc=result.html;frame.hidden=false;host.querySelector('#driverLogPrint').hidden=false;}
            catch(err){error(host.querySelector('#driverLogStatus'),err);}finally{button.disabled=false;}
        });
        host.querySelector('#driverLogPrint').addEventListener('click',()=>host.querySelector('iframe').contentWindow.print());
    }
    return {settings,quality,driverLog};
})();
