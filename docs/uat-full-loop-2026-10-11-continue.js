const fs = require("fs");
const path = require("path");

const BASE = "https://scd-transport.onrender.com";
const outDir = path.join(__dirname, "screenshots-2026-10-11");
const house = "SIT-UAT-20261011-70999";
const flight = "SIT0999/11";
const today = "2026-10-11";
const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lD6G2QAAAABJRU5ErkJggg==";
const img = [{ base64: tinyPng, mimeType: "image/png" }];
const actor = "u_admin_01";
const driver = "u_driver_01";
const steps = [];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function call(pathname, payload = {}, method = "POST", retry = 2) {
  const init = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (method !== "GET") init.body = JSON.stringify(payload);
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${BASE}${pathname}`, { ...init, signal: controller.signal });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 500) };
      }
      if (!response.ok) throw new Error(`${pathname}: ${data.error || data.raw || response.status}`);
      return data;
    } catch (error) {
      if (attempt === retry) throw error;
      await delay(3000 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
}

async function step(name, pathname, payload) {
  const data = await call(pathname, payload);
  const entry = {
    name,
    ok: true,
    status: data.job?.status || data.jobs?.[0]?.status || data.bill?.status || data.request?.status || data.record?.status || "",
    id: data.bill?.id || data.request?.id || data.record?.id || "",
  };
  steps.push(entry);
  console.log(`${entry.name}: ${entry.status || entry.id || "ok"}`);
  return data;
}

async function main() {
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
  try {
    const att = await step("33 Attendance check-in", "/api/attendance/checkin", {
      userId: "u_driver_03",
      photo: tinyPng,
      gpsLat: "13.6900",
      gpsLon: "100.7501",
      zone: "WH3",
      jobType: "SIT UAT",
      simulation: false,
    });
    await step("34 Attendance check-out", "/api/attendance/checkout", {
      userId: "u_driver_03",
      photo: tinyPng,
      gpsLat: "13.6900",
      gpsLon: "100.7501",
    });
  } catch (error) {
    steps.push({ name: "33 Attendance check-in/out", ok: false, status: error.message });
    console.error(`Attendance blocked: ${error.message}`);
  }
  const boot = await call("/api/bootstrap", {}, "GET");
  const finalJob = boot.dashboard.jobs.find(job => job.houseNumber === house);
  const result = { house, flight, invoiceId: steps.find(s => s.name === "29 Generate invoice")?.id || "", finalJob, steps };
  const outFile = path.join(outDir, `uat-full-loop-${house}-completed.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ outFile, house, flight, invoiceId: result.invoiceId, finalStatus: finalJob?.status, steps }, null, 2));
}

main().catch(error => {
  const failed = { house, flight, error: error.message, steps };
  const outFile = path.join(outDir, `uat-full-loop-${house}-continue-failed.json`);
  fs.writeFileSync(outFile, JSON.stringify(failed, null, 2), "utf8");
  console.error(JSON.stringify({ outFile, ...failed }, null, 2));
  process.exit(1);
});
