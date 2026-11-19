import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fleet = require("../src/server/fleet-driver-import.cjs");

const admin={id:"u_admin",role:"Admin"};
const password="ScdDriver@Test2026";
const rows=[
  {employeeCode:"DRV001",name:"นาย ก ข",phone:"0811111111",vehiclePlate:"69-1000+70-2000",primaryPlate:"69-1000",trailerPlate:"70-2000",vehicleType:"6 ล้อพ่วง",temporaryPassword:password,sourceSheet:"SCD",sourceRow:2},
  {employeeCode:"",name:"",vehiclePlate:"69-3000",vehicleType:"6 ล้อ",sourceSheet:"SCD",sourceRow:3}
];

test("fleet preview and apply create a driver plus separate vehicle registry",()=>{
  const db:any={users:[admin],fleetVehicles:[],hr:{employeeProfiles:{}}};
  const preview=fleet.importFleetDrivers(db,{actor:admin,records:rows,preview:true});
  assert.equal(preview.createDriverCount,1); assert.equal(preview.uniqueVehicleCount,2); assert.equal(preview.vehicleOnlyCount,1);
  const result=fleet.importFleetDrivers(db,{actor:admin,records:rows,preview:false,now:"2026-11-17T00:00:00.000Z"});
  assert.equal(result.createDriverCount,1); assert.equal(db.fleetVehicles.length,2);
  assert.equal(db.users[1].vehiclePlate,"69-1000+70-2000"); assert.ok(db.users[1].passwordHash.startsWith("scrypt$"));
  assert.equal(fleet.visibleFleet(db).length,2);
});

test("fleet import updates an existing driver without replacing their code or password",()=>{
  const existing:any={id:"u_emp001",code:"EMP001",name:"นาย ก ข",role:"Driver",status:"Active",passwordHash:"kept",phone:""};
  const db:any={users:[admin,existing],fleetVehicles:[],hr:{employeeProfiles:{}}};
  const preview=fleet.importFleetDrivers(db,{actor:admin,records:[rows[0]],preview:true}); assert.equal(preview.updateDriverCount,1);
  fleet.importFleetDrivers(db,{actor:admin,records:[rows[0]],preview:false});
  assert.equal(existing.code,"EMP001"); assert.equal(existing.passwordHash,"kept"); assert.equal(existing.phone,"0811111111");
});

test("fleet import denies non-admin and duplicate driver names",()=>{
  assert.throws(()=>fleet.importFleetDrivers({users:[]},{actor:{role:"Driver"},records:rows,preview:true}),/Admin/);
  const preview=fleet.importFleetDrivers({users:[admin],fleetVehicles:[],hr:{employeeProfiles:{}}},{actor:admin,records:[rows[0],{...rows[0],employeeCode:"DRV002",englishName:"Mr. Kor Khor",name:"Mr. Kor Khor"}],preview:true});
  assert.equal(preview.driverCount,1); assert.equal(preview.mergedDuplicateCount,1);
});

test("English and Thai rows match one existing driver by phone and preserve both names",()=>{
  const existing:any={id:"u_emp001",code:"EMP001",name:"นาย สมพงษ์ พิมพ์โพธิ์",thaiName:"นาย สมพงษ์ พิมพ์โพธิ์",role:"Driver",status:"Active",passwordHash:"kept",phone:"0962312292",vehiclePlate:"700-2665+63-1183"};
  const db:any={users:[admin,existing],fleetVehicles:[],hr:{employeeProfiles:{}}};
  const records=[
    {employeeCode:"EMP001",name:"Mr.Somphong Phimpho",englishName:"Mr.Somphong Phimpho",phone:"096 231 2292",vehiclePlate:"700-2665+63-1183",temporaryPassword:password,sourceSheet:"รายชื่อคนขับรถ",sourceRow:2},
    {employeeCode:"EMP001",name:"นาย สมพงษ์ พิมพ์โพธิ์",thaiName:"นาย สมพงษ์ พิมพ์โพธิ์",phone:"0962312292",vehiclePlate:"700-2665+63-1183",temporaryPassword:password,sourceSheet:"รายชื่อคนขับรถ",sourceRow:3,nationality:"ไทย",nickname:"พงษ์"}
  ];
  const preview=fleet.importFleetDrivers(db,{actor:admin,records,preview:true});
  assert.equal(preview.driverCount,1); assert.equal(preview.mergedDuplicateCount,1); assert.equal(preview.createDriverCount,0);
  fleet.importFleetDrivers(db,{actor:admin,records,preview:false});
  assert.equal(db.users.length,2); assert.equal(existing.name,"นาย สมพงษ์ พิมพ์โพธิ์");
  assert.equal(existing.englishName,"Mr.Somphong Phimpho"); assert.equal(existing.nickname,"พงษ์"); assert.equal(existing.nationality,"ไทย");
  assert.equal(db.hr.employeeProfiles.u_emp001.englishName,"Mr.Somphong Phimpho");
});

test("an English source row can explicitly match a Thai driver without replacing the Thai display name",()=>{
  const existing:any={id:"u_emp002",code:"EMP002",name:"นาย วินัย พงษ์ศร",role:"Driver",status:"Active",passwordHash:"kept",phone:"",vehiclePlate:"69-9420+62-6710"};
  const db:any={users:[admin,existing],fleetVehicles:[],hr:{employeeProfiles:{}}};
  const record={employeeCode:"EMP002",matchUserId:"u_emp002",name:"Mr.Winai Pongsorn",englishName:"Mr.Winai Pongsorn",phone:"0988400386",vehiclePlate:"69-9420+62-6710",temporaryPassword:password,sourceSheet:"รายชื่อคนขับรถ",sourceRow:4};
  const preview=fleet.importFleetDrivers(db,{actor:admin,records:[record],preview:true});
  assert.equal(preview.createDriverCount,0); assert.equal(preview.updateDriverCount,1);
  fleet.importFleetDrivers(db,{actor:admin,records:[record],preview:false});
  assert.equal(existing.name,"นาย วินัย พงษ์ศร"); assert.equal(existing.englishName,"Mr.Winai Pongsorn");
});
