(async function() {
    const status=document.getElementById('status'), target=document.getElementById('document'), button=document.getElementById('print');
    button.addEventListener('click',()=>window.print());
    try {
        const query=new URLSearchParams(location.search), ticket=query.get('ticket');
        if(ticket && /^[a-f0-9-]{36}$/.test(ticket)) {
            const cached=JSON.parse(sessionStorage.getItem('scdCtfPrint-'+ticket)||'null');
            if(!cached || Date.now()-cached.at>30*60*1000)throw new Error('ตัวอย่างหมดอายุ กรุณากลับไปเลือกงานแล้วพิมพ์ใหม่');
            // The ticket contains only markup produced by the escaped shared renderer.
            const parsed=new DOMParser().parseFromString(cached.html,'text/html');
            parsed.querySelectorAll('script,.no-print').forEach(node=>node.remove());
            target.replaceChildren(...parsed.head.querySelectorAll('style'),...parsed.body.childNodes);
        } else {
            const house=(query.get('house')||'').trim();
            if(!house)throw new Error('กรุณาเลือก House จากหน้าเปิดใบขาออก');
            const token=localStorage.getItem('scdTransportWebSession');
            if(!token)throw new Error('กรุณาเข้าสู่ระบบหลักก่อน แล้วเปิดใบนี้อีกครั้ง');
            const response=await fetch('/api/bootstrap',{headers:{Authorization:'Bearer '+token,'x-scd-mobile-compact':'1'},cache:'no-store'});
            if(!response.ok)throw new Error('โหลดงานไม่สำเร็จ กรุณาตรวจสิทธิ์หรือเข้าสู่ระบบใหม่');
            const data=await response.json(), jobs=data.dashboard?.jobs || [];
            const job=jobs.find(job=>job.houseNumber===house);
            if(!job)throw new Error('ไม่พบ House หรือบัญชีนี้ไม่มีสิทธิ์ดูงาน');
            const houses=job.cargoTransferDocument?.rows?.map(row=>row.houseNumber)||job.cargoTransferGroup||[house];
            if(houses.some(h=>!jobs.some(job=>job.houseNumber===h)))throw new Error('ดึงรายการไม่ครบใบ กรุณาตรวจสิทธิ์ก่อนพิมพ์');
            target.innerHTML=CargoTransferDocument.render({rows:houses.map(houseNumber=>({houseNumber})),jobs});
        }
        await document.fonts.ready;
        if(!target.querySelector('.ctf-sheet'))throw new Error('ไม่มีรายการ Cargo Transfer ให้พิมพ์');
        status.textContent='ตรวจข้อมูลก่อนพิมพ์ · A4 แนวตั้ง · สเกล 100% · ปิดหัวกระดาษและท้ายกระดาษของเบราว์เซอร์';
        button.disabled=false;
    } catch(error) { status.textContent=error.message; }
})();
