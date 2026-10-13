const fs = require("fs");
const path = require("path");

const BASE = "https://scd-transport.onrender.com";
const outDir = path.join(__dirname, "screenshots-2026-10-11");
fs.mkdirSync(outDir, { recursive: true });

const nowSuffix = Date.now().toString().slice(-5);
const house = `SIT-UAT-20261011-${nowSuffix}`;
const flight = `SIT${Date.now().toString().slice(-4)}/11`;
const today = "2026-10-11";
const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lD6G2QAAAABJRU5ErkJggg==";
const img = [{ base64: tinyPng, mimeType: "image/png" }];
const actor = "u_admin_01";
const driver = "u_driver_01";
const pickupItems = `${house},NRT,4,${today},WH3,SITBKG-${house.slice(-4)},SIT-INV-${house.slice(-5)},SIT Contact,099-000-0000`;

async function call(pathname, payload = {}, method = "POST") {
  const init = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (method !== "GET") init.body = JSON.stringify(payload);
  const response = await fetch(`${BASE}${pathname}`, init);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`${pathname}: ${data.error || text}`);
    error.data = data;
    throw error;
  }
  return data;
}

const steps = [];

async function step(name, pathname, payload) {
  const data = await call(pathname, payload);
  steps.push({
    name,
    ok: true,
    status: data.job?.status || data.jobs?.[0]?.status || data.bill?.status || data.request?.status || data.record?.status || "",
    id: data.bill?.id || data.request?.id || data.record?.id || "",
  });
  return data;
}

async function main() {
  await step("01 เพิ่มงานด่วนเข้าคิว Transport", "/api/transport/emergency-job", {
    houseNumber: house,
    customerName: "SIT UAT CUSTOMER CO., LTD.",
    pickupLocation: "SIT TEST PICKUP LOCATION",
    pieceCount: 4,
    weight: 120,
    amount: 2500,
    destAirport: "NRT",
    destination: "WH3",
    routeType: "WH3",
    flightNo: flight,
    flightTime: "2026-10-12T04:00",
    urgentCode: "C",
    pickupDate: today,
    driverId: driver,
    driverName: "Driver A / สมชาย",
    vehiclePlate: "กข-1234",
    contact: "SIT Contact",
    tel: "099-000-0000",
    note: "SIT UAT full loop by Codex 2026-10-11",
  });
  await step("02 CS confirm", "/api/jobs/cs-confirm", {
    houseNumbers: [house],
    invoiceNo: `SIT-INV-${house.slice(-5)}`,
    confirmedBy: "SIT UAT",
    contactName: "SIT Contact",
    evidenceChannel: "Line",
    evidenceNote: "SIT UAT approval evidence",
  });
  await step("03 เปิดใบ Cargo", "/api/admin/issue-cargo", { houseNumber: house, userId: actor });
  await step("04 Driver check-in หน้าลูกค้า", "/api/pickup/checkin", {
    houseNumber: house,
    userId: driver,
    startPlace: "SIT TEST PICKUP LOCATION",
    gpsLat: "13.7563",
    gpsLong: "100.5018",
  });
  await step("05 Driver load pickup", "/api/pickup/load", {
    houseNumber: house,
    userId: driver,
    pickupCase: "Normal",
    checklist: ["driver", "vehicle", "cargo_form", "house", "piece", "weight", "invoice", "booking", "photo", "seal"],
    pickupItems,
    gpsLat: "13.7563",
    gpsLong: "100.5018",
  });
  await step("06 Driver complete pickup", "/api/pickup/complete", {
    houseNumber: house,
    userId: driver,
    pickupCase: "Normal",
    checklist: ["driver", "vehicle", "cargo_form", "house", "piece", "weight", "invoice", "booking", "photo", "seal"],
    pickupItems,
    productImages: img,
    cargoImages: img,
    doorClosedImages: img,
    imageBase64: tinyPng,
    mimeType: "image/png",
    signatureBase64: tinyPng,
    packageType: "Carton",
    inspectorName: "SIT Inspector",
    receiverName: "SIT Receiver",
    gpsLat: "13.7563",
    gpsLong: "100.5018",
  });
  await step("07 Driver arrive WH3", "/api/pickup/arrive-wh3", {
    houseNumber: house,
    userId: driver,
    gpsLat: "13.6900",
    gpsLong: "100.7501",
  });
  await step("08 รับใบตรวจปล่อย", "/api/pickup/release-document", { houseNumber: house, userId: driver });
  await step("09 WH3 document check", "/api/inbound/document-check", {
    houseNumber: house,
    userId: actor,
    documentStatus: "Found",
    note: "SIT UAT document found",
    documentFiles: img,
  });
  await step("10 เปิดงานรับเข้า WH3", "/api/inbound/open", { houseNumber: house, userId: actor });
  await step("11 Scan House เข้าคลัง", "/api/inbound/scan-house", { houseNumber: house, userId: actor, trackType: "Pair" });
  await step("12 Twin scan ลง location", "/api/inbound/twin-scan", {
    houseNumber: house,
    userId: actor,
    locationId: "R001-01",
    scanMode: "dual",
    trackType: "Pair",
    pieces: ["SIT-P1", "SIT-P2", "SIT-P3", "SIT-P4"],
    pallets: 1,
    boxes: 4,
    dimensionText: "120x80x90",
  });
  await step("13 ย้าย location", "/api/inbound/move-location", {
    houseNumber: house,
    userId: actor,
    newLocationId: "R001-02",
    note: "SIT UAT move location",
  });
  await step("14 ปิดงานรับเข้า", "/api/inbound/close", { houseNumber: house, userId: actor, evidenceFiles: img });
  await step("15 WH3 pre-dispatch docs", "/api/outbound/wh3-dispatch-check", {
    houseNumber: house,
    userId: actor,
    terminalDestination: "TG",
    checklist: ["outbound_weighing_slip", "security_original", "airline_specific", "permit", "manifest_review"],
    evidenceFiles: img,
    note: "SIT UAT docs ready",
  });
  await step("16 ออก Cargo Transfer", "/api/outbound/transfer-form", {
    houses: [house],
    userId: actor,
    permitFiles: img,
    lithiumFiles: [],
    transferDate: today,
    transferTime: "14:00",
    transferFrom: "WH3",
    transferTo: "TG",
    driverName: "Driver A / สมชาย",
    vehiclePlate: "กข-1234",
    vehicleType: "4W",
    releaseBy: "SIT UAT",
    eiBarcodeReference: `EI-${house.slice(-5)}`,
  });
  await step("17 Confirm location outbound", "/api/outbound/confirm-location", { houseNumber: house, userId: actor, scannedHouse: house });
  await step("18 Picking ออกจาก WH3", "/api/outbound/picking", { houseNumber: house, userId: actor, documentFiles: img, note: "SIT UAT picking" });
  await step("19 EI approve", "/api/outbound/ei-approve", { houseNumber: house, userId: actor, imageBase64: tinyPng, mimeType: "image/png" });
  await step("20 AOT booking", "/api/outbound/aot-booking", {
    houseNumber: house,
    userId: actor,
    terminalDestination: "TG",
    vehiclePlate: "กข-1234",
    driverName: "Driver A / สมชาย",
    vehicleModel: "Toyota",
    vehicleType: "4W",
  });
  await step("21 AOT approve", "/api/outbound/aot-booking", {
    houseNumber: house,
    userId: actor,
    terminalDestination: "TG",
    vehiclePlate: "กข-1234",
    driverName: "Driver A / สมชาย",
    vehicleModel: "Toyota",
    vehicleType: "4W",
    approved: true,
  });
  await step("22 Loaded from WH3", "/api/outbound/load-bay", { houseNumber: house, userId: actor, imageBase64: tinyPng, mimeType: "image/png" });
  await step("23 Arrived Terminal", "/api/outbound/load-bay", { houseNumber: house, userId: actor, arrived: true });
  const weigh = await step("24 Start weighing", "/api/outbound/weigh-start", { houseNumber: house, userId: actor, terminalDestination: "TG" });
  await step("25 Weight/Dimension", "/api/outbound/weight-dimension", {
    houseNumber: house,
    userId: actor,
    weight: "118.5",
    dimension: "120x80x90",
    weighStartedAt: weigh.weighStartedAt,
  });
  await step("26 X-Ray passed", "/api/outbound/xray", { houseNumber: house, userId: actor, passed: true });
  await step("27 Loading detail completed", "/api/outbound/loading-detail", {
    houseNumber: house,
    userId: actor,
    trayNumber: `TRAY-${house.slice(-4)}`,
    loadingDetailCount: 1,
    imageBase64: tinyPng,
    mimeType: "image/png",
    palletPhotos: img,
  });
  await step("28 Billing review", "/api/billing/review", { houseNumber: house, userId: actor, status: "Reviewed", note: "SIT UAT billing docs ready" });
  const draft = await step("29 Generate invoice", "/api/billing/generate", { houseNumber: house, userId: actor });
  await step("30 Send billing email/queue", "/api/billing/send-email", { invoiceId: draft.bill.id, userId: actor, emailFiles: img });
  await step("31 Mark billed", "/api/billing/mark-billed", { invoiceId: draft.bill.id, userId: actor });
  await step("32 HR leave request", "/api/hr/leave", {
    employeeId: driver,
    requesterId: actor,
    type: "other",
    part: "pm",
    startDate: today,
    endDate: today,
    reason: `SIT UAT leave request ${house}`,
  });

  let attendanceStatus = "skipped";
  try {
    const att = await call("/api/attendance/checkin", {
      userId: "u_driver_03",
      photo: tinyPng,
      gpsLat: "13.6900",
      gpsLon: "100.7501",
      zone: "WH3",
      jobType: "SIT UAT",
      simulation: false,
    });
    steps.push({ name: "33 Attendance check-in", ok: true, status: att.record?.status, id: att.record?.id });
    const out = await call("/api/attendance/checkout", {
      userId: "u_driver_03",
      photo: tinyPng,
      gpsLat: "13.6900",
      gpsLon: "100.7501",
    });
    steps.push({ name: "34 Attendance check-out", ok: true, status: out.record?.status, id: out.record?.id });
    attendanceStatus = out.record?.id || "done";
  } catch (error) {
    steps.push({ name: "33 Attendance check-in/out", ok: false, status: String(error.message).slice(0, 200) });
    attendanceStatus = `blocked: ${error.message}`;
  }

  const boot = await call("/api/bootstrap", {}, "GET");
  const finalJob = boot.dashboard.jobs.find(job => job.houseNumber === house);
  const result = { house, flight, invoiceId: steps.find(s => s.name === "29 Generate invoice")?.id || "", attendanceStatus, finalJob, steps };
  const outFile = path.join(outDir, `uat-full-loop-${house}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ outFile, ...result }, null, 2));
}

main().catch(error => {
  const failed = { house, flight, error: error.message, data: error.data, steps };
  const outFile = path.join(outDir, `uat-full-loop-${house}-failed.json`);
  fs.writeFileSync(outFile, JSON.stringify(failed, null, 2), "utf8");
  console.error(JSON.stringify({ outFile, ...failed }, null, 2));
  process.exit(1);
});
