/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS server compatibility boundary */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const clean=(value,max=160)=>String(value||'').trim().slice(0,max);
const fail=(message,statusCode=422,code='BIOMETRIC_ERROR')=>{throw Object.assign(new Error(message),{statusCode,code});};
const sha=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');

function settings(){
 return {
  region:clean(process.env.AWS_REKOGNITION_REGION||'ap-southeast-7',40),
  identityPoolId:clean(process.env.NEXT_PUBLIC_AWS_COGNITO_IDENTITY_POOL_ID,200),
  configured:Boolean(process.env.AWS_ACCESS_KEY_ID&&process.env.AWS_SECRET_ACCESS_KEY&&process.env.NEXT_PUBLIC_AWS_COGNITO_IDENTITY_POOL_ID),
  livenessThreshold:Number(process.env.FACE_LIVENESS_THRESHOLD||90),
  similarityThreshold:Number(process.env.FACE_SIMILARITY_THRESHOLD||99)
 };
}

function pinHash(pin){
 const salt=crypto.randomBytes(16),derived=crypto.scryptSync(String(pin),salt,64);
 return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}
function pinMatches(pin,encoded){
 const [algorithm,salt,expected]=String(encoded||'').split('$');
 if(algorithm!=='scrypt'||!salt||!expected)return false;
 const actual=crypto.scryptSync(String(pin),Buffer.from(salt,'base64'),64),target=Buffer.from(expected,'base64');
 return actual.length===target.length&&crypto.timingSafeEqual(actual,target);
}
function validatePin(pin,user){
 const value=String(pin||'');
 if(!/^\d{6}$/.test(value))fail('PIN ต้องเป็นตัวเลข 6 หลัก',422,'PIN_FORMAT');
 if(/^([0-9])\1{5}$/.test(value)||['123456','654321','000000'].includes(value)||value===String(user?.code||'').replace(/\D/g,'').slice(-6))fail('PIN นี้เดาง่ายเกินไป กรุณาเลือกเลขอื่น',422,'PIN_WEAK');
 return value;
}
function setPin(db,user,pin,at){
 validatePin(pin,user);user.pinHash=pinHash(pin);user.pinUpdatedAt=at;user.pinFailedAttempts=0;user.pinLockedUntil='';
 audit(db,user.id,'PinConfigured',{employeeId:user.id},at);return {ok:true,pinConfigured:true};
}
function referencePath(storageDir,user){
 const raw=clean(user.profilePhotoUrl||user.photoUrl,1000);
 if(!raw.startsWith('/storage/profile/'))return '';
 const name=path.basename(raw);if(name!==raw.slice('/storage/profile/'.length))return '';
 const target=path.resolve(storageDir,'profile',name),root=path.resolve(storageDir,'profile')+path.sep;
 return target.startsWith(root)?target:'';
}
function rateState(db,userId,now=Date.now()){
 db.biometricLoginAttempts=(db.biometricLoginAttempts||[]).filter(item=>now-Date.parse(item.at)<24*60*60*1000).slice(-2000);
 const failures=db.biometricLoginAttempts.filter(item=>item.userId===userId&&item.result==='Failed').sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),lastFive=failures.slice(-5);
 const triggered=lastFive.length===5&&Date.parse(lastFive.at(-1).at)-Date.parse(lastFive[0].at)<=15*60*1000,lockedUntil=triggered?Date.parse(lastFive.at(-1).at)+30*60*1000:0;
 return {recent:lastFive,locked:triggered&&now<lockedUntil,lockedUntil:lockedUntil?new Date(lockedUntil).toISOString():''};
}
function recordAttempt(db,userId,result,reason,at){db.biometricLoginAttempts=[...(db.biometricLoginAttempts||[]),{id:crypto.randomUUID(),userId,result,reason:clean(reason,80),at}].slice(-2000);}
function findUser(db,login){const key=clean(login,120).toUpperCase();return (db.users||[]).find(user=>user.status!=='Inactive'&&(String(user.id).toUpperCase()===key||String(user.code||'').toUpperCase()===key));}
function consentReady(db,user){const version=db.operationalReadiness?.pdpa?.consentVersion;return Boolean(version&&(db.pdpaConsents||[]).some(item=>item.employeeId===user.id&&item.version===version&&item.status==='Granted'));}

async function client(){
 const sdk=await import('@aws-sdk/client-rekognition');
 return {sdk,client:new sdk.RekognitionClient({region:settings().region})};
}
async function start(db,{login,pin,storageDir,at}){
 const user=findUser(db,login);if(!user)fail('ข้อมูลยืนยันไม่ถูกต้อง',401,'AUTH_FAILED');
 const rate=rateState(db,user.id);if(rate.locked)fail('ลองยืนยันหลายครั้งเกินไป กรุณารอ 30 นาทีหรือติดต่อหัวหน้า',429,'PIN_LOCKED');
 if(!user.pinHash||!pinMatches(pin,user.pinHash)){recordAttempt(db,user.id,'Failed','PinMismatch',at);fail('ข้อมูลยืนยันไม่ถูกต้อง',401,'AUTH_FAILED');}
 const cfg=settings();if(!cfg.configured)fail('ระบบสแกนใบหน้ายังไม่ได้ตั้งค่า AWS/Cognito',503,'FACE_PROVIDER_NOT_CONFIGURED');
 if(!consentReady(db,user))fail('ยังไม่มีความยินยอม PDPA สำหรับข้อมูลชีวภาพ',428,'BIOMETRIC_CONSENT_REQUIRED');
 const ref=referencePath(storageDir,user);if(!ref||!fs.existsSync(ref))fail('ยังไม่มีรูปอ้างอิงพนักงานที่อนุมัติแล้ว',428,'FACE_REFERENCE_REQUIRED');
 const {sdk,client:rekognition}=await client();
 const result=await rekognition.send(new sdk.CreateFaceLivenessSessionCommand({ClientRequestToken:crypto.randomUUID(),Settings:{AuditImagesLimit:0,ChallengePreferences:[{Type:'FaceMovementAndLightChallenge'}]}}));
 if(!result.SessionId)fail('สร้าง Face Liveness session ไม่สำเร็จ',503,'FACE_PROVIDER_ERROR');
 const nonce=crypto.randomBytes(32).toString('base64url');
 db.faceAuthSessions=[...(db.faceAuthSessions||[]).filter(item=>Date.parse(item.expiresAt)>Date.now()&&!item.usedAt),{id:crypto.randomUUID(),awsSessionId:result.SessionId,userId:user.id,nonceHash:sha(nonce),createdAt:at,expiresAt:new Date(Date.now()+5*60*1000).toISOString()}].slice(-500);
 return {sessionId:result.SessionId,nonce,region:cfg.region,identityPoolId:cfg.identityPoolId,user:{id:user.id,name:user.name}};
}
async function complete(db,{sessionId,nonce,storageDir,at}){
 const pending=(db.faceAuthSessions||[]).find(item=>item.awsSessionId===sessionId&&!item.usedAt&&Date.parse(item.expiresAt)>Date.now()&&item.nonceHash===sha(nonce));
 if(!pending)fail('Face session หมดอายุหรือถูกใช้แล้ว',410,'FACE_SESSION_EXPIRED');
 pending.usedAt=at;const user=(db.users||[]).find(item=>item.id===pending.userId);if(!user)fail('ไม่พบบัญชีพนักงาน',404);
 const cfg=settings(),{sdk,client:rekognition}=await client();
 const result=await rekognition.send(new sdk.GetFaceLivenessSessionResultsCommand({SessionId:sessionId}));
 if(result.Status!=='SUCCEEDED'||Number(result.Confidence||0)<cfg.livenessThreshold||!result.ReferenceImage?.Bytes){recordAttempt(db,user.id,'Failed','LivenessRejected',at);fail('ตรวจคนจริงไม่ผ่าน กรุณาจัดแสงและลองใหม่',401,'LIVENESS_REJECTED');}
 const ref=referencePath(storageDir,user);if(!ref||!fs.existsSync(ref))fail('ไม่พบรูปอ้างอิงพนักงาน',428,'FACE_REFERENCE_REQUIRED');
 const compared=await rekognition.send(new sdk.CompareFacesCommand({SourceImage:{Bytes:fs.readFileSync(ref)},TargetImage:{Bytes:result.ReferenceImage.Bytes},SimilarityThreshold:cfg.similarityThreshold,QualityFilter:'HIGH'}));
 const similarity=Math.max(0,...(compared.FaceMatches||[]).map(match=>Number(match.Similarity||0)));
 if(similarity<cfg.similarityThreshold){recordAttempt(db,user.id,'Failed','FaceMismatch',at);audit(db,user.id,'BiometricLoginRejected',{reason:'FaceMismatch'},at);fail('ใบหน้าไม่ตรงกับเจ้าของบัญชี กรุณาติดต่อหัวหน้าหากคิดว่าเป็นข้อผิดพลาด',401,'FACE_MISMATCH');}
 recordAttempt(db,user.id,'Passed','Verified',at);audit(db,user.id,'BiometricLoginVerified',{provider:'AWSRekognition'},at);
 return {user};
}
function audit(db,actorId,action,detail,at){db.hr||={};db.hr.auditLogs||=[];db.hr.auditLogs.push({id:`HRAUD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,actorId,action,detail,at});}

module.exports={settings,pinHash,pinMatches,validatePin,setPin,start,complete,findUser,referencePath,rateState};
