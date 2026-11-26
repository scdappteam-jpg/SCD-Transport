'use strict';
(()=>{
 const $=id=>document.getElementById(id);let plan,archiveId,busy=false,url;
 const status=text=>{$('status').textContent=text;};
 const enable=()=>{$('reset').disabled=busy||!archiveId||!$('saved').checked||$('confirm').value!=='312-93478766';};
 async function request(body){const token=localStorage.getItem('scdTransportWebSession');const r=await fetch('/api/admin/master-rehearsal',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(d.error||'ดำเนินการไม่สำเร็จ');return d;}
 async function run(fn){busy=true;enable();$('inspect').disabled=true;$('backup').disabled=true;try{await fn();}catch(e){status(e.message);}finally{busy=false;$('inspect').disabled=false;$('backup').disabled=!plan||!!archiveId;enable();}}
 $('inspect').onclick=()=>run(async()=>{plan=await request();archiveId=undefined;$('saved').checked=false;$('saved').disabled=true;$('scope').textContent=JSON.stringify(plan,null,2);status('ตรวจขอบเขตแล้ว ยังไม่เปลี่ยนสถานะงาน กรุณาสำรองก่อน');});
 $('backup').onclick=()=>run(async()=>{status('กำลังอ่านและตรวจไฟล์หลักฐานทุกไฟล์ กรุณารอ');const d=await request({action:'backup',sha256:plan.sha256});if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([JSON.stringify(d.backup,null,2)],{type:'application/json'}));const a=$('download');a.href=url;a.download=d.filename;a.hidden=false;a.click();archiveId=d.archiveId;$("backupJson").value=JSON.stringify(d.backup,null,2);$("backupDetails").hidden=false;$("restoreId").value=archiveId;$('saved').disabled=false;status('บันทึก Backup กลางแล้ว และดาวน์โหลดไฟล์ข้อมูลพร้อมหลักฐาน '+d.backup.files.length+' ไฟล์ กรุณาตรวจไฟล์ก่อนรีเซ็ต');});
 $('reset').onclick=()=>run(async()=>{const d=await request({action:'reset',archiveId,confirm:'RESET:'+ $('confirm').value});plan=undefined;archiveId=undefined;$('saved').disabled=true;status('รีเซ็ตสำเร็จ '+d.houseNumbers.length+' House เป็น PendingCSApproval · Backup '+d.archiveId+' · เริ่มทำเองที่คิว CS ได้เลย');});
 $('saved').onchange=enable;$('confirm').oninput=enable;
 $('resumeReset').onclick=()=>run(async()=>{const d=await request({action:'reset',archiveId:$('restoreId').value.trim(),confirm:'RESET:312-93478766'});status('ยืนยันรอ CS แล้ว '+d.houseNumbers.length+' House · Backup '+d.archiveId);});
 $('restore').onclick=()=>run(async()=>{if(!window.confirm('กู้สถานะเดิมเฉพาะ Master 312-93478766 ก่อนเริ่มรอบใหม่?'))return;const d=await request({action:'restore',archiveId:$('restoreId').value.trim(),confirm:'RESTORE:312-93478766'});status('กู้สถานะเดิมแล้ว Backup '+d.archiveId);});
})();
