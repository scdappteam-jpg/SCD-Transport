const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const PORT = Number(process.env.PORT || 3000);
const TZ = "Asia/Bangkok";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(ROOT, "storage");
const INVOICE_DIR = path.join(STORAGE_DIR, "invoices");
const DB_FILE = path.join(DATA_DIR, "db.json");
const IMPORT_FEED_DIR = process.env.IMPORT_FEED_DIR || path.join(DATA_DIR, "import-feed");
const IMPORT_INTERVAL_MS = Number(process.env.IMPORT_INTERVAL_MS || 2 * 60 * 60 * 1000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function ensureRuntimeFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.mkdirSync(INVOICE_DIR, { recursive: true });
  fs.mkdirSync(IMPORT_FEED_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const bundledDb = path.join(ROOT, "data", "db.json");
    if (path.resolve(bundledDb) !== path.resolve(DB_FILE) && fs.existsSync(bundledDb)) {
      fs.copyFileSync(bundledDb, DB_FILE);
      return;
    }
    const now = new Date().toISOString();
    const seed = {
      users: [
        { id: "u_driver_01", role: "Driver", name: "คนขับ A", status: "Active" },
        { id: "u_wh_01", role: "WH_Staff", name: "พนักงาน WH3", status: "Active" },
        { id: "u_wh_leader_01", role: "WH3_TeamLeader", name: "หัวหน้า WH3", status: "Active" },
        { id: "u_transport_01", role: "Team_Transport", name: "ทีม Transport", status: "Active" },
        { id: "u_ei_01", role: "EI_Customer", name: "EI / Customer", status: "Active" },
        { id: "u_checkhouse_01", role: "Check_House", name: "Check House", status: "Active" },
        { id: "u_terminal_01", role: "Terminal", name: "Terminal Lead", status: "Active" },
        { id: "u_billing_01", role: "Billing", name: "บัญชี", status: "Active" },
        { id: "u_admin_01", role: "Admin", name: "Admin / แอดมิน", status: "Active" },
        { id: "u_cs_01", role: "CS", name: "CS / ลูกค้าสัมพันธ์", status: "Active" },
        { id: "u_exec_01", role: "Executive", name: "ผู้บริหาร", status: "Active" }
      ],
      customers: [
        {
          id: "c_wd",
          name: "WD Export Co., Ltd.",
          taxId: "0105559000001",
          billingEmail: "billing@example.com",
          creditTerm: 30
        },
        {
          id: "c_general",
          name: "General Air Cargo",
          taxId: "0105559000002",
          billingEmail: "finance@example.com",
          creditTerm: 15
        }
      ],
      locations: [
        { id: "A-01", status: "Available", currentHouseId: "" },
        { id: "A-02", status: "Available", currentHouseId: "" },
        { id: "B-01", status: "Occupied", currentHouseId: "H-1002" }
      ],
      jobs: [
        {
          id: "JOB-1001",
          houseNumber: "H-1001",
          customerId: "c_wd",
          customerName: "WD Export Co., Ltd.",
          flightNo: "TG640",
          flightTime: addHoursIso(7),
          status: "Pending",
          driverId: "u_driver_01",
          routeType: "WH3",
          productType: "Lithium",
          requiresLithiumDocs: true,
          xrayStatus: "Pending",
          loadingDetailUploaded: false,
          readyForBilling: false,
          amount: 12500,
          createdAt: now,
          updatedAt: now
        },
        {
          id: "JOB-1002",
          houseNumber: "H-1002",
          customerId: "c_general",
          customerName: "General Air Cargo",
          flightNo: "BFS210",
          flightTime: addHoursIso(3),
          status: "Inbound",
          driverId: "u_driver_01",
          routeType: "CrossDock",
          productType: "General",
          requiresLithiumDocs: false,
          xrayStatus: "Passed",
          loadingDetailUploaded: false,
          readyForBilling: false,
          amount: 8300,
          createdAt: now,
          updatedAt: now
        }
      ],
      activityLogs: [],
      attachments: [],
      alerts: [],
      billing: []
    };
    writeDb(seed);
  }
}

function addHoursIso(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function ensureDbShape(db) {
  db.jobs          ||= [];
  db.billing       ||= [];
  db.loadPlans     ||= [];
  db.locations     ||= [];
  db.activityLogs  ||= [];
  db.attachments   ||= [];
  db.importChanges ||= [];
  db.importHistory ||= [];
  db.alerts        ||= [];
  db.customers     ||= [];
  db.attendance    ||= [];
  db.taskGroups    ||= [];
  db.notifications ||= [];
  db.warehouseMaps ||= [];
  db.warehouseProfiles ||= [];
  db.integrations  ||= {};
  for (const job of db.jobs) {
    if (!job.approvalStatus || job.mustReturnWh3 !== true || job.doorClosedPhotoRequired !== true) {
      deriveApprovalFields(db, job, { skipUpdatedAt: true });
    }
  }
}

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    ensureCoreUsers(db);
    ensureDbShape(db);
    return db;
  } catch (err) {
    console.error("[readDb] db.json parse error — returning empty DB:", err.message);
    const empty = { users: [], customers: [], jobs: [], locations: [], activityLogs: [], attachments: [], alerts: [], billing: [], integrations: {}, importChanges: [], warehouseMaps: [], warehouseProfiles: [], attendance: [], taskGroups: [], notifications: [] };
    ensureCoreUsers(empty);
    ensureDbShape(empty);
    return empty;
  }
}

function writeDb(db) {
  try {
    // Sanitize strings to remove unpaired surrogates / bad Unicode before serializing
    const content = JSON.stringify(db, (k, v) =>
      typeof v === "string" ? v.replace(/[\uFFFD\uFFFE\uFFFF]/g, "") : v
    );
    // Atomic write: write to .tmp first, then rename (prevents partial-write corruption)
    const tmpFile = DB_FILE + ".tmp";
    fs.writeFileSync(tmpFile, content, "utf8");
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error("[writeDb] failed to write db.json:", err.message);
  }
}

function ensureCoreUsers(db) {
  db.users ||= [];
  const defaults = [
    { id: "u_driver_01", role: "Driver", name: "Driver A / คนขับ A", vehiclePlate: "70-1234", status: "Active" },
    { id: "u_driver_02", role: "Driver", name: "Driver B / คนขับ B", vehiclePlate: "71-2234", status: "Active" },
    { id: "u_driver_03", role: "Driver", name: "Driver C / คนขับ C", vehiclePlate: "72-3345", status: "Active" },
    { id: "u_wh_leader_01", role: "WH3_TeamLeader", name: "หัวหน้า WH3 / WH3 Team Leader", status: "Active" },
    { id: "u_transport_01", role: "Team_Transport", name: "ทีม Transport / Team Transport", status: "Active" },
    { id: "u_ei_01", role: "EI_Customer", name: "EI / Customer", status: "Active" },
    { id: "u_checkhouse_01", role: "Check_House", name: "Check House / Terminal Staff", status: "Active" },
    { id: "u_admin_01", role: "Admin", name: "Admin / แอดมิน", status: "Active" }
  ];
  for (const user of defaults) {
    const found = db.users.find(item => item.id === user.id);
    if (found) {
      Object.assign(found, { ...user, ...found, vehiclePlate: found.vehiclePlate || user.vehiclePlate || "" });
    } else {
      db.users.push(user);
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 20 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function formatBangkok(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short"
  }).format(d);
}

function bangkokDate(iso = nowIso()) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

const LOAD_PLAN_ROUNDS = ["08:00", "12:00", "16:00"];
const TERMINAL_PROFILES = {
  TG: {
    label: "TG",
    note: "TG flow: booking, plate/bay confirm, original documents, weighing, dimension, X-Ray, Re-X-Ray, loading.",
    statuses: ["BookingRequested", "TerminalConfirmed", "VehicleQueued", "Arrived", "UnloadingStarted", "UnloadingCompleted"],
    checklist: ["outbound_weighing_slip", "security_original", "airline_specific", "permit"],
    slaMinutes: 180
  },
  TGINT: {
    label: "TG Inter",
    note: "TG Inter requires tighter document tracking and frequent Re-X-Ray monitoring.",
    statuses: ["BookingRequested", "TerminalConfirmed", "VehicleQueued", "Arrived", "UnloadingStarted", "UnloadingCompleted"],
    checklist: ["outbound_weighing_slip", "security_original", "airline_specific", "permit"],
    slaMinutes: 180
  },
  BFS: {
    label: "BFS",
    note: "BFS focus: queue risk, narrow trailer parking, short unloading target, and grouping same-product multi-vehicle jobs.",
    statuses: ["BookingRequested", "TerminalConfirmed", "VehicleQueued", "Arrived", "UnloadingStarted", "UnloadingCompleted"],
    checklist: ["outbound_weighing_slip", "security_original", "airline_specific", "permit", "bfs_grouping_checked"],
    slaMinutes: 30
  }
};

function normalizeTerminal(value) {
  const text = String(value || "").trim().toUpperCase().replace(/[\s_-]/g, "");
  if (text === "TGINTER" || text === "TGINTERNATIONAL") return "TGINT";
  if (text === "BFS") return "BFS";
  return "TG";
}

function planVersionLabel(plan = {}) {
  return [plan.flightDate || plan.workDate || "", plan.planRound || "", plan.id || ""].filter(Boolean).join(" / ");
}

function normalizePlanRound(value, importedAt = nowIso()) {
  const text = String(value || "").trim();
  const matched = LOAD_PLAN_ROUNDS.find(round => text.startsWith(round.slice(0, 2)) || text === round);
  if (matched) return matched;
  const hour = bangkokHour(importedAt);
  if (hour < 12) return "08:00";
  if (hour < 16) return "12:00";
  return "16:00";
}

function bangkokHour(iso = nowIso()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso)));
}

function jobWorkDate(job = {}) {
  return job.workDate || job.pickupDate || bangkokDate(job.readyTime || job.flightTime || job.createdAt || nowIso());
}

function latestPlanForDate(db, workDate) {
  const plans = (db.loadPlans || []).filter(plan => plan.flightDate === workDate);
  return plans[plans.length - 1] || null;
}

function jobInPlan(plan, houseNumber) {
  return Boolean(plan?.rows?.some(row => row.houseNumber === houseNumber));
}

function deriveApprovalFields(db, job, payload = {}) {
  const now = nowIso();
  const workDate = payload.workDate || payload.pickupDate || jobWorkDate(job);
  const latestPlan = latestPlanForDate(db, workDate);
  const inPlan = Boolean(payload.planMatched ?? jobInPlan(latestPlan, job.houseNumber));
  const planRound = payload.planRound || (inPlan ? latestPlan?.planRound : job.planRound) || "";
  const manualSource = payload.planSource || payload.sourceChannel || job.planSource || "ManualExtra";
  const isManualExtra = !inPlan && (payload.manualExtra === true || manualSource !== "LoadPlan");
  const afterFinalRound = !inPlan && (payload.afterFinalRound === true || planRound === "After16" || planRound === "หลัง 16:00" || bangkokHour(payload.createdAt || job.createdAt || now) >= 16);
  const csConfirmed = inPlan ? true : Boolean(payload.csConfirmed ?? job.csConfirmed);

  Object.assign(job, {
    workDate,
    planDate: workDate,
    planRound: inPlan ? (planRound || "08:00") : (planRound || job.planRound || "Manual"),
    planSource: inPlan ? "LoadPlan" : manualSource,
    planMatched: inPlan,
    manualExtra: isManualExtra,
    afterFinalRound,
    csConfirmed,
    approvalStatus: inPlan ? "ConfirmedByPlan" : (csConfirmed ? "CSApproved" : "PendingCSApproval"),
    csApprovalRequired: !inPlan && !csConfirmed,
    evidenceRequired: !inPlan && !csConfirmed,
    evidenceChannel: payload.evidenceChannel || job.evidenceChannel || (isManualExtra ? "Line/Email" : ""),
    evidenceNote: payload.evidenceNote || job.evidenceNote || "",
    mustReturnWh3: true,
    routePolicy: "ReturnWH3BeforeTerminal",
    doorClosedPhotoRequired: true,
    updatedAt: payload.skipUpdatedAt ? job.updatedAt : now
  });
}

function applyPlanConfirmation(db, plan, importedBy = "LoadPlan") {
  const now = nowIso();
  let confirmed = 0;
  for (const row of plan.rows || []) {
    const job = findJob(db, row.houseNumber);
    if (!job) continue;
    const wasPendingManual = job.manualExtra && !job.csConfirmed;
    deriveApprovalFields(db, job, {
      planMatched: true,
      planRound: plan.planRound,
      pickupDate: plan.flightDate,
      planSource: "LoadPlan"
    });
    job.csConfirmedBy = importedBy || "LoadPlan";
    job.csConfirmedAt = job.csConfirmedAt || now;
    job.confirmedByPlanAt = now;
    job.confirmedByPlanId = plan.id;
    if (wasPendingManual) job.manualExtraResolvedByPlan = true;
    job.approvalTrail ||= [];
    job.approvalTrail.push({
      at: now,
      type: wasPendingManual ? "ManualExtraResolvedByPlan" : "ConfirmedByPlan",
      by: importedBy || "LoadPlan",
      from: wasPendingManual ? "PendingCSApproval" : job.approvalStatus,
      to: "ConfirmedByPlan",
      planId: plan.id || "",
      planRound: plan.planRound || "",
      planVersion: planVersionLabel(plan)
    });
    confirmed += 1;
  }
  return confirmed;
}

function normalizeJob(job) {
  const flightMs = new Date(job.flightTime).getTime();
  const hoursToFlight = isNaN(flightMs) ? null : Math.round(((flightMs - Date.now()) / 36e5) * 10) / 10;
  const loadingDone = Boolean(job.loadingDetailUploaded);
  return {
    ...job,
    flightTimeLabel: formatBangkok(job.flightTime),
    hoursToFlight,
    redFlag: hoursToFlight !== null && hoursToFlight < 4 && !loadingDone,
    canUploadLoadingDetail: false
  };
}

function buildDashboard(db) {
  // Ensure all required arrays exist (defensive — older db.json may lack these)
  db.billing       ||= [];
  db.loadPlans     ||= [];
  db.locations     ||= [];
  db.activityLogs  ||= [];
  db.attachments   ||= [];
  db.importChanges ||= [];
  db.importHistory ||= [];
  db.alerts        ||= [];
  db.customers     ||= [];
  const jobs = (db.jobs || []).map(job => normalizeJob(job));
  const byFlight = new Map();
  for (const job of jobs) {
    if (!byFlight.has(job.flightNo)) byFlight.set(job.flightNo, []);
    byFlight.get(job.flightNo).push(job);
  }
  for (const group of byFlight.values()) {
    const canUpload = group.every(job => job.xrayStatus === "Passed");
    for (const job of group) job.canUploadLoadingDetail = canUpload;
  }
  const openJobs = jobs.filter(job => job.status !== "Billed").length;
  const readyForBilling = jobs.filter(job => job.readyForBilling).length;
  const billedAmount = db.billing.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const pendingAmount = jobs
    .filter(job => job.readyForBilling)
    .reduce((sum, job) => sum + Number(job.amount || 0), 0);
  const averageDurationMinutes = averageCompletedDuration(db.activityLogs);
  const planToday = bangkokDate();
  const currentPlan = latestPlanForDate(db, planToday);
  const approvalSummary = {
    inPlan: jobs.filter(job => job.planMatched || job.approvalStatus === "ConfirmedByPlan").length,
    manualExtra: jobs.filter(job => job.manualExtra).length,
    pendingCs: jobs.filter(job => job.approvalStatus === "PendingCSApproval" || job.csApprovalRequired).length,
    evidenceRequired: jobs.filter(job => job.evidenceRequired).length,
    csApproved: jobs.filter(job => job.approvalStatus === "CSApproved").length,
    afterFinalRound: jobs.filter(job => job.afterFinalRound).length,
    mustReturnWh3: jobs.filter(job => job.mustReturnWh3).length,
    missingDoorPhoto: jobs.filter(job => job.doorClosedPhotoRequired && !job.doorClosedPhotoAt && ["CargoLoaded", "Delivered"].includes(job.status)).length,
    paused: jobs.filter(job => job.kpiPaused).length,
    latestPlanRound: currentPlan?.planRound || "",
    latestPlanRows: currentPlan?.totalRows || 0
  };
  const terminalJobs = jobs.filter(job => job.terminalDestination || ["TG", "TGINT", "BFS"].includes(normalizeTerminal(job.destination || job.routeType)));
  const terminalSummary = Object.keys(TERMINAL_PROFILES).map(key => {
    const rows = terminalJobs.filter(job => normalizeTerminal(job.terminalDestination || job.destination || job.routeType) === key);
    return {
      key,
      label: TERMINAL_PROFILES[key].label,
      total: rows.length,
      bookingRequested: rows.filter(job => job.terminalWorkflowStatus === "BookingRequested" || job.aotBookedAt).length,
      terminalConfirmed: rows.filter(job => job.terminalWorkflowStatus === "TerminalConfirmed" || job.aotApprovedAt).length,
      queued: rows.filter(job => job.terminalWorkflowStatus === "VehicleQueued").length,
      arrived: rows.filter(job => job.terminalWorkflowStatus === "Arrived" || job.terminalArrivedAt).length,
      unloading: rows.filter(job => job.terminalWorkflowStatus === "UnloadingStarted").length,
      completed: rows.filter(job => job.terminalWorkflowStatus === "UnloadingCompleted" || job.loadingDetailUploaded).length,
      slaMinutes: TERMINAL_PROFILES[key].slaMinutes,
      risks: rows.filter(job => job.terminalRiskFlag || (key === "BFS" && job.terminalWorkflowStatus === "VehicleQueued")).length
    };
  });
  return {
    jobs,
    locations: db.locations,
    billing: db.billing.slice(-20).reverse(),
    attachments: db.attachments.slice(-30).reverse(),
    importChanges: (db.importChanges || []).slice(-50).reverse(),
    importHistory: (db.importHistory || []).slice(-5).reverse(),
    alerts: (db.alerts || []).slice(-20).reverse(),
    staffStats: buildStaffStats(db),
    metrics: {
      openJobs,
      readyForBilling,
      billedAmount,
      pendingAmount,
      averageDurationMinutes,
      approvalSummary,
      terminalSummary
    }
  };
}

function buildStaffStats(db) {
  const finishedStatuses = new Set(["Delivered", "Stored", "ReadyForTerminal", "TerminalArrived", "ReadyForBilling", "InvoiceSent", "Billed"]);
  return (db.users || []).map(user => {
    const logRows = (db.activityLogs || []).filter(log => log.userId === user.id);
    const houses = new Set(logRows.map(log => log.houseNumber).filter(Boolean));
    if (user.role === "Driver") {
      db.jobs.filter(job => job.driverId === user.id).forEach(job => houses.add(job.houseNumber));
    }
    const jobs = [...houses].map(house => findJob(db, house)).filter(Boolean);
    const completed = jobs.filter(job => finishedStatuses.has(job.status)).length;
    const errors = logRows.filter(log => /Error|Hold|Rescan|Re-XRay/i.test(log.activityType || "")).length;
    const durations = logRows
      .filter(log => log.startTime && log.endTime)
      .map(log => (new Date(log.endTime) - new Date(log.startTime)) / 60000)
      .filter(value => Number.isFinite(value) && value >= 0);
    const averageDurationMinutes = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
    const completionRate = jobs.length ? completed / jobs.length : 0;
    const errorRate = logRows.length ? errors / logRows.length : 0;
    const kpi = jobs.length ? Math.max(0, Math.min(100, Math.round(completionRate * 80 + (1 - errorRate) * 20))) : 0;
    return { userId: user.id, totalJobs: jobs.length, completedJobs: completed, errors, averageDurationMinutes, kpi };
  });
}

function averageCompletedDuration(logs) {
  const durations = logs
    .filter(log => log.startTime && log.endTime)
    .map(log => (new Date(log.endTime) - new Date(log.startTime)) / 60000)
    .filter(value => Number.isFinite(value) && value >= 0);
  if (!durations.length) return 0;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

function findJob(db, houseNumber) {
  return db.jobs.find(job => job.houseNumber === houseNumber || job.id === houseNumber);
}

function findPayloadJobs(db, payload) {
  const houses = Array.isArray(payload.houseNumbers) && payload.houseNumbers.length
    ? payload.houseNumbers
    : [payload.houseNumber];
  const jobs = houses.map(house => findJob(db, house)).filter(Boolean);
  return jobs.length ? jobs : [];
}

function upsertJob(db, payload) {
  const houseNumber = String(payload.houseNumber || "").trim();
  if (!houseNumber) throw new Error("House number is required");
  
  const customer = payload.customerName
    ? getOrCreateCustomer(db, payload.customerName, payload)
    : db.customers.find(item => item.id === payload.customerId) || db.customers[0];
    
  const now = nowIso();
  let job = findJob(db, houseNumber);
  if (!job) {
    job = { id: payload.jobId || `JOB-${Date.now()}`, houseNumber, createdAt: now };
    db.jobs.push(job);
  }

  Object.assign(job, {
    customerId: customer.id,
    customerName: customer.name,
    flightNo: payload.flightNo || job.flightNo || "TBC",
    flightTime: payload.flightTime || job.flightTime || addHoursIso(8),
    status: payload.status || job.status || "Pending",
    driverId: payload.driverId ?? job.driverId ?? "",
    
    // --- ฟิลด์ใหม่ตามฟอร์มจริง ---
    booking: payload.booking || job.booking || "", // จำนวนที่จอง (จาก CSV)
    actualCount: payload.actualCount || job.actualCount || "", // จำนวนรับจริง
    invoiceNo: payload.invoiceNo || job.invoiceNo || "",
    contact: payload.contact || job.contact || "",
    tel: payload.tel || job.tel || "",
    shippingDoc: payload.shippingDoc || job.shippingDoc || "", // YES/NO
    pickupLocation: payload.pickupLocation || job.pickupLocation || "",
    pickupDate: payload.pickupDate || job.pickupDate || "",
    workDate: payload.workDate || payload.pickupDate || job.workDate || job.pickupDate || "",
    csConfirmed: payload.csConfirmed ?? job.csConfirmed ?? false,
    planRound: payload.planRound || job.planRound || "",
    planSource: payload.planSource || payload.sourceChannel || job.planSource || "",
    approvalStatus: payload.approvalStatus || job.approvalStatus || "",
    evidenceChannel: payload.evidenceChannel || job.evidenceChannel || "",
    evidenceNote: payload.evidenceNote || job.evidenceNote || "",
    evidenceRequired: Boolean(payload.evidenceRequired ?? job.evidenceRequired),
    manualExtra: Boolean(payload.manualExtra ?? job.manualExtra),
    afterFinalRound: Boolean(payload.afterFinalRound ?? job.afterFinalRound),
    driverType: payload.driverType || job.driverType || "",
    subcontractorRate: payload.subcontractorRate ?? job.subcontractorRate ?? "",
    terminalDestination: payload.terminalDestination || job.terminalDestination || "",
    terminalWorkflowStatus: payload.terminalWorkflowStatus || job.terminalWorkflowStatus || "",
    terminalWorkflowEvents: Array.isArray(job.terminalWorkflowEvents) ? job.terminalWorkflowEvents : [],
    wh3PreDispatchChecklist: Array.isArray(payload.wh3PreDispatchChecklist) ? payload.wh3PreDispatchChecklist : (Array.isArray(job.wh3PreDispatchChecklist) ? job.wh3PreDispatchChecklist : []),
    wh3PreDispatchReady: Boolean(payload.wh3PreDispatchReady ?? job.wh3PreDispatchReady),
    wh3PreDispatchNote: payload.wh3PreDispatchNote || job.wh3PreDispatchNote || "",
    productType: payload.productType || job.productType || ((payload.isLithium ?? job.isLithium) ? "Lithium" : "General"),
    amount: payload.amount ?? job.amount ?? "",
    readyForBilling: Boolean(payload.readyForBilling ?? job.readyForBilling),
    vehicleType: payload.vehicleType || job.vehicleType || "",
    destination: payload.destination || job.destination || "WH3",
    pieceCount: payload.pieceCount || job.pieceCount || "",
    pickupItems: normalizePickupItems(payload.pickupItems || job.pickupItems || ""),
    
    destAirport: payload.destAirport || job.destAirport || "",
    consigneeName: payload.consigneeName || job.consigneeName || "",
    mawbNumber: payload.mawbNumber || job.mawbNumber || "",
    icNumber: payload.icNumber || job.icNumber || "",
    packageType: payload.packageType || job.packageType || "",
    weight: payload.weight ?? job.weight ?? "",
    volWeight: payload.volWeight ?? job.volWeight ?? "",
    cbm: payload.cbm ?? job.cbm ?? "",
    cargoType: payload.cargoType || job.cargoType || "normal",
    isLithium: Boolean(payload.isLithium ?? job.isLithium),
    requiresLithiumDocs: Boolean(payload.isLithium ?? job.requiresLithiumDocs),
    dgType: payload.dgType || job.dgType || "",
    cargoDesc: payload.cargoDesc || job.cargoDesc || "",
    edocCin: payload.edocCin ?? job.edocCin ?? "",
    edocInv: payload.edocInv ?? job.edocInv ?? "",
    readyTime: payload.readyTime || job.readyTime || "",
    closeTime: payload.closeTime || job.closeTime || "",
    pickupPhone: payload.pickupPhone || job.pickupPhone || "",
    contactPerson: payload.contactPerson || job.contactPerson || "",
    carrier: payload.carrier || job.carrier || "",
    ownerCode: payload.ownerCode || job.ownerCode || "",
    refsNo: payload.refsNo || job.refsNo || "",
    source: payload.source || job.source || "",
    adminPrepared: Boolean(payload.adminPrepared || job.adminPrepared),
    updatedAt: now
  });
  deriveApprovalFields(db, job, payload);
  return job;
}

function getOrCreateCustomer(db, name, payload = {}) {
  const cleanName = String(name || "").trim() || "Unknown Customer";
  const found = db.customers.find(customer => customer.name.toLowerCase() === cleanName.toLowerCase());
  if (found) return found;
  const idBase = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28) || "customer";
  let id = `c_${idBase}`;
  let counter = 2;
  while (db.customers.some(customer => customer.id === id)) {
    id = `c_${idBase}_${counter++}`;
  }
  const customer = {
    id,
    name: cleanName,
    taxId: "",
    billingEmail: "",
    creditTerm: 0,
    phone: payload.pickupPhone || "",
    contactPerson: payload.contactPerson || "",
    address: payload.pickupLocation || ""
  };
  db.customers.push(customer);
  return customer;
}

function normalizePickupItems(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [houseNumber, dest, carton, pickupDate, route, booking, invoiceNo, contact, tel] = line.split(",").map(cell => cell.trim());
      return {
        houseNumber,
        dest: dest || "",
        destination: dest || "",
        carton: carton || "",
        pickupDate: pickupDate || "",
        route: route || "",
        routeType: route || "",
        booking: booking || "",
        bookingNo: booking || "",
        invoiceNo: invoiceNo || "",
        contact: contact || "",
        tel: tel || ""
      };
    });
}

function parseCsvRows(csvText) {
  return String(csvText || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(",").map(cell => cell.trim()));
}

function parseCsvTable(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const text = String(csvText || "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map(header => String(header || "").replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map(values => {
    const record = {};
    headers.forEach((header, index) => record[header] = String(values[index] || "").trim());
    return record;
  });
}

function parseScdDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return "";
  const [, dd, mm, yy, hh = "00", min = "00"] = match;
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  return new Date(`${year}-${mm}-${dd}T${hh}:${min}:00+07:00`).toISOString();
}

function csvCell(row, ...names) {
  for (const name of names) {
    const exact = row[name];
    if (exact !== undefined && exact !== null && String(exact).trim() !== "") return String(exact).trim();
    const normalizedName = String(name).toLowerCase().replace(/[\s_-]+/g, "");
    const foundKey = Object.keys(row).find(key => key.toLowerCase().replace(/[\s_-]+/g, "") === normalizedName);
    if (foundKey) {
      const value = row[foundKey];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
  }
  return "";
}

function isScdWorkRow(row) {
  const onhand = csvCell(row, "ONHAND", "ON_HAND", "House Number", "house_number");
  if (!onhand || /^\d{2}\.\d{2}\.\d{2}$/.test(onhand)) return false;
  return Boolean(csvCell(row, "PICKUP", "CUSTOMER", "CUSTOMER_NAME") || csvCell(row, "HAWB", "HOUSE_NUMBER") || csvCell(row, "DEST", "DESTINATION_CITY"));
}

function importScdRows(db, csvText) {
  const sourceRecords = parseCsvTable(csvText).filter(isScdWorkRow);
  const recordMap = new Map();
  let duplicateRows = 0;
  for (const row of sourceRecords) {
    const hawb = csvCell(row, "HAWB", "HOUSE_NUMBER", "House Number", "house_number");
    const onhand = csvCell(row, "ONHAND", "ON_HAND", "Onhand");
    const houseNumber = hawb && hawb.toUpperCase() !== "AIR" ? hawb : onhand;
    const key = houseNumber.toUpperCase();
    if (!key) continue;
    if (recordMap.has(key)) duplicateRows += 1;
    recordMap.set(key, row);
  }
  const records = [...recordMap.values()];
  const imported = [];
  const changes = [];
  let newJobs = 0;
  let changedJobs = 0;
  let unchangedJobs = 0;
  let notIssuedCount = 0;
  for (const row of records) {
    const pick = (...names) => {
      for (const name of names) {
        const value = row[name];
        if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
        const normalizedName = String(name).toLowerCase().replace(/[\s_-]+/g, "");
        const foundKey = Object.keys(row).find(key => key.toLowerCase().replace(/[\s_-]+/g, "") === normalizedName);
        if (foundKey) {
          const foundValue = row[foundKey];
          if (foundValue !== undefined && foundValue !== null && String(foundValue).trim() !== "") return String(foundValue).trim();
        }
      }
      return "";
    };

    const hawb = pick("HAWB", "HOUSE_NUMBER", "House Number", "house_number");
    const onhand = pick("ONHAND", "ON_HAND", "Onhand");
    const houseNumber = hawb && hawb.toUpperCase() !== "AIR" ? hawb : onhand;
    const dest = pick("DEST", "Dest", "DESTINATION_CITY", "Destination City");
    const qty = pick("QTY", "Qty", "AMOUNT", "Amount", "CARTON", "Carton");
    const customerName = pick("PICKUP", "Pickup", "CUSTOMER", "Customer", "CUSTOMER_NAME", "Customer Name");
    const route = pick("ROUTE", "Route", "TERMINAL", "Terminal", "DESTINATION_ROUTE", "LOAD_TO") || "WH3";
    
    // --- ปรับปรุงการดึงข้อมูลเพิ่มจาก CSV ---
    const booking = pick("BOOKING", "Booking", "BOOKING_NO", "Booking No", "BK", "BookingNo");
    const invoiceNo = pick("INVOICE", "INVOICE_NO", "Invoice No", "INVOICE NO", "INV", "Invoice");
    const contact = pick("CONTACT_PERSON", "CONTACT", "Contact", "Contact Person");
    const tel = pick("PHONE", "TEL", "Tel", "Telephone", "MOBILE", "PHONE_NO");
    
    const readyTime = parseScdDate(row.READY);
    const closeTime = parseScdDate(row.CLOSE);
    const existing = findJob(db, houseNumber);
    const changeSet = [];
    if (!existing) {
      changeSet.push("NEW_JOB");
      newJobs += 1;
    } else {
      if ((existing.destAirport || "").trim() !== dest) changeSet.push("DEST_CHANGED");
      if ((existing.closeTime || existing.flightTime || "") !== (closeTime || readyTime || existing.flightTime || "")) changeSet.push("FLIGHT_TIME_CHANGED");
      if (String(existing.pieceCount || "") !== qty) changeSet.push("QTY_CHANGED");
      if ((existing.customerName || "").trim() !== customerName) changeSet.push("CUSTOMER_CHANGED");
      if (changeSet.length) changedJobs += 1;
      else unchangedJobs += 1;
    }

    const job = upsertJob(db, {
      jobId: onhand,
      houseNumber,
      onhand,
      customerName,
      destAirport: dest,
      pickupDate: readyTime ? readyTime.slice(0, 10) : "",
      pickupLocation: row.Address,
      
      // ส่งค่าข้อมูลการติดต่อและเลขที่เอกสารเข้า upsertJob
      pickupPhone: tel || row.PHONE, 
      contactPerson: contact || row.CONTACT_PERSON,
      contact: contact, // ฟิลด์สำหรับ Cargo Form
      tel: tel,         // ฟิลด์สำหรับ Cargo Form
      booking: booking, // จำนวนที่จอง (Booking)
      invoiceNo: invoiceNo,
      
      owner: row.OWNER,
      carrier: row.CARRIER,
      pieceCount: qty, // จำนวนหีบห่อ (Actual / QTY)
      
      // ปรับปรุง pickupItems ให้มีข้อมูลครบถ้วนสำหรับตารางใน Cargo Form
      pickupItems: `${houseNumber},${dest || ""},${qty},${readyTime ? readyTime.slice(0, 10) : ""},${route},${booking},${invoiceNo},${contact},${tel}`,
      
      packageType: "Carton",
      destination: route,
      routeType: route,
      flightNo: dest || "TBC",
      flightTime: closeTime || readyTime || addHoursIso(8),
      readyTime,
      closeTime,
      weight: row.WEIGHT,
      refs: row["REFS#"],
      status: existing?.status || "Pending",
      cargoFormMode: existing?.cargoFormMode || "AdminPrepared",
      adminPrepared: existing ? Boolean(existing.adminPrepared) : true,
      csConfirmed: existing ? (existing.csConfirmed ?? false) : false,
      csConfirmedBy: existing?.csConfirmedBy || null,
      csConfirmedAt: existing?.csConfirmedAt || null,
      csInvoiceNo: existing?.csInvoiceNo || ""
    });

    const notIssued = !job.cargoIssuedAt;
    if (notIssued) notIssuedCount += 1;
    if (changeSet.length || notIssued) {
      const change = {
        id: `CHG-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
        houseNumber: job.houseNumber,
        onhand,
        customerName: job.customerName,
        changes: changeSet,
        notIssued,
        message: buildImportChangeMessage(job, changeSet, notIssued),
        createdAt: nowIso()
      };
      changes.push(change);
    }
    imported.push(job);
  }
  db.importChanges = [...(db.importChanges || []), ...changes].slice(-300);
  return {
    imported,
    changes,
    totalRows: sourceRecords.length,
    uniqueRows: records.length,
    newJobs,
    changedJobs,
    unchangedJobs,
    duplicateRows,
    duplicateJobs: unchangedJobs + duplicateRows,
    notIssued: notIssuedCount
  };
}


// ── Global-Consol Planning CSV (Air Export) ──────────────────────────────────
function unescapeXml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function parseXlsxRows(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 100) throw new Error("empty file");
  let eocd = -1;
  const minTail = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minTail; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not an xlsx (zip) file");
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const csize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const cmtLen = buf.readUInt16LE(ptr + 32);
    const lho = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    entries[name] = { method, csize, lho };
    ptr += 46 + nameLen + extraLen + cmtLen;
  }
  const readEntry = name => {
    const e = entries[name];
    if (!e) return null;
    const nameLen = buf.readUInt16LE(e.lho + 26);
    const extraLen = buf.readUInt16LE(e.lho + 28);
    const start = e.lho + 30 + nameLen + extraLen;
    const data = buf.slice(start, start + e.csize);
    return e.method === 0 ? data.toString("utf8") : zlib.inflateRawSync(data).toString("utf8");
  };
  const shared = [];
  const ssXml = readEntry("xl/sharedStrings.xml");
  if (ssXml) {
    const siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = siRe.exec(ssXml))) {
      const ts = m[1].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
      shared.push(unescapeXml(ts.map(t => t.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, "")).join("")));
    }
  }
  const sheetFile = Object.keys(entries)
    .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))[0];
  if (!sheetFile) throw new Error("no worksheet found");
  const xml = readEntry(sheetFile);
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = [];
    let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1];
      const inner = cm[2] || "";
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
      const type = (attrs.match(/t="(\w+)"/) || [])[1] || "n";
      let v = null;
      if (type === "inlineStr") {
        const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        v = t ? unescapeXml(t[1]) : "";
      } else {
        const vm = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (vm) {
          if (type === "s") v = shared[Number(vm[1])] ?? "";
          else if (type === "str" || type === "b") v = unescapeXml(vm[1]);
          else v = Number(vm[1]);
        }
      }
      if (ref && v !== null) {
        let ci = 0;
        for (const ch of ref) ci = ci * 26 + (ch.charCodeAt(0) - 64);
        cells[ci - 1] = v;
      }
    }
    rows.push(cells);
  }
  return rows;
}

function xlsxSerialToDate(v) {
  return new Date(Math.round((v - 25569) * 86400000));
}

function xlsxDateStr(v) {
  if (typeof v !== "number" || v < 60) {
    const s = String(v ?? "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const mons = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return Number(m[3]) + "-" + mons[Number(m[2]) - 1] + "-" + m[1].slice(2);
    }
    return s;
  }
  const d = xlsxSerialToDate(v);
  const mons = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return d.getUTCDate() + "-" + mons[d.getUTCMonth()] + "-" + String(d.getUTCFullYear()).slice(2);
}

function xlsxTimeStr(v) {
  if (typeof v !== "number") {
    const m = String(v || "").match(/(\d{1,2}):(\d{2})/);
    return m ? m[1].padStart(2, "0") + ":" + m[2] : "00:00";
  }
  const mins = Math.round((v % 1) * 1440);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

function xlsxUtcIso(v) {
  if (typeof v !== "number" || v < 60) return "";
  return new Date(Math.round((v - 25569) * 86400000) - 7 * 3600000).toISOString();
}

function xlsxNumStr(v) {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v).trim();
}

function detectXlsxKind(rows) {
  for (const r of rows.slice(0, 40)) {
    const labels = Array.from(r, v => String(v == null ? "" : v).trim().toUpperCase());
    if (labels.includes("MAWB") && labels.includes("DEST") && (labels.includes("EDOC_CIN") || labels.includes("GRS WGT"))) return "consol";
    if (labels.includes("ONHAND") && labels.includes("PICKUP")) return "pickup";
  }
  return "";
}

function consolXlsxToCsv(rows) {
  const out = [["IC", "IC", "MAWB"]];
  const csvCell = v => {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  let map = null;
  for (const r of rows) {
    const labels = Array.from(r, v => String(v == null ? "" : v).trim().toUpperCase());
    if (labels.includes("MAWB") && labels.includes("DEST") && (labels.includes("EDOC_CIN") || labels.includes("GRS WGT"))) {
      map = {
        ic: labels.indexOf("IC"), mawb: labels.indexOf("MAWB"), dg: labels.indexOf("DG"),
        flt: labels.indexOf("FLT"), fltDate: labels.indexOf("FLT DATE"), dest: labels.indexOf("DEST"),
        etd: labels.indexOf("ETD"), grs: labels.indexOf("GRS WGT"), vol: labels.indexOf("VOL WGT"),
        cbm: labels.indexOf("CBM"), cin: labels.indexOf("EDOC_CIN"),
        inv: labels.findIndex(l => l.startsWith("EDOC_(")), desc: labels.indexOf("DESC")
      };
      continue;
    }
    if (!map) continue;
    const cell = i => (i >= 0 && r[i] != null ? r[i] : "");
    const S = i => String(cell(i)).trim();
    if (/^total$/i.test(S(map.dest))) continue;
    const cinVal = S(map.cin);
    const dgVal = S(map.dg).toUpperCase();
    const mawbVal = xlsxNumStr(cell(map.mawb));
    const isDetail = cinVal === "\u2713" || cinVal === "\u2717" ||
      (/^(N|L|LN|DG)$/.test(dgVal) && /^[A-Z0-9]{6,}$/i.test(mawbVal));
    if (isDetail) {
      if (!mawbVal || !/^[A-Z0-9-]{6,}$/i.test(mawbVal)) continue;
      out.push([
        "", xlsxDateStr(cell(map.ic)), mawbVal, dgVal || "N", "",
        S(map.flt), S(map.fltDate), S(map.dest),
        xlsxNumStr(cell(map.etd)), S(map.etd + 1), "", "",
        xlsxNumStr(cell(map.grs)), xlsxNumStr(cell(map.vol)), xlsxNumStr(cell(map.cbm)), "",
        cinVal, S(map.inv), S(map.desc)
      ]);
    } else if (mawbVal) {
      const ic = xlsxNumStr(cell(map.ic)) || mawbVal;
      if (!/^[A-Z0-9]/i.test(ic) || /CONSOL|REPORT/i.test(ic)) continue;
      out.push([ic, ic, mawbVal, "", "", S(map.flt), xlsxDateStr(cell(map.fltDate)), S(map.dest), xlsxTimeStr(cell(map.etd))]);
    }
  }
  return out.map(r => r.map(csvCell).join(",")).join("\n");
}

function loadPlanRowsFromXlsx(xrows) {
  const out = [];
  if (detectXlsxKind(xrows) === "consol") {
    let map = null, master = null;
    for (const r of xrows) {
      const labels = Array.from(r, v => String(v == null ? "" : v).trim().toUpperCase());
      if (labels.includes("MAWB") && labels.includes("DEST") && (labels.includes("EDOC_CIN") || labels.includes("GRS WGT"))) {
        map = {
          ic: labels.indexOf("IC"), mawb: labels.indexOf("MAWB"), dg: labels.indexOf("DG"),
          flt: labels.indexOf("FLT"), fltDate: labels.indexOf("FLT DATE"), dest: labels.indexOf("DEST"),
          etd: labels.indexOf("ETD"), grs: labels.indexOf("GRS WGT"), vol: labels.indexOf("VOL WGT"),
          cbm: labels.indexOf("CBM"), cin: labels.indexOf("EDOC_CIN"),
          inv: labels.findIndex(l => l.startsWith("EDOC_(")), desc: labels.indexOf("DESC")
        };
        continue;
      }
      if (!map) continue;
      const cell = i => (i >= 0 && r[i] != null ? r[i] : "");
      const S = i => String(cell(i)).trim();
      if (/^total$/i.test(S(map.dest))) continue;
      const cinVal = S(map.cin);
      const dgVal = S(map.dg).toUpperCase();
      const mawbVal = xlsxNumStr(cell(map.mawb));
      const isDetail = cinVal === "\u2713" || cinVal === "\u2717" ||
        (/^(N|L|LN|DG)$/.test(dgVal) && /^[A-Z0-9]{6,}$/i.test(mawbVal));
      if (isDetail) {
        if (!mawbVal || !/^[A-Z0-9-]{6,}$/i.test(mawbVal)) continue;
        out.push({
          houseNumber: mawbVal,
          flightNumber: master?.flight || "",
          weight: parseFloat(xlsxNumStr(cell(map.grs))) || 0,
          pieces: parseInt(xlsxNumStr(cell(map.etd))) || 0,
          destination: S(map.dest) || master?.dest || "",
          awbNumber: master?.mawb || "",
          etdFromCsv: master?.etd || "",
          customerName: S(map.flt)
        });
      } else if (mawbVal) {
        const ic = xlsxNumStr(cell(map.ic)) || mawbVal;
        if (/CONSOL|REPORT/i.test(ic)) continue;
        master = { mawb: mawbVal, flight: S(map.flt), dest: S(map.dest), etd: xlsxTimeStr(cell(map.etd)) };
      }
    }
    return out;
  }
  let headers = null, hdrIdx = -1;
  for (let i = 0; i < Math.min(xrows.length, 40); i++) {
    const labels = Array.from(xrows[i], v => String(v == null ? "" : v).trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
    if (labels.some(h => /HOUSE|HAWB/.test(h))) { headers = labels; hdrIdx = i; break; }
  }
  if (hdrIdx < 0) return out;
  const idx = re => headers.findIndex(h => re.test(String(h || "")));
  const houseCol = idx(/HOUSE|HAWB|AWB/), flightCol = idx(/FLIGHT|FLT/), weightCol = idx(/WEIGHT|WGT/),
    pcsCol = idx(/PCS|PIECES|PIECE|QTY/), destCol = idx(/DEST/), awbCol = idx(/AWB_NO|AWBNO|MAWB|MASTER/),
    etdCol = idx(/ETD|FLIGHT_TIME|DEPARTURE/), custCol = idx(/CUSTOMER|SHIPPER|CONSIGN|PICKUP/);
  for (const r of xrows.slice(hdrIdx + 1)) {
    const S = i => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
    const houseNumber = xlsxNumStr(r[houseCol]);
    if (!/^[A-Z]{0,3}[0-9][A-Z0-9-]{4,}$/i.test(houseNumber)) continue;
    out.push({
      houseNumber,
      flightNumber: S(flightCol),
      weight: parseFloat(xlsxNumStr(r[weightCol])) || 0,
      pieces: parseInt(xlsxNumStr(r[pcsCol])) || 0,
      destination: S(destCol),
      awbNumber: S(awbCol),
      etdFromCsv: S(etdCol),
      customerName: S(custCol)
    });
  }
  return out;
}

function importPickupXlsxRows(db, rows) {
  const imported = [], changes = [];
  let newJobs = 0, changedJobs = 0, totalRows = 0;
  let map = null;
  for (const r of rows) {
    const labels = Array.from(r, v => String(v == null ? "" : v).trim().toUpperCase());
    if (labels.includes("ONHAND") && labels.includes("PICKUP")) {
      map = {
        onhand: labels.indexOf("ONHAND"), dest: labels.indexOf("DEST"), pickup: labels.indexOf("PICKUP"),
        phone: labels.indexOf("PHONE"), contact: labels.indexOf("CONTACT_PERSON"), owner: labels.indexOf("OWNER"),
        carrier: labels.indexOf("CARRIER"), dra: labels.indexOf("DRA"), qty: labels.indexOf("QTY"),
        weight: labels.indexOf("WEIGHT"), ready: labels.indexOf("READY"), close: labels.indexOf("CLOSE"),
        address: labels.indexOf("ADDRESS"), refs: labels.findIndex(l => l.startsWith("REFS"))
      };
      continue;
    }
    if (!map) continue;
    const S = i => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
    const onhandRaw = r[map.onhand];
    const onhand = typeof onhandRaw === "number"
      ? (onhandRaw > 1000000 ? xlsxNumStr(onhandRaw) : "")
      : String(onhandRaw || "").trim();
    if (!/^[A-Z]{0,3}\d{6,}$/i.test(onhand)) continue;
    totalRows += 1;
    const existing = findJob(db, onhand);
    if (!existing) {
      newJobs += 1;
      changes.push({
        id: "CHG-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex"),
        houseNumber: onhand,
        customerName: S(map.pickup),
        changes: ["NEW_JOB"],
        notIssued: true,
        message: "\u0e07\u0e32\u0e19 Pickup \u0e43\u0e2b\u0e21\u0e48 " + onhand,
        createdAt: nowIso()
      });
    } else {
      changedJobs += 1;
    }
    const job = upsertJob(db, {
      houseNumber: onhand,
      customerName: S(map.pickup),
      destAirport: S(map.dest),
      pieceCount: xlsxNumStr(r[map.qty]),
      weight: xlsxNumStr(r[map.weight]),
      pickupLocation: S(map.address),
      pickupPhone: S(map.phone),
      tel: S(map.phone),
      contact: S(map.contact),
      contactPerson: S(map.contact),
      carrier: S(map.carrier),
      ownerCode: S(map.owner),
      refsNo: S(map.refs),
      readyTime: xlsxUtcIso(r[map.ready]),
      closeTime: xlsxUtcIso(r[map.close]),
      pickupDate: (typeof r[map.ready] === "number" && r[map.ready] > 60)
        ? xlsxSerialToDate(r[map.ready]).toISOString().slice(0, 10) : "",
      status: existing ? existing.status : "Pending",
      adminPrepared: existing ? Boolean(existing.adminPrepared) : true,
      source: "PickupReportXlsx"
    });
    imported.push(job);
  }
  return {
    imported, changes, newJobs, changedJobs,
    duplicateJobs: changedJobs, duplicateRows: 0,
    totalRows, uniqueRows: totalRows,
    notIssued: imported.filter(j => !j.cargoIssuedAt).length
  };
}

function isGlobalConsolFormat(csvText) {
  const firstLine = String(csvText || "").split(/\r?\n/).find(l => l.trim());
  return /^IC,IC,MAWB/i.test(String(firstLine || "").trim());
}

function parseFltDate(str) {
  // Parse "1-Jul-26", "15-Jul-26", or "15-Jul-2026" → "2026-07-15"
  // Month names are case-insensitive (APR / Apr / apr all work)
  const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
  const m = String(str || "").match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return "";
  const day = m[1].padStart(2, "0");
  const monKey = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
  const month = String(months[monKey] || 1).padStart(2, "0");
  const year = m[3].length <= 2 ? "20" + m[3] : m[3];
  return year + "-" + month + "-" + day;
}

function parseGlobalConsolCsv(csvText) {
  // Quoted-CSV aware line parser
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (const ch of String(csvText || "")) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { row.push(cell.trim()); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !inQ) {
      row.push(cell.trim()); cell = "";
      if (row.some(c => c)) rows.push(row);
      row = [];
    } else { cell += ch; }
  }
  row.push(cell.trim());
  if (row.some(c => c)) rows.push(row);

  // Helpers
  const isDgValue = v => /^(N|L|LN|DG)$/i.test((v || "").trim());
  // HAWB: 7+ digits OR alphanumeric like 43Y0006491
  const isHouseNo = v => /^[A-Z0-9]{6,}$/i.test((v || "").trim()) && !/^total$/i.test((v || "").trim());
  // IC: BKK1200012, D840010602, 3840015078 — all 8+ chars starting with letter/digit
  const isMasterIc = v => { const s = (v||"").trim(); return s.length >= 8 && /^[A-Z0-9]/i.test(s) && !/^total$/i.test(s); };
  const shipments = [];
  let current = null;

  for (const r of rows) {
    const c0 = (r[0] || "").trim();
    const c1 = (r[1] || "").trim();
    const c2 = (r[2] || "").trim();
    const c3 = (r[3] || "").trim();

    // Skip header rows and tail section header
    if (/^IC$/i.test(c0) && /^IC$/i.test(c1)) continue;
    if (c0 === "HAWB") continue;
    // Skip if no useful data (c0, c1, c2 all empty — though CSV parser already filters most)
    if (!c0 && !c1 && !c2) continue;

    // ── Format A: Master IC row (col0 === col1, both are IC numbers) ──────────
    if (c0 && c1 && c0 === c1 && isMasterIc(c0)) {
      current = {
        ic:      c0,
        mawb:    c2,
        flight:  (r[5] || "").trim(),
        fltDate: (r[6] || "").trim(),
        dest:    (r[7] || "").trim(),
        etd:     (r[8] || "").trim(),
        houses:  [],
        format:  "A"
      };
      shipments.push(current);

    // ── Format B: Standalone house row (col0=HouseNo, col1="X") ──────────────
    } else if (isHouseNo(c0) && c1 === "X") {
      // col3=date, col4=shipper, col5=consignee, col6=dest
      const houseNo = c0;
      // Push to a virtual shipment for standalone houses
      let standalone = shipments.find(s => s.ic === "__STANDALONE__");
      if (!standalone) {
        standalone = { ic: "__STANDALONE__", mawb: "", flight: "", fltDate: "", dest: "", etd: "", houses: [], format: "B" };
        shipments.push(standalone);
      }
      standalone.houses.push({
        date:      c3,
        houseNo,
        dg:        "N",
        shipper:   (r[4] || "").trim(),
        consignee: (r[5] || "").trim(),
        dest:      (r[6] || "").trim(),
        pcs:       (r[7] || "").trim(),
        pkgType:   "",
        grsWgt:    (r[8] || "").trim().replace(/,/g, ""),
        volWgt:    (r[9] || "").trim().replace(/,/g, ""),
        cbm:       (r[10] || "").trim(),
        edocCin:   (r[13] || "").trim(),
        edocInv:   (r[14] || "").trim(),
        desc:      "",
      });

    // ── Format A house row (under a current master) ───────────────────────────
    } else if (current && current.format === "A") {
      const houseNo = c2;
      if (!houseNo || /^total$/i.test(houseNo) || !isHouseNo(houseNo)) continue;
      // Validate DG value — skip rows where DG column is a date (noise rows)
      const dg = isDgValue(c3) ? c3.toUpperCase() : "N";
      current.houses.push({
        date:      (r[1] || r[0] || "").trim(),
        houseNo,
        dg,
        shipper:   (r[5] || "").trim(),
        consignee: (r[6] || "").trim(),
        dest:      (r[7] || "").trim(),
        pcs:       (r[8] || "").trim(),
        pkgType:   (r[9] || "").trim(),
        grsWgt:    (r[12] || "").trim().replace(/,/g, ""),
        volWgt:    (r[13] || "").trim().replace(/,/g, ""),
        cbm:       (r[14] || "").trim(),
        edocCin:   (r[16] || "").trim(),
        edocInv:   (r[17] || "").trim(),
        desc:      (r[18] || "").trim(),
      });
    }
  }
  return shipments;
}

function importGlobalConsolRows(db, csvText) {
  const shipments = parseGlobalConsolCsv(csvText);
  const imported = [], changes = [], lpRows = [];
  let newJobs = 0, changedJobs = 0, unchangedJobs = 0, totalRows = 0;

  for (const s of shipments) {
    const fltDateStr = parseFltDate(s.fltDate);
    const etdRaw = s.etd ? s.etd.replace(/^(\d+:\d+).*/, "$1") : "00:00";
    const [etdH, etdM] = etdRaw.split(":");
    const etdTime = (etdH || "0").padStart(2, "0") + ":" + (etdM || "00").padStart(2, "0");
    const flightDateTime = fltDateStr ? (fltDateStr + "T" + etdTime + ":00+07:00") : "";

    for (const h of s.houses) {
      totalRows += 1;
      const houseNumber = h.houseNo;
      if (!houseNumber) continue;

      // DG type → cargoType
      const dgUp = (h.dg || "N").toUpperCase();
      const cargoType = (dgUp === "L" || dgUp === "LN") ? "lithium" : dgUp === "DG" ? "dg" : "normal";
      const isLithium = cargoType === "lithium";

      const existing = findJob(db, houseNumber);
      const changeSet = [];
      if (!existing) {
        changeSet.push("NEW_JOB");
        newJobs += 1;
      } else {
        const newDest = s.dest || h.dest || "";
        if ((existing.destAirport || "") !== newDest) changeSet.push("DEST_CHANGED");
        if ((existing.flightNo || "") !== s.flight) changeSet.push("FLIGHT_CHANGED");
        if (changeSet.length) changedJobs += 1;
        else unchangedJobs += 1;
      }

      const job = upsertJob(db, {
        houseNumber,
        customerName:  h.shipper,
        consigneeName: h.consignee,
        destAirport:   s.dest || h.dest,
        flightNo:      s.flight,
        flightTime:    flightDateTime || addHoursIso(8),
        mawbNumber:    s.mawb,
        icNumber:      s.ic,
        pieceCount:    h.pcs,
        packageType:   h.pkgType || "CTN",
        weight:        h.grsWgt,
        volWeight:     h.volWgt,
        cbm:           h.cbm,
        cargoType,
        isLithium,
        dgType:        h.dg,
        cargoDesc:     h.desc,
        edocCin:       h.edocCin,
        edocInv:       h.edocInv,
        status:        existing ? existing.status : "Pending",
        adminPrepared: existing ? Boolean(existing.adminPrepared) : true,
        source:        "GlobalConsolCSV"
      });

      if (changeSet.length) {
        changes.push({
          id: "CHG-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex"),
          houseNumber,
          customerName: job.customerName,
          changes: changeSet,
          notIssued: !job.cargoIssuedAt,
          message: buildImportChangeMessage(job, changeSet, !job.cargoIssuedAt),
          createdAt: nowIso()
        });
      }
      imported.push(job);

      // Build load-plan row from this house
      lpRows.push({
        houseNumber,
        flightNumber:    s.flight || "",
        destination:     (s.dest || h.dest || "").trim(),
        pieces:          parseInt(h.pcs) || 0,
        weight:          parseFloat((h.grsWgt || "").replace(/,/g, "")) || 0,
        awbNumber:       s.mawb || "",
        customerName:    (h.shipper  || "").trim(),
        consigneeName:   (h.consignee|| "").trim(),
        matched:         true,
        jobStatus:       existing ? existing.status : "Pending",
        warehouseLocation: null,
        zoneId:          null,
        flightTime:      flightDateTime || null
      });
    }
  }

  db.importChanges = [...(db.importChanges || []), ...changes].slice(-300);
  return {
    imported,
    changes,
    totalRows,
    uniqueRows: imported.length,
    newJobs,
    changedJobs,
    unchangedJobs,
    duplicateRows: 0,
    duplicateJobs: unchangedJobs,
    notIssued: imported.filter(j => !j.cargoIssuedAt).length,
    format: "GlobalConsol",
    lpRows
  };
}

function recordImportHistory(db, result, fileName = "SCD Pickup Report.csv", source = "Manual") {
  const entry = {
    id: `IMP-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
    fileName: String(fileName || "SCD Pickup Report.csv").slice(0, 180),
    source,
    importedAt: nowIso(),
    totalRows: result.totalRows || 0,
    uniqueRows: result.uniqueRows || 0,
    newJobs: result.newJobs || 0,
    changedJobs: result.changedJobs || 0,
    duplicateJobs: result.duplicateJobs || 0,
    duplicateRows: result.duplicateRows || 0,
    notIssued: result.notIssued || 0
  };
  db.importHistory = [...(db.importHistory || []), entry].slice(-5);
  return entry;
}

async function processImportFeedDirectory() {
  const db = readDb();
  db.integrations ||= {};
  db.integrations.importedFeedHashes ||= {};
  const files = fs.readdirSync(IMPORT_FEED_DIR).filter(name => /\.(csv|xlsx)$/i.test(name));
  const summary = { checked: files.length, importedFiles: 0, jobs: 0, changes: 0, checkedAt: nowIso() };
  for (const name of files) {
    const filePath = path.join(IMPORT_FEED_DIR, name);
    const fileBuf = fs.readFileSync(filePath);
    const hash = crypto.createHash("sha256").update(fileBuf).digest("hex");
    if (db.integrations.importedFeedHashes[name] === hash) continue;
    let result = null;
    if (/\.xlsx$/i.test(name)) {
      try {
        const rows = parseXlsxRows(fileBuf);
        const kind = detectXlsxKind(rows);
        if (kind === "consol") result = importGlobalConsolRows(db, consolXlsxToCsv(rows));
        else if (kind === "pickup") result = importPickupXlsxRows(db, rows);
      } catch (err) {
        console.error("[feed] xlsx parse failed:", name, err.message);
      }
      if (!result) { db.integrations.importedFeedHashes[name] = hash; continue; }
    } else {
      const csvText = fileBuf.toString("utf8");
      result = isGlobalConsolFormat(csvText) ? importGlobalConsolRows(db, csvText) : importScdRows(db, csvText);
    }
    recordImportHistory(db, result, name, "Automatic");
    db.integrations.importedFeedHashes[name] = hash;
    summary.importedFiles += 1;
    summary.jobs += result.imported.length;
    summary.changes += result.changes.length;
  }
  db.integrations.lastFeedRun = summary;
  if (summary.importedFiles) {
    await createAlert(db, `Automatic feed imported ${summary.jobs} jobs from ${summary.importedFiles} CSV file(s); ${summary.changes} change(s)`, summary.changes ? "warning" : "info");
  }
  writeDb(db);
  return summary;
}

function buildImportChangeMessage(job, changes, notIssued) {
  const parts = [];
  if (changes.includes("NEW_JOB")) parts.push(`งานใหม่ ${job.houseNumber}`);
  if (changes.includes("FLIGHT_TIME_CHANGED")) parts.push(`เที่ยวบิน/เวลาปิดเปลี่ยน ${job.houseNumber}`);
  if (changes.includes("DEST_CHANGED")) parts.push(`ปลายทางเปลี่ยน ${job.houseNumber}`);
  if (changes.includes("QTY_CHANGED")) parts.push(`จำนวนเปลี่ยน ${job.houseNumber}`);
  if (changes.includes("CUSTOMER_CHANGED")) parts.push(`ลูกค้าเปลี่ยน ${job.houseNumber}`);
  if (notIssued) parts.push(`ยังไม่ออกใบงาน`);
  return parts.join(" · ") || `ยืนยันข้อมูล ${job.houseNumber}`;
}

function saveBase64File(db, { houseNumber, fileType, base64, mimeType }) {
  if (!base64) return null;
  const clean = String(base64).includes(",") ? String(base64).split(",").pop() : String(base64);
  const ext = mimeType && mimeType.includes("pdf") ? ".pdf" : ".jpg";
  const fileId = `FILE-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const folder = path.join(STORAGE_DIR, houseNumber || "unassigned");
  fs.mkdirSync(folder, { recursive: true });
  const filename = `${fileId}${ext}`;
  const filePath = path.join(folder, filename);
  fs.writeFileSync(filePath, Buffer.from(clean, "base64"));
  const url = `/storage/${encodeURIComponent(houseNumber || "unassigned")}/${filename}`;
  const attachment = {
    fileId,
    houseNumber,
    fileType,
    url,
    mimeType: mimeType || "image/jpeg",
    createdAt: nowIso()
  };
  db.attachments.push(attachment);
  return attachment;
}

function saveBase64Files(db, { houseNumber, fileType, files }) {
  if (!Array.isArray(files)) return [];
  return files
    .map(file => saveBase64File(db, {
      houseNumber,
      fileType,
      base64: file.base64,
      mimeType: file.mimeType
    }))
    .filter(Boolean);
}

function whLog(db, entry) {
  if (!db.warehouseMap) return;
  if (!db.warehouseMap.log) db.warehouseMap.log = [];
  db.warehouseMap.log.push({ ...entry, ts: nowIso() });
  if (db.warehouseMap.log.length > 500) db.warehouseMap.log = db.warehouseMap.log.slice(-500);
}

function logActivity(db, payload) {
  const log = {
    logId: `LOG-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
    houseNumber: payload.houseNumber,
    activityType: payload.activityType,
    startTime: payload.startTime || nowIso(),
    endTime: payload.endTime || "",
    gpsLat: payload.gpsLat || null,
    gpsLong: payload.gpsLong || null,
    userId: payload.userId || "unknown",
    createdAt: nowIso()
  };
  db.activityLogs.push(log);
  return log;
}

function findOpenActivity(db, houseNumber, activityType) {
  return db.activityLogs
    .slice()
    .reverse()
    .find(log => log.houseNumber === houseNumber && log.activityType === activityType && !log.endTime);
}

function updateTrackedStep(db, job, payload) {
  const stepKey = String(payload.stepKey || "").trim();
  if (!stepKey) throw new Error("Step key is required");
  job.stepTracking ||= {};
  const current = job.stepTracking[stepKey] || {};
  const timestamp = nowIso();

  if (payload.action === "start") {
    if (current.status === "InProgress") return current;
    const log = logActivity(db, {
      houseNumber: job.houseNumber,
      userId: payload.userId,
      activityType: `Step:${stepKey}`,
      startTime: timestamp
    });
    job.stepTracking[stepKey] = {
      stepKey,
      stepName: payload.stepName || stepKey,
      status: "InProgress",
      userId: payload.userId || "unknown",
      startedAt: timestamp,
      completedAt: "",
      durationMinutes: 0,
      logId: log.logId
    };
  } else if (payload.action === "finish") {
    const startedAt = current.startedAt || timestamp;
    const log = db.activityLogs.find(item => item.logId === current.logId);
    if (log) log.endTime = timestamp;
    else logActivity(db, {
      houseNumber: job.houseNumber,
      userId: payload.userId,
      activityType: `Step:${stepKey}`,
      startTime: startedAt,
      endTime: timestamp
    });
    job.stepTracking[stepKey] = {
      ...current,
      stepKey,
      stepName: payload.stepName || current.stepName || stepKey,
      status: "Completed",
      userId: current.userId || payload.userId || "unknown",
      startedAt,
      completedAt: timestamp,
      durationMinutes: Math.max(0, Math.round((new Date(timestamp) - new Date(startedAt)) / 60000))
    };
  } else {
    throw new Error("Action must be start or finish");
  }

  job.updatedAt = timestamp;
  return job.stepTracking[stepKey];
}

async function createAlert(db, message, severity = "warning") {
  const alert = {
    id: `ALERT-${Date.now()}`,
    message,
    severity,
    createdAt: nowIso()
  };
  db.alerts.push(alert);

  if (process.env.LINE_WEBHOOK_URL) {
    try {
      await fetch(process.env.LINE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      alert.sent = true;
    } catch (error) {
      alert.sent = false;
      alert.error = error.message;
    }
  }
  return alert;
}

async function deliverInvoiceEmail(bill, attachmentUrls = []) {
  if (!process.env.EMAIL_WEBHOOK_URL) {
    return { delivered: false, status: "QueuedForEmailIntegration" };
  }
  const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` } : {})
    },
    body: JSON.stringify({
      to: bill.billingEmail,
      cc: process.env.BILLING_CC_EMAIL || "",
      subject: `Invoice ${bill.id} - ${bill.customerName}`,
      message: `Please find invoice ${bill.id} attached.`,
      invoiceUrl: bill.pdfUrl,
      attachments: attachmentUrls
    })
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  return { delivered: true, status: "Delivered" };
}

function generateInvoiceHtml(db, bill, job, customer) {
  const invoiceHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(bill.id)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #17201d; }
    h1 { color: #0f766e; margin-bottom: 4px; }
    .meta, table { width: 100%; margin-top: 24px; }
    .meta td { padding: 4px 0; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #dfe5df; padding: 10px; text-align: left; }
    th { background: #eef8f6; }
    .total { text-align: right; font-size: 20px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Invoice</h1>
  <strong>${escapeHtml(bill.id)}</strong>
  <table class="meta">
    <tr><td>Customer</td><td>${escapeHtml(customer?.name || job.customerName)}</td></tr>
    <tr><td>Tax ID</td><td>${escapeHtml(customer?.taxId || "-")}</td></tr>
    <tr><td>Billing Email</td><td>${escapeHtml(bill.billingEmail || "-")}</td></tr>
    <tr><td>House Number</td><td>${escapeHtml(job.houseNumber)}</td></tr>
    <tr><td>Flight</td><td>${escapeHtml(job.flightNo)} / ${escapeHtml(formatBangkok(job.flightTime))}</td></tr>
    <tr><td>Due Date</td><td>${escapeHtml(formatBangkok(bill.dueDate))}</td></tr>
  </table>
  <table>
    <thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody>
      <tr><td>Air export logistics service - ${escapeHtml(job.houseNumber)}</td><td>${Number(bill.amount).toLocaleString("th-TH")} THB</td></tr>
    </tbody>
  </table>
  <p class="total">Total: ${Number(bill.amount).toLocaleString("th-TH")} THB</p>
</body>
</html>`;
  const filename = `${bill.id}.html`;
  const filePath = path.join(INVOICE_DIR, filename);
  fs.writeFileSync(filePath, invoiceHtml, "utf8");
  return `/storage/invoices/${filename}`;
}
function generateCargoFormHtml(job, items = []) {
  // เตรียมรายการ HAWB 5 แถว (ถ้ามีไม่ถึงให้ใส่ว่าง)
  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push(items[i] || { houseNumber: "", dest: "", invoiceNo: "", carton: "", booking: "", actual: "" });
  }

  // ฟังก์ชันช่วยจัดการค่าว่าง
  const val = (v) => v || '';

  const html = `
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="utf-8">
    <title>Cargo Pickup Form - ${job.houseNumber}</title>
    <style>
        @media print { 
            @page { size: A4 portrait; margin: 5mm; } 
            body { -webkit-print-color-adjust: exact; }
        }
        body { font-family: "Arial", "Tahoma", sans-serif; font-size: 10px; color: #000; margin: 0; padding: 5mm; line-height: 1.2; }
        .container { width: 200mm; margin: auto; border: 1.5px solid #000; padding: 2px; box-sizing: border-box; }
        .inner-border { border: 0.5px solid #000; padding: 3px; }
        .header { text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px; }
        .header h2 { text-decoration: underline; margin: 2px 0; font-size: 15px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 0; }
        th, td { border: 1px solid #000; padding: 3px; vertical-align: top; overflow: hidden; word-wrap: break-word; }
        .label { font-size: 8px; display: block; font-weight: bold; margin-bottom: 1px; }
        .data-val { font-size: 10px; font-weight: bold; }
        .checkbox-box { display: inline-block; width: 10px; height: 10px; border: 1px solid #000; margin-right: 3px; vertical-align: middle; }
        
        /* Remarks Section Layout */
        .remarks-container { border: 1px solid #000; margin-top: 5px; padding: 3px; }
        .remarks-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 8px; }
        .remarks-item { display: flex; align-items: flex-start; }
        .remark-text { line-height: 1.1; }
        .th-sub { font-size: 7px; color: #444; display: block; }

        /* Signature Section */
        .sig-table td { height: 35px; vertical-align: top; }
        .bottom-table td { height: 20px; }
    </style>
</head>
<body>
    <div class="container">
    <div class="inner-border">
        <!-- Header -->
        <div class="header">
            <div style="font-size: 7px;">Warehouse Office : Unit 112-113, Warehouse No. 3, Free Zone, Suvarnabhumi Airport...</div>
            <h2>CARGO PICKUP FORM</h2>
        </div>

        <!-- Section 1: Info -->
        <table>
            <tr>
                <td width="25%"><span class="label">Pickup Date (วันที่รับสินค้า):</span><span class="data-val">${val(job.pickupDate)}</span></td>
                <td width="25%"><span class="label">Pickup Time (เวลารับสินค้า):</span><span class="data-val">${val(job.pickupTime || (job.readyTime ? job.readyTime.slice(11,16) : ''))}</span></td>
                <td width="25%"><span class="label">Contact (ติดต่อ):</span><span class="data-val">${val(job.contact || job.contactPerson)}</span></td>
                <td width="25%"><span class="label">Tel (โทรศัพท์):</span><span class="data-val">${val(job.tel || job.pickupPhone)}</span></td>
            </tr>
            <tr>
                <td colspan="2"><span class="label">Shipper (ชื่อผู้ส่งออก):</span><span class="data-val">${val(job.customerName)}</span></td>
                <td colspan="2"><span class="label">Place Loading (สถานที่รับสินค้า):</span><span class="data-val">${val(job.pickupLocation)}</span></td>
            </tr>
            <tr>
                <td colspan="1.5"><span class="label">Driver's Name (ชื่อคนขับรถ):</span><span class="data-val">${val(job.driverName)}</span></td>
                <td><span class="label">Truck License (ทะเบียนรถ):</span><span class="data-val">${val(job.vehiclePlate)}</span></td>
                <td><span class="label">Type (ประเภทรถ):</span><span class="data-val">${val(job.vehicleType)}</span></td>
            </tr>
        </table>

        <!-- Section 2: HAWB Table -->
        <table style="margin-top: 5px;">
            <tr style="background: #eee; text-align: center; font-size: 8px;">
                <th width="20%">HAWB<br>(เฮ้าส์แอร์เวย์บิล)</th>
                <th width="15%">Dest<br>(เมืองปลายทาง)</th>
                <th width="20%">Invoice No.<br>(เลขที่อินวอยซ์)</th>
                <th width="15%">Total Carton<br>(จำนวนหีบห่อ)</th>
                <th width="15%">Booking<br>(จำนวนที่จอง)</th>
                <th width="15%">Actual<br>(จำนวนรับจริง)</th>
            </tr>
            ${rows.map(r => `
            <tr style="height: 25px;">
                <td align="center"><strong>${val(r.houseNumber)}</strong></td>
                <td align="center">${val(r.dest || r.destination)}</td>
                <td align="center">${val(r.invoiceNo)}</td>
                <td align="center">${val(r.carton)}</td>
                <td align="center">${val(r.booking)}</td>
                <td></td>
            </tr>`).join('')}
        </table>

        <!-- Section 3: Summary & Doc Status -->
        <table style="margin-top: 5px;">
            <tr>
                <td width="65%">
                    <span class="label">Total Receive From Vendor (จำนวนที่ได้รับ):</span>
                    <span class="checkbox-box"></span> Carton (กล่อง) &nbsp;&nbsp;
                    <span class="checkbox-box"></span> Bundle (มัด) &nbsp;&nbsp;
                    <span class="checkbox-box"></span> Pallet (พาเลท)
                </td>
                <td><span class="label">Grand Total (รวมจำนวน):</span><span class="data-val">${val(job.pieceCount)}</span></td>
            </tr>
            <tr>
                <td>
                    <span class="label">Shipping Document (เอกสารประกอบ):</span>
                    <span class="checkbox-box"></span> NO (ไม่มี) &nbsp;&nbsp;&nbsp;&nbsp;
                    <span class="checkbox-box"></span> YES (มี)
                </td>
                <td><span class="label">Total Envelope (จำนวนซองเอกสาร):</span></td>
                <td><span class="label">Airport Checked By:</span><br><span style="font-size:7px;">(เว้นไว้)</span></td>
            </tr>
        </table>

        <!-- Section 4: Remarks (2 Columns Grid) -->
        <div class="remarks-container">
            <span class="label">Remarks :</span>
            <div class="remarks-grid">
                <div class="remarks-item">
                    <span class="checkbox-box"></span>
                    <div class="remark-text">
                        THE EXTERNAL CONDITION OF THE ABOVE PACKAGES IS IN ACCORDANCE TO THE GENERAL STANDARD FOR AIRFREIGHT EXPORT SHIPMENTS.
                        <span class="th-sub">กล่องสินค้าที่ส่งมอบถูกต้องตามมาตรฐานการส่งออก</span>
                    </div>
                </div>
                <div class="remarks-item">
                    <span class="checkbox-box"></span>
                    <div class="remark-text">
                        ALL PACKAGES HAVE BEEN PACKED AND CLOSED/SEALED BY THE SHIPPER AND HAS NOT BEEN CHECKED BY EXPEDITORS REPRESENTATIVE.
                        <span class="th-sub">โรงงานผู้ส่งออกเป็นผู้จัดการบรรจุและปิดกล่องสินค้าทั้งหมดด้วยตนเอง บริษัทฯ มิได้ตรวจสอบภายใน</span>
                    </div>
                </div>
                <div class="remarks-item">
                    <span class="checkbox-box"></span>
                    <div class="remark-text">
                        THE EXTERNAL CONDITION OF THE ABOVE PACKAGES IS NOT IN ACCORDANCE... REJECTS ANY RESPONSIBILITIES FOR DAMAGES.
                        <span class="th-sub">สินค้าไม่ได้มาตรฐาน บริษัทฯ จะไม่รับผิดชอบต่อความเสียหายระหว่างขนส่ง</span>
                    </div>
                </div>
                <div class="remarks-item">
                    <span class="checkbox-box"></span>
                    <div class="remark-text">
                        OTHERS (PLEASE SPECIFY IN DETAIL):
                        <div style="border-bottom: 0.5px solid #000; width: 100%; margin-top: 8px;"></div>
                        <span class="th-sub">อื่นๆ โปรดระบุ</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Section 5: Seal & Door -->
        <table style="margin-top: 5px; text-align: center; font-size: 7px;">
            <tr style="background: #f9f9f9;">
                <td>Seal Number (ซีล)</td>
                <td>Rear door (ประตูท้าย)</td>
                <td>Left door (ประตูด้านซ้าย)</td>
                <td>Right door (ประตูด้านขวา)</td>
            </tr>
            <tr style="height: 18px;">
                <td></td><td></td><td></td><td></td>
            </tr>
        </table>

        <!-- Section 6: Signature -->
        <table class="sig-table" style="margin-top: 0;">
            <tr>
                <td width="60%">
                    <span class="label">Released Shipment & Seal by (ผู้ตรวจปล่อยสินค้า):</span>
                    <br><br>_________________________________________
                </td>
                <td width="20%"><span class="label">Date (วันที่):</span></td>
                <td width="20%"><span class="label">Time (เวลา):</span></td>
            </tr>
            <tr>
                <td>
                    <span class="label">Received by (เจ้าหน้าที่บริษัทฯ รับมอบสินค้า):</span>
                    <br><br>_________________________________________
                </td>
                <td><span class="label">Date (วันที่):</span></td>
                <td><span class="label">Time (เวลา):</span></td>
            </tr>
        </table>

        <!-- Section 7: Bottom Linked Table -->
        <div style="font-size: 7px; margin: 8px 0 2px 0;">@ ALL ORDER ARE BASED ON OUR STANDARD TRADING CONDITION, A COPY AVAILABLE UPON REQUEST.</div>
        <table class="bottom-table">
            <tr style="background: #eee; text-align: center; font-size: 8px;">
                <th width="20%">HAWB (เฮ้าส์แอร์เวย์บิล)</th>
                <th width="15%">Dest (ปลายทาง)</th>
                <th width="10%"><span class="checkbox-box"></span> TG</th>
                <th width="10%"><span class="checkbox-box"></span> TG INT</th>
                <th width="10%"><span class="checkbox-box"></span> BFS</th>
                <th width="10%"><span class="checkbox-box"></span> WH3</th>
                <th>Total Carton</th>
            </tr>
            ${rows.map(r => `
            <tr align="center">
                <td><strong>${val(r.houseNumber)}</strong></td>
                <td>${val(r.dest || r.destination)}</td>
                <td></td><td></td><td></td><td></td>
                <td>${val(r.carton)}</td>
            </tr>`).join('')}
        </table>
    </div>
    </div>
    <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
  return html;
}

function generateBatchInvoiceHtml(bill, jobs, customer) {
  const rows = jobs.map((job, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(job.houseNumber)}</td>
      <td>${escapeHtml(job.pickupDate || formatBangkok(job.flightTime))}</td>
      <td>${escapeHtml(job.routeType || job.destination || "-")}</td>
      <td>${escapeHtml(job.pieceCount || "-")}</td>
      <td>${escapeHtml(job.vehiclePlate || "-")}</td>
    </tr>`).join("");
  const invoiceHtml = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(bill.id)}</title>
<style>
@page{size:A4 portrait;margin:12mm}body{font-family:"TH Sarabun New",Arial,sans-serif;margin:0;color:#17201d;font-size:18px}
header{display:flex;justify-content:space-between;border-bottom:2px solid #17314f;padding-bottom:10px}h1{margin:0;color:#17314f}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:18px 0}.meta div{border-bottom:1px solid #d8e0e8;padding:5px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #9baaba;padding:6px;text-align:left}th{background:#edf4fb}.total{text-align:right;font-size:24px;font-weight:700;margin-top:16px}footer{margin-top:24px;color:#65758b}
</style></head><body>
<header><div><strong>SmartLogistics</strong><div>ใบวางบิลแบบรวม / Batch Invoice</div></div><div><h1>INVOICE</h1><strong>${escapeHtml(bill.id)}</strong></div></header>
<section class="meta">
<div><strong>ลูกค้า:</strong> ${escapeHtml(customer?.name || bill.customerName)}</div><div><strong>Tax ID:</strong> ${escapeHtml(customer?.taxId || "-")}</div>
<div><strong>รอบ:</strong> ${escapeHtml(bill.billingMonth)} / ${escapeHtml(bill.billingPeriod)}</div><div><strong>Credit:</strong> ${escapeHtml(customer?.creditTerm || 0)} วัน</div>
<div><strong>ประเภท:</strong> ${escapeHtml(bill.billingPlan)}</div><div><strong>จำนวน:</strong> ${bill.tripCount} เที่ยว / ${jobs.length} House</div>
</section>
<table><thead><tr><th>#</th><th>HAWB / House</th><th>วันที่</th><th>เส้นทาง</th><th>จำนวน</th><th>ทะเบียนรถ</th></tr></thead><tbody>${rows}</tbody></table>
<p class="total">ยอดรวม ${Number(bill.amount || 0).toLocaleString("th-TH")} บาท</p>
<footer>Due: ${escapeHtml(formatBangkok(bill.dueDate))} · Billing email: ${escapeHtml(bill.billingEmail || "-")}</footer>
</body></html>`;
  const filename = `${bill.id}.html`;
  fs.writeFileSync(path.join(INVOICE_DIR, filename), invoiceHtml, "utf8");
  return `/storage/invoices/${filename}`;
}

function billingDocumentStatus(db, job) {
  const files = db.attachments.filter(file => file.houseNumber === job.houseNumber);
  const hasWeight = Boolean(job.terminalWeight || job.weight || files.some(file => /weight/i.test(file.fileType)));
  const hasTransfer = files.some(file => /OutboundDocument|EISignProof|CargoTransfer/i.test(file.fileType));
  const hasLoading = Boolean(job.loadingDetailUploaded || files.some(file => /LoadingDetail/i.test(file.fileType)));
  const hasFieldEvidence = files.some(file => /Pickup|InboundEvidence|PreLoadPhoto|Product|Cargo/i.test(file.fileType));
  const hasPlanApproval = Boolean(job.planMatched || job.approvalStatus === "ConfirmedByPlan" || job.approvalStatus === "CSApproved" || job.csConfirmed);
  const hasWh3Dispatch = Boolean(job.wh3PreDispatchReady);
  const hasCsEvidence = !job.manualExtra || Boolean(job.csEvidenceAttachedAt || job.evidenceNote || files.some(file => /CSApprovalEvidence/i.test(file.fileType)));
  return {
    hasWeight,
    hasTransfer,
    hasLoading,
    hasFieldEvidence,
    hasPlanApproval,
    hasWh3Dispatch,
    hasCsEvidence,
    ready: hasWeight && hasTransfer && hasLoading && hasFieldEvidence && hasPlanApproval && hasWh3Dispatch && hasCsEvidence,
    files
  };
}

async function handleApi(req, res, pathname) {
  const db = readDb();

  // ── Seed default WH3 map if none exist ──
  if (!db.warehouseMaps || !db.warehouseMaps.length) {
    const rackSlots = [];
    for (let r = 1; r <= 5; r++)
      for (let c = 1; c <= 10; c++)
        rackSlots.push({ id: `${r}-${String(c).padStart(2,"0")}`, col: c-1, row: r-1 });
    db.warehouseMaps = [{
      id: "wh3-main",
      name: "WH3 ชั้น 1 (Main Floor)",
      description: "คลังหลัก — Zone A/B/C + Rack 1-5",
      createdAt: nowIso(),
      landmarks: [
        { label: "ทางเข้า WH3", x: 36, y: 1, w: 28, h: 8, type: "entrance" },
        { label: "Office",      x: 1,  y: 12, w: 27, h: 16, type: "office" }
      ],
      corridors: [{ x: 43, y: 10, w: 5, h: 88, label: "ทางเดิน" }],
      zones: [
        { id: "A",    label: "Zone A",        color: "#ef4444", x: 1,  y: 32, slotW: 13, slotH: 12, gap: 2, slots: [{id:"A-01",col:0,row:0},{id:"A-02",col:1,row:0},{id:"A-03",col:2,row:0}] },
        { id: "B",    label: "Zone B",        color: "#f97316", x: 1,  y: 48, slotW: 13, slotH: 12, gap: 2, slots: [{id:"B-01",col:0,row:0},{id:"B-02",col:1,row:0},{id:"B-03",col:2,row:0}] },
        { id: "C",    label: "Zone C",        color: "#eab308", x: 1,  y: 64, slotW: 13, slotH: 12, gap: 2, slots: [{id:"C-01",col:0,row:0},{id:"C-02",col:1,row:0},{id:"C-03",col:2,row:0}] },
        { id: "RACK", label: "Rack (แถว 1-5)", color: "#3b82f6", x: 50, y: 12, slotW: 4.5, slotH: 13, gap: 0.8, slots: rackSlots }
      ]
    }];
    writeDb(db);
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    return sendJson(res, 200, {
      users: db.users,
      customers: db.customers,
      dashboard: buildDashboard(db)
    });
  }

  // ── Warehouse Maps API ──
  if (req.method === "GET" && pathname === "/api/warehouse/maps") {
    const jobs = db.jobs || [];
    const maps = (db.warehouseMaps || []).map(map => ({
      ...map,
      zones: map.zones.map(zone => ({
        ...zone,
        slots: zone.slots.map(slot => {
          const job = jobs.find(j => j.locationId === slot.id && !["Completed","Billed","InvoiceSent","Paid"].includes(j.status));
          return { ...slot, occupied: !!job, houseNumber: job?.houseNumber || null, jobStatus: job?.status || null, customerName: job?.customerName || null };
        })
      }))
    }));
    return sendJson(res, 200, { maps });
  }

  if (req.method === "POST" && pathname === "/api/warehouse/maps") {
    const payload = await parseBody(req);
    if (!payload.name) return sendJson(res, 400, { error: "name required" });
    if (!db.warehouseMaps) db.warehouseMaps = [];
    const rackSlots = [];
    if (payload.rackRows && payload.rackCols) {
      for (let r = 1; r <= payload.rackRows; r++)
        for (let c = 1; c <= payload.rackCols; c++)
          rackSlots.push({ id: `${r}-${String(c).padStart(2,"0")}`, col: c-1, row: r-1 });
    }
    const newMap = {
      id: "map-" + Date.now(),
      name: payload.name,
      description: payload.description || "",
      createdAt: nowIso(),
      landmarks: payload.landmarks || [
        { label: "ทางเข้า", x: 36, y: 1, w: 28, h: 8, type: "entrance" }
      ],
      corridors: payload.corridors || [],
      zones: payload.zones || []
    };
    db.warehouseMaps.push(newMap);
    writeDb(db);
    return sendJson(res, 200, { ok: true, map: newMap });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/warehouse/maps/")) {
    const mapId = decodeURIComponent(pathname.replace("/api/warehouse/maps/", ""));
    const before = (db.warehouseMaps || []).length;
    db.warehouseMaps = (db.warehouseMaps || []).filter(m => m.id !== mapId);
    writeDb(db);
    return sendJson(res, 200, { ok: true, deleted: before - (db.warehouseMaps || []).length });
  }

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "smart-logistics-tracking",
      time: nowIso()
    });
  }

  if (req.method === "GET" && pathname === "/api/integrations/status") {
    return sendJson(res, 200, {
      importFeed: {
        directory: IMPORT_FEED_DIR,
        intervalMinutes: Math.round(IMPORT_INTERVAL_MS / 60000),
        lastRun: db.integrations?.lastFeedRun || null
      },
      line: { configured: Boolean(process.env.LINE_WEBHOOK_URL) },
      email: { configured: Boolean(process.env.EMAIL_WEBHOOK_URL), cc: process.env.BILLING_CC_EMAIL || "" }
    });
  }

  if (req.method === "POST" && pathname === "/api/integrations/run-import") {
    const summary = await processImportFeedDirectory();
    return sendJson(res, 200, { ok: true, summary, dashboard: buildDashboard(readDb()) });
  }
// --- วางโค้ดนี้เพิ่มเข้าไปใน handleApi ---
  if (req.method === "GET" && pathname === "/api/admin/print-cargo") {
    // ดึง Parameter houseNumber จาก URL (เช่น ?houseNumber=123)
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const houseNumber = urlObj.searchParams.get("houseNumber");
    
    // หาข้อมูล Job จาก db.json
    const job = findJob(db, houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!job.csConfirmed) return sendJson(res, 409, { error: `งาน ${job.houseNumber} ยังไม่ผ่านการยืนยันจาก CS — พิมพ์ใบ Cargo ไม่ได้` });
    
    // ดึงตารางสินค้าย่อย (ถ้ามีหลายรายการ)
    let items = [];
    if (Array.isArray(job.pickupItems)) {
        items = job.pickupItems;
    } else if (job.pickupItems) {
        items = normalizePickupItems(job.pickupItems);
    } else {
        // ถ้าไม่มี สร้างให้ 1 แถวจากข้อมูลตัวแม่
        items = [{
            houseNumber: job.houseNumber,
            dest: job.destAirport || job.destination,
            invoiceNo: job.invoiceNo,
            carton: job.pieceCount,
            booking: job.booking
        }];
    }

    // สร้าง HTML
    const html = generateCargoFormHtml(job, items);
    
    // ส่งกลับเป็นหน้าเว็บ HTML (ไม่ใช่ JSON)
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  // ------------------------------------
  if (req.method === "POST" && pathname === "/api/admin/job") {
    const payload = await parseBody(req);
    payload.planSource ||= payload.sourceChannel || "ManualExtra";
    payload.evidenceChannel ||= payload.sourceChannel || "Line/Email";
    payload.manualExtra = payload.planSource !== "LoadPlan";
    const job = upsertJob(db, payload);
    job.updatedAt = nowIso();
    if (!job.csConfirmed) {
      await createAlert(db, `งานใหม่รอ CS ยืนยัน: ${job.houseNumber} (${job.customerName || "-"})`, "warning");
      writeDb(db);
      return sendJson(res, 200, { ok: true, pendingCs: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
    }
    job.cargoIssuedAt = job.cargoIssuedAt || nowIso();
    await createAlert(db, `Job opened and cargo form ready: ${job.houseNumber} / ${job.flightNo}`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/admin/job-batch") {
    const payload = await parseBody(req);
    payload.planSource ||= payload.sourceChannel || "ManualExtra";
    payload.evidenceChannel ||= payload.sourceChannel || "Line/Email";
    payload.manualExtra = payload.planSource !== "LoadPlan";
    const rows = normalizePickupItems(payload.pickupItems || "");
    const batchId = payload.batchId || `BATCH-${Date.now()}`;
    const workRows = rows.length ? rows : [{
      houseNumber: payload.houseNumber,
      dest: payload.destAirport || "",
      destination: payload.destAirport || "",
      carton: payload.pieceCount || "",
      route: payload.destination || payload.routeType || "WH3",
      pickupDate: payload.pickupDate || "",
      booking: payload.booking || "",
      invoiceNo: payload.invoiceNo || "",
      contact: payload.contact || payload.contactPerson || "",
      tel: payload.tel || payload.pickupPhone || ""
    }];
    const issuedAt = nowIso();
    const jobs = workRows
      .filter(row => row.houseNumber)
      .map(row => {
        const job = upsertJob(db, {
          ...payload,
          batchId,
          houseNumber: row.houseNumber,
          pickupDate: row.pickupDate || payload.pickupDate,
          pieceCount: row.carton || payload.pieceCount,
          pickupItems: `${row.houseNumber},${row.dest || row.destination || payload.destAirport || ""},${row.carton || payload.pieceCount || ""},${row.pickupDate || payload.pickupDate || ""},${row.route || row.routeType || payload.destination || payload.routeType || "WH3"},${row.booking || row.bookingNo || payload.booking || ""},${row.invoiceNo || payload.invoiceNo || ""},${row.contact || payload.contact || payload.contactPerson || ""},${row.tel || payload.tel || payload.pickupPhone || ""}`,
          destAirport: row.dest || row.destination || payload.destAirport || "",
          destination: row.route || row.routeType || payload.destination || "WH3",
          routeType: row.route || row.routeType || payload.routeType || "WH3",
          booking: row.booking || row.bookingNo || payload.booking || "",
          invoiceNo: row.invoiceNo || payload.invoiceNo || ""
        });
        if (job.csConfirmed) job.cargoIssuedAt = job.cargoIssuedAt || issuedAt;
        job.updatedAt = issuedAt;
        return job;
      });
    const pendingCsJobs = jobs.filter(job => !job.csConfirmed);
    if (pendingCsJobs.length) {
      await createAlert(db, `งานใหม่ ${pendingCsJobs.length} ใบ รอ CS ยืนยันก่อนออกใบ Cargo`, "warning");
    }
    if (jobs.length > pendingCsJobs.length) {
      await createAlert(db, `Batch assigned and cargo forms ready: ${jobs.length - pendingCsJobs.length} jobs / ${payload.driverName || payload.driverId || "-"}`, "info");
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, pendingCs: pendingCsJobs.length > 0, pendingCsHouses: pendingCsJobs.map(j => j.houseNumber), jobs: jobs.map(normalizeJob), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/admin/issue-cargo") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!job.csConfirmed) return sendJson(res, 409, { error: `งาน ${job.houseNumber} ยังไม่ผ่านการยืนยันจาก CS — กรุณาให้ CS Confirm ก่อนออกใบ Cargo` });
    job.cargoIssuedAt = nowIso();
    job.adminPrepared = true;
    job.cargoFormMode = "AdminPrepared";
    job.updatedAt = nowIso();
    await createAlert(db, `Cargo form issued: ${job.houseNumber}`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/admin/import-flight") {
    const payload = await parseBody(req);
    const rows = parseCsvRows(payload.csvText);
    const imported = [];
    const headers = rows[0]?.map(header => String(header || "").trim()) || [];
    const headerKey = key => String(key || "").toLowerCase().replace(/[\s_-]+/g, "");
    const hasHeader = headers.some(header => headerKey(header) === "housenumber");
    const rowValue = (row, names, fallbackIndex) => {
      for (const name of names) {
        const index = headers.findIndex(header => headerKey(header) === headerKey(name));
        if (index >= 0 && row[index] !== undefined && String(row[index]).trim() !== "") return String(row[index]).trim();
      }
      return row[fallbackIndex] !== undefined ? String(row[fallbackIndex]).trim() : "";
    };
    for (const row of rows) {
      if (hasHeader && row === rows[0]) continue;
      if (row[0]?.toLowerCase() === "house_number") continue;
      const houseNumber = rowValue(row, ["house_number", "houseNumber", "hawb"], 0);
      const customerId = rowValue(row, ["customer_id", "customerId"], 1);
      const flightNo = rowValue(row, ["flight_no", "flightNo"], 2);
      const flightTime = rowValue(row, ["flight_time", "flightTime"], 3);
      const productType = rowValue(row, ["product_type", "productType"], 4);
      const routeType = rowValue(row, ["route_type", "routeType", "route"], 5);
      const amount = rowValue(row, ["amount", "carton", "qty", "piece_count"], 6);
      const dest = rowValue(row, ["dest", "destination_city", "dest_city"], 7);
      const booking = rowValue(row, ["booking", "booking_no", "bookingNo", "bk"], 8);
      const invoiceNo = rowValue(row, ["invoice_no", "invoiceNo", "invoice", "inv"], 9);
      const contact = rowValue(row, ["contact", "contact_person", "contactPerson"], 10);
      const tel = rowValue(row, ["tel", "phone", "telephone", "mobile"], 11);
      if (!houseNumber) continue;
      imported.push(upsertJob(db, {
        houseNumber,
        customerId,
        flightNo,
        flightTime: flightTime ? new Date(flightTime).toISOString() : addHoursIso(8),
        productType,
        routeType,
        destination: routeType || "WH3",
        destAirport: dest,
        amount,
        pieceCount: amount,
        booking,
        invoiceNo,
        contactPerson: contact,
        pickupPhone: tel,
        pickupItems: `${houseNumber},${dest},${amount},${flightTime ? new Date(flightTime).toISOString().slice(0, 10) : ""},${routeType || "WH3"},${booking},${invoiceNo},${contact},${tel}`
      }));
    }
    await createAlert(db, `Imported ${imported.length} jobs from flight feed`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, imported: imported.length, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/admin/import-xlsx") {
    const payload = await parseBody(req);
    if (!payload.fileBase64) return sendJson(res, 400, { error: "fileBase64 required" });
    let rows;
    try {
      const clean = String(payload.fileBase64).includes(",") ? String(payload.fileBase64).split(",").pop() : String(payload.fileBase64);
      rows = parseXlsxRows(Buffer.from(clean, "base64"));
    } catch (err) {
      return sendJson(res, 422, { error: "\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1f\u0e25\u0e4c xlsx \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49: " + err.message });
    }
    const kind = detectXlsxKind(rows);
    if (kind === "consol") {
      const result = importGlobalConsolRows(db, consolXlsxToCsv(rows));
      const history = recordImportHistory(db, result, payload.fileName || "Consol Planning.xlsx", "Manual");
      const criticalChanges = result.changes.filter(change => change.changes.some(item => item !== "NEW_JOB"));
      if (criticalChanges.length) {
        await createAlert(db, `Consol update: \u0e21\u0e35 ${criticalChanges.length} \u0e07\u0e32\u0e19\u0e17\u0e35\u0e48\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19 \u0e01\u0e23\u0e38\u0e13\u0e32\u0e15\u0e23\u0e27\u0e08\u0e40\u0e17\u0e35\u0e48\u0e22\u0e27\u0e1a\u0e34\u0e19\u0e41\u0e25\u0e30\u0e1b\u0e25\u0e32\u0e22\u0e17\u0e32\u0e07`, "danger");
      } else {
        await createAlert(db, `Consol import: \u0e07\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48 ${result.newJobs} \u0e07\u0e32\u0e19 \u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15 ${result.changedJobs || 0} \u0e07\u0e32\u0e19`, "info");
      }
      writeDb(db);
      return sendJson(res, 200, {
        ok: true, kind,
        imported: result.imported.length,
        newJobs: result.newJobs,
        changedJobs: result.changedJobs || 0,
        changes: result.changes,
        history,
        dashboard: buildDashboard(db)
      });
    }
    if (kind === "pickup") {
      const result = importPickupXlsxRows(db, rows);
      const history = recordImportHistory(db, result, payload.fileName || "Pickup Report.xlsx", "Manual");
      await createAlert(db, `Pickup import: \u0e07\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48 ${result.newJobs} \u0e07\u0e32\u0e19 \u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15 ${result.changedJobs} \u0e07\u0e32\u0e19`, "info");
      writeDb(db);
      return sendJson(res, 200, {
        ok: true, kind,
        imported: result.imported.length,
        newJobs: result.newJobs,
        changedJobs: result.changedJobs,
        changes: result.changes,
        history,
        dashboard: buildDashboard(db)
      });
    }
    return sendJson(res, 422, { error: "\u0e44\u0e21\u0e48\u0e23\u0e39\u0e49\u0e08\u0e31\u0e01\u0e23\u0e39\u0e1b\u0e41\u0e1a\u0e1a\u0e44\u0e1f\u0e25\u0e4c \u2014 \u0e15\u0e49\u0e2d\u0e07\u0e40\u0e1b\u0e47\u0e19 Consol Planning \u0e2b\u0e23\u0e37\u0e2d Pickup Report (.xlsx)" });
  }

  if (req.method === "POST" && pathname === "/api/admin/import-scd") {
    const payload = await parseBody(req);
    const result = isGlobalConsolFormat(payload.csvText)
      ? importGlobalConsolRows(db, payload.csvText)
      : importScdRows(db, payload.csvText);
    const history = recordImportHistory(db, result, payload.fileName, "Manual");
    const criticalChanges = result.changes.filter(change =>
      change.changes.some(item => item !== "NEW_JOB")
    );
    if (criticalChanges.length) {
      await createAlert(db, `SCD update: มี ${criticalChanges.length} งานที่ข้อมูลเปลี่ยน กรุณาตรวจเที่ยวบิน ปลายทาง และจำนวน`, "danger");
    } else {
      await createAlert(db, `SCD update: งานใหม่ ${result.newJobs} งาน ข้อมูลซ้ำ ${result.duplicateJobs} งาน ไม่มีข้อมูลปฏิบัติการเปลี่ยน`, "info");
    }
    // Auto-create load plan when importing Global Consol CSV
    if (result.lpRows?.length) {
      if (!db.loadPlans) db.loadPlans = [];
      const autoLp = {
        id: `lp_${Date.now()}`,
        importedAt: nowIso(),
        importedBy: payload.importedBy || "admin",
        flightDate: new Date().toISOString().slice(0, 10),
        totalRows: result.lpRows.length,
        matchedCount: result.lpRows.length,
        rows: result.lpRows,
        source: "GlobalConsolCSV",
        changes: { added: result.lpRows, removed: [], hasChanges: true }
      };
      db.loadPlans.push(autoLp);
      if (db.loadPlans.length > 20) db.loadPlans = db.loadPlans.slice(-20);
    }
    writeDb(db);
    return sendJson(res, 200, {
      ok: true,
      imported: result.imported.length,
      changes: result.changes,
      changed: criticalChanges.length,
      newJobs: result.newJobs,
      duplicateJobs: result.duplicateJobs,
      duplicateRows: result.duplicateRows,
      totalRows: result.totalRows,
      uniqueRows: result.uniqueRows,
      notIssued: result.notIssued,
      history,
      dashboard: buildDashboard(db)
    });
  }

  if (req.method === "POST" && pathname === "/api/pickup/checkin") {
    const payload = await parseBody(req);
    const jobs = findPayloadJobs(db, payload);
    const job = jobs[0];
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const checkInAt = payload.startTime || nowIso();
    const logs = [];
    for (const item of jobs) {
      let log = findOpenActivity(db, item.houseNumber, "CheckIn");
      if (!log) {
        log = logActivity(db, { ...payload, houseNumber: item.houseNumber, activityType: "CheckIn", startTime: checkInAt });
      }
      logs.push(log);
      item.status = "PickupStarted";
      item.startPlace = payload.startPlace || item.startPlace;
      item.checkInAt = item.checkInAt || checkInAt;
      item.checkInGps = payload.gpsLat && payload.gpsLong ? `${payload.gpsLat},${payload.gpsLong}` : item.checkInGps;
      item.updatedAt = nowIso();
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), jobs: jobs.map(normalizeJob), logs });
  }

  if (req.method === "POST" && pathname === "/api/pickup/pause") {
    const payload = await parseBody(req);
    const jobs = findPayloadJobs(db, payload);
    const job = jobs[0];
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const action = payload.action === "resume" ? "resume" : "pause";
    const ts = nowIso();
    for (const item of jobs) {
      item.pauseEvents ||= [];
      if (action === "pause") {
        item.pauseEvents.push({
          startedAt: ts,
          reason: payload.reason || "WarehouseDelay",
          note: payload.note || "",
          userId: payload.userId || ""
        });
        item.kpiPaused = true;
        item.kpiPauseReason = payload.reason || "WarehouseDelay";
        logActivity(db, { ...payload, houseNumber: item.houseNumber, activityType: "PauseTime", startTime: ts });
      } else {
        const open = [...item.pauseEvents].reverse().find(event => !event.endedAt);
        if (open) {
          open.endedAt = ts;
          open.durationMinutes = Math.max(0, Math.round((new Date(ts) - new Date(open.startedAt)) / 60000));
        }
        item.kpiPaused = item.pauseEvents.some(event => !event.endedAt);
        logActivity(db, { ...payload, houseNumber: item.houseNumber, activityType: "ResumeTime", endTime: ts });
      }
      item.updatedAt = ts;
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, action, jobs: jobs.map(normalizeJob) });
  }

  if (req.method === "POST" && pathname === "/api/pickup/load") {
    const payload = await parseBody(req);
    const jobs = findPayloadJobs(db, payload);
    const job = jobs[0];
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const checklist = Array.isArray(payload.checklist) ? payload.checklist : [];
    const needsSticker = payload.pickupCase === "SpecialMD" || jobs.some(item => /wd|western digital/i.test(item.customerName || ""));
    if (checklist.length < 10) return sendJson(res, 422, { error: "Pickup checklist must be completed" });
    if (needsSticker && !String(payload.stickerColor || "").trim()) return sendJson(res, 422, { error: "Sticker color is required for special/WD jobs" });
    const pickupRows = normalizePickupItems(payload.pickupItems || "");
    const loadedAt = nowIso();
    for (const item of jobs) {
      const ownRows = pickupRows.filter(row => row.houseNumber === item.houseNumber);
      const rowDestination = "WH3";
      Object.assign(item, {
        pickupCase: payload.pickupCase || item.pickupCase,
        stickerColor: payload.stickerColor || item.stickerColor,
        pickupChecklist: checklist,
        pickupItems: ownRows.length ? ownRows : normalizePickupItems(item.pickupItems || ""),
        destination: rowDestination,
        endPlace: "WH3",
        routeNextModule: "Module2",
        routeComplianceStatus: "MustReturnWH3",
        loadedAt,
        loadedGps: payload.gpsLat && payload.gpsLong ? `${payload.gpsLat},${payload.gpsLong}` : item.loadedGps,
        status: "CargoLoaded",
        updatedAt: nowIso()
      });
      logActivity(db, {
        ...payload,
        houseNumber: item.houseNumber,
        activityType: "CargoLoaded",
        startTime: payload.startTime || loadedAt,
        endTime: loadedAt
      });
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), jobs: jobs.map(normalizeJob) });
  }

  if (req.method === "POST" && pathname === "/api/pickup/complete") {
    const payload = await parseBody(req);
    const jobs = findPayloadJobs(db, payload);
    const job = jobs[0];
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (jobs.some(item => !item.checkInAt)) return sendJson(res, 409, { error: "Check in before completing pickup" });
    if (!Array.isArray(payload.productImages) || !payload.productImages.length) {
      return sendJson(res, 422, { error: "At least one product photo is required" });
    }
    if ((!Array.isArray(payload.cargoImages) || !payload.cargoImages.length) && !payload.imageBase64) {
      return sendJson(res, 422, { error: "Signed Cargo Pickup Form photo is required" });
    }
    const nonWh3Rows = normalizePickupItems(payload.pickupItems || "").filter(row => row.destination && String(row.destination).toUpperCase() !== "WH3");
    if (nonWh3Rows.length) {
      return sendJson(res, 422, { error: `ตามกฎประชุม สินค้าต้องกลับเข้า WH3 ก่อนส่ง Terminal — พบปลายทางอื่น: ${nonWh3Rows.map(r => r.houseNumber + "→" + r.destination).join(", ")}` });
    }
    if (!Array.isArray(payload.doorClosedImages) || !payload.doorClosedImages.length) {
      return sendJson(res, 422, { error: "Closed container/vehicle door photo is required before leaving customer site" });
    }
    let image = null;
    for (const item of jobs) {
      saveBase64Files(db, {
        houseNumber: item.houseNumber,
        fileType: "ProductImage",
        files: payload.productImages
      });
      saveBase64Files(db, {
        houseNumber: item.houseNumber,
        fileType: "CargoForm",
        files: payload.cargoImages
      });
      saveBase64Files(db, {
        houseNumber: item.houseNumber,
        fileType: "DoorClosedAudit",
        files: payload.doorClosedImages
      });
      image = saveBase64File(db, {
        houseNumber: item.houseNumber,
        fileType: "SignedCargoForm",
        base64: payload.imageBase64,
        mimeType: payload.mimeType
      });
      saveBase64File(db, {
        houseNumber: item.houseNumber,
        fileType: "Signature",
        base64: payload.signatureBase64,
        mimeType: "image/png"
      });
    }
    const completedAt = nowIso();
    for (const item of jobs) {
      const openCheckIn = findOpenActivity(db, item.houseNumber, "CheckIn");
      if (openCheckIn) openCheckIn.endTime = completedAt;
      logActivity(db, {
        ...payload,
        houseNumber: item.houseNumber,
        activityType: "PickupComplete",
        startTime: payload.startTime || item.checkInAt || completedAt,
        endTime: completedAt
      });
    }
    const pickupRows = normalizePickupItems(payload.pickupItems || "");
    for (const item of jobs) {
      const ownRows = pickupRows.filter(row => row.houseNumber === item.houseNumber);
      const rowDestination = "WH3";
      Object.assign(item, {
        pickupCase: payload.pickupCase || item.pickupCase,
        stickerColor: payload.stickerColor || item.stickerColor,
        pickupChecklist: Array.isArray(payload.checklist) ? payload.checklist : item.pickupChecklist,
        pieceCount: ownRows[0]?.carton || payload.pieceCount || item.pieceCount,
        pickupItems: ownRows.length ? ownRows : normalizePickupItems(item.pickupItems || ""),
        packageType: payload.packageType || item.packageType,
        inspectorName: payload.inspectorName || item.inspectorName,
        receiverName: payload.receiverName || item.receiverName,
        endPlace: "WH3",
        destination: rowDestination,
        routeNextModule: "Module2",
        routeComplianceStatus: "MustReturnWH3",
        doorClosedPhotoAt: completedAt,
        completedAt,
        completeGps: payload.gpsLat && payload.gpsLong ? `${payload.gpsLat},${payload.gpsLong}` : item.completeGps,
        status: "Delivered",
        updatedAt: nowIso()
      });
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), jobs: jobs.map(normalizeJob), image });
  }

  if (req.method === "POST" && pathname === "/api/inbound/document-check") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    saveBase64Files(db, {
      houseNumber: job.houseNumber,
      fileType: "InboundDocument",
      files: payload.documentFiles
    });
    job.inboundDocStatus = payload.documentStatus || "Found";
    job.inboundDocNote = payload.note || "";
    job.status = job.inboundDocStatus === "Missing" ? "PendingEI" : "DocumentChecked";
    job.updatedAt = nowIso();
    await createAlert(db, job.inboundDocStatus === "Missing"
      ? `Inbound pending EI confirm: ${job.houseNumber}`
      : `Inbound document checked: ${job.houseNumber}`, job.inboundDocStatus === "Missing" ? "warning" : "info");
    logActivity(db, { ...payload, activityType: "InboundDocumentCheck" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job) });
  }

  if (req.method === "POST" && pathname === "/api/inbound/open") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (job.inboundDocStatus === "Missing" && !payload.eiConfirmed) {
      return sendJson(res, 422, { error: "EI confirm is required before opening inbound job" });
    }
    job.inboundOpenedAt = nowIso();
    job.status = "InboundOpened";
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "InboundOpened" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job) });
  }

  if (req.method === "POST" && pathname === "/api/inbound/scan-house") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "House number not found" });
    if (payload.flightChanged && payload.updatedFlightNo) {
      job.previousFlightNo = job.flightNo;
      job.flightNo = payload.updatedFlightNo;
      job.trackUpdatedAt = nowIso();
      await createAlert(db, `Track updated: ${job.houseNumber} / ${job.previousFlightNo || "-"} -> ${job.flightNo}`, "warning");
    }
    job.trackType = payload.trackType || job.trackType || "Single";
    job.inboundScannedAt = nowIso();
    job.status = job.trackType === "Pair" ? "ReadyForTerminal" : "HouseIdentified";
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "InboundHouseScan" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job) });
  }

  if (req.method === "POST" && pathname === "/api/inbound/twin-scan") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    const location = db.locations.find(item => item.id === payload.locationId);
    if (!job) return sendJson(res, 404, { error: "House number not found" });
    if (!location) return sendJson(res, 404, { error: "Location not found" });
    if (location.status === "Occupied" && location.currentHouseId !== job.houseNumber) {
      return sendJson(res, 409, { error: `Location ${location.id} is already occupied` });
    }
    const isWd = /wd|western digital/i.test(job.customerName || "");
    if (isWd && (!Array.isArray(payload.wdChecklist) || payload.wdChecklist.length < 4)) {
      return sendJson(res, 422, { error: "Complete the WD condition checklist before putaway" });
    }
    if (isWd && !String(payload.stickerColor || "").trim()) {
      return sendJson(res, 422, { error: "Sticker color is required for WD cargo" });
    }
    if (job.locationId && job.locationId !== location.id) {
      const previousLocation = db.locations.find(item => item.id === job.locationId);
      if (previousLocation && previousLocation.currentHouseId === job.houseNumber) {
        previousLocation.status = "Available";
        previousLocation.currentHouseId = "";
      }
      job.previousLocationId = job.locationId;
      job.locationMovedAt = nowIso();
    }
    location.status = "Occupied";
    location.currentHouseId = job.houseNumber;
    job.status = payload.trackType === "Pair" ? "ReadyForTerminal" : "Stored";
    job.locationId = location.id;
    job.dimensionText = payload.dimensionText || job.dimensionText || "";
    job.trackType = payload.trackType || job.trackType || "Single";
    job.wdChecklist = Array.isArray(payload.wdChecklist) ? payload.wdChecklist : (job.wdChecklist || []);
    job.inboundStickerColor = payload.stickerColor || job.inboundStickerColor || "";
    if (payload.pallets !== undefined) job.warehousePallets = Number(payload.pallets) || 0;
    if (payload.boxes !== undefined) job.warehouseBoxes = Number(payload.boxes) || 0;
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "TwinScan" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), location });
  }

  if (req.method === "POST" && pathname === "/api/inbound/move-location") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    const newLocation = db.locations.find(item => item.id === payload.newLocationId);
    if (!job) return sendJson(res, 404, { error: "House number not found" });
    if (!newLocation) return sendJson(res, 404, { error: "New location not found" });
    if (newLocation.status === "Occupied" && newLocation.currentHouseId !== job.houseNumber) {
      return sendJson(res, 409, { error: `Location ${newLocation.id} is already occupied` });
    }

    const previousLocationId = job.locationId || "";
    const previousLocation = db.locations.find(item => item.id === previousLocationId);
    if (previousLocation && previousLocation.currentHouseId === job.houseNumber) {
      previousLocation.status = "Available";
      previousLocation.currentHouseId = "";
    }

    newLocation.status = "Occupied";
    newLocation.currentHouseId = job.houseNumber;
    job.previousLocationId = previousLocationId;
    job.locationId = newLocation.id;
    job.locationMovedAt = nowIso();
    job.locationMoveNote = payload.note || "";
    job.status = job.status === "ReadyForTerminal" ? job.status : "Stored";
    job.updatedAt = nowIso();
    logActivity(db, {
      ...payload,
      activityType: "LocationMove",
      locationId: newLocation.id,
      previousLocationId
    });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), location: newLocation, previousLocationId });
  }

  if (req.method === "POST" && pathname === "/api/inbound/close") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!Array.isArray(payload.evidenceFiles) || !payload.evidenceFiles.length) {
      return sendJson(res, 422, { error: "Cargo Pickup Form or EI confirmation evidence is required" });
    }
    saveBase64Files(db, {
      houseNumber: job.houseNumber,
      fileType: "InboundEvidence",
      files: payload.evidenceFiles
    });
    job.status = job.trackType === "Pair" ? "ReadyForTerminal" : "Stored";
    job.inboundClosedAt = nowIso();
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "InboundClosed", endTime: nowIso() });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job) });
  }

  if (req.method === "POST" && pathname === "/api/activity/step") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    try {
      const step = updateTrackedStep(db, job, payload);
      writeDb(db);
      return sendJson(res, 200, { ok: true, step, job: normalizeJob(job), dashboard: buildDashboard(db) });
    } catch (error) {
      return sendJson(res, 422, { error: error.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/outbound/return") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const action = payload.action === "complete" ? "finish" : "start";
    const step = updateTrackedStep(db, job, {
      ...payload,
      action,
      stepKey: "return_goods",
      stepName: "Returned Goods"
    });
    job.returnProcess = {
      ...(job.returnProcess || {}),
      reason: payload.reason || job.returnProcess?.reason || "",
      destination: payload.destination || job.returnProcess?.destination || "WH3",
      status: action === "finish" ? "Returned" : "ReturnInProgress",
      startedAt: step.startedAt,
      completedAt: step.completedAt || "",
      userId: step.userId
    };
    job.status = job.returnProcess.status;
    saveBase64Files(db, {
      houseNumber: job.houseNumber,
      fileType: "ReturnEvidence",
      files: payload.evidenceFiles
    });
    if (action === "finish") {
      await createAlert(db, `Returned goods completed: ${job.houseNumber} -> ${job.returnProcess.destination}`, "warning");
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, step, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/validate") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const missingLithiumDocs = job.requiresLithiumDocs && !payload.lithiumDocBase64;
    if (missingLithiumDocs) return sendJson(res, 422, { error: "Lithium document is required" });
    if (payload.lithiumDocBase64) {
      saveBase64File(db, {
        houseNumber: job.houseNumber,
        fileType: "LithiumDocument",
        base64: payload.lithiumDocBase64,
        mimeType: payload.mimeType || "image/jpeg"
      });
    }
    job.documentValidated = true;
    if (Array.isArray(payload.terminalDocChecklist)) {
      job.terminalDocChecklist = payload.terminalDocChecklist;
    }
    job.updatedAt = nowIso();
    logActivity(db, { houseNumber: job.houseNumber, activityType: "TerminalDocValidated", terminalDocChecklist: job.terminalDocChecklist });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/wh3-dispatch-check") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const terminal = normalizeTerminal(payload.terminalDestination || job.terminalDestination || job.destination || "TG");
    const required = TERMINAL_PROFILES[terminal]?.checklist || TERMINAL_PROFILES.TG.checklist;
    const checked = Array.isArray(payload.checklist) ? payload.checklist : [];
    const missing = required.filter(item => !checked.includes(item));
    if (missing.length) {
      return sendJson(res, 422, { error: `WH3 pre-dispatch documents incomplete: ${missing.join(", ")}` });
    }
    const now = nowIso();
    saveBase64Files(db, { houseNumber: job.houseNumber, fileType: "WH3PreDispatchEvidence", files: payload.evidenceFiles });
    Object.assign(job, {
      terminalDestination: terminal,
      wh3PreDispatchChecklist: checked,
      wh3PreDispatchReady: true,
      wh3PreDispatchAt: now,
      wh3PreDispatchBy: payload.userId || "",
      wh3PreDispatchNote: payload.note || "",
      terminalProfileNote: TERMINAL_PROFILES[terminal]?.note || "",
      updatedAt: now
    });
    logActivity(db, { houseNumber: job.houseNumber, userId: payload.userId, activityType: "WH3PreDispatchChecked", terminalDestination: terminal, checklist: checked });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), terminalProfile: TERMINAL_PROFILES[terminal] });
  }

  if (req.method === "POST" && pathname === "/api/outbound/transfer-form") {
    const payload = await parseBody(req);
    const houses = Array.isArray(payload.houses) ? [...new Set(payload.houses.map(value => String(value || "").trim()).filter(Boolean))] : [];
    const jobs = houses.map(house => findJob(db, house)).filter(Boolean);
    if (!jobs.length) return sendJson(res, 404, { error: "No matching House found" });
    if (payload.action !== "return") {
      if (!Array.isArray(payload.permitFiles) || !payload.permitFiles.length) {
        return sendJson(res, 422, { error: "Permit document is required before issuing Cargo Transfer" });
      }
      const lithiumJobs = jobs.filter(job => job.requiresLithiumDocs || /lithium/i.test(job.productType || ""));
      if (lithiumJobs.length && (!Array.isArray(payload.lithiumFiles) || !payload.lithiumFiles.length)) {
        return sendJson(res, 422, { error: `Lithium document is required for ${lithiumJobs.map(job => job.houseNumber).join(", ")}` });
      }
    }
    const issuedAt = nowIso();
    jobs.forEach(job => {
      if (payload.action === "return") {
        saveBase64File(db, { houseNumber: job.houseNumber, fileType: "CargoTransferReturned", base64: payload.imageBase64, mimeType: payload.mimeType || "image/jpeg" });
        job.cargoTransferReturnedAt = issuedAt;
      } else {
        saveBase64Files(db, { houseNumber: job.houseNumber, fileType: "CargoTransferPermit", files: payload.permitFiles });
        saveBase64Files(db, { houseNumber: job.houseNumber, fileType: "CargoTransferLithium", files: payload.lithiumFiles });
        Object.assign(job, {
          cargoTransferIssuedAt: issuedAt,
          cargoTransferGroup: houses,
          cargoTransferDate: payload.transferDate || "",
          cargoTransferTime: payload.transferTime || "",
          cargoTransferFrom: payload.transferFrom || "WH3",
          terminalDestination: payload.transferTo || job.destination || "TG",
          aotDriverName: payload.driverName || job.driverName || "",
          aotVehiclePlate: payload.vehiclePlate || job.vehiclePlate || "",
          aotVehicleType: payload.vehicleType || "",
          cargoTransferReleaseBy: payload.releaseBy || "",
          eiBarcodeReference: payload.eiBarcodeReference || ""
        });
        job.cargoTransferPermitAttached = Array.isArray(payload.permitFiles) && payload.permitFiles.length > 0;
        job.cargoTransferLithiumAttached = Array.isArray(payload.lithiumFiles) && payload.lithiumFiles.length > 0;
      }
      job.updatedAt = issuedAt;
      logActivity(db, { houseNumber: job.houseNumber, userId: payload.userId, activityType: payload.action === "return" ? "CargoTransferReturned" : "CargoTransferIssued" });
    });
    writeDb(db);
    return sendJson(res, 200, { ok: true, jobs: jobs.map(normalizeJob), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/picking") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (job.locationId && !job.outboundFoundAt) {
      return sendJson(res, 409, { error: "Confirm location and scan label before picking" });
    }
    saveBase64Files(db, { houseNumber: job.houseNumber, fileType: "OutboundDocument", files: payload.documentFiles });
    job.cargoTransferNote = payload.note || job.cargoTransferNote || "";
    job.status = "OutboundPicking";
    job.outboundPickedAt = nowIso();
    if (job.locationId) {
      const location = db.locations.find(item => item.id === job.locationId);
      if (location) {
        location.status = "Available";
        location.currentHouseId = "";
      }
    }
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "OutboundPicking" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/confirm-location") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const scannedHouse = String(payload.scannedHouse || "").trim().toUpperCase();
    const expectedHouse = String(job.houseNumber || "").trim().toUpperCase();
    if (!scannedHouse || scannedHouse !== expectedHouse) {
      return sendJson(res, 409, { error: `Scanned label does not match ${job.houseNumber}` });
    }
    job.outboundFoundAt = nowIso();
    job.outboundFoundBy = payload.userId || "";
    job.status = "OutboundLocated";
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "OutboundLocationFound" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/ei-approve") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!job.outboundPickedAt) return sendJson(res, 409, { error: "Confirm picking before EI approval" });
    if (!payload.imageBase64) return sendJson(res, 422, { error: "EI signed document photo is required" });
    saveBase64File(db, { houseNumber: job.houseNumber, fileType: "EISignProof", base64: payload.imageBase64, mimeType: payload.mimeType || "image/jpeg" });
    job.eiApproved = true;
    job.eiApprovedAt = nowIso();
    job.status = "EIApproved";
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "EIApproved" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/aot-booking") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!job.eiApproved) return sendJson(res, 409, { error: "EI approval is required before AOT booking" });
    if (!job.wh3PreDispatchReady) return sendJson(res, 409, { error: "Complete WH3 original document checklist before terminal booking" });
    if (payload.approved && !job.aotBookedAt) return sendJson(res, 409, { error: "Book the AOT queue before approval" });
    const terminal = normalizeTerminal(payload.terminalDestination || job.terminalDestination || job.destination || "TG");
    const workflowStatus = payload.approved ? "TerminalConfirmed" : "BookingRequested";
    const event = {
      at: nowIso(),
      status: workflowStatus,
      terminal,
      userId: payload.userId || "",
      vehiclePlate: payload.vehiclePlate || "",
      driverName: payload.driverName || ""
    };
    Object.assign(job, {
      terminalDestination: terminal,
      aotVehiclePlate: payload.vehiclePlate || "",
      aotDriverName: payload.driverName || "",
      aotVehicleModel: payload.vehicleModel || "",
      aotVehicleType: payload.vehicleType || "",
      aotQueueStatus: payload.approved ? "Approved" : "Booked",
      aotBookedAt: job.aotBookedAt || nowIso(),
      aotApprovedAt: payload.approved ? nowIso() : job.aotApprovedAt,
      status: payload.approved ? "AOTQueueApproved" : "AOTQueueBooked",
      terminalWorkflowStatus: workflowStatus,
      terminalProfileNote: TERMINAL_PROFILES[terminal]?.note || "",
      updatedAt: nowIso()
    });
    job.terminalWorkflowEvents ||= [];
    job.terminalWorkflowEvents.push(event);
    logActivity(db, { ...payload, activityType: payload.approved ? "AOTQueueApproved" : "AOTQueueBooked" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/load-bay") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!job.aotApprovedAt) return sendJson(res, 409, { error: "AOT queue must be approved before loading" });
    if (!payload.arrived && !payload.imageBase64) return sendJson(res, 422, { error: "Pre-load vehicle photo is required" });
    saveBase64File(db, { houseNumber: job.houseNumber, fileType: "PreLoadPhoto", base64: payload.imageBase64, mimeType: payload.mimeType || "image/jpeg" });
    const terminal = normalizeTerminal(job.terminalDestination || payload.terminalDestination || job.destination || "TG");
    const workflowStatus = payload.arrived ? "Arrived" : "VehicleQueued";
    job.status = payload.arrived ? "TerminalArrived" : "GoodsLoaded";
    job.goodsLoadedAt = job.goodsLoadedAt || nowIso();
    job.terminalArrivedAt = payload.arrived ? nowIso() : job.terminalArrivedAt;
    job.terminalDestination = terminal;
    job.terminalWorkflowStatus = workflowStatus;
    job.terminalWorkflowEvents ||= [];
    job.terminalWorkflowEvents.push({ at: nowIso(), status: workflowStatus, terminal, userId: payload.userId || "" });
    if (terminal === "BFS" && workflowStatus === "VehicleQueued") {
      job.terminalRiskFlag = true;
      job.terminalRiskReason = "BFS queue/trailer parking needs monitoring";
    }
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: payload.arrived ? "TerminalArrived" : "GoodsLoaded" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/weigh-start") {
    const payload = await parseBody(req);
    const db = readDb();
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const terminal = normalizeTerminal(job.terminalDestination || payload.terminalDestination || job.destination || "TG");
    job.weighStartedAt = nowIso();
    job.unloadingStartedAt = job.unloadingStartedAt || job.weighStartedAt;
    job.terminalWorkflowStatus = "UnloadingStarted";
    job.terminalDestination = terminal;
    job.terminalWorkflowEvents ||= [];
    job.terminalWorkflowEvents.push({ at: job.weighStartedAt, status: "UnloadingStarted", terminal, userId: payload.userId || "" });
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "WeighStart" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, weighStartedAt: job.weighStartedAt });
  }

  if (req.method === "POST" && pathname === "/api/outbound/weight-dimension") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    job.terminalWeight = payload.weight || "";
    job.terminalDimension = payload.dimension || "";
    job.status = payload.packing ? "PackingConsolidation" : "WeightDimensionRecorded";
    if (payload.packing) job.packingCompletedAt = nowIso();
    if (payload.weighStartedAt) job.weighStartedAt = payload.weighStartedAt;
    job.weighEndedAt = nowIso();
    job.unloadingCompletedAt = job.weighEndedAt;
    job.terminalWorkflowStatus = "UnloadingCompleted";
    job.terminalWorkflowEvents ||= [];
    job.terminalWorkflowEvents.push({ at: job.weighEndedAt, status: "UnloadingCompleted", terminal: normalizeTerminal(job.terminalDestination || job.destination || "TG"), userId: payload.userId || "" });
    const startMs = new Date(job.unloadingStartedAt || job.weighStartedAt || job.terminalArrivedAt || job.weighEndedAt).getTime();
    const endMs = new Date(job.weighEndedAt).getTime();
    const terminal = normalizeTerminal(job.terminalDestination || job.destination || "TG");
    if (!isNaN(startMs) && !isNaN(endMs)) {
      job.unloadingMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
      job.terminalSlaMinutes = TERMINAL_PROFILES[terminal]?.slaMinutes || 180;
      job.terminalSlaStatus = job.unloadingMinutes > job.terminalSlaMinutes ? "OverSLA" : "WithinSLA";
    }
    job.updatedAt = nowIso();
    logActivity(db, { ...payload, activityType: "WeightDimension" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/xray") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    job.xrayStatus = payload.hold ? "Hold" : (payload.passed ? "Passed" : "Failed");
    job.requiresRescan = Boolean(payload.requiresRescan);
    job.status = job.xrayStatus === "Passed" ? "XRayPassed" : (payload.hold ? "XRayHold" : "ReXRayRequired");
    job.updatedAt = nowIso();
    logActivity(db, {
      ...payload,
      activityType: "XRay",
      startTime: payload.startTime || nowIso(),
      endTime: nowIso()
    });
    if (job.requiresRescan) {
      await createAlert(db, `ต้อง Re-X-Ray: ${job.houseNumber} / Flight ${job.flightNo}`, "danger");
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/outbound/loading-detail") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const flightJobs = db.jobs.filter(item => item.flightNo === job.flightNo);
    if (!flightJobs.every(item => item.xrayStatus === "Passed")) {
      return sendJson(res, 409, { error: "Every house on this flight must pass X-Ray first" });
    }
    if (payload.imageBase64) {
      saveBase64File(db, {
        houseNumber: job.houseNumber,
        fileType: "LoadingDetail_1",
        base64: payload.imageBase64,
        mimeType: payload.mimeType || "image/jpeg"
      });
    }
    if (payload.loadingImage2Base64) {
      saveBase64File(db, {
        houseNumber: job.houseNumber,
        fileType: "LoadingDetail_2",
        base64: payload.loadingImage2Base64,
        mimeType: payload.loadingImage2MimeType || "image/jpeg"
      });
    }
    if (Array.isArray(payload.palletPhotos)) {
      payload.palletPhotos.forEach((photo, idx) => {
        if (photo.base64) {
          saveBase64File(db, {
            houseNumber: job.houseNumber,
            fileType: `PalletPhoto_${idx + 1}`,
            base64: photo.base64,
            mimeType: photo.mimeType || "image/jpeg"
          });
        }
      });
    }
    job.trayNumber = payload.trayNumber || job.trayNumber || "";
    job.loadingDetailCount = payload.loadingDetailCount || 1;
    job.packingCompletedAt = job.packingCompletedAt || nowIso();
    for (const item of flightJobs) {
      item.loadingDetailUploaded = true;
      item.readyForBilling = true;
      item.status = "ReadyForBilling";
      item.terminalClosedAt = nowIso();
      item.updatedAt = nowIso();
    }
    await createAlert(db, `พร้อมวางบิล: Flight ${job.flightNo}`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/billing/review-batch") {
    const payload = await parseBody(req);
    const jobs = findPayloadJobs(db, payload);
    if (!jobs.length) return sendJson(res, 404, { error: "No matching billing jobs" });
    const invalid = jobs.filter(job => !job.readyForBilling && !["BillingReviewed", "InvoiceDrafted", "PendingBillingReview"].includes(job.status));
    if (invalid.length) return sendJson(res, 409, { error: `Jobs are not ready for billing: ${invalid.map(job => job.houseNumber).join(", ")}` });
    const documentProblems = [];
    jobs.forEach(job => {
      const docs = billingDocumentStatus(db, job);
      job.billingReviewStatus = docs.ready ? "Reviewed" : "PendingBillingReview";
      job.billingReviewNote = payload.groupName || "Batch review";
      job.billingDocuments = docs;
      job.status = docs.ready ? "BillingReviewed" : "PendingBillingReview";
      job.updatedAt = nowIso();
      if (!docs.ready) documentProblems.push({ houseNumber: job.houseNumber, documents: docs });
    });
    writeDb(db);
    return sendJson(res, documentProblems.length ? 422 : 200, {
      ok: !documentProblems.length,
      reviewed: jobs.length - documentProblems.length,
      documentProblems,
      dashboard: buildDashboard(db)
    });
  }

  if (req.method === "POST" && pathname === "/api/billing/generate-batch") {
    const payload = await parseBody(req);
    const jobs = findPayloadJobs(db, payload);
    if (!jobs.length) return sendJson(res, 404, { error: "No matching billing jobs" });
    const customerIds = [...new Set(jobs.map(job => job.customerId).filter(Boolean))];
    if (customerIds.length !== 1) return sendJson(res, 409, { error: "A batch invoice must contain one customer only" });
    const notReviewed = jobs.filter(job => job.billingReviewStatus !== "Reviewed" && job.status !== "BillingReviewed");
    if (notReviewed.length) return sendJson(res, 409, { error: `Review documents first: ${notReviewed.map(job => job.houseNumber).join(", ")}` });
    const customer = db.customers.find(item => item.id === customerIds[0]);
    const bill = {
      id: `INV-${new Date().getFullYear()}-${String(db.billing.length + 1).padStart(4, "0")}`,
      batch: true,
      houseNumber: jobs[0].houseNumber,
      houseNumbers: jobs.map(job => job.houseNumber),
      customerId: customerIds[0],
      customerName: customer?.name || jobs[0].customerName,
      billingEmail: customer?.billingEmail || "",
      billingMonth: payload.billingMonth || "",
      billingPeriod: payload.billingPeriod || "FullMonth",
      billingPlan: payload.billingPlan || "General",
      tripCount: Number(payload.tripCount || jobs.length),
      amount: Number(payload.amount || jobs.reduce((sum, job) => sum + Number(job.amount || 0), 0)),
      draftedAt: nowIso(),
      dueDate: new Date(Date.now() + Number(customer?.creditTerm || 0) * 864e5).toISOString(),
      status: "Draft"
    };
    bill.pdfUrl = generateBatchInvoiceHtml(bill, jobs, customer);
    db.billing.push(bill);
    jobs.forEach(job => {
      job.status = "InvoiceDrafted";
      job.invoiceId = bill.id;
      job.billingStatus = "InvoiceDrafted";
      job.updatedAt = nowIso();
    });
    writeDb(db);
    return sendJson(res, 200, { ok: true, bill, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/billing/generate") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!job.readyForBilling) return sendJson(res, 409, { error: "Job is not ready for billing" });
    const docs = billingDocumentStatus(db, job);
    if (job.billingReviewStatus !== "Reviewed" && !payload.forceDraft) {
      return sendJson(res, 409, { error: "Review billing documents before creating invoice" });
    }
    const customer = db.customers.find(item => item.id === job.customerId);
    const bill = {
      id: `INV-${new Date().getFullYear()}-${String(db.billing.length + 1).padStart(4, "0")}`,
      houseNumber: job.houseNumber,
      customerId: job.customerId,
      customerName: customer ? customer.name : job.customerName,
      billingEmail: customer ? customer.billingEmail : "",
      amount: Number(job.amount || 0),
      draftedAt: nowIso(),
      dueDate: new Date(Date.now() + Number(customer?.creditTerm || 0) * 864e5).toISOString(),
      status: "Draft",
      documentStatus: docs
    };
    bill.pdfUrl = generateInvoiceHtml(db, bill, job, customer);
    db.billing.push(bill);
    job.status = "InvoiceDrafted";
    job.invoiceId = bill.id;
    job.billingStatus = "InvoiceDrafted";
    job.updatedAt = nowIso();
    writeDb(db);
    return sendJson(res, 200, { ok: true, bill, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/billing/review") {
    const payload = await parseBody(req);
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    if (!job.readyForBilling && job.status !== "InvoiceDrafted") {
      return sendJson(res, 409, { error: "Job is not in billing queue" });
    }
    const docs = billingDocumentStatus(db, job);
    const approved = payload.status === "Reviewed";
    job.billingReviewStatus = approved ? "Reviewed" : "PendingBillingReview";
    job.billingReviewNote = payload.note || "";
    job.billingDocuments = docs;
    job.status = approved ? "BillingReviewed" : "PendingBillingReview";
    job.updatedAt = nowIso();
    await createAlert(db, approved ? `เอกสารพร้อมวางบิล: ${job.houseNumber}` : `พักรายการวางบิล: ${job.houseNumber}`, approved ? "info" : "warning");
    writeDb(db);
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), docs, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/billing/send-email") {
    const payload = await parseBody(req);
    const bill = db.billing.find(item => item.id === payload.invoiceId);
    if (!bill) return sendJson(res, 404, { error: "Invoice not found" });
    const emailAttachments = saveBase64Files(db, {
      houseNumber: bill.houseNumber,
      fileType: "InvoiceEmailAttachment",
      files: payload.emailFiles
    });
    bill.emailAttachments = [
      ...(bill.emailAttachments || []),
      ...emailAttachments.map(file => ({
        fileId: file.fileId,
        url: file.url,
        mimeType: file.mimeType,
        createdAt: file.createdAt
      }))
    ];
    const delivery = await deliverInvoiceEmail(bill, bill.emailAttachments.map(item => item.url));
    bill.status = delivery.delivered ? "Sent" : "EmailQueued";
    bill.emailDeliveryStatus = delivery.status;
    bill.sentAt = nowIso();
    const billJobs = (bill.houseNumbers || [bill.houseNumber]).map(houseNumber => findJob(db, houseNumber)).filter(Boolean);
    billJobs.forEach(job => {
      job.status = "InvoiceSent";
      job.billingStatus = "InvoiceSent";
      job.updatedAt = nowIso();
    });
    await createAlert(db, `${delivery.delivered ? "Invoice sent" : "Invoice queued"}: ${bill.id} to ${bill.billingEmail} (${bill.emailAttachments.length} attachments)`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, bill, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/billing/mark-billed") {
    const payload = await parseBody(req);
    const bill = db.billing.find(item => item.id === payload.invoiceId);
    if (!bill) return sendJson(res, 404, { error: "Invoice not found" });
    const billJobs = (bill.houseNumbers || [bill.houseNumber]).map(houseNumber => findJob(db, houseNumber)).filter(Boolean);
    bill.status = "Billed";
    bill.billedDate = nowIso();
    billJobs.forEach(job => {
      job.status = "Billed";
      job.billingStatus = "Billed";
      job.readyForBilling = false;
      job.dueDate = bill.dueDate;
      job.updatedAt = nowIso();
    });
    await createAlert(db, `Billed: ${bill.id}`, "info");
    writeDb(db);
    return sendJson(res, 200, { ok: true, bill, dashboard: buildDashboard(db) });
  }

  if (req.method === "POST" && pathname === "/api/customers/upsert") {
    const payload = await parseBody(req);
    const name = String(payload.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Customer name is required" });
    let customer = payload.id ? db.customers.find(item => item.id === payload.id) : null;
    if (!customer) {
      customer = db.customers.find(item => item.name.toLowerCase() === name.toLowerCase());
    }
    if (!customer) {
      customer = getOrCreateCustomer(db, name, payload);
    }
    customer.name = name;
    customer.billingEmail = payload.billingEmail || "";
    customer.phone = payload.phone || "";
    customer.taxId = payload.taxId || "";
    customer.creditTerm = Number(payload.creditTerm || 0);
    customer.address = payload.address || "";
    for (const job of db.jobs) {
      if (job.customerId === customer.id || job.customerName === name || job.houseNumber === payload.houseNumber) {
        job.customerId = customer.id;
        job.customerName = customer.name;
        job.updatedAt = nowIso();
      }
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, customer, dashboard: buildDashboard(db), customers: db.customers });
  }

  if (req.method === "POST" && pathname === "/api/users/upsert") {
    const payload = await parseBody(req);
    const name = String(payload.name || "").trim();
    const code = String(payload.code || "").trim().toUpperCase();
    const allowedRoles = new Set(["Driver", "WH_Staff", "Terminal", "Billing", "Admin", "Executive"]);
    if (!name || !code) return sendJson(res, 400, { error: "Employee code and name are required" });
    if (!allowedRoles.has(payload.role)) return sendJson(res, 400, { error: "Invalid role" });
    const duplicate = db.users.find(user => String(user.code || "").toUpperCase() === code && user.id !== payload.id);
    if (duplicate) return sendJson(res, 409, { error: `Employee code ${code} already exists` });
    let user = payload.id ? db.users.find(item => item.id === payload.id) : null;
    if (!user) {
      const roleKey = String(payload.role).toLowerCase().replace(/[^a-z0-9]+/g, "_");
      user = { id: `u_${roleKey}_${Date.now()}`, createdAt: nowIso() };
      db.users.push(user);
    }
    Object.assign(user, {
      code,
      name,
      role: payload.role,
      vehiclePlate: payload.role === "Driver" ? String(payload.vehiclePlate || "").trim() : "",
      phone: String(payload.phone || "").trim(),
      lineUserId: String(payload.lineUserId || "").trim(),
      lineConnected: Boolean(payload.lineUserId),
      status: payload.status === "Inactive" ? "Inactive" : "Active",
      updatedAt: nowIso()
    });
    writeDb(db);
    return sendJson(res, 200, { ok: true, user, users: db.users, dashboard: buildDashboard(db) });
  }

  // Dismiss/acknowledge an alert or importChange
  if (req.method === "POST" && pathname === "/api/alerts/dismiss") {
    const payload = await parseBody(req);
    const { id, type } = payload;
    if (!id) return sendJson(res, 400, { error: "id required" });
    const db = readDb();
    if (type === "system") {
      const before = (db.alerts || []).length;
      db.alerts = (db.alerts || []).filter(a => a.id !== id);
      const removed = before - db.alerts.length;
      writeDb(db);
      return sendJson(res, 200, { ok: true, removed });
    } else {
      const before = (db.importChanges || []).length;
      db.importChanges = (db.importChanges || []).filter(c => c.id !== id);
      const removed = before - db.importChanges.length;
      writeDb(db);
      return sendJson(res, 200, { ok: true, removed });
    }
  }

  // ===== WAREHOUSE MAP API =====

  // GET /api/warehouse/map
  // ── Warehouse Profiles (multiple maps) ──
  if (req.method === "GET" && pathname === "/api/warehouse/profiles") {
    if (!db.warehouseProfiles) db.warehouseProfiles = [];
    return sendJson(res, 200, { profiles: db.warehouseProfiles.map(p => ({
      id: p.id, name: p.name, description: p.description, createdAt: p.createdAt,
      zoneCount: (p.zones || []).length,
      locationCount: (p.locations || []).length
    })) });
  }

  if (req.method === "POST" && pathname === "/api/warehouse/profiles/save") {
    const payload = await parseBody(req);
    if (!payload.name) return sendJson(res, 400, { error: "name required" });
    if (!db.warehouseMap) db.warehouseMap = { zones: [], locations: [], overlays: [], log: [] };
    if (!db.warehouseProfiles) db.warehouseProfiles = [];
    // Check for existing profile with same name → update it
    const existingIdx = db.warehouseProfiles.findIndex(p => p.name === payload.name);
    const profile = {
      id: existingIdx >= 0 ? db.warehouseProfiles[existingIdx].id : ("prof-" + Date.now()),
      name: payload.name,
      description: payload.description || "",
      createdAt: existingIdx >= 0 ? db.warehouseProfiles[existingIdx].createdAt : nowIso(),
      updatedAt: nowIso(),
      zones: JSON.parse(JSON.stringify(db.warehouseMap.zones || [])),
      locations: JSON.parse(JSON.stringify(db.warehouseMap.locations || [])),
      overlays: JSON.parse(JSON.stringify(db.warehouseMap.overlays || []))
    };
    if (existingIdx >= 0) db.warehouseProfiles[existingIdx] = profile;
    else db.warehouseProfiles.push(profile);
    writeDb(db);
    return sendJson(res, 200, { ok: true, profile: { id: profile.id, name: profile.name, zoneCount: profile.zones.length } });
  }

  if (req.method === "POST" && pathname === "/api/warehouse/profiles/load") {
    const payload = await parseBody(req);
    if (!payload.id) return sendJson(res, 400, { error: "id required" });
    const profile = (db.warehouseProfiles || []).find(p => p.id === payload.id);
    if (!profile) return sendJson(res, 404, { error: "Profile not found" });
    db.warehouseMap = {
      zones: JSON.parse(JSON.stringify(profile.zones || [])),
      locations: JSON.parse(JSON.stringify(profile.locations || [])),
      overlays: JSON.parse(JSON.stringify(profile.overlays || [])),
      log: db.warehouseMap?.log || []
    };
    whLog(db, { action: "profile_load", profileId: profile.id, profileName: profile.name, userId: payload.userId || "system" });
    writeDb(db);
    return sendJson(res, 200, { ok: true, map: db.warehouseMap });
  }

  if (req.method === "POST" && pathname.startsWith("/api/warehouse/profiles/delete/")) {
    const profileId = decodeURIComponent(pathname.replace("/api/warehouse/profiles/delete/", ""));
    const before = (db.warehouseProfiles || []).length;
    db.warehouseProfiles = (db.warehouseProfiles || []).filter(p => p.id !== profileId);
    writeDb(db);
    return sendJson(res, 200, { ok: true, deleted: before - db.warehouseProfiles.length });
  }

  if ((req.method === "GET" || req.method === "POST") && pathname === "/api/warehouse/map") {
    const db = readDb();
    if (!db.warehouseMap) db.warehouseMap = { zones: [], locations: [], overlays: [], log: [] };
    if (!db.warehouseMap.overlays) db.warehouseMap.overlays = [];
    if (!db.warehouseMap.log) db.warehouseMap.log = [];
    const map = db.warehouseMap;
    // Cross-ref jobs → sync occupiedBy from warehouseLocation field
    const jobs = db.jobs || [];
    const inboundJobs = jobs.filter(j => ["Inbound","Stored","ReadyForTerminal","XRayPassed","LoadingReady"].includes(j.status));
    // Summarize jobs pipeline
    const jobStats = {
      inbound: jobs.filter(j => j.status === "Inbound").length,
      stored: jobs.filter(j => j.status === "Stored").length,
      readyTerminal: jobs.filter(j => j.status === "ReadyForTerminal").length,
      total: jobs.length
    };
    return sendJson(res, 200, { map, jobStats, inboundJobs: inboundJobs.map(j => ({
      houseNumber: j.houseNumber, status: j.status,
      warehouseLocation: j.warehouseLocation || null,
      customerName: j.customerName || ""
    })) });
  }

  // POST /api/warehouse/zone/create — create or update a zone + auto-generate locations
  if (req.method === "POST" && pathname === "/api/warehouse/zone/create") {
    const payload = await parseBody(req);
    const { name, prefix, rows, cols, defaultLevels, color, gridCol, gridRow, maxPallets, maxBoxes } = payload;
    if (!name || !prefix || !rows || !cols) return sendJson(res, 400, { error: "name, prefix, rows, cols required" });
    const db = readDb();
    if (!db.warehouseMap) db.warehouseMap = { zones: [], locations: [] };
    // Check prefix unique
    const existing = db.warehouseMap.zones.find(z => z.prefix === prefix.toUpperCase());
    if (existing) return sendJson(res, 409, { error: `Prefix ${prefix.toUpperCase()} already used by zone "${existing.name}"` });
    const zoneId = `zone_${prefix.toUpperCase()}_${Date.now()}`;
    const zone = {
      id: zoneId,
      name: String(name).trim(),
      prefix: String(prefix).toUpperCase().trim(),
      rows: Number(rows),
      cols: Number(cols),
      defaultLevels: Number(defaultLevels) || 1,
      color: String(color || "#dbeafe"),
      gridCol: Number(gridCol) || 0,
      gridRow: Number(gridRow) || 0,
      maxPallets: Number(maxPallets) || 0,
      maxBoxes: Number(maxBoxes) || 0,
      createdAt: nowIso()
    };
    db.warehouseMap.zones.push(zone);
    // Auto-generate locations
    const newLocs = [];
    for (let r = 0; r < zone.rows; r++) {
      for (let c = 0; c < zone.cols; c++) {
        const num = r * zone.cols + c + 1;
        const code = `${zone.prefix}-${String(num).padStart(2, "0")}`;
        newLocs.push({
          id: `loc_${zoneId}_${num}`,
          code,
          zoneId,
          row: r,
          col: c,
          maxLevels: zone.defaultLevels,
          occupiedBy: []
        });
      }
    }
    db.warehouseMap.locations.push(...newLocs);
    whLog(db, { action: "zone_create", zoneId, zoneName: zone.name, prefix: zone.prefix, rows: zone.rows, cols: zone.cols, userId: payload.userId });
    writeDb(db);
    return sendJson(res, 200, { ok: true, zone, locations: newLocs, map: db.warehouseMap });
  }

  // POST /api/warehouse/zone/delete
  if (req.method === "POST" && pathname === "/api/warehouse/zone/delete") {
    const payload = await parseBody(req);
    const { zoneId } = payload;
    if (!zoneId) return sendJson(res, 400, { error: "zoneId required" });
    const db = readDb();
    if (!db.warehouseMap) return sendJson(res, 404, { error: "No map found" });
    const zone = db.warehouseMap.zones.find(z => z.id === zoneId);
    if (!zone) return sendJson(res, 404, { error: "Zone not found" });
    // Check if any location occupied
    const occupied = db.warehouseMap.locations.filter(l => l.zoneId === zoneId && l.occupiedBy.length > 0);
    if (occupied.length > 0) return sendJson(res, 409, { error: `ยังมีสินค้าอยู่ใน ${occupied.length} location ในโซนนี้` });
    db.warehouseMap.zones = db.warehouseMap.zones.filter(z => z.id !== zoneId);
    db.warehouseMap.locations = db.warehouseMap.locations.filter(l => l.zoneId !== zoneId);
    writeDb(db);
    return sendJson(res, 200, { ok: true, map: db.warehouseMap });
  }

  // POST /api/warehouse/location/set-levels — update maxLevels per location
  if (req.method === "POST" && pathname === "/api/warehouse/location/set-levels") {
    const payload = await parseBody(req);
    const { locationId, maxLevels } = payload;
    if (!locationId) return sendJson(res, 400, { error: "locationId required" });
    const db = readDb();
    const loc = (db.warehouseMap?.locations || []).find(l => l.id === locationId);
    if (!loc) return sendJson(res, 404, { error: "Location not found" });
    loc.maxLevels = Math.max(1, Number(maxLevels) || 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true, location: loc });
  }

  // POST /api/warehouse/location/assign — store a house at a location+level
  if (req.method === "POST" && pathname === "/api/warehouse/location/assign") {
    const payload = await parseBody(req);
    const { locationId, level, houseNumber, pallets, boxes } = payload;
    if (!locationId || !houseNumber) return sendJson(res, 400, { error: "locationId and houseNumber required" });
    const db = readDb();
    const loc = (db.warehouseMap?.locations || []).find(l => l.id === locationId);
    if (!loc) return sendJson(res, 404, { error: "Location not found" });
    const lvl = Number(level) || 1;
    if (lvl > loc.maxLevels) return sendJson(res, 400, { error: `ช่องนี้รองรับสูงสุด ${loc.maxLevels} ระดับ` });
    // Check level not already taken
    if (loc.occupiedBy.some(o => o.level === lvl)) return sendJson(res, 409, { error: `ระดับ ${lvl} ของ ${loc.code} ถูกใช้แล้ว` });
    // Check house not already somewhere else
    const allLocs = db.warehouseMap.locations;
    const existingLoc = allLocs.find(l => l.occupiedBy.some(o => o.houseNumber === houseNumber));
    if (existingLoc) {
      // Remove from old location first
      existingLoc.occupiedBy = existingLoc.occupiedBy.filter(o => o.houseNumber !== houseNumber);
    }
    const palletCount = Number(pallets) || 0;
    const boxCount = Number(boxes) || 0;
    loc.occupiedBy.push({ houseNumber, level: lvl, since: nowIso(), pallets: palletCount, boxes: boxCount });
    // Also update job location field + capacity fields
    const job = (db.jobs || []).find(j => j.houseNumber === houseNumber);
    if (job) {
      job.warehouseLocation = `${loc.code}-L${lvl}`;
      job.warehouseZoneId = loc.zoneId;
      job.warehousePallets = palletCount;
      job.warehouseBoxes = boxCount;
      job.updatedAt = nowIso();
    }
    logActivity(db, { houseNumber, activityType: "LocationAssigned", locationCode: loc.code, level: lvl, pallets: palletCount, boxes: boxCount });
    whLog(db, { action: "assign", houseNumber, locationCode: loc.code, level: lvl, pallets: palletCount, boxes: boxCount, userId: payload.userId });
    writeDb(db);
    return sendJson(res, 200, { ok: true, location: loc, map: db.warehouseMap });
  }

  // POST /api/warehouse/location/release
  if (req.method === "POST" && pathname === "/api/warehouse/location/release") {
    const payload = await parseBody(req);
    const { houseNumber, userId } = payload;
    if (!houseNumber) return sendJson(res, 400, { error: "houseNumber required" });
    const db = readDb();
    const locs = db.warehouseMap?.locations || [];
    let releasedFrom = null;
    for (const loc of locs) {
      const before = loc.occupiedBy.length;
      loc.occupiedBy = loc.occupiedBy.filter(o => o.houseNumber !== houseNumber);
      if (loc.occupiedBy.length < before) releasedFrom = loc.code;
    }
    if (!releasedFrom) return sendJson(res, 404, { error: "House not found in any location" });
    const job = (db.jobs || []).find(j => j.houseNumber === houseNumber);
    if (job) { job.warehouseLocation = null; job.updatedAt = nowIso(); }
    whLog(db, { action: "release", houseNumber, fromLocation: releasedFrom, userId });
    writeDb(db);
    return sendJson(res, 200, { ok: true, map: db.warehouseMap });
  }

  // POST /api/warehouse/zone/update — rename or recolor zone
  if (req.method === "POST" && pathname === "/api/warehouse/zone/update") {
    const payload = await parseBody(req);
    const { zoneId, name, color, mapOrder, canvasX, canvasY, userId, maxPallets, maxBoxes } = payload;
    if (!zoneId) return sendJson(res, 400, { error: "zoneId required" });
    const db = readDb();
    const zone = (db.warehouseMap?.zones || []).find(z => z.id === zoneId);
    if (!zone) return sendJson(res, 404, { error: "Zone not found" });
    const changes = {};
    if (name && name.trim()) { changes.name = name.trim(); zone.name = name.trim(); }
    if (color) { changes.color = color; zone.color = color; }
    if (mapOrder !== undefined) { changes.mapOrder = Number(mapOrder); zone.mapOrder = Number(mapOrder); }
    if (canvasX !== undefined) { zone.canvasX = Number(canvasX); }
    if (canvasY !== undefined) { zone.canvasY = Number(canvasY); }
    if (maxPallets !== undefined) { zone.maxPallets = Number(maxPallets) || 0; }
    if (maxBoxes !== undefined) { zone.maxBoxes = Number(maxBoxes) || 0; }
    zone.updatedAt = nowIso();
    whLog(db, { action: "zone_update", zoneId, changes, userId });
    writeDb(db);
    return sendJson(res, 200, { ok: true, zone, map: db.warehouseMap });
  }

  // GET /api/warehouse/config — global warehouse settings (palletToBoxRatio)
  if (req.method === "GET" && pathname === "/api/warehouse/config") {
    const db = readDb();
    const config = db.warehouseConfig || { palletToBoxRatio: 10 };
    return sendJson(res, 200, { ok: true, config });
  }

  // POST /api/warehouse/config — update global warehouse settings
  if (req.method === "POST" && pathname === "/api/warehouse/config") {
    const payload = await parseBody(req);
    const db = readDb();
    if (!db.warehouseConfig) db.warehouseConfig = { palletToBoxRatio: 10 };
    if (payload.palletToBoxRatio !== undefined) {
      db.warehouseConfig.palletToBoxRatio = Math.max(1, Number(payload.palletToBoxRatio) || 10);
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, config: db.warehouseConfig });
  }

  // GET /api/warehouse/zones/capacity — per-zone pallet+box usage summary
  if (req.method === "GET" && pathname === "/api/warehouse/zones/capacity") {
    const db = readDb();
    const zones = db.warehouseMap?.zones || [];
    const locations = db.warehouseMap?.locations || [];
    const jobs = db.jobs || [];
    const config = db.warehouseConfig || { palletToBoxRatio: 10 };

    // Active statuses = still in warehouse
    const ACTIVE = new Set(["Inbound", "Stored", "ReadyForTerminal", "Assigned"]);

    const result = zones.map(zone => {
      // Sum pallets+boxes from all jobs assigned to this zone (active statuses)
      const zoneJobs = jobs.filter(j =>
        j.warehouseZoneId === zone.id && ACTIVE.has(j.status)
      );
      const usedPallets = zoneJobs.reduce((s, j) => s + (Number(j.warehousePallets) || 0), 0);
      const usedBoxes = zoneJobs.reduce((s, j) => s + (Number(j.warehouseBoxes) || 0), 0);

      // Also sum from locations (occupiedBy) for jobs that may not have warehouseZoneId yet
      const zoneLocs = locations.filter(l => l.zoneId === zone.id);
      const houseNumbersInLocations = new Set();
      zoneLocs.forEach(l => l.occupiedBy.forEach(o => houseNumbersInLocations.add(o.houseNumber)));

      // Merge: any job in locations but not in warehouseZoneId
      let extraPallets = 0, extraBoxes = 0;
      for (const hn of houseNumbersInLocations) {
        const j = jobs.find(jj => jj.houseNumber === hn && !jj.warehouseZoneId && ACTIVE.has(jj.status));
        if (j) {
          const locEntry = zoneLocs.flatMap(l => l.occupiedBy).find(o => o.houseNumber === hn);
          extraPallets += Number(locEntry?.pallets) || 0;
          extraBoxes += Number(locEntry?.boxes) || 0;
        }
      }

      const totalPallets = usedPallets + extraPallets;
      const totalBoxes = usedBoxes + extraBoxes;
      const ratio = config.palletToBoxRatio || 10;
      const maxPallets = zone.maxPallets || 0;
      const maxBoxes = zone.maxBoxes || 0;

      // Traffic light: based on equivalent pallet units
      let fillPct = 0;
      if (maxPallets > 0) {
        const equiv = totalPallets + totalBoxes / ratio;
        fillPct = Math.min(100, Math.round((equiv / maxPallets) * 100));
      }
      const trafficLight = fillPct >= 90 ? "red" : fillPct >= 70 ? "yellow" : "green";

      const houses = zoneJobs.map(j => ({
        houseNumber: j.houseNumber,
        customerName: j.customerName || "",
        status: j.status,
        pallets: Number(j.warehousePallets) || 0,
        boxes: Number(j.warehouseBoxes) || 0,
        warehouseLocation: j.warehouseLocation || ""
      }));

      return {
        id: zone.id,
        name: zone.name,
        prefix: zone.prefix,
        color: zone.color,
        maxPallets,
        maxBoxes,
        usedPallets: totalPallets,
        usedBoxes: totalBoxes,
        fillPct,
        trafficLight,
        houseCount: houseNumbersInLocations.size,
        houses
      };
    });

    return sendJson(res, 200, { ok: true, zones: result, config });
  }

  // POST /api/warehouse/overlay/create
  if (req.method === "POST" && pathname === "/api/warehouse/overlay/create") {
    const payload = await parseBody(req);
    if (!payload.label) return sendJson(res, 400, { error: "label required" });
    const db = readDb();
    const wh = db.warehouseMap;
    if (!wh) return sendJson(res, 500, { error: "warehouseMap not initialized" });
    if (!wh.overlays) wh.overlays = [];
    const id = "ov_" + Date.now();
    const OVERLAY_TYPES = { door: "ประตู", aisle: "ทางเดิน", office: "ออฟฟิศ", pillar: "เสา", wall: "กำแพง", label: "ป้ายกำกับ" };
    const typeIcons = { door: "log-in", aisle: "footprints", office: "building-2", pillar: "square", wall: "minus", label: "tag" };
    const overlay = {
      id,
      type: payload.type || "aisle",
      label: payload.label,
      sublabel: payload.sublabel || "",
      color: payload.color || "#f1f5f9",
      icon: typeIcons[payload.type] || "square",
      mapOrder: Number(payload.mapOrder) || (wh.overlays.length + wh.zones.length) * 2,
      spanCols: Number(payload.spanCols) || 1,
      spanRows: Number(payload.spanRows) || 1,
      ovW: Number(payload.ovW) || 0,
      ovH: Number(payload.ovH) || 0,
      createdAt: nowIso()
    };
    wh.overlays.push(overlay);
    whLog(db, { by: payload.by || "admin", action: "overlay_create", detail: `สร้าง Overlay: ${overlay.label} (${overlay.type})` });
    writeDb(db);
    return sendJson(res, 200, { ok: true, overlay });
  }

  // POST /api/warehouse/overlay/delete
  if (req.method === "POST" && pathname === "/api/warehouse/overlay/delete") {
    const payload = await parseBody(req);
    if (!payload.overlayId) return sendJson(res, 400, { error: "overlayId required" });
    const db = readDb();
    const wh = db.warehouseMap;
    if (!wh || !wh.overlays) return sendJson(res, 404, { error: "No overlays" });
    const idx = wh.overlays.findIndex(o => o.id === payload.overlayId);
    if (idx === -1) return sendJson(res, 404, { error: "Overlay not found" });
    const [removed] = wh.overlays.splice(idx, 1);
    whLog(db, { by: payload.by || "admin", action: "overlay_delete", detail: `ลบ Overlay: ${removed.label}` });
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  // POST /api/warehouse/overlay/update
  if (req.method === "POST" && pathname === "/api/warehouse/overlay/update") {
    const payload = await parseBody(req);
    if (!payload.overlayId) return sendJson(res, 400, { error: "overlayId required" });
    const db = readDb();
    const wh = db.warehouseMap;
    const ov = wh?.overlays?.find(o => o.id === payload.overlayId);
    if (!ov) return sendJson(res, 404, { error: "Overlay not found" });
    if (payload.label !== undefined) ov.label = payload.label;
    if (payload.sublabel !== undefined) ov.sublabel = payload.sublabel;
    if (payload.color !== undefined) ov.color = payload.color;
    if (payload.mapOrder !== undefined) ov.mapOrder = Number(payload.mapOrder);
    if (payload.canvasX !== undefined) ov.canvasX = Number(payload.canvasX);
    if (payload.canvasY !== undefined) ov.canvasY = Number(payload.canvasY);
    if (payload.ovW !== undefined) ov.ovW = Number(payload.ovW);
    if (payload.ovH !== undefined) ov.ovH = Number(payload.ovH);
    if (payload.type !== undefined) ov.type = payload.type;
    if (payload.icon !== undefined) ov.icon = payload.icon;
    if (payload.spanCols !== undefined) ov.spanCols = Number(payload.spanCols);
    if (payload.spanRows !== undefined) ov.spanRows = Number(payload.spanRows);
    whLog(db, { by: payload.by || "admin", action: "overlay_update", detail: `แก้ไข Overlay: ${ov.label}` });
    writeDb(db);
    return sendJson(res, 200, { ok: true, overlay: ov });
  }

  // GET /POST /api/warehouse/log — return warehouse activity log
  if (pathname === "/api/warehouse/log") {
    const db = readDb();
    const log = (db.warehouseMap?.log || []).slice().reverse().slice(0, 100);
    return sendJson(res, 200, { log });
  }

  // ─── LOAD PLAN ROUTES ────────────────────────────────────────────────────

  // POST /api/loadplan/preview — parse CSV + diff vs previous, NO save
  if (req.method === "POST" && pathname === "/api/loadplan/preview") {
    const payload = await parseBody(req);
    const { csvText } = payload;
    if (!csvText && !payload.fileBase64) return sendJson(res, 400, { error: "csvText required" });
    const db = readDb();
    let rows = null;
    if (payload.fileBase64) {
      try {
        const clean = String(payload.fileBase64).includes(",") ? String(payload.fileBase64).split(",").pop() : String(payload.fileBase64);
        rows = loadPlanRowsFromXlsx(parseXlsxRows(Buffer.from(clean, "base64")));
      } catch (err) {
        return sendJson(res, 422, { error: "\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1f\u0e25\u0e4c Excel \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49: " + err.message });
      }
      if (!rows.length) return sendJson(res, 400, { error: "\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e40\u0e25\u0e02 House \u0e43\u0e19\u0e44\u0e1f\u0e25\u0e4c Excel \u2014 \u0e23\u0e2d\u0e07\u0e23\u0e31\u0e1a Consol Planning \u0e2b\u0e23\u0e37\u0e2d\u0e44\u0e1f\u0e25\u0e4c\u0e17\u0e35\u0e48\u0e21\u0e35\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c House/HAWB" });
    }
    if (!rows) {
    const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return sendJson(res, 400, { error: "CSV ต้องมีอย่างน้อย 2 แถว" });

    const headers = lines[0].split(",").map(h => h.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
    const houseCol  = headers.findIndex(h => /HOUSE|HAWB|AWB/.test(h));
    const flightCol = headers.findIndex(h => /FLIGHT/.test(h));
    const weightCol = headers.findIndex(h => /WEIGHT|WGT/.test(h));
    const pcsCol    = headers.findIndex(h => /PCS|PIECES|PIECE/.test(h));
    const destCol   = headers.findIndex(h => /DEST|DESTINATION/.test(h));
    const awbCol    = headers.findIndex(h => /AWB_NO|AWBNO|MAWB|MASTER/.test(h));
    const etdCol    = headers.findIndex(h => /ETD|FLIGHT_TIME|DEPARTURE/.test(h));
    const custCol   = headers.findIndex(h => /CUSTOMER|SHIPPER|CONSIGN/.test(h));
    if (houseCol < 0) return sendJson(res, 400, { error: "ไม่พบคอลัมน์ House Number" });

    rows = lines.slice(1).map(l => {
      const cols = l.split(",").map(c => c.trim().replace(/^"|"$/g,""));
      return {
        houseNumber: cols[houseCol] || "",
        flightNumber: flightCol >= 0 ? (cols[flightCol] || "") : "",
        weight: weightCol >= 0 ? parseFloat(cols[weightCol]) || 0 : 0,
        pieces: pcsCol >= 0 ? parseInt(cols[pcsCol]) || 0 : 0,
        destination: destCol >= 0 ? (cols[destCol] || "") : "",
        awbNumber: awbCol >= 0 ? (cols[awbCol] || "") : "",
        etdFromCsv: etdCol >= 0 ? (cols[etdCol] || "") : "",
        customerName: custCol >= 0 ? (cols[custCol] || "") : "",
      };
    }).filter(r => r.houseNumber);
    }

    const previewAt = nowIso();
    const previewDate = payload.flightDate || bangkokDate(previewAt);
    const previewRound = normalizePlanRound(payload.planRound, previewAt);
    const prev = latestPlanForDate(db, previewDate);
    const prevMap = {};
    (prev?.rows || []).forEach(r => { prevMap[r.houseNumber] = r; });

    const prevHouses = new Set(Object.keys(prevMap));
    const currHouses = new Set(rows.map(r => r.houseNumber));

    const newRows      = rows.filter(r => !prevHouses.has(r.houseNumber));
    const removedRows  = (prev?.rows || []).filter(r => !currHouses.has(r.houseNumber));
    const changedRows  = rows.filter(r => {
      const p = prevMap[r.houseNumber];
      if (!p) return false;
      return p.flightNumber !== r.flightNumber || p.destination !== r.destination || p.pieces !== r.pieces || p.weight !== r.weight;
    });
    const unchangedRows = rows.filter(r => {
      const p = prevMap[r.houseNumber];
      if (!p) return false;
      return p.flightNumber === r.flightNumber && p.destination === r.destination && p.pieces === r.pieces && p.weight === r.weight;
    });

    return sendJson(res, 200, {
      ok: true,
      totalRows: rows.length,
      newRows, removedRows, changedRows, unchangedRows,
      hasPrev: !!prev,
      prevImportedAt: prev?.importedAt || null,
      prevTotalRows: prev?.totalRows || 0,
      flightDate: previewDate,
      planRound: previewRound,
    });
  }

  // POST /api/loadplan/import — parse CSV, compare with previous, save
  if (req.method === "POST" && pathname === "/api/loadplan/import") {
    const payload = await parseBody(req);
    const { csvText, importedBy } = payload;
    if (!csvText && !payload.fileBase64) return sendJson(res, 400, { error: "csvText required" });

    const db = readDb();
    if (!db.loadPlans) db.loadPlans = [];

    let rows = null;
    if (payload.fileBase64) {
      try {
        const clean = String(payload.fileBase64).includes(",") ? String(payload.fileBase64).split(",").pop() : String(payload.fileBase64);
        rows = loadPlanRowsFromXlsx(parseXlsxRows(Buffer.from(clean, "base64")));
      } catch (err) {
        return sendJson(res, 422, { error: "\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1f\u0e25\u0e4c Excel \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49: " + err.message });
      }
      if (!rows.length) return sendJson(res, 400, { error: "\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e40\u0e25\u0e02 House \u0e43\u0e19\u0e44\u0e1f\u0e25\u0e4c Excel \u2014 \u0e23\u0e2d\u0e07\u0e23\u0e31\u0e1a Consol Planning \u0e2b\u0e23\u0e37\u0e2d\u0e44\u0e1f\u0e25\u0e4c\u0e17\u0e35\u0e48\u0e21\u0e35\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c House/HAWB" });
    }
    if (!rows) {
    // Parse CSV: expect header row with HOUSE_NUMBER (or HAWB, HOUSE, AWB)
    const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return sendJson(res, 400, { error: "CSV ต้องมีอย่างน้อย 2 แถว (header + data)" });

    const headers = lines[0].split(",").map(h => h.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
    const houseCol  = headers.findIndex(h => /HOUSE|HAWB|AWB/.test(h));
    const flightCol = headers.findIndex(h => /FLIGHT/.test(h));
    const weightCol = headers.findIndex(h => /WEIGHT|WGT/.test(h));
    const pcsCol    = headers.findIndex(h => /PCS|PIECES|PIECE/.test(h));
    const destCol   = headers.findIndex(h => /DEST|DESTINATION/.test(h));
    const awbCol    = headers.findIndex(h => /AWB_NO|AWBNO|MAWB|MASTER/.test(h));
    const etdCol    = headers.findIndex(h => /ETD|FLIGHT_TIME|DEPARTURE/.test(h));

    if (houseCol < 0) return sendJson(res, 400, { error: "ไม่พบคอลัมน์ House Number (HOUSE/HAWB/AWB) ในไฟล์ CSV" });

    rows = lines.slice(1).map(l => {
      const cols = l.split(",").map(c => c.trim().replace(/^"|"$/g,""));
      return {
        houseNumber: cols[houseCol] || "",
        flightNumber: flightCol >= 0 ? (cols[flightCol] || "") : "",
        weight: weightCol >= 0 ? parseFloat(cols[weightCol]) || 0 : 0,
        pieces: pcsCol >= 0 ? parseInt(cols[pcsCol]) || 0 : 0,
        destination: destCol >= 0 ? (cols[destCol] || "") : "",
        awbNumber: awbCol >= 0 ? (cols[awbCol] || "") : "",
        etdFromCsv: etdCol >= 0 ? (cols[etdCol] || "") : "",
      };
    }).filter(r => r.houseNumber);
    }

    // Match with jobs in system. Load plans are same-day only and never roll over.
    const importedAt = nowIso();
    const today = payload.flightDate || bangkokDate(importedAt);
    const planRound = normalizePlanRound(payload.planRound, importedAt);
    const matchedRows = rows.map(r => {
      const job = db.jobs.find(j => j.houseNumber === r.houseNumber);
      const loc = job ? (db.warehouseMap?.locations || []).find(l => l.occupiedBy?.some(o => o.houseNumber === r.houseNumber)) : null;
      return {
        ...r,
        matched: !!job,
        jobStatus: job?.status || null,
        customerName: job?.customerName || r.customerName || null,
        warehouseLocation: loc?.code || null,
        zoneId: loc?.zoneId || null,
        flightTime: r.etdFromCsv || job?.flightTime || null,
        destination: r.destination || job?.destination || job?.dest || null,
        awbNumber: r.awbNumber || job?.awbNumber || null,
        jobId: job?.id || null,
      };
    });

    // Compare with previous import
    const prev = latestPlanForDate(db, today);
    const prevHouses = new Set((prev?.rows || []).map(r => r.houseNumber));
    const currHouses = new Set(matchedRows.map(r => r.houseNumber));

    const added   = matchedRows.filter(r => !prevHouses.has(r.houseNumber));
    const removed = (prev?.rows || []).filter(r => !currHouses.has(r.houseNumber));

    const changed = prev ? (added.length > 0 || removed.length > 0) : false;

    const plan = {
      id: `lp_${Date.now()}`,
      importedAt,
      importedBy: importedBy || "admin",
      flightDate: today,
      planRound,
      cutoffRounds: LOAD_PLAN_ROUNDS,
      totalRows: matchedRows.length,
      matchedCount: matchedRows.filter(r => r.matched).length,
      rows: matchedRows,
      changes: { added, removed, hasChanges: changed }
    };

    db.loadPlans.push(plan);
    if (db.loadPlans.length > 20) db.loadPlans = db.loadPlans.slice(-20);
    const planConfirmed = applyPlanConfirmation(db, plan, importedBy || "LoadPlan");

    if (changed && prev) {
      const alertMsg = `Load Plan เปลี่ยนแปลง: +${added.length} เพิ่ม, -${removed.length} ลบ`;
      if (!db.alerts) db.alerts = [];
      db.alerts.push({ id: `alt_lp_${Date.now()}`, type: "warning", message: alertMsg, createdAt: nowIso(), read: false, source: "loadplan" });
    }

    writeDb(db);
    return sendJson(res, 200, { ok: true, plan, changed, added: added.length, removed: removed.length, planConfirmed });
  }

  // GET /api/loadplan/latest
  if ((req.method === "GET" || req.method === "POST") && pathname === "/api/loadplan/latest") {
    const db = readDb();
    const plans = db.loadPlans || [];
    const latest = plans[plans.length - 1] || null;
    const today = bangkokDate();
    const todayOutbound = (db.jobs || []).filter(j => {
      const inPlan = latest?.rows?.some(r => r.houseNumber === j.houseNumber);
      return inPlan && (j.pickupDate === today || (j.flightTime || "").slice(0,10) === today);
    }).length;
    return sendJson(res, 200, { latest, todayOutbound, totalPlans: plans.length });
  }

  // GET /api/loadplan/history
  if ((req.method === "GET" || req.method === "POST") && pathname === "/api/loadplan/history") {
    const db = readDb();
    const plans = (db.loadPlans || []).map(p => ({
      id: p.id, importedAt: p.importedAt, importedBy: p.importedBy,
      totalRows: p.totalRows, matchedCount: p.matchedCount,
      hasChanges: p.changes?.hasChanges || false,
      added: p.changes?.added?.length || 0,
      removed: p.changes?.removed?.length || 0,
    })).reverse();
    return sendJson(res, 200, { plans });
  }

  // POST /api/loadplan/tag — manually add/remove house from current plan
  if (req.method === "POST" && pathname === "/api/loadplan/tag") {
    const payload = await parseBody(req);
    const { houseNumber, action } = payload; // action: "add" | "remove"
    if (!houseNumber) return sendJson(res, 400, { error: "houseNumber required" });
    const db = readDb();
    if (!db.loadPlans) db.loadPlans = [];

    // Get or create current plan
    let plan = db.loadPlans[db.loadPlans.length - 1];
    const today = payload.flightDate || bangkokDate();
    const planRound = normalizePlanRound(payload.planRound);
    if (!plan || plan.flightDate !== today) {
      plan = { id: `lp_${Date.now()}`, importedAt: nowIso(), importedBy: payload.userId || "admin",
               flightDate: today, planRound, cutoffRounds: LOAD_PLAN_ROUNDS, totalRows: 0, matchedCount: 0, rows: [],
               changes: { added: [], removed: [], hasChanges: false } };
      db.loadPlans.push(plan);
    }

    const job = db.jobs.find(j => j.houseNumber === houseNumber);
    const loc = job ? (db.warehouseMap?.locations || []).find(l => l.occupiedBy?.some(o => o.houseNumber === houseNumber)) : null;
    const existsIdx = plan.rows.findIndex(r => r.houseNumber === houseNumber);

    if (action === "add") {
      if (existsIdx < 0) {
        const newRow = { houseNumber, flightNumber: job?.flightNumber || "", weight: job?.weight || 0, pieces: job?.pieces || 0,
          matched: !!job, jobStatus: job?.status || null, customerName: job?.customerName || null,
          warehouseLocation: loc?.code || null, zoneId: loc?.zoneId || null, manualTag: true };
        plan.rows.push(newRow);
        plan.changes.added.push(newRow);
        plan.changes.hasChanges = true;
      }
    } else if (action === "remove") {
      if (existsIdx >= 0) {
        const [removed] = plan.rows.splice(existsIdx, 1);
        plan.changes.removed.push(removed);
        plan.changes.hasChanges = true;
      }
    }
    plan.totalRows = plan.rows.length;
    plan.matchedCount = plan.rows.filter(r => r.matched).length;
    plan.importedAt = nowIso();
    if (action === "add") applyPlanConfirmation(db, plan, payload.userId || "LoadPlanManualTag");
    writeDb(db);
    return sendJson(res, 200, { ok: true, plan, inPlan: action === "add" });
  }



  // ─── ATTENDANCE ROUTES ────────────────────────────────────────────────────
  // POST /api/jobs/upload-doc — อัปโหลดเอกสาร/รูปหลักฐานจากมือถือ
  if (req.method === "POST" && pathname === "/api/jobs/upload-doc") {
    const payload = await parseBody(req);
    if (!payload.houseNumber) return sendJson(res, 400, { error: "houseNumber required" });
    if (!payload.fileBase64) return sendJson(res, 400, { error: "fileBase64 required" });
    const job = findJob(db, payload.houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const attachment = saveBase64File(db, {
      houseNumber: job.houseNumber,
      fileType: payload.fileType || "FieldDocument",
      base64: payload.fileBase64,
      mimeType: payload.mimeType || "image/jpeg"
    });
    logActivity(db, { houseNumber: job.houseNumber, activityType: "DocUpload", userId: payload.userId || "mobile" });
    job.updatedAt = nowIso();
    writeDb(db);
    return sendJson(res, 200, { ok: true, attachment: attachment ? { fileId: attachment.fileId, fileType: attachment.fileType } : null });
  }

  // GET /api/jobs/timeline — ประวัติงานต่อ House (timeline)
  if (req.method === "GET" && pathname === "/api/jobs/timeline") {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const houseNumber = urlObj.searchParams.get("houseNumber") || "";
    const job = findJob(db, houseNumber);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const userName = id => (db.users.find(u => u.id === id) || {}).name || id || "";
    const activities = (db.activityLogs || [])
      .filter(l => l.houseNumber === job.houseNumber)
      .slice(-50)
      .reverse()
      .map(l => ({
        activityType: l.activityType,
        userId: l.userId,
        userName: userName(l.userId),
        createdAt: l.createdAt,
        timeLabel: formatBangkok(l.createdAt),
        startTime: l.startTime || "",
        endTime: l.endTime || "",
        location: l.locationId || l.location || ""
      }));
    const files = (db.attachments || [])
      .filter(f => f.houseNumber === job.houseNumber)
      .map(f => ({ fileId: f.fileId, fileType: f.fileType, createdAt: f.createdAt }));
    return sendJson(res, 200, { ok: true, job: normalizeJob(job), activities, files });
  }

  // POST /api/jobs/cs-confirm
  if (req.method === "POST" && pathname === "/api/jobs/cs-confirm") {
    const payload = await parseBody(req);
    const { houseNumbers, invoiceNo, confirmedBy, contactName, evidenceChannel, evidenceNote, evidenceFiles } = payload;
    if (!houseNumbers?.length) return sendJson(res, 400, { error: "houseNumbers required" });
    const db = readDb();
    const now = nowIso();
    let confirmed = 0;
    (db.jobs || []).forEach(job => {
      if (houseNumbers.includes(job.houseNumber)) {
        job.csConfirmed = true;
        job.csConfirmedBy = confirmedBy || "CS";
        job.csConfirmedAt = now;
        job.csContactName = contactName || "";
        if (invoiceNo) job.csInvoiceNo = invoiceNo;
        job.approvalStatus = "CSApproved";
        job.csApprovalRequired = false;
        job.evidenceRequired = false;
        job.evidenceChannel = evidenceChannel || job.evidenceChannel || "";
        job.evidenceNote = evidenceNote || job.evidenceNote || "";
        if (Array.isArray(evidenceFiles) && evidenceFiles.length) {
          saveBase64Files(db, { houseNumber: job.houseNumber, fileType: "CSApprovalEvidence", files: evidenceFiles });
          job.csEvidenceAttachedAt = now;
        }
        job.approvalTrail ||= [];
        job.approvalTrail.push({
          at: now,
          type: "CSApproved",
          by: job.csConfirmedBy,
          from: "PendingCSApproval",
          to: "CSApproved",
          channel: job.evidenceChannel,
          note: job.evidenceNote,
          invoiceNo: job.csInvoiceNo || ""
        });
        job.updatedAt = now;
        confirmed++;
      }
    });
    logActivity(db, { activityType: "CSConfirm", houseNumbers, invoiceNo, confirmedBy, count: confirmed });
    writeDb(db);
    return sendJson(res, 200, { ok: true, confirmed });
  }

  // GET /api/jobs/cs-history — ประวัติการยืนยัน CS (รีพอร์ตย้อนหลัง)
  if (req.method === "GET" && pathname === "/api/jobs/cs-history") {
    const db2 = readDb();
    const jobs = (db2.jobs || [])
      .filter(j => j.csConfirmed && j.csConfirmedAt)
      .sort((a, b) => String(b.csConfirmedAt).localeCompare(String(a.csConfirmedAt)))
      .slice(0, 500)
      .map(j => ({
        houseNumber: j.houseNumber,
        customerName: j.customerName || "",
        csInvoiceNo: j.csInvoiceNo || "",
        csConfirmedBy: j.csConfirmedBy || "",
        csContactName: j.csContactName || "",
        csConfirmedAt: j.csConfirmedAt,
        timeLabel: formatBangkok(j.csConfirmedAt),
        pieceCount: j.pieceCount || "",
        pickupDate: j.pickupDate || "",
        status: j.status
      }));
    return sendJson(res, 200, { ok: true, jobs });
  }

  // GET /api/jobs/pending-cs — งานรอ CS confirm
  if (req.method === "GET" && pathname === "/api/jobs/pending-cs") {
    const db = readDb();
    const pending = (db.jobs || []).filter(j => j.csConfirmed === false || j.approvalStatus === "PendingCSApproval");
    return sendJson(res, 200, { jobs: pending.map(normalizeJob) });
  }

  // POST /api/jobs/cs-reject
  if (req.method === "POST" && pathname === "/api/jobs/cs-reject") {
    const payload = await parseBody(req);
    const { houseNumbers, reason, rejectedBy } = payload;
    if (!houseNumbers?.length) return sendJson(res, 400, { error: "houseNumbers required" });
    const db = readDb();
    const now = nowIso();
    (db.jobs || []).forEach(job => {
      if (houseNumbers.includes(job.houseNumber)) {
        job.csConfirmed = false;
        job.csRejected = true;
        job.csRejectedReason = reason || "";
        job.csRejectedBy = rejectedBy || "CS";
        job.csRejectedAt = now;
        job.approvalStatus = "CSRejected";
        job.csApprovalRequired = true;
        job.evidenceRequired = true;
        job.status = "Pending";
        job.updatedAt = now;
      }
    });
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

// GET /api/attendance/today
  if (req.method === "GET" && pathname === "/api/attendance/today") {
    const db = readDb();
    if (!db.attendance) db.attendance = [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const records = db.attendance.filter(r => r.date === today);
    const users = db.users || [];
    const enriched = records.map(r => {
      const u = users.find(u => u.id === r.userId);
      return { ...r, userName: u?.name || r.userName };
    });
    return sendJson(res, 200, { records: enriched, date: today });
  }

  // GET /api/attendance/all — last 30 days
  if (req.method === "GET" && pathname === "/api/attendance/all") {
    const db = readDb();
    if (!db.attendance) db.attendance = [];
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const records = db.attendance.filter(r => (r.date || "") >= cutoff);
    return sendJson(res, 200, { records });
  }

  // POST /api/attendance/checkin
  if (req.method === "POST" && pathname === "/api/attendance/checkin") {
    const payload = await parseBody(req);
    const { userId, photo, gpsLat, gpsLon, zone, jobType } = payload;
    if (!userId) return sendJson(res, 400, { error: "userId required" });
    const db = readDb();
    if (!db.attendance) db.attendance = [];
    const user = (db.users || []).find(u => u.id === userId);
    if (!user) return sendJson(res, 404, { error: "User not found" });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const existing = db.attendance.find(r => r.userId === userId && r.date === today && !r.checkOutTime);
    if (existing) return sendJson(res, 409, { error: "เช็คอินไปแล้ว กรุณาเช็คเอาต์ก่อน", record: existing });
    let photoUrl = null;
    if (photo) {
      const attDir = path.join(STORAGE_DIR, "attendance");
      fs.mkdirSync(attDir, { recursive: true });
      const clean = photo.includes(",") ? photo.split(",").pop() : photo;
      const fileId = "ATT-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex");
      const filename = fileId + ".jpg";
      fs.writeFileSync(path.join(attDir, filename), Buffer.from(clean, "base64"));
      photoUrl = "/storage/attendance/" + filename;
    }
    const record = {
      id: "ATT-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
      userId,
      userName: user.name,
      role: user.role,
      date: today,
      checkInTime: nowIso(),
      checkInPhoto: photoUrl,
      checkInLat: gpsLat || null,
      checkInLon: gpsLon || null,
      checkOutTime: null,
      checkOutPhoto: null,
      checkOutLat: null,
      checkOutLon: null,
      zone: zone || "",
      jobType: jobType || "",
      status: "checkin",
      reallocations: []
    };
    db.attendance.push(record);
    writeDb(db);
    return sendJson(res, 200, { ok: true, record });
  }

  // POST /api/attendance/checkout
  if (req.method === "POST" && pathname === "/api/attendance/checkout") {
    const payload = await parseBody(req);
    const { userId, photo, gpsLat, gpsLon } = payload;
    if (!userId) return sendJson(res, 400, { error: "userId required" });
    const db = readDb();
    if (!db.attendance) db.attendance = [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const record = db.attendance.find(r => r.userId === userId && r.date === today && !r.checkOutTime);
    if (!record) return sendJson(res, 404, { error: "ไม่พบการเช็คอินวันนี้" });
    let photoUrl = null;
    if (photo) {
      const attDir = path.join(STORAGE_DIR, "attendance");
      fs.mkdirSync(attDir, { recursive: true });
      const clean = photo.includes(",") ? photo.split(",").pop() : photo;
      const fileId = "ATT-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex");
      const filename = fileId + ".jpg";
      fs.writeFileSync(path.join(attDir, filename), Buffer.from(clean, "base64"));
      photoUrl = "/storage/attendance/" + filename;
    }
    record.checkOutTime = nowIso();
    record.checkOutPhoto = photoUrl;
    record.checkOutLat = gpsLat || null;
    record.checkOutLon = gpsLon || null;
    record.status = "checkout";
    writeDb(db);
    return sendJson(res, 200, { ok: true, record });
  }

  // POST /api/attendance/reallocate
  if (req.method === "POST" && pathname === "/api/attendance/reallocate") {
    const payload = await parseBody(req);
    const { attendanceId, zone, jobType, by } = payload;
    if (!attendanceId) return sendJson(res, 400, { error: "attendanceId required" });
    const db = readDb();
    if (!db.attendance) db.attendance = [];
    const record = db.attendance.find(r => r.id === attendanceId);
    if (!record) return sendJson(res, 404, { error: "ไม่พบ attendance record" });
    if (!Array.isArray(record.reallocations)) record.reallocations = [];
    record.reallocations.push({
      from: record.zone,
      to: zone || record.zone,
      fromJob: record.jobType,
      toJob: jobType || record.jobType,
      time: nowIso(),
      by: by || "Admin"
    });
    record.zone = zone || record.zone;
    record.jobType = jobType || record.jobType;
    writeDb(db);
    return sendJson(res, 200, { ok: true, record });
  }



  // ─── TASK GROUPS ────────────────────────────────────────────────────────
  // GET /api/taskgroups/today
  if (req.method === "GET" && pathname === "/api/taskgroups/today") {
    const db = readDb();
    if (!db.taskGroups) db.taskGroups = [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const groups = db.taskGroups.filter(g => g.date === today);
    return sendJson(res, 200, { groups });
  }

  // POST /api/taskgroups/create
  if (req.method === "POST" && pathname === "/api/taskgroups/create") {
    const payload = await parseBody(req);
    const { name, zone, type, color, createdBy } = payload;
    if (!name) return sendJson(res, 400, { error: "name required" });
    const db = readDb();
    if (!db.taskGroups) db.taskGroups = [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const group = {
      id: "TG-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
      name, zone: zone || "", type: type || "Other",
      color: color || "#2563eb", date: today,
      assignedUsers: [], status: "pending",
      createdBy: createdBy || "Admin", createdAt: nowIso(), completedAt: null
    };
    db.taskGroups.push(group);
    writeDb(db);
    return sendJson(res, 200, { ok: true, group });
  }

  // POST /api/taskgroups/assign
  if (req.method === "POST" && pathname === "/api/taskgroups/assign") {
    const payload = await parseBody(req);
    const { groupId, userId } = payload;
    if (!groupId || !userId) return sendJson(res, 400, { error: "groupId and userId required" });
    const db = readDb();
    if (!db.taskGroups) db.taskGroups = [];
    const group = db.taskGroups.find(g => g.id === groupId);
    if (!group) return sendJson(res, 404, { error: "Task group not found" });
    const user = (db.users || []).find(u => u.id === userId);
    if (!user) return sendJson(res, 404, { error: "User not found" });
    // Remove from other groups today (one task group at a time)
    const today = group.date;
    db.taskGroups.filter(g => g.date === today && g.id !== groupId).forEach(g => {
      g.assignedUsers = g.assignedUsers.filter(u => u.userId !== userId);
    });
    if (!group.assignedUsers.find(u => u.userId === userId)) {
      group.assignedUsers.push({ userId, userName: user.name, role: user.role });
      if (group.status === "pending") group.status = "inprogress";
    }
    writeDb(db);
    return sendJson(res, 200, { ok: true, group });
  }

  // POST /api/taskgroups/unassign
  if (req.method === "POST" && pathname === "/api/taskgroups/unassign") {
    const payload = await parseBody(req);
    const { groupId, userId } = payload;
    const db = readDb();
    if (!db.taskGroups) db.taskGroups = [];
    const group = db.taskGroups.find(g => g.id === groupId);
    if (!group) return sendJson(res, 404, { error: "Task group not found" });
    group.assignedUsers = group.assignedUsers.filter(u => u.userId !== userId);
    if (!group.assignedUsers.length && group.status === "inprogress") group.status = "pending";
    writeDb(db);
    return sendJson(res, 200, { ok: true, group });
  }

  // POST /api/taskgroups/complete
  if (req.method === "POST" && pathname === "/api/taskgroups/complete") {
    const payload = await parseBody(req);
    const { groupId, completedBy } = payload;
    if (!groupId) return sendJson(res, 400, { error: "groupId required" });
    const db = readDb();
    if (!db.taskGroups) db.taskGroups = [];
    if (!db.notifications) db.notifications = [];
    const group = db.taskGroups.find(g => g.id === groupId);
    if (!group) return sendJson(res, 404, { error: "Task group not found" });
    group.status = "done";
    group.completedAt = nowIso();
    group.completedBy = completedBy || "";
    // Create notification for Admin/WH3_TeamLeader
    const notif = {
      id: "NOTIF-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex"),
      type: "task_complete",
      title: "งานเสร็จแล้ว ✅",
      body: '"' + group.name + '" เสร็จสิ้นแล้ว' + (completedBy ? " โดย " + completedBy : ""),
      groupId: group.id, groupName: group.name,
      targetRoles: ["Admin", "WH3_TeamLeader", "Executive"],
      createdAt: nowIso(), read: false
    };
    db.notifications.push(notif);
    writeDb(db);
    return sendJson(res, 200, { ok: true, group, notification: notif });
  }

  // POST /api/taskgroups/delete
  if (req.method === "POST" && pathname === "/api/taskgroups/delete") {
    const payload = await parseBody(req);
    const { groupId } = payload;
    const db = readDb();
    if (!db.taskGroups) db.taskGroups = [];
    db.taskGroups = db.taskGroups.filter(g => g.id !== groupId);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/notifications/poll?role=Admin&since=ISO
  if (req.method === "GET" && pathname === "/api/notifications/poll") {
    const db = readDb();
    if (!db.notifications) db.notifications = [];
    const url2 = new URL(req.url, "http://localhost");
    const role = url2.searchParams.get("role") || "";
    const since = url2.searchParams.get("since") || "";
    let notifs = db.notifications.filter(n =>
      !n.read &&
      (!n.targetRoles || !n.targetRoles.length || n.targetRoles.includes(role))
    );
    if (since) notifs = notifs.filter(n => n.createdAt > since);
    return sendJson(res, 200, { notifications: notifs });
  }

  // POST /api/notifications/mark-read
  if (req.method === "POST" && pathname === "/api/notifications/mark-read") {
    const payload = await parseBody(req);
    const { ids } = payload;
    const db = readDb();
    if (!db.notifications) db.notifications = [];
    (ids || []).forEach(id => {
      const n = db.notifications.find(n => n.id === id);
      if (n) n.read = true;
    });
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/taskgroups/my?userId=xxx
  if (req.method === "GET" && pathname === "/api/taskgroups/my") {
    const db = readDb();
    if (!db.taskGroups) db.taskGroups = [];
    const url2 = new URL(req.url, "http://localhost");
    const userId = url2.searchParams.get("userId") || "";
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const groups = db.taskGroups.filter(g =>
      g.date === today && g.status !== "done" &&
      g.assignedUsers.some(u => u.userId === userId)
    );
    return sendJson(res, 200, { groups });
  }


  return sendJson(res, 404, { error: "API route not found" });
}

function streamFile(res, fullPath) {
  fs.stat(fullPath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mimeMap = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
      ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
      ".webmanifest": "application/manifest+json; charset=utf-8",
    };
    const mime = mimeMap[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Content-Length": stat.size });
    fs.createReadStream(fullPath).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/storage/")) {
    const relative = decodeURIComponent(pathname.replace("/storage/", ""));
    const filePath = path.normalize(path.join(STORAGE_DIR, relative));
    if (!filePath.startsWith(STORAGE_DIR)) return sendJson(res, 403, { error: "Forbidden" });
    return streamFile(res, filePath);
  }
  let file = pathname === "/" || pathname === "/index.html" ? "/index.html"
           : pathname === "/mobile" || pathname === "/mobile.html" ? "/mobile.html"
           : pathname === "/web" ? "/index.html"
           : pathname;
  const fullPath = path.join(__dirname, "public", file);
  if (!fullPath.startsWith(path.join(__dirname, "public"))) return sendJson(res, 403, { error: "Forbidden" });
  return streamFile(res, fullPath);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (err) {
    console.error("Unhandled server error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

server.listen(PORT, () => {
  console.log("S.C.D.TRANSPORT server running → http://localhost:" + PORT);
});
