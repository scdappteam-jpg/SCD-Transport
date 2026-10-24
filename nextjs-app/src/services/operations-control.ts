import axios from 'axios';
export async function operationsRequest<T>(path:string,body?:Record<string,unknown>):Promise<T>{
  const token=localStorage.getItem('scdTransportWebSession');
  if(body&&new TextEncoder().encode(JSON.stringify(body)).length>20*1024*1024)throw new Error('ข้อมูลและหลักฐานรวมเกิน 20 MB กรุณาลดขนาดไฟล์แล้วลองใหม่');
  try {
    const {data}=await axios({url:path,method:body?'POST':'GET',data:body,headers:token?{Authorization:`Bearer ${token}`}:{},timeout:120000});
    return data as T;
  } catch(error){
    if(axios.isAxiosError(error))throw new Error(error.response?.data?.error||'เชื่อมต่อระบบไม่สำเร็จ กรุณาเข้าสู่ระบบหรือรีเฟรช');
    throw error;
  }
}
export async function operationsProof(file:File|null){
  if(!file)return undefined;
  if(file.size>10*1024*1024)throw new Error('ไฟล์ต้องไม่เกิน 10 MB');
  const base64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);});
  return {base64,mimeType:file.type};
}
