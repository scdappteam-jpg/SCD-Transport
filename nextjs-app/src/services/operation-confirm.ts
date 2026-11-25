export function confirmOperation(message:string):Promise<boolean>{
 return new Promise(resolve=>{
  let host=document;
  try{if(window.parent!==window&&window.frameElement?.id==='operationsWorkspaceFrame')host=window.parent.document;}catch{/* Keep standalone confirmation in its own document. */}
  const dialog=host.createElement('dialog');dialog.className='ops-confirm-dialog';
  dialog.setAttribute('aria-labelledby','opsConfirmTitle');
  const title=host.createElement('h2');title.id='opsConfirmTitle';title.textContent='ตรวจข้อมูลก่อนบันทึก';
  const detail=host.createElement('p');detail.textContent=message;
  const actions=host.createElement('div');actions.className='ops-confirm-actions';
  const cancel=host.createElement('button');cancel.type='button';cancel.textContent='ยกเลิก';
  const confirm=host.createElement('button');confirm.type='button';confirm.textContent='ยืนยันบันทึก';
  let settled=false;
  const leaving=()=>finish(false);
  const finish=(value:boolean)=>{if(settled)return;settled=true;window.removeEventListener('pagehide',leaving);dialog.close();dialog.remove();resolve(value);};
  cancel.onclick=()=>finish(false);confirm.onclick=()=>finish(true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
  window.addEventListener('pagehide',leaving,{once:true});
  actions.append(cancel,confirm);dialog.append(title,detail,actions);host.body.append(dialog);dialog.showModal();cancel.focus();
 });
}
