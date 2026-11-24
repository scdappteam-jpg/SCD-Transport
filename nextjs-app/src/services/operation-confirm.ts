export function confirmOperation(message:string):Promise<boolean>{
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='ops-confirm-dialog';
  dialog.setAttribute('aria-labelledby','opsConfirmTitle');
  const title=document.createElement('h2');title.id='opsConfirmTitle';title.textContent='ตรวจข้อมูลก่อนบันทึก';
  const detail=document.createElement('p');detail.textContent=message;
  const actions=document.createElement('div');actions.className='ops-confirm-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='ยกเลิก';
  const confirm=document.createElement('button');confirm.type='button';confirm.textContent='ยืนยันบันทึก';
  let settled=false;
  const finish=(value:boolean)=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(value);};
  cancel.onclick=()=>finish(false);confirm.onclick=()=>finish(true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
  actions.append(cancel,confirm);dialog.append(title,detail,actions);document.body.append(dialog);dialog.showModal();cancel.focus();
 });
}
