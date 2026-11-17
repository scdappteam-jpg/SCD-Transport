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
  assert.throws(()=>fleet.importFleetDrivers({users:[admin]},{actor:admin,records:[rows[0],{...rows[0],employeeCode:"DRV002"}],preview:true}),/ชื่อคนขับซ้ำ/);
});
