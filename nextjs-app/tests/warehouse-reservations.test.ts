import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import planning from '../src/server/warehouse-reservation-list.cjs';

test('WH page requests the read-only GET contract instead of the legacy POST default', async () => {
  const source = fs.readFileSync(new URL('../public/legacy/warehouse-reservations-page.js',import.meta.url),'utf8');
  let requestMethod: string | undefined;
  const host = {textContent:'',set innerHTML(_value: string){throw new Error('Stop before DOM drawing');}};
  const context = vm.createContext({window:{},document:{getElementById:()=>host},
    api:async (_path: string,_payload: unknown,method: string)=>{requestMethod=method;return {jobs:[]};},
    loadWarehouseMap:async()=>{},ShipmentReferences:{createIndex:()=>({})},whMapState:{zones:[]}});
  vm.runInContext(source,context);
  await vm.runInContext('window.WarehouseReservationsPage.render()',context);
  assert.equal(requestMethod,'GET');
});

test('WH planning includes confirmed unissued jobs and preserves existing reservations without writes', () => {
  const jobs = [
    {houseNumber:'4841',csConfirmed:true,status:'Pending',destination:'WH3',pieceCount:5,packageType:'Carton'},
    {houseNumber:'4842',csConfirmed:true,status:'ReturningWH3',routeType:'WH3',warehouseReservationStatus:'Reserved',warehouseReservedZoneId:'ZONE',warehouseReservedPallets:0},
    {houseNumber:'pending-CS',status:'Pending',destination:'WH3'},
    {houseNumber:'rejected',csConfirmed:true,csRejected:true,status:'Pending'},
    {houseNumber:'direct',csConfirmed:true,status:'Pending',destination:'TG'},
    {houseNumber:'stored',csConfirmed:true,status:'Stored',destination:'WH3'},
    {houseNumber:'located',csConfirmed:true,status:'InboundOpened',locationId:'A-01'},
    {houseNumber:'closed',csConfirmed:true,status:'HouseIdentified',inboundClosedAt:'2026-10-24'},
    {houseNumber:'cancelled',csConfirmed:true,status:'Cancelled'},
  ];
  const before = structuredClone(jobs);
  assert.deepEqual(planning.selectableJobs(jobs).map((j: {houseNumber: string})=>j.houseNumber), ['4841','4842']);
  assert.deepEqual(jobs,before);
});

test('existing zone and zero pallet reservation are retained; cartons never become pallets', () => {
  const source = fs.readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
  const functions = source.slice(source.indexOf('function defaultReservationZone('),source.indexOf('async function openWarehouseReservationModal('));
  const context = vm.createContext({}); vm.runInContext(functions,context);
  const zones = [{id:'GENERAL',prefix:'STORAGE'},{id:'EXISTING',prefix:'OTHER'}];
  context.zones = zones;
  assert.equal(vm.runInContext('defaultReservationZone({warehouseReservedZoneId:"EXISTING"},zones).id',context),'EXISTING');
  assert.equal(vm.runInContext('reservationPalletsFromJob({packageType:"Carton",pieceCount:53})',context),0);
  assert.equal(vm.runInContext('reservationPalletsFromJob({packageType:"Pallet",pieceCount:6})',context),6);
});

test('CS confirmation no longer invokes warehouse booking and WH has a dedicated protected route', () => {
  const app = fs.readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
  const confirmation = app.slice(app.indexOf('const data = await requestCsConfirmation('),app.indexOf('function defaultReservationZone('));
  assert.ok(confirmation.includes('mergeCsConfirmedJobs(data.jobs)'));
  assert.ok(!confirmation.includes('openWarehouseReservationModal'));
  const start = app.indexOf('function allowedWebViews(');
  const roles = app.slice(start,app.indexOf('\nfunction ',start+1));
  const context = vm.createContext({}); vm.runInContext(roles,context);
  for(const role of ['Admin','Executive','WH3_TeamLeader','WH_Staff']) assert.ok(vm.runInContext(`allowedWebViews("${role}").includes("wh-reservations")`,context));
  for(const role of ['CS','Driver','Team_Transport','Billing']) assert.equal(vm.runInContext(`allowedWebViews("${role}").includes("wh-reservations")`,context),false);
});

