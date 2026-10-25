// Execute the actual handler against an isolated copy; no server/network calls.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'nextjs-app/src/server/legacy-api.cjs'),'utf8');
const start=source.indexOf('    if (req.method === "POST" && pathname === "/api/billing/mark-billed")');
const end=source.indexOf('    if (req.method === "POST" && pathname === "/api/customers/upsert")',start);
const handler=source.slice(start,end);const H='SIT-MEETING-20261025-L2',INV='INV-2026-0001';let writes=0,tick=0;
const db={billing:[{id:INV,houseNumber:H,status:'Draft',amount:1000,dueDate:'2026-10-25T04:42:50.282Z'}],jobs:[{houseNumber:H,invoiceId:INV,status:'InvoiceDrafted',billingStatus:'InvoiceDrafted',readyForBilling:true}]};
const ctx=vm.createContext({db,req:{method:'POST'},res:{},pathname:'/api/billing/mark-billed',parseBody:async()=>({invoiceId:INV}),actor:{id:'SIT-DRIVER',role:'Driver'},sessionUser:()=>ctx.actor,sendJson:(_res,status,body)=>({status,body}),supabaseEnabled:()=>false,findJob:(d,h)=>d.jobs.find(j=>j.houseNumber===h),nowIso:()=>`2026-10-25T06:00:0${++tick}.000Z`,createAlert:async()=>{},writeDb:()=>writes++,buildDashboard:()=>({})});
vm.runInContext(source.match(/^function requireBillingActor\([\s\S]*?^}/m)[0],ctx);
(async()=>{const cases=[];let r=await vm.runInContext('(async()=>{'+handler+'})()',ctx);cases.push({name:'isolated-driver-denied',expected:403,actual:r.status,result:r.status===403&&writes===0?'PASS':'FAIL'});
ctx.actor={id:'SIT-BILLING',role:'Billing'};r=await vm.runInContext('(async()=>{'+handler+'})()',ctx);const first=db.billing[0].billedDate;cases.push({name:'isolated-draft-to-billed-without-email',expected:'Billed',actual:db.billing[0].status,result:r.status===200&&db.jobs[0].readyForBilling===false?'PASS':'FAIL'});
r=await vm.runInContext('(async()=>{'+handler+'})()',ctx);const repeated=db.billing[0].billedDate;cases.push({name:'isolated-repeat-close-preserves-first-billed-date',expected:'409 or idempotent 200 with original billedDate',actual:{httpStatus:r.status,firstBilledDate:first,repeatedBilledDate:repeated},result:r.status===409||repeated===first?'PASS':'FAIL',message:'Actual handler overwrites billedDate on a repeat. Not repeated against production.'});
const result={environment:'isolated VM copy of actual production handler',productionMutation:false,networkCalls:0,house:H,invoiceId:INV,cases,passed:cases.filter(c=>c.result==='PASS').length,failed:cases.filter(c=>c.result==='FAIL').length};fs.writeFileSync(path.join(root,'docs/sit-l2-billed-isolated-results-2026-10-25.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})();
