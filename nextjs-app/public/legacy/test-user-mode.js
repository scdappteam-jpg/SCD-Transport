(() => {
    const KEY = 'scdTransportTestUserMode';
    let options, timer;
    const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v?.token && Date.parse(v.expiresAt) > Date.now() ? v : null; } catch (_) { return null; } };
    async function request(token, payload) {
        const res = await fetch((window.SMART_LOGISTICS_API_BASE || '') + '/api/auth/test-mode', {
            method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token}, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'เปิดโหมดทดสอบไม่สำเร็จ');
        return data;
    }
    function clear() {
        for (const key of [KEY,'scdTransportWebAuth','scdTransportWebUser','scdTransportWebSession','scdTransportMobileAuth','scdTransportMobileSession']) localStorage.removeItem(key);
    }
    async function start(adminToken) {
        const data = await request(adminToken, {action:'start'});
        localStorage.setItem(KEY, JSON.stringify({token:data.token, expiresAt:data.expiresAt}));
        render(options);
    }
    async function switchUser(userId) {
        const grant = read();
        if (!grant) throw new Error('โหมดทดสอบหมดอายุ กรุณาให้ Admin เปิดใหม่');
        return request(grant.token, {action:'switch', userId});
    }
    async function stop() {
        const grant = read();
        if (grant) await request(grant.token, {action:'stop'});
        clear();
        location.reload();
    }
    function render(config) {
        if (!config) return;
        options = config;
        const grant = read();
        for(const id of ['webLoginPassword','mobileLoginPassword']){const pass=document.getElementById(id);if(pass){pass.hidden=!!grant;if(pass.previousElementSibling?.tagName==='LABEL')pass.previousElementSibling.hidden=!!grant;}}
        if (!grant) clearTimeout(timer);
        let box = document.getElementById('scdTestUserMode');
        if (!grant && !config.isAdmin) { box?.remove(); return; }
        if (!box) { box = document.createElement('aside'); box.id = 'scdTestUserMode'; document.body.appendChild(box); }
        box.setAttribute('aria-label','โหมดทดสอบเลือกยูส');
        Object.assign(box.style,{position:'fixed',right:'12px',bottom:'76px',zIndex:'10050',maxWidth:'calc(100vw - 24px)',padding:'12px',border:'1px solid #b8860b',borderRadius:'10px',background:'#fff6d7',color:'#172033',boxShadow:'0 4px 16px #0002',font:'14px Tahoma,sans-serif'});
        box.replaceChildren();
        const message = document.createElement('div');
        message.textContent = grant ? 'โหมดทดสอบ · สิ้นสุด ' + new Date(grant.expiresAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) : 'ทดสอบระบบด้วยการเลือกยูส';
        box.appendChild(message);
        const button = document.createElement('button'); button.type = 'button'; button.style.cssText='padding:7px;margin-top:6px;cursor:pointer';
        if (!grant) {
            button.textContent='เปิดโหมดเลือกยูส 2 ชั่วโมง';
            button.onclick=async()=>{button.disabled=true;try{await start(config.adminToken);}catch(e){message.textContent=e.message;button.disabled=false;}};
        } else {
            const select = document.createElement('select'); select.setAttribute('aria-label','ยูสทดสอบ');select.style.cssText='display:block;max-width:300px;padding:8px;margin-top:7px';
            const prompt=document.createElement('option');prompt.value='';prompt.textContent='เลือกยูสเพื่อเข้าใช้งาน';select.appendChild(prompt);
            for (const user of config.users || []) { if(user.status==='Inactive')continue;const o=document.createElement('option');o.value=user.id;o.textContent=user.name+' · '+user.role;select.appendChild(o); }
            select.value=config.authenticated?config.userId:'';
            select.onchange=async()=>{if(!select.value)return;select.disabled=true;try{const data=await switchUser(select.value);await config.onSwitch(select.value,data.token);}catch(e){message.textContent=e.message;}finally{select.disabled=false;}};
            box.appendChild(select);
            button.textContent='ปิดโหมดทดสอบและออกจากระบบ';
            button.onclick=async()=>{button.disabled=true;try{await stop();}catch(e){message.textContent=e.message;button.disabled=false;}};
            clearTimeout(timer);timer=setTimeout(()=>{clear();location.reload();},Math.max(1,Date.parse(grant.expiresAt)-Date.now()));
        }
        box.appendChild(button);
    }
    window.addEventListener('storage',e=>{if(e.key===KEY)render(options);});
    window.SCDTestUserMode={available:()=>!!read(),start,switchUser,stop,render};
})();
