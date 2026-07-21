const APP_VERSION = "v7";

function formatBangkok(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    });
  } catch (e) { return iso; }
}

function startSystemClock() {
  const el = $("#systemClock");
  if (!el) return;
  function tick() {
    const now = new Date();
    const time = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const date = now.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    el.innerHTML = `<strong>${time}</strong><span>${date} · ${APP_VERSION}</span>`;
  }
  tick();
  setInterval(tick, 1000);
}

function dateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dateOffsetValue(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

const state = {
  dashboard: null,
  customers: [],
  users: [],
  currentView: "dashboard",
  lang: localStorage.getItem("smartLogisticsLang") || "th",
  orderFilter: localStorage.getItem("smartLogisticsOrderFilter") || "today",
  filters: {
    dateFrom: localStorage.getItem("dashboardDateFrom") || dateOffsetValue(-29),
    dateTo: localStorage.getItem("dashboardDateTo") || dateOffsetValue(0),
    status: localStorage.getItem("dashboardStatusFilter") || "All"
  },
  selectedHouse: "H-1001",
  adminQueueGroups: [],
  autoGroupSearch: "",
  groupingTab: "inbound", // "inbound" | "outbound"
  alertSearch: "",
  adminFlowMode: "import",
  activeAutoGroupIndex: null,
  selectedManualHouses: [],
  groupWizard: {
    open: false,
    mode: "auto",
    step: 1,
    groupIndex: null,
    jobs: [],
    selectedHouses: [],
    driverId: "",
    search: ""
  },
  selectedGroupLabel: "",
  selectedAlertId: "",
  selectedHistoryHouse: "",
  cargoHistoryFilters: {
    search: "",
    from: "",
    to: ""
  },
  previewClosedHouse: "",
  pickupStartTime: null,
  cargoLoaded: false,
  cargoPreviewZoom: null,
  lastGps: null,
  offlineQueue: JSON.parse(localStorage.getItem("offlineQueue") || "[]"),
  pendingExportType: null,
  selectedStaffId: null,
  staffRoleFilter: "All",
  billingBatchGroups: [],
  selectedBillingBatchId: "",
  calendarDate: new Date(),
  pendingImport: null,
  staff: [
    { code: "EMP001", name: "Somchai Prasert", section: "Inbound", line: "Connected", kpi: 98 },
    { code: "EMP002", name: "Nattapong Sukhum", section: "Customs", line: "Connected", kpi: 92 },
    { code: "EMP003", name: "Anucha Wongsuwan", section: "Completed", line: "Connected", kpi: 95 },
    { code: "EMP004", name: "Kitti Sakorn", section: "Inbound", line: "Disconnected", kpi: 88 },
    { code: "EMP005", name: "Preecha Chan", section: "Customs", line: "Connected", kpi: 94 }
  ]
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const AUTH_CONFIG = window.SCD_AUTH_CONFIG || { defaultPassword: "1234", userPasswords: {}, companyName: "S.C.D.TRANSPORT Co., LTD" };
const WEB_AUTH_KEY = "scdTransportWebAuth";
const WEB_AUTH_USER_KEY = "scdTransportWebUser";
const configuredApiBase = window.SMART_LOGISTICS_API_BASE || "";
const API_BASE = configuredApiBase || (location.port === "3000" ? "" : "http://localhost:3000");

function initializeIcons() {
  const navIcons = {
    dashboard: "layout-dashboard",
    orders: "package-search",
    calendar: "calendar-days",
    staff: "users",
    mobile: "smartphone",
    admin: "shield-check",
    grouping: "workflow",
    "cargo-history": "file-clock",
    "load-plan": "plane-takeoff",
    alerts: "bell-ring"
  };
  Object.entries(navIcons).forEach(([view, icon]) => {
    const button = $(`.nav-item[data-view="${view}"]`);
    const holder = button?.querySelector("span");
    if (holder && !holder.dataset.iconReady) {
      holder.dataset.iconReady = "true";
      holder.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
    }
  });

  const footerIcons = { settings: "settings" };
  Object.entries(footerIcons).forEach(([view, icon]) => {
    const button = $(`.side-link[data-view="${view}"]`);
    if (button && !button.dataset.iconReady) {
      button.dataset.iconReady = "true";
      button.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${button.textContent.trim()}</span>`;
    }
  });
  const logout = $("#logoutBtn");
  if (logout && !logout.dataset.iconReady) {
    logout.dataset.iconReady = "true";
    logout.innerHTML = `<i data-lucide="log-out" aria-hidden="true"></i><span>${logout.textContent.trim()}</span>`;
  }

  const searchIcon = $(".search-box span");
  if (searchIcon && !searchIcon.dataset.iconReady) {
    searchIcon.dataset.iconReady = "true";
    searchIcon.innerHTML = `<i data-lucide="search" aria-hidden="true"></i>`;
  }
  const notification = $(".icon-button[aria-label='Notifications']");
  if (notification && !notification.dataset.iconReady) {
    notification.dataset.iconReady = "true";
    notification.title = "Notifications";
    notification.innerHTML = `<i data-lucide="bell" aria-hidden="true"></i>`;
  }

  const metricIcons = ["package-check", "truck", "clock-3", "triangle-alert", "users", "badge-check", "message-square", "activity", "circle-check", "circle-alert"];
  $$(".metric-card .icon").forEach((holder, index) => {
    if (holder.dataset.iconReady) return;
    holder.dataset.iconReady = "true";
    holder.innerHTML = `<i data-lucide="${metricIcons[index] || "activity"}" aria-hidden="true"></i>`;
  });

  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function isWebAuthenticated() {
  return localStorage.getItem(WEB_AUTH_KEY) === "ok";
}

function passwordForUser(userId) {
  return AUTH_CONFIG.userPasswords?.[userId] || AUTH_CONFIG.defaultPassword || "1234";
}

let _loginRetryCount = 0;
function renderWebLoginUsers() {
  const select = $("#webLoginUser");
  if (!select) return;
  const fallback = (window.SMART_LOGISTICS_DEMO?.users || []);
  const pool = state.users?.length ? state.users : fallback;
  const users = pool.filter(user => user.status !== "Inactive");
  if (!users.length && _loginRetryCount < 12) {
    _loginRetryCount++;
    setTimeout(renderWebLoginUsers, 400);
    return;
  }
  _loginRetryCount = 0;
  const saved = localStorage.getItem(WEB_AUTH_USER_KEY) || "";
  select.innerHTML = users.length
    ? users.map(user => `<option value="${user.id}">${user.name}${user.vehiclePlate ? ` (${user.vehiclePlate})` : ""} · ${staffRoleLabel(user.role)}</option>`).join("")
    : `<option value="">ไม่พบผู้ใช้งาน</option>`;
  select.value = users.some(user => user.id === saved) ? saved : (users[0]?.id || "");
}

function currentWebUser() {
  const userId = localStorage.getItem(WEB_AUTH_USER_KEY) || $("#webLoginUser")?.value || "";
  return (state.users || []).find(user => user.id === userId) || null;
}

function allowedWebViews(role) {
  if (role === "Driver" || role === "WH_Staff")
    return ["dashboard"];
  if (role === "WH3_TeamLeader")
    return ["dashboard", "orders", "warehouse", "wh-status", "attendance"];
  if (role === "Team_Transport")
    return ["dashboard", "orders", "wh-status", "load-plan", "outbound-open"];
  if (role === "EI_Customer")
    return ["dashboard", "orders"];
  if (role === "Check_House")
    return ["dashboard", "orders", "alerts"];
  if (role === "Terminal")
    return ["dashboard", "orders", "alerts"];
  if (role === "Billing")
    return ["dashboard", "orders", "cargo-history", "wh-status", "load-plan", "outbound-open"];
  if (role === "CS")
    return ["dashboard", "orders", "cs-queue"];
  if (role === "Executive")
    return ["dashboard", "orders", "alerts", "cargo-history", "warehouse", "wh-status", "load-plan", "outbound-open", "attendance"];
  // Admin (และ undefined fallback) → ทุก view
  return ["dashboard", "orders", "calendar", "staff", "mobile", "admin", "grouping", "cargo-history", "alerts", "warehouse", "wh-status", "settings", "load-plan", "outbound-open", "attendance"];
}

function applyWebRoleVisibility() {
  if (!isWebAuthenticated()) return;
  const user = currentWebUser();
  if (!user) return;
  const allowed = allowedWebViews(user.role);
  $$(".nav-item, .side-link").forEach(button => {
    if (button.dataset.view) button.hidden = !allowed.includes(button.dataset.view);
  });
  // ซ่อน group label เมื่อทุก nav-item ใน group นั้นถูกซ่อน
  $$(".nav-group-label").forEach(label => {
    let next = label.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains("nav-group-label")) {
      if (next.classList.contains("nav-item") && !next.hidden) hasVisible = true;
      next = next.nextElementSibling;
    }
    label.hidden = !hasVisible;
  });
  if (!allowed.includes(state.currentView)) {
    setView(allowed[0] || "dashboard");
  }
}

function renderWebSessionUser() {
  const user = currentWebUser();
  if (!user) return;
  const initials = (user.name || "SCD").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const card = $(".user-card");
  if (card) {
    const avatar = card.querySelector(".avatar");
    const name = card.querySelector("strong");
    const meta = card.querySelector("span");
    if (avatar) avatar.textContent = initials;
    if (name) name.textContent = user.name || "-";
    if (meta) meta.textContent = `${staffRoleLabel(user.role)}${user.vehiclePlate ? ` · ${user.vehiclePlate}` : ""}`;
  }
  const profile = $(".profile-dot");
  if (profile) profile.textContent = initials;
}

function renderWebLogin() {
  renderWebLoginUsers();
  $("#loginScreen")?.classList.toggle("hidden", isWebAuthenticated());
  renderWebSessionUser();
}

function quickLogin(userId) {
  const select = document.getElementById("webLoginUser");
  const passEl = document.getElementById("webLoginPassword");
  if (select) select.value = userId;
  if (passEl) passEl.value = "1234";
  submitWebLogin();
}

function submitWebLogin() {
  const userId = $("#webLoginUser")?.value || "";
  const password = $("#webLoginPassword")?.value.trim();
  const message = $("#webLoginMessage");
  if (!userId) {
    if (message) message.textContent = "กรุณาเลือกผู้ใช้งาน";
    $("#webLoginUser")?.focus();
    return;
  }
  if (password !== passwordForUser(userId)) {
    if (message) message.textContent = "รหัสผ่านไม่ถูกต้อง";
    $("#webLoginPassword")?.focus();
    return;
  }
  localStorage.setItem(WEB_AUTH_KEY, "ok");
  localStorage.setItem(WEB_AUTH_USER_KEY, userId);
  if (message) message.textContent = "";
  renderWebLogin();
  renderAll();
  applyWebRoleVisibility();
  renderWebSessionUser();
  toast("เข้าสู่ระบบ S.C.D.TRANSPORT แล้ว");
}

function setMobileMenu(open) {
  $(".sidebar")?.classList.toggle("mobile-open", open);
  $("#sidebarBackdrop")?.classList.toggle("show", open);
  $("#mobileMenuBtn")?.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("menu-open", open);
}

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function assetUrl(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

const pageCopy = {
  dashboard: { breadcrumb: "ภาพรวม / Executive", title: "Executive Dashboard" },
  orders: { breadcrumb: "ติดตามงาน / Shipment Tracking", title: "ติดตามงานขนส่ง / Order Tracking" },
  calendar: { breadcrumb: "ปฏิทินงาน / Monthly Plan", title: "ปฏิทินงาน / Operations Calendar" },
  staff: { breadcrumb: "พนักงาน / Staff Management", title: "พนักงานและระบบ / Staff & Admin" },
  mobile: { breadcrumb: "Field Ops", title: "งานภาคสนาม / Field Operation" },
  admin: { breadcrumb: "เปิดใบงาน / Admin Control", title: "เปิดใบงาน / Import & Job Management" },
  warehouse: { breadcrumb: "แผนที่คลัง / Warehouse", title: "แผนที่คลัง WH3 / Warehouse Map" },
  grouping: { breadcrumb: "จัดกลุ่มงาน / Cargo Grouping", title: "จัดกลุ่มงาน / Cargo Grouping" },
  "cargo-history": { breadcrumb: "ประวัติใบ Cargo / Cargo History", title: "ประวัติใบ Cargo / Cargo History" },
  alerts: { breadcrumb: "แจ้งเตือน / Notifications", title: "ศูนย์แจ้งเตือน / Alerts Center" },
  settings: { breadcrumb: "ตั้งค่า / Settings", title: "ตั้งค่าระบบ / System Settings" },
  "wh-status": { breadcrumb: "สถานะคลัง / Stock Status", title: "สถานะคลังสินค้า WH3 / Warehouse Status" },
  "load-plan": { breadcrumb: "ขาออก / Outbound", title: "แผนการจัดโหลดสินค้า / Load Plan" },
  "outbound-open": { breadcrumb: "ขาออก", title: "เปิดใบขาออก" },
  "cs-queue": { breadcrumb: "CS Queue / รออนุมัติ", title: "รออนุมัติ CS / Pending CS Confirmation" },
    "attendance": { breadcrumb: "การเข้างาน / Attendance", title: "การเข้างานประจำวัน / Daily Attendance" }
};

const i18nOriginalText = new WeakMap();

function localizeText(text) {
  if (!text || !text.includes(" / ")) return text;
  const splitAt = text.indexOf(" / ");
  const left = text.slice(0, splitAt);
  const right = text.slice(splitAt + 3);
  const leftHasThai = /[\u0E00-\u0E7F]/.test(left);
  const rightHasThai = /[\u0E00-\u0E7F]/.test(right);
  if (state.lang === "th") return leftHasThai || !rightHasThai ? left : right;
  return !leftHasThai || rightHasThai ? left : right;
}

function applyLanguage(root = document.body) {
  if (!root) return;
  document.documentElement.lang = state.lang === "en" ? "en" : "th";

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return node.nodeValue.includes(" / ") || i18nOriginalText.has(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    }
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach(node => {
    if (!i18nOriginalText.has(node)) i18nOriginalText.set(node, node.nodeValue);
    node.nodeValue = localizeText(i18nOriginalText.get(node));
  });

  $$("[placeholder], [title], [aria-label]").forEach(element => {
    ["placeholder", "title", "aria-label"].forEach(attr => {
      if (!element.hasAttribute(attr)) return;
      const key = `i18nOriginal${attr.replace(/-./g, match => match[1].toUpperCase())}`;
      if (!element.dataset[key]) element.dataset[key] = element.getAttribute(attr);
      element.setAttribute(attr, localizeText(element.dataset[key]));
    });
  });

  const toggle = $("#languageToggle");
  if (toggle) toggle.textContent = state.lang === "en" ? "EN" : "TH";
}

async function api(path, payload, method) {
  try {
    const m = method || "POST";
    const opts = { method: m, headers: { "Content-Type": "application/json" } };
    if (m !== "GET" && m !== "HEAD") opts.body = JSON.stringify(payload);
    const res = await fetch(apiUrl(path), opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (error) {
    if (!navigator.onLine) {
      queueOffline(path, payload);
      return { ok: true, queued: true };
    }
    throw error;
  }
}

function queueOffline(path, payload) {
  state.offlineQueue.push({ id: Date.now(), path, payload, createdAt: new Date().toISOString() });
  localStorage.setItem("offlineQueue", JSON.stringify(state.offlineQueue));
  toast(`เก็บงานไว้ชั่วคราว / Queued ${state.offlineQueue.length}`);
}

async function syncOfflineQueue() {
  if (!navigator.onLine || !state.offlineQueue.length) return;
  const remaining = [];
  for (const item of state.offlineQueue) {
    try {
      const res = await fetch(apiUrl(item.path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload)
      });
      if (!res.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  state.offlineQueue = remaining;
  localStorage.setItem("offlineQueue", JSON.stringify(state.offlineQueue));
  if (!remaining.length) {
    toast("Sync งาน offline สำเร็จ / Offline sync complete");
    refresh();
  }
}

// ===== Skeleton loading helpers =====
function skeletonRows(count = 4, widths = ["wide","mid","short","mid"]) {
  return Array.from({ length: count }, (_, i) =>
    `<div class="skeleton skeleton-row ${widths[i % widths.length]}"></div>`
  ).join("");
}
function showSkeletons() {
  // metric cards — blur the numbers
  $$(".metric-card strong").forEach(el => el.classList.add("skeleton"));
  $$(".metric-card em").forEach(el => { el.textContent = ""; });
  // order cards
  const oc = $("#orderCards");
  if (oc) oc.innerHTML = `<div style="padding:12px">${skeletonRows(5,["wide","mid","wide","short","mid"])}</div>`;
  // recent orders table
  const rot = $("#recentOrdersTable");
  if (rot) rot.innerHTML = Array.from({length:5},()=>`<tr>${Array.from({length:5},()=>`<td><div class="skeleton skeleton-row mid"></div></td>`).join("")}</tr>`).join("");
}
function clearSkeletons() {
  $$(".metric-card strong").forEach(el => el.classList.remove("skeleton"));
}

async function refresh() {
  showSkeletons();
  let data;
  let apiOk = false;
  try {
    const res = await fetch(apiUrl("/api/bootstrap"), { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      data = JSON.parse(text);
      apiOk = true;
    }
  } catch (error) {
    console.warn("refresh() API error:", error.message);
  }
  if (!apiOk || !data) {
    data = window.SMART_LOGISTICS_DEMO;
    toast("Demo mode: ไม่สามารถเชื่อมต่อ server — แสดงข้อมูลตัวอย่าง");
  }
  if (!data) return;
  state.dashboard = data.dashboard;
  state.customers = data.customers || [];
  state.users = data.users || [];
  renderWebLoginUsers();
  // Load current load plan into state
  try {
    const lpData = await api("/api/loadplan/latest", null, "GET");
    state.loadPlan = lpData.latest || null;
    state.lpTodayOutbound = lpData.todayOutbound || 0;
  } catch(e) { state.loadPlan = null; state.lpTodayOutbound = 0; }
  renderAll();
  clearSkeletons();
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = localizeText(message);
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 3200);
}

function jobDateKey(job) {
  const value = job.pickupDate || job.createdAt || job.updatedAt || job.flightTime || "";
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return dateInputValue(date);
  return String(value).slice(0, 10);
}

function dateRangeKeys(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(dateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function dashboardFilteredJobs() {
  const { dateFrom, dateTo, status } = state.filters;
  return (state.dashboard?.jobs || []).filter(job => {
    const key = jobDateKey(job);
    const inDate = (!dateFrom || key >= dateFrom) && (!dateTo || key <= dateTo);
    const inStatus = status === "All" || job.status === status;
    return inDate && inStatus;
  });
}

function statusOptions() {
  return ["All", ...new Set((state.dashboard?.jobs || []).map(job => job.status).filter(Boolean))];
}

function syncDashboardFilters() {
  const from = $("#dashboardDateFrom");
  const to = $("#dashboardDateTo");
  const status = $("#dashboardStatusFilter");
  if (!from || !to || !status) return;

  from.value = state.filters.dateFrom;
  to.value = state.filters.dateTo;
  const current = state.filters.status;
  status.innerHTML = statusOptions().map(option => {
    const label = option === "All" ? "ทั้งหมด / All" : option;
    return `<option value="${option}">${label}</option>`;
  }).join("");
  status.value = statusOptions().includes(current) ? current : "All";
  state.filters.status = status.value;
}

function persistDashboardFilters() {
  localStorage.setItem("dashboardDateFrom", state.filters.dateFrom);
  localStorage.setItem("dashboardDateTo", state.filters.dateTo);
  localStorage.setItem("dashboardStatusFilter", state.filters.status);
}

function applyDashboardFilterInputs(options = {}) {
  state.filters.dateFrom = $("#dashboardDateFrom")?.value || dateOffsetValue(-29);
  state.filters.dateTo = $("#dashboardDateTo")?.value || dateOffsetValue(0);
  state.filters.status = $("#dashboardStatusFilter")?.value || "All";
  if (state.filters.dateFrom > state.filters.dateTo) {
    [state.filters.dateFrom, state.filters.dateTo] = [state.filters.dateTo, state.filters.dateFrom];
  }
  persistDashboardFilters();
  renderAll();
  if (!options.silent) toast("อัปเดตตัวกรองแล้ว / Filters updated");
}

function setView(view) {
  if (!pageCopy[view]) return;
  state.currentView = view;
  $$("[data-view]").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  $$(".page").forEach(page => page.classList.toggle("active", page.dataset.page === view));
  $("#breadcrumb").textContent = pageCopy[view].breadcrumb;
  $("#pageTitle").textContent = pageCopy[view].title;
  applyLanguage();
  if (view === "warehouse") renderWarehouseMap();
  if (view === "wh-status") renderWarehouseStatus();
  if (view === "load-plan") renderLoadPlan();
  if (view === "outbound-open") renderObOpenPage();
  if (view === "grouping") renderGroupingTabs();
  if (view === "attendance") renderAttendance();
  if (view === "cs-queue") renderCsQueue();
  renderLpWidget();
}

function findJob(houseNumber = state.selectedHouse) {
  const jobs = state.dashboard?.jobs || [];
  if (!jobs.length) return null;
  if (!houseNumber) return jobs[0];
  return jobs.find(job => job.houseNumber === houseNumber || job.id === houseNumber) || null;
}

function normalizeHouseBarcode(value) {
  const raw = String(value || "").trim();
  const compact = raw.replace(/\s+/g, "");
  const houseMatch = compact.match(/(?:H-?)?(\d{8,12})/i);
  if (houseMatch?.[1]) return houseMatch[1];
  return compact.toUpperCase();
}

function findExactJob(houseNumber) {
  const normalized = normalizeHouseBarcode(houseNumber);
  return state.dashboard?.jobs.find(job => job.houseNumber === normalized || job.houseNumber === houseNumber || job.id === normalized || job.id === houseNumber);
}

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function addPickupItemRow(values = {}) {
  const list = $("#driverPickupItemRows");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "pickup-item-row";
  row.innerHTML = `
    <input class="pickup-house" placeholder="House Number" value="${values.houseNumber || ""}">
    <select class="pickup-destination">
      <option value="WH3">WH3 (คลัง)</option>
      <option value="TG">TG Terminal</option>
      <option value="TGINT">TG Inter Terminal</option>
      <option value="BFS">BFS Terminal</option>
    </select>
    <input class="pickup-carton" placeholder="Carton/ชิ้น" value="${values.carton || ""}">
    <button class="remove-row" type="button" aria-label="Remove row">×</button>
  `;
  list.appendChild(row);
  row.querySelector(".pickup-destination").value = values.destination || "WH3";
  row.querySelector(".remove-row").addEventListener("click", () => {
    row.remove();
    syncPickupItemsText();
  });
  row.querySelectorAll("input, select").forEach(input => input.addEventListener("input", syncPickupItemsText));
  syncPickupItemsText();
}

function syncPickupItemsText() {
  const target = $("#driverPickupItems");
  if (!target) return "";
  const rows = pickupRowsFromInputs();
  target.value = rows.map(row => `${row.houseNumber},${row.destination},${row.carton}`).join("\n");
  const endPlace = $("#driverEndPlace");
  if (endPlace) endPlace.value = computedEndPlaceFromRows(rows) || "";
  return target.value;
}

function pickupRowsFromInputs() {
  return $$("#driverPickupItemRows .pickup-item-row")
    .map(row => {
      const houseNumber = row.querySelector(".pickup-house").value.trim();
      const destination = row.querySelector(".pickup-destination").value;
      const carton = row.querySelector(".pickup-carton").value.trim();
      return houseNumber ? { houseNumber, destination, carton } : null;
    })
    .filter(Boolean);
}

function computedEndPlaceFromRows(rows) {
  const destinations = Array.from(new Set(rows.map(row => row.destination).filter(Boolean)));
  if (!destinations.length) return "";
  return destinations.length === 1 ? destinations[0] : destinations.join(" / ");
}

function checkedPickupItems() {
  return $$(".pickup-check:checked").map(input => input.value);
}

function isPickupSpecialOrWd() {
  const caseType = $("#driverPickupCase")?.value || "";
  const customerName = $("#driverCustomerName")?.value || "";
  return caseType === "SpecialMD" || /wd|western digital/i.test(customerName);
}

function pickupHouseNumbers() {
  syncPickupItemsText();
  return Array.from(new Set($("#driverPickupItems").value
    .split(/\r?\n/)
    .map(line => line.split(",")[0]?.trim())
    .filter(Boolean)));
}

function validatePickupFlow({ requireLoaded = false } = {}) {
  syncPickupItemsText();
  const missing = [];
  if (!state.pickupStartTime) missing.push("กดเช็คอินก่อนเริ่มงาน");
  if ($$(".pickup-check").length && checkedPickupItems().length < 10) missing.push("ติ๊กตรวจสินค้า 10 รายการให้ครบ");
  if (isPickupSpecialOrWd() && !$("#driverStickerColor").value.trim()) missing.push("กรอกสี Sticker สำหรับงานพิเศษ/WD");
  if (!$("#driverPickupItems").value.trim()) missing.push("เพิ่ม House/Destination อย่างน้อย 1 งาน");
  if (requireLoaded && !state.cargoLoaded) missing.push("กดโหลดสินค้าขึ้นรถก่อนจบงาน");
  if (missing.length) throw new Error(missing.join(" / "));
}

function clearPickupItemRows() {
  $("#driverPickupItemRows").innerHTML = "";
  syncPickupItemsText();
}

function renderDriverJobSelect() {
  const select = $("#driverJobSelect");
  if (!select || !state.dashboard) return;
  const current = select.value;
  select.innerHTML = [
    `<option value="">กรอกเอง / Manual form</option>`,
    ...state.dashboard.jobs.map(job => `<option value="${job.houseNumber}">${job.houseNumber} · ${job.customerName}</option>`)
  ].join("");
  select.value = current && state.dashboard.jobs.some(job => job.houseNumber === current) ? current : "";
  applyDriverJob(select.value);
}

function applyDriverJob(houseNumber) {
  const today = new Date().toISOString().slice(0, 10);
  $("#driverPickupDate").value ||= today;
  if (!houseNumber) {
    state.cargoLoaded = false;
    $("#loadCargoBtn")?.classList.remove("loaded");
    if ($("#loadCargoBtn")) $("#loadCargoBtn").textContent = "โหลดสินค้าขึ้นรถ / Load Cargo";
    $("#driverHouse").value = "";
    $("#driverPickupCase").value = "GeneralManual";
    $("#driverStickerColor").value = "";
    $("#driverCustomerName").readOnly = false;
    $("#driverStartPlace").readOnly = false;
    $("#driverVehiclePlate").readOnly = false;
    return;
  }
  const job = findJob(houseNumber);
  if (!job) return;
  state.pickupStartTime = job.checkInAt || state.pickupStartTime;
  state.cargoLoaded = Boolean(job.loadedAt || job.status === "CargoLoaded" || job.status === "Delivered");
  $("#loadCargoBtn")?.classList.toggle("loaded", state.cargoLoaded);
  if ($("#loadCargoBtn")) $("#loadCargoBtn").textContent = state.cargoLoaded ? "โหลดขึ้นรถแล้ว / Cargo loaded" : "โหลดสินค้าขึ้นรถ / Load Cargo";
  $("#driverHouse").value = job.houseNumber;
  $("#driverPickupCase").value = job.pickupCase || (job.customerName?.toLowerCase().includes("wd") ? "SpecialMD" : "GeneralManual");
  $("#driverPickupDate").value = job.pickupDate || today;
  $("#driverCustomerName").value = job.customerName || "";
  $("#driverVehiclePlate").value = job.vehiclePlate || "";
  $("#driverStartPlace").value = job.pickupLocation || job.startPlace || "";
  $("#driverPieceCount").value = job.pieceCount || "";
  $("#driverPackageType").value = job.packageType || "Carton";
  $("#driverStickerColor").value = job.stickerColor || "";
  $("#driverEndPlace").value = "";
  const locked = Boolean(job.adminPrepared || job.cargoFormMode === "AdminPrepared");
  $("#driverCustomerName").readOnly = locked;
  $("#driverStartPlace").readOnly = locked;
  $("#driverVehiclePlate").readOnly = locked;
  clearPickupItemRows();
  const rows = Array.isArray(job.pickupItems) && job.pickupItems.length
    ? job.pickupItems
    : [{ houseNumber: job.houseNumber, destination: job.destination || job.routeType || "WH3", carton: job.pieceCount || "" }];
  rows.forEach(row => addPickupItemRow(row));
  $("#driverEndPlace").value = computedEndPlaceFromRows(pickupRowsFromInputs()) || "";
}

function primaryHouseNumber() {
  const selected = $("#driverJobSelect").value;
  if (selected) return selected;
  syncPickupItemsText();
  const firstRow = $("#driverPickupItems").value.split(/\r?\n/).find(Boolean);
  return firstRow ? firstRow.split(",")[0].trim() : "";
}

function parsePickupLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [house, dest, carton, pickupDate, route, booking, invoiceNo, contact, tel] = line.split(",").map(cell => cell.trim());
      return {
        house,
        houseNumber: house,
        dest,
        destination: dest,
        carton,
        pickupDate,
        route,
        booking,
        bookingNo: booking,
        invoiceNo,
        invoice: invoiceNo,
        contact,
        tel
      };
    });
}

function adminPickupRows() {
  syncAdminPickupRowsText();
  return parsePickupLines($("#adminPickupItems").value);
}

function escapeAttr(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function addAdminPickupRow(values = {}) {
  const list = $("#adminPickupItemRows");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "admin-job-row";
  row.innerHTML = `
    <input class="admin-row-house" placeholder="House Number" value="${escapeAttr(values.houseNumber || values.house)}">
    <select class="admin-row-destination">
      <option value="WH3">WH3 (คลัง)</option>
      <option value="TG">TG Terminal</option>
      <option value="TGINT">TG Inter Terminal</option>
      <option value="BFS">BFS Terminal</option>
    </select>
    <input class="admin-row-carton" placeholder="Carton" value="${escapeAttr(values.carton)}">
    <input class="admin-row-date" type="date" value="${escapeAttr(values.pickupDate || $("#adminPickupDate")?.value)}">
    <button class="edit-admin-row" type="button">แก้ไข</button>
    <button class="remove-admin-row" type="button" aria-label="Remove row">×</button>
  `;
  list.appendChild(row);
  row.querySelector(".admin-row-destination").value = values.destination || $("#adminDestination")?.value || "WH3";
  row.querySelector(".edit-admin-row").addEventListener("click", () => openAdminRowModal(row));
  row.querySelector(".remove-admin-row").addEventListener("click", () => {
    row.remove();
    syncAdminPickupRowsText();
    updateAdminBatchSummary();
    renderCargoPreview();
  });
  row.querySelectorAll("input, select").forEach(input => input.addEventListener("input", () => {
    syncAdminPickupRowsText();
    updateAdminBatchSummary();
    renderCargoPreview();
  }));
  syncAdminPickupRowsText();
  updateAdminBatchSummary();
}

function adminRowValuesFromElement(row) {
  return {
    houseNumber: row?.querySelector(".admin-row-house")?.value.trim() || "",
    destination: row?.querySelector(".admin-row-destination")?.value || $("#adminDestination")?.value || "WH3",
    carton: row?.querySelector(".admin-row-carton")?.value.trim() || "",
    pickupDate: row?.querySelector(".admin-row-date")?.value || $("#adminPickupDate")?.value || ""
  };
}

function setAdminRowValues(row, values) {
  row.querySelector(".admin-row-house").value = values.houseNumber || "";
  row.querySelector(".admin-row-destination").value = values.destination || "WH3";
  row.querySelector(".admin-row-carton").value = values.carton || "";
  row.querySelector(".admin-row-date").value = values.pickupDate || "";
}

function currentAdminRowModalValues() {
  return {
    houseNumber: $("#rowModalHouse")?.value.trim() || "",
    destination: $("#rowModalDestination")?.value || "WH3",
    carton: $("#rowModalCarton")?.value.trim() || "",
    pickupDate: $("#rowModalPickupDate")?.value || $("#adminPickupDate")?.value || ""
  };
}

function renderAdminRowModalPreview() {
  const preview = $("#rowModalPreview");
  if (!preview) return;
  const row = currentAdminRowModalValues();
  preview.innerHTML = cargoSheetHtml({
    ...adminCargoData(),
    rows: [{
      houseNumber: row.houseNumber || "House Number",
      house: row.houseNumber || "House Number",
      destination: row.destination,
      carton: row.carton,
      pickupDate: row.pickupDate
    }]
  });
}

function openAdminRowModal(row = null) {
  const modal = $("#adminRowModal");
  if (!modal) return;
  state.editingAdminRow = row || null;
  const values = row ? adminRowValuesFromElement(row) : {
    houseNumber: "",
    destination: $("#adminDestination")?.value || "WH3",
    carton: $("#adminPieceCount")?.value || "",
    pickupDate: $("#adminPickupDate")?.value || ""
  };
  $("#adminRowModalTitle").textContent = row ? "แก้ไขรายการ House" : "เพิ่มรายการ House";
  $("#rowModalHouse").value = values.houseNumber || "";
  $("#rowModalDestination").value = values.destination || "WH3";
  $("#rowModalCarton").value = values.carton || "";
  $("#rowModalPickupDate").value = values.pickupDate || "";
  renderAdminRowModalPreview();
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  $("#rowModalHouse").focus();
}

function closeAdminRowModal() {
  const modal = $("#adminRowModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  state.editingAdminRow = null;
}

function saveAdminRowModal() {
  const values = currentAdminRowModalValues();
  if (!values.houseNumber) {
    toast("กรุณากรอก House Number ก่อนบันทึก");
    $("#rowModalHouse")?.focus();
    return;
  }
  if (state.editingAdminRow) {
    setAdminRowValues(state.editingAdminRow, values);
  } else {
    addAdminPickupRow(values);
  }
  syncAdminPickupRowsText();
  updateAdminBatchSummary();
  renderCargoPreview();
  closeAdminRowModal();
  toast("บันทึกรายการ House แล้ว");
}

function adminRowsFromInputs() {
  return $$("#adminPickupItemRows .admin-job-row")
    .map(row => {
      const house = row.querySelector(".admin-row-house").value.trim();
      const destination = row.querySelector(".admin-row-destination").value;
      const carton = row.querySelector(".admin-row-carton").value.trim();
      const pickupDate = row.querySelector(".admin-row-date").value;
      return house ? { house, houseNumber: house, destination, carton, pickupDate } : null;
    })
    .filter(Boolean);
}

function syncAdminPickupRowsText() {
  const target = $("#adminPickupItems");
  if (!target) return "";
  const rows = adminRowsFromInputs();
  target.value = rows
    .map(row => `${row.houseNumber},${row.destination},${row.carton},${row.pickupDate || ""}`)
    .join("\n");
  return target.value;
}

function setAdminPickupRows(rows = []) {
  const list = $("#adminPickupItemRows");
  if (!list) return;
  list.innerHTML = "";
  const normalized = rows.length ? rows : [{ houseNumber: $("#adminHouse")?.value || "", destination: $("#adminDestination")?.value || "WH3", carton: $("#adminPieceCount")?.value || "", pickupDate: $("#adminPickupDate")?.value || "" }];
  normalized.forEach(row => addAdminPickupRow(row));
  syncAdminPickupRowsText();
  updateAdminBatchSummary();
}

function cargoSheetHtmlLegacy(data) {
  const previewRows = data.rows?.length
    ? data.rows
    : [{ house: data.houseNumber, destination: data.destination, carton: data.pieceCount }];
  return `
    <div class="cargo-sheet">
      <header class="cargo-sheet-head">
        <div>
          <strong>Expeditors (Thailand) Ltd.</strong>
          <small>Warehouse Office / Air Export Department</small>
        </div>
        <h3>CARGO PICKUP FORM</h3>
      </header>
      <div class="cargo-grid">
        <div><span>Pickup Date</span><b>${data.pickupDate || "-"}</b></div>
        <div><span>Pickup Time</span><b>${data.pickupTime || "Auto"}</b></div>
        <div><span>Shipper</span><b>${data.customer || "-"}</b></div>
        <div><span>Place Loading</span><b>${data.pickupLocation || "-"}</b></div>
        <div><span>Driver's Name</span><b>${data.driverName || "-"}</b></div>
        <div><span>Truck License</span><b>${data.vehiclePlate || "-"}</b></div>
        <div><span>Package Type</span><b>${data.packageType || "-"}</b></div>
        <div><span>Sticker Color</span><b>${data.stickerColor || "-"}</b></div>
      </div>
      <table class="cargo-table">
        <thead>
          <tr>
            <th>HAWB / House</th>
            <th>Destination</th>
            <th>Total Carton</th>
            <th>Pickup Date</th>
            <th>Route</th>
          </tr>
        </thead>
        <tbody>
          ${previewRows.map(row => `
            <tr>
              <td>${row.house || row.houseNumber || "-"}</td>
              <td>${row.destination || data.destination || "-"}</td>
              <td>${row.carton || data.pieceCount || "-"}</td>
              <td>${row.pickupDate || data.pickupDate || "-"}</td>
              <td>${row.destination || data.destination || "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="cargo-checks">
        <span>□ Carton</span>
        <span>□ Bundle</span>
        <span>□ Pallet</span>
        <span>□ Shipping Document YES</span>
        <span>□ Airport Checked By</span>
      </div>
      <div class="cargo-sign">
        <div>Released Shipment & Seal by</div>
        <div>Received by</div>
        <div>Date / Time</div>
      </div>
    <footer>Preview generated from S.C.D.TRANSPORT Admin Form</footer>
    </div>
  `;
}

function cargoSheetHtml(data) {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
  const firstValue = (...items) => {
    for (const item of items) {
      if (item !== undefined && item !== null && String(item).trim() !== "") return item;
    }
    return "";
  };
  const normalizeRoute = item => String(item || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9ก-๙]/g, "");
  const rawRows = data.rows?.length
    ? data.rows
    : [{
      house: data.houseNumber,
      houseNumber: data.houseNumber,
      dest: firstValue(data.dest, data.destCity, data.destinationCity, data.destAirport),
      destination: firstValue(data.dest, data.destCity, data.destinationCity, data.destAirport),
      route: firstValue(data.route, data.routeType, data.destination, "WH3"),
      carton: data.pieceCount,
      pickupDate: data.pickupDate,
      booking: firstValue(data.booking, data.bookingNo),
      bookingNo: firstValue(data.booking, data.bookingNo),
      invoiceNo: firstValue(data.invoiceNo, data.invoice),
      invoice: firstValue(data.invoice, data.invoiceNo),
      contact: firstValue(data.contact, data.contactPerson),
      tel: firstValue(data.tel, data.phone, data.pickupPhone)
    }];
  const visibleRows = rawRows.slice(0, 5);
  const formRows = [...visibleRows, ...Array.from({ length: Math.max(0, 5 - visibleRows.length) }, () => ({}))];
  const primaryRow = visibleRows[0] || {};
  const packageType = String(data.packageType || "").toLowerCase();
  const check = checked => `<span class="cargo-checkbox${checked ? " checked" : ""}">${checked ? "✓" : ""}</span>`;
  const value = item => item ? esc(item) : "&nbsp;";
  const houseValue = row => row.house || row.houseNumber || "";
  const rowCarton = row => row.carton || row.pieceCount || data.pieceCount || "";
  const rowDate = row => row.pickupDate || data.pickupDate || "";
  const hasPackage = name => packageType.includes(name.toLowerCase());
  const shippingYes = String(data.shippingDocument || "").toUpperCase() === "YES";
  const shippingNo = String(data.shippingDocument || "").toUpperCase() === "NO";
  const tick = checked => `<span class="cargo-chk${checked ? " checked" : ""}">${checked ? "&#10003;" : ""}</span>`;
  const show = item => firstValue(item) ? esc(firstValue(item)) : "&nbsp;";
  const rowHouse = row => firstValue(row.house, row.houseNumber, row.house_number, row.hawb, row.HAWB);
  const rowTotalCarton = row => firstValue(row.carton, row.totalCarton, row.total_carton, row.pieceCount, row.pieces, row.qty, row.QTY, row.amount, data.pieceCount);
  const rowPickupDate = row => firstValue(row.pickupDate, row.pickup_date, row.readyDate, row.READY, data.pickupDate);
  const rowDestCity = row => firstValue(
    row.dest,
    row.destCity,
    row.destinationCity,
    row.destination_city,
    row.cityDest,
    row.airportDest,
    row.finalDest,
    row.destAirport,
    row.DEST,
    row.destination && !["WH3", "TG", "TGINT", "TGINTER", "BFS"].includes(normalizeRoute(row.destination)) ? row.destination : "",
    row.flightNo && !["TBC"].includes(row.flightNo) ? row.flightNo : "",
    data.dest,
    data.destCity,
    data.destinationCity,
    data.destAirport,
    data.flightNo && !["TBC"].includes(data.flightNo || "") ? data.flightNo : ""
  );
  const rowRouteValue = row => firstValue(row.route, row.routeType, row.route_type, row.terminal, row.destinationRoute, row.destination_route, row.routeDestination, row.route_to_load, row.loadDestination, data.route, data.routeType, data.route_type, data.destination);
  const rowLoadRoute = row => normalizeRoute(rowRouteValue(row) || rowDestCity(row));
  const rowInvoiceNo = row => firstValue(row.invoiceNo, row.invoice_no, row.invoice, row.INVOICE, row["Invoice No."], data.invoiceNo, data.invoice_no, data.invoice);
  const rowBookingNo = row => firstValue(row.booking, row.bookingNo, row.booking_no, row.bookingNumber, row.booking_number, row.BOOKING, data.booking, data.bookingNo, data.booking_no);
  const contactValue = firstValue(data.contact, data.contactPerson, primaryRow.contact, primaryRow.contactName, primaryRow.contact_name, primaryRow.CONTACT_PERSON);
  const telValue = firstValue(data.tel, data.phone, data.pickupPhone, primaryRow.tel, primaryRow.phone, primaryRow.PHONE);
  const customerValue = firstValue(data.customer, primaryRow.customer, primaryRow.customerName, primaryRow.customer_name, primaryRow.PICKUP);
  const pickupPlaceValue = firstValue(data.pickupLocation, primaryRow.pickupLocation, primaryRow.pickup_location, primaryRow.placeLoading, primaryRow.place_loading, primaryRow.Address);
  const totalCartonValue = visibleRows.reduce((sum, row) => sum + (Number(rowTotalCarton(row)) || 0), 0) || firstValue(data.pieceCount, data.amount);

  return `
    <div class="cargo-sheet cargo-pickup-a4">

      <div class="cargo-letterhead">
        <div class="cargo-company-block">
          <strong>Expeditors (Thailand) Ltd.</strong>
          <small>Head office : 44th Floor, Empire Tower, Park Wing, No. 1 South Sathorn Road,</small>
          <small>Yannawa, Sathorn, Bangkok 10120, Thailand</small>
          <small>Warehouse Office : Free Zone, Suvarnabhumi Airport, Samut Prakarn 10540</small>
          <small>Tel : (66) 2131-2269-72, (66) 2131-2222 ext. 2269-72 Fax : (66) 2670-1037-8</small>
        </div>
        <div class="cargo-logo-text">Expeditors<sup>&#174;</sup></div>
      </div>

      <h2 class="cargo-title">CARGO PICKUP FORM</h2>

      <div class="cargo-form-box">

        <table class="cargo-st cargo-top-table">
          <tbody>
            <tr>
              <td style="width:20%"><span>Pickup Date<br><em>(วันที่รับสินค้า)</em></span><b>${show(data.pickupDate)}</b></td>
              <td style="width:20%"><span>Pickup Time<br><em>(เวลารับสินค้า)</em></span><b>${show(data.pickupTime || "")}</b></td>
              <td style="width:35%"><span>Contact<br><em>(ติดต่อ)</em></span><b>${show(contactValue)}</b></td>
              <td style="width:25%"><span>Tel :<br><em>(โทรศัพท์)</em></span><b>${show(telValue)}</b></td>
            </tr>
            <tr>
              <td colspan="2"><span>Shipper<br><em>(ชื่อผู้ส่งออก)</em></span><b>${show(customerValue)}</b></td>
              <td colspan="2"><span>Place Loading<br><em>(สถานที่รับสินค้า)</em></span><b>${show(pickupPlaceValue)}</b></td>
            </tr>
            <tr>
              <td colspan="2"><span>Driver's Name :<br><em>(ชื่อคนขับรถ)</em></span><b>${show(data.driverName)}</b></td>
              <td><span>Truck License :<br><em>(ทะเบียนรถ)</em></span><b>${show(data.vehiclePlate)}</b></td>
              <td><span>Type :<br><em>(ประเภทรถ)</em></span><b>${show(data.vehicleType)}</b></td>
            </tr>
          </tbody>
        </table>

        <table class="cargo-dt cargo-house-top">
          <tbody>
            ${formRows.map(row => {
              const hasH = !!rowHouse(row);
              return `
              <tr>
                <td style="width:22%"><span>HAWB<br><em>(เฮ้าส์แอร์เวย์บิล)</em></span><b>${show(rowHouse(row))}</b></td>
                <td style="width:18%"><span>Dest<br><em>(เมืองปลายทาง)</em></span><b>${hasH ? show(rowDestCity(row)) : "&nbsp;"}</b></td>
                <td style="width:20%"><span>Invoice No.<br><em>(เลขที่อินวอยซ์)</em></span><b>${hasH ? show(rowInvoiceNo(row)) : "&nbsp;"}</b></td>
                <td style="width:15%"><span>Total Carton<br><em>(จำนวนหีบห่อ)</em></span><b>${hasH ? show(rowTotalCarton(row)) : "&nbsp;"}</b></td>
                <td style="width:12.5%"><span>Booking<br><em>(จำนวนที่จอง)</em></span><b>${hasH ? show(rowBookingNo(row)) : "&nbsp;"}</b></td>
                <td style="width:12.5%"><span>Actual<br><em>(จำนวนรับจริง)</em></span><b>&nbsp;</b></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>

        <table class="cargo-st">
          <tbody>
            <tr>
              <td style="width:80%">
                <div class="cargo-receive-label">Total Receive From Vendor: <em>(จำนวนหีบห่อของสินค้าหลังผ่านพิธีการตรวจรับสินค้าแล้ว)</em></div>
                <div class="cargo-receive-checks">
                  <label>${tick(hasPackage("carton") || hasPackage("กล่อง"))} Carton <em>กล่อง</em></label>
                  <label>${tick(hasPackage("bundle") || hasPackage("มัด"))} Bundle <em>มัด</em></label>
                  <label>${tick(hasPackage("pallet") || hasPackage("พาเลท"))} Pallet <em>พาเลท</em></label>
                </div>
              </td>
              <td style="width:20%"><span>Grand Total<br><em>(รวมจำนวนหีบห่อ)</em></span><b>${show(totalCartonValue)}</b></td>
            </tr>
          </tbody>
        </table>

        <table class="cargo-st">
          <tbody>
            <tr>
              <td style="width:25%"><span>Shipping Document<br><em>(เอกสารแนบเครื่อง)</em></span></td>
              <td style="width:15%;text-align:center">${tick(false)} NO<br><em>(ไม่มี)</em></td>
              <td style="width:15%;text-align:center">${tick(false)} YES<br><em>(มี)</em></td>
              <td style="width:25%"><span>Total Envelope<br><em>(จำนวนซองเอกสาร)</em></span></td>
              <td style="width:20%"><span>Airport Checked By :</span></td>
            </tr>
          </tbody>
        </table>

        <table class="cargo-st cargo-remarks-table">
          <tbody>
            <tr>
              <td class="cargo-remarks-label" style="width:8%">Remarks :</td>
              <td style="width:92%">
                <label>${tick(false)} THE EXTERNAL CONDITION OF THE ABOVE PACKAGES IS IN ACCORDANCE TO THE GENERAL STANDARD FOR AIRFREIGHT EXPORT SHIPMENTS.<br>
                <em class="cargo-th-indent">กล่องสินค้าที่ส่งมอบถูกต้องตามมาตรฐานการส่งออก</em></label>
                <label>${tick(false)} THE EXTERNAL CONDITION OF THE ABOVE PACKAGES IS NOT IN ACCORDANCE TO THE GENERAL STANDARD FOR AIRFREIGHT EXPORT SHIPMENTS.
                THERE FOR EXPEDITORS (THAILAND) LTD. REJECTS ANY RESPONSIBILITIES FOR DAMAGES IN TRANSIT OF THE A.M. SHIPMENTS.<br>
                <em class="cargo-th-indent">มีสินค้าที่ไม่ได้มาตรฐานปะปนอยู่ด้วย และทางบริษัทฯ จะไม่รับผิดชอบหากเกิดการเสียหายระหว่างขนส่ง</em></label>
                <label>${tick(false)} ALL PACKAGES HAVE BEEN PACKED AND CLOSED/SEALED BY THE SHIPPER AND HAS NOT BEEN CHECKED BY EXPEDITORS REPRESENTATIVE.<br>
                <em class="cargo-th-indent">โรงงานผู้ส่งออกเป็นผู้จัดการบรรจุและปิดกล่องสินค้าทั้งหมด ตามใบรายการ/ใบอินวอยซ์ ที่ทางโรงงานผู้ส่งออกเป็นผู้ออกเอกสาร โดยทาง บริษัท เอ็กซ์พีดิเตอร์สฯ มิได้ตรวจเช็คภายในกล่องสินค้านั้น</em></label>
                <label>${tick(false)} OTHERS (PLEASE SPECIFY IN DETAIL): <span class="cargo-line-fill">&nbsp;</span><br>
                <em class="cargo-th-indent">อื่นๆ โปรดระบุ</em></label>
              </td>
            </tr>
          </tbody>
        </table>

        <table class="cargo-st">
          <tbody>
            <tr>
              <td style="width:25%"><span>Seal Number<br><em>(ซีล)</em></span></td>
              <td style="width:25%"><span>Rear door<br><em>ประตูด้านหลัง</em></span></td>
              <td style="width:25%"><span>Left door<br><em>ประตูด้านซ้าย</em></span></td>
              <td style="width:25%"><span>Right door<br><em>ประตูด้านขวา</em></span></td>
            </tr>
          </tbody>
        </table>

        <table class="cargo-st cargo-sign-table">
          <tbody>
            <tr>
              <td style="width:70%">Released Shipment &amp; Seal by:<br><em>ผู้ทำการซีลและตรวจปล่อยสินค้าขึ้นรถออกจากโรงงานผู้ส่งสินค้า</em></td>
              <td style="width:15%"><span>Date<br><em>(วันที่)</em></span></td>
              <td style="width:15%"><span>Time<br><em>(เวลา)</em></span></td>
            </tr>
            <tr>
              <td>Received by :<br><em>เจ้าหน้าที่ บริษัท เอ็กซ์พีดิเตอร์ส (ประเทศไทย) จำกัด รับมอบสินค้า ณ โรงงาน</em></td>
              <td><span>Date<br><em>(วันที่)</em></span></td>
              <td><span>Time<br><em>(เวลา)</em></span></td>
            </tr>
          </tbody>
        </table>

        <div class="cargo-driver-info">
          <strong>Driver Informations</strong>
          <div>Start From/<em>ออกจาก</em><span class="dline"></span>Time/<em>เวลา</em><span class="dline short"></span>To/<em>ถึง</em><span class="dline"></span>Time/<em>เวลา</em><span class="dline short"></span></div>
          <div>Start From/<em>ออกจาก</em><span class="dline"></span>Time/<em>เวลา</em><span class="dline short"></span>To/<em>ถึง</em><span class="dline"></span>Time/<em>เวลา</em><span class="dline short"></span></div>
        </div>

        <div class="cargo-security-wrap">
          <div class="cargo-security-main">
            <div class="cargo-security-top">
              Container Security Checklist (7 Points Inspection)
              &nbsp;&nbsp;&nbsp;${tick(data.leftSide)} Left Side
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${tick(data.floor)} Floor
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${tick(data.doorCheck)} Door - inside and outside
            </div>
            <div class="cargo-security-bot">
              Note :&nbsp;&nbsp;&nbsp;${tick(data.frontWall)} Front Wall
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${tick(data.rightSide)} Right Side
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${tick(data.ceilingRoof)} Ceiling/Roof
              &nbsp;&nbsp;&nbsp;&nbsp;${tick(data.outsideUnder)} Outside/Undercarriage
            </div>
          </div>
          <div class="cargo-security-inspector">Inspected by :</div>
        </div>

        <table class="cargo-dt cargo-house-bottom">
          <tbody>
            ${formRows.map(row => {
              const hasHouse = !!rowHouse(row);
              const dest = hasHouse ? rowLoadRoute(row) : "";
              return `<tr>
                <td style="width:25%"><span>HAWB<br><em>(เฮ้าส์แอร์เวย์บิล)</em></span><b>${show(rowHouse(row))}</b></td>
                <td style="width:25%"><span>Dest<br><em>(เมืองปลายทาง)</em></span><b>${hasHouse ? show(rowDestCity(row)) : "&nbsp;"}</b></td>
                <td style="width:35%" class="cargo-route-checks">
                  ${tick(dest === "TG")} TG &nbsp;&nbsp;
                  ${tick(dest === "TGINT" || dest === "TGINTER")} TG INT &nbsp;&nbsp;
                  ${tick(dest === "BFS")} BFS &nbsp;&nbsp;
                  ${tick(dest === "WH3" || dest === "เข้าคลังWH3")} WH3
                </td>
                <td style="width:15%"><span>Total Carton<br><em>(จำนวนหีบห่อ)</em></span><b>${hasHouse ? show(rowTotalCarton(row)) : "&nbsp;"}</b></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>

      </div>

      <footer class="cargo-footer">
        <div class="cargo-footer-note">@ ALL ORDER ARE BASED ON OUR STANDARD TRADING CONDITION, A COPY AVAILABLE UPON REQUEST.</div>
        <div class="cargo-footer-bottom">
          <span>Document Owner : Air Expeditors, Air Department<br>Source : F:\USER\Common\Local Forms &amp; Procedures\forms\Warehouse</span>
          <span>For Expeditors<br>Lastest Revision date : March 05, 2014</span>
        </div>
      </footer>
    </div>
  `;
}

function adminCargoData() {
  const rows = adminPickupRows();
  const firstRow = rows[0] || {};
  return {
    houseNumber: $("#adminHouse").value.trim(),
    customer: $("#adminCustomer").selectedOptions[0]?.textContent || "-",
    rows,
    pickupDate: $("#adminPickupDate").value,
    pickupLocation: $("#adminPickupLocation").value,
    driverName: $("#adminDriverName").value,
    vehiclePlate: $("#adminVehiclePlate").value,
    pieceCount: $("#adminPieceCount").value,
    packageType: $("#adminPackageType").value,
    destination: $("#adminDestination").value,
    route: $("#adminDestination").value,
    routeType: $("#adminDestination").value,
    dest: firstRow.dest || firstRow.destination || "",
    booking: firstRow.booking || firstRow.bookingNo || "",
    bookingNo: firstRow.booking || firstRow.bookingNo || "",
    invoiceNo: firstRow.invoiceNo || firstRow.invoice || "",
    contact: firstRow.contact || "",
    tel: firstRow.tel || "",
    stickerColor: $("#adminStickerColor").value
  };
}

function driverUsers() {
  return (state.users || []).filter(user => user.role === "Driver" && user.status !== "Inactive");
}

function selectedAdminDriver() {
  return driverUsers().find(user => user.id === $("#adminDriverSelect")?.value);
}

function renderAdminDriverOptions() {
  const select = $("#adminDriverSelect");
  if (!select) return;
  const current = select.value;
  const drivers = driverUsers();
  select.innerHTML = drivers
    .map(driver => `<option value="${driver.id}">${driver.name}${driver.vehiclePlate ? ` / ${driver.vehiclePlate}` : ""}</option>`)
    .join("");
  select.value = drivers.some(driver => driver.id === current) ? current : (drivers[0]?.id || "");
  applyAdminDriver();
}

function applyAdminDriver() {
  const driver = selectedAdminDriver();
  if (!driver) return;
  $("#adminDriverName").value = driver.name || "";
  $("#adminVehiclePlate").value = driver.vehiclePlate || "";
  updateAdminBatchSummary();
  renderCargoPreview();
}

function updateAdminBatchSummary() {
  const el = $("#adminBatchSummary");
  if (!el) return;
  const rows = adminPickupRows();
  const count = rows.length || ($("#adminHouse").value.trim() ? 1 : 0);
  const driver = $("#adminDriverName").value.trim() || "-";
  const plate = $("#adminVehiclePlate").value.trim() || "-";
  const dates = Array.from(new Set(rows.map(row => row.pickupDate).filter(Boolean)));
  const dateLabel = dates.length > 1 ? `${dates.length} วัน / days` : (dates[0] || $("#adminPickupDate").value || "-");
  el.innerHTML = `<strong>Assign batch</strong><span>${count} งาน / jobs -> ${driver} / ${plate} / ${dateLabel}</span>`;
}

function jobCargoData(job) {
  const rows = Array.isArray(job.pickupItems) && job.pickupItems.length
    ? job.pickupItems
    : [{
      houseNumber: job.houseNumber,
      dest: job.destAirport || job.destinationCity || "",
      destination: job.destAirport || job.destinationCity || "",
      route: job.routeType || job.destination || "WH3",
      routeType: job.routeType || job.destination || "WH3",
      carton: job.pieceCount || "",
      pickupDate: job.pickupDate || toDateInput(job.flightTime),
      booking: job.booking || job.bookingNo || "",
      invoiceNo: job.invoiceNo || "",
      contact: job.contactPerson || "",
      tel: job.pickupPhone || ""
    }];
  return {
    houseNumber: job.houseNumber,
    customer: job.customerName,
    rows,
    pickupDate: job.pickupDate || toDateInput(job.flightTime),
    pickupTime: job.readyTime ? new Date(job.readyTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "",
    pickupLocation: job.pickupLocation,
    contact: job.contactPerson,
    tel: job.pickupPhone,
    booking: job.booking || job.bookingNo,
    invoiceNo: job.invoiceNo,
    driverName: job.driverName,
    vehiclePlate: job.vehiclePlate,
    pieceCount: job.pieceCount,
    packageType: job.packageType || "Carton",
    dest: job.destAirport || job.destinationCity || "",
    route: job.routeType || job.destination || "WH3",
    destination: job.routeType || job.destination || "WH3",
    stickerColor: job.stickerColor
  };
}

const CARGO_FORM_W = Math.round(210 * 96 / 25.4); // A4 width px @96dpi ≈ 794
const CARGO_FORM_H = Math.round(297 * 96 / 25.4); // A4 height px @96dpi ≈ 1123
const HOUSES_PER_PAGE = 5; // max HAWB rows per cargo form

let _lastCargoHtml = "";

function getCargoFitZoom() {
  const container = $("#cargoPreview");
  if (!container) return 0.65;
  const w = (container.clientWidth || 560) - 28;
  return Math.min(1, Math.max(0.25, w / CARGO_FORM_W));
}

function renderCargoPreview() {
  syncAdminPickupRowsText();
  _lastCargoHtml = cargoSheetHtml(adminCargoData());
  applyCargoZoom(state.cargoPreviewZoom ?? getCargoFitZoom());
}

function applyCargoZoom(zoom) {
  state.cargoPreviewZoom = zoom;
  const container = $("#cargoPreview");
  if (!container || !_lastCargoHtml) return;

  const scaledW = Math.ceil(CARGO_FORM_W * zoom);
  const scaledH = Math.ceil(CARGO_FORM_H * zoom);

  // Clip wrapper makes container shrink to scaled size so no dead space below
  container.innerHTML = `
    <div style="width:${scaledW}px;height:${scaledH}px;overflow:hidden;
                border-radius:4px;box-shadow:0 6px 20px rgba(0,0,0,.18);flex-shrink:0;">
      <div id="cargoScaleWrap" style="transform:scale(${zoom});transform-origin:top left;
                width:${CARGO_FORM_W}px;height:${CARGO_FORM_H}px;">
        ${_lastCargoHtml}
      </div>
    </div>`;

  const label = $("#cargoZoomLabel");
  if (label) label.textContent = Math.round(zoom * 100) + "%";
}

function printCargoOnly() {
  syncAdminPickupRowsText();
  const content = _lastCargoHtml || cargoSheetHtml(adminCargoData());
  const frame = document.createElement("iframe");
  frame.title = "Cargo Pickup Form Print";
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8">
        <title>Cargo Pickup Form</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Arial, "Kanit", sans-serif; font-size: 7.6pt; line-height: 1.12; }
          .cargo-pickup-a4 { width: 210mm; height: 297mm; margin: 0 auto; padding: 5.5mm 6.5mm; border: 0; background: #fffef9; overflow: hidden; page-break-inside: avoid; }
          .cargo-letterhead { display: grid; grid-template-columns: 1fr auto; gap: 8mm; align-items: start; min-height: 15mm; }
          .cargo-company-block strong, .cargo-company-block small { display: block; }
          .cargo-company-block strong { font-size: 8.2pt; font-weight: 600; }
          .cargo-company-block small { font-size: 5.7pt; line-height: 1.08; }
          .cargo-logo-text { font-size: 18pt; margin-top: 1mm; }
          .cargo-title { margin: 0 0 1.2mm; text-align: center; font-size: 9.3pt; text-decoration: underline; font-weight: 600; }
          .cargo-pickup-a4 span, .cargo-pickup-a4 em { color: #374151; font-size: 6.2pt; font-style: normal; }
          .cargo-pickup-a4 b, .cargo-pickup-a4 strong { font-weight: 600; }
          .cargo-form-box { border: .35mm solid #111827; border-bottom: none; }
          .cargo-st { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .cargo-st td { border-right: .35mm solid #111827; border-bottom: .35mm solid #111827; padding: .8mm 1.2mm; vertical-align: top; }
          .cargo-st td:last-child { border-right: none; }
          .cargo-dt { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .cargo-dt td { border-right: .3mm dashed #4b5563; border-bottom: .3mm dashed #4b5563; padding: .7mm 1.2mm; vertical-align: top; }
          .cargo-dt td:last-child { border-right: none; }
          .cargo-dt tr:last-child td { border-bottom: .35mm solid #111827; }
          .cargo-top-table td { height: 9.5mm; }
          .cargo-house-top td { height: 8mm; }
          .cargo-sign-table td { height: 8mm; }
          .cargo-house-bottom td { height: 6.5mm; }
          .cargo-chk { display: inline-grid; place-items: center; width: 2.5mm; height: 2.5mm; border: .3mm solid #111827; font-size: 5.5pt; line-height: 1; vertical-align: -.4mm; margin-right: .4mm; }
          .cargo-receive-label { margin-bottom: .5mm; }
          .cargo-receive-checks { display: flex; gap: 3.5mm; margin-top: .4mm; align-items: center; }
          .cargo-receive-checks label { display: flex; align-items: center; gap: .4mm; margin: 0; }
          .cargo-remarks-table td { padding: .7mm 1mm; }
          .cargo-remarks-label { vertical-align: top !important; white-space: nowrap; font-weight: 500; }
          .cargo-remarks-table label { display: block; margin-bottom: .8mm; line-height: 1.1; }
          .cargo-th-indent { margin-left: 3.5mm; }
          .cargo-line-fill { display: inline-block; width: 65mm; border-bottom: .25mm solid #111827; vertical-align: bottom; }
          .cargo-driver-info { padding: .7mm 1.2mm; border-bottom: .35mm solid #111827; min-height: 9mm; }
          .cargo-driver-info strong { display: block; margin-bottom: .5mm; }
          .cargo-driver-info div { display: flex; align-items: flex-end; gap: .8mm; border-bottom: .25mm dashed #4b5563; min-height: 3.8mm; padding-bottom: .3mm; margin-bottom: .4mm; }
          .cargo-driver-info .dline { flex: 1; border-bottom: .3mm dotted #374151; display: inline-block; }
          .cargo-driver-info .dline.short { flex: 0 0 13mm; }
          .cargo-security-wrap { display: flex; border-bottom: .35mm solid #111827; min-height: 9mm; }
          .cargo-security-main { flex: 1; border-right: .35mm solid #111827; }
          .cargo-security-top { padding: .6mm 1.2mm; border-bottom: .25mm dashed #4b5563; min-height: 4mm; }
          .cargo-security-bot { padding: .6mm 1.2mm; min-height: 4mm; }
          .cargo-security-inspector { width: 28mm; padding: .6mm 1mm; }
          .cargo-route-checks { vertical-align: middle !important; }
          .cargo-footer { margin-top: .8mm; font-size: 5.6pt; }
          .cargo-footer-note { text-align: center; margin-bottom: .5mm; font-size: 6pt; }
          .cargo-footer-bottom { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>${content}</body>
    </html>`);
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 200);
}

function printMultipleCargoForms(htmlArray) {
  if (!htmlArray?.length) return;
  const frame = document.createElement("iframe");
  frame.title = "Cargo Pickup Form Print";
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  const css = `@page{size:A4 portrait;margin:0;}*{box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;color:#111827;font-family:Arial,"Kanit",sans-serif;font-size:7.6pt;line-height:1.12;}.cargo-pickup-a4{width:210mm;height:297mm;margin:0 auto;padding:5.5mm 6.5mm;border:0;background:#fffef9;overflow:hidden;page-break-after:always;}.cargo-pickup-a4:last-child{page-break-after:auto;}.cargo-letterhead{display:grid;grid-template-columns:1fr auto;gap:8mm;align-items:start;min-height:15mm;}.cargo-company-block strong,.cargo-company-block small{display:block;}.cargo-company-block strong{font-size:8.2pt;font-weight:600;}.cargo-company-block small{font-size:5.7pt;line-height:1.08;}.cargo-logo-text{font-size:18pt;margin-top:1mm;}.cargo-title{margin:0 0 1.2mm;text-align:center;font-size:9.3pt;text-decoration:underline;font-weight:600;}.cargo-pickup-a4 span,.cargo-pickup-a4 em{color:#374151;font-size:6.2pt;font-style:normal;}.cargo-pickup-a4 b,.cargo-pickup-a4 strong{font-weight:600;}.cargo-form-box{border:.35mm solid #111827;border-bottom:none;}.cargo-st{width:100%;border-collapse:collapse;table-layout:fixed;}.cargo-st td{border-right:.35mm solid #111827;border-bottom:.35mm solid #111827;padding:.8mm 1.2mm;vertical-align:top;}.cargo-st td:last-child{border-right:none;}.cargo-dt{width:100%;border-collapse:collapse;table-layout:fixed;}.cargo-dt td{border-right:.3mm dashed #4b5563;border-bottom:.3mm dashed #4b5563;padding:.7mm 1.2mm;vertical-align:top;}.cargo-dt td:last-child{border-right:none;}.cargo-dt tr:last-child td{border-bottom:.35mm solid #111827;}.cargo-top-table td{height:9.5mm;}.cargo-house-top td{height:8mm;}.cargo-sign-table td{height:8mm;}.cargo-house-bottom td{height:6.5mm;}.cargo-chk{display:inline-grid;place-items:center;width:2.5mm;height:2.5mm;border:.3mm solid #111827;font-size:5.5pt;line-height:1;vertical-align:-.4mm;margin-right:.4mm;}.cargo-receive-label{margin-bottom:.5mm;}.cargo-receive-checks{display:flex;gap:3.5mm;margin-top:.4mm;align-items:center;}.cargo-receive-checks label{display:flex;align-items:center;gap:.4mm;margin:0;}.cargo-remarks-table td{padding:.7mm 1mm;}.cargo-remarks-label{vertical-align:top!important;white-space:nowrap;font-weight:500;}.cargo-remarks-table label{display:block;margin-bottom:.8mm;line-height:1.1;}.cargo-th-indent{margin-left:3.5mm;}.cargo-line-fill{display:inline-block;width:65mm;border-bottom:.25mm solid #111827;vertical-align:bottom;}.cargo-driver-info{padding:.7mm 1.2mm;border-bottom:.35mm solid #111827;min-height:9mm;}.cargo-driver-info strong{display:block;margin-bottom:.5mm;}.cargo-driver-info div{display:flex;align-items:flex-end;gap:.8mm;border-bottom:.25mm dashed #4b5563;min-height:3.8mm;padding-bottom:.3mm;margin-bottom:.4mm;}.cargo-driver-info .dline{flex:1;border-bottom:.3mm dotted #374151;display:inline-block;}.cargo-driver-info .dline.short{flex:0 0 13mm;}.cargo-security-wrap{display:flex;border-bottom:.35mm solid #111827;min-height:9mm;}.cargo-security-main{flex:1;border-right:.35mm solid #111827;}.cargo-security-top{padding:.6mm 1.2mm;border-bottom:.25mm dashed #4b5563;min-height:4mm;}.cargo-security-bot{padding:.6mm 1.2mm;min-height:4mm;}.cargo-security-inspector{width:28mm;padding:.6mm 1mm;}.cargo-route-checks{vertical-align:middle!important;}.cargo-footer{margin-top:.8mm;font-size:5.6pt;}.cargo-footer-note{text-align:center;margin-bottom:.5mm;font-size:6pt;}.cargo-footer-bottom{display:flex;justify-content:space-between;}`;
  doc.open();
  doc.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Cargo Pickup Forms</title><style>${css}</style></head><body>${htmlArray.join("")}</body></html>`);
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 200);
}

function transferHouseNumbers() {
  const values = transferSelectedTextNumbers();
  const current = normalizeHouseBarcode($("#terminalHouse")?.value || "");
  return [...new Set(values.length ? values : [current].filter(Boolean))];
}

function transferSelectedTextNumbers() {
  return String($("#transferHouseList")?.value || "")
    .split(/[\n,]+/)
    .map(normalizeHouseBarcode)
    .filter(Boolean);
}

function transferJobs() {
  return transferHouseNumbers().map(findExactJob).filter(Boolean);
}

function transferSheetHtml() {
  const jobs = transferJobs();
  const date = $("#transferDate")?.value || dateInputValue();
  const rows = jobs.length ? jobs : transferHouseNumbers().map(houseNumber => ({ houseNumber }));
  const emptyRows = Math.max(0, 12 - rows.length);
  const rowHtml = rows.map(job => `
    <tr>
      <td>${job.houseNumber || ""}</td>
      <td>${job.masterNumber || job.flightNo || ""}</td>
      <td>${job.customerName || ""}</td>
      <td>${job.destAirport || job.terminalDestination || $("#transferTo")?.value || ""}</td>
      <td>${job.pieceCount || job.amount || ""}</td>
      <td class="check-cell">□</td><td class="check-cell">□</td><td class="check-cell">□</td>
    </tr>`).join("");
  const blanks = Array.from({ length: emptyRows }, () => `<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");
  return `<article class="transfer-sheet">
    <header class="transfer-sheet-head">
      <div><strong>Expeditors (Thailand) Ltd.</strong><small>Warehouse Office / Air Export Department</small></div>
      <h3>CARGO TRANSFER FORM</h3>
    </header>
    <div class="transfer-meta">
      <div><span>Transfer Date / วันที่ส่ง</span><b>${date}</b></div>
      <div><span>Time / เวลา</span><b>${$("#transferTime")?.value || ""}</b></div>
      <div><span>Release Shipment by</span><b>${$("#transferReleaseBy")?.value || ""}</b></div>
      <div><span>Transfer From / ต้นทาง</span><b>${$("#transferFrom")?.value || "WH3"}</b></div>
      <div><span>To TMO / ปลายทาง</span><b>${$("#transferTo")?.value || "TG"}</b></div>
      <div><span>Driver's Name / คนขับ</span><b>${$("#transferDriver")?.value || ""}</b></div>
      <div><span>Truck License / ทะเบียนรถ</span><b>${$("#transferPlate")?.value || ""}</b></div>
      <div><span>Vehicle Type / ประเภทรถ</span><b>${$("#transferVehicleType")?.value || ""}</b></div>
    </div>
    <table class="transfer-table">
      <thead><tr><th>HAWB / House</th><th>Master / Flight</th><th>Customer</th><th>Destination</th><th>Carton</th><th>Permit</th><th>Security</th><th>Inspected</th></tr></thead>
      <tbody>${rowHtml}${blanks}</tbody>
    </table>
    <div class="transfer-signatures">
      <div><b>WH release by:</b><span>ลงชื่อ ____________________</span></div><div><b>Date / Time</b><span>${date} ____________________</span></div>
      <div><b>Driver Transfer Shipment:</b><span>ลงชื่อ ____________________</span></div><div><b>Date / Time</b><span>${date} ____________________</span></div>
      <div><b>TMO Received by:</b><span>ลงชื่อ ____________________</span></div><div><b>Date / Time</b><span>${date} ____________________</span></div>
    </div>
    <section class="transfer-unload"><h4>Unload by Panthai</h4><div>Start unload (เริ่มลงสินค้า):</div><div>Unload finished (ลงเสร็จ):</div><div>Found any damage (เจอสินค้าเสียหายหรือไม่):</div><div>Issue cause (สาเหตุ):</div><div>Seamless operation (การทำงานติดขัดอะไรมั้ย):</div><div>Supervisor contact (เบอร์ติดต่อหัวหน้างาน):</div></section>
    <footer>Generated by S.C.D.TRANSPORT · Cargo Transfer reference: ${rows.map(row => row.houseNumber).filter(Boolean).join(", ")}</footer>
  </article>`;
}

function renderTransferPreview() {
  const preview = $("#cargoTransferPreview");
  if (preview) preview.innerHTML = transferSheetHtml();
}

function printTransferOnly() {
  renderTransferPreview();
  const content = $("#cargoTransferPreview")?.innerHTML;
  if (!content) return;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Cargo Transfer Form</title><link rel="stylesheet" href="${location.origin}/styles.css"><style>@page{size:A4 portrait;margin:7mm}html,body{margin:0;background:#fff}.transfer-sheet{width:100%;min-height:277mm;box-shadow:none;margin:0;padding:7mm}.transfer-table th,.transfer-table td{height:9mm}</style></head><body>${content}</body></html>`);
  doc.close();
  window.setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); window.setTimeout(() => frame.remove(), 1000); }, 350);
}

function pickupItemsToText(job) {
  const rows = Array.isArray(job.pickupItems) && job.pickupItems.length
    ? job.pickupItems
    : [{ houseNumber: job.houseNumber, destination: job.destination || job.routeType || job.destAirport || "WH3", carton: job.pieceCount || "" }];
  return rows
    .map(row => `${row.houseNumber || row.house || job.houseNumber},${row.destination || job.destination || "WH3"},${row.carton || job.pieceCount || ""},${row.pickupDate || job.pickupDate || ""}`)
    .join("\n");
}

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
}

function toDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fillAdminFormFromJob(job) {
  if (!job) return;
  if (state.customers?.length) renderAdminCustomerOptions();
  $("#adminHouse").value = job.houseNumber || "";
  $("#adminCustomer").value = job.customerId || "";
  $("#adminPickupCase").value = job.pickupCase || "SpecialMD";
  $("#adminPickupDate").value = job.pickupDate || toDateInput(job.flightTime) || new Date().toISOString().slice(0, 10);
  $("#adminPickupLocation").value = job.pickupLocation || "";
  $("#adminDriverName").value = job.driverName || "";
  $("#adminVehiclePlate").value = job.vehiclePlate || "";
  if (job.driverId && $("#adminDriverSelect")) $("#adminDriverSelect").value = job.driverId;
  $("#adminPieceCount").value = job.pieceCount || "";
  $("#adminPickupItems").value = pickupItemsToText(job);
  setAdminPickupRows(parsePickupLines($("#adminPickupItems").value));
  $("#adminPackageType").value = job.packageType || "Carton";
  $("#adminDestination").value = job.destination || job.routeType || "WH3";
  $("#adminStickerColor").value = job.stickerColor || "";
  $("#adminFlightNo").value = job.flightNo || "";
  $("#adminFlightTime").value = toDateTimeInput(job.flightTime);
  $("#adminProductType").value = job.productType || "General";
  $("#adminRouteType").value = job.routeType || "WH3";
  $("#adminAmount").value = job.amount || 0;
  renderCargoPreview();
}

function fillAdminFormFromJobs(jobs = []) {
  if (!jobs.length) return;
  const first = jobs[0];
  fillAdminFormFromJob(first);
  setAdminPickupRows(jobs.map(job => ({
    houseNumber: job.houseNumber,
    destination: job.destination || job.routeType || job.destAirport || "WH3",
    carton: job.pieceCount || "",
    pickupDate: job.pickupDate || toDateInput(job.flightTime) || ""
  })));
  $("#adminPieceCount").value = jobs.reduce((sum, job) => sum + Number(job.pieceCount || 0), 0) || "";
  updateAdminBatchSummary();
  renderCargoPreview();
}

// ── Status System กลาง: 5 สี ใช้เหมือนกันทุกหน้า ──
// st-gray=รอเริ่ม · st-blue=กำลังทำ · st-amber=รอ/ต้องจัดการ · st-red=เสี่ยง/ติดปัญหา · st-green=เสร็จ/ผ่าน
const STATUS_META = {
  Pending:                { cls: "st-gray",  th: "รอดำเนินการ" },
  Assigned:               { cls: "st-blue",  th: "จ่ายงานแล้ว" },
  Pickup:                 { cls: "st-blue",  th: "กำลังรับสินค้า" },
  PickupStarted:          { cls: "st-blue",  th: "กำลังรับสินค้า" },
  CargoLoaded:            { cls: "st-blue",  th: "ขึ้นสินค้าแล้ว" },
  Delivered:              { cls: "st-blue",  th: "ส่งถึงคลัง" },
  DocumentChecked:        { cls: "st-green", th: "เอกสารผ่าน" },
  PendingEI:              { cls: "st-amber", th: "รอ EI อนุมัติ" },
  InboundOpened:          { cls: "st-blue",  th: "เปิดรับเข้า" },
  HouseIdentified:        { cls: "st-blue",  th: "สแกน House แล้ว" },
  Inbound:                { cls: "st-blue",  th: "รับเข้าคลัง" },
  Stored:                 { cls: "st-blue",  th: "เก็บเข้าคลังแล้ว" },
  ReadyForTerminal:       { cls: "st-amber", th: "พร้อมส่ง Terminal" },
  OutboundLocated:        { cls: "st-blue",  th: "กำลังจัดออก" },
  OutboundPicking:        { cls: "st-blue",  th: "กำลังหยิบสินค้า" },
  EIApproved:             { cls: "st-green", th: "EI อนุมัติแล้ว" },
  AOTQueueBooked:         { cls: "st-amber", th: "รอคิว AOT" },
  AOTQueueApproved:       { cls: "st-green", th: "AOT อนุมัติแล้ว" },
  GoodsLoaded:            { cls: "st-blue",  th: "โหลดสินค้าแล้ว" },
  TerminalArrived:        { cls: "st-blue",  th: "ถึง Terminal" },
  WeightDimensionRecorded:{ cls: "st-blue",  th: "ชั่ง/วัดแล้ว" },
  XRayPassed:             { cls: "st-green", th: "ผ่าน X-Ray" },
  XRayHold:               { cls: "st-red",   th: "X-Ray กักตรวจ" },
  ReXRayRequired:         { cls: "st-red",   th: "ต้อง X-Ray ซ้ำ" },
  PackingConsolidation:   { cls: "st-blue",  th: "รวมสินค้า" },
  LoadingReady:           { cls: "st-green", th: "พร้อมโหลดขึ้นเครื่อง" },
  Completed:              { cls: "st-green", th: "เสร็จสิ้น" },
  PendingBillingReview:   { cls: "st-amber", th: "รอตรวจเอกสารบิล" },
  BillingReviewed:        { cls: "st-green", th: "ตรวจบิลแล้ว" },
  ReadyForBilling:        { cls: "st-amber", th: "พร้อมวางบิล" },
  InvoiceDrafted:         { cls: "st-amber", th: "ร่าง Invoice" },
  InvoiceSent:            { cls: "st-green", th: "ส่ง Invoice แล้ว" },
  Billed:                 { cls: "st-green", th: "วางบิลแล้ว" }
};

function statusClass(status) {
  return (STATUS_META[status] || { cls: "st-gray" }).cls;
}

function statusLabelTh(status) {
  return (STATUS_META[status] || {}).th || status || "-";
}

const PICKUP_DONE_STATUSES = [
  "PickupStarted", "CargoLoaded", "Delivered", "DocumentChecked", "PendingEI",
  "InboundOpened", "HouseIdentified", "Stored", "ReadyForTerminal", "Inbound",
  "OutboundLocated", "OutboundPicking", "EIApproved", "AOTQueueBooked", "AOTQueueApproved",
  "GoodsLoaded", "TerminalArrived", "WeightDimensionRecorded", "XRayPassed",
  "PackingConsolidation", "ReadyForBilling", "Billed"
];

const LOAD_DONE_STATUSES = [
  "CargoLoaded", "Delivered", "DocumentChecked", "PendingEI", "InboundOpened",
  "HouseIdentified", "Stored", "ReadyForTerminal", "Inbound", "OutboundLocated", "OutboundPicking",
  "EIApproved", "AOTQueueBooked", "AOTQueueApproved", "GoodsLoaded",
  "TerminalArrived", "WeightDimensionRecorded", "XRayPassed",
  "PackingConsolidation", "ReadyForBilling", "Billed"
];

const INBOUND_DONE_STATUSES = [
  "DocumentChecked", "PendingEI", "InboundOpened", "HouseIdentified", "Stored",
  "ReadyForTerminal", "Inbound", "OutboundLocated", "OutboundPicking", "EIApproved",
  "AOTQueueBooked", "AOTQueueApproved", "GoodsLoaded", "TerminalArrived",
  "WeightDimensionRecorded", "XRayPassed", "PackingConsolidation",
  "ReadyForBilling", "Billed"
];

const ROLE_LABEL_TH = {
  Admin: "แอดมิน", Executive: "ผู้บริหาร", Billing: "ฝ่ายบัญชี", CS: "ลูกค้าสัมพันธ์",
  Terminal: "Terminal", WH3_TeamLeader: "หัวหน้าคลัง WH3", Team_Transport: "ทีม Transport",
  Driver: "คนขับ", WH_Staff: "พนักงานคลัง", EI_Customer: "EI / Customer", Check_House: "Check House"
};

function renderCtKpis() {
  const box = document.getElementById("ctKpiRow");
  if (!box) return;
  const jobs = dashboardFilteredJobs();
  const doneStatuses = ["Completed", "Billed", "LoadingReady", "InvoiceSent"];
  const total = jobs.length;
  const done = jobs.filter(j => doneStatuses.includes(j.status)).length;
  const risk = jobs.filter(j => j.redFlag || ["XRayHold", "ReXRayRequired"].includes(j.status)).length;
  const awaitBill = jobs.filter(j => ["ReadyForBilling", "PendingBillingReview"].includes(j.status) || j.readyForBilling).length;
  const noDriver = jobs.filter(j => !j.driverId && !doneStatuses.includes(j.status)).length;
  const inProgress = Math.max(0, total - done - jobs.filter(j => j.status === "Pending").length);
  const kpis = [
    { n: total, t: "งานทั้งหมด", c: "st-blue", icon: "📦", v: "orders" },
    { n: inProgress, t: "กำลังดำเนินการ", c: "st-blue", icon: "🚚", v: "orders" },
    { n: done, t: "เสร็จแล้ว", c: "st-green", icon: "✅", v: "orders" },
    { n: risk, t: "งานเสี่ยง", c: "st-red", icon: "🚩", v: "alerts" },
    { n: awaitBill, t: "รอวางบิล", c: "st-amber", icon: "🧾", v: "cargo-history" },
    { n: noDriver, t: "ยังไม่มีคนขับ", c: "st-gray", icon: "🪪", v: "grouping" }
  ];
  box.innerHTML = kpis.map(k => `
    <button type="button" class="ct-kpi ${k.c}" onclick="setView('${k.v}')">
      <span class="ct-kpi-ic">${k.icon}</span>
      <strong>${k.n}</strong>
      <span class="ct-kpi-t">${k.t}</span>
    </button>`).join("");
}

function renderCtDonut() {
  const svg = document.getElementById("ctDonut");
  const legend = document.getElementById("ctDonutLegend");
  if (!svg || !legend) return;
  const jobs = dashboardFilteredJobs();
  const tiers = [
    { key: "st-gray", label: "รอเริ่ม", color: "#94a3b8" },
    { key: "st-blue", label: "กำลังทำ", color: "#2563eb" },
    { key: "st-amber", label: "รอจัดการ", color: "#f59e0b" },
    { key: "st-red", label: "เสี่ยง/ติดปัญหา", color: "#ef4444" },
    { key: "st-green", label: "เสร็จ/ผ่าน", color: "#10b981" }
  ].map(t => ({ ...t, count: jobs.filter(j => statusClass(j.status) === t.key).length }));
  const total = Math.max(1, tiers.reduce((s, t) => s + t.count, 0));
  const R = 74, CX = 100, CY = 100, SW = 30;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const segs = tiers.filter(t => t.count > 0).map(t => {
    const frac = t.count / total;
    const seg = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${t.color}" stroke-width="${SW}"
      stroke-dasharray="${(frac * circ).toFixed(2)} ${circ.toFixed(2)}"
      stroke-dashoffset="${(-offset * circ).toFixed(2)}" transform="rotate(-90 ${CX} ${CY})"></circle>`;
    offset += frac;
    return seg;
  }).join("");
  svg.innerHTML = segs + `
    <text x="${CX}" y="${CY - 4}" text-anchor="middle" style="font-size:30px;font-weight:800;fill:#0f172a">${jobs.length}</text>
    <text x="${CX}" y="${CY + 18}" text-anchor="middle" style="font-size:12px;fill:#64748b">งานทั้งหมด</text>`;
  legend.innerHTML = tiers.map(t => `
    <div class="ct-dl-row">
      <span class="ct-dl-dot" style="background:${t.color}"></span>
      <span class="ct-dl-name">${t.label}</span>
      <b>${t.count}</b>
      <em>${((t.count / total) * 100).toFixed(0)}%</em>
    </div>`).join("");
  const sub = document.getElementById("ctDonutSub");
  if (sub) sub.textContent = `${state.filters.dateFrom || ""} ถึง ${state.filters.dateTo || ""}`;
}

function renderCtRisk() {
  const box = document.getElementById("ctRiskList");
  if (!box) return;
  const jobs = dashboardFilteredJobs();
  const risks = jobs
    .filter(j => j.redFlag || ["XRayHold", "ReXRayRequired"].includes(j.status))
    .sort((a, b) => (a.hoursToFlight ?? 999) - (b.hoursToFlight ?? 999))
    .slice(0, 8);
  const sub = document.getElementById("ctRiskSub");
  if (sub) sub.textContent = risks.length ? `${risks.length} งานเรียงตามความเร่งด่วน` : "ไม่มีงานเสี่ยงในช่วงที่เลือก";
  box.innerHTML = risks.length ? risks.map(j => `
    <button type="button" class="ct-risk-item" onclick="openJobQuickView('${safeHtml(j.houseNumber)}')">
      <b>${safeHtml(j.houseNumber)}</b>
      <span>${safeHtml(j.customerName || "-")}</span>
      <em>${j.redFlag ? (typeof j.hoursToFlight === "number" ? `เหลือ ${j.hoursToFlight.toFixed(1)} ชม.` : "เสี่ยงตกไฟลท์") : statusLabelTh(j.status)}</em>
    </button>`).join("") : `<div class="empty-state compact">✅ ไม่มีงานเสี่ยง</div>`;
}

async function renderDashAttendance() {
  const map = document.getElementById("dashAttMap");
  const list = document.getElementById("dashAttList");
  if (!map || !list) return;
  try {
    if (!_rhAttCache.data || Date.now() - _rhAttCache.at > 60000) {
      const res = await fetch(apiUrl("/api/attendance/today")).then(r => r.json());
      _rhAttCache = { at: Date.now(), data: res.records || [] };
    }
  } catch (e) { map.innerHTML = `<div class="att-map-empty">โหลดข้อมูลไม่สำเร็จ</div>`; return; }
  const records = (_rhAttCache.data || []).slice().sort((a, b) => String(a.checkInTime || "").localeCompare(String(b.checkInTime || "")));
  const points = records.flatMap(r => {
    const arr = [];
    if (hasAttPoint(r, "in")) arr.push(attPoint(r, "in"));
    if (hasAttPoint(r, "out")) arr.push(attPoint(r, "out"));
    return arr;
  });
  const mapSub = document.getElementById("dashAttMapSub");
  if (mapSub) mapSub.textContent = `${points.length} จุด · ${records.length} คนวันนี้`;
  const listSub = document.getElementById("dashAttListSub");
  const workingCount = records.filter(r => !r.checkOutTime).length;
  if (listSub) listSub.textContent = `${workingCount} คนกำลังทำงาน · ${records.length - workingCount} ออกแล้ว`;
  if (!points.length) {
    map.innerHTML = `<div class="att-map-empty"><strong>ยังไม่มีพิกัดวันนี้</strong><span>จุดเช็คอิน/เอาต์จะแสดงที่นี่ทันที</span></div>`;
  } else {
    const minLat = Math.min(...points.map(p => p.lat)), maxLat = Math.max(...points.map(p => p.lat));
    const minLon = Math.min(...points.map(p => p.lon)), maxLon = Math.max(...points.map(p => p.lon));
    const latSpan = Math.max(0.0005, maxLat - minLat), lonSpan = Math.max(0.0005, maxLon - minLon);
    const project = p => ({ x: 10 + ((p.lon - minLon) / lonSpan) * 80, y: 86 - ((p.lat - minLat) / latSpan) * 72 });
    map.innerHTML = `<div class="att-map-grid-bg"></div>` + points.map(p => {
      const pos = project(p);
      const initials = (p.record.userName || "?").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
      return `<button class="att-map-marker ${p.type === "out" ? "end" : "start"}" style="left:${pos.x.toFixed(1)}%;top:${pos.y.toFixed(1)}%"
        title="${escHtml(p.record.userName || "")} · ${p.label} ${attTimeShort(p.time)}"
        onclick="window.open('https://maps.google.com/?q=${p.lat},${p.lon}','_blank')">
        <span>${p.type === "out" ? "OUT" : initials}</span></button>`;
    }).join("");
  }
  list.innerHTML = records.length ? records.slice(0, 8).map(r => `
    <div class="ct-att-row">
      <span class="ct-att-dot ${r.checkOutTime ? "out" : "on"}"></span>
      <b>${escHtml(r.userName || "-")}</b>
      <span>${attTimeShort(r.checkInTime)} → ${r.checkOutTime ? attTimeShort(r.checkOutTime) : "ทำงานอยู่"}</span>
      <em>${attDurationLabel(r)}</em>
    </div>`).join("") : `<div class="empty-state compact">ยังไม่มีการเช็คอินวันนี้</div>`;
}

function renderCtBilling() {
  const chips = document.getElementById("ctBillChips");
  const list = document.getElementById("ctBillList");
  if (!chips || !list) return;
  const jobs = dashboardFilteredJobs();
  const seg = [
    { t: "รอ CS ยืนยัน", c: "st-amber", n: jobs.filter(j => !j.csConfirmed && j.status !== "Billed").length, v: "cs-queue" },
    { t: "รอตรวจเอกสารบิล", c: "st-blue", n: jobs.filter(j => j.status === "PendingBillingReview").length, v: "orders" },
    { t: "พร้อมวางบิล", c: "st-amber", n: jobs.filter(j => j.status === "ReadyForBilling" || j.readyForBilling).length, v: "orders" },
    { t: "ส่ง Invoice แล้ว", c: "st-green", n: jobs.filter(j => j.status === "InvoiceSent").length, v: "cargo-history" },
    { t: "วางบิลแล้ว", c: "st-green", n: jobs.filter(j => j.status === "Billed").length, v: "cargo-history" }
  ];
  chips.innerHTML = seg.map(s => `
    <button type="button" class="ct-bill-chip ${s.c}" onclick="setView('${s.v}')"><b>${s.n}</b><span>${s.t}</span></button>`).join("");
  const billable = jobs
    .filter(j => ["ReadyForBilling", "PendingBillingReview"].includes(j.status) || j.readyForBilling)
    .slice(0, 8);
  list.innerHTML = billable.length ? `
    <table class="ct-mini-table">
      <thead><tr><th>House</th><th>ลูกค้า</th><th>Flight</th><th>สถานะ</th></tr></thead>
      <tbody>${billable.map(j => `
        <tr class="clickable-row" onclick="openJobQuickView('${safeHtml(j.houseNumber)}')">
          <td><strong>${safeHtml(j.houseNumber)}</strong></td>
          <td>${safeHtml(j.customerName || "-")}</td>
          <td>${safeHtml(j.flightNo || "-")}</td>
          <td><span class="pill ${statusClass(j.status)}">${statusLabelTh(j.status)}</span></td>
        </tr>`).join("")}</tbody>
    </table>` : `<div class="empty-state compact">ยังไม่มีงานเข้าคิววางบิลในช่วงที่เลือก</div>`;
}

var _rhAttCache = { at: 0, data: null };

async function loadRoleHomeAttendance() {
  const el = document.getElementById("rhStaffStrip");
  if (!el) return;
  try {
    if (!_rhAttCache.data || Date.now() - _rhAttCache.at > 60000) {
      const [todayRes, usersLen] = [await fetch(apiUrl("/api/attendance/today")).then(r => r.json()), (state.users || []).length];
      _rhAttCache = { at: Date.now(), data: todayRes.records || [] };
    }
    const records = _rhAttCache.data;
    const fieldRoles = ["Driver", "WH_Staff", "WH3_TeamLeader", "Team_Transport"];
    const fieldUsers = (state.users || []).filter(u => fieldRoles.includes(u.role) && u.status !== "Inactive");
    const onDuty = records.filter(r => !r.checkOutTime).length;
    const out = records.filter(r => r.checkOutTime).length;
    const absent = Math.max(0, fieldUsers.length - records.length);
    el.innerHTML = `
      <span class="rh-staff-label">👥 พนักงานภาคสนามวันนี้</span>
      <button type="button" class="rh-staff-chip st-green" onclick="setView('attendance')"><b>${onDuty}</b> เข้างานอยู่</button>
      <button type="button" class="rh-staff-chip st-gray" onclick="setView('attendance')"><b>${out}</b> ออกแล้ว</button>
      <button type="button" class="rh-staff-chip st-red" onclick="setView('attendance')"><b>${absent}</b> ยังไม่มา</button>
      <button type="button" class="rh-staff-chip st-blue" onclick="setView('attendance')">ดู Operations Map →</button>`;
  } catch (e) { el.innerHTML = ""; }
}

function renderRoleHome() {
  const box = document.getElementById("roleHomeStrip");
  if (!box) return;
  const user = currentWebUser();
  if (!user) { box.innerHTML = ""; return; }
  const jobs = state.dashboard?.jobs || [];
  const today = dateInputValue();
  const isToday = j => j.pickupDate === today || String(j.flightTime || "").slice(0, 10) === today;
  const C = fn => jobs.filter(fn).length;

  const waitCs = C(j => !j.csConfirmed && j.status !== "Billed");
  const risk = C(j => j.redFlag || ["XRayHold", "ReXRayRequired"].includes(j.status));
  const todayJobs = C(isToday);

  let cards = [], actions = [];
  const role = user.role;
  if (role === "Admin") {
    cards = [
      { n: waitCs, t: "รอ CS ยืนยัน", c: "st-amber", v: "cs-queue" },
      { n: C(j => j.csConfirmed && !j.cargoIssuedAt), t: "พร้อมเปิดใบ Cargo", c: "st-blue", v: "grouping" },
      { n: risk, t: "งานเสี่ยง / ติดปัญหา", c: "st-red", v: "orders" },
      { n: todayJobs, t: "งานวันนี้", c: "st-gray", v: "orders" }
    ];
    actions = [["เปิดใบงาน · Import", "admin"], ["จัดกลุ่มงาน", "grouping"], ["เปิดใบขาออก", "outbound-open"]];
  } else if (role === "Executive") {
    const backlog = C(j => !["XRayPassed", "LoadingReady", "Completed", "PendingBillingReview", "BillingReviewed", "ReadyForBilling", "InvoiceDrafted", "InvoiceSent", "Billed"].includes(j.status));
    cards = [
      { n: todayJobs, t: "งานวันนี้ (Throughput)", c: "st-blue", v: "orders" },
      { n: risk, t: "งานเสี่ยง / ตกไฟลท์", c: "st-red", v: "alerts" },
      { n: backlog, t: "Backlog ในกระบวนการ", c: "st-gray", v: "orders" },
      { n: C(j => ["ReadyForBilling", "PendingBillingReview"].includes(j.status) || j.readyForBilling), t: "ค้างวางบิล", c: "st-amber", v: "cargo-history" },
      { n: C(j => ["Completed", "Billed"].includes(j.status)), t: "เสร็จ / วางบิลแล้ว", c: "st-green", v: "orders" }
    ];
  } else if (role === "Billing") {
    cards = [
      { n: C(j => j.status === "ReadyForBilling" || j.readyForBilling), t: "พร้อมวางบิล", c: "st-amber", v: "orders" },
      { n: C(j => j.status === "PendingBillingReview"), t: "เอกสารรอตรวจ", c: "st-blue", v: "orders" },
      { n: waitCs, t: "ยังไม่ผ่าน CS", c: "st-gray", v: "cs-queue" },
      { n: C(j => ["InvoiceSent", "Billed"].includes(j.status)), t: "Invoice ส่งแล้ว", c: "st-green", v: "cargo-history" }
    ];
  } else if (role === "Terminal") {
    cards = [
      { n: C(j => ["ReadyForTerminal", "TerminalArrived"].includes(j.status)), t: "รอตรวจเอกสาร", c: "st-amber", v: "orders" },
      { n: C(j => ["WeightDimensionRecorded", "GoodsLoaded"].includes(j.status)), t: "รอ X-Ray", c: "st-blue", v: "orders" },
      { n: C(j => j.status === "XRayPassed" && !j.loadingDetailUploaded), t: "รอ Loading Detail", c: "st-amber", v: "orders" },
      { n: C(j => j.redFlag), t: "เสี่ยงตกไฟลท์ <4 ชม.", c: "st-red", v: "alerts" },
      { n: C(j => ["XRayHold", "ReXRayRequired"].includes(j.status)), t: "X-Ray ติดปัญหา", c: "st-red", v: "alerts" }
    ];
  } else if (role === "CS") {
    cards = [
      { n: waitCs, t: "งานรอยืนยันกับลูกค้า", c: "st-amber", v: "cs-queue" },
      { n: C(j => j.csConfirmed && isToday(j)), t: "ยืนยันแล้ววันนี้", c: "st-green", v: "orders" }
    ];
    actions = [["ไปหน้ารออนุมัติ", "cs-queue"]];
  } else if (role === "WH3_TeamLeader" || role === "Team_Transport") {
    cards = [
      { n: C(j => ["Assigned", "CargoLoaded", "Delivered"].includes(j.status)), t: "รอสแกนเข้าคลัง", c: "st-amber", v: "wh-status" },
      { n: C(j => j.status === "Stored"), t: "อยู่ในคลัง", c: "st-blue", v: "wh-status" },
      { n: C(j => j.status === "ReadyForTerminal"), t: "พร้อมส่งออก", c: "st-green", v: "load-plan" }
    ];
  } else {
    box.innerHTML = "";
    return;
  }

  const riskJobs = jobs.filter(j => j.redFlag || ["XRayHold", "ReXRayRequired"].includes(j.status)).slice(0, 5);
  box.innerHTML = `
    <section class="role-home card">
      <div class="rh-head">
        <div>
          <strong>สวัสดี ${safeHtml(user.name || "")}</strong>
          <span>${safeHtml(ROLE_LABEL_TH[role] || role)} · สิ่งที่ต้องโฟกัสตอนนี้</span>
        </div>
        ${actions.length ? `<div class="rh-actions">${actions.map(([t, v]) => `<button type="button" onclick="setView('${v}')">${t}</button>`).join("")}</div>` : ""}
      </div>
      <div class="rh-cards">
        ${cards.map(c => `
          <button type="button" class="rh-card ${c.c}" onclick="setView('${c.v}')">
            <strong>${c.n}</strong><span>${c.t}</span>
          </button>`).join("")}
      </div>
      ${(role === "Admin" || role === "Executive" || role === "WH3_TeamLeader" || role === "Team_Transport") ? `<div class="rh-staff-strip" id="rhStaffStrip"></div>` : ""}
      ${riskJobs.length && (role === "Admin" || role === "Executive" || role === "Terminal") ? `
        <div class="rh-risk">
          <span class="rh-risk-title">🚨 ต้องจัดการด่วน</span>
          ${riskJobs.map(j => `
            <button type="button" class="rh-risk-item" onclick="setView('orders')">
              <b>${safeHtml(j.houseNumber)}</b>
              <span>${safeHtml(j.customerName || "-")}</span>
              <em>${j.redFlag ? "เสี่ยงตกไฟลท์ &lt;4 ชม." : statusLabelTh(j.status)}</em>
            </button>`).join("")}
        </div>` : ""}
    </section>`;
  loadRoleHomeAttendance();
}

function renderAll() {
  if (!state.dashboard) return;
  applyWebRoleVisibility();
  renderLpWidget();
  syncDashboardFilters();
  renderAdminCustomerOptions();
  renderAdminDriverOptions();
  if (!$("#adminPickupItemRows")?.children.length) setAdminPickupRows(parsePickupLines($("#adminPickupItems")?.value || ""));
  renderDriverJobSelect();
  renderRoleHome();
  renderExecutiveSummary();
  renderMetrics();
  renderProcessControlStrip();
  renderCtKpis();
  renderCtDonut();
  renderCtRisk();
  renderDashAttendance();
  renderCtBilling();
  renderRecentOrders();
  renderOrderCards();
  renderTimeline();
  renderStaff();
  renderLocations();
  renderInvoices();
  renderBillingReadyList();
  renderBillingBatchBuilder();
  renderAlerts();
  renderImportChanges();
  renderImportHistory();
  renderCalendar();
  renderAdminWorkQueue();
  renderManualGroupList();
  renderCargoHistory();
  renderGroupPreview();
  renderOutboundPreparationQueue();
  updateInboundInfo();
  updateTerminalRequirements();
  renderTransferPreview();
  updateAdminBatchSummary();
  renderDailyChart();
  renderStatusDistribution();
  initializeIcons();
  applyLanguage();
  if (state.currentView === "load-plan") renderLoadPlan();
}

function renderAdminCustomerOptions() {
  const select = $("#adminCustomer");
  if (!select || !state.customers?.length) return;
  const current = select.value;
  select.innerHTML = state.customers
    .map(customer => `<option value="${customer.id}">${customer.name}</option>`)
    .join("");
  if (state.customers.some(customer => customer.id === current)) {
    select.value = current;
  }
}

function countBy(items, keyFn) {
  const map = {};
  items.forEach(item => {
    const key = keyFn(item) || "-";
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function renderExecutiveSummary() {
  const box = $("#executiveSummary");
  if (!box) return;
  const jobs = dashboardFilteredJobs();
  const total = jobs.length;
  const riskJobs = jobs.filter(j => j.redFlag || ["XRayHold", "ReXRayRequired"].includes(j.status));
  const flightCount = new Set(jobs.map(j => j.flightNo).filter(Boolean)).size;
  const topCustomer = countBy(jobs, j => j.customerName)[0];
  const topFlight = countBy(jobs, j => j.flightNo)[0];
  const noDriver = jobs.filter(j => !j.driverId).length;
  const billingReady = jobs.filter(j => j.readyForBilling || ["ReadyForBilling", "PendingBillingReview", "InvoiceDrafted", "InvoiceSent"].includes(j.status)).length;
  const completed = jobs.filter(j => ["Completed", "Billed"].includes(j.status)).length;
  const inMotion = jobs.filter(j => !["Pending", "Completed", "Billed"].includes(j.status)).length;
  const agingRisk = jobs.filter(j => {
    const d = jobAgeDays(j);
    return d !== null && d >= 4 && !["Completed", "Billed"].includes(j.status);
  }).length;
  const readiness = total
    ? Math.max(0, Math.min(100, Math.round(((completed * 1.2 + billingReady * .85 + inMotion * .55 + (total - riskJobs.length - noDriver) * .18) / total) * 100)))
    : 0;

  $("#execTotalJobs").textContent = total;
  $("#execRiskJobs").textContent = riskJobs.length;
  $("#execFlightCount").textContent = flightCount;
  $("#execTopCustomer").textContent = topCustomer ? topCustomer[0] : "-";
  $("#execSummarySubtitle").textContent = `${state.filters.dateFrom} ถึง ${state.filters.dateTo} · ${total} งาน · อัปเดต ${new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
  const ring = $("#execHealthRing");
  if (ring) ring.style.setProperty("--score", readiness);
  $("#execHealthScore").textContent = `${readiness}%`;
  $("#execHealthText").textContent = readiness >= 75
    ? "ภาพรวมอยู่ในเกณฑ์ดี ติดตามงานเสี่ยงและงานรอวางบิลเป็นหลัก"
    : readiness >= 45
      ? "มีงานที่ต้องเร่งจัดการ ตรวจสอบงานค้างและการมอบหมายคน"
      : "งานส่วนใหญ่ยังอยู่ต้นกระบวนการ ควรเร่งจัดกลุ่มและติดตามความพร้อม";

  const insights = [
    { icon: "alert-triangle", cls: riskJobs.length ? "risk" : "ok", label: "งานเสี่ยง", value: `${riskJobs.length} งาน`, hint: riskJobs[0]?.houseNumber || "ไม่มีงานเสี่ยงเด่น" },
    { icon: "plane-takeoff", cls: "info", label: "Flight หลัก", value: topFlight ? topFlight[0] : "-", hint: topFlight ? `${topFlight[1]} งาน` : "ยังไม่มี Flight" },
    { icon: "users", cls: noDriver ? "warn" : "ok", label: "ยังไม่จ่ายงาน", value: `${noDriver} งาน`, hint: "ตรวจในหน้าจัดกลุ่ม/เปิดใบงาน" },
    { icon: "clock-4", cls: agingRisk ? "warn" : "ok", label: "อายุงาน 4+ วัน", value: `${agingRisk} งาน`, hint: "ควรตรวจ backlog" }
  ];
  $("#execInsightList").innerHTML = insights.map(item => `
    <button type="button" class="exec-insight ${item.cls}" onclick="setView('${item.cls === "risk" ? "alerts" : "orders"}')">
      <i data-lucide="${item.icon}" aria-hidden="true"></i>
      <span><b>${item.label}</b><em>${safeHtml(item.hint)}</em></span>
      <strong>${safeHtml(item.value)}</strong>
    </button>
  `).join("");
}

function renderMetrics() {
  const jobs = dashboardFilteredJobs();
  const allJobs = state.dashboard?.jobs || [];

  // Current counts
  const inboundStatuses = ["Inbound","Delivered","PickupStarted","DocumentChecked","PendingEI","InboundOpened","HouseIdentified","Stored"];
  const outboundStatuses = ["ReadyForTerminal","OutboundLocated","OutboundPicking","EIApproved","AOTQueueBooked","AOTQueueApproved","GoodsLoaded","TerminalArrived","WeightDimensionRecorded","XRayPassed","PackingConsolidation","ReadyForBilling","Billed"];
  const inboundCount  = jobs.filter(j => inboundStatuses.includes(j.status)).length;
  const outboundCount = jobs.filter(j => outboundStatuses.includes(j.status)).length;
  const pendingCount  = jobs.filter(j => ["Pending","PickupStarted"].includes(j.status)).length;
  const overdueCount  = jobs.filter(j => j.redFlag).length;

  // Previous period: same window length ending at start of current window
  const fromEl = $("#dashboardDateFrom");
  const toEl   = $("#dashboardDateTo");
  function calcTrend(cur, prev) {
    // prev=0 and cur>0 → treat as +100% (new activity)
    if (prev === 0 && cur === 0) return null;   // both zero — no info
    if (prev === 0) return 100;                  // went from nothing to something
    const pct = Math.round(((cur - prev) / prev) * 100);
    return pct;
  }
  function trendHtml(pct, invertBad) {
    if (pct === null) return "";
    const up = pct >= 0;
    const bad = invertBad ? up : !up;
    const arrow = up ? "↑" : "↓";
    const cls = bad ? "warn" : "good";
    return `<em class="${cls}">${arrow} ${Math.abs(pct)}%</em>`;
  }

  let prevInbound = null, prevOutbound = null, prevPending = null, prevOverdue = null;
  if (fromEl?.value && toEl?.value) {
    const from = new Date(fromEl.value);
    const to   = new Date(toEl.value);
    const span = to - from;
    const prevFrom = new Date(from.getTime() - span - 86400000);
    const prevTo   = new Date(from.getTime() - 86400000);
    const prev = allJobs.filter(j => {
      const d = new Date(j.createdAt || j.pickupDate || "");
      return d >= prevFrom && d <= prevTo;
    });
    prevInbound  = prev.filter(j => inboundStatuses.includes(j.status)).length;
    prevOutbound = prev.filter(j => outboundStatuses.includes(j.status)).length;
    prevPending  = prev.filter(j => ["Pending","PickupStarted"].includes(j.status)).length;
    prevOverdue  = prev.filter(j => j.redFlag).length;
  }

  $("#metricInbound").textContent    = inboundCount;
  $("#metricOutbound").textContent   = outboundCount;
  $("#metricPendingJobs").textContent = pendingCount;
  $("#metricOverdue").textContent    = overdueCount;
  $("#dashboardFilterCount").textContent = `${jobs.length} ${localizeText("งาน / jobs")}`;

  // Update trend ems by ID — safe, never removes element
  function setTrend(id, cur, prev, invertBad) {
    const el = document.getElementById(id);
    if (!el) return;
    const pct = calcTrend(cur, prev);
    if (pct === null) { el.textContent = ""; el.className = ""; return; }
    const up = pct >= 0;
    const bad = invertBad ? up : !up;
    el.textContent = `${up ? "↑" : "↓"} ${Math.abs(pct)}%`;
    el.className = bad ? "warn" : "good";
  }
  setTrend("trendInbound",  inboundCount,  prevInbound,  false);
  setTrend("trendOutbound", outboundCount, prevOutbound, false);
  setTrend("trendPending",  pendingCount,  prevPending,  true);
  setTrend("trendOverdue",  overdueCount,  prevOverdue,  true);
}

function renderProcessControlStrip() {
  const box = $("#processControlStrip");
  if (!box) return;
  const s = state.dashboard?.metrics?.approvalSummary || {};
  const terminals = state.dashboard?.metrics?.terminalSummary || [];
  const cards = [
    { label: "Plan confirmed", value: s.inPlan || 0, icon: "clipboard-check", tone: "ok", view: "load-plan", hint: `${s.latestPlanRound || "-"} / ${s.latestPlanRows || 0} rows` },
    { label: "Manual extra", value: s.manualExtra || 0, icon: "message-square-plus", tone: "warn", view: "cs-queue", hint: "Line / Email source" },
    { label: "Pending CS", value: s.pendingCs || 0, icon: "user-check", tone: "risk", view: "cs-queue", hint: "Need approval" },
    { label: "Need evidence", value: s.evidenceRequired || 0, icon: "paperclip", tone: "warn", view: "cs-queue", hint: "Attach Line/Email" },
    { label: "After 16:00", value: s.afterFinalRound || 0, icon: "clock-4", tone: "info", view: "cs-queue", hint: "No next plan" },
    { label: "Door photo missing", value: s.missingDoorPhoto || 0, icon: "camera", tone: "risk", view: "orders", hint: "Audit required" },
    { label: "KPI paused", value: s.paused || 0, icon: "pause-circle", tone: "info", view: "orders", hint: "Warehouse delay" },
    ...terminals.map(item => ({
      label: item.label,
      value: item.total || 0,
      icon: item.key === "BFS" ? "route" : "truck",
      tone: item.risks ? "risk" : "ok",
      view: "orders",
      hint: `${item.completed || 0} closed / ${item.risks || 0} risk / SLA ${item.slaMinutes}m`
    }))
  ];
  box.innerHTML = cards.map(card => `
    <button type="button" class="process-control-card ${card.tone}" onclick="setView('${card.view}')">
      <i data-lucide="${card.icon}" aria-hidden="true"></i>
      <span><b>${safeHtml(card.label)}</b><em>${safeHtml(card.hint)}</em></span>
      <strong>${card.value}</strong>
    </button>
  `).join("");
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function renderDailyChart() {
  const labels = $("#dailyChartLabels");
  const path = $("#dailyChartPath");
  const pointsLayer = $("#dailyChartPoints");
  const valuesLayer = $("#dailyChartValues");
  const subtitle = $("#dailyChartSubtitle");
  if (!labels || !path) return;
  const keys = dateRangeKeys(state.filters.dateFrom, state.filters.dateTo).slice(-31);
  const jobs = dashboardFilteredJobs();
  const counts = keys.map(key => jobs.filter(job => jobDateKey(job) === key).length);
  const max = Math.max(1, ...counts);
  const left = 44;
  const width = 632;
  const top = 24;
  const height = 140;
  const step = keys.length > 1 ? width / (keys.length - 1) : 0;
  const points = keys.map((key, index) => {
    const x = left + step * index;
    const y = top + height - (counts[index] / max) * height;
    return [x, y];
  });

  const linePath = points.length
    ? points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" ")
    : "M44 164 L676 164";
  path.setAttribute("d", linePath);
  const areaEl = $("#dailyChartArea");
  if (areaEl) {
    if (points.length > 1) {
      const bottom = top + height;
      areaEl.setAttribute("d", linePath + ` L${points[points.length-1][0].toFixed(1)} ${bottom} L${points[0][0].toFixed(1)} ${bottom} Z`);
    } else {
      areaEl.setAttribute("d", "");
    }
  }
  labels.innerHTML = keys.map((key, index) => {
    const x = left + step * index;
    const labelDate = new Date(`${key}T00:00:00`);
    const text = labelDate.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" });
    const visible = keys.length <= 14 || index % Math.ceil(keys.length / 10) === 0 || index === keys.length - 1;
    return visible ? `<text x="${x.toFixed(0)}" y="196">${text}</text>` : "";
  }).join("");
  if (pointsLayer) {
    pointsLayer.innerHTML = points.map((point, index) => (
      `<circle cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="5" data-chart-date="${keys[index]}" data-chart-count="${counts[index]}"></circle>`
    )).join("");
    pointsLayer.querySelectorAll("circle").forEach(circle => {
      circle.addEventListener("mousemove", event => showChartTooltip(
        event,
        `${circle.dataset.chartDate}: ${circle.dataset.chartCount} งาน`,
        "Daily order volume"
      ));
      circle.addEventListener("mouseleave", hideChartTooltip);
    });
  }
  if (valuesLayer) {
    const avg = counts.length ? counts.reduce((s, c) => s + c, 0) / counts.length : 0;
    const avgY = top + height - (avg / max) * height;
    const maxIdx = counts.indexOf(Math.max(...counts));
    valuesLayer.innerHTML = `
      <line x1="${left}" x2="${left + width}" y1="${avgY.toFixed(1)}" y2="${avgY.toFixed(1)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="5 4"></line>
      <text x="${(left + width).toFixed(0)}" y="${Math.max(12, avgY - 5).toFixed(1)}" text-anchor="end" fill="#94a3b8">เฉลี่ย ${avg.toFixed(1)}</text>
    ` + points.map((point, index) => {
      const showLabel = index === maxIdx || index === points.length - 1;
      return showLabel ? `<text x="${point[0].toFixed(1)}" y="${Math.max(14, point[1] - 12).toFixed(1)}">${counts[index]}</text>` : "";
    }).join("");
  }
  if (subtitle) subtitle.textContent = `${state.filters.dateFrom} ถึง ${state.filters.dateTo} · ${jobs.length} งาน / ${jobs.length} jobs`;
}

function statusBuckets(jobs = dashboardFilteredJobs()) {
  return [
    { key: "Inbound", label: "Inbound", color: "#2563eb", count: jobs.filter(job => ["Inbound", "PickupStarted", "DocumentChecked", "InboundOpened", "HouseIdentified"].includes(job.status)).length },
    { key: "Storage", label: "Storage", color: "#635bff", count: jobs.filter(job => ["Stored"].includes(job.status)).length },
    { key: "Prep", label: "Prep", color: "#a8b4c6", count: jobs.filter(job => ["Pending", "ReadyForTerminal", "OutboundLocated", "OutboundPicking", "EIApproved", "AOTQueueBooked", "AOTQueueApproved"].includes(job.status)).length },
    { key: "Terminal", label: "Terminal", color: "#f59e0b", count: jobs.filter(job => ["GoodsLoaded", "TerminalArrived", "WeightDimensionRecorded", "XRayPassed", "PackingConsolidation", "ReadyForBilling", "InvoiceDrafted", "InvoiceSent"].includes(job.status)).length },
    { key: "Final", label: "Final", color: "#10b981", count: jobs.filter(job => ["Billed", "Completed"].includes(job.status)).length }
  ];
}

function jobAgeDays(job) {
  const base = job.pickupDate ? new Date(job.pickupDate + "T00:00:00+07:00") : (job.createdAt ? new Date(job.createdAt) : null);
  if (!base || isNaN(base.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - base.getTime()) / 86400000));
}

function dimensionBuckets(dim) {
  const jobs = dashboardFilteredJobs();
  const palette = ["#2563eb", "#635bff", "#10b981", "#f59e0b", "#ef4444", "#14b8a6", "#ec4899", "#8b5cf6", "#f97316", "#64748b"];
  const topN = (keyFn, labelFn) => {
    const map = {};
    jobs.forEach(j => {
      const k = keyFn(j) || "ไม่ระบุ";
      (map[k] ||= { count: 0, risk: 0 });
      map[k].count += 1;
      if (j.redFlag || ["XRayHold", "ReXRayRequired"].includes(j.status)) map[k].risk += 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([k, v], i) => ({ label: (labelFn ? labelFn(k) : k), count: v.count, risk: v.risk, color: palette[i % palette.length] }));
  };
  if (dim === "customer") return topN(j => j.customerName);
  if (dim === "flight") return topN(j => j.flightNo);
  if (dim === "aging") {
    const buckets = [
      { label: "0-1 วัน", min: 0, max: 1, color: "#10b981" },
      { label: "2-3 วัน", min: 2, max: 3, color: "#2563eb" },
      { label: "4-7 วัน", min: 4, max: 7, color: "#f59e0b" },
      { label: "8+ วัน", min: 8, max: 9e9, color: "#ef4444" }
    ];
    return buckets.map(b => ({
      label: b.label, color: b.color, risk: 0,
      count: jobs.filter(j => {
        const d = jobAgeDays(j);
        return d !== null && d >= b.min && d <= b.max && !["Billed", "Completed"].includes(j.status);
      }).length
    }));
  }
  if (dim === "billing") {
    return [
      { label: "รอ CS ยืนยัน", color: "#f59e0b", risk: 0, count: jobs.filter(j => !j.csConfirmed).length },
      { label: "ระหว่างปฏิบัติการ", color: "#2563eb", risk: 0, count: jobs.filter(j => j.csConfirmed && !["Completed", "PendingBillingReview", "ReadyForBilling", "InvoiceDrafted", "InvoiceSent", "Billed"].includes(j.status)).length },
      { label: "รอตรวจเอกสารบิล", color: "#8b5cf6", risk: 0, count: jobs.filter(j => j.status === "PendingBillingReview").length },
      { label: "พร้อมวางบิล", color: "#f97316", risk: 0, count: jobs.filter(j => j.status === "ReadyForBilling" || j.readyForBilling).length },
      { label: "ส่ง Invoice แล้ว", color: "#14b8a6", risk: 0, count: jobs.filter(j => j.status === "InvoiceSent").length },
      { label: "วางบิลแล้ว", color: "#10b981", risk: 0, count: jobs.filter(j => j.status === "Billed").length }
    ];
  }
  if (dim === "staff") {
    const users = state.dashboard?.staffStats || [];
    const byDriver = topN(j => {
      if (!j.driverId) return "⚪ ยังไม่จ่ายงาน";
      const u = (state.users || []).find(x => x.id === j.driverId);
      return u?.name || j.driverId;
    });
    return byDriver;
  }
  return statusBuckets(jobs);
}

const DIM_TITLES = {
  status: "สัดส่วนสถานะ", customer: "งานตามลูกค้า (Top 10)", flight: "งานตาม Flight (Top 10)",
  aging: "อายุงานค้าง (ยังไม่จบ)", billing: "Billing Readiness", staff: "งานตามคนขับ"
};

function renderStatusDistribution() {
  const container = $("#statusBarsContainer");
  const totalLabel = $("#statusTotalLabel");
  if (!container) return;
  const dim = state.dashDim || "status";
  document.querySelectorAll("#dimTabs button").forEach(b => b.classList.toggle("active", b.dataset.dim === dim));
  const buckets = dimensionBuckets(dim);
  const total = Math.max(1, buckets.reduce((sum, b) => sum + b.count, 0));
  if (totalLabel) totalLabel.textContent = `${DIM_TITLES[dim] || ""} · รวม ${total} งาน`;
  const maxCount = Math.max(1, ...buckets.map(b => b.count));
  container.innerHTML = buckets.map(b => {
    const pct = ((b.count / total) * 100).toFixed(1);
    const w = ((b.count / maxCount) * 100).toFixed(1);
    return `<div class="shbar-row" data-status-tooltip="${safeHtml(b.label)}" data-status-count="${b.count}">
      <div class="shbar-label"><span class="shbar-dot" style="background:${b.color}"></span><span title="${safeHtml(b.label)}">${safeHtml(b.label)}</span></div>
      <div class="shbar-track"><div class="shbar-fill" style="width:${w}%;background:${b.color}"></div></div>
      <div class="shbar-meta"><span class="shbar-count">${b.count}</span><span class="shbar-pct">${pct}%</span>${b.risk ? `<span class="shbar-risk">🚩${b.risk}</span>` : ""}</div>
    </div>`;
  }).join("") || `<div class="empty-state compact">ไม่มีข้อมูลในมุมมองนี้</div>`;
  container.querySelectorAll(".shbar-row").forEach(row => {
    row.addEventListener("mousemove", e => showChartTooltip(e, `${row.dataset.statusTooltip}: ${row.dataset.statusCount} งาน`, DIM_TITLES[dim] || ""));
    row.addEventListener("mouseleave", hideChartTooltip);
  });
}

function showChartTooltip(event, title, detail = "") {
  const tooltip = $("#chartTooltip");
  if (!tooltip) return;
  tooltip.innerHTML = `${escapeCell(title)}${detail ? `<span>${escapeCell(detail)}</span>` : ""}`;
  tooltip.style.left = `${Math.min(window.innerWidth - 260, event.clientX + 14)}px`;
  tooltip.style.top = `${Math.max(12, event.clientY + 14)}px`;
  tooltip.classList.add("show");
}

function hideChartTooltip() {
  $("#chartTooltip")?.classList.remove("show");
}

function openExportConfirm(type) {
  state.filters.dateFrom = $("#dashboardDateFrom")?.value || dateOffsetValue(-29);
  state.filters.dateTo = $("#dashboardDateTo")?.value || dateOffsetValue(0);
  state.filters.status = $("#dashboardStatusFilter")?.value || "All";
  if (state.filters.dateFrom > state.filters.dateTo) {
    [state.filters.dateFrom, state.filters.dateTo] = [state.filters.dateTo, state.filters.dateFrom];
  }
  persistDashboardFilters();
  renderMetrics();
  renderDailyChart();
  renderStatusDistribution();
  renderRecentOrders();
  state.pendingExportType = type;
  const rows = exportRows();
  $("#exportConfirmType").textContent = type.toUpperCase();
  $("#exportConfirmFrom").textContent = state.filters.dateFrom;
  $("#exportConfirmTo").textContent = state.filters.dateTo;
  $("#exportConfirmStatus").textContent = state.filters.status === "All" ? "ทั้งหมด / All" : state.filters.status;
  $("#exportConfirmCount").textContent = rows.length;
  const modal = $("#exportConfirmModal");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  applyLanguage(modal);
}

function closeExportConfirm() {
  state.pendingExportType = null;
  const modal = $("#exportConfirmModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function confirmPendingExport() {
  const type = state.pendingExportType;
  closeExportConfirm();
  if (type === "pdf") exportDashboardPdf();
  if (type === "excel") exportDashboardExcel();
  if (type === "image") exportDashboardImage();
}

function loadSettingsForm() {
  if (!$("#settingSystemName")) return;
  $("#settingSystemName").value = localStorage.getItem("smartLogisticsSystemName") || "S.C.D.TRANSPORT";
  $("#settingDefaultLanguage").value = localStorage.getItem("smartLogisticsLang") || state.lang || "th";
  $("#settingDefaultRange").value = localStorage.getItem("smartLogisticsDefaultRange") || "10";
}

function escapeCell(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function exportRows() {
  return dashboardFilteredJobs().map(job => ({
    house: job.houseNumber,
    status: job.status,
    customer: job.customerName,
    flight: job.flightNo,
    route: job.destination || job.routeType || "WH3",
    date: jobDateKey(job),
    flightTime: job.flightTimeLabel,
    amount: job.amount || 0,
    driver: job.driverName || "",
    plate: job.vehiclePlate || ""
  }));
}

function exportHtmlTable(rows) {
  return `
    <table>
      <thead>
        <tr>
          <th>House</th><th>Status</th><th>Customer</th><th>Flight</th><th>Route</th>
          <th>Date</th><th>Flight Time</th><th>Amount</th><th>Driver</th><th>Vehicle</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${escapeCell(row.house)}</td>
            <td>${escapeCell(row.status)}</td>
            <td>${escapeCell(row.customer)}</td>
            <td>${escapeCell(row.flight)}</td>
            <td>${escapeCell(row.route)}</td>
            <td>${escapeCell(row.date)}</td>
            <td>${escapeCell(row.flightTime)}</td>
            <td>${escapeCell(row.amount)}</td>
            <td>${escapeCell(row.driver)}</td>
            <td>${escapeCell(row.plate)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function exportDashboardPdf() {
  const rows = exportRows();
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>S.C.D.TRANSPORT Report</title>
<style>
  body{font-family:"TH Sarabun New","Sarabun","Leelawadee UI",Tahoma,sans-serif;margin:24px;color:#111827;font-size:18px}
  h1{margin:0 0 8px;font-size:24px}
  p{margin:0 0 18px;color:#475569}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}
  th{background:#eef4ff}
  @media print{@page{size:A4 landscape;margin:12mm}}
</style></head><body>
  <h1>S.C.D.TRANSPORT Dashboard Report</h1>
  <p>${escapeCell(state.filters.dateFrom)} - ${escapeCell(state.filters.dateTo)} · Status: ${escapeCell(state.filters.status)} · ${rows.length} jobs</p>
  ${exportHtmlTable(rows)}
  <script>window.onload=function(){window.print();};<\/script>
</body></html>`;
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    toast("Browser บล็อกหน้าปริ้น กรุณาอนุญาต popup / Popup blocked");
    return;
  }
  reportWindow.document.write(html);
  reportWindow.document.close();
}

function exportDashboardExcel() {
  const rows = exportRows();
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <h1>S.C.D.TRANSPORT Dashboard Report</h1>
    <p>${escapeCell(state.filters.dateFrom)} - ${escapeCell(state.filters.dateTo)} · Status: ${escapeCell(state.filters.status)} · ${rows.length} jobs</p>
    ${exportHtmlTable(rows)}
  </body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SCD-Transport-${state.filters.dateFrom}-to-${state.filters.dateTo}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Export Excel แล้ว / Excel exported");
}

function exportDashboardImage() {
  const rows = exportRows();
  const jobs = dashboardFilteredJobs();
  const keys = dateRangeKeys(state.filters.dateFrom, state.filters.dateTo).slice(-10);
  const counts = keys.map(key => jobs.filter(job => jobDateKey(job) === key).length);
  const buckets = statusBuckets(jobs);
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 980;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f3f7fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 40, 34, 1320, 900, 24, true);
  ctx.fillStyle = "#111827";
  ctx.font = "700 38px 'TH Sarabun New', Sarabun, Arial";
  ctx.fillText("S.C.D.TRANSPORT Dashboard Report", 80, 92);
  ctx.font = "500 24px 'TH Sarabun New', Sarabun, Arial";
  ctx.fillStyle = "#64748b";
  ctx.fillText(`${state.filters.dateFrom} - ${state.filters.dateTo} · Status: ${state.filters.status} · ${rows.length} jobs`, 80, 126);

  const metricData = [
    ["Inbound", $("#metricInbound")?.textContent || "0", "#2563eb"],
    ["Outbound", $("#metricOutbound")?.textContent || "0", "#10b981"],
    ["Pending", $("#metricPendingJobs")?.textContent || "0", "#f59e0b"],
    ["Overdue", $("#metricOverdue")?.textContent || "0", "#ef4444"]
  ];
  metricData.forEach((metric, index) => {
    const x = 80 + index * 310;
    ctx.fillStyle = "#f8fbff";
    roundRect(ctx, x, 160, 280, 110, 18, true);
    ctx.fillStyle = metric[2];
    roundRect(ctx, x + 22, 182, 46, 46, 14, true);
    ctx.fillStyle = "#111827";
    ctx.font = "700 42px 'TH Sarabun New', Sarabun, Arial";
    ctx.fillText(metric[1], x + 90, 216);
    ctx.font = "600 22px 'TH Sarabun New', Sarabun, Arial";
    ctx.fillStyle = "#64748b";
    ctx.fillText(metric[0], x + 90, 244);
  });

  drawReportLineChart(ctx, keys, counts, 80, 330, 760, 260);
  drawReportStatusBars(ctx, buckets, 910, 330, 370, 260);
  drawReportTable(ctx, rows.slice(0, 9), 80, 650, 1200);

  const link = document.createElement("a");
  link.download = `SCD-Transport-report-${state.filters.dateFrom}-to-${state.filters.dateTo}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  toast("ส่งออกภาพรายงานแล้ว / Image exported");
}

function roundRect(ctx, x, y, width, height, radius, fill) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  if (fill) ctx.fill();
}

function drawReportLineChart(ctx, keys, counts, x, y, width, height) {
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, width, height, 18, true);
  ctx.fillStyle = "#111827";
  ctx.font = "700 28px 'TH Sarabun New', Sarabun, Arial";
  ctx.fillText("Daily Order Volume", x + 24, y + 42);
  const chartX = x + 48;
  const chartY = y + 74;
  const chartW = width - 92;
  const chartH = height - 118;
  ctx.strokeStyle = "#dbe5f1";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const gy = chartY + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();
  }
  const max = Math.max(1, ...counts);
  const step = keys.length > 1 ? chartW / (keys.length - 1) : 0;
  const points = keys.map((key, index) => [
    chartX + step * index,
    chartY + chartH - (counts[index] / max) * chartH
  ]);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 5;
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
  ctx.stroke();
  points.forEach((point, index) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(point[0], point[1], 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.font = "700 20px 'TH Sarabun New', Sarabun, Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(counts[index]), point[0], point[1] - 14);
    const label = new Date(`${keys[index]}T00:00:00`).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" });
    ctx.fillStyle = "#64748b";
    ctx.font = "600 18px 'TH Sarabun New', Sarabun, Arial";
    ctx.fillText(label, point[0], y + height - 24);
  });
  ctx.textAlign = "left";
}

function drawReportStatusBars(ctx, buckets, x, y, width, height) {
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, width, height, 18, true);
  ctx.fillStyle = "#111827";
  ctx.font = "700 28px 'TH Sarabun New', Sarabun, Arial";
  ctx.fillText("Status Distribution", x + 24, y + 42);
  const total = Math.max(1, buckets.reduce((sum, bucket) => sum + bucket.count, 0));
  buckets.forEach((bucket, index) => {
    const rowY = y + 78 + index * 34;
    ctx.fillStyle = bucket.color;
    roundRect(ctx, x + 24, rowY, 16, 16, 5, true);
    ctx.fillStyle = "#111827";
    ctx.font = "700 20px 'TH Sarabun New', Sarabun, Arial";
    ctx.fillText(bucket.label, x + 50, rowY + 14);
    ctx.fillStyle = "#e5edf7";
    roundRect(ctx, x + 160, rowY, 130, 16, 8, true);
    ctx.fillStyle = bucket.color;
    roundRect(ctx, x + 160, rowY, Math.max(6, 130 * bucket.count / total), 16, 8, true);
    ctx.fillStyle = "#111827";
    ctx.font = "700 20px 'TH Sarabun New', Sarabun, Arial";
    ctx.fillText(String(bucket.count), x + 306, rowY + 14);
  });
}

function drawReportTable(ctx, rows, x, y, width) {
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, width, 230, 18, true);
  ctx.fillStyle = "#111827";
  ctx.font = "700 28px 'TH Sarabun New', Sarabun, Arial";
  ctx.fillText("Filtered Jobs", x + 24, y + 40);
  const headers = ["House", "Status", "Customer", "Flight", "Date", "Amount"];
  const col = [0, 160, 330, 650, 790, 940];
  ctx.font = "700 18px 'TH Sarabun New', Sarabun, Arial";
  ctx.fillStyle = "#64748b";
  headers.forEach((header, index) => ctx.fillText(header, x + 24 + col[index], y + 76));
  rows.forEach((row, index) => {
    const rowY = y + 108 + index * 24;
    ctx.fillStyle = index % 2 ? "#ffffff" : "#f8fbff";
    ctx.fillRect(x + 16, rowY - 18, width - 32, 24);
    ctx.fillStyle = "#111827";
    ctx.font = "600 17px 'TH Sarabun New', Sarabun, Arial";
    [row.house, row.status, row.customer, row.flight, row.date, money(row.amount)].forEach((value, colIndex) => {
      ctx.fillText(String(value || "-").slice(0, colIndex === 2 ? 30 : 16), x + 24 + col[colIndex], rowY);
    });
  });
}

function adminUnopenedJobs() {
  return (state.dashboard?.jobs || []).filter(job => !job.cargoIssuedAt);
}

function adminIssuedCargoJobs() {
  return (state.dashboard?.jobs || [])
    .filter(job => job.cargoIssuedAt)
    .sort((a, b) => new Date(b.cargoIssuedAt) - new Date(a.cargoIssuedAt));
}

function adminQueueKey(job) {
  return [
    job.pickupDate || toDateInput(job.flightTime) || "",
    job.customerName || "",
    job.pickupLocation || job.startPlace || "",
    job.flightNo || ""
  ].join("|");
}

function adminUnopenedGroups() {
  const map = new Map();
  for (const job of adminUnopenedJobs()) {
    const key = adminQueueKey(job);
    if (!map.has(key)) {
      map.set(key, {
        key,
        pickupDate: job.pickupDate || toDateInput(job.flightTime) || "-",
        customerName: job.customerName || "-",
        pickupLocation: job.pickupLocation || job.startPlace || "-",
        flightNo: job.flightNo || "-",
        jobs: []
      });
    }
    map.get(key).jobs.push(job);
  }
  return Array.from(map.values()).sort((a, b) => b.jobs.length - a.jobs.length);
}

function groupLabelFromJobs(jobs = []) {
  const first = jobs[0] || {};
  if (!jobs.length) return localizeText("ยังไม่ได้เลือกกลุ่มงาน / No group selected");
  const customer = first.customerName || "-";
  const date = first.pickupDate || toDateInput(first.flightTime) || "-";
  const flight = first.flightNo || "-";
  const place = first.pickupLocation || first.startPlace || "-";
  return `กลุ่มของ: ${customer} / ${date} / ${flight} / ${place}`;
}

function setGroupingContext(jobs = []) {
  state.selectedGroupLabel = groupLabelFromJobs(jobs);
  const label = $("#groupContextLabel");
  if (label) label.textContent = state.selectedGroupLabel;
}

function selectedWizardDriver() {
  const users = assignableUsers();
  const driverId = state.groupWizard.driverId || users[0]?.id || "";
  return users.find(user => user.id === driverId) || users[0] || null;
}

function groupWizardSourceJobs() {
  return state.groupWizard.mode === "manual" ? adminUnopenedJobs() : (state.groupWizard.jobs || []);
}

function groupWizardSelectedJobs() {
  const selected = new Set(state.groupWizard.selectedHouses || []);
  return groupWizardSourceJobs().filter(job => selected.has(job.houseNumber));
}

function wizardDragStart(event, houseNumber) {
  event.dataTransfer.setData("text/plain", houseNumber);
  event.dataTransfer.effectAllowed = "move";
}

function wizardDropJob(event, laneIndex) {
  event.preventDefault();
  const container = event.currentTarget;
  container.classList.remove("drag-over");
  const houseNumber = event.dataTransfer.getData("text/plain");
  if (!houseNumber) return;
  if (!state.groupWizard.jobLaneMap) state.groupWizard.jobLaneMap = {};
  state.groupWizard.jobLaneMap[houseNumber] = laneIndex;
  renderGroupWizard();
}

function wizardSetDriverCount(count) {
  count = Math.max(1, Math.min(30, Number(count) || 1));
  const users = driverUsers();
  const current = state.groupWizard.laneDrivers || [state.groupWizard.driverId];
  const newLanes = [];
  for (let i = 0; i < count; i++) {
    newLanes.push(current[i] || users[i]?.id || users[0]?.id || "");
  }
  state.groupWizard.laneDrivers = newLanes;
  state.groupWizard.driverCount = count;
  // Reset jobLaneMap entries that exceed new count to lane 0
  const jlm = state.groupWizard.jobLaneMap || {};
  Object.keys(jlm).forEach(house => { if (jlm[house] >= count) jlm[house] = 0; });
  renderGroupWizard();
}

function computeWizardPagesAndDrivers(selectedJobs) {
  const laneDrivers = state.groupWizard.laneDrivers || [state.groupWizard.driverId];
  const jobLaneMap = state.groupWizard.jobLaneMap || {};
  const _hpp = state.groupWizard?.mode === "outbound" ? 15 : HOUSES_PER_PAGE;
  if (laneDrivers.length <= 1) {
    // Single driver - just paginate
    return chunkArray(selectedJobs, _hpp).map(jobs => ({
      jobs,
      driverId: laneDrivers[0] || state.groupWizard.driverId
    }));
  }
  // Multi-driver: group by lane, paginate each lane
  const byLane = laneDrivers.map(() => []);
  selectedJobs.forEach(job => {
    const li = jobLaneMap[job.houseNumber] ?? 0;
    const idx = Math.min(li, laneDrivers.length - 1);
    byLane[idx].push(job);
  });
  const pages = [];
  byLane.forEach((laneJobs, i) => {
    if (!laneJobs.length) return;
    chunkArray(laneJobs, _hpp).forEach(chunk => {
      pages.push({ jobs: chunk, driverId: laneDrivers[i] });
    });
  });
  return pages.length ? pages : [{ jobs: selectedJobs, driverId: laneDrivers[0] }];
}



function updateGroupWizardPreview() {
  const jobs = groupWizardSelectedJobs();
  setGroupingContext(jobs);
  setGroupPreview(jobs, selectedWizardDriver());
}

function openGroupWizard({ mode = "auto", groupIndex = null, jobs = [], flightKey = null, flight = null } = {}) {
  const users = driverUsers();
  const firstDriver = users[0]?.id || "";
  // For outbound: pre-fill from panel driver/crew selects
  let initDriverId = firstDriver;
  let initCrewCount = 1;
  let initLaneDrivers = [firstDriver];
  if (mode === "outbound") {
    const obSel = document.getElementById("obDriver");
    const obCrew = document.getElementById("obCrewCount");
    if (obSel?.value) initDriverId = obSel.value;
    initCrewCount = Math.max(1, Math.min(4, Number(obCrew?.value || 1)));
    initLaneDrivers = Array.from({length: initCrewCount}, (_, i) => users[i]?.id || initDriverId);
  }
  state.groupWizard = {
    open: true,
    mode,
    step: 1,
    groupIndex,
    jobs,
    selectedHouses: (mode === "auto" || mode === "outbound") ? jobs.map(job => job.houseNumber) : [],
    driverId: initDriverId,
    laneDrivers: initLaneDrivers,
    driverCount: initCrewCount,
    jobLaneMap: {},
    pageDrivers: {},
    currentPage: 0,
    search: "",
    previewZoom: 0.82,
    ctfMeta: {},
    flightKey,
    flight
  };
  state.activeAutoGroupIndex = groupIndex;
  updateGroupWizardPreview();
  renderGroupWizard();
  $("#autoGroupModal")?.classList.add("show");
  $("#autoGroupModal")?.setAttribute("aria-hidden", "false");
}

function closeGroupWizard() {
  state.groupWizard.open = false;
  $("#autoGroupModal")?.classList.remove("show");
  $("#autoGroupModal")?.setAttribute("aria-hidden", "true");
}

function renderGroupWizard() {
  const modal = $("#autoGroupModal");
  if (!modal || !state.groupWizard.open) return;
  const mode = state.groupWizard.mode;
  const step = state.groupWizard.step;
  const selectedJobs = groupWizardSelectedJobs();
  const driver = selectedWizardDriver();
  const title = mode === "manual" ? "จัดกลุ่มเอง" : "จัดกลุ่มงานอัตโนมัติ";
  $("#autoGroupTitle").textContent = title;
  $("#autoGroupSummary").textContent = groupLabelFromJobs(selectedJobs.length ? selectedJobs : state.groupWizard.jobs);
  const _stepLabels = mode === "outbound"
    ? [["สรุปกลุ่ม", "เลือกงาน"], ["แบ่งคนขับ", "Lane"], ["Preview CTF", "Preview"]]
    : [["สรุปกลุ่ม", "เลือกงาน"], ["แบ่งคนขับ", "Lane"], ["Preview ใบ Cargo", "Preview"]];
  $("#autoGroupSteps").innerHTML = _stepLabels.map(([label, sub], index) => {
    const number = index + 1;
    return `<article class="wizard-step ${number === step ? "active" : ""} ${number < step ? "done" : ""}">
      <strong>${number}</strong><span>${label}</span><small>${sub}</small>
    </article>`;
  }).join("");

  if (step === 1) {
    const allGroupJobs = state.groupWizard.jobs || [];
    const selected = state.groupWizard.selectedHouses || [];
    const totalPcs = allGroupJobs.reduce((s, j) => s + Number(j.pieceCount || 0), 0);
    const selPcs = allGroupJobs.filter(j => selected.includes(j.houseNumber)).reduce((s, j) => s + Number(j.pieceCount || 0), 0);
    const group = state.groupWizard;
    $("#autoGroupDetails").innerHTML = `
      <section class="wizard-panel wizard-overview-panel">
        <h3>1. สรุปกลุ่มงาน — เลือกงานที่จะออกใบรอบนี้</h3>
        <div class="wizard-group-summary">
          <article><span>บริษัท</span><strong>${safeHtml(allGroupJobs[0]?.customerName || "-")}</strong></article>
          <article><span>วันที่รับ</span><strong>${safeHtml(group.jobs?.[0]?.pickupDate || "-")}</strong></article>
          <article><span>Flight</span><strong>${safeHtml(group.jobs?.[0]?.flightNo || "-")}</strong></article>
          <article class="wos-sel"><span>เลือกแล้ว</span><strong>${selected.length} / ${allGroupJobs.length} งาน · ${selPcs} ชิ้น</strong></article>
        </div>
        <div class="wizard-overview-actions">
          <button class="woa-btn" type="button" data-woa-select="all">เลือกทั้งหมด</button>
          <button class="woa-btn secondary" type="button" data-woa-select="none">ยกเลิกทั้งหมด</button>
          <small class="woa-hint">งานที่ไม่เลือกจะยังอยู่ใน queue รอรอบถัดไป</small>
        </div>
        ${(() => {
          const waitCs = allGroupJobs.filter(j => !j.csConfirmed && selected.includes(j.houseNumber));
          return waitCs.length ? `<div class="wizard-cs-warn">🔒 ${waitCs.length} งานที่เลือกยังไม่ผ่าน CS ยืนยัน — ต้องให้ CS Confirm ใน "รออนุมัติ" ก่อนจึงออกใบได้</div>` : "";
        })()}
        <div class="wizard-overview-list">
          <div class="wizard-overview-head">
            <span></span><span>House</span><span>ลูกค้า / Flight</span><span>ปลายทาง</span><span>ชิ้น</span>
          </div>
          ${allGroupJobs.map(job => {
            const isSelected = selected.includes(job.houseNumber);
            return `<label class="wizard-overview-row ${isSelected ? "selected" : ""}">
              <input type="checkbox" class="wizard-overview-check" value="${safeHtml(job.houseNumber)}" ${isSelected ? "checked" : ""}>
              <span><strong>${safeHtml(job.houseNumber)}</strong>${job.csConfirmed ? "" : '<em class="cs-wait-badge">รอ CS</em>'}</span>
              <span>${safeHtml(job.customerName || "-")}<small>${safeHtml(job.pickupDate || "-")} · ${safeHtml(job.flightNo || "-")}</small></span>
              <span>${safeHtml(job.destination || job.routeType || "WH3")}</span>
              <span>${safeHtml(job.pieceCount || "-")}</span>
            </label>`;
          }).join("")}
        </div>
      </section>`;
  } else if (step === 2) {
    const sourceJobs = groupWizardSourceJobs();
    const users = driverUsers();
    const laneDrivers = state.groupWizard.laneDrivers || [state.groupWizard.driverId];
    const driverCount = laneDrivers.length;
    const jobLaneMap = state.groupWizard.jobLaneMap || {};
    const lanePalette = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16"];
    const laneColors = { at: i => lanePalette[i % lanePalette.length] };
    const laneNames = { at: i => (i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(39 + i)) };
    const MAX_LANES = 30;

    // Build lanes: assign unassigned jobs to lane 0
    const lanes = laneDrivers.map((did, i) => ({
      driverId: did,
      driver: users.find(u => u.id === did),
      index: i,
      color: laneColors.at(i),
      letter: laneNames.at(i),
      jobs: sourceJobs.filter(job => (jobLaneMap[job.houseNumber] ?? 0) === i)
    }));
    const unassigned = sourceJobs.filter(job => {
      const li = jobLaneMap[job.houseNumber] ?? 0;
      return li < 0 || li >= driverCount;
    });

    $("#autoGroupDetails").innerHTML = `
      <section class="wizard-panel wizard-assign-panel">
        <h3>2. แบ่งงานให้คนขับ</h3>
        <div class="wizard-driver-count-bar">
          <span class="wdc-label">เลือกจำนวนคนขับ</span>
          <div class="wdc-segmented">
            ${[1,2,3,4].map(n => `
              <button class="wdc-seg ${driverCount === n ? "active" : ""}" type="button" data-driver-count="${n}">
                <strong>${n}</strong><small>คนขับ</small>
              </button>`).join("")}
            <div class="wdc-custom ${driverCount > 4 ? "active" : ""}" title="ระบุจำนวนเอง (สูงสุด 30)">
              <button type="button" class="wdc-stepbtn" data-wdc-step="-1" aria-label="ลดจำนวนคนขับ">−</button>
              <input id="wdcCustomCount" type="number" min="1" max="30" value="${driverCount}" aria-label="จำนวนคนขับ">
              <button type="button" class="wdc-stepbtn" data-wdc-step="1" aria-label="เพิ่มจำนวนคนขับ">+</button>
              <small>คนขับ</small>
            </div>
          </div>
          <div class="wdc-info">
            <span>${sourceJobs.length} งาน</span>
            <span>·</span>
            <span>ออก Cargo ประมาณ ${Math.ceil(sourceJobs.length / 5) + (driverCount > 1 ? " +" : "")} ใบ</span>
          </div>
        </div>
        <div class="wizard-lane-container" id="wizardLaneContainer">
          ${lanes.map((lane, i) => `
            <div class="wizard-driver-lane" data-lane-index="${i}"
                 ondragover="event.preventDefault();event.currentTarget.classList.add('drag-over')"
                 ondragleave="event.currentTarget.classList.remove('drag-over')"
                 ondrop="wizardDropJob(event,${i})">
              <div class="wizard-lane-header" style="border-left:3px solid ${lane.color}">
                <span class="wizard-lane-badge" style="background:${lane.color}">${lane.letter}</span>
                <select class="wizard-lane-driver-select" data-lane-index="${i}">
                  ${users.map(u => `<option value="${safeHtml(u.id)}" ${u.id === lane.driverId ? "selected" : ""}>${safeHtml(u.name)}${u.vehiclePlate ? " · " + u.vehiclePlate : ""}</option>`).join("")}
                </select>
                <span class="wizard-lane-count">${lane.jobs.length} งาน</span>
              </div>
              <div class="wizard-lane-jobs">
                ${lane.jobs.map(job => `
                  <div class="wizard-job-card" draggable="true" data-house="${safeHtml(job.houseNumber)}"
                       ondragstart="wizardDragStart(event,'${safeHtml(job.houseNumber)}')"
                       style="border-left:3px solid ${lane.color}">
                    <strong>${safeHtml(job.houseNumber)}</strong>
                    <small>${safeHtml(job.pickupDate || "-")} · ${job.pieceCount || 0} ชิ้น</small>
                  </div>`).join("")}
                ${lane.jobs.length === 0 ? `<div class="wizard-lane-empty">ลากงานมาวางที่นี่</div>` : ""}
              </div>
            </div>`).join("")}
        </div>
      </section>`;
  } else if (mode === "outbound") {
    // ══ OUTBOUND STEP 3: Cargo Transfer Form ══
    const ctfMeta = state.groupWizard.ctfMeta || {};
    const totalPieces = selectedJobs.reduce((sum, j) => sum + Number(j.pieceCount || j.pieces || 0), 0);
    const previewZoom = Number(state.groupWizard.previewZoom || 0.82);
    const previewPercent = Math.round(previewZoom * 100);
    const _computedPages = computeWizardPagesAndDrivers(selectedJobs);
    state.groupWizard._computedPages = _computedPages;
    const pages = _computedPages.map(p => p.jobs);
    const pageCount = pages.length || 1;
    const currentPage = Math.min(state.groupWizard.currentPage || 0, Math.max(0, pageCount - 1));
    const pageJobs = pages[currentPage] || [];
    const pageDriver = getPageDriver(currentPage);
    const users = driverUsers();
    const pageDriverId = pageDriver?.id ?? state.groupWizard.driverId;
    const ctfDriver = ctfMeta.driver || pageDriver?.name || "";
    const ctfPlate  = ctfMeta.plate  || pageDriver?.vehiclePlate || "";
    const ctfRows = pageJobs.map(j => ({
      houseNumber: j.houseNumber,
      flightNumber: j.flightNo || j.flightNumber || "",
      customerName: j.customerName || "",
      destination: j.destination || j.destAirport || "",
      pieces: j.pieceCount || j.pieces || "",
      awbNumber: j.awbNumber || ""
    }));
    const ctfHtml = pageJobs.length ? buildCtfPreviewHtml({
      driver: ctfDriver, plate: ctfPlate,
      velType: ctfMeta.velType || "6 ล้อ",
      tmo: ctfMeta.tmo || "INTER",
      relBy: ctfMeta.relBy || "",
      unloadBy: ctfMeta.unloadBy || "",
      rows: ctfRows,
      jobs: state.dashboard?.jobs || []
    }) : "";
    const flightSet = [...new Set(selectedJobs.map(j => j.flightNo || j.flightNumber).filter(Boolean))];
    const velTypeOpts = ["6 ล้อ","10 ล้อ","รถตู้","รถเก๋ง","รถมอเตอร์ไซค์"]
      .map(v => `<option value="${v}" ${(ctfMeta.velType||"6 ล้อ")===v?"selected":""}>${v}</option>`).join("");
    const tmoOpts = ["INTER","DOME","OTHER"]
      .map(v => `<option value="${v}" ${(ctfMeta.tmo||"INTER")===v?"selected":""}>${v}</option>`).join("");
    $("#autoGroupDetails").innerHTML = `
      <section class="wizard-preview-layout">
        <div class="wizard-left-panel">
          <h3>3. ข้อมูลใบ Cargo Transfer Form</h3>
          <div class="wizard-summary-grid wizard-summary-grid--3">
            <article><span>จำนวน House</span><strong>${selectedJobs.length}</strong></article>
            <article><span>Flight</span><strong>${flightSet.join(", ") || "-"}</strong></article>
            <article><span>รวมชิ้น</span><strong>${totalPieces || "-"}</strong></article>
          </div>
          <div class="wizard-cargo-meta">
            <h4>ข้อมูลผู้ขนส่ง / Carrier Info</h4>
            <div class="wizard-meta-grid">
              <label>คนขับ<input type="text" value="${safeHtml(ctfDriver)}" placeholder="ชื่อคนขับ" data-ctf-meta="driver" oninput="updateCtfWizardPreview()"></label>
              <label>ทะเบียนรถ<input type="text" value="${safeHtml(ctfPlate)}" placeholder="ทะเบียน" data-ctf-meta="plate" oninput="updateCtfWizardPreview()"></label>
              <label>ประเภทรถ<select data-ctf-meta="velType" onchange="updateCtfWizardPreview()">${velTypeOpts}</select></label>
              <label>TMO<select data-ctf-meta="tmo" onchange="updateCtfWizardPreview()">${tmoOpts}</select></label>
              <label>ผู้ปล่อย (WH)<input type="text" value="${safeHtml(ctfMeta.relBy||"")}" placeholder="ชื่อผู้ปล่อยของ" data-ctf-meta="relBy" oninput="updateCtfWizardPreview()"></label>
              <label>ผู้รับ (Unload)<input type="text" value="${safeHtml(ctfMeta.unloadBy||"")}" placeholder="ชื่อผู้รับ" data-ctf-meta="unloadBy" oninput="updateCtfWizardPreview()"></label>
            </div>
          </div>
          ${pageCount > 1 ? `<div class="wizard-page-nav">
            <button type="button" class="wizard-page-btn" data-wizard-page="prev" ${currentPage===0?"disabled":""}>‹ ก่อนหน้า</button>
            <span class="wizard-page-label">ใบที่ <strong>${currentPage+1}</strong> / ${pageCount}</span>
            <button type="button" class="wizard-page-btn" data-wizard-page="next" ${currentPage>=pageCount-1?"disabled":""}>ถัดไป ›</button>
          </div>` : ""}
          <div class="wizard-page-driver-row">
            <label>คนขับ${pageCount>1?` — ใบที่ ${currentPage+1}`:""}</label>
            <select id="wizardPageDriverSelect">
              ${users.map(u => `<option value="${u.id}" ${u.id===pageDriverId?"selected":""}>${safeHtml(u.name)}${u.vehiclePlate?" / "+safeHtml(u.vehiclePlate):""}</option>`).join("")}
            </select>
          </div>
          <div class="wizard-house-review">
            <div class="wizard-review-head"><span>House</span><span>ลูกค้า / Flight</span><span>ปลายทาง</span><span>ชิ้น</span></div>
            ${pageJobs.length ? pageJobs.map(job => `
              <div class="wizard-review-row">
                <span><strong>${safeHtml(job.houseNumber||"-")}</strong></span>
                <span>${safeHtml(job.customerName||"-")}<small>${safeHtml(job.flightNo||job.flightNumber||"-")}</small></span>
                <span>${safeHtml(job.destination||job.destAirport||"-")}</span>
                <span>${safeHtml(job.pieceCount||job.pieces||"-")}</span>
              </div>`).join("") : `<div class="empty-state compact">ไม่มีงานในหน้านี้</div>`}
          </div>
          ${pageCount > 1 ? `<p class="wizard-page-hint">CTF จะพิมพ์ทั้ง ${pageCount} ใบในคราวเดียว</p>` : ""}
        </div>
        <aside class="wizard-preview-side">
          <div class="wizard-preview-toolbar">
            <strong>Preview ใบ CTF${pageCount>1?` (ใบ ${currentPage+1}/${pageCount})`:""}</strong>
            <div class="wizard-zoom-controls">
              <button type="button" data-wizard-zoom="out">-</button>
              <span>${previewPercent}%</span>
              <button type="button" data-wizard-zoom="in">+</button>
              <button type="button" data-wizard-zoom="reset">พอดี</button>
            </div>
          </div>
          <div class="wizard-paper-preview wizard-paper-preview-side" style="--wizard-preview-zoom:${previewZoom}">
            ${pageJobs.length ? `<div class="wizard-paper-canvas">${ctfHtml}</div>` : `<div class="empty-state">เลือก House ก่อนดู Preview CTF</div>`}
          </div>
        </aside>
      </section>`;
  } else {
    const totalPieces = selectedJobs.reduce((sum, job) => sum + Number(job.pieceCount || 0), 0);
    const previewZoom = Number(state.groupWizard.previewZoom || 0.82);
    const previewPercent = Math.round(previewZoom * 100);
    const _computedPages = computeWizardPagesAndDrivers(selectedJobs);
    state.groupWizard._computedPages = _computedPages;
    const pages = _computedPages.map(p => p.jobs);
    const pageCount = pages.length || 1;
    const currentPage = Math.min(state.groupWizard.currentPage || 0, Math.max(0, pageCount - 1));
    const pageJobs = pages[currentPage] || [];
    const pageDriver = getPageDriver(currentPage);
    const users = driverUsers();
    const pageDriverId = pageDriver?.id ?? state.groupWizard.driverId;
    const meta = state.groupWizard.meta || {};
    const baseData = cargoDataFromJobs(pageJobs.length ? pageJobs : [], pageDriver);
    const mergedContact = meta.contact ?? baseData.contact;
    const mergedTel = meta.tel ?? baseData.tel;
    const mergedPickupDate = meta.pickupDate ?? baseData.pickupDate;
    const mergedPickupTime = meta.pickupTime ?? baseData.pickupTime;
    const previewData = { ...baseData, contact: mergedContact, tel: mergedTel, pickupDate: mergedPickupDate, pickupTime: mergedPickupTime };
    const missingContact = !mergedContact;
    const missingTel = !mergedTel;
    $("#autoGroupDetails").innerHTML = `
      <section class="wizard-preview-layout">
        <div class="wizard-left-panel">
          <h3>3. ยอดรวมและ Preview</h3>
          <div class="wizard-summary-grid wizard-summary-grid--3">
            <article><span>จำนวนใบ Cargo</span><strong>${pageCount} ใบ</strong></article>
            <article><span>รวม House</span><strong>${selectedJobs.length}</strong></article>
            <article><span>รวมชิ้น</span><strong>${totalPieces || "-"}</strong></article>
          </div>
          <div class="wizard-cargo-meta">
            <h4>ข้อมูลในใบ Cargo</h4>
            <div class="wizard-meta-grid">
              <label class="${missingContact ? "meta-missing" : ""}">
                ผู้ติดต่อ${missingContact ? " ⚠" : ""}
                <input id="wizardMetaContact" type="text" value="${safeHtml(mergedContact)}" placeholder="ชื่อผู้ติดต่อ" data-wizard-meta="contact">
              </label>
              <label class="${missingTel ? "meta-missing" : ""}">
                เบอร์โทร${missingTel ? " ⚠" : ""}
                <input id="wizardMetaTel" type="tel" value="${safeHtml(mergedTel)}" placeholder="เบอร์โทรศัพท์" data-wizard-meta="tel">
              </label>
              <label>
                วันที่รับ
                <input id="wizardMetaPickupDate" type="date" value="${safeHtml(mergedPickupDate)}" data-wizard-meta="pickupDate">
              </label>
              <label>
                เวลารับ
                <input id="wizardMetaPickupTime" type="time" value="${safeHtml(mergedPickupTime)}" data-wizard-meta="pickupTime">
              </label>
            </div>
          </div>
          ${pageCount > 1 ? `
          <div class="wizard-page-nav">
            <button type="button" class="wizard-page-btn" data-wizard-page="prev" ${currentPage === 0 ? "disabled" : ""}>‹ ก่อนหน้า</button>
            <span class="wizard-page-label">ใบที่ <strong>${currentPage + 1}</strong> / ${pageCount}</span>
            <button type="button" class="wizard-page-btn" data-wizard-page="next" ${currentPage >= pageCount - 1 ? "disabled" : ""}>ถัดไป ›</button>
          </div>` : ""}
          <div class="wizard-page-driver-row">
            <label>คนขับ${pageCount > 1 ? ` — ใบที่ ${currentPage + 1}` : ""}</label>
            <select id="wizardPageDriverSelect">
              ${users.map(u => `<option value="${u.id}" ${u.id === pageDriverId ? "selected" : ""}>${safeHtml(u.name)}${u.vehiclePlate ? ` / ${safeHtml(u.vehiclePlate)}` : ""} - ${safeHtml(staffRoleLabel(u.role))}</option>`).join("")}
            </select>
          </div>
          <div class="wizard-house-review">
            <div class="wizard-review-head">
              <span>House</span>
              <span>ลูกค้า / Flight</span>
              <span>ปลายทาง</span>
              <span>ชิ้น</span>
            </div>
            ${pageJobs.length ? pageJobs.map(job => `
              <div class="wizard-review-row">
                <span><strong>${safeHtml(job.houseNumber || "-")}</strong></span>
                <span>${safeHtml(job.customerName || "-")}<small>${safeHtml(job.flightNo || "-")} · ${safeHtml(job.pickupDate || toDateInput(job.flightTime) || "-")}</small></span>
                <span>${safeHtml(job.destination || job.routeType || "WH3")}</span>
                <span>${safeHtml(job.pieceCount || "-")}</span>
              </div>`).join("") : `<div class="empty-state compact">เลือก House ก่อนออกใบ Cargo</div>`}
          </div>
          ${pageCount > 1 ? `<p class="wizard-page-hint">ใบ Cargo จะถูกพิมพ์ทั้ง ${pageCount} ใบในคราวเดียว</p>` : ""}
        </div>
        <aside class="wizard-preview-side">
          <div class="wizard-preview-toolbar">
            <strong>Preview ใบ Cargo${pageCount > 1 ? ` (ใบ ${currentPage + 1}/${pageCount})` : ""}</strong>
            <div class="wizard-zoom-controls">
              <button type="button" data-wizard-zoom="out">-</button>
              <span>${previewPercent}%</span>
              <button type="button" data-wizard-zoom="in">+</button>
              <button type="button" data-wizard-zoom="reset">พอดี</button>
            </div>
          </div>
          <div class="wizard-paper-preview wizard-paper-preview-side" style="--wizard-preview-zoom:${previewZoom}">
            ${pageJobs.length ? `<div class="wizard-paper-canvas">${cargoSheetHtml(previewData)}</div>` : `<div class="empty-state">เลือก House ก่อนออกใบ Cargo</div>`}
          </div>
        </aside>
      </section>`;
  }
  $("#editAutoGroupBtn").textContent = step === 1 ? "ยกเลิก" : "ย้อนกลับ";
  const _issueLabel = mode === "outbound" ? "พิมพ์ CTF" : "ออกใบ Cargo";
  $("#printAutoGroupBtn").textContent = step < 3 ? "ถัดไป" : _issueLabel;
  $("#printAutoGroupBtn").disabled = step === 3 && !selectedJobs.length;
  initializeIcons();
}

function groupWizardBackOrEdit() {
  if (!state.groupWizard.open) return;
  if (state.groupWizard.step > 1) {
    state.groupWizard.step -= 1;
    renderGroupWizard();
  } else {
    closeAutoGroupModal();
  }
}

async function groupWizardNextOrIssue() {
  if (!state.groupWizard.open) return;
  if (state.groupWizard.step < 3) {
    if (state.groupWizard.step === 1 && !groupWizardSelectedJobs().length) throw new Error("กรุณาเลือกงานอย่างน้อย 1 รายการ");
    if (state.groupWizard.step === 2 && !groupWizardSelectedJobs().length) throw new Error("กรุณาเลือก House อย่างน้อย 1 งาน");
    state.groupWizard.step += 1;
    renderGroupWizard();
    updateGroupWizardPreview();
    return;
  }
  const jobs = groupWizardSelectedJobs();
  if (!jobs.length) throw new Error("กรุณาเลือก House อย่างน้อย 1 งานก่อนออกใบ Cargo");
    const unconfirmed = jobs.filter(j => !j.csConfirmed);
    if (unconfirmed.length) throw new Error(`งาน ${unconfirmed.map(j=>j.houseNumber).join(", ")} ยังรอ CS ยืนยัน Invoice — ไม่สามารถออกใบได้`);
  // ── OUTBOUND: print CTF without DB record ──
  if (state.groupWizard.mode === "outbound") {
    const _pages = computeWizardPagesAndDrivers(jobs);
    const ctfMeta = state.groupWizard.ctfMeta || {};
    printMultipleCargoForms(_pages.map((p, i) => {
      const pd = getPageDriver(i);
      return buildCtfPreviewHtml({
        driver: ctfMeta.driver || pd?.name || "",
        plate:  ctfMeta.plate  || pd?.vehiclePlate || "",
        velType: ctfMeta.velType || "6 ล้อ",
        tmo:    ctfMeta.tmo    || "INTER",
        relBy:  ctfMeta.relBy  || "",
        unloadBy: ctfMeta.unloadBy || "",
        rows: p.jobs.map(j => ({
          houseNumber: j.houseNumber,
          flightNumber: j.flightNo || j.flightNumber || "",
          customerName: j.customerName || "",
          destination: j.destination || j.destAirport || "",
          pieces: j.pieceCount || j.pieces || "",
          awbNumber: j.awbNumber || ""
        })),
        jobs: state.dashboard?.jobs || []
      });
    }));
    closeGroupWizard();
    toast(`พิมพ์ใบ Cargo Transfer ${_pages.length} ใบ สำเร็จ`);
    return;
  }
  const pages = chunkArray(jobs, HOUSES_PER_PAGE);
  // Issue using page-1 driver as primary
  const primaryDriver = getPageDriver(0);
  prepareAdminFormForJobs(jobs, primaryDriver);
  const createdJobs = await issueAdminCargoFromCurrentForm();
  // Print all pages together
  const meta = state.groupWizard.meta || {};
  printMultipleCargoForms(pages.map((pageJobs, i) => {
    const baseData = cargoDataFromJobs(pageJobs, getPageDriver(i));
    return cargoSheetHtml({ ...baseData,
      contact: meta.contact ?? baseData.contact,
      tel: meta.tel ?? baseData.tel,
      pickupDate: meta.pickupDate ?? baseData.pickupDate,
      pickupTime: meta.pickupTime ?? baseData.pickupTime
    });
  }));
  closeGroupWizard();
  state.selectedHistoryHouse = createdJobs[0]?.houseNumber || jobs[0]?.houseNumber || "";
  setView("cargo-history");
  renderCargoHistory();
  toast(`ออกใบ Cargo แล้ว ${createdJobs.length || jobs.length} งาน (${pages.length} ใบ) และย้ายไปประวัติใบ Cargo`);
}

function outboundPreparationJobs() {
  const closed = new Set(["Billed", "ReadyForBilling"]);
  return (state.dashboard?.jobs || []).filter(job => {
    if (closed.has(job.status)) return false;
    const route = String(job.terminalDestination || job.destination || job.routeType || job.destAirport || "").toUpperCase();
    return ["TG", "TGINT", "BFS", "CROSSDOCK"].some(value => route.includes(value)) || job.trackType === "Pair" || Boolean(job.cargoTransferIssuedAt);
  });
}

function renderOutboundPreparationQueue() {
  const list = $("#outboundPreparationQueue");
  const filter = $("#outboundPrepFlightFilter");
  if (!list || !filter) return;
  const jobs = outboundPreparationJobs();
  const currentFlight = filter.value || "All";
  const flights = [...new Set(jobs.map(job => job.flightNo).filter(Boolean))].sort();
  filter.innerHTML = `<option value="All">ทุกเที่ยวบิน / All flights</option>${flights.map(flight => `<option value="${flight}">${flight}</option>`).join("")}`;
  filter.value = flights.includes(currentFlight) ? currentFlight : "All";
  const visible = jobs.filter(job => filter.value === "All" || job.flightNo === filter.value);
  const selected = new Set(transferSelectedTextNumbers());
  $("#outboundPrepCount").textContent = `${visible.length} ${localizeText("งาน / jobs")}`;
  list.innerHTML = visible.length ? visible.map(job => `
    <label class="outbound-prep-item ${selected.has(job.houseNumber) ? "selected" : ""}">
      <input class="outbound-prep-check" type="checkbox" value="${job.houseNumber}" ${selected.has(job.houseNumber) ? "checked" : ""}>
      <span class="prep-house"><strong>${job.houseNumber}</strong><small>${job.customerName || "-"}</small></span>
      <span><b>${job.flightNo || "No flight"}</b><small>${job.terminalDestination || job.destination || job.routeType || "-"}</small></span>
      <span class="prep-docs">
        <em class="${job.cargoTransferIssuedAt ? "ready" : "waiting"}">${job.cargoTransferIssuedAt ? "Cargo issued" : "รอออก Cargo"}</em>
        <em class="${job.requiresLithiumDocs ? "danger" : "ready"}">${job.requiresLithiumDocs ? "Lithium required" : "General"}</em>
      </span>
    </label>`).join("") : `<div class="empty-state">${localizeText("ไม่มีงาน Outbound ตามตัวกรอง / No outbound jobs")}</div>`;
  const lithiumRequired = visible.some(job => selected.has(job.houseNumber) && job.requiresLithiumDocs);
  $("#transferLithiumHint").textContent = localizeText(lithiumRequired ? "ชุดงานนี้มี Lithium: ต้องแนบเอกสารก่อนออกใบ / Lithium items: attach docs first" : "แนบเมื่อในชุดงานมีสินค้าลิเทียม / Attach when lithium items present");
  $("#transferLithiumHint").classList.toggle("required-hint", lithiumRequired);
}

function syncOutboundSelection() {
  const houses = $$(".outbound-prep-check:checked").map(input => input.value);
  $("#transferHouseList").value = houses.join("\n");
  const first = findExactJob(houses[0]);
  if (first) {
    $("#terminalHouse").value = first.houseNumber;
    $("#transferTo").value = ["TG", "TGINT", "BFS"].includes(first.terminalDestination || first.destination) ? (first.terminalDestination || first.destination) : "TG";
  }
  renderOutboundPreparationQueue();
  renderTransferPreview();
}


// ===== WAREHOUSE MAP =====
let whMapState = { zones: [], locations: [], overlays: [], selectedColor: "#dbeafe", selectedOverlayType: "aisle", activeTool: "select" };
let whProfiles = []; // loaded from /api/warehouse/profiles
let whCapData = {};  // zoneId → capacity object (from /api/warehouse/zones/capacity)
let whCapRatio = 10; // palletToBoxRatio

async function loadWhProfiles() {
  try {
    const data = await api("/api/warehouse/profiles", {}, "GET");
    whProfiles = data.profiles || [];
  } catch(e) { whProfiles = []; }
}

async function saveWhAsProfile(name, description = "") {
  if (!name) return;
  await api("/api/warehouse/profiles/save", { name, description });
  await loadWhProfiles();
  toast("\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e41\u0e1c\u0e19\u0e17\u0e35\u0e48: " + name);
}

async function loadWhProfile(profileId, profileName) {
  if (!(await showWhConfirm(`โหลดแผนที่ "${profileName}"? แผนที่ปัจจุบันจะถูกแทนที่`))) return;
  const data = await api("/api/warehouse/profiles/load", { id: profileId });
  if (data.ok) {
    whMapState.zones = data.map.zones || [];
    whMapState.locations = data.map.locations || [];
    whMapState.overlays = data.map.overlays || [];
    toast(`โหลด "${profileName}" แล้ว`);
    collapseWhEditorToCard();
  }
}

async function deleteWhProfile(profileId, profileName) {
  if (!(await showWhConfirm(`ลบแผนที่ "${profileName}"?`))) return;
  await api("/api/warehouse/profiles/delete/" + encodeURIComponent(profileId), {}, "POST");
  await loadWhProfiles();
  collapseWhEditorToCard();
  toast(`ลบ "${profileName}" แล้ว`);
}

async function loadWarehouseMap() {
  try {
    const [data, capData, cfgData] = await Promise.all([
      api("/api/warehouse/map", {}),
      fetch(API_BASE + "/api/warehouse/zones/capacity").then(r => r.json()).catch(() => ({ zones: [] })),
      fetch(API_BASE + "/api/warehouse/config").then(r => r.json()).catch(() => ({ config: { palletToBoxRatio: 10 } }))
    ]);
    if (data?.map) {
      whMapState.zones     = data.map.zones     || [];
      whMapState.locations = data.map.locations || [];
      whMapState.overlays  = data.map.overlays  || [];
    }
    whMapState.jobStats    = data?.jobStats    || { inbound:0, stored:0, readyTerminal:0, total:0 };
    whMapState.inboundJobs = data?.inboundJobs || [];
    // Store capacity lookup by zoneId
    whCapData = {};
    for (const z of (capData.zones || [])) { whCapData[z.id] = z; }
    whCapRatio = (cfgData.config || {}).palletToBoxRatio || 10;
  } catch (e) { console.warn("loadWarehouseMap:", e); }
}


// ── Warehouse: Styled confirm dialog ──────────────────────────────────────
function showWhConfirm(message) {
  return new Promise(resolve => {
    const el = document.getElementById("whConfirmModal");
    const msgEl = document.getElementById("whConfirmMsg");
    const okBtn = document.getElementById("whConfirmOk");
    const cancelBtn = document.getElementById("whConfirmCancel");
    if (!el) { resolve(window.confirm(message)); return; }
    msgEl.textContent = message;
    el.style.display = "flex";
    const cleanup = (result) => {
      el.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}



function renderLpWidget() {
  const widget = document.getElementById("lpDashWidget");
  if (!widget) return;
  const plan = state.loadPlan;
  widget.style.display = "";
  if (!plan) {
    const set2 = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    set2("lpWidgetTotal", "—"); set2("lpWidgetMatched", "—"); set2("lpWidgetToday", "—");
    const t = document.getElementById("lpWidgetTime");
    if(t) t.textContent = "ยังไม่มี Load Plan — ไปที่หน้าขาออกเพื่อ import";
    const ch = document.getElementById("lpWidgetChange");
    if(ch) ch.style.display = "none";
    return;
  }
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set("lpWidgetTotal", plan.totalRows || 0);
  set("lpWidgetMatched", plan.matchedCount || 0);
  set("lpWidgetToday", state.lpTodayOutbound ?? "—");
  const timeEl = document.getElementById("lpWidgetTime");
  if (timeEl) timeEl.textContent = "อัปเดต: " + formatBangkok(plan.importedAt);
  const chEl = document.getElementById("lpWidgetChange");
  if (chEl) {
    if (plan.changes?.hasChanges) {
      const a = plan.changes.added?.length || 0;
      const r = plan.changes.removed?.length || 0;
      chEl.style.display = "";
      chEl.textContent = `⚠ มีการเปลี่ยนแปลงจากครั้งก่อน: +${a} เพิ่ม, -${r} ลบ`;
    } else {
      chEl.style.display = "none";
    }
  }
}



// ═══════════════════════════════════════════════════════════════════════
// OUTBOUND GROUPING (ขาออก)
// ═══════════════════════════════════════════════════════════════════════
function setGroupingTab(tab) {
  state.groupingTab = tab;
  // Update tab button styles
  const inBtn  = document.getElementById("tabGroupInbound");
  const outBtn = document.getElementById("tabGroupOutbound");
  if (inBtn)  { inBtn.style.background  = tab === "inbound"  ? "#2563eb" : "#f1f5f9"; inBtn.style.color  = tab === "inbound"  ? "#fff" : "#64748b"; }
  if (outBtn) { outBtn.style.background = tab === "outbound" ? "#0f766e" : "#f1f5f9"; outBtn.style.color = tab === "outbound" ? "#fff" : "#64748b"; }

  // Show/hide left panels
  const autoPanel = document.querySelector(".auto-group-panel:not(#outboundGroupPanel)");
  const manualSec = document.getElementById("manualGroupSection");
  const outPanel  = document.getElementById("outboundGroupPanel");
  if (autoPanel) autoPanel.style.display = tab === "inbound" ? "" : "none";
  if (manualSec) manualSec.style.display = tab === "inbound" ? "" : "none";
  if (outPanel)  outPanel.style.display  = tab === "outbound" ? "" : "none";

  // Preview panel: show for both tabs, update title, always hide CTF input form
  const titleEl   = document.getElementById("groupPreviewTitle");
  const ctfInputs = document.getElementById("groupCtfInputs");
  const previewPanel = document.getElementById("groupPreviewPanel");
  if (titleEl)     titleEl.textContent = tab === "inbound" ? "Preview ใบ Cargo Pickup Form" : "Preview ใบ Cargo Transfer Form";
  if (ctfInputs)   ctfInputs.style.display = "none"; // inputs now in left panel
  if (previewPanel) previewPanel.style.display = ""; // always visible

  // Reset preview area
  state._groupCtfJobs = [];
  const target = document.getElementById("groupCargoPreview");
  const lbl    = document.getElementById("groupContextLabel");
  if (lbl)    lbl.textContent = "ยังไม่ได้เลือกกลุ่มงาน / No group selected";
  if (target) target.innerHTML = `<div class="empty-state">${tab === "inbound" ? "เลือกกลุ่มงานเพื่อดู Preview ใบ Cargo Pickup Form" : "คลิกกลุ่มงานเพื่อดู Preview ใบ Cargo Transfer Form"}</div>`;

  if (tab === "outbound") {
    renderObDriverOptions();
    renderOutboundGroups();
  }
}

function renderGroupingTabs() {
  // Restore correct tab state on view switch
  setGroupingTab(state.groupingTab || "inbound");
}

function outboundGroupsByFlight() {
  const rows = state.loadPlan?.rows || [];
  const jobs = state.dashboard?.jobs || [];
  const overrides = state.outboundGroupOverrides || {};
  const map = new Map();

  for (const r of rows) {
    const origFlight = r.flightNumber || "—";
    const origDest   = r.destination || "";
    const origKey    = `${origFlight}|${origDest}`;
    // Apply override: move this house to another group key
    const effectiveKey = overrides[r.houseNumber] || origKey;
    let flight, dest;
    if (effectiveKey === "__new__") {
      flight = "(กลุ่มใหม่)"; dest = "";
    } else {
      [flight, dest] = effectiveKey.split("|");
    }
    if (!map.has(effectiveKey)) {
      map.set(effectiveKey, { flight, dest, key: effectiveKey, rows: [] });
    }
    const job = jobs.find(j => j.houseNumber === r.houseNumber) || {};
    map.get(effectiveKey).rows.push({
      houseNumber: r.houseNumber,
      flightNumber: flight !== "(กลุ่มใหม่)" ? flight : "",
      customerName: r.customerName || job.customerName || "",
      destination: dest || job.destAirport || job.destination || "",
      pieces: r.pieces || job.pieceCount || "",
      awbNumber: r.awbNumber || job.awbNumber || "",
      warehouseLocation: r.warehouseLocation || "",
      jobStatus: job.status || r.jobStatus || "",
      moved: !!overrides[r.houseNumber]
    });
  }
  return Array.from(map.values()).sort((a,b) => a.flight.localeCompare(b.flight));
}

function renderOutboundGroups() {
  const groups = outboundGroupsByFlight();
  const listEl  = document.getElementById("outboundGroupList");
  const emptyEl = document.getElementById("outboundGroupEmpty");
  const countEl = document.getElementById("outboundGroupCount");
  const total   = groups.reduce((s,g) => s + g.rows.length, 0);
  if (countEl) countEl.textContent = `${total} งาน`;
  if (!groups.length) {
    if (emptyEl) emptyEl.style.display = "";
    if (listEl)  listEl.innerHTML = "";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  if (!listEl) return;

  listEl.innerHTML = groups.map((g, idx) => {
    const custs = [...new Set(g.rows.map(r => r.customerName).filter(Boolean))].join(" / ") || "—";
    const movedCount = g.rows.filter(r => r.moved).length;
    return `
    <button type="button" onclick="toggleObGroup(${idx})"
      class="group-card-btn" id="obg-${idx}"
      style="width:100%;text-align:left;background:#fff;border:1.5px solid #e2e8f0;border-radius:11px;padding:13px 15px;cursor:pointer;transition:all .15s"
      onmouseover="this.style.borderColor='#0f766e';this.style.background='#f0fdf4'"
      onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#fff'">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <div style="font-weight:800;font-size:13px;color:#0f766e">✈ ${g.flight}${g.dest?" → "+g.dest:""}</div>
        <span style="background:#f0fdf4;color:#166534;font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px">${g.rows.length} งาน</span>
      </div>
      <div style="font-size:11px;color:#475569;margin-bottom:3px">${custs}</div>
      ${movedCount ? `<div style="font-size:10px;color:#d97706">↷ ย้ายแล้ว ${movedCount} งาน</div>` : ""}
    </button>`;
  }).join("");
}


function selectOutboundGroup(idx) {
  const groups = outboundGroupsByFlight();
  const group = groups[idx];
  if (!group) return;
  state.outboundExpandedIdx = idx;
  // Highlight selected card
  document.querySelectorAll("[id^='obg-']").forEach(el => {
    el.style.borderColor = "#e2e8f0";
    el.style.background = "#fff";
  });
  const sel = document.getElementById(`obg-${idx}`);
  if (sel) { sel.style.borderColor = "#0f766e"; sel.style.background = "#f0fdf4"; }
  // Update context label
  const lbl = document.getElementById("groupContextLabel");
  if (lbl) lbl.textContent = `✈ ${group.flight}${group.dest ? " → " + group.dest : ""} — ${group.rows.length} รายการ`;
  // Build job list
  state._groupCtfJobs = group.rows.map(r => ({
    houseNumber: r.houseNumber,
    flightNo: r.flightNumber || group.flight,
    flightNumber: r.flightNumber || group.flight,
    customerName: r.customerName || "",
    destAirport: r.destination || group.dest || "",
    destination: r.destination || group.dest || "",
    pieceCount: r.pieces || "",
    awbNumber: r.awbNumber || ""
  }));
  // Show CTF preview in right panel
  refreshGroupCtfPreview();
}

// ═══════════════════════════════════════════════════════════════════════
// CARGO TRANSFER FORM
// ═══════════════════════════════════════════════════════════════════════
function buildCtfPreviewHtml(opts) {
  const { driver, plate, velType, tmo, relBy, unloadBy, rows, jobs } = opts;
  const now = new Date();
  const dd = String(now.getDate()).padStart(2,'0');
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const yy = now.getFullYear();
  const thMonths = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  // Thai year (Buddhist) = +543
  const byYear = String(now.getFullYear()+543).slice(-2);
  const thDate = `${dd}-${thMonths[now.getMonth()]}-${byYear}`;
  const thTime = `${String(now.getHours()).padStart(2,'0')}.${String(now.getMinutes()).padStart(2,'0')}`;
  const thDateFull = `${dd}/${mm}/${yy}`;

  // Build table rows (pad to 14 minimum to match form layout)
  const PAD = 14;
  let trs = "";
  for (let i = 0; i < Math.max(rows.length, PAD); i++) {
    const r = rows[i];
    if (!r) {
      trs += `<tr style="height:24px"><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td><td style="border:1px solid #999;padding:2px 4px"></td></tr>`;
      continue;
    }
    const job = jobs.find(j => j.houseNumber === r.houseNumber) || {};
    const awb   = r.awbNumber || job.mawbNumber || job.awbNumber || "";
    const dest  = r.destination || job.destAirport || job.destination || "";
    const pcs   = r.pieces || job.pieceCount || "";
    const cust  = r.customerName || job.customerName || "";
    const ic    = r.icNumber || job.icNumber || "";
    trs += `<tr style="height:24px">
      <td style="border:1px solid #999;padding:2px 4px;font-weight:700;font-size:11px">${r.houseNumber}</td>
      <td style="border:1px solid #999;padding:2px 4px;font-size:10px">${ic}</td>
      <td style="border:1px solid #999;padding:2px 6px;font-size:11px;font-weight:600">${cust}</td>
      <td style="border:1px solid #999;padding:2px 4px;font-size:11px;text-align:center">${dest}</td>
      <td style="border:1px solid #999;padding:2px 4px;font-size:11px;text-align:center">${pcs ? pcs+'P' : ''}</td>
      <td style="border:1px solid #999;padding:2px 6px;font-size:11px">${awb}</td>
      <td style="border:1px solid #999;padding:2px;text-align:center;font-size:13px">/</td>
      <td style="border:1px solid #999;padding:2px;text-align:center;font-size:12px">✓</td>
      <td style="border:1px solid #999;padding:2px;text-align:center"></td>
    </tr>`;
  }

  return `<div style="background:#fff;font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;color:#000;padding:14px 16px;line-height:1.3">

<!-- HEADER -->
<table style="width:100%;border-collapse:collapse;margin-bottom:8px">
  <tr>
    <td style="vertical-align:top;width:62%">
      <div style="font-weight:900;font-size:11px">Expeditors (Thailand) Ltd.</div>
      <div style="font-size:8px;color:#333;line-height:1.55;margin-top:2px">
        Head office &nbsp;: 44<sup>th</sup> Floor, Empire Tower, 195 South Sathorn Road<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Yannawa, Sathorn, Bangkok 10120, Thailand<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Tel : (66) 2670-1658 Fax : (66) 2670-1035-6<br>
        Warehouse Office : Unit 112-113, Warehouse No. 3, Free Zone, Suvarnabhumi Airport,<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;999, Moo 7, Kacha Theewa, Bang Phli, Samut Prakarn 10540<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Tel : (66)(2131-2269-72, (66) 2131-2222 ext 2269-72 Fax : (66) 2635-1355-7
      </div>
    </td>
    <td style="text-align:right;vertical-align:top">
      <span style="font-family:Arial;font-weight:900;font-size:20px;letter-spacing:.5px;color:#1a3a6e;font-style:italic">Expeditors<sup style="font-size:9px">®</sup></span>
    </td>
  </tr>
</table>

<!-- TITLE BAR -->
<div style="text-align:center;font-size:12px;font-weight:900;letter-spacing:3px;border-top:2.5px solid #000;border-bottom:2.5px solid #000;padding:4px 0;margin-bottom:8px">
  CARGO TRANSFER FORM
</div>

<!-- TOP FIELDS -->
<table style="width:100%;border-collapse:collapse;margin-bottom:5px;font-size:10px">
  <tr>
    <td style="width:20%;padding:1px 0"><span style="font-weight:700;font-size:9px">Transfer Date<br><span style="font-weight:400">วันที่ส่งสินค้า</span></span></td>
    <td style="width:22%;border-bottom:1px solid #000;padding:1px 4px;font-size:11px">${thDate}</td>
    <td style="width:8%;text-align:center;padding:1px"><span style="font-weight:700;font-size:9px">Time<br><span style="font-weight:400">(เวลา)</span></span></td>
    <td style="width:14%;border-bottom:1px solid #000;padding:1px 4px;font-size:12px;font-weight:700">${thTime}</td>
    <td style="width:16%;padding:1px 4px"><span style="font-weight:700;font-size:9px">Release Shipment by</span></td>
    <td style="border-bottom:1px solid #000;padding:1px 4px;font-size:11px">${relBy || "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</td>
  </tr>
  <tr style="height:5px"></tr>
  <tr>
    <td><span style="font-weight:700;font-size:9px">Transfer From</span></td>
    <td style="border-bottom:1px solid #000;padding:1px 4px;font-size:12px;font-weight:900">WH3</td>
    <td colspan="2" style="padding:1px 4px">
      <span style="font-weight:700;font-size:9px">To TMO</span>
      <span style="font-size:13px;font-weight:900;margin-left:6px;letter-spacing:1px">${tmo}</span>
    </td>
    <td><span style="font-weight:700;font-size:9px">Vel type:</span></td>
    <td style="border-bottom:1px solid #000;padding:1px 4px;font-size:11px">${velType}</td>
  </tr>
  <tr style="height:5px"></tr>
  <tr>
    <td><span style="font-weight:700;font-size:9px">Driver's Name /<br><span style="font-weight:400">ผู้ขับ</span></span></td>
    <td style="border-bottom:1px solid #000;padding:1px 4px;font-size:12px;font-weight:700">${driver || "&nbsp;"}</td>
    <td colspan="2" style="padding:1px 4px">
      <span style="font-weight:700;font-size:9px">Truck License /<br><span style="font-weight:400">ทะเบียน</span></span>
    </td>
    <td colspan="2" style="border-bottom:1px solid #000;padding:1px 4px;font-size:12px;font-weight:700">${plate || "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</td>
  </tr>
</table>

<!-- ITEMS TABLE -->
<table style="width:100%;border-collapse:collapse;margin:6px 0;font-size:10px">
  <colgroup>
    <col style="width:17%"><col style="width:16%"><col style="width:18%">
    <col style="width:7%"><col style="width:6%"><col style="width:18%">
    <col style="width:6%"><col style="width:6%"><col style="width:6%">
  </colgroup>
  <thead>
    <tr style="background:#d9d9d9">
      <th style="border:1px solid #666;padding:3px 4px;font-size:9px;text-align:left">HAWB</th>
      <th style="border:1px solid #666;padding:3px 4px;font-size:9px">IC</th>
      <th style="border:1px solid #666;padding:3px 4px;font-size:9px">SHIPPER</th>
      <th style="border:1px solid #666;padding:3px 4px;font-size:9px">DEST</th>
      <th style="border:1px solid #666;padding:3px 4px;font-size:9px">PCS</th>
      <th style="border:1px solid #666;padding:3px 4px;font-size:9px">MAWB.</th>
      <th colspan="3" style="border:1px solid #666;padding:3px 2px;font-size:8px;text-align:center">Permit / Security / Inspected</th>
    </tr>
  </thead>
  <tbody>${trs}</tbody>
</table>

<!-- SIGNATURE SECTION -->
<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:9px">
  <tr>
    <td style="width:44%;vertical-align:bottom;padding-right:6px">
      <div style="font-weight:700">WH release by:</div>
      <div style="color:#555;font-size:8px">(พนักงานขับรถย้อยสินค้า)</div>
      <div style="border-bottom:1px solid #000;height:22px;margin-top:2px"></div>
    </td>
    <td style="width:9%;vertical-align:bottom;padding:0 2px">
      <div style="font-weight:700">Date<br><span style="font-weight:400">(วันที่)</span></div>
    </td>
    <td style="width:20%;vertical-align:bottom;border-bottom:1px solid #000;padding-bottom:1px;font-size:10px">${thDateFull}</td>
    <td style="width:9%;vertical-align:bottom;padding:0 2px">
      <div style="font-weight:700">Time<br><span style="font-weight:400">(เวลา)</span></div>
    </td>
    <td style="vertical-align:bottom;border-bottom:1px solid #000"></td>
  </tr>
  <tr style="height:6px"></tr>
  <tr>
    <td style="vertical-align:bottom;padding-right:6px">
      <div style="font-weight:700">Driver Transfer Shipment B:</div>
      <div style="color:#555;font-size:8px">(พนักงานขับรถย้อยสินค้า)</div>
      <div style="border-bottom:1px solid #000;height:22px;margin-top:2px;padding-top:2px;font-size:11px;font-weight:700">${driver || ""}</div>
    </td>
    <td style="vertical-align:bottom;padding:0 2px">
      <div style="font-weight:700">Date<br><span style="font-weight:400">(วันที่)</span></div>
    </td>
    <td style="vertical-align:bottom;border-bottom:1px solid #000;padding-bottom:1px;font-size:10px">${thDateFull}</td>
    <td style="vertical-align:bottom;padding:0 2px">
      <div style="font-weight:700">Time<br><span style="font-weight:400">(เวลา)</span></div>
    </td>
    <td style="vertical-align:bottom;border-bottom:1px solid #000;font-size:9px;padding-bottom:1px">${thTime}&nbsp;เวลาจองคิว</td>
  </tr>
  <tr style="height:6px"></tr>
  <tr>
    <td style="vertical-align:bottom;padding-right:6px">
      <div style="font-weight:700">TMO Received by :</div>
      <div style="color:#555;font-size:8px">(พนักงานตรวจนับรับสินค้า)</div>
      <div style="border-bottom:1px solid #000;height:22px;margin-top:2px"></div>
    </td>
    <td style="vertical-align:bottom;padding:0 2px">
      <div style="font-weight:700">Date<br><span style="font-weight:400">(วันที่)</span></div>
    </td>
    <td style="vertical-align:bottom;border-bottom:1px solid #000;padding-bottom:1px;font-size:10px">${thDateFull}</td>
    <td style="vertical-align:bottom;padding:0 2px">
      <div style="font-weight:700">Time<br><span style="font-weight:400">(เวลา)</span></div>
    </td>
    <td style="vertical-align:bottom;border-bottom:1px solid #000;font-size:9px;padding-bottom:1px">เวลาได้คิว</td>
  </tr>
</table>

<!-- UNLOAD SECTION -->
<div style="border:1.5px solid #000;margin-top:8px;padding:6px 8px">
  <div style="font-weight:900;font-size:10px;margin-bottom:5px">Unload by ${unloadBy || "___________"}</div>
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="width:50%;border:1px solid #bbb;padding:5px 6px;font-weight:700;font-size:9px">Start unload (เริ่มลงสินค้า) :</td>
      <td style="width:50%;border:1px solid #bbb;padding:5px 6px;font-weight:700;font-size:9px">Unload finished (ลงเสร็จ) :</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:5px 6px;font-weight:700;font-size:9px">Found any damage (เจอสินค้าเสียหายหรือไม่) :</td>
      <td style="border:1px solid #bbb;padding:5px 6px;font-weight:700;font-size:9px">Issue cause (สาเหตุ) :</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:5px 6px;font-weight:700;font-size:9px">Seamless operation (การทำงานติดขัดอะไรมั้ย):</td>
      <td style="border:1px solid #bbb;padding:5px 6px;font-weight:700;font-size:9px">Supervisor contact (เบอร์ติดต่อหัวหน้างาน) :</td>
    </tr>
  </table>
</div>

<!-- FOOTER -->
<table style="width:100%;margin-top:6px;font-size:8px;color:#555">
  <tr>
    <td>Document Owner: Chitiput Phassada<br>Supervisor Air Warehouse</td>
    <td style="text-align:center">" Unless can be no guarantee that this information is the latest version available."</td>
    <td style="text-align:right">Latest Revision date : Feb 17, 2025</td>
  </tr>
</table>

</div>`;
}


function updateCtfPreview() {
  const rows = state.loadPlan?.rows || [];
  const jobs = state.dashboard?.jobs || [];
  const previewEl = document.getElementById("ctfPreviewArea");
  if (!previewEl) return;
  previewEl.innerHTML = buildCtfPreviewHtml({
    driver: document.getElementById("ctfDriver")?.value || "",
    plate:  document.getElementById("ctfPlate")?.value || "",
    velType: document.getElementById("ctfVelType")?.value || "6 ล้อ",
    tmo:    document.getElementById("ctfTmo")?.value || "INTER",
    relBy:  document.getElementById("ctfReleasedBy")?.value || "",
    unloadBy: document.getElementById("ctfUnloadBy")?.value || "",
    rows, jobs
  });
}

function openCargoTransferModal() {
  const rows = state.loadPlan?.rows || [];
  const modal = document.getElementById("cargoTransferModal");
  if (!modal) return;
  const countEl = document.getElementById("ctfJobCount");
  if (countEl) countEl.textContent = rows.length;
  const driverField = document.getElementById("ctfDriver");
  if (driverField && !driverField.value) driverField.value = state.user?.name || "";
  modal.style.display = "flex";
  // Render initial preview
  updateCtfPreview();
}

function printCargoTransferForm() {
  const rows = state.loadPlan?.rows || [];
  const jobs = state.dashboard?.jobs || [];
  if (!rows.length) { toast("ไม่มีรายการใน Load Plan — import CSV หรือแท็กงานก่อน", "error"); return; }
  const csWait = rows
    .map(r => jobs.find(j => j.houseNumber === r.houseNumber))
    .filter(j => j && !j.csConfirmed);
  if (csWait.length) { toast(`🔒 ${csWait.length} งานยังไม่ผ่าน CS ยืนยัน: ${csWait.slice(0,5).map(j=>j.houseNumber).join(", ")}${csWait.length>5?" ...":""}`, "error"); return; }
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>Cargo Transfer Form</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:12px}@media print{.no-print{display:none!important}}</style>
</head><body>
${buildCtfPreviewHtml({
    driver: document.getElementById("ctfDriver")?.value || "",
    plate:  document.getElementById("ctfPlate")?.value || "",
    velType: document.getElementById("ctfVelType")?.value || "6 ล้อ",
    tmo:    document.getElementById("ctfTmo")?.value || "INTER",
    relBy:  document.getElementById("ctfReleasedBy")?.value || "",
    unloadBy: document.getElementById("ctfUnloadBy")?.value || "",
    rows, jobs
  })}
<div class="no-print" style="text-align:center;margin-top:20px">
  <button onclick="window.print()" style="padding:12px 32px;background:#0f766e;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;margin-right:12px">🖨 พิมพ์</button>
  <button onclick="window.close()" style="padding:12px 24px;background:#64748b;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer">ปิด</button>
</div></body></html>`;
  const win = window.open("", "_blank", "width=860,height=950");
  win.document.write(html);
  win.document.close();
}

// ═══════════════════════════════════════════════════════════════════════
// LOAD PLAN — ขาออก / Outbound
// ═══════════════════════════════════════════════════════════════════════
let lpCurrentPlan = null;
let lpFlightFilter = null; // null = show all, 'FLIGHT|DEST' = filter

async function renderLoadPlan() {
  try {
    const data = await api("/api/loadplan/latest", null, "GET");
    lpCurrentPlan = data.latest;
    renderLpKpi(data);
    renderLpFlightSummaryCards(data.latest);
    renderLpTable(data.latest);
    renderLpHistory();
    renderLpChangeBanner(data.latest);
  } catch(e) {
    console.error("renderLoadPlan:", e);
  }
}

function renderLpKpi(data) {
  const plan = data.latest;
  const kpiEl = document.getElementById("lpKpiRow");
  if (!kpiEl) return;
  const hasCh = plan?.changes?.hasChanges;
  const addN  = plan?.changes?.added?.length  || 0;
  const remN  = plan?.changes?.removed?.length || 0;
  const matchedPct = plan && plan.totalRows > 0 ? Math.round((plan.matchedCount / plan.totalRows) * 100) : 0;
  const todayVal = data.todayOutbound ?? 0;
  const chLabel = !plan ? "—" : !hasCh
    ? `<span style="display:flex;align-items:center;gap:5px;color:#22c55e"><i data-lucide="check-circle-2" style="width:14px;height:14px"></i>ไม่มีการเปลี่ยนแปลง</span>`
    : `<span style="color:#f59e0b;font-size:13px;font-weight:700">+${addN} เพิ่ม &nbsp;&nbsp; −${remN} ลบ</span>`;
  const lastImport = plan ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">${formatBangkok(plan.importedAt)}</div>` : "";

  // ── On-time KPI: compute from plan rows ──
  const READY = ["ReadyForTerminal","LoadingReady","XRayPassed","Completed"];
  const now = Date.now();
  let onTime = 0, atRisk = 0, missed = 0, noEtd = 0;
  for (const r of plan?.rows || []) {
    if (!r.matched) continue;
    const isReady = READY.includes(r.jobStatus);
    // fallback: get flightTime from jobs state
    const ft = r.flightTime || (state.dashboard?.jobs||[]).find(j=>j.houseNumber===r.houseNumber)?.flightTime;
    if (!ft) { if (isReady) onTime++; else noEtd++; continue; }
    const etdMs = new Date(ft).getTime();
    const diffH = (etdMs - now) / 3600000;
    if (isReady) { onTime++; }
    else if (etdMs < now) { missed++; }          // flight passed, not ready
    else if (diffH < 6)   { atRisk++; }           // < 6h, not ready
    else                  { noEtd++; }             // plenty of time
  }
  const onTimeColor = missed > 0 ? "#ef4444" : atRisk > 0 ? "#f59e0b" : "#22c55e";
  const onTimeIcon  = missed > 0 ? "circle-x" : atRisk > 0 ? "alarm-clock" : "circle-check-big";
  let onTimeDetail = "";
  if (plan?.rows?.length) {
    const parts = [];
    if (onTime  > 0) parts.push(`<span style="color:#22c55e;font-size:11px;font-weight:700">✓ ${onTime} พร้อม</span>`);
    if (atRisk  > 0) parts.push(`<span style="color:#f59e0b;font-size:11px;font-weight:700">⚠ ${atRisk} เสี่ยง</span>`);
    if (missed  > 0) parts.push(`<span style="color:#ef4444;font-size:11px;font-weight:700">✗ ${missed} พลาด</span>`);
    onTimeDetail = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${parts.join("")}</div>`;
  }

  kpiEl.innerHTML = `
    <div class="lp-kpi-card" style="--kpi-accent:#2563eb">
      <div class="lp-kpi-icon"><i data-lucide="list-checks"></i></div>
      <div class="lp-kpi-body">
        <div class="lp-kpi-label">รายการทั้งหมดใน Plan</div>
        <div class="lp-kpi-val">${plan ? plan.totalRows : "—"}</div>
      </div>
    </div>
    <div class="lp-kpi-card" style="--kpi-accent:#22c55e">
      <div class="lp-kpi-icon"><i data-lucide="database-zap"></i></div>
      <div class="lp-kpi-body">
        <div class="lp-kpi-label">พบใน System</div>
        <div class="lp-kpi-val" style="color:#22c55e">${plan ? plan.matchedCount : "—"}</div>
        ${plan ? `<div style="font-size:11px;color:#22c55e;margin-top:2px;font-weight:600">${matchedPct}% match rate</div>` : ""}
      </div>
    </div>
    <div class="lp-kpi-card" style="--kpi-accent:#8b5cf6">
      <div class="lp-kpi-icon"><i data-lucide="plane-takeoff"></i></div>
      <div class="lp-kpi-body">
        <div class="lp-kpi-label">ส่งออกวันนี้</div>
        <div class="lp-kpi-val" style="color:#8b5cf6">${todayVal}</div>
      </div>
    </div>
    <div class="lp-kpi-card" style="--kpi-accent:${onTimeColor}">
      <div class="lp-kpi-icon"><i data-lucide="${onTimeIcon}"></i></div>
      <div class="lp-kpi-body">
        <div class="lp-kpi-label">ทันเวลา / ไม่ทันเวลา</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <span class="lp-kpi-val" style="color:${onTimeColor}">${plan ? onTime : "—"}</span>
          ${plan && (atRisk+missed) > 0 ? `<span style="font-size:15px;color:#ef4444;font-weight:800">/ ${atRisk+missed}</span>` : ""}
        </div>
        ${onTimeDetail}
      </div>
    </div>
    <div class="lp-kpi-card" style="--kpi-accent:${hasCh ? '#f59e0b' : '#22c55e'}">
      <div class="lp-kpi-icon"><i data-lucide="${hasCh ? 'bell-ring' : 'bell'}"></i></div>
      <div class="lp-kpi-body">
        <div class="lp-kpi-label">การเปลี่ยนแปลง</div>
        <div style="margin-top:2px">${chLabel}</div>
        ${lastImport}
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();
}

function renderLpChangeBanner(plan) {
  const banner = document.getElementById("lpChangeBanner");
  if (!banner || !plan) return;
  if (plan.changes?.hasChanges) {
    const addN = plan.changes.added?.length || 0;
    const remN = plan.changes.removed?.length || 0;
    banner.style.display = "flex";
    const t = document.getElementById("lpChangeBannerTitle");
    const d = document.getElementById("lpChangeBannerDetail");
    if (t) t.textContent = `⚠ Load Plan เปลี่ยนแปลงจาก import ครั้งก่อน`;
    if (d) d.textContent = `เพิ่ม ${addN} รายการ (${(plan.changes.added||[]).map(r=>r.houseNumber).slice(0,3).join(", ")}${addN>3?"...":""}) | ลบ ${remN} รายการ (${(plan.changes.removed||[]).map(r=>r.houseNumber).slice(0,3).join(", ")}${remN>3?"...":""})`;
  } else {
    banner.style.display = "none";
  }
}

function renderLpTable(plan) {
  const tbody = document.getElementById("lpTableBody");
  if (!tbody) return;
  if (!plan || !plan.rows?.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding:48px;text-align:center;color:var(--muted)">
      <div style="font-size:32px;margin-bottom:8px">📋</div>
      ยังไม่มีข้อมูล — กด <b>Import CSV</b> เพื่อโหลด Load Plan</td></tr>`;
    return;
  }
  const q = (document.getElementById("lpTableSearch")?.value || "").toLowerCase();
  const statusFilter = document.getElementById("lpStatusFilter")?.value || "";
  const addedSet = new Set((plan.changes?.added||[]).map(r=>r.houseNumber));
  let allRows = plan.rows;
  // Flight card filter
  if (lpFlightFilter) {
    const [fNum, fDest] = lpFlightFilter.split("|");
    allRows = allRows.filter(r => (r.flightNumber||"—") === fNum && (r.destination||"") === fDest);
  }
  // Text search
  if (q) allRows = allRows.filter(r =>
    (r.houseNumber||"").toLowerCase().includes(q) ||
    (r.flightNumber||"").toLowerCase().includes(q) ||
    (r.customerName||"").toLowerCase().includes(q) ||
    (r.destination||"").toLowerCase().includes(q)
  );
  // Status filter
  if (statusFilter === "matched") allRows = allRows.filter(r => r.matched);
  else if (statusFilter === "unmatched") allRows = allRows.filter(r => !r.matched);
  else if (statusFilter === "ready") allRows = allRows.filter(r => ["ReadyForTerminal","LoadingReady","XRayPassed","Completed"].includes(r.jobStatus));
  else if (statusFilter === "pending") allRows = allRows.filter(r => !["ReadyForTerminal","LoadingReady","XRayPassed","Completed"].includes(r.jobStatus) && r.matched);
  if (!allRows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--muted)">ไม่พบรายการที่ค้นหา</td></tr>`;
    return;
  }
  const rows = allRows.map((r, i) => {
    const isNew = addedSet.has(r.houseNumber);
    const matchBadge = r.matched
      ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">✓ พบ</span>`
      : `<span style="display:inline-flex;align-items:center;gap:4px;background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">✗ ไม่พบ</span>`;
    const locBadge = r.warehouseLocation
      ? `<span style="background:#eff6ff;color:#1d4ed8;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${r.warehouseLocation}</span>`
      : `<span style="color:var(--muted);font-size:12px">—</span>`;
    const statusColor = {"Completed":"#22c55e","LoadingReady":"#2563eb","XRayPassed":"#8b5cf6","ReadyForTerminal":"#f59e0b","Stored":"#94a3b8","Inbound":"#64748b"}[r.jobStatus] || "#94a3b8";
    const statusBadge = r.jobStatus ? `<span style="color:${statusColor};font-weight:600;font-size:12px">${r.jobStatus}</span>` : `<span style="color:var(--muted);font-size:12px">—</span>`;
    const newBadge = isNew ? `<span style="background:#fef3c7;color:#d97706;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px">ใหม่</span>` : "";
    return `<tr data-lp-idx="${i}" onclick="lpShowDetail(${i})" style="border-bottom:1px solid var(--line);cursor:pointer;transition:background .15s${isNew?';background:#fffbeb':''}" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background='${isNew?'#fffbeb':''}'" >
      <td style="padding:10px 16px;color:var(--muted);font-size:12px">${i+1}</td>
      <td style="padding:10px 16px;font-weight:700;font-family:monospace;font-size:13px">${safeHtml(r.houseNumber)}${newBadge}</td>
      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#0f766e">${safeHtml(r.flightNumber||"—")}</td>
      <td style="padding:10px 16px;font-size:13px">${safeHtml(r.customerName||"—")}</td>
      <td style="padding:10px 16px;font-size:13px;font-weight:600">${safeHtml(r.destination||"—")}</td>
      <td style="padding:10px 16px">${locBadge}</td>
      <td style="padding:10px 16px">${statusBadge}</td>
      <td style="padding:10px 16px">${matchBadge}</td>
    </tr>`;
  }).join("");
  tbody.innerHTML = rows;
}

function lpFilterByFlight(key) {
  // Toggle filter
  lpFlightFilter = lpFlightFilter === key ? null : key;
  renderLpFlightSummaryCards(lpCurrentPlan);
  renderLpTable(lpCurrentPlan);
  // Update filter chip label
  const chip = document.getElementById("lpActiveFilter");
  if (chip) {
    if (lpFlightFilter) {
      const [flight, dest] = lpFlightFilter.split("|");
      chip.innerHTML = `<span style="background:#dbeafe;color:#1d4ed8;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px">
        ✈ ${safeHtml(flight)}${dest?" → "+safeHtml(dest):""} &nbsp;
        <button onclick="lpFilterByFlight('${lpFlightFilter}')" style="background:none;border:none;cursor:pointer;color:#1d4ed8;font-size:14px;padding:0;line-height:1">✕</button>
      </span>`;
      chip.style.display = "block";
    } else {
      chip.style.display = "none";
    }
  }
}

function renderLpFlightSummaryCards(plan) {
  const container = document.getElementById("lpFlightSummaryCards");
  if (!container) return;
  if (!plan?.rows?.length) {
    container.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:8px 0">ยังไม่มีข้อมูล — Import CSV เพื่อโหลด</div>`;
    return;
  }
  // Build flight groups — fall back to matching job flightTime from state
  const jobsMap = new Map((state.dashboard?.jobs || []).map(j => [j.houseNumber, j]));
  const flights = new Map();
  for (const r of plan.rows) {
    const dest = r.destination || "";
    const key = `${r.flightNumber||"—"}|${dest}`;
    if (!flights.has(key)) flights.set(key, {
      key, flight: r.flightNumber||"—", dest, total: 0, matched: 0, readyCount: 0, notMatchedCount: 0,
      flightTime: r.flightTime || null
    });
    const g = flights.get(key);
    g.total++;
    if (r.matched) g.matched++; else g.notMatchedCount++;
    // ETD: from row → from matched job → keep null
    if (!g.flightTime) g.flightTime = r.flightTime || jobsMap.get(r.houseNumber)?.flightTime || null;
    if (["ReadyForTerminal","LoadingReady","XRayPassed","Completed"].includes(r.jobStatus)) g.readyCount++;
  }

  const now = Date.now();
  const cards = Array.from(flights.values()).map(g => {
    const pct = g.total > 0 ? Math.round((g.matched / g.total) * 100) : 0;
    const readyPct = g.total > 0 ? Math.round((g.readyCount / g.total) * 100) : 0;
    const notReadyCount = g.matched - g.readyCount;
    const isSelected = lpFlightFilter === g.key;

    // ETD block
    let etdHtml = '<div style="font-size:11px;color:var(--muted);margin-bottom:8px;height:18px">ไม่มีข้อมูลเวลาบิน</div>';
    if (g.flightTime) {
      const etdMs  = new Date(g.flightTime).getTime();
      const diffMs = etdMs - now;
      const diffH  = Math.floor(Math.abs(diffMs) / 3600000);
      const diffM  = Math.floor((Math.abs(diffMs) % 3600000) / 60000);
      const etdLbl = formatBangkok(g.flightTime);
      if (diffMs < 0) {
        etdHtml = `<div style="font-size:11px;color:#94a3b8;margin-bottom:8px">🛫 บินไปแล้ว · ${etdLbl}</div>`;
      } else if (diffH < 2) {
        etdHtml = `<div style="margin-bottom:8px;padding:5px 10px;background:#fef2f2;border-radius:8px;font-size:11px;font-weight:700;color:#ef4444;display:flex;align-items:center;gap:5px;animation:pulse 1.5s infinite">
          <i data-lucide="alarm-clock" style="width:11px;height:11px"></i> บินใน ${diffH}ชม.${diffM}น. &nbsp;·&nbsp; ${etdLbl}</div>`;
      } else if (diffH < 6) {
        etdHtml = `<div style="margin-bottom:8px;padding:5px 10px;background:#fffbeb;border-radius:8px;font-size:11px;font-weight:600;color:#d97706;display:flex;align-items:center;gap:5px">
          <i data-lucide="clock" style="width:11px;height:11px"></i> บินใน ${diffH}ชม.${diffM}น. &nbsp;·&nbsp; ${etdLbl}</div>`;
      } else {
        etdHtml = `<div style="margin-bottom:8px;padding:5px 10px;background:#f0fdf4;border-radius:8px;font-size:11px;color:#15803d;display:flex;align-items:center;gap:5px">
          <i data-lucide="clock" style="width:11px;height:11px"></i> ETD: ${etdLbl}</div>`;
      }
    }

    const isUrgent = g.flightTime && (new Date(g.flightTime).getTime() - now) < 7200000 && g.readyCount < g.total;
    const allReady = g.readyCount >= g.total && g.total > 0;
    const cardBorder = isSelected ? "2px solid #2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.15)"
      : isUrgent ? "1.5px solid #ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.1)"
      : "1.5px solid var(--line)";

    // Mini stacked bar: ready | inProgress | notMatched
    const inProgressCount = g.matched - g.readyCount;
    const rW = g.total > 0 ? Math.round((g.readyCount/g.total)*100) : 0;
    const iW = g.total > 0 ? Math.round((inProgressCount/g.total)*100) : 0;
    const nW = g.total > 0 ? Math.round((g.notMatchedCount/g.total)*100) : 0;

    return `<div onclick="lpFilterByFlight('${g.key}')" style="background:var(--surface);border:${cardBorder};border-radius:14px;padding:16px 18px;min-width:210px;flex:1;max-width:300px;cursor:pointer;transition:transform .15s,box-shadow .15s;${isSelected?'background:#eff6ff':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
        <div>
          <div style="display:flex;align-items:center;gap:6px">
            <i data-lucide="plane-takeoff" style="width:14px;height:14px;color:#0f766e;flex-shrink:0"></i>
            <span style="font-weight:800;font-size:15px;color:var(--ink)">${safeHtml(g.flight)}</span>
            ${g.dest ? `<span style="font-size:13px;color:var(--muted)">→ <b style="color:var(--ink)">${safeHtml(g.dest)}</b></span>` : ""}
          </div>
        </div>
        ${allReady
          ? `<span style="background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:99px;font-size:10px;font-weight:800;flex-shrink:0">✓ พร้อม</span>`
          : `<span style="background:${isUrgent?'#fef2f2':'#fef3c7'};color:${isUrgent?'#dc2626':'#d97706'};padding:3px 10px;border-radius:99px;font-size:10px;font-weight:800;flex-shrink:0">${g.readyCount}/${g.total} พร้อม</span>`}
      </div>

      <!-- ETD -->
      ${etdHtml}

      <!-- Stats -->
      <div style="display:flex;gap:0;margin-bottom:10px;background:#f8fafc;border-radius:10px;overflow:hidden">
        <div style="flex:1;padding:10px 12px;border-right:1px solid var(--line)">
          <div style="font-size:10px;color:var(--muted);margin-bottom:2px">รวม</div>
          <div style="font-size:22px;font-weight:800;color:var(--ink);line-height:1">${g.total}</div>
        </div>
        <div style="flex:1;padding:10px 12px;border-right:1px solid var(--line)">
          <div style="font-size:10px;color:var(--muted);margin-bottom:2px">พบ</div>
          <div style="font-size:22px;font-weight:800;color:#22c55e;line-height:1">${g.matched}</div>
        </div>
        <div style="flex:1;padding:10px 12px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:2px">พร้อมส่ง</div>
          <div style="font-size:22px;font-weight:800;color:#2563eb;line-height:1">${g.readyCount}</div>
        </div>
      </div>

      <!-- Stacked progress bar -->
      <div style="background:#f1f5f9;border-radius:99px;height:6px;overflow:hidden;display:flex;margin-bottom:5px">
        <div style="background:#22c55e;width:${rW}%;transition:width .4s"></div>
        <div style="background:#f59e0b;width:${iW}%;transition:width .4s"></div>
        <div style="background:#e2e8f0;width:${nW}%;transition:width .4s"></div>
      </div>
      <div style="display:flex;gap:10px;font-size:10px;color:var(--muted)">
        <span style="display:flex;align-items:center;gap:3px"><span style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block"></span>พร้อม ${rW}%</span>
        <span style="display:flex;align-items:center;gap:3px"><span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;display:inline-block"></span>กำลังดำเนินการ ${iW}%</span>
        ${nW > 0 ? `<span style="display:flex;align-items:center;gap:3px"><span style="width:7px;height:7px;border-radius:50%;background:#e2e8f0;display:inline-block"></span>ไม่พบ ${nW}%</span>` : ""}
      </div>

      ${isSelected ? `<div style="margin-top:10px;font-size:11px;color:#2563eb;font-weight:600;text-align:center">● กำลังแสดงเฉพาะ Flight นี้ &nbsp;<span style="opacity:.7">(คลิกอีกครั้งเพื่อยกเลิก)</span></div>` : `<div style="margin-top:10px;font-size:11px;color:var(--muted);text-align:center">คลิกเพื่อกรองตาราง</div>`}
    </div>`;
  }).join("");
  container.innerHTML = cards;
  if (window.lucide) lucide.createIcons();
  clearInterval(window._lpFlightTimer);
  window._lpFlightTimer = setInterval(() => renderLpFlightSummaryCards(lpCurrentPlan), 60000);
}

function updateLpFlightSelect() {
  const sel = document.getElementById("lpCtfFlightSel");
  if (!sel) return;
  const plan = lpCurrentPlan;
  if (!plan?.rows?.length) {
    sel.innerHTML = '<option value="">— ยังไม่มี Load Plan —</option>';
    const area = document.getElementById("lpCtfPreviewArea");
    if (area) area.innerHTML = '<div style="color:#6b7280;text-align:center;padding:80px 20px;font-size:14px">Import Load Plan CSV ก่อน</div>';
    return;
  }
  // Group by flight+dest
  const flights = new Map();
  for (const r of plan.rows) {
    const key = `${r.flightNumber||"—"}|${r.destination||""}`;
    if (!flights.has(key)) flights.set(key, { flight: r.flightNumber||"—", dest: r.destination||"", count: 0 });
    flights.get(key).count++;
  }
  const prev = sel.value;
  sel.innerHTML = '<option value="">— เลือกเที่ยวบิน —</option>' +
    Array.from(flights.entries()).map(([key, g]) =>
      `<option value="${key}">✈ ${g.flight}${g.dest?" → "+g.dest:""} (${g.count} งาน)</option>`
    ).join("");
  // Auto-select: restore previous or pick first
  if (prev && [...flights.keys()].includes(prev)) sel.value = prev;
  else if (flights.size > 0) sel.value = [...flights.keys()][0];
  renderLpCtfPreview();
}

function renderLpCtfPreview() {
  const area = document.getElementById("lpCtfPreviewArea");
  if (!area) return;
  const flightKey = document.getElementById("lpCtfFlightSel")?.value || "";
  const plan = lpCurrentPlan;
  if (!flightKey || !plan?.rows?.length) {
    area.innerHTML = '<div style="color:#6b7280;text-align:center;padding:80px 20px;font-size:14px">เลือกเที่ยวบินเพื่อดู Preview CTF</div>';
    return;
  }
  const [flightNum, dest] = flightKey.split("|");
  const rows = plan.rows.filter(r => (r.flightNumber||"—") === flightNum && (r.destination||"") === dest);
  const driver  = document.getElementById("lpCtfDriver")?.value  || "";
  const plate   = document.getElementById("lpCtfPlate")?.value   || "";
  const velType = document.getElementById("lpCtfVelType")?.value || "6 ล้อ";
  const tmo     = document.getElementById("lpCtfTmo")?.value     || "INTER";
  const html = buildCtfPreviewHtml({
    driver, plate, velType, tmo, relBy: "", unloadBy: "",
    rows: rows.map(r => ({
      houseNumber:  r.houseNumber,
      flightNumber: r.flightNumber || flightNum,
      customerName: r.customerName || "",
      destination:  r.destination  || dest || "",
      pieces:       r.pieces       || "",
      awbNumber:    r.awbNumber    || ""
    })),
    jobs: state.dashboard?.jobs || []
  });
  // Scale to fit ~400px wide panel
  area.innerHTML = `<div style="transform:scale(0.78);transform-origin:top center;width:128%;margin-left:-14%;pointer-events:none">${html}</div>`;
}

function printLpCtfPreview() {
  const area = document.getElementById("lpCtfPreviewArea");
  if (!area) return;
  const inner = area.querySelector("div");
  if (!inner) { toast("เลือกเที่ยวบินก่อนพิมพ์", "error"); return; }
  // Get un-scaled content
  const flightKey = document.getElementById("lpCtfFlightSel")?.value || "";
  if (!flightKey) { toast("เลือกเที่ยวบินก่อนพิมพ์", "error"); return; }
  const plan = lpCurrentPlan;
  const [flightNum, dest] = flightKey.split("|");
  const rows = (plan?.rows||[]).filter(r => (r.flightNumber||"—") === flightNum && (r.destination||"") === dest);
  const html = buildCtfPreviewHtml({
    driver:   document.getElementById("lpCtfDriver")?.value  || "",
    plate:    document.getElementById("lpCtfPlate")?.value   || "",
    velType:  document.getElementById("lpCtfVelType")?.value || "6 ล้อ",
    tmo:      document.getElementById("lpCtfTmo")?.value     || "INTER",
    relBy: "", unloadBy: "",
    rows: rows.map(r => ({
      houseNumber: r.houseNumber, flightNumber: r.flightNumber||flightNum,
      customerName: r.customerName||"", destination: r.destination||dest||"",
      pieces: r.pieces||"", awbNumber: r.awbNumber||""
    })),
    jobs: state.dashboard?.jobs || []
  });
  const win = window.open("", "_blank", "width=900,height=700");
  win.document.write(`<!DOCTYPE html><html><head><title>Cargo Transfer Form</title>
    <style>*{box-sizing:border-box}body{margin:0;padding:12px;font-family:Arial,sans-serif}@media print{body{padding:0}}</style>
    </head><body>${html}<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
  win.document.close();
}

// ── Load Plan row detail panel ──
function lpShowDetail(idx) {
  const plan = lpCurrentPlan;
  const q = (document.getElementById("lpTableSearch")?.value || "").toLowerCase();
  let rows = plan?.rows || [];
  if (q) rows = rows.filter(r =>
    (r.houseNumber||"").toLowerCase().includes(q) ||
    (r.flightNumber||"").toLowerCase().includes(q) ||
    (r.customerName||"").toLowerCase().includes(q) ||
    (r.destination||"").toLowerCase().includes(q)
  );
  const r = rows[idx];
  if (!r) return;

  // ETD countdown
  let etdBlock = "";
  if (r.flightTime) {
    const diff = new Date(r.flightTime).getTime() - Date.now();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const color = diff < 0 ? "#94a3b8" : diff < 7200000 ? "#ef4444" : diff < 21600000 ? "#f59e0b" : "#22c55e";
    const label = diff < 0 ? "บินแล้ว" : `บินใน ${h}ชม.${m}น.`;
    etdBlock = `<div style="margin-top:12px;padding:10px 14px;background:#f8fafc;border-radius:10px;border-left:3px solid ${color}">
      <div style="font-size:11px;color:var(--muted);margin-bottom:2px">เวลาบิน (ETD)</div>
      <div style="font-weight:700;color:${color};font-size:14px">${formatBangkok(r.flightTime)}</div>
      <div style="font-size:12px;color:${color}">${label}</div>
    </div>`;
  }

  const statusColor = {"Completed":"#22c55e","LoadingReady":"#2563eb","XRayPassed":"#8b5cf6","ReadyForTerminal":"#f59e0b","Stored":"#94a3b8","Inbound":"#64748b","Assigned":"#64748b","Pickup":"#f59e0b","Pending":"#94a3b8"}[r.jobStatus] || "#94a3b8";

  const html = `<div style="position:fixed;inset:0;z-index:9000;display:flex;justify-content:flex-end" onclick="if(event.target===this)this.remove()">
    <div style="width:380px;background:var(--surface);box-shadow:-4px 0 32px rgba(0,0,0,.15);overflow-y:auto;animation:slideInRight .2s ease">
      <!-- Header -->
      <div style="padding:20px 22px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--surface);z-index:1">
        <div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:3px">รายละเอียด House</div>
          <div style="font-size:18px;font-weight:800;font-family:monospace;color:var(--ink)">${safeHtml(r.houseNumber)}</div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:#f1f5f9;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:16px;color:var(--muted)">✕</button>
      </div>

      <div style="padding:20px 22px">
        <!-- Match status -->
        <div style="margin-bottom:16px">
          ${r.matched
            ? `<span style="background:#dcfce7;color:#15803d;padding:5px 14px;border-radius:99px;font-size:12px;font-weight:700">✓ พบใน System</span>`
            : `<span style="background:#fee2e2;color:#dc2626;padding:5px 14px;border-radius:99px;font-size:12px;font-weight:700">✗ ไม่พบใน System</span>`
          }
        </div>

        <!-- Flight + ETD -->
        <div style="margin-bottom:16px;padding:14px;background:#f0fdfa;border-radius:12px;border:1px solid #99f6e4">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <i data-lucide="plane-takeoff" style="width:16px;height:16px;color:#0f766e"></i>
            <span style="font-weight:800;font-size:15px;color:#0f766e">${safeHtml(r.flightNumber||"—")}</span>
            ${r.destination ? `<span style="font-size:13px;color:#0f766e">→ ${safeHtml(r.destination)}</span>` : ""}
          </div>
          ${etdBlock}
        </div>

        <!-- Info Grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div style="padding:12px;background:#f8fafc;border-radius:10px">
            <div style="font-size:10px;color:var(--muted);margin-bottom:4px">ลูกค้า</div>
            <div style="font-size:13px;font-weight:600;color:var(--ink)">${safeHtml(r.customerName||"—")}</div>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:10px">
            <div style="font-size:10px;color:var(--muted);margin-bottom:4px">สถานะงาน</div>
            <div style="font-size:13px;font-weight:700;color:${statusColor}">${safeHtml(r.jobStatus||"ไม่พบ")}</div>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:10px">
            <div style="font-size:10px;color:var(--muted);margin-bottom:4px">WH Location</div>
            <div style="font-size:13px;font-weight:700;color:#1d4ed8">${safeHtml(r.warehouseLocation||"—")}</div>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:10px">
            <div style="font-size:10px;color:var(--muted);margin-bottom:4px">Zone</div>
            <div style="font-size:13px;font-weight:600;color:var(--ink)">${safeHtml(r.zoneId||"—")}</div>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:10px">
            <div style="font-size:10px;color:var(--muted);margin-bottom:4px">จำนวน (PCS)</div>
            <div style="font-size:13px;font-weight:700;color:var(--ink)">${r.pieces||"—"}</div>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:10px">
            <div style="font-size:10px;color:var(--muted);margin-bottom:4px">น้ำหนัก (KG)</div>
            <div style="font-size:13px;font-weight:700;color:var(--ink)">${r.weight||"—"}</div>
          </div>
        </div>

        ${r.awbNumber ? `<div style="padding:12px 14px;background:#eff6ff;border-radius:10px;margin-bottom:16px">
          <div style="font-size:10px;color:#2563eb;margin-bottom:2px">AWB Number</div>
          <div style="font-size:14px;font-weight:700;font-family:monospace;color:#1d4ed8">${safeHtml(r.awbNumber)}</div>
        </div>` : ""}

        <!-- Action buttons -->
        ${r.matched ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="setView('orders');setTimeout(()=>{ const s=document.getElementById('searchInput');if(s){s.value='${safeHtml(r.houseNumber)}';s.dispatchEvent(new Event('input'));}},300);this.closest('[style*=fixed]').remove()" 
            style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">
            <i data-lucide="external-link" style="width:13px;height:13px"></i> เปิดใบงาน
          </button>
        </div>` : `<div style="padding:12px;background:#fef2f2;border-radius:10px;font-size:12px;color:#dc2626;text-align:center">
          ⚠ House นี้ยังไม่มีใน System — กรุณาสร้างใบงานก่อน
        </div>`}
      </div>
    </div>
  </div>`;

  const overlay = document.createElement("div");
  overlay.innerHTML = html;
  document.body.appendChild(overlay.firstElementChild);
  if (window.lucide) lucide.createIcons();
}

// ══════════════════════════════════════════════════════
// OUTBOUND OPEN PAGE (เปิดใบขาออก)
// ══════════════════════════════════════════════════════
const obOpenState = {
  zoom: 0.78,
  flightKey: null,
  mode: "import"   // "import" | "create"
};

async function renderObOpenPage() {
  obOpenRenderHistory();
  // Load current plan
  try {
    const data = await api("/api/loadplan/latest", null, "GET");
    lpCurrentPlan = data.latest;
    if (lpCurrentPlan?.rows?.length) {
      obOpenRenderFlightGroups();
    }
  } catch(e) { console.warn("renderObOpenPage:", e); }
}

function obOpenRenderFlightGroups() {
  const plan = lpCurrentPlan;
  const sec = document.getElementById("obOpenFlightSection");
  const list = document.getElementById("obOpenGroupList");
  if (!sec || !list) return;
  if (!plan?.rows?.length) { sec.hidden = true; return; }
  sec.hidden = false;

  // Group by flight+dest
  const flights = new Map();
  for (const r of plan.rows) {
    const key = `${r.flightNumber||"—"}|${r.destination||""}`;
    if (!flights.has(key)) flights.set(key, { flight: r.flightNumber||"—", dest: r.destination||"", rows: [] });
    flights.get(key).rows.push(r);
  }

  list.innerHTML = Array.from(flights.entries()).map(([key, g]) => {
    const isActive = obOpenState.flightKey === key;
    const custs = [...new Set(g.rows.map(r=>r.customerName).filter(Boolean))].slice(0,3).join(" / ") || "—";
    return `<button type="button" onclick="obOpenSelectFlight('${key.replace(/'/g,"\'")}',this)"
      style="width:100%;text-align:left;padding:10px 13px;border:1.5px solid ${isActive?"#0f766e":"#e2e8f0"};border-radius:10px;background:${isActive?"#f0fdf4":"#fff"};cursor:pointer;transition:all .15s"
      onmouseover="if(!this.classList.contains('ob-active'))this.style.borderColor='#94a3b8'"
      onmouseout="if(!this.classList.contains('ob-active'))this.style.borderColor='#e2e8f0'"
      ${isActive?'class="ob-active"':''}>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span style="font-weight:800;font-size:13px;color:#0f766e">✈ ${g.flight}${g.dest?" → "+g.dest:""}</span>
        <span style="background:#f0fdf4;color:#166534;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px">${g.rows.length} งาน</span>
      </div>
      <div style="font-size:11px;color:#475569">${custs}</div>
    </button>`;
  }).join("");

  // Auto-select first if none selected
  if (!obOpenState.flightKey && flights.size > 0) {
    const firstKey = [...flights.keys()][0];
    obOpenState.flightKey = firstKey;
    obOpenUpdatePreview();
    list.querySelector("button")?.classList.add("ob-active");
  }
}

function obOpenSelectFlight(key, btn) {
  obOpenState.flightKey = key;
  // Highlight
  document.querySelectorAll("#obOpenGroupList button").forEach(b => {
    b.style.borderColor = "#e2e8f0";
    b.style.background = "#fff";
    b.classList.remove("ob-active");
  });
  if (btn) { btn.style.borderColor = "#0f766e"; btn.style.background = "#f0fdf4"; btn.classList.add("ob-active"); }
  obOpenUpdatePreview();
}

function obOpenUpdatePreview() {
  const area = document.getElementById("obOpenCtfArea");
  if (!area) return;
  const mode = obOpenState.mode;

  let rows = [];
  let driver = "", plate = "", velType = "6 ล้อ", tmo = "INTER", relBy = "", unloadBy = "";

  if (mode === "import") {
    const plan = lpCurrentPlan;
    const key = obOpenState.flightKey;
    if (!key || !plan?.rows?.length) {
      area.innerHTML = '<div class="empty-state">เลือก Flight Group เพื่อดู Preview ใบ CTF</div>';
      return;
    }
    const [flightNum, dest] = key.split("|");
    const planRows = plan.rows.filter(r => (r.flightNumber||"—") === flightNum && (r.destination||"") === dest);
    rows = planRows.map(r => ({
      houseNumber: r.houseNumber, flightNumber: r.flightNumber||flightNum,
      customerName: r.customerName||"", destination: r.destination||dest||"",
      pieces: r.pieces||"", awbNumber: r.awbNumber||""
    }));
    driver   = document.getElementById("obOpenDriver")?.value   || "";
    plate    = document.getElementById("obOpenPlate")?.value    || "";
    velType  = document.getElementById("obOpenVelType")?.value  || "6 ล้อ";
    tmo      = document.getElementById("obOpenTmo")?.value      || "INTER";
    relBy    = document.getElementById("obOpenRelBy")?.value    || "";
    unloadBy = document.getElementById("obOpenUnloadBy")?.value || "";
  } else {
    // Manual create mode
    const houses = (document.getElementById("obCreateHouses")?.value || "").split(/\n/).map(s=>s.trim()).filter(Boolean);
    const flight = document.getElementById("obCreateFlight")?.value || "";
    const dest   = document.getElementById("obCreateDest")?.value   || "";
    if (!houses.length) {
      area.innerHTML = '<div class="empty-state">กรอก House Numbers เพื่อดู Preview CTF</div>';
      return;
    }
    rows = houses.map(h => ({ houseNumber: h, flightNumber: flight, customerName: "", destination: dest, pieces: "", awbNumber: "" }));
    driver   = document.getElementById("obCreateDriver")?.value  || "";
    plate    = document.getElementById("obCreatePlate")?.value   || "";
    velType  = document.getElementById("obCreateVelType")?.value || "6 ล้อ";
    tmo      = document.getElementById("obCreateTmo")?.value     || "INTER";
  }

  const html = buildCtfPreviewHtml({ driver, plate, velType, tmo, relBy, unloadBy, rows, jobs: state.dashboard?.jobs || [] });
  const z = obOpenState.zoom;
  const w = Math.round(100 / z);
  const ml = Math.round((100 - w) / 2);
  area.innerHTML = `<div style="transform:scale(${z});transform-origin:top center;width:${w}%;margin-left:${ml}%;pointer-events:none">${html}</div>`;
}

function obOpenZoom(dir) {
  const cur = obOpenState.zoom;
  if (dir === "out") obOpenState.zoom = Math.max(0.45, +(cur - 0.07).toFixed(2));
  else if (dir === "in") obOpenState.zoom = Math.min(1.4, +(cur + 0.07).toFixed(2));
  else obOpenState.zoom = 0.78; // fit
  const pctEl = document.getElementById("obOpenZoomPct");
  if (pctEl) pctEl.textContent = Math.round(obOpenState.zoom * 100) + "%";
  obOpenUpdatePreview();
}

function obOpenPrint() {
  const mode = obOpenState.mode;
  let rows = [], driver = "", plate = "", velType = "6 ล้อ", tmo = "INTER", relBy = "", unloadBy = "";
  if (mode === "import") {
    const plan = lpCurrentPlan;
    const key = obOpenState.flightKey;
    if (!key || !plan?.rows?.length) { toast("เลือก Flight Group ก่อนพิมพ์", "error"); return; }
    const [flightNum, dest] = key.split("|");
    rows = plan.rows.filter(r => (r.flightNumber||"—") === flightNum && (r.destination||"") === dest)
      .map(r => ({ houseNumber: r.houseNumber, flightNumber: r.flightNumber||flightNum, customerName: r.customerName||"", destination: r.destination||dest||"", pieces: r.pieces||"", awbNumber: r.awbNumber||"" }));
    driver   = document.getElementById("obOpenDriver")?.value   || "";
    plate    = document.getElementById("obOpenPlate")?.value    || "";
    velType  = document.getElementById("obOpenVelType")?.value  || "6 ล้อ";
    tmo      = document.getElementById("obOpenTmo")?.value      || "INTER";
    relBy    = document.getElementById("obOpenRelBy")?.value    || "";
    unloadBy = document.getElementById("obOpenUnloadBy")?.value || "";
  } else {
    const houses = (document.getElementById("obCreateHouses")?.value||"").split(/\n/).map(s=>s.trim()).filter(Boolean);
    if (!houses.length) { toast("กรอก House Numbers ก่อนพิมพ์", "error"); return; }
    const flight = document.getElementById("obCreateFlight")?.value || "";
    const dest   = document.getElementById("obCreateDest")?.value   || "";
    rows = houses.map(h => ({ houseNumber: h, flightNumber: flight, customerName: "", destination: dest, pieces: "", awbNumber: "" }));
    driver   = document.getElementById("obCreateDriver")?.value  || "";
    plate    = document.getElementById("obCreatePlate")?.value   || "";
    velType  = document.getElementById("obCreateVelType")?.value || "6 ล้อ";
    tmo      = document.getElementById("obCreateTmo")?.value     || "INTER";
  }
  const html = buildCtfPreviewHtml({ driver, plate, velType, tmo, relBy, unloadBy, rows, jobs: state.dashboard?.jobs || [] });
  const win = window.open("", "_blank", "width=900,height=700");
  win.document.write(`<!DOCTYPE html><html><head><title>Cargo Transfer Form</title>
    <style>*{box-sizing:border-box}body{margin:0;padding:10px;font-family:Arial,sans-serif}@media print{body{padding:0}}</style>
    </head><body>${html}<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
  win.document.close();
}

async function obOpenRenderHistory() {
  try {
    const data = await api("/api/loadplan/history", null, "GET");
    const el = document.getElementById("obOpenHistory");
    if (!el) return;
    if (!data.plans?.length) { el.innerHTML = '<span style="font-size:12px;color:var(--muted)">ยังไม่มีประวัติ</span>'; return; }
    el.innerHTML = data.plans.slice(0,5).map(p => {
      const dt = formatBangkok(p.importedAt).replace(/:\d\d$/, "");
      const chClass = p.hasChanges ? "background:#fef3c7;border-color:#f59e0b;color:#92400e" : "background:#f0fdf4;border-color:#86efac;color:#15803d";
      return `<div style="padding:6px 12px;border-radius:8px;border:1px solid;font-size:11px;${chClass}">
        ${dt} · ${p.totalRows} รายการ${p.hasChanges?` · ⚠ เปลี่ยน+${p.added}/-${p.removed}`:" · ✓"}
      </div>`;
    }).join("");
  } catch(e) {}
}

async function renderLpHistory() {
  try {
    const data = await api("/api/loadplan/history", null, "GET");
    const el = document.getElementById("lpHistoryList");
    if (!el) return;
    if (!data.plans?.length) { el.innerHTML = `<span style="font-size:12px;color:var(--muted)">ยังไม่มีประวัติ</span>`; return; }
    el.innerHTML = data.plans.slice(0,8).map(p => {
      const dt = formatBangkok(p.importedAt).replace(/:\d\d$/, "");
      const chClass = p.hasChanges ? "background:#fef3c7;border-color:#f59e0b;color:#92400e" : "background:#f0fdf4;border-color:#86efac;color:#15803d";
      return `<div style="padding:6px 12px;border-radius:8px;border:1px solid;font-size:11px;cursor:pointer;${chClass}" title="${p.totalRows} รายการ, match ${p.matchedCount}">
        ${dt} · ${p.totalRows} รายการ${p.hasChanges?` · ⚠ เปลี่ยน+${p.added}/-${p.removed}`:" · ✓"}
      </div>`;
    }).join("");
  } catch(e) {}
}

async function lpImportCsv(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const csvText = e.target.result;
    try {
      toast("กำลัง import...", "info");
      const res = await api("/api/loadplan/import", { csvText, importedBy: state.user?.id });
      if (res.ok) {
        const msg = res.changed
          ? `Import สำเร็จ — มีการเปลี่ยนแปลง: +${res.added} เพิ่ม, -${res.removed} ลบ`
          : `Import สำเร็จ — ${res.plan.totalRows} รายการ, ไม่มีการเปลี่ยนแปลง`;
        toast(msg, res.changed ? "warning" : "success");
        renderLoadPlan();
      }
    } catch(err) { toast(err.message, "error"); }
  };
  reader.readAsText(file, "utf-8");
}

function updateWhZonePreview() {
  const r = parseInt(document.getElementById("whZoneRows")?.value) || 5;
  const c = parseInt(document.getElementById("whZoneCols")?.value) || 10;
  const l = parseInt(document.getElementById("whZoneLevels")?.value) || 2;
  const total = r * c * l;
  const el = document.getElementById("whZonePreviewText");
  if (el) el.innerHTML = `จะสร้าง <b>${total.toLocaleString()}</b> ช่องเก็บสินค้า (${r} แถว × ${c} คอลัมน์ × ${l} ชั้น)`;
}


async function seedWh3SketchZones() {
  // Seed WH3 zones matching the sketch: Zone A/B/C (3 cols each) + Rack rows 1-5 (10 cols each)
  const zones = [
    { name: "Zone A", prefix: "A", rows: 1, cols: 3, color: "#fecaca", gridCol: 0, gridRow: 0 },
    { name: "Zone B", prefix: "B", rows: 1, cols: 3, color: "#fed7aa", gridCol: 0, gridRow: 1 },
    { name: "Zone C", prefix: "C", rows: 1, cols: 3, color: "#fef08a", gridCol: 0, gridRow: 2 },
    { name: "Rack Row 1", prefix: "1", rows: 1, cols: 10, color: "#bfdbfe", gridCol: 2, gridRow: 0 },
    { name: "Rack Row 2", prefix: "2", rows: 1, cols: 10, color: "#bfdbfe", gridCol: 2, gridRow: 1 },
    { name: "Rack Row 3", prefix: "3", rows: 1, cols: 10, color: "#bfdbfe", gridCol: 2, gridRow: 2 },
    { name: "Rack Row 4", prefix: "4", rows: 1, cols: 10, color: "#bfdbfe", gridCol: 2, gridRow: 3 },
    { name: "Rack Row 5", prefix: "5", rows: 1, cols: 10, color: "#bfdbfe", gridCol: 2, gridRow: 4 }
  ];
  for (const zone of zones) {
    try {
      await api("/api/warehouse/zone/create", { ...zone, defaultLevels: 1, userId: state.user?.id || "system" });
    } catch(e) { /* skip if prefix already exists */ }
  }
  // Also add overlays for Office and Entrance via canvas positions
  try {
    await api("/api/warehouse/overlay/create", { type: "office", label: "Office", color: "#e0f2fe", canvasX: 20, canvasY: 30 });
    await api("/api/warehouse/overlay/create", { type: "door",   label: "ทางเข้า WH3", color: "#fef9c3", canvasX: 320, canvasY: 10 });
    await api("/api/warehouse/overlay/create", { type: "aisle",  label: "ทางเดิน",      color: "#f1f5f9", canvasX: 270, canvasY: 50, ovW: 40, ovH: 400 });
  } catch(e) {}
  toast("สร้างแผนที่ WH3 จากแบบร่างแล้ว ✓");
}


// ─────────────────────────────────────────────────────────────────────────────
// Zone Capacity Dashboard (wh-status view)
// ─────────────────────────────────────────────────────────────────────────────
async function renderWarehouseStatus() {
  const container = document.querySelector("#view-wh-status");
  if (!container) return;

  // Load both capacity AND map data in parallel
  let zonesData = [], config = { palletToBoxRatio: 10 };
  try {
    const [capRes, cfgRes] = await Promise.all([
      fetch(API_BASE + "/api/warehouse/zones/capacity"),
      fetch(API_BASE + "/api/warehouse/config")
    ]);
    zonesData = (await capRes.json()).zones || [];
    config = (await cfgRes.json()).config || { palletToBoxRatio: 10 };
  } catch(e) {
    container.innerHTML = `<div style="padding:20px;color:var(--danger)">โหลดข้อมูลล้มเหลว: ${e.message}</div>`;
    return;
  }
  // Also ensure map state is loaded
  if (!whMapState.zones?.length) await loadWarehouseMap();

  const isAdmin = state.currentRole === "Admin";
  const ratio   = config.palletToBoxRatio || 10;

  // ── Stats bar ──────────────────────────────────────────────────────────────
  const statsHtml = `
    <div class="wh-status-header">
      <div class="wh-stat-card">
        <i data-lucide="warehouse"></i>
        <div><div class="wh-stat-num">${zonesData.length}</div><small>โซน</small></div>
      </div>
      <div class="wh-stat-card">
        <i data-lucide="layers"></i>
        <div><div class="wh-stat-num">${zonesData.reduce((s,z)=>s+z.usedPallets,0)}</div><small>พาเลทในคลัง</small></div>
      </div>
      <div class="wh-stat-card">
        <i data-lucide="package"></i>
        <div><div class="wh-stat-num">${zonesData.reduce((s,z)=>s+z.usedBoxes,0)}</div><small>กล่องในคลัง</small></div>
      </div>
      <div class="wh-stat-card ${whMapState.locations?.filter(l=>l.occupiedBy?.length===0).length > 0 ? "free" : ""}">
        <i data-lucide="layout-grid"></i>
        <div>
          <div class="wh-stat-num">${whMapState.locations?.filter(l=>l.occupiedBy?.length===0).length || 0}</div>
          <small>ช่องว่าง</small>
        </div>
      </div>
    </div>`;

  // ── Tab toolbar ────────────────────────────────────────────────────────────
  const toolbarHtml = `
    <div class="whs-tabs">
      <button class="whs-tab active" id="whsTabMap" onclick="whsShowTab('map')">
        <i data-lucide="map" style="width:14px"></i> แผนที่คลัง
      </button>
      <button class="whs-tab" id="whsTabCap" onclick="whsShowTab('cap')">
        <i data-lucide="layers" style="width:14px"></i> ความจุโซน
      </button>
      <div style="flex:1"></div>
      <button class="btn btn-sm" onclick="renderWarehouseStatus()" style="margin-left:8px">
        <i data-lucide="refresh-cw" style="width:13px"></i> รีเฟรช
      </button>
      ${isAdmin ? `
        <button class="btn btn-sm btn-outline" onclick="openZoneCapTable()">
          <i data-lucide="table-2" style="width:13px"></i> ตั้งค่าความจุ
        </button>
        <button class="btn btn-sm btn-outline" onclick="openZoneRatioModal(${ratio})">⚙️ อัตราส่วน</button>
      ` : ""}
    </div>`;

  // ── MAP VIEW ───────────────────────────────────────────────────────────────
  const WH_OVERLAY_ICONS = { door:"log-in", aisle:"footprints", office:"building-2", pillar:"square", wall:"minus", label:"tag" };
  const overlays   = whMapState.overlays || [];
  const mapZones   = whMapState.zones || [];
  const mapLocs    = whMapState.locations || [];

  const zoneBlocks = mapZones.map(zone => {
    const locs = mapLocs.filter(l => l.zoneId === zone.id);
    const x = zone.canvasX ?? 20;
    const y = zone.canvasY ?? 20;
    const cap = whCapData[zone.id];
    const capLight = cap?.trafficLight || "green";
    const lightDot = { green:"#22c55e", yellow:"#f59e0b", red:"#ef4444" }[capLight] || "#22c55e";
    const lightBg  = { green:"#dcfce7", yellow:"#fef9c3", red:"#fee2e2" }[capLight] || "#dcfce7";
    const capFill  = cap?.fillPct || 0;
    const palletTxt = cap
      ? (cap.maxPallets ? `${cap.usedPallets}/${cap.maxPallets}P` : (cap.usedPallets ? `${cap.usedPallets}P` : ""))
      : "";

    const cells = Array.from({length: zone.rows}, (_, r) =>
      Array.from({length: zone.cols}, (_, c) => {
        const loc = locs.find(l => l.row === r && l.col === c);
        if (!loc) return `<div class="whs-cell empty"></div>`;
        const occ = loc.occupiedBy?.length || 0;
        const max = loc.maxLevels || 1;
        const cls = occ === 0 ? "free" : occ >= max ? "full" : "partial";
        const houses = (loc.occupiedBy || []).map(o => o.houseNumber || o).join(", ");
        const houseShort = occ > 0
          ? `<span class="whs-cell-hn">${(loc.occupiedBy[0]?.houseNumber||"").slice(-4)}</span>`
          : "";
        return `<div class="whs-cell ${cls}" title="${loc.code}: ${houses || 'ว่าง'}"
          onclick="whsShowLocDetail('${loc.id}','${loc.code}','${houses.replace(/'/g,"\\'")}',${occ},${max})">
          <span class="whs-cell-code">${loc.code}</span>
          ${houseShort}
        </div>`;
      }).join("")
    ).map(row => `<div class="whs-row">${row}</div>`).join("");

    const capFillEl = capFill > 0
      ? `<div style="position:absolute;bottom:0;left:0;right:0;height:${capFill}%;background:${lightBg};pointer-events:none;z-index:0;transition:height .4s"></div>`
      : "";

    return `<div class="whs-zone-block" style="position:absolute;left:${x}px;top:${y}px;border-color:${zone.color};background:${zone.color}18;overflow:hidden">
      ${capFillEl}
      <div class="whs-zone-head" style="position:relative;z-index:1">
        <span class="whs-zone-name">${safeHtml(zone.name)}</span>
        ${palletTxt ? `<span class="whs-cap-pill" style="background:${lightBg};color:${lightDot}">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${lightDot};margin-right:3px;vertical-align:middle"></span>${palletTxt}
        </span>` : ""}
      </div>
      <div class="whs-cells" style="position:relative;z-index:1">${cells}</div>
    </div>`;
  }).join("");

  const overlayBlocks = overlays.filter(o => o.type !== "rowbreak").map(o => {
    const x = o.canvasX ?? 20, y = o.canvasY ?? 20;
    const w = o.ovW || 100, h = o.ovH || 100;
    const icon = WH_OVERLAY_ICONS[o.type] || "square";
    return `<div class="whs-overlay whs-overlay-${o.type}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${o.color}">
      <i data-lucide="${icon}" style="width:18px;height:18px;opacity:.6"></i>
      <span class="whs-overlay-label">${safeHtml(o.label)}</span>
    </div>`;
  }).join("");

  // Compute canvas size
  const allX = [...mapZones.map(z=>(z.canvasX??20)+500), ...overlays.map(o=>(o.canvasX??20)+(o.ovW||100)+20)];
  const allY = [...mapZones.map(z=>(z.canvasY??20)+400), ...overlays.map(o=>(o.canvasY??20)+(o.ovH||100)+20)];
  const canvasW = Math.max(800, ...allX);
  const canvasH = Math.max(400, ...allY);

  const legendHtml = `
    <div class="whs-legend">
      <span class="whs-legend-item"><span class="whs-legend-dot free"></span>ว่าง</span>
      <span class="whs-legend-item"><span class="whs-legend-dot partial"></span>บางส่วน</span>
      <span class="whs-legend-item"><span class="whs-legend-dot full"></span>เต็ม</span>
    </div>`;

  const mapViewHtml = `
    <div class="whs-map-wrap" id="whsMapWrap">
      ${legendHtml}
      <div class="whs-canvas" style="min-width:${canvasW}px;min-height:${canvasH}px;position:relative">
        ${zoneBlocks}${overlayBlocks}
      </div>
    </div>`;

  // ── CAPACITY VIEW ──────────────────────────────────────────────────────────
  const lightColors = { green:"#dcfce7", yellow:"#fef9c3", red:"#fee2e2" };
  const darkColors  = { green:"#16a34a", yellow:"#ca8a04", red:"#dc2626"  };

  const capBlocks = zonesData.map(z => {
    const light = z.trafficLight || "green";
    const fillPct = z.fillPct || 0;
    const palletText = z.maxPallets ? `${z.usedPallets} / ${z.maxPallets} พาเลท` : `${z.usedPallets} พาเลท`;
    const boxText    = z.maxBoxes   ? `${z.usedBoxes} / ${z.maxBoxes} กล่อง`     : (z.usedBoxes ? `${z.usedBoxes} กล่อง` : "");
    const tags = z.houses.slice(0, 8).map(h =>
      `<span class="zcb-tag">${h.houseNumber}${h.pallets||h.boxes ? ` (${h.pallets||0}P ${h.boxes||0}B)` : ""}</span>`
    ).join("") + (z.houses.length > 8 ? `<span class="zcb-tag-more">+${z.houses.length-8}</span>` : "");
    const editBtn = isAdmin
      ? `<button class="zcb-edit" onclick="openZoneCapModal('${z.id}','${z.name.replace(/'/g,"\\'")}',${z.maxPallets},${z.maxBoxes})">✏️</button>`
      : "";
    return `
      <div class="zcb" style="--zone-color:${z.color||"#dbeafe"};--fill:${fillPct}%;--light-bg:${lightColors[light]};--dark-c:${darkColors[light]}">
        <div class="zcb-fill"></div>
        <div class="zcb-inner">
          <div class="zcb-head">
            <span class="zcb-name">${z.name}</span>
            <span class="zcb-traffic" style="background:${darkColors[light]}" title="${fillPct}% เต็ม"></span>
            ${editBtn}
          </div>
          <div class="zcb-nums">
            <div class="zcb-num-row"><span class="zcb-icon">🟫</span><span class="zcb-big">${palletText}</span></div>
            ${boxText ? `<div class="zcb-num-row"><span class="zcb-icon">📦</span><span class="zcb-big">${boxText}</span></div>` : ""}
          </div>
          <div class="zcb-tags">${tags || "<span style='color:var(--muted);font-size:12px'>ว่าง</span>"}</div>
          <div class="zcb-foot">
            <span>${z.houseCount} รายการ · ${fillPct}% เต็ม</span>
            <button class="zcb-map-btn" onclick="whsShowTab('map')" title="ดูในแผนที่คลัง">🗺 แผนที่</button>
          </div>
        </div>
      </div>`;
  }).join("");

  const capViewHtml = `<div class="zcb-grid" id="whsCapView">
    ${zonesData.length ? capBlocks : "<div style='padding:40px;text-align:center;color:var(--muted)'>ยังไม่มีโซน</div>"}
  </div>`;

  // ── Render everything ──────────────────────────────────────────────────────
  // Empty state when no warehouse zones set up yet
  const noZonesHtml = (!mapZones.length && !zonesData.length) ? `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;text-align:center">
      <i data-lucide="warehouse" style="width:48px;height:48px;color:#94a3b8"></i>
      <div style="font-size:18px;font-weight:700;color:var(--ink)">ยังไม่มีโซนคลัง</div>
      <div style="font-size:13px;color:var(--muted);max-width:320px">ไปที่ <b>แผนที่คลัง</b> เพื่อสร้างโซนและช่องจัดเก็บก่อน แล้วค่อยกลับมาดูสถานะที่หน้านี้</div>
      <button onclick="setView('warehouse')" style="padding:10px 20px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px">
        <i data-lucide="map" style="width:14px;height:14px"></i> ไปที่แผนที่คลัง →
      </button>
    </div>` : "";

  container.innerHTML = `
    <div class="wh-status-layout" style="padding:20px;display:flex;flex-direction:column;gap:16px;min-height:calc(100vh - 120px)">
      ${statsHtml}
      ${noZonesHtml || (toolbarHtml + `
      <div id="whsMapPanel" style="min-height:520px;display:flex;flex-direction:column">${mapViewHtml}</div>
      <div id="whsCapPanel" style="display:none">${capViewHtml}</div>`)}
    </div>`;

  lucide.createIcons();
}

// Tab switcher for wh-status
function whsShowTab(tab) {
  document.getElementById("whsMapPanel").style.display = tab === "map" ? "flex" : "none";
  document.getElementById("whsCapPanel").style.display = tab === "cap" ? "" : "none";
  document.getElementById("whsTabMap")?.classList.toggle("active", tab === "map");
  document.getElementById("whsTabCap")?.classList.toggle("active", tab === "cap");
  document.getElementById("whsCapPanel").style.flexDirection = "column";
}

// Location detail popup
function whsShowLocDetail(locId, code, houses, occ, max) {
  const existing = document.getElementById("whsLocPopup");
  if (existing) existing.remove();
  const popup = document.createElement("div");
  popup.id = "whsLocPopup";
  popup.className = "modal-overlay show";
  const houseList = houses
    ? houses.split(", ").map(h => `<div class="wh-house-tag">${h}</div>`).join("")
    : `<p style="color:var(--muted);font-size:13px">ช่องนี้ว่างอยู่</p>`;
  popup.innerHTML = `
    <div class="modal-box" style="max-width:360px">
      <div class="modal-header">
        <span>📍 ${code}</span>
        <button class="modal-close" onclick="document.getElementById('whsLocPopup').remove()">✕</button>
      </div>
      <div class="modal-body" style="padding:16px 20px">
        <p style="font-size:12px;color:var(--muted);margin:0 0 10px">ใช้ ${occ}/${max} ระดับ</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${houseList}</div>
      </div>
    </div>`;
  popup.addEventListener("click", e => { if (e.target === popup) popup.remove(); });
  document.body.appendChild(popup);
}


function openZoneCapModal(zoneId, zoneName, maxPallets, maxBoxes) {
  const existing = document.getElementById("zoneCapModal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "zoneCapModal";
  modal.className = "modal-overlay show";
  modal.innerHTML = `
    <div class="modal-box" style="max-width:400px">
      <div class="modal-header">
        <span>ตั้งค่าความจุโซน: ${zoneName}</span>
        <button class="modal-close" onclick="document.getElementById('zoneCapModal').remove()">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;padding:20px">
        <label style="font-size:13px;font-weight:600">จำนวนพาเลทสูงสุด
          <input id="zcMaxPallets" type="number" min="0" value="${maxPallets}" class="form-input" style="margin-top:4px">
          <small style="color:var(--muted)">ใส่ 0 = ไม่จำกัด</small>
        </label>
        <label style="font-size:13px;font-weight:600">จำนวนกล่องสูงสุด
          <input id="zcMaxBoxes" type="number" min="0" value="${maxBoxes}" class="form-input" style="margin-top:4px">
          <small style="color:var(--muted)">ใส่ 0 = ไม่จำกัด</small>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="saveZoneCapacity('${zoneId}')">บันทึก</button>
        <button class="btn btn-outline" onclick="document.getElementById('zoneCapModal').remove()">ยกเลิก</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function saveZoneCapacity(zoneId) {
  const maxPallets = parseInt(document.getElementById("zcMaxPallets")?.value) || 0;
  const maxBoxes = parseInt(document.getElementById("zcMaxBoxes")?.value) || 0;
  try {
    await api("/api/warehouse/zone/update", { zoneId, maxPallets, maxBoxes, userId: state.currentUserId });
    document.getElementById("zoneCapModal")?.remove();
    toast("บันทึกความจุโซนแล้ว ✓");
    renderWarehouseStatus();
  } catch(e) { toast("Error: " + e.message, "error"); }
}

function openZoneRatioModal(currentRatio) {
  const existing = document.getElementById("zoneRatioModal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "zoneRatioModal";
  modal.className = "modal-overlay show";
  modal.innerHTML = `
    <div class="modal-box" style="max-width:360px">
      <div class="modal-header">
        <span>ตั้งค่าอัตราส่วนพาเลท/กล่อง</span>
        <button class="modal-close" onclick="document.getElementById('zoneRatioModal').remove()">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <p style="font-size:13px;color:var(--muted);margin:0">1 พาเลท มีกี่กล่อง? (ใช้คำนวณ % ความจุรวม)</p>
        <input id="zrRatio" type="number" min="1" value="${currentRatio}" class="form-input">
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="saveZoneRatio()">บันทึก</button>
        <button class="btn btn-outline" onclick="document.getElementById('zoneRatioModal').remove()">ยกเลิก</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function saveZoneRatio() {
  const ratio = parseInt(document.getElementById("zrRatio")?.value) || 10;
  try {
    await api("/api/warehouse/config", { palletToBoxRatio: ratio });
    document.getElementById("zoneRatioModal")?.remove();
    toast("บันทึกอัตราส่วนแล้ว ✓");
    renderWarehouseStatus();
  } catch(e) { toast("Error: " + e.message, "error"); }
}

function renderWarehouseMap(forceEditor = false) {
  Promise.all([loadWarehouseMap(), loadWhProfiles()]).then(async () => {
    // Auto-seed WH3 sketch on first run (if no zones and no profiles)
    if (!whMapState.zones?.length && !whProfiles?.length) {
      await seedWh3SketchZones();
      await loadWarehouseMap();
    }
    if (!forceEditor && whMapState.zones && whMapState.zones.length > 0) {
      collapseWhEditorToCard();
    } else {
      renderWhZoneGrid();
      updateWhZoneListWithReorder();
      renderWhOverlayList();
      updateWhMapStats();
      loadWhLog();
    }
  });
}

function renderWarehouseEditor() {
  renderWhZoneGrid();
  updateWhZoneListWithReorder();
  renderWhOverlayList();
  updateWhMapStats();
  loadWhLog();
}

// ── Warehouse Map: Drag-and-drop Canvas ──────────────────────
const WH_OVERLAY_ICONS = { door:"log-in", aisle:"footprints", office:"building-2", pillar:"square", wall:"minus", label:"tag", rowbreak:"corner-down-left" };
const WH_OVERLAY_LABEL = { door:"ประตู", aisle:"ทางเดิน", office:"ออฟฟิศ", pillar:"เสา", wall:"กำแพง", label:"ป้าย", rowbreak:"แถวใหม่" };
const WH_SNAP = 10; // snap grid px

function snapGrid(v) { return Math.round(v / WH_SNAP) * WH_SNAP; }

let _whDragCleanup = null;

function renderWhZoneGrid() {
  const canvas = $("#whZoneGrid");
  if (!canvas) return;

  // Build HTML for all items
  const zoneHtml = whMapState.zones.map(zone => {
    const locs = whMapState.locations.filter(l => l.zoneId === zone.id);
    const rows = zone.rows, cols = zone.cols;
    const x = zone.canvasX ?? 20;
    const y = zone.canvasY ?? 20;
    const occTotal = locs.reduce((s,l)=>s+l.occupiedBy.length,0);
    const lvlTotal = locs.reduce((s,l)=>s+l.maxLevels,0);
    const cells = Array.from({length:rows},(_,r) =>
      Array.from({length:cols},(_,c) => {
        const loc = locs.find(l => l.row===r && l.col===c);
        if (!loc) return `<div class="wh-cell empty"></div>`;
        const occ = loc.occupiedBy.length, max = loc.maxLevels;
        const cls = occ===0?"free":occ>=max?"full":"partial";
        const lvl = max>1?`<span class="wh-levels">${max}L</span>`:"";
        const houses = loc.occupiedBy.map(o => o.houseNumber || o).join(", ");
        const occTxt = occ>0?`<span class="wh-occ" title="${houses}">${occ}/${max}</span>`:"";
        const houseTags = occ>0 ? loc.occupiedBy.map(o=>`<span class="wh-house-mini">${safeHtml(o.houseNumber||o)}</span>`).join("") : "";
        return `<div class="wh-cell ${cls}" data-loc-id="${loc.id}" title="${loc.code}: ${houses||'ว่าง'}">
          <span class="wh-cell-code">${loc.code}</span>${lvl}${occTxt}${houseTags}
        </div>`;
      }).join("")
    ).map(row=>`<div class="wh-row">${row}</div>`).join("");
    // Capacity overlay for this zone
    const cap = whCapData[zone.id];
    const capLight = cap?.trafficLight || "green";
    const capFill  = cap?.fillPct || 0;
    const lightDot = { green:"#22c55e", yellow:"#f59e0b", red:"#ef4444" }[capLight] || "#22c55e";
    const lightBg  = { green:"#dcfce7", yellow:"#fef9c3", red:"#fee2e2" }[capLight] || "#dcfce7";
    const palletTxt = cap
      ? (cap.maxPallets ? `${cap.usedPallets}/${cap.maxPallets}P` : `${cap.usedPallets}P`)
      : "";
    const boxTxt = cap
      ? (cap.maxBoxes ? ` · ${cap.usedBoxes}/${cap.maxBoxes}B` : (cap.usedBoxes ? ` · ${cap.usedBoxes}B` : ""))
      : "";
    const capBadge = cap
      ? `<span class="wh-cap-badge" style="background:${lightBg};color:${lightDot}" onclick="event.stopPropagation();setView('wh-status')" title="ดูสถานะความจุ">
           <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${lightDot};margin-right:4px;vertical-align:middle"></span>${palletTxt}${boxTxt}
         </span>`
      : "";
    const capFillHtml = capFill > 0
      ? `<div class="wh-zone-cap-fill" style="height:${capFill}%;background:${lightBg}"></div>`
      : "";
    return `<div class="wh-canvas-item wh-zone-block"
        style="border-color:${zone.color};background:${zone.color}18;left:${x}px;top:${y}px;overflow:hidden;position:absolute"
        data-wh-id="${zone.id}" data-wh-type="zone">
      ${capFillHtml}
      <div class="wh-zone-header wh-drag-handle" style="position:relative;z-index:1">
        <span class="wh-zone-title">${safeHtml(zone.name)}</span>
        <span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:4px">${rows}×${cols} · ${occTotal}/${lvlTotal}</span>
        ${capBadge}
        <div class="wh-zone-actions">
          <button class="icon-button" data-edit-zone="${zone.id}" title="แก้ไข"><i data-lucide="pencil"></i></button>
          <button class="icon-button danger" data-delete-zone="${zone.id}" title="ลบ"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      <div class="wh-zone-cells" style="position:relative;z-index:1">${cells}</div>
    </div>`;
  }).join("");

  const overlayHtml = whMapState.overlays.map(ov => {
    const x = ov.canvasX ?? 20;
    const y = ov.canvasY ?? 20;
    if (ov.type === "rowbreak") return "";
    const icon = WH_OVERLAY_ICONS[ov.type] || "square";
    const ovDefaults = { door:{w:100,h:160}, aisle:{w:80,h:220}, office:{w:160,h:160}, pillar:{w:60,h:60}, wall:{w:200,h:40}, label:{w:120,h:60} };
    const def = ovDefaults[ov.type] || {w:100,h:140};
    const ovW = ov.ovW || def.w, ovH = ov.ovH || def.h;
    return `<div class="wh-canvas-item wh-overlay-block wh-overlay-${ov.type} wh-drag-handle"
        style="background:${ov.color};border-color:${ov.color==='#f1f5f9'?'#cbd5e1':ov.color}88;left:${x}px;top:${y}px;width:${ovW}px;height:${ovH}px"
        data-wh-id="${ov.id}" data-wh-type="overlay" data-ov-w="${ovW}" data-ov-h="${ovH}">
      <i data-lucide="${icon}" style="pointer-events:none;width:24px;height:24px;opacity:.7"></i>
      <span class="wh-overlay-name" style="pointer-events:none">${safeHtml(ov.label)}</span>
      ${ov.sublabel?`<span class="wh-overlay-sub" style="pointer-events:none">${safeHtml(ov.sublabel)}</span>`:""}
      <div class="wh-item-actions" style="pointer-events:all">
        <button class="icon-button" data-edit-overlay="${ov.id}" title="แก้ไข"><i data-lucide="pencil"></i></button>
        <button class="icon-button danger" data-del-overlay="${ov.id}" title="ลบ"><i data-lucide="x"></i></button>
      </div>
      <div class="wh-resize-handle" data-resize-id="${ov.id}" title="ลากเพื่อขยาย/หด"></div>
    </div>`;
  }).join("");

  // Compute canvas size dynamically
  const allX = [...whMapState.zones.map(z=>(z.canvasX??20)+600), ...whMapState.overlays.map(o=>(o.canvasX??20)+100)];
  const allY = [...whMapState.zones.map(z=>(z.canvasY??20)+500), ...whMapState.overlays.map(o=>(o.canvasY??20)+200)];
  canvas.style.minWidth  = Math.max(900, ...allX) + "px";
  canvas.style.minHeight = Math.max(520, ...allY) + "px";

  canvas.innerHTML = zoneHtml + overlayHtml;

  // Bind action buttons
  canvas.querySelectorAll("[data-loc-id]").forEach(cell =>
    cell.addEventListener("click", e => { if (!e._wasDrag) openWhLocationDetail(cell.dataset.locId); })
  );
  canvas.querySelectorAll("[data-edit-zone]").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); openWhZoneEdit(btn.dataset.editZone); })
  );
  canvas.querySelectorAll("[data-delete-zone]").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); deleteWhZone(btn.dataset.deleteZone); })
  );
  canvas.querySelectorAll("[data-edit-overlay]").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); openWhOverlayEdit(btn.dataset.editOverlay); })
  );
  canvas.querySelectorAll("[data-del-overlay]").forEach(btn =>
    btn.addEventListener("click", e => { e.stopPropagation(); deleteWhOverlay(btn.dataset.delOverlay); })
  );

  lucide.createIcons();
  initWhDrag(canvas);
}


function initWhDrag(canvas) {
  // Clean up previous listeners
  if (_whDragCleanup) _whDragCleanup();

  let dragging = null, startMX, startMY, startL, startT, moved = false;

  function onMouseDown(e) {
    // Drag from .wh-drag-handle (zone header or full overlay), skip button/cell/badge
    if (e.target.closest("button") || e.target.closest(".wh-cell") || e.target.closest(".wh-cap-badge")) return;
    const handle = e.target.closest(".wh-drag-handle");
    if (!handle) return;
    const item = handle.classList.contains("wh-canvas-item") ? handle : handle.closest(".wh-canvas-item");
    if (!item || !item.dataset.whId) return;
    e.preventDefault();
    dragging = item;
    moved = false;
    dragging.classList.add("wh-dragging");
    startMX = e.clientX;
    startMY = e.clientY;
    startL = parseInt(dragging.style.left) || 0;
    startT = parseInt(dragging.style.top) || 0;
  }

  function onMouseMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startMX;
    const dy = e.clientY - startMY;
    if (Math.abs(dx)+Math.abs(dy) > 3) moved = true;
    const newL = snapGrid(Math.max(0, startL + dx));
    const newT = snapGrid(Math.max(0, startT + dy));
    dragging.style.left = newL + "px";
    dragging.style.top  = newT + "px";
  }

  function onMouseUp(e) {
    if (!dragging) return;
    const id   = dragging.dataset.whId;
    const type = dragging.dataset.whType;
    const x    = parseInt(dragging.style.left) || 0;
    const y    = parseInt(dragging.style.top)  || 0;
    dragging.classList.remove("wh-dragging");
    const wasMoved = moved;
    dragging = null;  // release immediately — no await blocking
    if (wasMoved) {
      e._wasDrag = true;
      // Fire-and-forget save; UI is already updated
      (async () => {
        try {
          if (type === "zone") {
            await api("/api/warehouse/zone/update", { zoneId: id, canvasX: x, canvasY: y });
            const z = whMapState.zones.find(z=>z.id===id);
            if (z) { z.canvasX=x; z.canvasY=y; }
          } else {
            await api("/api/warehouse/overlay/update", { overlayId: id, canvasX: x, canvasY: y });
            const o = whMapState.overlays.find(o=>o.id===id);
            if (o) { o.canvasX=x; o.canvasY=y; }
          }
        } catch(err) { toast("ย้ายไม่ได้: "+err.message, "error"); }
      })();
    }
  }

  // ── Resize logic ──────────────────────────────────────────────
  let resizing = null, resStartX, resStartY, resStartW, resStartH;

  function onResizeDown(e) {
    const handle = e.target.closest(".wh-resize-handle");
    if (!handle) return;
    e.preventDefault(); e.stopPropagation();
    const item = handle.closest(".wh-canvas-item");
    if (!item) return;
    resizing = { item, id: item.dataset.whId };
    resStartX = e.clientX; resStartY = e.clientY;
    resStartW = parseInt(item.dataset.ovW) || 100;
    resStartH = parseInt(item.dataset.ovH) || 140;
    item.classList.add("wh-resizing");
  }
  function onResizeMove(e) {
    if (!resizing) return;
    const dw = e.clientX - resStartX, dh = e.clientY - resStartY;
    const newW = Math.max(60, snapGrid(resStartW + dw));
    const newH = Math.max(40, snapGrid(resStartH + dh));
    resizing.item.style.width  = newW + "px";
    resizing.item.style.height = newH + "px";
    resizing.item.dataset.ovW  = newW;
    resizing.item.dataset.ovH  = newH;
  }
  async function onResizeUp() {
    if (!resizing) return;
    const item = resizing.item;
    item.classList.remove("wh-resizing");
    const w = parseInt(item.dataset.ovW), h = parseInt(item.dataset.ovH);
    try {
      await api("/api/warehouse/overlay/update", { overlayId: resizing.id, ovW: w, ovH: h });
      const ov = whMapState.overlays.find(o => o.id === resizing.id);
      if (ov) { ov.ovW = w; ov.ovH = h; }
    } catch(e) { console.warn("resize save failed:", e); }
    resizing = null;
  }

  // ── Canvas click-to-add ────────────────────────────────────────
  async function onCanvasClick(e) {
    const tool = whMapState.activeTool;
    if (tool === "select" || tool === "zone") return;
    if (e.target.closest(".wh-canvas-item") || e.target.closest("button")) return;
    const rect = canvas.getBoundingClientRect();
    const x = snapGrid(e.clientX - rect.left + canvas.scrollLeft);
    const y = snapGrid(e.clientY - rect.top  + canvas.scrollTop);
    const colors = { aisle:"#f1f5f9", door:"#fef9c3", office:"#e0f2fe", pillar:"#e5e7eb", wall:"#e5e7eb", label:"#fef9c3" };
    const defLabels = { aisle:"ทางเดิน", door:"ประตู", office:"ออฟฟิศ", pillar:"เสา", wall:"กำแพง", label:"ป้าย" };
    try {
      await api("/api/warehouse/overlay/create", {
        type: tool, label: defLabels[tool] || tool,
        color: colors[tool] || "#f1f5f9",
        canvasX: x, canvasY: y, mapOrder: Date.now()
      });
      // Reset to select after placing
      setWhTool("select");
      renderWarehouseMap();
    } catch(e) { toast(e.message || "เพิ่มไม่ได้", "error"); }
  }

  // Cancel drag if window loses focus or user tabs away
  function cancelDrag() {
    if (dragging) { dragging.classList.remove("wh-dragging"); dragging = null; }
    if (resizing) { resizing.item.classList.remove("wh-resizing"); resizing = null; }
  }

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousedown", onResizeDown);
  canvas.addEventListener("click", onCanvasClick);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mouseup", onResizeUp);
  window.addEventListener("blur", cancelDrag);
  document.addEventListener("visibilitychange", cancelDrag);

  _whDragCleanup = () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousedown", onResizeDown);
    canvas.removeEventListener("click", onCanvasClick);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mouseup", onResizeUp);
    window.removeEventListener("blur", cancelDrag);
    document.removeEventListener("visibilitychange", cancelDrag);
  };
}

function openWhZoneModal() {
  const m = $("#whZoneCreateModal");
  if (!m) return;
  // Reset form
  const inp = (id) => { const el = $("#"+id); if(el) el.value = ""; };
  inp("whZoneName"); inp("whZonePrefix");
  const rows = $("#whZoneRows"); if(rows) rows.value = "5";
  const cols = $("#whZoneCols"); if(cols) cols.value = "10";
  const lvl = $("#whZoneLevels"); if(lvl) lvl.value = "2";
  document.querySelectorAll(".wh-color-btn").forEach((b,i) => b.classList.toggle("active", i===0));
  whMapState.selectedColor = "#dbeafe";
  const res = $("#whCreateResult"); if(res) res.textContent = "";
  m.classList.add("show"); m.setAttribute("aria-hidden","false");
}

function closeWhZoneModal() {
  const m = $("#whZoneCreateModal");
  if (m) { m.classList.remove("show"); m.setAttribute("aria-hidden","true"); }
}

function setWhTool(tool) {
  whMapState.activeTool = tool;
  document.querySelectorAll(".wh-tool-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  const canvas = $("#whZoneGrid");
  if (canvas) {
    canvas.dataset.activeTool = tool;
    canvas.style.cursor = tool === "select" ? "default" : "crosshair";
  }
  // Zone tool → open modal; always hide inline panel
  const qp = $("#whZoneQuickCreate");
  if (qp) qp.hidden = true;
  if (tool === "zone") {
    openWhZoneModal();
    // reset tool to select so canvas doesn't stay in zone mode
    whMapState.activeTool = "select";
    document.querySelectorAll(".wh-tool-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === "select"));
    if (canvas) { canvas.dataset.activeTool = "select"; canvas.style.cursor = "default"; }
  }
}

// ── Clean sidebar list renders ────────────────────────────────
function whShowSaveStatus(msg, ok=true) {
  const el = $("#whSaveStatus");
  if (!el) return;
  el.textContent = ok ? "✓ " + msg : "⚠ " + msg;
  el.style.color = ok ? "#16a34a" : "#dc2626";
  el.style.opacity = "1";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = "0"; }, 2500);
}


// ── Zone list with reorder ────────────────────────────────────
function updateWhZoneListWithReorder() {
  const el = document.getElementById("whZoneList");
  if (!el) return;
  const zones = whMapState.zones || [];
  if (!zones.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted);padding:8px 4px">ยังไม่มีโซน — คลิก +โซน</p>';
    return;
  }
  el.innerHTML = zones.map((z, i) => {
    const locs = (whMapState.locations||[]).filter(l=>l.zoneId===z.id);
    const occ  = locs.filter(l=>l.occupiedBy?.length>0).length;
    const pct  = locs.length ? Math.round(occ/locs.length*100) : 0;
    return `<div class="wh-zone-item" style="border-left:4px solid ${z.color};flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${z.color};flex-shrink:0"></span>
          <span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeHtml(z.name)}</span>
        </div>
        <span style="font-size:11px;color:var(--muted);flex-shrink:0">${z.rows}×${z.cols} · ${occ}/${locs.length}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="openWhZoneEdit('${z.id}')"
          style="flex:1;height:30px;border-radius:7px;border:1.5px solid #2563eb;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px">
          <i data-lucide="pencil" style="width:12px;height:12px"></i> แก้ไข
        </button>
        <button onclick="deleteWhZone('${z.id}')"
          style="flex:1;height:30px;border-radius:7px;border:1.5px solid #dc2626;background:#fef2f2;color:#dc2626;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px">
          <i data-lucide="trash-2" style="width:12px;height:12px"></i> ลบ
        </button>
      </div>
    </div>`;
  }).join("");
  if (window.lucide?.createIcons) lucide.createIcons();
}

// ── Overlay list ──────────────────────────────────────────────
function renderWhOverlayList() {
  const el = document.getElementById("whOverlayList");
  if (!el) return;
  const ovs = whMapState.overlays || [];
  if (!ovs.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted);padding:8px 4px">ยังไม่มีองค์ประกอบ</p>';
    return;
  }
  const icons  = { door:"log-in", aisle:"footprints", office:"building-2", pillar:"square", wall:"minus", label:"tag" };
  const labels = { door:"ประตู", aisle:"ทางเดิน", office:"ออฟฟิศ", pillar:"เสา", wall:"กำแพง", label:"ป้าย" };
  el.innerHTML = ovs.map(o => `
    <div class="wh-zone-item" style="flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <i data-lucide="${icons[o.type]||'layout-template'}" style="width:14px;height:14px;flex-shrink:0;color:var(--muted)"></i>
        <span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeHtml(o.label||labels[o.type]||o.type)}</span>
        <span style="font-size:10px;color:var(--muted);flex-shrink:0">${labels[o.type]||o.type}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="openWhOverlayEdit('${o.id}')"
          style="flex:1;height:28px;border-radius:7px;border:1.5px solid #2563eb;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:600;cursor:pointer">
          แก้ไข
        </button>
        <button onclick="deleteWhOverlay('${o.id}')"
          style="flex:1;height:28px;border-radius:7px;border:1.5px solid #dc2626;background:#fef2f2;color:#dc2626;font-size:12px;font-weight:600;cursor:pointer">
          ลบ
        </button>
      </div>
    </div>`).join("");
  if (window.lucide?.createIcons) lucide.createIcons();
}

// ── Map stats bar ─────────────────────────────────────────────
function updateWhMapStats() {
  const el = document.getElementById("whMapStats");
  if (!el) return;
  const locs = whMapState.locations || [];
  const used = locs.filter(l=>l.occupiedBy?.length>0).length;
  el.textContent = `${locs.length} ช่อง · ${used} ใช้งาน`;
}

// ── Zone edit modal ───────────────────────────────────────────
function openWhZoneEdit(zoneId) {
  const zone = (whMapState.zones||[]).find(z=>z.id===zoneId);
  if (!zone) return;
  const m = document.getElementById("whZoneEditModal");
  if (!m) return;
  document.getElementById("whZoneEditId").value = zone.id;
  document.getElementById("whZoneEditName").value = zone.name || "";
  const lvlEl = document.getElementById("whZoneEditLevels");
  if (lvlEl) lvlEl.value = zone.defaultLevels || 2;
  const mpEl = document.getElementById("whZoneEditMaxPallets");
  if (mpEl) mpEl.value = zone.maxPallets || 0;
  const mbEl = document.getElementById("whZoneEditMaxBoxes");
  if (mbEl) mbEl.value = zone.maxBoxes || 0;
  // Set color swatches
  whMapState._editZoneColor = zone.color;
  m.querySelectorAll(".wh-color-swatch").forEach(sw => {
    sw.classList.toggle("selected", sw.dataset.color === zone.color);
  });
  m.style.display = "";   // let CSS class control display
  m.classList.add("show");
}

// ── Overlay edit modal ────────────────────────────────────────
function openWhOverlayEdit(overlayId) {
  const ov = (whMapState.overlays||[]).find(o=>o.id===overlayId);
  if (!ov) return;
  const m = document.getElementById("whOvEditModal");
  if (!m) return;
  document.getElementById("whOvEditId").value = ov.id;
  const lbl = document.getElementById("whOvEditLabel"); if (lbl) lbl.value = ov.label||"";
  const sub = document.getElementById("whOvEditSublabel"); if (sub) sub.value = ov.sublabel||"";
  m.style.display = "";
  m.classList.add("show");
}

// ── Location detail modal ─────────────────────────────────────
function openWhLocationDetail(locId) {
  const loc = (whMapState.locations||[]).find(l=>l.id===locId);
  if (!loc) return;
  const m = document.getElementById("whLocDetailModal");
  if (!m) return;
  const title = document.getElementById("whLocDetailTitle");
  const body  = document.getElementById("whLocDetailBody");
  if (title) title.textContent = loc.code || loc.id;
  if (body) {
    const occ = loc.occupiedBy||[];
    body.innerHTML = occ.length
      ? occ.map(o=>`<div class="wh-house-tag">${safeHtml(o.houseNumber||o)}<span style="color:var(--muted);font-size:10px"> ชั้น ${o.level||1}</span></div>`).join("")
      : '<p style="color:var(--muted);font-size:13px">ช่องนี้ว่างอยู่</p>';
  }
  m.style.display = "";
  m.classList.add("show");
}

// ── Reorder zone ──────────────────────────────────────────────
async function reorderWhZone(zoneId, dir) {
  const zones = whMapState.zones||[];
  const idx = zones.findIndex(z=>z.id===zoneId);
  const newIdx = idx+dir;
  if (newIdx<0||newIdx>=zones.length) return;
  [zones[idx],zones[newIdx]] = [zones[newIdx],zones[idx]];
  // Update mapOrder on server
  try {
    await api("/api/warehouse/zone/reorder", { zoneId, direction: dir });
    await loadWarehouseMap();
    updateWhZoneListWithReorder();
  } catch(e) { toast(e.message,"error"); }
}

// ── Catalog Card View ────────────────────────────────────────
function collapseWhEditorToCard() {
  const zones  = whMapState.zones || [];
  const locs   = whMapState.locations || [];
  const ovs    = whMapState.overlays || [];
  const total  = locs.length;
  const used   = locs.filter(l => l.occupiedBy?.length > 0).length;
  const pct    = total ? Math.round(used/total*100) : 0;
  const mapName = (document.querySelector("#whPageTitle")?.textContent || "แผนที่คลัง WH3");

  // Build mini zone grid for thumbnail
  const miniZones = zones.slice(0,6).map(z => {
    const zlocs = locs.filter(l => l.zoneId === z.id);
    const zocc  = zlocs.filter(l => l.occupiedBy?.length > 0).length;
    const zpct  = zlocs.length ? Math.round(zocc/zlocs.length*100) : 0;
    return `<div class="wh-card-zone" style="border-color:${z.color};background:${z.color}22">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${z.color}"></span>
        <span style="font-size:11px;font-weight:700;color:var(--text)">${safeHtml(z.name)}</span>
      </div>
      <span style="font-size:10px;color:var(--muted)">${z.rows}×${z.cols} &nbsp;·&nbsp; ${zpct}%</span>
    </div>`;
  }).join("");

  // Populate catalog container HTML
  const container = document.getElementById("whCatalogContainer");
  if (!container) return;

  // Add header above catalog
  const mapAreaEl = document.querySelector(".wh-map-area");
  let hdr = document.getElementById("whCatalogHeader");
  if (!hdr && mapAreaEl) {
    hdr = document.createElement("div");
    hdr.id = "whCatalogHeader";
    hdr.className = "wh-catalog-header";
    mapAreaEl.insertBefore(hdr, container);
  }
  if (hdr) hdr.innerHTML = `
    <h2>แผนที่คลังสินค้า</h2>
    <p>เลือกแผนที่เพื่อแก้ไข หรือสร้างแผนที่ใหม่</p>`;

  const barColor = pct>80?"#ef4444":pct>50?"#f59e0b":"#22c55e";
  const existingCard = `
    <div class="wh-catalog-card" id="whCatalogCard">
      <div class="wh-catalog-thumb">
        <div class="wh-catalog-badge">${zones.length} โซน · ${ovs.length} องค์ประกอบ</div>
        <div class="wh-catalog-zones">${miniZones}</div>
      </div>
      <div class="wh-catalog-info">
        <div class="wh-catalog-name">${safeHtml(mapName)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0">
          <span class="wh-catalog-meta">${total} ช่องจัดเก็บ</span>
          <span style="font-size:13px;font-weight:700;color:${barColor}">${pct}% ใช้งาน</span>
        </div>
        <div style="height:8px;border-radius:4px;background:var(--bg);overflow:hidden;margin-bottom:8px">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width .4s"></div>
        </div>
        <div class="wh-catalog-saved"><i data-lucide="check-circle-2" style="width:14px"></i> บันทึกแล้ว</div>
      </div>
      <div class="wh-catalog-actions">
        <button onclick="showWarehouseEditor()"
          style="width:100%;height:44px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          <i data-lucide="pencil" style="width:16px;height:16px"></i> แก้ไขแผนที่
        </button>
      </div>
    </div>

    <!-- New map card -->
    <div class="wh-catalog-card wh-catalog-new-card" id="whCatalogNewCard">
      <div class="wh-catalog-thumb wh-catalog-new-thumb">
        <i data-lucide="plus-circle" style="width:56px;height:56px;color:#94a3b8"></i>
      </div>
      <div class="wh-catalog-info">
        <div class="wh-catalog-name" style="color:var(--text)">สร้างแผนที่ใหม่</div>
        <div class="wh-catalog-meta">ออกแบบผังคลังสินค้าใหม่ทั้งหมด</div>
        <div class="wh-catalog-meta" style="color:#ef4444;font-size:11px;margin-top:4px">⚠ จะลบแผนที่เดิมทั้งหมด</div>
      </div>
      <div class="wh-catalog-actions">
        <button onclick="startNewWarehouseMap()"
          style="width:100%;height:44px;border-radius:10px;border:2px dashed #94a3b8;background:transparent;color:#64748b;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          <i data-lucide="file-plus-2" style="width:16px;height:16px"></i> สร้างแผนที่ใหม่
        </button>
      </div>
    </div>`;
  const newCard = `
    <div class="wh-catalog-card wh-catalog-new-card" id="whCatalogNewCard">
      <div class="wh-catalog-thumb wh-catalog-new-thumb">
        <i data-lucide="plus-circle" style="width:56px;height:56px;color:#94a3b8"></i>
      </div>
      <div class="wh-catalog-info">
        <div class="wh-catalog-name" style="color:var(--text)">สร้างแผนที่ใหม่</div>
        <div class="wh-catalog-meta">ออกแบบผังคลังสินค้าใหม่</div>
      </div>
      <div class="wh-catalog-actions">
        <button onclick="startNewWarehouseMap()"
          style="width:100%;height:44px;border-radius:10px;border:2px dashed #94a3b8;background:transparent;color:#64748b;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          <i data-lucide="file-plus-2" style="width:16px;height:16px"></i> สร้างแผนที่ใหม่
        </button>
      </div>
    </div>`;

  // Build save-as-profile card
  const saveCard = `
    <div class="wh-catalog-card" style="border:1.5px dashed #94a3b8;background:var(--bg)">
      <div class="wh-catalog-thumb wh-catalog-new-thumb" style="min-height:80px">
        <i data-lucide="bookmark-plus" style="width:40px;height:40px;color:#94a3b8"></i>
      </div>
      <div class="wh-catalog-info">
        <div class="wh-catalog-name" style="color:var(--text)">บันทึกแผนที่ปัจจุบัน</div>
        <div class="wh-catalog-meta">เก็บแผนที่ไว้ใช้ในอนาคต ไม่ลบเก่า</div>
        <input id="whSaveProfileName" type="text" placeholder="ชื่อแผนที่ เช่น WH3 ชั้น 2"
          style="width:100%;border:1.5px solid var(--line);border-radius:8px;padding:6px 10px;font-size:12px;margin-top:6px;box-sizing:border-box">
      </div>
      <div class="wh-catalog-actions">
        <button onclick="saveWhAsProfile(document.getElementById('whSaveProfileName')?.value)"
          style="width:100%;height:36px;border-radius:8px;border:none;background:#16a34a;color:#fff;font-size:13px;font-weight:700;cursor:pointer">
          💾 บันทึกเป็นโปรไฟล์
        </button>
      </div>
    </div>`;

  // Build cards for each saved profile
  const profileCards = whProfiles.map(p => `
    <div class="wh-catalog-card" style="border:1.5px solid #bfdbfe;background:#f0f7ff">
      <div class="wh-catalog-thumb" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);min-height:80px;display:flex;flex-direction:column;justify-content:center;padding:12px;gap:4px">
        <div style="font-size:11px;font-weight:700;color:#1d4ed8">${p.zoneCount} โซน · ${p.locationCount} ตำแหน่ง</div>
        <div style="background:#bfdbfe;color:#1e40af;font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;display:inline-block">${safeHtml(p.name)}</div>
      </div>
      <div class="wh-catalog-info">
        <div class="wh-catalog-name">${safeHtml(p.name)}</div>
        <div class="wh-catalog-meta">${p.description ? safeHtml(p.description) : "แผนที่บันทึกไว้"}</div>
        <div class="wh-catalog-saved" style="color:#64748b">📅 ${new Date(p.createdAt).toLocaleDateString("th-TH")}</div>
      </div>
      <div class="wh-catalog-actions" style="display:flex;flex-direction:column;gap:6px">
        <button onclick="loadWhProfile('${p.id}','${p.name.replace(/'/g,"\'")}')"
          style="width:100%;height:36px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-size:13px;font-weight:700;cursor:pointer">
          ▶ โหลดแผนที่นี้
        </button>
        <button onclick="deleteWhProfile('${p.id}','${p.name.replace(/'/g,"\'")}')"
          style="width:100%;height:28px;border-radius:8px;border:1.5px solid #fca5a5;background:#fff;color:#dc2626;font-size:12px;cursor:pointer">
          🗑 ลบ
        </button>
      </div>
    </div>`).join("");

  container.innerHTML = existingCard + saveCard + profileCards + newCard;

  container.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;padding:28px;align-items:start";
  const hdrEl2 = document.getElementById("whCatalogHeader");
  if (hdrEl2) hdrEl2.style.display = "block";
  const toolbar = document.getElementById("whToolbar");
  const canvas  = document.getElementById("whMapCanvas");
  const aside   = document.querySelector("#view-warehouse aside");
  if (toolbar) toolbar.style.display = "none";
  if (canvas)  canvas.style.display  = "none";
  if (aside)   aside.classList.add("wh-aside-hidden");
  // Span map-area across all columns so it takes full width
  const mapArea = document.querySelector(".wh-map-area");
  if (mapArea) mapArea.style.gridColumn = "1 / -1";

  lucide.createIcons();
}

function showWarehouseEditor() {
  const container = document.getElementById("whCatalogContainer");
  const toolbar   = document.getElementById("whToolbar");
  const canvas    = document.getElementById("whMapCanvas");
  const aside     = document.querySelector("#view-warehouse aside");
  if (container) container.style.display = "none";
  const hdrEl = document.getElementById("whCatalogHeader");
  if (hdrEl) hdrEl.style.display = "none";
  if (toolbar)   toolbar.style.display   = "flex";
  if (canvas)    canvas.style.display    = "block";
  if (aside)     aside.classList.remove("wh-aside-hidden");
  const mapArea = document.querySelector(".wh-map-area");
  if (mapArea) mapArea.style.gridColumn = "";
  renderWarehouseEditor();
}

async function startNewWarehouseMap() {
  // Offer to save current map before clearing
  const saveFirst = whMapState.zones?.length > 0;
  if (saveFirst) {
    const name = window.prompt("บันทึกแผนที่ปัจจุบันก่อนไหม? ใส่ชื่อหรือกด Cancel เพื่อข้าม");
    if (name) await saveWhAsProfile(name);
  }
  if (!(await showWhConfirm("สร้างแผนที่ใหม่? โซนปัจจุบันจะถูกล้าง"))) return;
  try {
    for (const z of [...(whMapState.zones||[])]) {
      await api("/api/warehouse/zone/delete", { zoneId: z.id });
    }
    for (const o of [...(whMapState.overlays||[])]) {
      await api("/api/warehouse/overlay/delete", { overlayId: o.id });
    }
    await loadWarehouseMap();
    showWarehouseEditor();
    setTimeout(() => openWhZoneModal(), 300);
  } catch(e) { toast(e.message, "error"); }
}


async function loadWhLog() {
  try {
    const data = await api("/api/warehouse/map", {});
    const log = data?.map?.log || [];
    renderWhLog(log);
  } catch(e) { /* silent fail */ }
}

function renderWhLog(log) {
  const el = $("#whLogList");
  if (!el) return;
  if (!log.length) { el.innerHTML = '<p class="wh-log-empty">ยังไม่มีประวัติ</p>'; return; }
  const actionLabel = { assign: "จัดเก็บ", release: "ปล่อย", zone_create: "สร้างโซน", zone_update: "แก้ไขโซน" };
  el.innerHTML = log.map(entry => {
    const label = actionLabel[entry.action] || entry.action;
    const detail = entry.houseNumber
      ? `${entry.houseNumber} → ${entry.locationCode || ""}${entry.level ? `-L${entry.level}` : ""}`
      : entry.zoneName || JSON.stringify(entry.changes || {});
    const ts = entry.ts ? formatBangkok(entry.ts) : "";
    const who = entry.userId || "system";
    return `<div class="wh-log-row">
      <span class="wh-log-action ${entry.action}">${label}</span>
      <span class="wh-log-detail">${safeHtml(detail)}</span>
      <span class="wh-log-meta">${safeHtml(who)} · ${ts}</span>
    </div>`;
  }).join("");
}

// ===== STAFF LOCATION PICKER =====
function openLocationPicker(houseNumber) {
  const modal = $("#whPickerModal");
  if (!modal) return;
  $("#whPickerHouseLabel").textContent = `House: ${houseNumber}`;
  modal._houseNumber = houseNumber;
  modal._selectedLoc = null;
  $("#whPickerLevelRow").hidden = true;
  renderPickerCanvas();
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function renderPickerCanvas() {
  const canvas = $("#whPickerCanvas");
  if (!canvas) return;
  if (whMapState.zones.length === 0) {
    canvas.innerHTML = '<div class="wh-empty-map">ยังไม่มีโซน — ให้ Admin สร้างแผนที่ก่อน</div>';
    return;
  }
  canvas.innerHTML = whMapState.zones.map(zone => {
    const locs = whMapState.locations.filter(l => l.zoneId === zone.id);
    const rows = zone.rows, cols = zone.cols;
    const cells = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const loc = locs.find(l => l.row === r && l.col === c);
        if (!loc) return `<div class="wh-cell empty"></div>`;
        const occ = loc.occupiedBy.length;
        const max = loc.maxLevels;
        const full = occ >= max;
        const cls = occ === 0 ? "free" : full ? "full" : "partial";
        const title = full ? "เต็ม" : "กดเพื่อเลือก";
        return `<div class="wh-cell ${cls}${full ? "" : " pickable"}" data-pick-loc="${loc.id}" title="${loc.code} — ${title}">
          <span class="wh-cell-code">${loc.code}</span>
          ${max > 1 ? `<span class="wh-levels">${occ}/${max}</span>` : ""}
        </div>`;
      }).join("")
    ).map(row => `<div class="wh-row">${row}</div>`).join("");
    return `<div class="wh-zone-block" style="--zone-cols:${cols};border-color:${zone.color};background:${zone.color}22">
      <div class="wh-zone-label">${safeHtml(zone.name)}</div>
      <div class="wh-zone-cells">${cells}</div>
    </div>`;
  }).join("");

  canvas.querySelectorAll(".wh-cell.pickable").forEach(cell => {
    cell.addEventListener("click", () => selectPickerLocation(cell.dataset.pickLoc));
  });
}

function selectPickerLocation(locId) {
  const loc = whMapState.locations.find(l => l.id === locId);
  if (!loc) return;
  const modal = $("#whPickerModal");
  modal._selectedLoc = locId;
  // Highlight selected
  $("#whPickerCanvas").querySelectorAll(".wh-cell").forEach(c => c.classList.remove("selected"));
  $("#whPickerCanvas").querySelector(`[data-pick-loc="${locId}"]`)?.classList.add("selected");
  // Show level selector
  const levelRow = $("#whPickerLevelRow");
  const levelBtns = $("#whPickerLevelBtns");
  if (!levelRow || !levelBtns) return;
  $("#whPickerLocLabel").textContent = loc.code;
  const takenLevels = new Set(loc.occupiedBy.map(o => o.level));
  levelBtns.innerHTML = Array.from({ length: loc.maxLevels }, (_, i) => {
    const lvl = i + 1;
    const taken = takenLevels.has(lvl);
    return `<button class="wh-level-btn${taken ? " taken" : ""}" type="button"
      ${taken ? "disabled" : ""} data-level="${lvl}">
      L${lvl}${taken ? " (ไม่ว่าง)" : ""}
    </button>`;
  }).join("");
  levelBtns.querySelectorAll(".wh-level-btn:not(.taken)").forEach(btn => {
    btn.addEventListener("click", () => confirmPickerAssign(locId, Number(btn.dataset.level)));
  });
  levelRow.hidden = false;
}

async function confirmPickerAssign(locId, level) {
  const modal = $("#whPickerModal");
  const houseNumber = modal._houseNumber;
  const loc = whMapState.locations.find(l => l.id === locId);
  if (!houseNumber || !loc) return;
  try {
    await api("/api/warehouse/location/assign", { locationId: locId, level, houseNumber });
    toast(`จัดเก็บ ${houseNumber} ที่ ${loc.code}-L${level} แล้ว`);
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    // Refresh map state
    await loadWarehouseMap();
  } catch (e) { toast(e.message || "เกิดข้อผิดพลาด", "error"); }
}


function renderAdminIssuedHistory() {
  const list = $("#adminIssuedQueue");
  const count = $("#adminIssuedCount");
  if (!list) return;
  const jobs = adminIssuedCargoJobs();
  if (count) count.textContent = jobs.length;
  list.innerHTML = jobs.length ? jobs.slice(0, 10).map(job => `
    <button class="queue-job history-job" type="button" data-admin-issued-house="${job.houseNumber}">
      <span class="queue-main">
        <strong>${job.houseNumber}</strong>
        <small>${job.customerName || "-"} / ${job.driverName || "-"} / ${job.vehiclePlate || "-"}</small>
      </span>
      <span class="queue-tags">
        <b class="ok">${localizeText("ออกใบแล้ว / Issued")}</b>
        <b>${new Date(job.cargoIssuedAt).toLocaleDateString(state.lang === "en" ? "en-GB" : "th-TH")}</b>
      </span>
    </button>
  `).join("") : `<div class="empty-state compact">${localizeText("ยังไม่มีประวัติออกใบ Cargo / No cargo history")}</div>`;
}

function assignableUsers() {
  return (state.users || []).filter(user => ["Driver", "WH_Staff", "Admin"].includes(user.role));
}

function selectedManualJobs() {
  return state.selectedManualHouses.map(findExactJob).filter(Boolean);
}

function manualGroupVisibleJobs() {
  const search = ($("#manualGroupSearch")?.value || "").trim().toLowerCase();
  return adminUnopenedJobs().filter(job => {
    if (!search) return true;
    return [job.houseNumber, job.customerName, job.flightNo, job.pickupLocation, job.driverName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

function chunkArray(arr, n) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += n) chunks.push(arr.slice(i, i + n));
  return chunks;
}

function getPageDriver(pageIndex) {
  const users = assignableUsers();
  // If we have computed pages with driver assignments, use those
  const computed = state.groupWizard?._computedPages;
  if (computed && computed[pageIndex]) {
    const did = computed[pageIndex].driverId;
    return users.find(u => u.id === did) || users[0] || null;
  }
  // Fall back to pageDrivers or primary driver
  const pageDriverId = state.groupWizard?.pageDrivers?.[pageIndex];
  const driverId = pageDriverId ?? state.groupWizard?.driverId;
  return users.find(u => u.id === driverId) || users[0] || null;
}

function cargoDataFromJobs(jobs, driver = null) {
  const first = jobs[0] || {};
  return {
    houseNumber: first.houseNumber || "",
    customer: first.customerName || "",
    rows: jobs.map(job => ({
      houseNumber: job.houseNumber,
      dest: job.destAirport || job.destinationCity || job.flightNo || "",
      destAirport: job.destAirport || job.flightNo || "",
      destinationCity: job.destinationCity || "",
      destination: job.destAirport || job.destinationCity || job.flightNo || "",
      route: job.routeType || job.destination || "WH3",
      routeType: job.routeType || job.destination || "WH3",
      flightNo: job.flightNo || "",
      carton: job.pieceCount || "",
      pickupDate: job.pickupDate || toDateInput(job.flightTime),
      booking: job.booking || job.bookingNo || "",
      invoiceNo: job.invoiceNo || "",
      contact: job.contactPerson || "",
      tel: job.pickupPhone || ""
    })),
    pickupDate: first.pickupDate || toDateInput(first.flightTime) || dateInputValue(new Date()),
    pickupTime: "",
    pickupLocation: first.pickupLocation || "",
    contact: first.contactPerson || "",
    tel: first.pickupPhone || "",
    booking: first.booking || first.bookingNo || "",
    invoiceNo: first.invoiceNo || "",
    driverName: driver?.name || first.driverName || $("#adminDriverName")?.value || "",
    vehiclePlate: driver?.vehiclePlate || first.vehiclePlate || $("#adminVehiclePlate")?.value || "",
    pieceCount: jobs.reduce((sum, job) => sum + Number(job.pieceCount || 0), 0) || "",
    packageType: first.packageType || "Carton",
    dest: first.destAirport || first.destinationCity || first.flightNo || "",
    destAirport: first.destAirport || first.flightNo || "",
    route: first.routeType || first.destination || "WH3",
    destination: first.routeType || first.destination || "WH3",
    stickerColor: first.stickerColor || ""
  };
}

function manualGroupDriver() {
  const select = $("#manualGroupDriver");
  const users = assignableUsers();
  return users.find(user => user.id === select?.value) || users[0] || null;
}

function renderManualGroupDriverOptions() {
  const select = $("#manualGroupDriver");
  if (!select) return;
  const current = select.value;
  const users = assignableUsers();
  select.innerHTML = users.map(user => `
    <option value="${user.id}">${user.name}${user.vehiclePlate ? ` / ${user.vehiclePlate}` : ""} - ${staffRoleLabel(user.role)}</option>
  `).join("");
  select.value = users.some(user => user.id === current) ? current : (users[0]?.id || "");
}

// ── Outbound: Driver + Crew helpers ──────────────────────────────────────────
function renderObDriverOptions() {
  const sel = document.getElementById("obDriver");
  if (!sel) return;
  const users = assignableUsers();
  const cur = sel.value || state.outboundDriverId;
  sel.innerHTML = '<option value="">— เลือกคนขับ —</option>' +
    users.map(u => `<option value="${u.id}">${u.name}${u.vehiclePlate ? " / " + u.vehiclePlate : ""}</option>`).join("");
  if (cur && users.some(u => u.id === cur)) sel.value = cur;
}

function onObDriverChange() {
  const sel = document.getElementById("obDriver");
  if (!sel) return;
  state.outboundDriverId = sel.value;
  if (state._groupCtfJobs?.length) refreshGroupCtfPreview();
}

function openObMoveModal(houseNumber, fromKey) {
  const groups = outboundGroupsByFlight();
  const modal = document.getElementById("obMoveModal");
  const lbl = document.getElementById("obMoveJobLabel");
  const opts = document.getElementById("obMoveOptions");
  if (!modal || !opts) return;
  if (lbl) lbl.textContent = `House: ${houseNumber}  (จากกลุ่ม ${fromKey.split("|")[0]})`;
  opts.innerHTML = groups
    .filter(g => g.key !== fromKey)
    .map(g => `
      <button type="button" onclick="doMoveObJob('${houseNumber}','${fromKey}','${g.key}')"
        style="width:100%;text-align:left;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:9px;background:#fff;cursor:pointer;font-size:13px;transition:background .12s"
        onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='#fff'">
        <b style="color:#0f766e">✈ ${g.flight}</b>
        <span style="color:#64748b;font-size:11px;margin-left:6px">${g.dest || ""} · ${g.rows.length} งาน</span>
      </button>`).join("") +
    `<button type="button" onclick="doMoveObJob('${houseNumber}','${fromKey}','__new__')"
        style="width:100%;text-align:left;padding:10px 12px;border:1.5px dashed #94a3b8;border-radius:9px;background:#f8fafc;cursor:pointer;font-size:13px"
        onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
        + กลุ่มใหม่ (ไม่มีเที่ยวบิน)
    </button>`;
  modal.style.display = "flex";
}

function doMoveObJob(houseNumber, fromKey, toKey) {
  state.outboundGroupOverrides[houseNumber] = toKey;
  document.getElementById("obMoveModal").style.display = "none";
  renderOutboundGroups();
  // Re-select expanded group if still exists
  if (state.outboundExpandedIdx !== null) {
    const groups = outboundGroupsByFlight();
    if (groups[state.outboundExpandedIdx]) selectOutboundGroup(state.outboundExpandedIdx);
  }
}

function getGroupPreviewFitZoom() {
  const container = $("#groupCargoPreview");
  if (!container) return 0.55;
  const w = (container.clientWidth || 500) - 24;
  return Math.min(1, Math.max(0.25, w / CARGO_FORM_W));
}

function applyGroupZoom(zoom) {
  state.groupPreviewZoom = zoom;
  const container = $("#groupCargoPreview");
  if (!container || !state._lastGroupHtml) return;
  const scaledW = Math.ceil(CARGO_FORM_W * zoom);
  const scaledH = Math.ceil(CARGO_FORM_H * zoom);
  container.innerHTML = `<div style="width:${scaledW}px;height:${scaledH}px;overflow:hidden;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,.15);">
    <div style="transform:scale(${zoom});transform-origin:top left;width:${CARGO_FORM_W}px;height:${CARGO_FORM_H}px;">${state._lastGroupHtml}</div>
  </div>`;
  const label = $("#groupZoomLabel");
  if (label) label.textContent = Math.round(zoom * 100) + "%";
  const bar = $("#groupZoomBar");
  if (bar) bar.style.display = "flex";
}

function setGroupPreview(jobs, driver = null) {
  const target = $("#groupCargoPreview");
  if (!target) return;
  state._groupCtfJobs = jobs;
  if (!jobs.length) {
    target.innerHTML = `<div class="empty-state">เลือกกลุ่มงานหรือเลือก House เพื่อดู Preview</div>`;
    return;
  }
  if (state.groupingTab === "outbound") {
    // Outbound: Cargo Transfer Form
    if (driver) {
      const dEl = $("#groupCtfDriver"); if (dEl && !dEl.value) dEl.value = driver.name || "";
      const pEl = $("#groupCtfPlate"); if (pEl && !pEl.value) pEl.value = driver.vehiclePlate || "";
    }
    refreshGroupCtfPreview();
  } else {
    // Inbound: Cargo Pickup Form with zoom
    state._lastGroupHtml = cargoSheetHtml(cargoDataFromJobs(jobs, driver));
    applyGroupZoom(state.groupPreviewZoom ?? getGroupPreviewFitZoom());
  }
}

function refreshGroupCtfPreview() {
  const target = $("#groupCargoPreview");
  if (!target) return;
  const jobs = state._groupCtfJobs || [];
  if (!jobs.length) return;
  const allJobs = state.dashboard?.jobs || [];
  // Driver info from left-panel #obDriver dropdown
  const users = assignableUsers();
  const obSel = document.getElementById("obDriver");
  const driver = users.find(u => u.id === obSel?.value) || null;
  const velType = document.getElementById("obVelType")?.value || "6 ล้อ";
  const tmo     = document.getElementById("obTmo")?.value     || "INTER";
  target.innerHTML = buildCtfPreviewHtml({
    driver:   driver?.name || "",
    plate:    driver?.vehiclePlate || "",
    velType,
    tmo,
    relBy:    "",
    unloadBy: "",
    rows: jobs.map(j => ({
      houseNumber: j.houseNumber,
      flightNumber: j.flightNo || j.flightNumber || "",
      customerName: j.customerName || "",
      destination: j.destAirport || j.destination || "",
      pieces: j.pieceCount || "",
      awbNumber: j.awbNumber || ""
    })),
    jobs: allJobs
  });
}


// ── Outbound Wizard helpers ──────────────────────────────────────────────────
function toggleObGroup(idx) {
  selectOutboundGroup(idx);
}

function updateCtfWizardPreview() {
  if (!state.groupWizard.open || state.groupWizard.mode !== "outbound") return;
  state.groupWizard.ctfMeta = state.groupWizard.ctfMeta || {};
  document.querySelectorAll("[data-ctf-meta]").forEach(el => {
    state.groupWizard.ctfMeta[el.dataset.ctfMeta] = el.value;
  });
  const canvas = document.querySelector(".wizard-paper-canvas");
  if (!canvas) return;
  const selJobs = groupWizardSelectedJobs();
  if (!selJobs.length) return;
  const _pages = computeWizardPagesAndDrivers(selJobs);
  state.groupWizard._computedPages = _pages;
  const cur = Math.min(state.groupWizard.currentPage || 0, _pages.length - 1);
  const pageJobs = _pages[cur]?.jobs || selJobs;
  const pd = getPageDriver(cur);
  const m = state.groupWizard.ctfMeta;
  canvas.innerHTML = buildCtfPreviewHtml({
    driver: m.driver || pd?.name || "",
    plate:  m.plate  || pd?.vehiclePlate || "",
    velType: m.velType || "6 ล้อ",
    tmo:    m.tmo    || "INTER",
    relBy:  m.relBy  || "",
    unloadBy: m.unloadBy || "",
    rows: pageJobs.map(j => ({
      houseNumber: j.houseNumber,
      flightNumber: j.flightNo || j.flightNumber || "",
      customerName: j.customerName || "",
      destination: j.destination || j.destAirport || "",
      pieces: j.pieceCount || j.pieces || "",
      awbNumber: j.awbNumber || ""
    })),
    jobs: state.dashboard?.jobs || []
  });
}

function renderGroupPreview() {
  if (state.groupWizard.open) {
    updateGroupWizardPreview();
    return;
  }
  setGroupingContext([]);
  setGroupPreview([], null);
}

function renderManualGroupList() {
  const list = $("#manualGroupList");
  const count = $("#manualGroupCount");
  if (count) count.textContent = `${adminUnopenedJobs().length} งาน`;
  if (!list || list.classList.contains("hidden-legacy")) return;
  renderManualGroupDriverOptions();
  const availableJobs = adminUnopenedJobs();
  const jobs = manualGroupVisibleJobs();
  state.selectedManualHouses = state.selectedManualHouses.filter(house => availableJobs.some(job => job.houseNumber === house));
  $("#manualGroupCount").textContent = state.selectedManualHouses.length ? `${state.selectedManualHouses.length} ${localizeText("เลือก / selected")}` : `${jobs.length} ${localizeText("งาน / jobs")}`;
  list.innerHTML = jobs.length ? jobs.slice(0, 120).map(job => `
    <label class="manual-group-item ${state.selectedManualHouses.includes(job.houseNumber) ? "selected" : ""}">
      <input type="checkbox" value="${job.houseNumber}" ${state.selectedManualHouses.includes(job.houseNumber) ? "checked" : ""}>
      <span>
        <strong>${job.houseNumber}</strong>
        <small>${job.customerName || "-"} / ${job.pickupDate || toDateInput(job.flightTime) || "-"} / ${job.flightNo || "-"}</small>
      </span>
      <b>${job.destination || job.routeType || "WH3"}</b>
    </label>
  `).join("") : `<div class="empty-state compact">${localizeText("ไม่มี House ที่ยังไม่ได้ออกใบ Cargo / No unissued houses")}</div>`;
}

function prepareAdminFormForJobs(jobs, driver = null) {
  if (!jobs.length) return;
  fillAdminFormFromJobs(jobs);
  if (driver) {
    $("#adminDriverSelect").value = driver.id;
    $("#adminDriverName").value = driver.name || "";
    $("#adminVehiclePlate").value = driver.vehiclePlate || "";
  } else if (!$("#adminDriverName").value.trim()) {
    applyAdminDriver();
  }
  renderCargoPreview();
  updateAdminBatchSummary();
}

function adminPayloadFromCurrentForm() {
  const rows = adminPickupRows();
  return {
    rows,
    payload: {
      houseNumber: $("#adminHouse").value.trim(),
      customerId: $("#adminCustomer").value,
      pickupCase: $("#adminPickupCase").value,
      cargoFormMode: $("#adminPickupCase").value === "SpecialMD" ? "AdminPrepared" : "DriverWrites",
      adminPrepared: $("#adminPickupCase").value === "SpecialMD",
      pickupDate: rows[0]?.pickupDate || $("#adminPickupDate").value,
      pickupLocation: $("#adminPickupLocation").value.trim(),
      driverId: $("#adminDriverSelect").value,
      driverName: $("#adminDriverName").value.trim(),
      vehiclePlate: $("#adminVehiclePlate").value.trim(),
      pieceCount: $("#adminPieceCount").value,
      pickupItems: $("#adminPickupItems").value,
      packageType: $("#adminPackageType").value,
      destination: $("#adminDestination").value,
      stickerColor: $("#adminStickerColor").value.trim(),
      flightNo: $("#adminFlightNo").value.trim(),
      flightTime: datetimeLocalToIso($("#adminFlightTime").value),
      productType: $("#adminProductType").value,
      routeType: $("#adminRouteType").value,
      amount: $("#adminAmount").value
    }
  };
}

async function issueAdminCargoFromCurrentForm() {
  const { rows, payload } = adminPayloadFromCurrentForm();
  const data = await api(rows.length > 1 ? "/api/admin/job-batch" : "/api/admin/job", payload);
  if (data.dashboard) state.dashboard = data.dashboard;
  const createdJobs = data.jobs || (data.job ? [data.job] : []);
  if (createdJobs[0]) state.selectedHouse = createdJobs[0].houseNumber;
  state.selectedManualHouses = state.selectedManualHouses.filter(house => !createdJobs.some(job => job.houseNumber === house));
  renderAll();
  return createdJobs;
}

function cargoHistoryFilteredJobs() {
  const search = (state.cargoHistoryFilters.search || "").trim().toLowerCase();
  const from = state.cargoHistoryFilters.from;
  const to = state.cargoHistoryFilters.to;
  return adminIssuedCargoJobs().filter(job => {
    const issuedDate = job.cargoIssuedAt ? dateInputValue(new Date(job.cargoIssuedAt)) : "";
    if (from && issuedDate < from) return false;
    if (to && issuedDate > to) return false;
    if (!search) return true;
    return [job.houseNumber, job.customerName, job.driverName, job.vehiclePlate]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

function renderCargoHistory() {
  const list = $("#adminIssuedQueue");
  const count = $("#adminIssuedCount");
  if (!list) return;
  const jobs = cargoHistoryFilteredJobs();
  if (count) count.textContent = `${jobs.length} ${localizeText("ใบ / docs")}`;
  if (!jobs.some(job => job.houseNumber === state.selectedHistoryHouse)) {
    state.selectedHistoryHouse = jobs[0]?.houseNumber || "";
  }
  list.innerHTML = jobs.length ? jobs.slice(0, 80).map(job => `
    <button class="queue-job history-job ${state.selectedHistoryHouse === job.houseNumber ? "selected" : ""}" type="button" data-admin-issued-house="${job.houseNumber}">
      <span class="queue-main">
        <strong>${job.houseNumber}</strong>
        <small>${job.customerName || "-"} / ${job.driverName || "-"} / ${job.vehiclePlate || "-"}</small>
      </span>
      <span class="queue-tags">
        <b class="ok">ออกใบแล้ว</b>
        <b>${job.cargoIssuedAt ? new Date(job.cargoIssuedAt).toLocaleDateString("th-TH") : "-"}</b>
      </span>
    </button>
  `).join("") : `<div class="empty-state compact">ยังไม่มีประวัติใบ Cargo ตามตัวกรอง</div>`;
  renderHistoryCargoPreview();
}

function renderHistoryCargoPreview() {
  const target = $("#historyCargoPreview");
  if (!target) return;
  const job = findExactJob(state.selectedHistoryHouse);
  target.innerHTML = job
    ? cargoSheetHtml(jobCargoData(job))
    : `<div class="empty-state">เลือกประวัติใบ Cargo เพื่อดู Preview</div>`;
}

function openAutoGroupModal(index) {
  const group = state.adminQueueGroups[Number(index)];
  if (!group) return;
  openGroupWizard({ mode: "auto", groupIndex: Number(index), jobs: group.jobs });
  return;
  state.activeAutoGroupIndex = Number(index);
  $("#autoGroupTitle").textContent = group.customerName || localizeText("กลุ่มงานอัตโนมัติ / Auto Group");
  $("#autoGroupSummary").textContent = `${group.jobs.length} งาน / ${group.pickupDate || "-"} / ${group.pickupLocation || "-"} / ${group.flightNo || "-"}`;
  $("#autoGroupDetails").innerHTML = group.jobs.slice(0, 20).map(job => `
    <div class="auto-group-row">
      <strong>${job.houseNumber}</strong>
      <span>${job.customerName || "-"} / ${job.destination || job.routeType || "WH3"} / ${job.pieceCount || "-"} pcs</span>
    </div>
  `).join("");
  setGroupPreview(group.jobs, manualGroupDriver());
  $("#autoGroupModal")?.classList.add("show");
  $("#autoGroupModal")?.setAttribute("aria-hidden", "false");
}

const NEXT_STEP_TH = {
  Pending: "CS ยืนยัน + จ่ายงานคนขับ",
  Assigned: "คนขับเช็คอินรับสินค้า",
  Pickup: "ส่งสินค้าเข้าคลัง WH3",
  PickupStarted: "ส่งสินค้าเข้าคลัง WH3",
  CargoLoaded: "ส่งสินค้าเข้าคลัง WH3",
  Delivered: "สแกนรับเข้าคลัง (Twin-scan)",
  Inbound: "เก็บเข้า Location",
  HouseIdentified: "เก็บเข้า Location",
  Stored: "รอจัดออก / เตรียมส่ง Terminal",
  ReadyForTerminal: "ส่งเข้า Terminal + ตรวจเอกสาร Lithium",
  TerminalArrived: "ชั่งน้ำหนัก + X-Ray",
  WeightDimensionRecorded: "ผ่าน X-Ray",
  XRayPassed: "อัป Loading Detail",
  XRayHold: "⚠ แก้ปัญหา X-Ray ด่วน",
  ReXRayRequired: "⚠ ส่ง X-Ray ซ้ำ",
  LoadingReady: "ปิดงานขึ้นเครื่อง",
  Completed: "ตรวจเอกสารวางบิล",
  PendingBillingReview: "Billing ตรวจเอกสาร",
  ReadyForBilling: "ออก Invoice",
  InvoiceSent: "รอลูกค้าชำระ",
  Billed: "จบงานครบวงจร ✓"
};

const ACT_TH = {
  CSConfirm: "CS ยืนยัน Invoice", PickupCheckin: "คนขับเช็คอินรับสินค้า", Pickup: "รับสินค้า",
  ScanHouse: "สแกน House", TwinScan: "Twin-scan เข้าคลัง", MoveLocation: "ย้าย Location",
  InboundClose: "ปิดรับเข้า", DocumentCheck: "ตรวจเอกสาร", XRay: "X-Ray", Weigh: "ชั่งน้ำหนัก",
  LoadingDetail: "อัป Loading Detail", ImportConsol: "Import Consol", ActionName: "ดำเนินการ"
};

async function loadJobTimeline(job) {
  const nextEl = document.getElementById("jqvNext");
  if (nextEl) {
    const nx = NEXT_STEP_TH[job.status] || "-";
    nextEl.innerHTML = `<span>ขั้นถัดไป</span><strong>${safeHtml(nx)}</strong>`;
  }
  const tl = document.getElementById("jqvTimeline");
  if (!tl) return;
  try {
    const res = await fetch(apiUrl(`/api/jobs/timeline?houseNumber=${encodeURIComponent(job.houseNumber)}`));
    const data = await res.json();
    if (state.quickViewHouse !== job.houseNumber) return;
    const acts = data.activities || [];
    const files = data.files || [];
    tl.innerHTML = `
      <div class="jqv-tl-head">
        <strong>ประวัติการทำงาน</strong>
        <span>${files.length ? `📎 เอกสาร/รูป ${files.length} ไฟล์` : "ยังไม่มีไฟล์แนบ"}</span>
      </div>
      ${acts.length ? acts.map(a => `
        <div class="jqv-tl-item">
          <span class="jqv-tl-dot"></span>
          <div>
            <strong>${safeHtml(ACT_TH[a.activityType] || a.activityType || "-")}${a.location ? ` · ${safeHtml(a.location)}` : ""}</strong>
            <small>${safeHtml(a.userName || "-")} · ${safeHtml(a.timeLabel || "")}</small>
          </div>
        </div>`).join("") : `<small class="jqv-tl-empty">ยังไม่มีประวัติการทำงาน</small>`}`;
  } catch (e) {
    tl.innerHTML = `<small class="jqv-tl-empty">โหลดประวัติไม่สำเร็จ</small>`;
  }
}

function openJobQuickView(houseNumber) {
  const job = findExactJob(houseNumber) || findJob(houseNumber);
  if (!job) return;
  state.quickViewHouse = job.houseNumber;
  const stages = [
    { label: "รับงาน / Accept", statuses: ["Pending", "Assigned"] },
    { label: "รับเข้า / Inbound", statuses: ["Inbound", "PickupStarted", "DocumentChecked", "InboundOpened", "HouseIdentified"] },
    { label: "คลัง / Storage", statuses: ["Stored", "ReadyForTerminal", "OutboundLocated", "OutboundPicking", "EIApproved", "AOTQueueBooked", "AOTQueueApproved"] },
    { label: "Terminal", statuses: ["GoodsLoaded", "TerminalArrived", "WeightDimensionRecorded", "XRayPassed", "PackingConsolidation", "ReadyForBilling", "InvoiceDrafted", "InvoiceSent"] },
    { label: "เสร็จสิ้น / Done", statuses: ["Billed", "Completed"] }
  ];
  const currentStage = stages.findIndex(s => s.statuses.includes(job.status));
  const pipelineHtml = stages.map((s, i) => {
    const cls = i < currentStage ? "done" : i === currentStage ? "current" : "";
    const line = i > 0 ? `<div class="jqv-line${i <= currentStage ? " done" : ""}"></div>` : "";
    return `${line}<div class="jqv-stage ${cls}"><span>${i + 1}</span><small>${localizeText(s.label)}</small></div>`;
  }).join("");
  const issued = Boolean(job.cargoIssuedAt);
  const lh = typeof job.hoursToFlight === "number" ? job.hoursToFlight.toFixed(1) : null;
  const el = id => document.getElementById(id);
  if (el("jqvTitle")) el("jqvTitle").textContent = job.houseNumber;
  if (el("jqvSubtitle")) el("jqvSubtitle").textContent = job.customerName || "-";
  if (el("jqvStatus")) el("jqvStatus").innerHTML = `<span class="pill ${statusClass(job.status)}" title="${job.status}">${statusLabelTh(job.status)}</span>`;
  if (el("jqvPipeline")) el("jqvPipeline").innerHTML = pipelineHtml;
  if (el("jqvBody")) el("jqvBody").innerHTML = `
    <div class="jqv-grid">
      <div class="jqv-row"><span>Flight</span><strong>${safeHtml(job.flightNo || "-")}</strong></div>
      <div class="jqv-row"><span>Destination</span><strong>${safeHtml(job.destination || job.routeType || "WH3")}</strong></div>
      <div class="jqv-row"><span>กำหนดบิน / Flight Time</span><strong>${safeHtml(job.flightTimeLabel || "-")}</strong></div>
      <div class="jqv-row"><span>Lead Time</span><strong class="${lh !== null && parseFloat(lh) < 0 ? "jqv-red" : "jqv-blue"}">${lh ? lh + " " + localizeText("ชม. / hrs") : "-"}</strong></div>
      <div class="jqv-row"><span>Cargo</span><strong class="${issued ? "jqv-green" : "jqv-orange"}">${issued ? localizeText("✓ ออกใบแล้ว / ✓ Issued") : localizeText("⚠ ยังไม่ออกใบ / ⚠ Not issued")}</strong></div>
      <div class="jqv-row"><span>Red Flag</span><strong class="${job.redFlag ? "jqv-red" : "jqv-muted"}">${job.redFlag ? localizeText("⚠ เสี่ยงเกินเวลา / ⚠ At risk") : localizeText("ปกติ / Normal")}</strong></div>
    </div>
  `;
  if (el("jqvGoGroup")) el("jqvGoGroup").style.display = issued ? "none" : "";
  if (el("jqvBody")) {
    el("jqvBody").insertAdjacentHTML("beforeend", `
      <div class="jqv-next" id="jqvNext"></div>
      <div class="jqv-timeline" id="jqvTimeline"><small class="jqv-tl-empty">กำลังโหลดประวัติ...</small></div>`);
  }
  const modal = $("#jobQuickModal");
  modal?.classList.add("show");
  modal?.setAttribute("aria-hidden", "false");
  loadJobTimeline(job);
}

function closeJobQuickView() {
  const modal = $("#jobQuickModal");
  modal?.classList.remove("show");
  modal?.setAttribute("aria-hidden", "true");
  state.quickViewHouse = null;
}

function closeAutoGroupModal() {
  closeGroupWizard();
  return;
  $("#autoGroupModal")?.classList.remove("show");
  $("#autoGroupModal")?.setAttribute("aria-hidden", "true");
}

function renderRecentOrders() {
  const jobs = dashboardFilteredJobs();
  $("#recentOrdersTable").innerHTML = jobs.slice(0, 10).map(job => `
    <tr class="clickable-row" data-quick-house="${job.houseNumber}">
      <td><strong>${job.houseNumber}</strong><small>${job.id}</small></td>
      <td><span class="pill ${statusClass(job.status)}" title="${job.status}">${statusLabelTh(job.status)}</span></td>
      <td>${job.customerName}</td>
      <td>${job.flightNo}<small>${job.destination || job.routeType || "WH3"} · ${job.flightTimeLabel}</small></td>
      <td><div class="lead-bar"><span style="width:${Math.max(8, Math.min(100, 100 - job.hoursToFlight * 8))}%"></span></div>${job.hoursToFlight} hrs</td>
    </tr>
  `).join("") || `<tr><td colspan="5">${localizeText("ไม่พบงานตามตัวกรอง / No orders match filter")}</td></tr>`;
}

function orderMatchesFilter(job, filter = state.orderFilter) {
  const today = dateInputValue(new Date());
  if (filter === "today") return jobDateKey(job) === today;
  if (filter === "pending") return ["st-gray", "st-amber"].includes(statusClass(job.status)) || ["Pending", "PickupStarted"].includes(job.status);
  if (filter === "overdue") return Boolean(job.redFlag) || statusClass(job.status) === "st-red";
  return true;
}

function orderFilterCounts() {
  const jobs = state.dashboard?.jobs || [];
  return {
    today: jobs.filter(job => orderMatchesFilter(job, "today")).length,
    pending: jobs.filter(job => orderMatchesFilter(job, "pending")).length,
    overdue: jobs.filter(job => orderMatchesFilter(job, "overdue")).length,
    all: jobs.length
  };
}

function renderOrderAlertSummary() {
  const el = $("#orderAlertSummary");
  if (!el || !state.dashboard) return;
  const jobs = state.dashboard.jobs || [];
  const now = Date.now();
  const reXrayJobs = jobs.filter(j => j.requiresRescan || j.status === "ReXRayRequired" || j.status === "XRayHold");
  const urgentJobs = jobs.filter(j => {
    const ft = j.flightTime ? new Date(j.flightTime).getTime() : 0;
    const diffH = ft ? (ft - now) / 3600000 : 99;
    const done = ["XRayPassed","ReadyForBilling","BillingReviewed","InvoiceDrafted","InvoiceSent","Billed"];
    return ft && diffH < 4 && diffH > 0 && !done.includes(j.status);
  });
  const pendingEI = jobs.filter(j => j.status === "PendingEI" || j.inboundDocStatus === "Missing");
  let html = "";
  if (reXrayJobs.length) html += `<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="state.orderFilter='overdue';renderOrderCards()">
    <span style="font-size:18px">🚨</span>
    <div><div style="font-weight:800;color:#dc2626;font-size:12px">Re-X-Ray Required — ${reXrayJobs.length} งาน</div>
    <div style="font-size:11px;color:#ef4444">${reXrayJobs.map(j=>j.houseNumber).join(", ")}</div></div>
  </div>`;
  if (urgentJobs.length) html += `<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="state.orderFilter='overdue';renderOrderCards()">
    <span style="font-size:18px">⏰</span>
    <div><div style="font-weight:800;color:#d97706;font-size:12px">บินภายใน 4 ชั่วโมง — ${urgentJobs.length} งาน</div>
    <div style="font-size:11px;color:#b45309">${urgentJobs.map(j=>j.houseNumber).join(", ")}</div></div>
  </div>`;
  if (pendingEI.length) html += `<div style="background:#fefce8;border:1.5px solid #fde047;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="state.orderFilter='overdue';renderOrderCards()">
    <span style="font-size:18px">📄</span>
    <div><div style="font-weight:800;color:#a16207;font-size:12px">รอ Confirm EI — ${pendingEI.length} งาน</div>
    <div style="font-size:11px;color:#a16207">${pendingEI.map(j=>j.houseNumber).join(", ")}</div></div>
  </div>`;
  el.innerHTML = html;
  el.style.display = html ? "flex" : "none";
}

function renderOrderFilterCounts() {
  const counts = orderFilterCounts();
  $("#orderFilterToday").textContent = counts.today;
  $("#orderFilterPending").textContent = counts.pending;
  $("#orderFilterOverdue").textContent = counts.overdue;
  $("#orderFilterAll").textContent = counts.all;
  $$("[data-order-filter]").forEach(button => {
    button.classList.toggle("active", button.dataset.orderFilter === state.orderFilter);
  });
}

function orderVisibleJobs() {
  const query = ($("#orderSearch")?.value || $("#globalSearch")?.value || "").toLowerCase();
  return (state.dashboard?.jobs || []).filter(job => {
    const haystack = `${job.houseNumber} ${job.customerName} ${job.flightNo} ${job.status}`.toLowerCase();
    return orderMatchesFilter(job) && haystack.includes(query);
  });
}

function renderOrderCards() {
  renderOrderFilterCounts();
  renderOrderAlertSummary();
  const jobs = orderVisibleJobs();
  if (!jobs.some(job => job.houseNumber === state.selectedHouse) && jobs[0]) {
    state.selectedHouse = jobs[0].houseNumber;
  }
  if (!jobs.length) {
    state.selectedHouse = "";
    $("#orderCards").innerHTML = `<div class="empty-state compact">${localizeText("ไม่พบงานตามตัวกรองนี้ / No orders in this filter")}</div>`;
    renderTimeline();
    applyLanguage();
    return;
  }
  $("#orderCards").innerHTML = jobs.map(job => {
    const now = Date.now();
    const ftMs = job.flightTime ? new Date(job.flightTime).getTime() : 0;
    const diffH = ftMs ? (ftMs - now) / 3600000 : 99;
    const doneStatuses = ["XRayPassed","ReadyForBilling","BillingReviewed","InvoiceDrafted","InvoiceSent","Billed"];
    const isUrgent = ftMs && diffH < 4 && diffH > 0 && !doneStatuses.includes(job.status);
    const isMissed = ftMs && diffH <= 0 && !doneStatuses.includes(job.status);
    const isReXray = job.requiresRescan || job.xrayStatus === "Hold" || job.status === "ReXRayRequired" || job.status === "XRayHold";
    let urgentBadge = "";
    if (isReXray) urgentBadge = `<span style="background:#fef2f2;color:#dc2626;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;animation:pulse 1.5s infinite">⚠ RE-XRAY</span>`;
    else if (isMissed) urgentBadge = `<span style="background:#fef2f2;color:#dc2626;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px">✗ เลยเวลาบิน</span>`;
    else if (isUrgent) urgentBadge = `<span style="background:#fffbeb;color:#d97706;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px">⏰ ${Math.floor(diffH)}ชม.${Math.floor((diffH%1)*60)}น.</span>`;
    const cardBorder = isReXray || isMissed ? "border-left:3px solid #ef4444" : isUrgent ? "border-left:3px solid #f59e0b" : "";
    return `<button class="order-card ${job.houseNumber === state.selectedHouse ? "active" : ""}" type="button" data-house="${job.houseNumber}" style="${cardBorder}">
      <span class="cube">□</span>
      <strong>${job.houseNumber}</strong>
      <small>${job.customerName || "-"} / ${job.flightTimeLabel || "-"}</small>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin:2px 0">
        <span class="pill ${statusClass(job.status)}" title="${job.status}">${statusLabelTh(job.status)}</span>
        ${urgentBadge}
        ${!job.csConfirmed ? '<span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:800;padding:2px 5px;border-radius:4px">🔒 รอ CS</span>' : ""}
        ${(state.loadPlan?.rows||[]).some(r=>r.houseNumber===job.houseNumber)?'<span style="background:#eff6ff;color:#1d4ed8;font-size:9px;font-weight:800;padding:2px 5px;border-radius:4px">✈ LP</span>':""}
      </div>
    </button>`;
  }).join("");

  $$(".order-card").forEach(card => {
    card.addEventListener("click", () => {
      state.selectedHouse = card.dataset.house;
      state.previewClosedHouse = "";
      renderOrderCards();
      renderTimeline();
    });
  });
  renderTimeline();
}

function renderTimelineLegacyUnused() {
  const job = findJob();
  if (!job) {
    $("#selectedOrderTitle").textContent = localizeText("ยังไม่มีงาน / No order");
    $("#selectedOrderSubtitle").textContent = "Import file or create a job first";
    $("#timelineList").innerHTML = `<div class="empty-state">${localizeText("เลือกงานด้านซ้าย หรือ import CSV เพื่อดูรายละเอียด / Select an order or import CSV.")}</div>`;
    return;
  }
  $("#selectedOrderTitle").textContent = job.houseNumber;
  $("#selectedOrderSubtitle").textContent = `${job.customerName} · ID: ${job.id}`;
  $("#hazardInfo").textContent = job.requiresLithiumDocs ? "Yes / Lithium" : "No";
  $("#pickupCaseInfo").textContent = job.pickupCase || "-";
  $("#destinationInfo").textContent = job.destination || job.routeType || "-";
  $("#driverInfo").textContent = [job.driverName, job.vehiclePlate].filter(Boolean).join(" / ") || "-";
  $("#piecesInfo").textContent = job.pieceCount || "-";
  $("#pickupItemsInfo").textContent = Array.isArray(job.pickupItems) && job.pickupItems.length
    ? `${job.pickupItems.length} rows`
    : "-";
  $("#packageInfo").textContent = job.packageType || "-";
  $("#stickerInfo").textContent = job.stickerColor || "-";

  const steps = [
    ["Pickup", "รับสินค้าจากลูกค้า / Cargo picked up", PICKUP_DONE_STATUSES.includes(job.status)],
    ["Load Cargo", localizeText("ตรวจ 10 รายการ แปะ Sticker ถ้าจำเป็น / Check 10 items & attach sticker"), LOAD_DONE_STATUSES.includes(job.status)],
    ["Inbound Receive", "รับเข้าคลัง WH3 และจัดตำแหน่ง / Received at WH3", INBOUND_DONE_STATUSES.includes(job.status)],
    ["Document Check", "ตรวจเอกสาร Permit / Cargo Transfer / Lithium", Boolean(job.documentValidated || job.inboundDocStatus || job.eiApproved)],
    ["X-Ray", "ตรวจ X-Ray ก่อนเข้าถาดโหลด / Terminal security scan", job.xrayStatus === "Passed"],
    ["Loading Detail", localizeText("รวม flight และอัปโหลด Loading Detail / Upload Loading Detail"), Boolean(job.loadingDetailUploaded)],
    ["Billing", "สร้างเอกสารวางบิล / Invoice generated", job.status === "Billed"]
  ];

  $("#timelineList").innerHTML = steps.map((step, index) => `
    <div class="timeline-item ${step[2] ? "done" : index === 0 ? "active" : ""}">
      <span>${step[2] ? "✓" : index + 1}</span>
      <div>
        <strong>${step[0]}</strong>
        <p>${step[1]}</p>
        <small>${step[2] ? "Completed" : "Pending"}</small>
      </div>
    </div>
  `).join("");

  // Load Plan tag button
  const lpRows = state.loadPlan?.rows || [];
  const inPlan = lpRows.some(r => r.houseNumber === job.houseNumber);
  const lpBtn = document.getElementById("tlLpTagBtn");
  if (lpBtn) {
    lpBtn.textContent = inPlan ? "✈ อยู่ใน Load Plan แล้ว (คลิกเพื่อลบ)" : "✈ เพิ่มเข้า Load Plan";
    lpBtn.style.background = inPlan ? "#dcfce7" : "#eff6ff";
    lpBtn.style.color = inPlan ? "#15803d" : "#1d4ed8";
    lpBtn.style.borderColor = inPlan ? "#86efac" : "#bfdbfe";
    lpBtn.onclick = async () => {
      const action = inPlan ? "remove" : "add";
      try {
        const res = await api("/api/loadplan/tag", { houseNumber: job.houseNumber, action, userId: state.user?.id });
        if (res.ok) {
          state.loadPlan = res.plan;
          toast(action === "add" ? `เพิ่ม ${job.houseNumber} เข้า Load Plan แล้ว` : `ลบ ${job.houseNumber} ออกจาก Load Plan แล้ว`, "success");
          renderTimeline();
          renderOrderCards();
        }
      } catch(e) { toast(e.message, "error"); }
    };
  }
}

function staffStat(userId) {
  return state.dashboard?.staffStats?.find(item => item.userId === userId) || { totalJobs: 0, completedJobs: 0, errors: 0, averageDurationMinutes: 0, kpi: 0 };
}

function staffRoleLabel(role) {
  const labels = { Driver: "คนขับรถ / Driver", WH_Staff: "คลัง WH3 / WH Staff", Terminal: "Terminal", Billing: "บัญชี / Billing", Admin: "แอดมิน / Admin", Executive: "ผู้บริหาร / Executive" };
  return localizeText(labels[role] || role || "-");
}

function durationLabel(minutes) {
  const value = Number(minutes || 0);
  if (!value) return "-";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`;
}

function renderStaffDetail(user) {
  if (!user) return;
  const stat = staffStat(user.id);
  state.selectedStaffId = user.id;
  $("#staffDetailAvatar").textContent = (user.name || "-")[0].toUpperCase();
  $("#staffDetailName").textContent = user.name || "-";
  $("#staffDetailMeta").textContent = `${staffRoleLabel(user.role)} · ${user.code || user.id}${user.vehiclePlate ? ` · ${user.vehiclePlate}` : ""}`;
  $("#staffDetailJobs").textContent = stat.totalJobs;
  $("#staffDetailCompleted").textContent = stat.completedJobs;
  $("#staffDetailDuration").textContent = durationLabel(stat.averageDurationMinutes);
  $("#staffDetailKpi").textContent = `${stat.kpi}%`;
  $("#staffCompletedMetric").textContent = stat.completedJobs;
  $("#staffErrorMetric").textContent = stat.errors;
}

function renderStaff() {
  const users = state.users || [];
  const stats = state.dashboard?.staffStats || [];
  $("#staffTotal").textContent = users.length;
  $("#staffAvgKpi").textContent = `${stats.length ? Math.round(stats.reduce((sum, item) => sum + item.kpi, 0) / stats.length) : 0}%`;
  $("#staffLineConnected").textContent = users.filter(user => user.lineConnected || user.lineUserId).length;
  renderTeamDepartments(users);
  const visibleUsers = state.staffRoleFilter === "All" ? users : users.filter(user => user.role === state.staffRoleFilter);
  $("#staffTable").innerHTML = visibleUsers.map((staff, index) => {
    const stat = staffStat(staff.id);
    const code = staff.code || `EMP${String(index + 1).padStart(3, "0")}`;
    return `
    <tr>
      <td><strong>${code}</strong></td>
      <td><span class="mini-avatar">${staff.name[0]}</span>${staff.name}</td>
      <td><span class="pill ${staff.role === "Driver" ? "pending" : "inbound"}">${staffRoleLabel(staff.role)}</span>${staff.vehiclePlate ? `<small>${staff.vehiclePlate}</small>` : ""}</td>
      <td>${stat.totalJobs}</td>
      <td>${stat.completedJobs}</td>
      <td>${durationLabel(stat.averageDurationMinutes)}</td>
      <td><div class="lead-bar"><span style="width:${stat.kpi}%"></span></div>${stat.kpi}%</td>
      <td><button class="staff-row-action" type="button" data-staff-id="${staff.id}" title="ดูหรือแก้ไข"><i data-lucide="square-pen"></i></button></td>
    </tr>
  `; }).join("");
  const selected = users.find(user => user.id === state.selectedStaffId) || users[0];
  if (selected) renderStaffDetail(selected);
}

function renderTeamDepartments(users = state.users || []) {
  const grid = $("#teamDepartmentGrid");
  if (!grid) return;
  const departments = [
    { role: "Driver", label: "คนขับรถ / Driver", icon: "truck" },
    { role: "WH_Staff", label: "คลัง WH3 / WH Staff", icon: "warehouse" },
    { role: "Terminal", label: "Terminal", icon: "plane" },
    { role: "Billing", label: "บัญชี / Billing", icon: "receipt-text" },
    { role: "Admin", label: "แอดมิน / Admin", icon: "shield-check" }
  ];
  grid.innerHTML = departments.map(department => {
    const members = users.filter(user => user.role === department.role);
    const stats = members.map(member => staffStat(member.id));
    const jobs = stats.reduce((sum, stat) => sum + stat.totalJobs, 0);
    const completed = stats.reduce((sum, stat) => sum + stat.completedJobs, 0);
    const pending = Math.max(0, jobs - completed);
    const kpi = stats.length ? Math.round(stats.reduce((sum, stat) => sum + stat.kpi, 0) / stats.length) : 0;
    const riskClass = pending > Math.max(3, members.length * 3) ? "capacity-risk" : "";
    return `
      <button class="team-department-card ${state.staffRoleFilter === department.role ? "active" : ""} ${riskClass}" type="button" data-team-role="${department.role}">
        <span class="team-department-icon"><i data-lucide="${department.icon}" aria-hidden="true"></i></span>
        <span class="team-department-name"><strong>${localizeText(department.label)}</strong><small>${members.length} คน / ppl</small></span>
        <span class="team-stat"><small>งานค้าง / Pending</small><strong>${pending}</strong></span>
        <span class="team-stat"><small>เสร็จ / Done</small><strong>${completed}</strong></span>
        <span class="team-stat"><small>KPI</small><strong>${kpi}%</strong></span>
      </button>`;
  }).join("");
}

function setStaffVehicleVisibility() {
  $("#staffVehicleField").hidden = $("#staffRole").value !== "Driver";
}

function openStaffEditor(user = null) {
  $("#staffEditor").hidden = false;
  $("#staffEditor").dataset.editId = user?.id || "";
  $("#staffFormTitle").textContent = user ? "แก้ไขพนักงาน / Edit Staff" : "เพิ่มพนักงาน / Add Staff";
  $("#staffCode").value = user?.code || `EMP${String((state.users?.length || 0) + 1).padStart(3, "0")}`;
  $("#staffName").value = user?.name || "";
  $("#staffRole").value = user?.role || "Driver";
  $("#staffVehiclePlate").value = user?.vehiclePlate || "";
  $("#staffPhone").value = user?.phone || "";
  $("#staffLineId").value = user?.lineUserId || "";
  $("#staffStatus").value = user?.status === "Inactive" ? "Inactive" : "Active";
  setStaffVehicleVisibility();
  $("#staffName").focus();
}

function closeStaffEditor() {
  $("#staffEditor").hidden = true;
  $("#staffEditor").reset();
  $("#staffEditor").dataset.editId = "";
}

function renderLocations() {
  $("#locationList").innerHTML = state.dashboard.locations.map(location => `
    <article class="location">
      <strong>${location.id}</strong>
      <small>${location.status}${location.currentHouseId ? ` · ${location.currentHouseId}` : ""}</small>
    </article>
  `).join("");
}

function renderInvoices() {
  const html = state.dashboard.billing.length
    ? state.dashboard.billing.map(bill => `
      <article class="invoice">
        <strong>${bill.id}</strong>
        <small>${bill.customerName} · ${money(bill.amount)} บาท · ${bill.status}</small>
        ${bill.pdfUrl ? `<a href="${assetUrl(bill.pdfUrl)}" target="_blank" rel="noreferrer">เปิดเอกสาร / Open document</a>` : ""}
      </article>
    `).join("")
    : `<article class="invoice">ยังไม่มี Invoice / No invoices</article>`;
  $$("#invoiceList").forEach(el => el.innerHTML = html);
}

function renderBillingReadyList() {
  const list = $("#billingReadyList");
  if (!list || !state.dashboard) return;
  const jobs = state.dashboard.jobs.filter(job => job.readyForBilling || ["BillingReviewed", "InvoiceDrafted", "InvoiceSent", "PendingBillingReview"].includes(job.status));
  $("#billingReadyMetric").textContent = jobs.filter(job => job.readyForBilling).length;
  $("#billingBilledMetric").textContent = state.dashboard.billing.filter(bill => bill.status === "Billed").length;
  $("#billingBilledAmountMetric").textContent = money(state.dashboard.metrics?.billedAmount || 0);
  $("#billingPendingAmountMetric").textContent = money(state.dashboard.metrics?.pendingAmount || 0);
  const nowTs = Date.now();
  list.innerHTML = jobs.length ? jobs.map(job => {
    const bill = state.dashboard.billing?.find(b => b.jobs?.includes(job.houseNumber) || b.houseNumber === job.houseNumber);
    const dueDateMs = bill?.dueDate ? new Date(bill.dueDate).getTime() : (job.dueDate ? new Date(job.dueDate).getTime() : 0);
    const isOverdue = dueDateMs && dueDateMs < nowTs && !["Paid"].includes(job.status);
    const diffDays = dueDateMs ? Math.ceil((dueDateMs - nowTs) / 86400000) : null;
    let dueBadge = "";
    if (isOverdue) dueBadge = `<span style="background:#fef2f2;color:#dc2626;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px">⚠ OVERDUE ${Math.abs(diffDays)}วัน</span>`;
    else if (diffDays !== null && diffDays <= 3) dueBadge = `<span style="background:#fffbeb;color:#d97706;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px">⏰ ครบกำหนด ${diffDays}วัน</span>`;
    else if (dueDateMs) dueBadge = `<span style="color:#64748b;font-size:9px">Due ${new Date(dueDateMs).toLocaleDateString("th-TH")}</span>`;
    return `<article class="invoice billing-pick" data-billing-house="${job.houseNumber}" style="${isOverdue?"border-left:3px solid #ef4444;background:#fff8f8":diffDays!==null&&diffDays<=3?"border-left:3px solid #f59e0b":""}">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <strong>${job.houseNumber} · ${job.customerName || "-"}</strong>
        ${dueBadge}
      </div>
      <small>${job.status} · ${job.billingReviewStatus || "รอตรวจเอกสาร"} · ${money(job.amount || 0)} บาท</small>
    </article>`;
  }).join("") : `<article class="invoice">ยังไม่มีงานพร้อมวางบิล / No ready billing jobs</article>`;
  list.querySelectorAll("[data-billing-house]").forEach(item => {
    item.addEventListener("click", () => {
      $("#billingHouse").value = item.dataset.billingHouse;
      renderBillingContext();
      toast(`เลือก ${item.dataset.billingHouse}`);
    });
  });
  renderBillingContext();
}

function billingJobDate(job) {
  return String(job.pickupDate || job.terminalClosedAt || job.flightTime || job.updatedAt || "").slice(0, 10);
}

function billingPeriodForJob(job) {
  const day = Number(billingJobDate(job).slice(8, 10));
  if (!day) return "Unknown";
  if (day <= 10) return "1-10";
  if (day <= 20) return "11-20";
  return "21-End";
}

function billingPlanForJob(job) {
  const explicit = String(job.billingPlan || "");
  if (explicit) return explicit;
  const vehicle = String(job.vehicleType || "").toLowerCase();
  if (Number(job.amount) === 10000 || job.fixedRate === 10000) return "Fixed10000";
  if (/18|trailer|เทเลอร์/.test(vehicle)) return "Trailer";
  if (/6|six|6ล้อ/.test(vehicle) && (job.charter || Number(job.amount) >= 2000)) return "Charter6";
  return "General";
}

function billingPlanLabel(plan) {
  return { General: "งานทั่วไป", Trailer: "เหมาเทเลอร์", Charter6: "เหมา 6 ล้อ", Fixed10000: "เหมา 10,000" }[plan] || plan;
}

function billingPeriodLabel(period) {
  return period === "FullMonth" ? "รวมทั้งเดือน" : `รอบ ${period}`;
}

function billingTripKey(job) {
  return job.billingTripId || job.pickupBatchId || job.batchId || job.jobId
    || `${billingJobDate(job)}|${job.vehiclePlate || job.driverId || job.houseNumber}|${job.routeType || job.destination || ""}`;
}

function buildBillingBatchGroups() {
  const dateFrom = $("#batchDateFrom")?.value || "";
  const dateTo = $("#batchDateTo")?.value || "";
  const periodFilter = $("#batchPeriodFilter")?.value || "All";
  const planFilter = $("#batchPlanFilter")?.value || "All";
  const eligible = (state.dashboard?.jobs || []).filter(job => (
    job.readyForBilling || ["BillingReviewed", "InvoiceDrafted", "PendingBillingReview"].includes(job.status)
  )).filter(job => {
    const date = billingJobDate(job);
    return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
  }).filter(job => ["All", "FullMonth"].includes(periodFilter) || billingPeriodForJob(job) === periodFilter)
    .filter(job => planFilter === "All" || billingPlanForJob(job) === planFilter);

  const grouped = new Map();
  eligible.forEach(job => {
    const period = periodFilter === "FullMonth" ? "FullMonth" : billingPeriodForJob(job);
    const plan = billingPlanForJob(job);
    const key = `${job.customerId || job.customerName}|${billingJobDate(job).slice(0, 7)}|${period}|${plan}`;
    if (!grouped.has(key)) grouped.set(key, {
      id: `BG-${grouped.size + 1}`,
      key,
      customerId: job.customerId,
      customerName: job.customerName || "-",
      month: billingJobDate(job).slice(0, 7),
      period,
      plan,
      jobs: [],
      trips: []
    });
    grouped.get(key).jobs.push(job);
  });

  const groups = [...grouped.values()];
  groups.forEach(group => {
    const trips = new Map();
    group.jobs.forEach(job => {
      const key = billingTripKey(job);
      if (!trips.has(key)) trips.set(key, { key, jobs: [], amount: 0 });
      const trip = trips.get(key);
      trip.jobs.push(job);
      trip.amount = Math.max(trip.amount, Number(job.amount || 0));
    });
    group.trips = [...trips.values()];
    group.amount = group.trips.reduce((sum, trip) => sum + trip.amount, 0);
    group.reviewed = group.jobs.every(job => job.billingReviewStatus === "Reviewed" || ["BillingReviewed", "InvoiceDrafted"].includes(job.status));
  });
  return groups;
}

function renderBillingBatchBuilder() {
  if (!$("#billingBatchGroupList")) return;
  if (!$("#batchDateFrom").value) $("#batchDateFrom").value = state.filters.dateFrom;
  if (!$("#batchDateTo").value) $("#batchDateTo").value = state.filters.dateTo;
  state.billingBatchGroups = buildBillingBatchGroups();
  if (!state.billingBatchGroups.some(group => group.id === state.selectedBillingBatchId)) state.selectedBillingBatchId = "";
  $("#billingBatchCount").textContent = `${state.billingBatchGroups.length} ${localizeText("กลุ่ม / groups")}`;
  $("#billingBatchGroupList").innerHTML = state.billingBatchGroups.length ? state.billingBatchGroups.map(group => `
    <button class="billing-batch-card ${group.id === state.selectedBillingBatchId ? "active" : ""}" type="button" data-batch-id="${group.id}">
      <span>${group.period === "FullMonth" ? "เดือน" : group.period}</span>
      <span><strong>${group.customerName}</strong><small>${group.month} · ${billingPlanLabel(group.plan)}</small></span>
      <span class="billing-batch-stat"><small>เที่ยว</small><strong>${group.trips.length}</strong></span>
      <span class="billing-batch-stat"><small>House</small><strong>${group.jobs.length}</strong></span>
      <span class="billing-batch-stat"><small>ยอด</small><strong>${money(group.amount)}</strong></span>
    </button>`).join("") : `<div class="empty-state">ไม่พบงานพร้อมวางบิลในตัวกรองนี้</div>`;
  renderBillingBatchPreview();
}

function selectedBillingBatch() {
  return state.billingBatchGroups.find(group => group.id === state.selectedBillingBatchId);
}

function renderBillingBatchPreview() {
  const group = selectedBillingBatch();
  const preview = $("#billingBatchPreview");
  ["reviewBillingBatchBtn", "generateBillingBatchBtn", "exportBillingBatchBtn"].forEach(id => { $("#" + id).disabled = !group; });
  if (!group) {
    preview.innerHTML = `<div class="empty-state">เลือกกลุ่มเพื่อ Preview</div>`;
    return;
  }
  preview.innerHTML = `
    <h3>${group.customerName}</h3><p>${group.month} · ${billingPeriodLabel(group.period)} · ${billingPlanLabel(group.plan)}</p>
    <dl><dt>จำนวนเที่ยว</dt><dd>${group.trips.length}</dd><dt>จำนวน House</dt><dd>${group.jobs.length}</dd><dt>เอกสาร</dt><dd>${group.reviewed ? "พร้อม" : "รอตรวจ"}</dd><dt>ยอดรวม</dt><dd>${money(group.amount)} บาท</dd></dl>
    <label>ปรับยอดรวม (ถ้าจำเป็น)<input id="billingBatchAmount" type="number" min="0" value="${group.amount}"></label>
    <div class="batch-house-list">${group.jobs.map(job => `<span>${job.houseNumber}</span>`).join("")}</div>`;
}

function exportSelectedBillingBatch() {
  const group = selectedBillingBatch();
  if (!group) return;
  const headers = ["DATE", "HAWB", "SHIPPER", "PLACE LOAD", "CTN", "WEIGHT KGS.", "ทะเบียนรถ", "ประเภทรถ", "เที่ยว", "ค่าบริการ"];
  const rows = group.jobs.map(job => {
    const trip = group.trips.find(item => item.jobs.includes(job));
    const firstInTrip = trip?.jobs[0] === job;
    return [billingJobDate(job), job.houseNumber, job.customerName, job.routeType || job.destination || "", job.pieceCount || "", job.terminalWeight || job.weight || "", job.vehiclePlate || "", job.vehicleType || "", trip?.key || "", firstInTrip ? trip.amount : 0];
  });
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Billing_${group.month}_${group.period}_${group.plan}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function billingSelectedJob() {
  return findExactJob($("#billingHouse")?.value || "");
}

function selectedInvoice() {
  const invoiceId = $("#invoiceId")?.value.trim();
  const job = billingSelectedJob();
  return state.dashboard?.billing.find(bill => bill.id === invoiceId)
    || state.dashboard?.billing.find(bill => bill.houseNumber === job?.houseNumber && bill.status !== "Billed")
    || state.dashboard?.billing.find(bill => bill.houseNumber === job?.houseNumber);
}

function billingCustomerForJob(job) {
  return state.customers.find(customer => customer.id === job?.customerId)
    || state.customers.find(customer => customer.name === job?.customerName)
    || {};
}

function renderBillingContext(preserveCustomerInputs = false) {
  const job = billingSelectedJob();
  const customer = billingCustomerForJob(job);
  if ($("#billingCustomerName") && !preserveCustomerInputs) {
    $("#billingCustomerName").value = customer.name || job?.customerName || "";
    $("#billingCustomerEmail").value = customer.billingEmail || "";
    $("#billingCustomerPhone").value = customer.phone || "";
    $("#billingCustomerTaxId").value = customer.taxId || "";
    $("#billingCustomerCreditTerm").value = customer.creditTerm ?? "";
    $("#billingCustomerAddress").value = customer.address || job?.pickupLocation || "";
  }

  const preview = $("#billingPreview");
  if (preview) {
    const invoice = selectedInvoice();
    const previewCustomer = $("#billingCustomerName")?.value || customer.name || job?.customerName || "-";
    const previewEmail = $("#billingCustomerEmail")?.value || customer.billingEmail || "-";
    const previewPhone = $("#billingCustomerPhone")?.value || customer.phone || "-";
    const previewTax = $("#billingCustomerTaxId")?.value || customer.taxId || "-";
    const previewAddress = $("#billingCustomerAddress")?.value || customer.address || job?.pickupLocation || "-";
    const previewCredit = $("#billingCustomerCreditTerm")?.value || customer.creditTerm || 0;
    const invoiceId = invoice?.id || $("#invoiceId")?.value || "Draft not created";
    const dueDate = invoice?.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString("th-TH")
      : "-";
    preview.innerHTML = job ? `
      <article class="invoice-paper-preview">
        <header>
          <div>
            <strong>S.C.D.TRANSPORT</strong>
            <span>Invoice / ใบวางบิล</span>
          </div>
          <div>
            <b>${invoiceId}</b>
            <small>${invoice ? invoice.status : "Draft preview"}</small>
          </div>
        </header>
        <section class="invoice-party">
          <div>
            <small>Bill To / ลูกค้า</small>
            <b>${previewCustomer}</b>
            <span>${previewAddress}</span>
          </div>
          <div>
            <small>Contact</small>
            <span>${previewEmail}</span>
            <span>${previewPhone}</span>
            <span>Tax ID: ${previewTax}</span>
          </div>
        </section>
        <table>
          <thead><tr><th>House</th><th>Flight</th><th>Status</th><th class="right">Amount</th></tr></thead>
          <tbody>
            <tr>
              <td>${job.houseNumber}</td>
              <td>${job.flightNo || "-"}</td>
              <td>${job.status}</td>
              <td class="right">${money(job.amount || 0)}</td>
            </tr>
          </tbody>
        </table>
        <footer>
          <span>Credit Term: ${previewCredit} วัน</span>
          <span>Due Date: ${dueDate}</span>
          <strong>Total ${money(job.amount || 0)} บาท</strong>
        </footer>
        ${invoice?.pdfUrl ? `<a href="${assetUrl(invoice.pdfUrl)}" target="_blank" rel="noreferrer">เปิดเอกสาร Invoice</a>` : ""}
      </article>
    ` : `<strong>เลือก House เพื่อ Preview / Select House</strong>`;
  }

  const attachmentList = $("#billingAttachmentList");
  if (attachmentList) {
    const invoice = selectedInvoice();
    const files = (state.dashboard.attachments || []).filter(file => file.houseNumber === job?.houseNumber);
    const invoiceFile = invoice?.pdfUrl ? [{
      fileType: "InvoiceDocument",
      url: invoice.pdfUrl,
      createdAt: invoice.draftedAt || invoice.sentAt || new Date().toISOString()
    }] : [];
    const allFiles = [...invoiceFile, ...files];
    attachmentList.innerHTML = allFiles.length ? allFiles.map(file => `
      <article class="attachment-item">
        <div><strong>${file.fileType}</strong><br><span>${new Date(file.createdAt).toLocaleString("th-TH")}</span></div>
        <a href="${assetUrl(file.url)}" target="_blank" rel="noreferrer">เปิดดู</a>
      </article>
    `).join("") : `<article class="attachment-item"><div><strong>ยังไม่มีเอกสารแนบ</strong><br><span>No attachments</span></div></article>`;
  }
}

function safeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function alertActionItems() {
  const changeItems = (state.dashboard?.importChanges || []).map((change, index) => {
    const job = findExactJob(change.houseNumber);
    const issued = Boolean(job?.cargoIssuedAt);
    const changed = Boolean(change.changes?.length);
    return {
      id: change.id || `change-${index}`,
      type: changed ? "flight-change" : "not-issued",
      category: issued ? "issued-review" : (changed ? "flight-change" : "not-issued"),
      severity: issued || changed ? "danger" : "warning",
      title: changed ? localizeText("ไฟล์บินเปลี่ยน / Flight updated") : localizeText("ยังไม่ออกใบงาน / Not issued"),
      message: change.message || change.houseNumber || "SCD update",
      houseNumber: change.houseNumber || "",
      customerName: change.customerName || job?.customerName || "-",
      createdAt: change.createdAt,
      changes: change.changes || [],
      job,
      raw: change
    };
  });
  const systemItems = (state.dashboard?.alerts || []).map((alert, index) => ({
    id: alert.id || `alert-${index}`,
    type: "system",
    category: String(alert.message || "").toLowerCase().includes("cargo form issued") ? "issued-review" : "system",
    severity: alert.severity || "info",
    title: String(alert.message || "").toLowerCase().includes("cargo form issued") ? "ออกใบแล้ว / ต้องตรวจสอบ" : "เหตุการณ์ระบบ",
    message: alert.message || "System event",
    houseNumber: "",
    customerName: "-",
    createdAt: alert.createdAt,
    changes: [],
    job: null,
    raw: alert
  }));
  return [...changeItems, ...systemItems]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 60);
}

function alertItemById(id) {
  return alertActionItems().find(item => item.id === id);
}

function closeAlertDetail() {
  $("#alertDetailModal")?.classList.remove("show");
  $("#alertDetailModal")?.setAttribute("aria-hidden", "true");
}

function openAlertDetail(id) {
  const item = alertItemById(id);
  if (!item) return;
  state.selectedAlertId = id;
  $("#alertDetailTitle").textContent = item.title;
  $("#alertDetailSubtitle").textContent = item.createdAt ? new Date(item.createdAt).toLocaleString("th-TH") : "รายละเอียดแจ้งเตือน";
  const issued = Boolean(item.job?.cargoIssuedAt);
  $("#alertDetailBody").innerHTML = `
    <div class="alert-detail-grid">
      <article><span>House</span><strong>${safeHtml(item.houseNumber || item.job?.houseNumber || "-")}</strong></article>
      <article><span>ลูกค้า</span><strong>${safeHtml(item.customerName || "-")}</strong></article>
      <article><span>สถานะใบ Cargo</span><strong>${issued ? "ออกใบแล้ว" : "ยังไม่ออกใบ"}</strong></article>
      <article><span>ประเภทแจ้งเตือน</span><strong>${safeHtml(item.title)}</strong></article>
    </div>
    <section class="alert-detail-message">
      <h3>${safeHtml(item.message)}</h3>
      ${(item.changes || []).length ? `<ul>${item.changes.map(change => `<li>${safeHtml(change)}</li>`).join("")}</ul>` : `<p>ไม่มีรายละเอียดการเปลี่ยนแปลงเพิ่มเติม</p>`}
    </section>
    ${issued ? `<div class="alert-compare-preview">${cargoSheetHtml(jobCargoData(item.job))}</div>` : ""}
  `;
  $("#secondaryAlertActionBtn").style.display = issued ? "" : "none";
  $("#primaryAlertActionBtn").textContent = issued ? "ยืนยันใช้ไฟล์ใหม่" : "ไปจัดกลุ่มอัตโนมัติ";
  $("#alertDetailModal")?.classList.add("show");
  $("#alertDetailModal")?.setAttribute("aria-hidden", "false");
}

function focusGroupingFromAlert() {
  const item = alertItemById(state.selectedAlertId);
  closeAlertDetail();
  if (!item) return;
  setView("grouping");
  renderAdminWorkQueue();
  const index = state.adminQueueGroups.findIndex(group => group.jobs.some(job => job.houseNumber === item.houseNumber));
  if (index >= 0) {
    openAutoGroupModal(index);
  } else {
    toast("งานนี้ออกใบแล้วหรือไม่อยู่ในกลุ่มงานรอเปิด");
  }
}

function confirmAlertUpdate() {
  const item = alertItemById(state.selectedAlertId);
  if (!item?.job?.cargoIssuedAt) {
    focusGroupingFromAlert();
    return;
  }
  closeAlertDetail();
  toast("บันทึกการยืนยันใช้ไฟล์ใหม่ใน mock state แล้ว");
}

function renderImportHistory() {
  const target = $("#importHistoryList");
  if (!target) return;
  const history = state.dashboard.importHistory || [];
  target.innerHTML = history.length ? history.map(item => `
    <article class="import-history-item">
      <div class="import-history-file">
        <span class="import-file-icon"><i data-lucide="file-spreadsheet" aria-hidden="true"></i></span>
        <div>
          <strong>${safeHtml(item.fileName)}</strong>
          <small>${new Date(item.importedAt).toLocaleString("th-TH")} · ${safeHtml(item.source || "Manual")}</small>
        </div>
      </div>
      <div class="import-history-stats">
        <span class="new">ใหม่ ${item.newJobs || 0}</span>
        <span class="changed">เปลี่ยน ${item.changedJobs || 0}</span>
        <span class="duplicate">ซ้ำ ${item.duplicateJobs || 0}</span>
      </div>
    </article>
  `).join("") : `<article class="empty-import-history">ยังไม่มีประวัติการอัปโหลดไฟล์</article>`;
}

function showImportSummary(data, fileName) {
  const modal = $("#importSummaryModal");
  $("#importSummaryFile").textContent = fileName || "SCD Pickup Report.csv";
  $("#importSummaryGrid").innerHTML = `
    <article><span>แถวข้อมูลทั้งหมด</span><strong>${data.totalRows || 0}</strong></article>
    <article class="summary-new"><span>งานใหม่</span><strong>${data.newJobs || 0}</strong></article>
    <article class="summary-changed"><span>ข้อมูลเปลี่ยนแปลง</span><strong>${data.changed || 0}</strong></article>
    <article class="summary-duplicate"><span>ข้อมูลซ้ำ</span><strong>${data.duplicateJobs || 0}</strong></article>
    <article><span>House ไม่ซ้ำ</span><strong>${data.uniqueRows || 0}</strong></article>
    <article><span>ยังไม่ออกใบ Cargo</span><strong>${data.notIssued || 0}</strong></article>
  `;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeImportSummary() {
  const modal = $("#importSummaryModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function parseCsvPreview(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(value => value)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(value => value)) rows.push(row);
  return rows;
}

function previewTableHtml(rows, limit = 50) {
  if (!rows.length) return `<div class="empty-import-history">ไม่พบข้อมูลในไฟล์</div>`;
  const columnCount = Math.min(Math.max(...rows.map(row => row.length)), 15);
  const header = rows[0].slice(0, columnCount);
  const dataRows = rows.slice(1, limit + 1);
  const colWidths = { ONHAND:90, DATE:90, HAWB:110, DEST:60, PICKUP:140, PHONE:120,
    CONTACT_PERSON:140, OWNER:100, CARRIER:130, DRA:55, QTY:55, CTN:55, WEIGHT:80 };
  const thStyle = col => { const w = colWidths[col.toUpperCase()]; return w ? ` style="min-width:${w}px;max-width:${w}px"` : ''; };
  return `<div class="import-preview-table"><table>
    <thead><tr>${header.map(value => `<th${thStyle(value || "")} title="${safeHtml(value || "")}">${safeHtml(value || "-")}</th>`).join("")}</tr></thead>
    <tbody>${dataRows.map(row => `<tr>${Array.from({ length: columnCount }, (_, i) => {
      const v = safeHtml(row[i] || "-");
      return `<td title="${v}">${v}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function openImportPreview(type, csvText, fileName) {
  const rows = parseCsvPreview(csvText);
  if (rows.length < 2) throw new Error("ไม่พบแถวข้อมูลสำหรับ Import");
  state.pendingImport = { type, csvText, fileName, rows };
  $("#importPreviewFileName").textContent = fileName;
  $("#importPreviewRowCount").textContent = Math.max(0, rows.length - 1).toLocaleString("th-TH");
  $("#importPreviewTable").innerHTML = previewTableHtml(rows);
  const modal = $("#importPreviewModal");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  initializeIcons();
}

function closeImportPreview() {
  const modal = $("#importPreviewModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

async function confirmPendingImport() {
  const pending = state.pendingImport;
  if (!pending) return;
  closeImportPreview();
  if (pending.type === "scd") {
    const data = await api("/api/admin/import-scd", { csvText: pending.csvText, fileName: pending.fileName });
    showImportSummary(data, pending.fileName);
    toast(`Import สำเร็จ: ใหม่ ${data.newJobs} · ซ้ำ ${data.duplicateJobs} · เปลี่ยน ${data.changed}`);
  } else {
    const data = await api("/api/admin/import-flight", { csvText: pending.csvText });
    showImportSummary({ totalRows: pending.rows.length - 1, uniqueRows: data.imported, newJobs: data.imported }, pending.fileName);
    toast(`Import สำเร็จ ${data.imported} งาน`);
  }
  state.pendingImport = null;
  await refresh();
  if (state.currentView === "load-plan") renderLoadPlan();
  if (state.currentView === "attendance") renderAttendance();
}

function calendarStatus(job) {
  const status = String(job.status || "Pending");
  const done = ["Billed", "ReadyForBilling", "InvoiceSent", "Delivered", "TerminalClosed"];
  const outbound = ["ReadyForTerminal", "OutboundLocated", "OutboundPicking", "EIApproved", "AOTQueueBooked", "AOTQueueApproved", "GoodsLoaded", "TerminalArrived", "WeightDimensionRecorded", "XRayPassed", "PackingConsolidation"];
  const inbound = ["Inbound", "DocumentChecked", "PendingEI", "InboundOpened", "HouseIdentified", "Stored"];
  const flightTime = job.flightTime ? new Date(job.flightTime).getTime() : 0;
  if (flightTime && flightTime < Date.now() && !done.includes(status)) return "overdue";
  if (done.includes(status)) return "completed";
  if (outbound.includes(status)) return "outbound";
  if (inbound.includes(status)) return "inbound";
  return "pending";
}

function renderCalendar() {
  const grid = $("#calendarGrid");
  if (!grid || !state.dashboard) return;
  const shown = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth(), 1);
  renderCalendarMeta();
  const year = shown.getFullYear();
  const month = shown.getMonth();
  $("#calendarMonthTitle").textContent = new Intl.DateTimeFormat(
    state.lang === "th" ? "th-TH" : "en-US",
    { month: "long", year: "numeric" }
  ).format(shown);
  const firstWeekday = shown.getDay();
  const start = new Date(year, month, 1 - firstWeekday);
  const jobsByDate = new Map();
  for (const job of state.dashboard.jobs || []) {
    const key = jobDateKey(job);
    if (!key) continue;
    if (!jobsByDate.has(key)) jobsByDate.set(key, []);
    jobsByDate.get(key).push(job);
  }
  grid.innerHTML = Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = dateInputValue(date);
    const jobs = jobsByDate.get(key) || [];
    const outside = date.getMonth() !== month;
    const today = key === dateInputValue();
    const visible = jobs.slice(0, 5);
    const hasMore = jobs.length > visible.length;
    return `<article class="calendar-day ${outside ? "outside" : ""} ${today ? "today" : ""} ${jobs.length ? "has-jobs" : ""}"
                     data-calendar-date="${key}" data-job-count="${jobs.length}">
      <header>
        <time datetime="${key}">${date.getDate()}</time>
        ${jobs.length ? `<span class="day-count-badge">${jobs.length} ${localizeText("งาน / jobs")}</span>` : ""}
      </header>
      <div class="calendar-jobs">
        ${visible.map(job => `<button type="button" class="calendar-job ${calendarStatus(job)}"
            data-calendar-house="${safeHtml(job.houseNumber)}"
            title="${safeHtml(job.customerName || "-")}">
          <strong>${safeHtml(job.houseNumber)}</strong>
          <span>${safeHtml(job.customerName || "-")}</span>
        </button>`).join("")}
        ${hasMore ? `<button type="button" class="calendar-more-btn" data-calendar-date="${key}">
          +${jobs.length - visible.length} ${localizeText("งานอีก / more")} — ดูทั้งหมด
        </button>` : ""}
      </div>
    </article>`;
  }).join("");

  // click job → orders
  $$('[data-calendar-house]').forEach(button => button.addEventListener("click", e => {
    e.stopPropagation();
    state.selectedHouse = button.dataset.calendarHouse;
    state.orderFilter = "all";
    setView("orders");
    renderOrderCards();
    renderTimeline();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  // click day header / "+more" → open day modal
  $$('[data-calendar-date]').forEach(el => {
    el.addEventListener("click", e => {
      const dateKey = el.dataset.calendarDate || el.closest("[data-calendar-date]")?.dataset.calendarDate;
      if (!dateKey) return;
      const jobs = jobsByDate.get(dateKey) || [];
      if (!jobs.length) return;
      openCalendarDayModal(dateKey, jobs);
    });
  });
}

function renderCalendarMeta() {
  const dateEl = $("#calendarTodayDate");
  const verEl  = $("#calendarAppVersion");
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = new Intl.DateTimeFormat(
      state.lang === "th" ? "th-TH" : "en-US",
      { weekday: "short", day: "numeric", month: "short", year: "numeric" }
    ).format(now);
  }
  if (verEl) verEl.textContent = APP_VERSION;
}

function openCalendarDayModal(dateKey, jobs) {
  const modal = $("#calendarDayModal");
  const title = $("#calendarDayTitle");
  const list  = $("#calendarDayJobList");
  if (!modal || !list) return;

  const d = new Date(dateKey + "T00:00:00");
  const dateLabel = new Intl.DateTimeFormat(
    state.lang === "th" ? "th-TH" : "en-US",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  ).format(d);
  title.textContent = `${dateLabel}  (${jobs.length} งาน)`;

  // compact mode when many jobs — tighter cards
  const modalEl = modal.querySelector(".calendar-day-modal");
  if (modalEl) modalEl.classList.toggle("compact", jobs.length > 12);

  // build search box for large lists
  const hasSearch = jobs.length > 12;

  function renderJobCards(filtered) {
    list.innerHTML = filtered.map(job => {
      const st = calendarStatus(job);
      const statusLabel = { overdue:"OVERDUE", completed:"DONE", outbound:"OUTBOUND", inbound:"INBOUND", pending:"PENDING" }[st] || st.toUpperCase();
      return `<button class="day-modal-job ${st}" type="button" data-house="${safeHtml(job.houseNumber)}">
        <div class="dmj-row1">
          <span class="day-modal-status ${st}">${statusLabel}</span>
          <strong>${safeHtml(job.houseNumber)}</strong>
          <b>ดูรายละเอียด →</b>
        </div>
        <div class="dmj-row2">
          <span class="dmj-customer">${safeHtml(job.customerName || "-")}</span>
          <small>${safeHtml(job.status || "-")}</small>
        </div>
      </button>`;
    }).join("") || `<p class="dmj-empty">ไม่พบงานที่ตรงกัน</p>`;

    list.querySelectorAll("[data-house]").forEach(btn => {
      btn.addEventListener("click", () => {
        closeCalendarDayModal();
        state.selectedHouse = btn.dataset.house;
        state.orderFilter = "all";
        setView("orders");
        renderOrderCards();
        renderTimeline();
      });
    });
  }

  // inject search bar above list if large
  let searchBar = modal.querySelector(".dmj-search");
  if (hasSearch && !searchBar) {
    searchBar = document.createElement("div");
    searchBar.className = "dmj-search";
    searchBar.innerHTML = `<input type="search" class="dmj-search-input" placeholder="ค้นหา House / บริษัท..." autocomplete="off">`;
    list.parentNode.insertBefore(searchBar, list);
    searchBar.querySelector("input").addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      renderJobCards(q ? jobs.filter(j =>
        (j.houseNumber||"").toLowerCase().includes(q) ||
        (j.customerName||"").toLowerCase().includes(q)
      ) : jobs);
    });
  } else if (!hasSearch && searchBar) {
    searchBar.remove();
  }

  renderJobCards(jobs);
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeCalendarDayModal() {
  const modal = $("#calendarDayModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}


function renderImportChanges() {
  const changes = state.dashboard.importChanges || [];
  const html = changes.length
    ? changes.map(change => `
      <article class="change-item ${change.changes?.length ? "changed" : "not-issued"} clickable" data-quick-house="${change.houseNumber || ""}">
        <strong>${(function(msg) {
          const map = [
            ["งานใหม่", "งานใหม่ / New job"],
            ["เที่ยวบิน/เวลาปิดเปลี่ยน", "เที่ยวบิน/เวลาปิดเปลี่ยน / Flight changed"],
            ["ปลายทางเปลี่ยน", "ปลายทางเปลี่ยน / Dest changed"],
            ["จำนวนเปลี่ยน", "จำนวนเปลี่ยน / Qty changed"],
            ["ลูกค้าเปลี่ยน", "ลูกค้าเปลี่ยน / Customer changed"],
            ["ยังไม่ออกใบงาน", "ยังไม่ออกใบงาน / Not issued"],
            ["ยืนยันข้อมูล", "ยืนยันข้อมูล / Confirmed"],
          ];
          let result = msg || "";
          map.forEach(([th, bi]) => { result = result.replace(th, localizeText(bi)); });
          return result;
        })(change.message)}</strong>
        <small>${change.customerName || "-"} · ${new Date(change.createdAt).toLocaleString("th-TH")}</small>
        <div>
          ${(change.changes || []).map(item => `<span>${item}</span>`).join("")}
          ${change.notIssued ? `<span class="ci-tag">${localizeText("ยังไม่ออกใบ / Not issued")}</span>` : ""}
        </div>
      </article>
    `).join("")
    : `<article class="change-item">${localizeText("ยังไม่มีรายการเปลี่ยนแปลง / No flight updates yet")}</article>`;
  $$("#importChangeList, #adminImportChangeList").forEach(el => el.innerHTML = html);
}

function updateTerminalRequirements() {
  const input = $("#lithiumDoc");
  if (!input) return;
  const house = normalizeHouseBarcode($("#terminalHouse").value);
  const job = findExactJob(house);
  const label = $("#lithiumDocLabel");
  if (job?.requiresLithiumDocs) {
    input.required = true;
    label.textContent = "เอกสารลิเธียม / Permit (บังคับ / Required)";
  } else {
    input.required = false;
    label.textContent = "เอกสารเพิ่มเติม / Optional document";
  }
  const info = $("#terminalJobInfo");
  if (info) {
    info.innerHTML = job
      ? `<strong>${job.houseNumber} / ${job.status}</strong><span>Flight ${job.flightNo || "-"} · ${job.redFlag ? "เสี่ยงเกิน 4 ชั่วโมง" : "อยู่ในเวลา"}</span>`
      : `<strong>ไม่พบ House</strong><span>กรุณากรอกหรือยิงบาร์โค้ดให้ถูกต้อง</span>`;
  }
  const locationInfo = $("#outboundLocationInfo");
  if (locationInfo) {
    locationInfo.innerHTML = job
      ? `<strong>Location: ${job.locationId || "ยังไม่มีพิกัด"}</strong><span>${job.outboundFoundAt ? "สแกนเจอป้ายแล้ว" : "ไปที่ Location แล้วสแกนยืนยันก่อน Pick"}</span>`
      : `<strong>Location: -</strong><span>เลือก House ก่อน</span>`;
  }
}

function updateInboundInfo() {
  const job = findExactJob($("#scanHouse")?.value);
  const info = $("#inboundJobInfo");
  const locationInfo = $("#currentLocationInfo");
  if (info) {
    info.innerHTML = job
      ? `<strong>${job.houseNumber} / ${job.status}</strong><span>${job.customerName || "-"} · ${job.flightNo || "-"}</span>`
      : `<strong>ไม่พบ House</strong><span>กรุณาสแกนหรือกรอก House Number</span>`;
  }
  if (locationInfo) {
    locationInfo.innerHTML = job
      ? `<strong>Location ปัจจุบัน: ${job.locationId || "ยังไม่ได้จัดเก็บ"}</strong><span>${job.locationMovedAt ? `ย้ายล่าสุด ${job.locationMovedAt}` : "ล็อกหรือย้าย Location ได้จากเมนู"}</span>`
      : `<strong>Location ปัจจุบัน: -</strong><span>ยังไม่พบงาน</span>`;
  }
}

function showOpsSection(target) {
  const button = $(`[data-ops-target="${target}"]`);
  const panel = button?.closest(".panel");
  if (!panel) return;
  panel.querySelectorAll("[data-ops-target]").forEach(item => item.classList.toggle("active", item.dataset.opsTarget === target));
  panel.querySelectorAll("[data-ops-section]").forEach(section => section.classList.toggle("active", section.dataset.opsSection === target));
}

function showRolePanel(role) {
  $$(".ops-main-card").forEach(button => button.classList.toggle("active", button.dataset.roleTarget === role));
  $$("[data-role-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.rolePanel === role));
}

function renderCargoIssueState(job) {
  const banner = $("#cargoIssueBanner");
  const button = $("#issueCargoBtn");
  if (!banner || !button) return;
  if (!job) {
    banner.classList.remove("issued");
    banner.querySelector("strong").textContent = "ยังไม่มีงานให้เลือก";
    banner.querySelector("span").textContent = "เลือกงานด้านซ้ายก่อนออกใบ Cargo / Select an order first.";
    button.disabled = true;
    button.textContent = "ออกใบ Cargo";
    return;
  }
  const issued = Boolean(job.cargoIssuedAt);
  banner.classList.toggle("issued", issued);
  banner.querySelector("strong").textContent = issued ? "ออกใบ Cargo แล้ว" : "ยังไม่ออกใบ Cargo";
  banner.querySelector("span").textContent = issued
    ? `ออกเมื่อ ${new Date(job.cargoIssuedAt).toLocaleString("th-TH")} / Ready to print or reprint.`
    : "งานนี้มาจากไฟล์แล้ว ต้องออกใบก่อนส่งให้คนขับ / Issue Cargo form before dispatch.";
  // CS lock gate
  if (!job.csConfirmed) {
    button.disabled = true;
    button.textContent = "🔒 รอ CS ยืนยัน Invoice";
    banner.querySelector("span").textContent = "งานนี้ยังไม่ได้รับการยืนยัน Invoice จากทีม CS — กรุณารอ CS Confirm ก่อนออกใบ";
    banner.classList.remove("issued");
    return;
  }
  button.disabled = false;
  button.textContent = issued ? "ดู/พิมพ์ใบ Cargo" : "ออกใบ Cargo";
}

function renderTimeline() {
  const job = findJob();
  if (!job) {
    $("#selectedOrderTitle").textContent = "No order selected";
    $("#selectedOrderSubtitle").textContent = "Import CSV or create a job first";
    $("#routeOrigin").textContent = "-";
    $("#routeDest").textContent = "-";
    $("#routeWeight").textContent = "-";
    $("#hazardInfo").textContent = "-";
    $("#pickupCaseInfo").textContent = "-";
    $("#cargoIssuedInfo").textContent = "-";
    $("#destinationInfo").textContent = "-";
    $("#driverInfo").textContent = "-";
    $("#piecesInfo").textContent = "-";
    $("#pickupItemsInfo").textContent = "-";
    $("#packageInfo").textContent = "-";
    $("#stickerInfo").textContent = "-";
    $("#checklistInfo").textContent = "-";
    $("#nextModuleInfo").textContent = "-";
    $("#timelineList").innerHTML = `<div class="empty-state">ยังไม่มีงานให้แสดง / No job available yet</div>`;
    renderCargoIssueState(null);
    return;
  }

  renderCargoIssueState(job);
  $("#selectedOrderTitle").textContent = job.houseNumber || "-";
  $("#selectedOrderSubtitle").textContent = `${job.customerName || "-"} / ID: ${job.id || "-"}`;
  $("#routeOrigin").textContent = job.pickupLocation || job.originAirport || "WH3";
  $("#routeDest").textContent = job.destination || job.routeType || job.destAirport || "-";
  $("#routeWeight").textContent = job.weightKg ? `${job.weightKg}kg` : (job.weight ? `${job.weight}kg` : (job.pieceCount || "-"));
  $("#hazardInfo").textContent = job.requiresLithiumDocs ? "Yes / Lithium" : "No";
  $("#pickupCaseInfo").textContent = job.pickupCase || "-";
  $("#cargoIssuedInfo").textContent = job.cargoIssuedAt ? `Issued ${new Date(job.cargoIssuedAt).toLocaleString("th-TH")}` : "Not issued / ยังไม่ออกใบ";
  $("#destinationInfo").textContent = job.destination || job.routeType || job.destAirport || "-";
  $("#driverInfo").textContent = [job.driverName, job.vehiclePlate].filter(Boolean).join(" / ") || "-";
  $("#piecesInfo").textContent = job.pieceCount || "-";
  $("#pickupItemsInfo").textContent = Array.isArray(job.pickupItems) && job.pickupItems.length ? `${job.pickupItems.length} rows` : "-";
  $("#packageInfo").textContent = job.packageType || "-";
  $("#stickerInfo").textContent = job.stickerColor || "-";
  $("#checklistInfo").textContent = Array.isArray(job.pickupChecklist) ? `${job.pickupChecklist.length}/10` : "-";
  const isDirectExport = false;
  $("#nextModuleInfo").textContent = "WH3 required before Terminal";

  // ── Alert banners ──
  const now = Date.now();
  const ftMs = job.flightTime ? new Date(job.flightTime).getTime() : 0;
  const diffH = ftMs ? (ftMs - now) / 3600000 : 99;
  const doneStatuses = ["XRayPassed","ReadyForBilling","BillingReviewed","InvoiceDrafted","InvoiceSent","Billed"];
  const isReXray = job.requiresRescan || job.status === "ReXRayRequired" || job.status === "XRayHold";
  const isUrgent = ftMs && diffH < 4 && diffH > 0 && !doneStatuses.includes(job.status);
  const isMissed = ftMs && diffH <= 0 && !doneStatuses.includes(job.status);
  const approvalBanner = `
    <div class="order-approval-banner ${job.approvalStatus === "ConfirmedByPlan" || job.csConfirmed ? "ok" : "warn"}">
      <strong>${safeHtml(job.approvalStatus || (job.csConfirmed ? "CSApproved" : "PendingCSApproval"))}</strong>
      <span>${safeHtml(job.planSource || "-")} · Round ${safeHtml(job.planRound || "-")} · Evidence ${job.evidenceRequired ? "required" : "cleared"}</span>
    </div>`;
  let alertBanner = approvalBanner;
  if (isReXray) {
    alertBanner += `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:22px">🚨</span>
      <div><div style="font-weight:800;color:#dc2626;font-size:14px">ต้องทำ Re-X-Ray !</div>
      <div style="font-size:12px;color:#dc2626">สินค้าสแกนไม่ผ่าน — แจ้งหัวหน้างานทันที</div></div>
    </div>`;
  } else if (isMissed) {
    alertBanner += `<div style="background:#fef2f2;border:1.5px solid #ef4444;border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:22px">⛔</span>
      <div><div style="font-weight:800;color:#dc2626;font-size:13px">เลยเวลาบินแล้ว</div>
      <div style="font-size:12px;color:#b91c1c">ETD: ${formatBangkok(job.flightTime)} — ติดต่อหัวหน้างาน</div></div>
    </div>`;
  } else if (isUrgent) {
    const h = Math.floor(diffH), m = Math.floor((diffH%1)*60);
    alertBanner += `<div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px;animation:pulse 2s infinite">
      <span style="font-size:22px">⏰</span>
      <div><div style="font-weight:800;color:#d97706;font-size:13px">บินใน ${h} ชั่วโมง ${m} นาที!</div>
      <div style="font-size:12px;color:#b45309">ETD: ${formatBangkok(job.flightTime)} — เร่งดำเนินการ</div></div>
    </div>`;
  }

  // ── AOT Booking progress ──
  const aotStatuses = { "EIApproved":"รอจอง AOT","AOTQueueBooked":"รออนุมัติ AOT","AOTQueueApproved":"AOT อนุมัติแล้ว","GoodsLoaded":"โหลดสินค้าแล้ว","TerminalArrived":"ถึง Terminal" };
  const aotHtml = aotStatuses[job.status] ? `<div style="margin-bottom:10px;padding:8px 12px;background:#f0fdf4;border-radius:8px;border:1px solid #86efac;font-size:12px;font-weight:600;color:#15803d">
    🚛 AOT: ${aotStatuses[job.status]}${job.aotBookedAt ? " · จองเมื่อ "+formatBangkok(job.aotBookedAt) : ""}
  </div>` : "";

  // ── Track type badge ──
  const trackBadge = job.trackType ? `<div style="margin-bottom:10px;padding:6px 12px;background:${job.trackType==="Pair"?"#eff6ff":"#f0fdf4"};border-radius:8px;font-size:12px;font-weight:700;color:${job.trackType==="Pair"?"#1d4ed8":"#15803d"}">
    ${job.trackType === "Pair" ? "✈ Track คู่ — ส่งออก Terminal ทันที" : "📦 Track เดี่ยว — พักคลัง WH3"}
  </div>` : "";

  const steps = [
    { label: "รับสินค้า (Pickup)", desc: "รับจากลูกค้า · ถ่ายรูป · GPS · ลายเซ็น", done: PICKUP_DONE_STATUSES.includes(job.status),
      detail: job.pickupStartedAt ? `✓ ${formatBangkok(job.pickupStartedAt)}` : "" },
    { label: "รับเข้าคลัง (Inbound)", desc: "Twin-scan · จัดตำแหน่ง · WD checklist", done: INBOUND_DONE_STATUSES.includes(job.status),
      detail: job.inboundDocStatus === "Missing" ? "⏳ รอ EI Confirm" : (job.locationId ? `Location: ${job.locationId}` : "") },
    { label: "ตรวจเอกสาร", desc: "Permit · Cargo Transfer · ลิเธียม", done: Boolean(job.eiApproved || job.inboundDocStatus === "Found"),
      detail: job.eiApprovedAt ? `EI ✓ ${formatBangkok(job.eiApprovedAt)}` : (job.requiresLithiumDocs ? "⚠ ต้องมีใบลิเธียม" : "") },
    { label: "AOT Booking", desc: "จอง AOT · รออนุมัติ · เข้าส่งได้", done: ["AOTQueueApproved","GoodsLoaded","TerminalArrived","WeightDimensionRecorded","XRayPassed","PackingConsolidation","ReadyForBilling","Billed"].includes(job.status),
      detail: job.aotApprovedAt ? `✓ ${formatBangkok(job.aotApprovedAt)}` : (job.aotBookedAt ? "รออนุมัติ..." : "") },
    { label: `น้ำหนัก / Dimension${job.terminalWeight?" ("+job.terminalWeight+"kg)":""}`, desc: "ชั่งน้ำหนัก · วัดขนาด · บันทึก", done: ["WeightDimensionRecorded","PackingConsolidation","XRayPassed","ReadyForBilling","Billed"].includes(job.status),
      detail: job.weighStartedAt ? `เริ่ม ${formatBangkok(job.weighStartedAt)}${job.weighEndedAt?" → สิ้นสุด "+formatBangkok(job.weighEndedAt):""}` : "" },
    { label: `X-Ray ${job.xrayStatus==="Passed"?"✓":job.xrayStatus==="Hold"?"🔴 Hold":job.requiresRescan?"🚨 Re-Scan!":""}`, desc: "ตรวจสอบความปลอดภัย ก่อนโหลดถาด", done: job.xrayStatus === "Passed",
      detail: job.xrayStatus === "Passed" ? "ผ่านการตรวจ" : (isReXray ? "⚠ ต้อง Re-X-Ray — แจ้งหัวหน้างาน" : "รอตรวจ X-Ray"),
      danger: isReXray },
    { label: "Loading Detail", desc: "แพ็คถาด · ถ่ายรูปแทร็ก · อัปโหลด", done: Boolean(job.loadingDetailUploaded),
      detail: job.trayNumber ? `Tray: ${job.trayNumber}` : "" },
    { label: "วางบิล (Billing)", desc: "สร้าง Invoice · ส่งอีเมล · ติดตาม Due Date", done: ["Billed","InvoiceSent"].includes(job.status),
      detail: job.dueDate ? `Due: ${new Date(job.dueDate).toLocaleDateString("th-TH")}` : "" }
  ];

  $("#timelineList").innerHTML = alertBanner + trackBadge + aotHtml + steps.map((step, i) => `
    <div class="timeline-item ${step.done ? "done" : ""}" ${step.danger ? 'style="border-left:3px solid #ef4444;background:#fff5f5"' : ""}>
      <span style="${step.danger ? "background:#ef4444;color:#fff" : ""}">${step.done ? "✓" : i + 1}</span>
      <div>
        <strong>${step.label}</strong>
        <p>${step.desc}</p>
        ${step.detail ? `<small style="color:${step.danger?"#dc2626":step.done?"#22c55e":"#64748b"}">${step.detail}</small>` : ""}
      </div>
    </div>
  `).join("");
}

function getGps() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      pos => {
        const gps = { gpsLat: pos.coords.latitude, gpsLong: pos.coords.longitude };
        state.lastGps = gps;
        resolve(gps);
      },
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function fileToCompressedBase64(input, maxWidth = 1280, quality = 0.72) {
  const file = input.files?.[0];
  if (!file) return Promise.resolve({ base64: "", mimeType: "" });
  if (file.type === "application/pdf") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ base64: reader.result, mimeType: file.type });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ base64: canvas.toDataURL("image/jpeg", quality), mimeType: "image/jpeg" });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function filesToCompressedBase64(input) {
  const files = Array.from(input.files || []);
  const results = [];
  for (const file of files) {
    const tempInput = { files: [file] };
    results.push(await fileToCompressedBase64(tempInput));
  }
  return results;
}

function readTextFile(input) {
  const file = input.files?.[0];
  if (!file) return Promise.reject(new Error("กรุณาเลือกไฟล์ CSV / Please choose a CSV file"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

function setupSignaturePad() {
  const canvas = $("#signaturePad");
  const ctx = canvas.getContext("2d");
  let drawing = false;

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0] || event;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function start(event) {
    drawing = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    event.preventDefault();
  }

  function move(event) {
    if (!drawing) return;
    const p = point(event);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#17201d";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    event.preventDefault();
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", () => drawing = false);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", () => drawing = false);
  $("#clearSignature").addEventListener("click", () => ctx.clearRect(0, 0, canvas.width, canvas.height));
}

async function runAction(button, task) {
  button.disabled = true;
  try {
    await task();
    await refresh();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function datetimeLocalToIso(value) {
  return value ? new Date(value).toISOString() : "";
}


// ══════════════════════════════════════════════════════════════
// LOAD PLAN — Preview diff modal before confirm import
// ══════════════════════════════════════════════════════════════
var _lpPendingCsvText = "";
var _lpPendingFileBase64 = "";

function showLpPreviewModal(preview, csvText, fileBase64) {
  _lpPendingCsvText = csvText || "";
  _lpPendingFileBase64 = fileBase64 || "";
  const modal = document.getElementById("lpPreviewModal");
  const body  = document.getElementById("lpPreviewModalBody");
  if (!modal || !body) return;

  const { newRows=[], removedRows=[], changedRows=[], unchangedRows=[], hasPrev, prevImportedAt, prevTotalRows } = preview;
  const total = newRows.length + changedRows.length + unchangedRows.length;
  const hasChanges = newRows.length > 0 || removedRows.length > 0 || changedRows.length > 0;

  const prevInfo = hasPrev
    ? `<span style="font-size:11px;color:var(--text-muted)">Import ก่อนหน้า: ${new Date(prevImportedAt).toLocaleString("th-TH")} · ${prevTotalRows} รายการ</span>`
    : `<span style="font-size:11px;color:var(--text-muted)">ยังไม่มี Load Plan ก่อนหน้า</span>`;

  const badgeRow = (color, bg, icon, label, count) => count > 0 ? `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${bg};border-radius:8px;margin-bottom:8px">
      <span style="font-size:18px">${icon}</span>
      <div style="flex:1"><strong style="color:${color}">${label}</strong></div>
      <span style="font-size:20px;font-weight:700;color:${color}">${count}</span>
    </div>` : "";

  const rowTable = (rows, cols, title, color) => rows.length === 0 ? "" : `
    <div style="margin-top:14px">
      <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:6px">${title}</div>
      <div style="overflow-x:auto;border-radius:7px;border:1px solid #e2e8f0;max-height:160px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#f8fafc">${cols.map(c=>`<th style="padding:5px 8px;text-align:left;white-space:nowrap;border-bottom:1px solid #e2e8f0">${c}</th>`).join("")}</tr></thead>
          <tbody>${rows.slice(0,50).map(r=>`<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:4px 8px;white-space:nowrap">${safeHtml(r.houseNumber)}</td>
            <td style="padding:4px 8px;white-space:nowrap">${safeHtml(r.flightNumber||r.flightNo||"-")}</td>
            <td style="padding:4px 8px">${safeHtml(r.destination||"-")}</td>
            <td style="padding:4px 8px;text-align:right">${r.pieces||"-"}</td>
            <td style="padding:4px 8px;text-align:right">${r.weight||"-"}</td>
          </tr>`).join("")}
          ${rows.length > 50 ? `<tr><td colspan="5" style="padding:6px 8px;color:var(--text-muted);font-style:italic">... และอีก ${rows.length-50} รายการ</td></tr>` : ""}
          </tbody>
        </table>
      </div>
    </div>`;

  const cols = ["House Number","Flight","Dest","Pcs","Weight"];

  body.innerHTML = `
    <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <strong style="font-size:15px">ตรวจสอบ Load Plan</strong><br>
        ${prevInfo}
      </div>
      <span style="font-size:13px;color:var(--text-muted)">${total} รายการรวม</span>
    </div>
    ${!hasChanges && hasPrev ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;text-align:center;color:#15803d;font-weight:600;margin-bottom:12px">✅ ไม่มีการเปลี่ยนแปลงจาก Load Plan ก่อนหน้า</div>` : ""}
    ${badgeRow("#15803d","#f0fdf4","🆕","รายการใหม่", newRows.length)}
    ${badgeRow("#b45309","#fffbeb","⚠️","มีการเปลี่ยนแปลง", changedRows.length)}
    ${badgeRow("#dc2626","#fef2f2","🗑️","ถูกลบออก (อยู่ใน prev แต่ไม่มีในไฟล์ใหม่)", removedRows.length)}
    ${badgeRow("#64748b","#f8fafc","♻️","ซ้ำ / ไม่เปลี่ยน", unchangedRows.length)}
    ${rowTable(newRows, cols, "🆕 รายการใหม่", "#15803d")}
    ${rowTable(changedRows, cols, "⚠️ รายการที่เปลี่ยนแปลง", "#b45309")}
    ${rowTable(removedRows, cols, "🗑️ รายการที่จะถูกนำออก", "#dc2626")}
  `;

  modal.style.display = "flex";
}

async function doLpImport() {
  const modal = document.getElementById("lpPreviewModal");
  if (modal) modal.style.display = "none";
  try {
    toast("กำลัง Import...");
    const planRound = $("#lpRoundSelect")?.value || "";
    const res = await api("/api/loadplan/import", _lpPendingFileBase64
      ? { fileBase64: _lpPendingFileBase64, importedBy: state.user?.id, planRound }
      : { csvText: _lpPendingCsvText, importedBy: state.user?.id, planRound });
    if (res.ok) {
      const msg = res.changed
        ? `Import สำเร็จ — เปลี่ยนแปลง: +${res.added} เพิ่ม, -${res.removed} ลบ`
        : `Import สำเร็จ — ${res.plan.totalRows} รายการ`;
      toast(msg);
      lpCurrentPlan = res.plan;
      obOpenState.flightKey = null;
      obOpenRenderFlightGroups();
      obOpenRenderHistory();
      renderLpFlightSummaryCards(lpCurrentPlan);
    }
  } catch(err) { toast("เกิดข้อผิดพลาด: " + err.message); }
  _lpPendingCsvText = "";
}
function bindEvents() {
  $("#alertBell")?.addEventListener("click", () => setView("alerts"));
  $("#webLoginBtn")?.addEventListener("click", submitWebLogin);
  $("#webLoginPassword")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitWebLogin();
    }
  });
  $$("[data-view], [data-view-jump]").forEach(button => {
    button.addEventListener("click", () => {
      setView(button.dataset.view || button.dataset.viewJump);
      if (button.dataset.viewJump) renderAll();
    });
  });
  $("#orderSearch").addEventListener("input", renderOrderCards);
  $$("[data-order-filter]").forEach(button => {
    button.addEventListener("click", () => {
      state.orderFilter = button.dataset.orderFilter;
      localStorage.setItem("smartLogisticsOrderFilter", state.orderFilter);
      renderOrderCards();
      toast(`แสดงงาน: ${button.querySelector("span")?.textContent || state.orderFilter}`);
    });
  });
  $("#globalSearch").addEventListener("input", () => {
    renderRecentOrders();
    renderOrderCards();
  });
  $("#dimTabs")?.addEventListener("click", event => {
    const btn = event.target.closest("[data-dim]");
    if (!btn) return;
    state.dashDim = btn.dataset.dim;
    renderStatusDistribution();
  });
  $("#applyDashboardFilters").addEventListener("click", applyDashboardFilterInputs);
  $("#resetDashboardFilters").addEventListener("click", () => {
    state.filters.dateFrom = dateOffsetValue(-29);
    state.filters.dateTo = dateOffsetValue(0);
    state.filters.status = "All";
    persistDashboardFilters();
    renderAll();
    toast("กลับไปดูย้อนหลัง 10 วันแล้ว / Last 10 days applied");
  });
  $("#dashboardDateFrom").addEventListener("change", applyDashboardFilterInputs);
  $("#dashboardDateTo").addEventListener("change", applyDashboardFilterInputs);
  $("#dashboardStatusFilter").addEventListener("change", applyDashboardFilterInputs);
  $("#exportDashboardPdf").addEventListener("click", () => openExportConfirm("pdf"));
  $("#exportDashboardExcel").addEventListener("click", () => openExportConfirm("excel"));
  $("#exportDashboardImage").addEventListener("click", () => openExportConfirm("image"));
  $("#closeExportModal").addEventListener("click", closeExportConfirm);
  $("#cancelExportConfirm").addEventListener("click", closeExportConfirm);
  $("#confirmExportAction").addEventListener("click", confirmPendingExport);
  $("#exportConfirmModal").addEventListener("click", event => {
    if (event.target.id === "exportConfirmModal") closeExportConfirm();
  });
  $("#confirmImportSummary").addEventListener("click", closeImportSummary);
  $("#importSummaryModal").addEventListener("click", event => {
    if (event.target.id === "importSummaryModal") closeImportSummary();
  });
  $("#closeImportPreview").addEventListener("click", closeImportPreview);
  $("#cancelImportPreview").addEventListener("click", closeImportPreview);
  $("#importPreviewModal").addEventListener("click", event => {
    if (event.target.id === "importPreviewModal") closeImportPreview();
  });
  $("#confirmImportPreview").addEventListener("click", event => runAction(event.currentTarget, confirmPendingImport));
  $("#calendarPrevBtn").addEventListener("click", () => {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
    renderCalendar();
  });
  $("#calendarTodayBtn").addEventListener("click", () => {
    state.calendarDate = new Date();
    renderCalendar();
  });
  $("#calendarNextBtn").addEventListener("click", () => {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
    renderCalendar();
  });
  // CSV file picker + drag-drop
  function handleCsvFile(file) {
    if (!file) return;
    const box = $("#scdFilePreview");
    const btn = $("#importScdBtn");
    const zone = $("#csvDropZone");
    if (/\.xlsx$/i.test(file.name)) {
      if (box) {
        box.innerHTML = `<div class="file-preview-meta"><strong>${safeHtml(file.name)}</strong><span>ไฟล์ Excel — ระบบจะตรวจชนิด Consol Planning / Pickup Report อัตโนมัติ</span></div>`;
        box.hidden = false;
      }
      if (btn) btn.hidden = false;
      if (zone) { zone.classList.add("has-file"); zone._pendingFile = file; }
      return;
    }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const csvText = e.target.result;
        const rows = parseCsvPreview(csvText);
        if (box) {
          box.innerHTML = `<div class="file-preview-meta"><strong>${safeHtml(file.name)}</strong><span>${rows.length} รายการ</span></div>${rows.map(r => `<div class="file-preview-row">${r.map(c => `<span>${safeHtml(c)}</span>`).join("")}</div>`).join("")}`;
          box.hidden = false;
        }
        if (btn) btn.hidden = false;
        if (zone) zone.classList.add("has-file");
        // Store file ref
        zone._pendingFile = file;
      } catch (err) {
        if (box) { box.innerHTML = `<span class="error">${safeHtml(err.message)}</span>`; box.hidden = false; }
      }
    };
    reader.readAsText(file, "utf-8");
  }

  $("#scdCsvFile").addEventListener("change", event => {
    handleCsvFile(event.currentTarget.files[0]);
  });

  // Drag-drop on drop zone
  const dropZone = $("#csvDropZone");
  if (dropZone) {
    dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const file = e.dataTransfer?.files[0];
      if (file) {
        const input = $("#scdCsvFile");
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
        }
        handleCsvFile(file);
      }
    });
  }
  $$("[data-export-dashboard='pdf']").forEach(button => button.addEventListener("click", () => openExportConfirm("pdf")));
  $$("[data-export-dashboard='excel']").forEach(button => button.addEventListener("click", () => openExportConfirm("excel")));
  $("#languageToggle").addEventListener("click", () => {
    state.lang = state.lang === "th" ? "en" : "th";
    localStorage.setItem("smartLogisticsLang", state.lang);
    renderAll();
    toast(state.lang === "en" ? "English mode" : "แสดงภาษาไทย");
  });
  $("#logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(WEB_AUTH_KEY);
    localStorage.removeItem(WEB_AUTH_USER_KEY);
    $("#webLoginPassword").value = "";
    renderWebLogin();
    toast("ออกจากระบบแล้ว");
    setView("dashboard");
  });
  $("#mobileMenuBtn").addEventListener("click", () => setMobileMenu(!$(".sidebar").classList.contains("mobile-open")));
  $("#sidebarBackdrop").addEventListener("click", () => setMobileMenu(false));
  $("#closeCalendarDayModal")?.addEventListener("click", closeCalendarDayModal);
  $("#calendarDayModal")?.addEventListener("click", e => { if (e.target.id === "calendarDayModal") closeCalendarDayModal(); });
  $$(".nav-item, .side-link").forEach(button => button.addEventListener("click", () => {
    if (window.innerWidth <= 840) setMobileMenu(false);
  }));
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") setMobileMenu(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 840) setMobileMenu(false);
  });
  $("#openStaffFormBtn").addEventListener("click", () => openStaffEditor());
  $("#closeStaffFormBtn").addEventListener("click", closeStaffEditor);
  $("#cancelStaffBtn").addEventListener("click", closeStaffEditor);
  $("#staffRole").addEventListener("change", setStaffVehicleVisibility);
  $("#staffTable").addEventListener("click", event => {
    const button = event.target.closest("[data-staff-id]");
    if (!button) return;
    const user = state.users.find(item => item.id === button.dataset.staffId);
    if (!user) return;
    renderStaffDetail(user);
    openStaffEditor(user);
  });
  $("#teamDepartmentGrid").addEventListener("click", event => {
    const card = event.target.closest("[data-team-role]");
    if (!card) return;
    state.staffRoleFilter = card.dataset.teamRole;
    renderStaff();
    initializeIcons();
  });
  $("#showAllTeamsBtn").addEventListener("click", () => {
    state.staffRoleFilter = "All";
    renderStaff();
    initializeIcons();
  });
  $("#staffEditor").addEventListener("submit", event => {
    event.preventDefault();
    const button = event.submitter;
    runAction(button, async () => {
      const data = await api("/api/users/upsert", {
        id: $("#staffEditor").dataset.editId,
        code: $("#staffCode").value.trim(),
        name: $("#staffName").value.trim(),
        role: $("#staffRole").value,
        vehiclePlate: $("#staffVehiclePlate").value.trim(),
        phone: $("#staffPhone").value.trim(),
        lineUserId: $("#staffLineId").value.trim(),
        status: $("#staffStatus").value
      });
      state.users = data.users;
      state.dashboard = data.dashboard;
      state.selectedStaffId = data.user.id;
      closeStaffEditor();
      toast("บันทึกพนักงานแล้ว / Staff saved");
    });
  });
  $("#saveSettingsBtn").addEventListener("click", () => {
    const lang = $("#settingDefaultLanguage").value;
    const range = $("#settingDefaultRange").value;
    localStorage.setItem("smartLogisticsLang", lang);
    localStorage.setItem("smartLogisticsDefaultRange", range);
    localStorage.setItem("smartLogisticsSystemName", $("#settingSystemName").value || "S.C.D.TRANSPORT");
    state.lang = lang;
    applyLanguage();
    toast("บันทึกตั้งค่าแล้ว / Settings saved");
  });
  $("#resetSettingsBtn").addEventListener("click", () => {
    $("#settingSystemName").value = "S.C.D.TRANSPORT";
    $("#settingDefaultLanguage").value = "th";
    $("#settingDefaultRange").value = "10";
    localStorage.setItem("smartLogisticsLang", "th");
    localStorage.setItem("smartLogisticsDefaultRange", "10");
    state.lang = "th";
    applyLanguage();
    toast("คืนค่าเริ่มต้นแล้ว / Settings reset");
  });
  $("#addDriverPickupItem").addEventListener("click", () => addPickupItemRow());
  $("#addAdminPickupItem").addEventListener("click", () => openAdminRowModal());
  ["closeAdminRowModal", "cancelAdminRowModal"].forEach(id => $(`#${id}`)?.addEventListener("click", closeAdminRowModal));
  $("#saveAdminRowModal")?.addEventListener("click", saveAdminRowModal);
  ["rowModalHouse", "rowModalDestination", "rowModalCarton", "rowModalPickupDate"].forEach(id => {
    $(`#${id}`)?.addEventListener("input", renderAdminRowModalPreview);
  });
  $("#adminRowModal")?.addEventListener("click", event => {
    if (event.target.id === "adminRowModal") closeAdminRowModal();
  });
  $("#driverJobSelect").addEventListener("change", event => applyDriverJob(event.target.value));
  $("#previewCargoBtn").addEventListener("click", renderCargoPreview);
  $("#printCargoPreviewBtn").addEventListener("click", printCargoOnly);
  $("#cargoZoomInBtn")?.addEventListener("click", () => {
    if (!_lastCargoHtml) return;
    applyCargoZoom(Math.min(2, (state.cargoPreviewZoom ?? getCargoFitZoom()) + 0.1));
  });
  $("#cargoZoomOutBtn")?.addEventListener("click", () => {
    if (!_lastCargoHtml) return;
    applyCargoZoom(Math.max(0.25, (state.cargoPreviewZoom ?? getCargoFitZoom()) - 0.1));
  });
  $("#cargoZoomFitBtn")?.addEventListener("click", () => {
    if (!_lastCargoHtml) return;
    state.cargoPreviewZoom = null;
    applyCargoZoom(getCargoFitZoom());
  });

  // Group preview zoom
  $("#groupZoomInBtn")?.addEventListener("click", () => {
    applyGroupZoom(Math.min(2, (state.groupPreviewZoom ?? getGroupPreviewFitZoom()) + 0.1));
  });
  $("#groupZoomOutBtn")?.addEventListener("click", () => {
    applyGroupZoom(Math.max(0.25, (state.groupPreviewZoom ?? getGroupPreviewFitZoom()) - 0.1));
  });
  $("#groupZoomFitBtn")?.addEventListener("click", () => {
    state.groupPreviewZoom = null;
    applyGroupZoom(getGroupPreviewFitZoom());
  });
  $("#adminDriverSelect").addEventListener("change", applyAdminDriver);
  $("#adminWorkQueue")?.addEventListener("click", event => {
    const groupButton = event.target.closest("[data-admin-open-group]");
    if (!groupButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openAutoGroupModal(groupButton.dataset.adminOpenGroup);
  }, true);
  $("#adminIssuedQueue")?.addEventListener("click", event => {
    const button = event.target.closest("[data-admin-issued-house]");
    if (!button) return;
    const job = findJob(button.dataset.adminIssuedHouse);
    if (!job) return;
    state.selectedHistoryHouse = job.houseNumber;
    renderCargoHistory();
    renderHistoryCargoPreview();
  }, true);
  $("#adminWorkQueue")?.addEventListener("click", event => {
    const groupButton = event.target.closest("[data-admin-open-group]");
    if (groupButton) {
      const group = state.adminQueueGroups[Number(groupButton.dataset.adminOpenGroup)];
      if (!group) return;
      fillAdminFormFromJobs(group.jobs);
      toast(`ดึงกลุ่มงาน ${group.jobs.length} งานเข้าฟอร์มแล้ว / Group loaded`);
      return;
    }
    const button = event.target.closest("[data-admin-open-house]");
    if (!button) return;
    const job = findJob(button.dataset.adminOpenHouse);
    if (!job) return;
    fillAdminFormFromJob(job);
    toast("ดึงงานเข้าฟอร์มแล้ว เลือกคนขับแล้วกด Create Job / Loaded to admin form");
  });
  $("#adminIssuedQueue")?.addEventListener("click", event => {
    const button = event.target.closest("[data-admin-issued-house]");
    if (!button) return;
    const job = findJob(button.dataset.adminIssuedHouse);
    if (!job) return;
    fillAdminFormFromJob(job);
    renderCargoPreview();
    toast("เปิดใบ Cargo จากประวัติแล้ว สามารถพิมพ์ซ้ำได้");
  });
  ["closeAutoGroupModal", "cancelAutoGroupModal"].forEach(id => $(`#${id}`)?.addEventListener("click", closeAutoGroupModal));
  $("#autoGroupModal")?.addEventListener("click", event => {
    if (event.target.id === "autoGroupModal") closeAutoGroupModal();
  });
  $("#editAutoGroupBtn")?.addEventListener("click", () => {
    groupWizardBackOrEdit();
    return;
    const group = state.adminQueueGroups[state.activeAutoGroupIndex];
    if (!group) return;
    prepareAdminFormForJobs(group.jobs, manualGroupDriver());
    closeAutoGroupModal();
    setView("admin");
    toast("ดึงกลุ่มงานเข้าแบบฟอร์มแล้ว สามารถแก้ไขก่อนออกใบได้");
  });
  $("#printAutoGroupBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
    await groupWizardNextOrIssue();
    return;
    const group = state.adminQueueGroups[state.activeAutoGroupIndex];
    if (!group) return;
    prepareAdminFormForJobs(group.jobs, manualGroupDriver());
    const createdJobs = await issueAdminCargoFromCurrentForm();
    closeAutoGroupModal();
    printCargoOnly();
    toast(`ออกใบ Cargo แล้ว ${createdJobs.length || group.jobs.length} งาน และย้ายไปประวัติ`);
  }));
  $("#openManualGroupBtn")?.addEventListener("click", () => openGroupWizard({ mode: "manual", jobs: adminUnopenedJobs() }));
  $("#autoGroupDetails")?.addEventListener("input", event => {
    const metaKey = event.target.dataset?.wizardMeta;
    if (metaKey) {
      if (!state.groupWizard.meta) state.groupWizard.meta = {};
      state.groupWizard.meta[metaKey] = event.target.value;
      const selectedJobs = groupWizardSelectedJobs();
      const pages = chunkArray(selectedJobs, HOUSES_PER_PAGE);
      const currentPage = state.groupWizard.currentPage || 0;
      const pageJobs = pages[currentPage] || [];
      const pageDriver = getPageDriver(currentPage);
      if (pageJobs.length) {
        const meta = state.groupWizard.meta;
        const baseData = cargoDataFromJobs(pageJobs, pageDriver);
        const previewData = { ...baseData,
          contact: meta.contact ?? baseData.contact,
          tel: meta.tel ?? baseData.tel,
          pickupDate: meta.pickupDate ?? baseData.pickupDate,
          pickupTime: meta.pickupTime ?? baseData.pickupTime
        };
        const canvas = document.querySelector(".wizard-paper-canvas");
        if (canvas) canvas.innerHTML = cargoSheetHtml(previewData);
      }
      return;
    }
  });
  $("#autoGroupDetails")?.addEventListener("change", event => {
    const driverSelect = event.target.closest("#wizardDriverSelect");
    if (driverSelect) {
      state.groupWizard.driverId = driverSelect.value;
      state.groupWizard.pageDrivers = {};
      updateGroupWizardPreview();
      renderGroupWizard();
      return;
    }
    const pageDriverSelect = event.target.closest("#wizardPageDriverSelect");
    if (pageDriverSelect) {
      const jobs = groupWizardSelectedJobs();
      const computed = computeWizardPagesAndDrivers(jobs);
      const pageCount = computed.length || 1;
      const currentPage = Math.min(state.groupWizard.currentPage || 0, Math.max(0, pageCount - 1));
      // Update laneDrivers: find which lane this page belongs to
      if (computed[currentPage]) {
        const oldDriverId = computed[currentPage].driverId;
        const laneDrivers = state.groupWizard.laneDrivers || [state.groupWizard.driverId];
        const laneIdx = laneDrivers.indexOf(oldDriverId);
        if (laneIdx >= 0) laneDrivers[laneIdx] = pageDriverSelect.value;
        else laneDrivers[0] = pageDriverSelect.value;
        state.groupWizard.laneDrivers = [...laneDrivers];
      }
      if (!state.groupWizard.pageDrivers) state.groupWizard.pageDrivers = {};
      state.groupWizard.pageDrivers[currentPage] = pageDriverSelect.value;
      if (currentPage === 0) state.groupWizard.driverId = pageDriverSelect.value;
      renderGroupWizard();
      return;
    }
    const laneDriverSelect = event.target.closest(".wizard-lane-driver-select");
    if (laneDriverSelect) {
      const li = Number(laneDriverSelect.dataset.laneIndex);
      const laneDrivers = state.groupWizard.laneDrivers || [state.groupWizard.driverId];
      laneDrivers[li] = laneDriverSelect.value;
      state.groupWizard.laneDrivers = [...laneDrivers];
      if (li === 0) state.groupWizard.driverId = laneDriverSelect.value;
      renderGroupWizard();
      return;
    }
    // Step 1 overview checkboxes
    const ovCheck = event.target.closest(".wizard-overview-check");
    if (ovCheck) {
      const val = ovCheck.value;
      if (ovCheck.checked) {
        if (!state.groupWizard.selectedHouses.includes(val)) state.groupWizard.selectedHouses.push(val);
      } else {
        state.groupWizard.selectedHouses = state.groupWizard.selectedHouses.filter(h => h !== val);
      }
      state.groupWizard.currentPage = 0;
      renderGroupWizard();
      return;
    }
    const checkbox = event.target.closest(".wizard-house-check");
    if (!checkbox) return;
    if (checkbox.checked) {
      if (!state.groupWizard.selectedHouses.includes(checkbox.value)) state.groupWizard.selectedHouses.push(checkbox.value);
    } else {
      state.groupWizard.selectedHouses = state.groupWizard.selectedHouses.filter(house => house !== checkbox.value);
    }
    state.groupWizard.currentPage = 0;
    updateGroupWizardPreview();
    renderGroupWizard();
  });
  $("#autoGroupDetails")?.addEventListener("change", event => {
    if (event.target && event.target.id === "wdcCustomCount") {
      wizardSetDriverCount(event.target.value);
    }
  });
  $("#autoGroupDetails")?.addEventListener("click", event => {
    const stepBtn = event.target.closest("[data-wdc-step]");
    if (stepBtn) {
      const current = (state.groupWizard.laneDrivers || []).length || 1;
      wizardSetDriverCount(current + Number(stepBtn.dataset.wdcStep));
      return;
    }
    const driverCountBtn = event.target.closest(".wdc-seg");
    if (driverCountBtn) {
      wizardSetDriverCount(Number(driverCountBtn.dataset.driverCount));
      return;
    }
    const zoomButton = event.target.closest("[data-wizard-zoom]");
    if (zoomButton && state.groupWizard.open) {
      const current = Number(state.groupWizard.previewZoom || 0.82);
      const action = zoomButton.dataset.wizardZoom;
      let next = action === "in" ? current + 0.1 : action === "out" ? current - 0.1 : 0.82;
      if (action === "reset") {
        const pane = document.querySelector(".wizard-paper-preview-side");
        const sheet = pane?.querySelector(".cargo-sheet");
        if (pane && sheet && sheet.offsetWidth && sheet.offsetHeight) {
          const zw = (pane.clientWidth - 28) / sheet.offsetWidth;
          const zh = (pane.clientHeight - 28) / sheet.offsetHeight;
          next = Math.min(zw, zh);
        }
      }
      state.groupWizard.previewZoom = Math.max(0.3, Math.min(1.25, next));
      renderGroupWizard();
      return;
    }
    const pageBtn = event.target.closest("[data-wizard-page]");
    if (pageBtn && state.groupWizard.open) {
      const jobs = groupWizardSelectedJobs();
      const computed = computeWizardPagesAndDrivers(jobs);
      const pageCount = computed.length || 1;
      const currentPage = state.groupWizard.currentPage || 0;
      const dir = pageBtn.dataset.wizardPage;
      const next = dir === "next" ? currentPage + 1 : currentPage - 1;
      state.groupWizard.currentPage = Math.max(0, Math.min(pageCount - 1, next));
      renderGroupWizard();
      return;
    }
    // เลือกทั้งหมด / ยกเลิกทั้งหมด
    const woaBtn = event.target.closest("[data-woa-select]");
    if (woaBtn) {
      const action = woaBtn.dataset.woaSelect;
      const allJobs = state.groupWizard.jobs || [];
      if (action === "all") {
        state.groupWizard.selectedHouses = allJobs.map(j => j.houseNumber);
      } else {
        state.groupWizard.selectedHouses = [];
      }
      state.groupWizard.currentPage = 0;
      renderGroupWizard();
      return;
    }
    // คลิก row ของ wizard-overview-row (label ครอบ checkbox แล้ว แต่ป้องกัน double-fire)
    const overviewRow = event.target.closest(".wizard-overview-row");
    if (overviewRow && event.target.type !== "checkbox") {
      const chk = overviewRow.querySelector(".wizard-overview-check");
      if (chk) {
        chk.checked = !chk.checked;
        const val = chk.value;
        if (chk.checked) {
          if (!state.groupWizard.selectedHouses.includes(val)) state.groupWizard.selectedHouses.push(val);
        } else {
          state.groupWizard.selectedHouses = state.groupWizard.selectedHouses.filter(h => h !== val);
        }
        state.groupWizard.currentPage = 0;
        renderGroupWizard();
      }
      return;
    }
  });
  $("#autoGroupDetails")?.addEventListener("input", event => {
    const input = event.target.closest("#wizardHouseSearch");
    if (!input) return;
    state.groupWizard.search = input.value;
    renderGroupWizard();
  });
  $("#manualGroupSearch")?.addEventListener("input", () => {
    renderManualGroupList();
    renderGroupPreview();
  });
  $("#manualGroupDriver")?.addEventListener("change", renderGroupPreview);
  $("#manualGroupList")?.addEventListener("change", event => {
    const checkbox = event.target.closest("input[type='checkbox']");
    if (!checkbox) return;
    if (checkbox.checked) {
      if (!state.selectedManualHouses.includes(checkbox.value)) state.selectedManualHouses.push(checkbox.value);
    } else {
      state.selectedManualHouses = state.selectedManualHouses.filter(house => house !== checkbox.value);
    }
    renderManualGroupList();
    renderGroupPreview();
  });
  $("#buildManualGroupBtn")?.addEventListener("click", () => {
    const jobs = selectedManualJobs();
    if (!jobs.length) {
      toast("เลือก House อย่างน้อย 1 งานก่อนสร้างกลุ่ม");
      return;
    }
    prepareAdminFormForJobs(jobs, manualGroupDriver());
    setGroupPreview(jobs, manualGroupDriver());
    toast(`สร้าง Preview กลุ่มงาน ${jobs.length} งานแล้ว`);
  });
  $("#issueManualGroupBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
    const jobs = selectedManualJobs();
    if (!jobs.length) throw new Error("เลือก House อย่างน้อย 1 งานก่อนออกใบ Cargo");
    const unconfirmedOut = jobs.filter(j => !j.csConfirmed);
    if (unconfirmedOut.length) throw new Error(`งาน ${unconfirmedOut.map(j=>j.houseNumber).join(", ")} ยังรอ CS ยืนยัน Invoice`);
    prepareAdminFormForJobs(jobs, manualGroupDriver());
    const createdJobs = await issueAdminCargoFromCurrentForm();
    setView("cargo-history");
    printCargoOnly();
    toast(`ออกใบ Cargo แล้ว ${createdJobs.length || jobs.length} งาน และย้ายไปประวัติ`);
  }));
  $("#printGroupPreviewBtn")?.addEventListener("click", () => {
    const jobs = state._groupCtfJobs || [];
    if (!jobs.length) { toast("เลือกกลุ่มงานก่อนพิมพ์", "error"); return; }
    const csWait = jobs.filter(j => !j.csConfirmed);
    if (csWait.length) { toast(`🔒 ${csWait.length} งานยังไม่ผ่าน CS ยืนยัน: ${csWait.slice(0,5).map(j=>j.houseNumber).join(", ")}${csWait.length>5?" ...":""}`, "error"); return; }
    // Inbound: print cargo pickup form
    if (state.groupingTab === "inbound") {
      const preview = $("#groupCargoPreview");
      if (!preview?.innerHTML) return;
      const win = window.open("", "_blank", "width=820,height=900");
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cargo Pickup Form</title>
        <link rel="stylesheet" href="/styles.css">
        <style>@media print{.no-print{display:none!important}}</style></head>
        <body>${preview.innerHTML}
        <div class="no-print" style="text-align:center;margin-top:20px">
          <button onclick="window.print()" style="padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;margin-right:12px">🖨 พิมพ์</button>
          <button onclick="window.close()" style="padding:12px 24px;background:#64748b;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer">ปิด</button>
        </div></body></html>`);
      win.document.close();
      return;
    }
    const allJobs = state.dashboard?.jobs || [];
    const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>Cargo Transfer Form</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:12px}@media print{.no-print{display:none!important}}</style>
</head><body>
${buildCtfPreviewHtml({
      driver: $("#groupCtfDriver")?.value || "",
      plate: $("#groupCtfPlate")?.value || "",
      velType: $("#groupCtfVelType")?.value || "6 ล้อ",
      tmo: $("#groupCtfTmo")?.value || "INTER",
      relBy: $("#groupCtfReleaseBy")?.value || "",
      unloadBy: $("#groupCtfUnloadBy")?.value || "",
      rows: jobs.map(j => ({ houseNumber: j.houseNumber, flightNumber: j.flightNo || j.flightNumber || "", customerName: j.customerName || "", destination: j.destAirport || j.destination || "", pieces: j.pieceCount || "", awbNumber: j.awbNumber || "" })),
      jobs: allJobs
    })}
<div class="no-print" style="text-align:center;margin-top:20px">
  <button onclick="window.print()" style="padding:12px 32px;background:#0f766e;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;margin-right:12px">🖨 พิมพ์</button>
  <button onclick="window.close()" style="padding:12px 24px;background:#64748b;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer">ปิด</button>
</div></body></html>`;
    const win = window.open("", "_blank", "width=860,height=950");
    win.document.write(html);
    win.document.close();
  });
  $("#alertList")?.addEventListener("click", event => {
    const card = event.target.closest("[data-alert-id]");
    if (!card) return;
    openAlertDetail(card.dataset.alertId);
  });
  ["closeAlertDetailModal", "cancelAlertDetailModal"].forEach(id => $(`#${id}`)?.addEventListener("click", closeAlertDetail));
  $("#alertDetailModal")?.addEventListener("click", event => {
    if (event.target.id === "alertDetailModal") closeAlertDetail();
  });
  document.addEventListener("click", event => {
    const qh = event.target.closest("[data-quick-house]");
    if (qh?.dataset.quickHouse) openJobQuickView(qh.dataset.quickHouse);
  });
  ["closeJobQuickModal", "jqvClose"].forEach(id => $(`#${id}`)?.addEventListener("click", closeJobQuickView));
  $("#jobQuickModal")?.addEventListener("click", event => {
    if (event.target.id === "jobQuickModal") closeJobQuickView();
  });
  $("#jqvGoDetail")?.addEventListener("click", () => {
    const house = state.quickViewHouse;
    closeJobQuickView();
    if (house) {
      state.selectedHouse = house;
      setView("orders");
      refresh();
    }
  });
  $("#jqvGoGroup")?.addEventListener("click", () => {
    closeJobQuickView();
    setView("grouping");
    refresh();
  });
  $("#primaryAlertActionBtn")?.addEventListener("click", confirmAlertUpdate);
  $("#secondaryAlertActionBtn")?.addEventListener("click", () => {
    const item = alertItemById(state.selectedAlertId);
    if (!item?.job?.cargoIssuedAt) return;
    closeAlertDetail();
    state.selectedHistoryHouse = item.job.houseNumber;
    setView("cargo-history");
    renderCargoHistory();
  });
  $("#cargoHistorySearch")?.addEventListener("input", event => {
    state.cargoHistoryFilters.search = event.target.value;
    renderCargoHistory();
  });
  $("#cargoHistoryFrom")?.addEventListener("change", event => {
    state.cargoHistoryFilters.from = event.target.value;
    renderCargoHistory();
  });
  $("#cargoHistoryTo")?.addEventListener("change", event => {
    state.cargoHistoryFilters.to = event.target.value;
    renderCargoHistory();
  });
  $("#printHistoryCargoBtn")?.addEventListener("click", () => {
    const job = findExactJob(state.selectedHistoryHouse);
    if (!job) {
      toast("เลือกใบ Cargo จากประวัติก่อนพิมพ์ซ้ำ");
      return;
    }
    fillAdminFormFromJob(job);
    printCargoOnly();
  });
  $("#adminCreateResult").addEventListener("click", event => {
    if (event.target.closest("[data-admin-result-print]")) {
      printCargoOnly();
      return;
    }
    if (event.target.closest("[data-admin-result-track]")) {
      setView("orders");
      renderOrderCards();
      renderTimeline();
    }
  });
  $("#issueCargoBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    let job = findJob();
    if (!job) throw new Error("กรุณาเลือกงานก่อน / Please select an order first");
    const wasIssued = Boolean(job.cargoIssuedAt);
    if (!job.cargoIssuedAt) {
      const data = await api("/api/admin/issue-cargo", { houseNumber: job.houseNumber });
      state.dashboard = data.dashboard;
      job = findJob(job.houseNumber);
    }
    fillAdminFormFromJob(job);
    renderAdminWorkQueue();
    if (!wasIssued) {
      renderOrderDetail();
      toast("ออกใบ Cargo แล้ว — กดดูประวัติหรือพิมพ์ได้ที่หน้า Cargo History");
    } else {
      setView("cargo-history");
      state.selectedHistoryHouse = job.houseNumber;
      renderCargoHistory();
      toast("เปิดประวัติใบ Cargo แล้ว");
    }
  }));
  ["adminPickupDate", "adminCustomer", "adminPickupLocation", "adminDriverName", "adminVehiclePlate", "adminPieceCount", "adminPickupItems", "adminPackageType", "adminDestination", "adminStickerColor"].forEach(id => {
    $(`#${id}`).addEventListener("input", () => {
      updateAdminBatchSummary();
      renderCargoPreview();
    });
  });
  $("#terminalHouse").addEventListener("input", updateTerminalRequirements);
  $("#billingHouse").addEventListener("input", renderBillingContext);
  ["billingCustomerName", "billingCustomerEmail", "billingCustomerPhone", "billingCustomerTaxId", "billingCustomerCreditTerm", "billingCustomerAddress"].forEach(id => {
    $(`#${id}`)?.addEventListener("input", () => renderBillingContext(true));
  });
  $("#saveBillingCustomerBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const job = billingSelectedJob();
    const data = await api("/api/customers/upsert", {
      houseNumber: job?.houseNumber || $("#billingHouse").value.trim(),
      id: job?.customerId || "",
      name: $("#billingCustomerName").value.trim(),
      billingEmail: $("#billingCustomerEmail").value.trim(),
      phone: $("#billingCustomerPhone").value.trim(),
      taxId: $("#billingCustomerTaxId").value.trim(),
      creditTerm: $("#billingCustomerCreditTerm").value,
      address: $("#billingCustomerAddress").value.trim()
    });
    state.dashboard = data.dashboard;
    state.customers = data.customers || state.customers;
    renderAll();
    toast("บันทึกลูกค้าแล้ว / Customer saved");
  }));
  $("#buildBillingGroupsBtn")?.addEventListener("click", () => {
    state.selectedBillingBatchId = "";
    renderBillingBatchBuilder();
  });
  ["batchDateFrom", "batchDateTo", "batchPeriodFilter", "batchPlanFilter"].forEach(id => {
    $(`#${id}`)?.addEventListener("change", () => {
      state.selectedBillingBatchId = "";
      renderBillingBatchBuilder();
    });
  });
  $("#billingBatchGroupList")?.addEventListener("click", event => {
    const card = event.target.closest("[data-batch-id]");
    if (!card) return;
    state.selectedBillingBatchId = card.dataset.batchId;
    renderBillingBatchBuilder();
  });
  $("#reviewBillingBatchBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
    const group = selectedBillingBatch();
    if (!group) throw new Error("กรุณาเลือกกลุ่มวางบิล");
    const data = await api("/api/billing/review-batch", {
      houseNumbers: group.jobs.map(job => job.houseNumber),
      groupName: `${group.month}-${group.period}-${group.plan}`
    });
    state.dashboard = data.dashboard;
    renderAll();
    toast(`ตรวจเอกสาร ${group.jobs.length} House แล้ว`);
  }));
  $("#generateBillingBatchBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
    const group = selectedBillingBatch();
    if (!group) throw new Error("กรุณาเลือกกลุ่มวางบิล");
    const data = await api("/api/billing/generate-batch", {
      houseNumbers: group.jobs.map(job => job.houseNumber),
      billingMonth: group.month,
      billingPeriod: group.period,
      billingPlan: group.plan,
      tripCount: group.trips.length,
      amount: Number($("#billingBatchAmount")?.value || group.amount)
    });
    state.dashboard = data.dashboard;
    $("#invoiceId").value = data.bill.id;
    $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>${data.bill.houseNumbers.length} House · ${money(data.bill.amount)} บาท · <a href="${assetUrl(data.bill.pdfUrl)}" target="_blank" rel="noreferrer">เปิดเอกสารรวม</a>`;
    renderAll();
    toast("สร้าง Draft ใบวางบิลแบบกลุ่มแล้ว");
  }));
  $("#exportBillingBatchBtn")?.addEventListener("click", exportSelectedBillingBatch);
  $("#scanHouse").addEventListener("input", event => {
    const normalized = normalizeHouseBarcode(event.currentTarget.value);
    if (normalized !== event.currentTarget.value.trim() && normalized.length >= 8) event.currentTarget.value = normalized;
    updateInboundInfo();
  });
  $$("[data-ops-target]").forEach(button => {
    button.addEventListener("click", () => showOpsSection(button.dataset.opsTarget));
  });
  $$(".ops-main-card").forEach(button => {
    button.addEventListener("click", () => showRolePanel(button.dataset.roleTarget));
  });
  $("#terminalHouse").addEventListener("change", event => {
    event.currentTarget.value = normalizeHouseBarcode(event.currentTarget.value);
    updateTerminalRequirements();
  });
  $("#outboundFoundScan").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.value = normalizeHouseBarcode(event.currentTarget.value);
      $("#locateGoodsBtn").click();
    }
  });
  $("#moveLocationId").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#moveLocationBtn").click();
    }
  });
  window.addEventListener("online", syncOfflineQueue);

  $("#checkInBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const gps = await getGps();
    state.pickupStartTime = new Date().toISOString();
    await api("/api/pickup/checkin", {
      houseNumber: primaryHouseNumber(),
      houseNumbers: pickupHouseNumbers(),
      userId: "u_driver_01",
      startTime: state.pickupStartTime,
      startPlace: $("#driverStartPlace").value.trim(),
      ...gps
    });
    toast("เช็คอินสำเร็จ / Check-in complete");
  }));

  $("#loadCargoBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
    validatePickupFlow();
    const gps = await getGps();
    await api("/api/pickup/load", {
      houseNumber: primaryHouseNumber(),
      houseNumbers: pickupHouseNumbers(),
      userId: "u_driver_01",
      pickupCase: $("#driverPickupCase").value,
      stickerColor: $("#driverStickerColor").value.trim(),
      checklist: checkedPickupItems(),
      pickupItems: syncPickupItemsText(),
      packageType: $("#driverPackageType").value,
      endPlace: $("#driverEndPlace").value.trim(),
      ...gps
    });
    state.cargoLoaded = true;
    $("#loadCargoBtn").classList.add("loaded");
    $("#loadCargoBtn").textContent = "โหลดขึ้นรถแล้ว / Cargo loaded";
    toast("โหลดสินค้าขึ้นรถแล้ว / Cargo loaded");
  }));

  $("#completePickupBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    validatePickupFlow({ requireLoaded: true });
    const gps = await getGps();
    const productImages = await filesToCompressedBase64($("#productImages"));
    const cargoImages = await filesToCompressedBase64($("#cargoImages"));
    await api("/api/pickup/complete", {
      houseNumber: primaryHouseNumber(),
      houseNumbers: pickupHouseNumbers(),
      userId: "u_driver_01",
      startTime: state.pickupStartTime,
      ...gps,
      productImages,
      cargoImages,
      signatureBase64: $("#signaturePad").toDataURL("image/png"),
      pickupCase: $("#driverPickupCase").value,
      stickerColor: $("#driverStickerColor").value.trim(),
      checklist: checkedPickupItems(),
      pieceCount: $("#driverPieceCount").value,
      pickupItems: syncPickupItemsText(),
      packageType: $("#driverPackageType").value,
      inspectorName: $("#driverInspectorName").value.trim(),
      receiverName: $("#driverReceiverName").value.trim(),
      endPlace: $("#driverEndPlace").value.trim()
    });
    toast("จบงาน Pickup แล้ว / Pickup completed");
  }));

  $("#twinScanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/inbound/twin-scan", {
      houseNumber: normalizeHouseBarcode($("#scanHouse").value),
      locationId: $("#scanLocation").value.trim(),
      userId: "u_wh_01",
      trackType: $("#trackType").value,
      dimensionText: $("#dimensionText").value.trim()
    });
    toast("ล็อกตำแหน่งสำเร็จ / Location locked");
  }));

  $("#docCheckBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const documentFiles = await filesToCompressedBase64($("#inboundDocFiles"));
    await api("/api/inbound/document-check", {
      houseNumber: normalizeHouseBarcode($("#scanHouse").value),
      userId: "u_wh_01",
      documentStatus: $("#inboundDocStatus").value,
      note: $("#inboundDocNote").value.trim(),
      documentFiles
    });
    toast($("#inboundDocStatus").value === "Missing" ? "พักงานรอ EI Confirm / Pending EI" : "ตรวจเอกสารแล้ว / Document checked");
  }));

  $("#openInboundBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/inbound/open", {
      houseNumber: normalizeHouseBarcode($("#scanHouse").value),
      userId: "u_wh_01",
      eiConfirmed: $("#inboundDocStatus").value === "EIConfirmed"
    });
    toast("เปิดงานรับเข้าแล้ว / Inbound opened");
  }));

  $("#houseScanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/inbound/scan-house", {
      houseNumber: normalizeHouseBarcode($("#scanHouse").value),
      userId: "u_wh_01",
      trackType: $("#trackType").value,
      flightChanged: $("#flightChanged").value === "Yes",
      updatedFlightNo: $("#updatedFlightNo").value.trim()
    });
    toast("Scan House แล้ว / House identified");
  }));

  $("#moveLocationBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const newLocationId = ($("#moveLocationId").value || $("#scanLocation").value).trim();
    if (!newLocationId) throw new Error("กรุณากรอก Location ใหม่");
    await api("/api/inbound/move-location", {
      houseNumber: normalizeHouseBarcode($("#scanHouse").value),
      newLocationId,
      userId: "u_wh_01",
      note: $("#dimensionText").value.trim()
    });
    toast("ย้าย Location สำเร็จ / Location moved");
  }));

  $("#closeInboundBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const evidenceFiles = await filesToCompressedBase64($("#inboundEvidenceFiles"));
    await api("/api/inbound/close", {
      houseNumber: normalizeHouseBarcode($("#scanHouse").value),
      userId: "u_wh_01",
      evidenceFiles
    });
    toast("ปิดงานรับเข้าแล้ว / Inbound closed");
  }));

  $("#locateGoodsBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const scannedHouse = normalizeHouseBarcode($("#outboundFoundScan").value || $("#terminalHouse").value);
    await api("/api/outbound/confirm-location", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      scannedHouse,
      userId: "u_wh_01"
    });
    toast("ยืนยันเจอสินค้าแล้ว / Goods found");
  }));

  $("#loadTransferHouseBtn").addEventListener("click", () => {
    const job = findExactJob($("#terminalHouse").value);
    $("#transferHouseList").value = job?.houseNumber || normalizeHouseBarcode($("#terminalHouse").value);
    $("#transferDriver").value = job?.driverName || job?.aotDriverName || "";
    $("#transferPlate").value = job?.vehiclePlate || job?.aotVehiclePlate || "";
    $("#transferTo").value = ["TG", "TGINT", "BFS"].includes(job?.destination) ? job.destination : "TG";
    renderTransferPreview();
  });
  $("#outboundPrepFlightFilter").addEventListener("change", renderOutboundPreparationQueue);
  $("#outboundPreparationQueue").addEventListener("change", event => {
    if (event.target.matches(".outbound-prep-check")) syncOutboundSelection();
  });
  $("#selectVisibleOutboundBtn").addEventListener("click", () => {
    $$(".outbound-prep-check").forEach(input => { input.checked = true; });
    syncOutboundSelection();
  });
  $("#clearOutboundSelectionBtn").addEventListener("click", () => {
    $("#transferHouseList").value = "";
    renderOutboundPreparationQueue();
    renderTransferPreview();
  });
  $$('[data-open-outbound]').forEach(button => button.addEventListener("click", () => {
    showOpsSection(button.dataset.openOutbound);
    $$('[data-outbound-phase]').forEach(item => item.classList.toggle("active", item === button));
  }));
  $("#previewTransferBtn").addEventListener("click", renderTransferPreview);
  $("#printTransferBtn").addEventListener("click", printTransferOnly);
  $("#issueTransferBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const houses = transferHouseNumbers();
    if (!houses.length) throw new Error("กรุณาระบุเลข House อย่างน้อย 1 งาน");
    const selectedJobs = houses.map(findExactJob).filter(Boolean);
    if (selectedJobs.some(job => job.requiresLithiumDocs) && !$("#transferLithiumFiles").files.length) {
      throw new Error("ชุดงานนี้มีสินค้าลิเทียม กรุณาแนบเอกสาร Lithium ก่อนออกใบ");
    }
    const permitFiles = await filesToCompressedBase64($("#transferPermitFiles"));
    const lithiumFiles = await filesToCompressedBase64($("#transferLithiumFiles"));
    const data = await api("/api/outbound/transfer-form", {
      action: "issue", houses,
      transferDate: $("#transferDate").value,
      transferTime: $("#transferTime").value,
      transferFrom: $("#transferFrom").value.trim(),
      transferTo: $("#transferTo").value,
      driverName: $("#transferDriver").value.trim(),
      vehiclePlate: $("#transferPlate").value.trim(),
      vehicleType: $("#transferVehicleType").value.trim(),
      releaseBy: $("#transferReleaseBy").value.trim(),
      eiBarcodeReference: $("#eiSystemScan").value.trim(),
      permitFiles,
      lithiumFiles,
      userId: "u_admin_01"
    });
    state.dashboard = data.dashboard;
    renderTransferPreview();
    $("#transferIssueResult").innerHTML = `<strong>ออกใบ Cargo Transfer สำเร็จ</strong><span>${houses.length} House · พร้อมสั่งพิมพ์</span>`;
    toast("ออกใบ Cargo Transfer สำเร็จ / Transfer form issued");
  }));
  $("#confirmTransferReturnBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const proof = await fileToCompressedBase64($("#returnedTransferFile"));
    const data = await api("/api/outbound/transfer-form", {
      action: "return", houses: transferHouseNumbers(), userId: "u_admin_01",
      imageBase64: proof.base64, mimeType: proof.mimeType
    });
    state.dashboard = data.dashboard;
    $("#transferIssueResult").innerHTML = `<strong>รับเอกสารตัวจริงคืนแล้ว</strong><span>แนบหลักฐานเข้าระบบเรียบร้อย</span>`;
    toast("ยืนยันรับ Cargo Transfer ตัวจริงคืนแล้ว / Document returned");
  }));

  $("#pickingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const documentFiles = await filesToCompressedBase64($("#outboundDocs"));
    await api("/api/outbound/picking", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_wh_01",
      note: $("#cargoTransferNote").value.trim(),
      documentFiles
    });
    toast("เบิกสินค้าแล้ว / Goods picked");
  }));

  $("#eiApproveBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const proof = await fileToCompressedBase64($("#eiProofImage"));
    await api("/api/outbound/ei-approve", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_wh_01",
      imageBase64: proof.base64,
      mimeType: proof.mimeType
    });
    toast("EI approve แล้ว / EI approved");
  }));

  $("#aotBookingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/aot-booking", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_admin_01",
      terminalDestination: $("#terminalDestination").value,
      vehiclePlate: $("#aotVehiclePlate").value.trim(),
      driverName: $("#aotDriverName").value.trim(),
      vehicleModel: $("#aotVehicleModel").value.trim(),
      vehicleType: $("#aotVehicleType").value.trim(),
      approved: false
    });
    toast("จองคิวรถแล้ว / Queue booked");
  }));

  $("#aotApproveBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/aot-booking", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_admin_01",
      terminalDestination: $("#terminalDestination").value,
      vehiclePlate: $("#aotVehiclePlate").value.trim(),
      driverName: $("#aotDriverName").value.trim(),
      vehicleModel: $("#aotVehicleModel").value.trim(),
      vehicleType: $("#aotVehicleType").value.trim(),
      approved: true
    });
    toast("อนุมัติคิวแล้ว / Queue approved");
  }));

  $("#loadBayBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const image = await fileToCompressedBase64($("#preLoadPhoto"));
    await api("/api/outbound/load-bay", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_wh_01",
      imageBase64: image.base64,
      mimeType: image.mimeType,
      arrived: false
    });
    toast("โหลดขึ้นรถแล้ว / Goods loaded");
  }));

  $("#terminalArrivalBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/load-bay", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_driver_01",
      arrived: true
    });
    toast("ส่งถึง Terminal แล้ว / Terminal arrived");
  }));

  $("#validateDocBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const job = findExactJob($("#terminalHouse").value.trim());
    if (job?.requiresLithiumDocs && !$("#lithiumDoc").files.length) {
      throw new Error("งานลิเธียมต้องแนบเอกสารก่อน / Lithium document is required");
    }
    const doc = await fileToCompressedBase64($("#lithiumDoc"));
    await api("/api/outbound/validate", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      lithiumDocBase64: doc.base64,
      mimeType: doc.mimeType
    });
    toast("ตรวจเอกสารสำเร็จ / Documents validated");
  }));

  // ── Weigh Start Button ──
  $("#weighStartBtn")?.addEventListener("click", async () => {
    const houseNumber = normalizeHouseBarcode($("#terminalHouse").value);
    if (!houseNumber) { toast("กรอก House Number ก่อน"); return; }
    const btn = $("#weighStartBtn");
    btn.disabled = true;
    const now = new Date();
    btn.textContent = "✓ เริ่ม " + now.toLocaleTimeString("th-TH");
    btn.style.background = "#dcfce7";
    const display = $("#weighStartDisplay");
    if (display) display.textContent = "เริ่มชั่ง " + now.toLocaleTimeString("th-TH");
    try {
      await api("/api/outbound/weigh-start", { houseNumber, userId: state.user?.id || "u_terminal_01" });
    } catch(e) { /* store local time anyway */ }
  });

  $("#weightDimensionBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/weight-dimension", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_terminal_01",
      weight: $("#terminalWeight").value.trim(),
      dimension: $("#terminalDimension").value.trim()
    });
    toast("บันทึกน้ำหนักและขนาดเรียบร้อยแล้ว");
  }));

  $("#xrayPassedBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/xray", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_terminal_01",
      passed: true,
      requiresRescan: false
    });
    toast("บันทึก X-Ray ผ่าน / X-Ray passed");
  }));

  $("#rescanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/xray", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_terminal_01",
      passed: false,
      requiresRescan: true
    });
    toast("ส่ง Alert Re-X-Ray แล้ว / Alert sent");
  }));

  $("#xrayHoldBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/xray", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_terminal_01",
      passed: false,
      requiresRescan: false,
      hold: true
    });
    toast("Hold งานไว้ตรวจสอบ");
  }));

  $("#packingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    await api("/api/outbound/weight-dimension", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      userId: "u_terminal_01",
      weight: $("#terminalWeight").value.trim(),
      dimension: $("#terminalDimension").value.trim(),
      packing: true
    });
    toast("Packing / Consolidation แล้ว");
  }));

  $("#loadingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const image = await fileToCompressedBase64($("#loadingImage"));
    await api("/api/outbound/loading-detail", {
      houseNumber: normalizeHouseBarcode($("#terminalHouse").value),
      imageBase64: image.base64,
      mimeType: image.mimeType,
      trayNumber: $("#trayNumber").value.trim()
    });
    toast("อัปโหลด Loading Detail แล้ว / Loading detail uploaded");
  }));

  $("#generateBillBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/billing/generate", { houseNumber: $("#billingHouse").value.trim() });
    state.dashboard = data.dashboard;
    $("#invoiceId").value = data.bill.id;
    $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>ยอด ${money(data.bill.amount)} บาท · <a href="${assetUrl(data.bill.pdfUrl)}" target="_blank" rel="noreferrer">เปิดเอกสาร / Open document</a>`;
    renderBillingContext();
    toast("สร้างใบแจ้งหนี้ Draft แล้ว / Invoice draft created");
  }));

  $("#previewInvoiceBtn").addEventListener("click", () => {
    const invoice = selectedInvoice();
    if (!invoice?.pdfUrl) return toast("ยังไม่มี Draft Invoice ให้เปิดดู");
    window.open(assetUrl(invoice.pdfUrl), "_blank", "noopener,noreferrer");
  });

  $("#printInvoiceBtn").addEventListener("click", () => {
    const invoice = selectedInvoice();
    if (!invoice?.pdfUrl) return toast("ยังไม่มี Draft Invoice ให้พิมพ์");
    const win = window.open(assetUrl(invoice.pdfUrl), "_blank", "noopener,noreferrer");
    if (win) win.addEventListener("load", () => win.print(), { once: true });
  });

  $("#reviewBillingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/billing/review", {
      houseNumber: $("#billingHouse").value.trim(),
      status: "Reviewed",
      note: $("#billingReviewNote").value.trim()
    });
    $("#billingResult").innerHTML = `<strong>${data.job.houseNumber}</strong><br>เอกสารพร้อมวางบิล / Documents reviewed`;
    toast("เอกสารพร้อมวางบิล / Reviewed");
  }));

  $("#holdBillingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/billing/review", {
      houseNumber: $("#billingHouse").value.trim(),
      status: "Hold",
      note: $("#billingReviewNote").value.trim()
    });
    $("#billingResult").innerHTML = `<strong>${data.job.houseNumber}</strong><br>พักรายการไว้ตรวจเอกสารเพิ่ม / Pending review`;
    toast("พักรายการแล้ว / Hold");
  }));

  $("#sendInvoiceBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const emailFiles = await filesToCompressedBase64($("#billingEmailFiles"));
    const data = await api("/api/billing/send-email", {
      invoiceId: $("#invoiceId").value.trim(),
      emailFiles
    });
    $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>${data.bill.status} · ${data.bill.billingEmail} · แนบ ${data.bill.emailAttachments?.length || 0} ไฟล์`;
    toast("บันทึกสถานะส่งอีเมลแล้ว / Email status saved");
  }));

  $("#markBilledBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const data = await api("/api/billing/mark-billed", { invoiceId: $("#invoiceId").value.trim() });
    $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>Billed · Due ${data.bill.dueDate}`;
    toast("ปิดเป็น Billed แล้ว / Billed");
  }));

  $("#createJobBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const rows = adminPickupRows();
    const payload = {
      houseNumber: $("#adminHouse").value.trim(),
      customerId: $("#adminCustomer").value,
      pickupCase: $("#adminPickupCase").value,
      cargoFormMode: $("#adminPickupCase").value === "SpecialMD" ? "AdminPrepared" : "DriverWrites",
      adminPrepared: $("#adminPickupCase").value === "SpecialMD",
      pickupDate: rows[0]?.pickupDate || $("#adminPickupDate").value,
      pickupLocation: $("#adminPickupLocation").value.trim(),
      driverId: $("#adminDriverSelect").value,
      driverName: $("#adminDriverName").value.trim(),
      vehiclePlate: $("#adminVehiclePlate").value.trim(),
      pieceCount: $("#adminPieceCount").value,
      pickupItems: $("#adminPickupItems").value,
      packageType: $("#adminPackageType").value,
      destination: $("#adminDestination").value,
      stickerColor: $("#adminStickerColor").value.trim(),
      flightNo: $("#adminFlightNo").value.trim(),
      flightTime: datetimeLocalToIso($("#adminFlightTime").value),
      productType: $("#adminProductType").value,
      routeType: $("#adminRouteType").value,
      amount: $("#adminAmount").value,
      planSource: "ManualExtra",
      evidenceChannel: "Line/Email",
      evidenceNote: "Manual job created before/after load plan confirmation"
    };
    const data = await api(rows.length > 1 ? "/api/admin/job-batch" : "/api/admin/job", payload);
    if (data.dashboard) state.dashboard = data.dashboard;
    const createdJobs = data.jobs || (data.job ? [data.job] : []);
    if (createdJobs[0]) {
      state.selectedHouse = createdJobs[0].houseNumber;
      fillAdminFormFromJob(createdJobs[0]);
    }
    renderAll();
    renderCargoPreview();
    const resultEl = $("#adminCreateResult");
    const waitCs = createdJobs.filter(j => !j.csConfirmed);
    if (resultEl && createdJobs[0]) {
      resultEl.innerHTML = waitCs.length
        ? `<strong>${createdJobs[0].houseNumber}</strong>
        <span class="cs-wait-badge">🔒 รอ CS ยืนยัน ${waitCs.length} งาน</span>
        <button type="button" data-admin-result-track>ดูสถานะ / Track</button>`
        : `<strong>${createdJobs[0].houseNumber}</strong>
        <button type="button" data-admin-result-print>พิมพ์ใบ Cargo / Print</button>
        <button type="button" data-admin-result-track>ดูสถานะ / Track</button>`;
    }
    toast(waitCs.length
      ? `เปิดงานแล้ว ${createdJobs.length} งาน — ส่งให้ CS ยืนยันก่อนออกใบ (ดูที่เมนู รออนุมัติ)`
      : (createdJobs.length > 1 ? `เปิดงานกลุ่ม ${rows.length} งานแล้ว พร้อมพิมพ์ / Batch ready to print` : "เปิดงานแล้ว พร้อมพิมพ์ / Job ready to print"));
  }));

  $("#importFlightBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    openImportPreview("flight", $("#flightCsv").value, "Email / Flight Feed CSV");
  }));

  $("#importScdBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
    const fileInput = $("#scdCsvFile");
    const file = fileInput.files[0] || $("#csvDropZone")?._pendingFile;
    if (!file) return toast("กรุณาเลือกไฟล์ CSV หรือ Excel ก่อน");
    if (/\.xlsx$/i.test(file.name)) {
      const fileBase64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const data = await api("/api/admin/import-xlsx", { fileBase64, fileName: file.name });
      if (data.dashboard) state.dashboard = data.dashboard;
      renderAll();
      const kindLabel = data.kind === "pickup" ? "Pickup Report" : "Consol Planning";
      toast(`Import ${kindLabel} สำเร็จ: งานใหม่ ${data.newJobs || 0} · อัปเดต ${data.changedJobs || 0} รายการ`);
      return;
    }
    const csvText = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file, "utf-8");
    });
    openImportPreview("scd", csvText, file.name);
  }));

  // Admin mode chooser
  document.querySelectorAll(".admin-mode-card").forEach(btn => {
    btn.addEventListener("click", () => setAdminFlow(btn.dataset.adminMode));
  });

  // Warehouse zone color picker
  document.querySelectorAll(".wh-color-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wh-color-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      whMapState.selectedColor = btn.dataset.color;
    });
  });

  // Create zone button
  // Zone EDIT modal
  $("#whZoneEditSave")?.addEventListener("click", async () => {
    const zoneId     = $("#whZoneEditId")?.value;
    const name       = $("#whZoneEditName")?.value.trim();
    const levels     = Number($("#whZoneEditLevels")?.value) || 2;
    const color      = whMapState._editZoneColor;
    const maxPallets = parseInt($("#whZoneEditMaxPallets")?.value) || 0;
    const maxBoxes   = parseInt($("#whZoneEditMaxBoxes")?.value) || 0;
    if (!zoneId || !name) return;
    try {
      await api("/api/warehouse/zone/update", { zoneId, name, color, maxPallets, maxBoxes });
      // Update all locations' defaultLevels if needed (server handles)
      const m = $("#whZoneEditModal");
      if (m) m.classList.remove("show");
      await renderWarehouseMap();
      whShowSaveStatus("บันทึกโซนแล้ว");
    } catch(e) { toast(e.message, "error"); }
  });
  function closeWhModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("show");
    el.style.display = "";
  }
  $("#whZoneEditClose")?.addEventListener("click", () => closeWhModal("whZoneEditModal"));
  $("#whZoneEditModal")?.addEventListener("click", e => { if (e.target===e.currentTarget) closeWhModal("whZoneEditModal"); });
  document.querySelectorAll(".wh-color-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wh-color-edit-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      whMapState._editZoneColor = btn.dataset.color;
    });
  });

  // Zone create modal close
  $("#whZoneModalClose")?.addEventListener("click", closeWhZoneModal);
  $("#whZoneModalCancel")?.addEventListener("click", closeWhZoneModal);
  $("#whZoneCreateModal")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeWhZoneModal(); });

  $("#whCreateZoneBtn")?.addEventListener("click", async () => {
    const name = $("#whZoneName")?.value.trim();
    const prefix = $("#whZonePrefix")?.value.trim().toUpperCase();
    const rows = Number($("#whZoneRows")?.value) || 3;
    const cols = Number($("#whZoneCols")?.value) || 3;
    const levels = Number($("#whZoneLevels")?.value) || 1;
    const color = whMapState.selectedColor || "#dbeafe";
    if (!name || !prefix) { toast("กรุณากรอกชื่อโซนและ Prefix"); return; }
    const result = $("#whCreateResult");
    if (result) result.textContent = "กำลังสร้าง...";
    try {
      await api("/api/warehouse/zone/create", { name, prefix, rows, cols, defaultLevels: levels, color });
      closeWhZoneModal();
      renderWarehouseMap();
      whShowSaveStatus(`สร้างโซน "${name}" สำเร็จ`);
    } catch (e) {
      if (result) result.textContent = e.message || "เกิดข้อผิดพลาด";
      toast(e.message || "สร้างโซนไม่ได้", "error");
    }
  });

  // Create overlay button
  $("#whCreateOverlayBtn")?.addEventListener("click", async () => {
    const type = whMapState.selectedOverlayType || "aisle";
    const label = $("#whOverlayLabel")?.value.trim();
    const sublabel = $("#whOverlaySublabel")?.value.trim() || "";
    const color = $("#whOverlayColor")?.value || "#f1f5f9";
    const mapOrder = Number($("#whOverlayOrder")?.value) || ((whMapState.overlays.length + whMapState.zones.length) * 2 + 1);
    if (!label) { toast("กรุณากรอกชื่อ Overlay"); return; }
    try {
      await api("/api/warehouse/overlay/create", { type, label, sublabel, color, mapOrder });
      toast(`เพิ่ม "${label}" แล้ว`);
      const el = $("#whOverlayLabel"); if (el) el.value = "";
      renderWarehouseMap();
    } catch (e) { toast(e.message || "เพิ่มไม่ได้", "error"); }
  });

  // Save overlay edit modal
  $("#whOvEditSaveBtn")?.addEventListener("click", async () => {
    const ovId = $("#whOvEditId")?.value;
    if (!ovId) return;
    const label = $("#whOvEditLabel")?.value.trim();
    const sublabel = $("#whOvEditSublabel")?.value.trim() || "";
    const color = $("#whOvEditColor")?.value || "#f1f5f9";
    const activeTypeBtn = document.querySelector(".wh-ov-edit-type-btn.active");
    const type = activeTypeBtn?.dataset.ovType || "aisle";
    if (!label) { toast("กรุณากรอกชื่อ"); return; }
    try {
      const typeIcons = { door:"log-in", aisle:"footprints", office:"building-2", pillar:"square", wall:"minus", label:"tag", rowbreak:"corner-down-left" };
      await api("/api/warehouse/overlay/update", { overlayId: ovId, label, sublabel, color, type, icon: typeIcons[type] || "square" });
      toast("บันทึกแล้ว");
      $("#whOvEditModal")?.classList.remove("show");
      renderWarehouseMap();
    } catch(e) { toast(e.message || "บันทึกไม่ได้", "error"); }
  });
  $("#whOvEditModal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) { e.currentTarget.classList.remove("show"); }
  });
  const _closeOvEdit = () => { const m = $("#whOvEditModal"); if(m){m.classList.remove("show");m.setAttribute("aria-hidden","true");} };
  $("#closeWhOvEdit")?.addEventListener("click", _closeOvEdit);
  $("#closeWhOvEdit2")?.addEventListener("click", _closeOvEdit);
  document.querySelectorAll(".wh-ov-edit-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wh-ov-edit-type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Overlay type selector
  document.querySelectorAll(".wh-ov-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wh-ov-type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      whMapState.selectedOverlayType = btn.dataset.ovType;
    });
  });

  // Toolbar tool buttons
  document.querySelectorAll(".wh-tool-btn").forEach(btn => {
    btn.addEventListener("click", () => setWhTool(btn.dataset.tool));
  });
  // Preview button
  $("#whPreviewBtn")?.addEventListener("click", () => {
    const area = document.querySelector(".wh-map-area");
    if (area) area.classList.toggle("wh-preview-mode");
  });
  // Save Map button → show catalog card, collapse editor
  $("#whSaveMapBtn")?.addEventListener("click", () => {
    collapseWhEditorToCard();
  });
  // New Map button → goes back to catalog, user clicks สร้างแผนที่ใหม่ from there
  $("#whNewMapBtn")?.addEventListener("click", () => collapseWhEditorToCard());
  // Zone quick create close
  $("#whZoneQuickClose")?.addEventListener("click", () => setWhTool("select"));

  // Refresh log button
  $("#whRefreshLog")?.addEventListener("click", loadWhLog);
  // Load Plan
  // ── เปิดใบขาออก page events ──
  document.querySelectorAll("[data-obopen-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.obopenMode;
      obOpenState.mode = mode;
      document.querySelectorAll("[data-obopen-mode]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const importPanel = document.getElementById("obOpenImportPanel");
      const createPanel = document.getElementById("obOpenCreatePanel");
      if (importPanel) importPanel.hidden = mode !== "import";
      if (createPanel) createPanel.hidden = mode !== "create";
      obOpenUpdatePreview();
    });
  });


  async function handleObLpFile(file) {
    if (!file) return;
    try {
      toast("กำลังตรวจสอบไฟล์...");
      if (/\.xlsx$/i.test(file.name)) {
        const fileBase64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = ev => res(ev.target.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const preview = await api("/api/loadplan/preview", { fileBase64, fileName: file.name, planRound: $("#lpRoundSelect")?.value || "" });
        if (preview.ok) showLpPreviewModal(preview, "", fileBase64);
        return;
      }
      const csvText = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result);
        r.onerror = rej;
        r.readAsText(file, "utf-8");
      });
      const preview = await api("/api/loadplan/preview", { csvText, planRound: $("#lpRoundSelect")?.value || "" });
      if (preview.ok) showLpPreviewModal(preview, csvText);
    } catch (err) { toast("เกิดข้อผิดพลาด: " + err.message); }
  }
  document.getElementById("obOpenCsvFile")?.addEventListener("change", e => {
    handleObLpFile(e.target.files[0]);
    e.target.value = "";
  });
  // Drag-drop on obOpenCsvDrop
  const obDrop = document.getElementById("obOpenCsvDrop");
  if (obDrop) {
    obDrop.addEventListener("dragover", e => { e.preventDefault(); obDrop.classList.add("drag-over"); });
    obDrop.addEventListener("dragleave", () => obDrop.classList.remove("drag-over"));
    obDrop.addEventListener("drop", e => {
      e.preventDefault(); obDrop.classList.remove("drag-over");
      handleObLpFile(e.dataTransfer.files[0]);
    });
  }
  $("#lpRefreshBtn")?.addEventListener("click", renderLoadPlan);
  $("#ctfPrintBtn")?.addEventListener("click", printCargoTransferForm);
  $("#lpFileInput")?.addEventListener("change", e => {
    handleObLpFile(e.target.files[0]);
    e.target.value = "";
  });

  // Warehouse location detail modal close
  $("#whLocDetailModal")?.addEventListener("click", e => {
    if (e.target.id === "whLocDetailModal") {
      e.currentTarget.classList.remove("show");
      e.currentTarget.setAttribute("aria-hidden", "true");
    }
  });
  $("#closeWhLocDetail")?.addEventListener("click", () => {
    $("#whLocDetailModal")?.classList.remove("show");
    $("#whLocDetailModal")?.setAttribute("aria-hidden", "true");
  });

  // Staff picker modal close
  $("#whPickerModal")?.addEventListener("click", e => {
    if (e.target.id === "whPickerModal") {
      e.currentTarget.classList.remove("show");
      e.currentTarget.setAttribute("aria-hidden", "true");
    }
  });
  $("#closeWhPicker")?.addEventListener("click", () => {
    $("#whPickerModal")?.classList.remove("show");
    $("#whPickerModal")?.setAttribute("aria-hidden", "true");
  });

  // Hook "จัดเก็บ" button in Inbound section — open location picker
  document.addEventListener("click", async e => {
    const btn = e.target.closest("[data-inbound-store]");
    if (!btn) return;
    const house = btn.dataset.inboundStore;
    await loadWarehouseMap();
    openLocationPicker(house);
  });
}

function setAdminFlow(mode) {
  state.adminFlowMode = mode;
  const importPanel = $("#adminImportPanel");
  const createPanel = $("#adminEditorPanel");
  if (!importPanel || !createPanel) return;
  const isImport = mode === "import";
  importPanel.hidden = !isImport;
  createPanel.hidden = isImport;
  document.querySelectorAll(".admin-mode-card").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.adminMode === mode);
  });
  if (!isImport) lucide.createIcons();
}

function renderAdminWorkQueue() {
  const list = $("#adminWorkQueue");
  if (!list) return;
  const groups = adminUnopenedGroups();
  const total = groups.reduce((sum, group) => sum + group.jobs.length, 0);
  const keyword = (state.autoGroupSearch || "").trim().toLowerCase();
  const visibleGroups = groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => {
      if (!keyword) return true;
      const haystack = [
        group.customerName,
        group.pickupDate,
        group.pickupLocation,
        group.flightNo,
        ...group.jobs.map(job => `${job.houseNumber} ${job.customerName || ""} ${job.flightNo || ""} ${job.pickupLocation || ""}`)
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  const visibleTotal = visibleGroups.reduce((sum, item) => sum + item.group.jobs.length, 0);
  state.adminQueueGroups = groups;
  const count = $("#adminUnopenedCount");
  if (count) count.textContent = keyword ? `${visibleTotal}/${total} งาน` : `${total} ${localizeText("งาน / jobs")}`;
  list.innerHTML = visibleGroups.length ? `
    ${visibleGroups.slice(0, 24).map(({ group, index }) => {
      const needsDriver = group.jobs.some(job => !job.driverId || !job.vehiclePlate);
      const notIssued = group.jobs.some(job => !job.cargoIssuedAt);
      const houses = group.jobs.map(job => job.houseNumber).slice(0, 3).join(", ");
      const moreHouses = group.jobs.length > 3 ? ` +${group.jobs.length - 3}` : "";
      const loc = (group.pickupLocation || "-");
      const locShort = loc.length > 28 ? loc.slice(0, 28) + "\u2026" : loc;
      const borderCls = (notIssued || needsDriver) ? "qj-border-warn" : "qj-border-ok";
      return `
        <button class="queue-job qj-card ${borderCls} ${state.groupWizard.groupIndex === index ? "selected" : ""}" type="button" data-admin-open-group="${index}">
          <div class="qj-top">
            <strong class="qj-company">${safeHtml(group.customerName || "-")}</strong>
            <div class="qj-right">
              <span class="qj-pill ${(notIssued || needsDriver) ? "warn" : "ok"}">${group.jobs.length} งาน</span>
              <span class="qj-date">${safeHtml(group.pickupDate || "-")} · ${safeHtml(group.flightNo || "-")}</span>
            </div>
          </div>
          <div class="qj-bottom">
            <span class="qj-houses">${safeHtml(houses)}${moreHouses}</span>
            <div class="qj-tags">
              <span class="qj-tag ${notIssued ? "warn" : "ok"}">${notIssued ? "⚠ ยังไม่ออกใบ" : "✓ ออกใบแล้ว"}</span>
              <span class="qj-tag ${needsDriver ? "warn" : "ok"}">${needsDriver ? "⚠ รอเลือกคนขับ" : "✓ มีคนขับแล้ว"}</span>
            </div>
          </div>
        </button>
      `;
    }).join("")}` : `<div class="empty-state compact">${localizeText("ไม่มีงานรอเปิด / No unopened jobs")}</div>`;
}

function renderAlerts() {
  const target = $("#alertList");
  if (!target) return;
  const keyword = (state.alertSearch || "").trim().toLowerCase();
  const items = alertActionItems().filter(item => {
    if (!keyword) return true;
    return [item.title, item.message, item.customerName, item.houseNumber,
            item.type, item.category, item.job?.flightNo, ...(item.changes || [])]
      .join(" ").toLowerCase().includes(keyword);
  });

  const CHANGE_LABELS = {
    CUSTOMER_CHANGED: "ลูกค้าเปลี่ยน", FLIGHT_CHANGED: "เที่ยวบินเปลี่ยน",
    DESTINATION_CHANGED: "ปลายทางเปลี่ยน", DATE_CHANGED: "วันที่เปลี่ยน",
    WEIGHT_CHANGED: "น้ำหนักเปลี่ยน", PIECE_CHANGED: "จำนวนชิ้นเปลี่ยน",
    STATUS_CHANGED: "สถานะเปลี่ยน"
  };

  const groups = [
    { key: "flight-change", title: "ไฟล์บินเปลี่ยน", hint: "ข้อมูลเที่ยวบินมีการเปลี่ยนแปลง",            color: "#ef4444", bg: "#fff5f5" },
    { key: "not-issued",    title: "งานใหม่",          hint: "ต้องส่งจัดกลุ่มและออกใบ Cargo",             color: "#f59e0b", bg: "#fffbeb" },
    { key: "issued-review", title: "ออกใบแล้ว",        hint: "มีใบเดิม — ตรวจเทียบก่อนยืนยัน",           color: "#3b82f6", bg: "#eff6ff" },
    { key: "system",        title: "เหตุการณ์ระบบ",    hint: "ประวัติการเปิดงาน นำเข้าไฟล์ กิจกรรมอื่น", color: "#6b7280", bg: "#f8fafc" }
  ];

  const cols = groups.map(g => {
    const categoryItems = items.filter(i => i.category === g.key);
    const rows = categoryItems.slice(0, 30);

    const cardsHtml = rows.map(item => {
      const changeTags = (item.changes || []).map(c =>
        `<span class="change-tag">${safeHtml(CHANGE_LABELS[c] || c)}</span>`
      ).join("");
      const actionView = item.category === "not-issued" ? "grouping" : "orders";
      const actionLabel = item.category === "flight-change" ? "ตรวจไฟล์"
        : item.category === "not-issued" ? "จัดกลุ่ม"
        : item.category === "issued-review" ? "ตรวจใบ" : "รายละเอียด";
      return `<article class="ak-card clickable" style="--col-color:${g.color}" data-ak-house="${safeHtml(item.houseNumber || "")}" data-ak-view="${actionView}" role="button" tabindex="0">
        <div class="ak-card-head">
          <code class="ak-house">${safeHtml(item.houseNumber || "-")}</code>
          ${changeTags ? `<div class="ak-tags">${changeTags}</div>` : ""}
        </div>
        <p class="ak-customer">${safeHtml(item.customerName || "-")}</p>
        <p class="ak-msg">${safeHtml(item.message || "")}</p>
        <div class="ak-footer">
          <time>${item.createdAt ? new Date(item.createdAt).toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"}) : "-"}</time>
          <div class="ak-actions">
            <button class="ak-btn-action" type="button"
                    data-action-view="${actionView}"
                    data-action-house="${safeHtml(item.houseNumber)}"
                    style="background:${g.color}">${actionLabel} →</button>
            <button class="ak-btn-dismiss" type="button"
                    data-dismiss-id="${safeHtml(item.id)}"
                    data-dismiss-type="${safeHtml(item.category === 'system' ? 'system' : 'change')}">✓ รับทราบ</button>
          </div>
        </div>
      </article>`;
    }).join("");

    const emptyHtml = rows.length === 0 ? `<p class="ak-empty">ไม่มีรายการ</p>` : "";
    const moreNote = categoryItems.length > 30
      ? `<p class="ak-more">แสดง 30 จาก ${categoryItems.length} รายการ</p>` : "";

    return `<div class="ak-col" style="--col-color:${g.color};--col-bg:${g.bg}">
      <div class="ak-col-head">
        <div class="ak-col-title">
          <span class="ak-col-dot"></span>
          <strong>${g.title}</strong>
        </div>
        <b class="ak-col-count" style="background:${g.color}">${categoryItems.length}</b>
      </div>
      <p class="ak-col-hint">${g.hint}</p>
      <div class="ak-col-body">
        ${cardsHtml}${emptyHtml}${moreNote}
      </div>
    </div>`;
  });

  target.innerHTML = cols.join("");

  // action → navigate
  target.querySelectorAll(".ak-card.clickable").forEach(card => {
    card.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      const house = card.dataset.akHouse;
      if (house && house !== "-" && findExactJob(house)) {
        openJobQuickView(house);
        return;
      }
      const view = card.dataset.akView || "orders";
      setView(view);
      if (house && house !== "-" && view === "orders") {
        const el = $("#orderSearch");
        if (el) { el.value = house; renderOrderCards(); }
      }
    });
  });
  target.querySelectorAll(".ak-btn-action").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.actionView || "orders";
      const house = btn.dataset.actionHouse || "";
      setView(view);
      if (house && view === "orders") {
        const el = $("#orderSearch");
        if (el) { el.value = house; renderOrderCards(); }
      }
    });
  });

  // dismiss → fade + API
  target.querySelectorAll(".ak-btn-dismiss").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id   = btn.dataset.dismissId;
      const type = btn.dataset.dismissType;
      const card = btn.closest(".ak-card");
      if (card) {
        card.style.transition = "opacity .2s, transform .18s";
        card.style.opacity = "0"; card.style.transform = "scale(.96)";
        setTimeout(() => card.remove(), 210);
      }
      if (type === "system") {
        if (state.dashboard?.alerts)
          state.dashboard.alerts = state.dashboard.alerts.filter(a => a.id !== id);
      } else {
        if (state.dashboard?.importChanges)
          state.dashboard.importChanges = state.dashboard.importChanges.filter(c => c.id !== id);
      }
      setTimeout(() => renderAlerts(), 250);
      fetch(apiUrl("/api/alerts/dismiss"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type })
      }).catch(() => {});
    });
  });

  // badge update
  const total = items.length;
  const badge = $("#sidebarAlertBadge");
  if (badge) { badge.textContent = total; badge.hidden = total === 0; }
  const bell = $("#bellBadge");
  if (bell) { bell.textContent = total; bell.hidden = total === 0; }
}


// ===== STARTUP =====
document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  if (isWebAuthenticated()) {
    await refresh();
    applyWebRoleVisibility();
    renderWebSessionUser();
  } else {
    renderWebLogin();
    // โหลด users สำหรับ dropdown แม้ยังไม่ login
    try {
      const res = await fetch(apiUrl("/api/bootstrap"), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        state.users = data.users || [];
      }
    } catch (_) {}
    renderWebLoginUsers();
  }
  // apply language to static HTML labels immediately
  applyLanguage();
  initializeIcons();
});


// ══════════════════════════════════════════════════════════════════
//  ATTENDANCE WEB VIEW — renderAttendance()
// ══════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════
//  ATTENDANCE DASHBOARD — Kanban + Drag-Drop + Notifications
// ══════════════════════════════════════════════════════════════════

const attDash = {
  staff: [],        // today's attendance records
  allUsers: [],     // all field-role users
  taskGroups: [],   // today's task groups
  draggingUserId: null,
  notifSince: null,
  notifTimer: null
};

// ══════════════════════════════════════════════════════════════
// CS QUEUE — รายการรออนุมัติ CS
// ══════════════════════════════════════════════════════════════
var _csQueueData = [];

async function renderCsQueue() {
  const wrap = $("#view-cs-queue");
  if (!wrap) return;
  wrap.innerHTML = `<div class="att-dash-wrap"><div style="padding:20px;color:var(--text-muted)">กำลังโหลด...</div></div>`;
  try {
    const res = await fetch(apiUrl("/api/jobs/pending-cs"));
    const data = await res.json();
    _csQueueData = data.jobs || [];
    _renderCsQueueHtml();
  } catch(e) {
    console.error("renderCsQueue error:", e);
    wrap.innerHTML = `<div class="att-dash-wrap"><div style="color:red;padding:20px">โหลดข้อมูลไม่สำเร็จ: ${e.message || e}</div></div>`;
  }
}

var _csQueueFilters = { q: "", from: "", to: "" };
var _csQueueTab = "pending";
var _csHistoryData = [];

function csQueueFilterChange() {
  _csQueueFilters.q = document.getElementById("csSearchInput")?.value || "";
  _csQueueFilters.from = document.getElementById("csDateFrom")?.value || "";
  _csQueueFilters.to = document.getElementById("csDateTo")?.value || "";
  _renderCsQueueList();
}

function csQueueClearFilters() {
  _csQueueFilters = { q: "", from: "", to: "" };
  ["csSearchInput", "csDateFrom", "csDateTo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  _renderCsQueueList();
}

async function csSwitchTab(tab) {
  _csQueueTab = tab;
  document.querySelectorAll(".cs-tab").forEach(b => b.classList.toggle("active", b.dataset.cstab === tab));
  const lbl = document.getElementById("csDateLabel");
  if (lbl) lbl.textContent = tab === "history" ? "วันที่ยืนยัน" : "วันที่รับ";
  if (tab === "history" && !_csHistoryData.length) {
    try {
      const res = await fetch(apiUrl("/api/jobs/cs-history"));
      const data = await res.json();
      _csHistoryData = data.jobs || [];
    } catch (e) { toast("โหลดประวัติไม่สำเร็จ"); }
  }
  _renderCsQueueList();
}

function _csJobDate(j) {
  if (j.pickupDate) return j.pickupDate;
  if (j.createdAt) {
    try { return new Date(new Date(j.createdAt).getTime() + 7 * 3600000).toISOString().slice(0, 10); } catch (e) {}
  }
  return "";
}

function _csConfirmDate(j) {
  if (!j.csConfirmedAt) return "";
  try { return new Date(new Date(j.csConfirmedAt).getTime() + 7 * 3600000).toISOString().slice(0, 10); } catch (e) { return ""; }
}

function _csApplyFilters(list, dateFn) {
  const q = (_csQueueFilters.q || "").trim().toLowerCase();
  return list.filter(j => {
    if (q) {
      const hit = String(j.houseNumber || "").toLowerCase().includes(q)
        || String(j.customerName || "").toLowerCase().includes(q)
        || String(j.csInvoiceNo || "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (_csQueueFilters.from || _csQueueFilters.to) {
      const d = dateFn(j);
      if (!d) return false;
      if (_csQueueFilters.from && d < _csQueueFilters.from) return false;
      if (_csQueueFilters.to && d > _csQueueFilters.to) return false;
    }
    return true;
  });
}

function csSelectDateGroup(btn) {
  const grp = btn.closest(".cs-date-group");
  if (!grp) return;
  const checks = grp.querySelectorAll(".cs-job-check");
  const allChecked = Array.from(checks).every(c => c.checked);
  checks.forEach(c => { c.checked = !allChecked; });
  btn.textContent = allChecked ? "เลือกทั้งกลุ่ม" : "ยกเลิก";
  onCsJobCheck();
}

function _renderCsQueueHtml() {
  const wrap = $("#view-cs-queue");
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="att-dash-wrap">
      <div class="cs-queue-header">
        <div>
          <h2 style="margin:0;font-size:18px;font-weight:500">CS Queue <span style="font-size:13px;color:var(--text-muted);font-weight:400">ยืนยัน Invoice กับลูกค้า</span></h2>
          <p style="margin:4px 0 0;font-size:12px;color:var(--text-muted)" id="csQueueSummary"></p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="cs-tabs">
            <button type="button" class="cs-tab active" data-cstab="pending" onclick="csSwitchTab('pending')">⏳ รอยืนยัน</button>
            <button type="button" class="cs-tab" data-cstab="history" onclick="csSwitchTab('history')">📋 ประวัติการยืนยัน</button>
          </div>
          <button onclick="_csHistoryData=[];renderCsQueue()" style="padding:7px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1);font-size:12px;cursor:pointer">🔄 รีเฟรช</button>
        </div>
      </div>
      <div class="cs-queue-toolbar">
        <input id="csSearchInput" type="search" placeholder="🔍 ค้นหาบริษัท / เลข House / Invoice..." oninput="csQueueFilterChange()">
        <span id="csDateLabel" class="cs-tb-label">วันที่รับ</span>
        <input id="csDateFrom" type="date" onchange="csQueueFilterChange()">
        <span class="cs-tb-dash">–</span>
        <input id="csDateTo" type="date" onchange="csQueueFilterChange()">
        <button type="button" onclick="csQueueClearFilters()">ล้าง</button>
      </div>
      <div id="csQueueList"></div>
    </div>`;
  _renderCsQueueList();
}

function _renderCsQueueList() {
  const listEl = document.getElementById("csQueueList");
  if (!listEl) return;
  if (_csQueueTab === "history") return _renderCsHistoryTable(listEl);

  const jobs = _csApplyFilters(_csQueueData, _csJobDate);
  const totalPieces = jobs.reduce((s, j) => s + Number(j.pieceCount || 0), 0);
  const summary = document.getElementById("csQueueSummary");
  const filtered = jobs.length !== _csQueueData.length;
  if (summary) summary.textContent = `รอยืนยัน ${jobs.length}${filtered ? " / " + _csQueueData.length : ""} งาน · ${totalPieces} ชิ้น — Invoice แยกตามบริษัทและวันที่รับ`;

  const byCustomer = {};
  jobs.forEach(j => {
    const key = j.customerName || "ไม่ระบุลูกค้า";
    (byCustomer[key] ||= []).push(j);
  });
  const customers = Object.entries(byCustomer).sort((a, b) => a[0].localeCompare(b[0], "th"));

  listEl.innerHTML = !jobs.length
    ? `<div class="empty-state" style="margin-top:40px"><p>${filtered ? "ไม่พบงานตามเงื่อนไข" : "✅ ไม่มีงานรอยืนยัน"}</p></div>`
    : customers.map(([customer, cJobs]) => {
      const byDate = {};
      cJobs.forEach(j => { (byDate[_csJobDate(j) || "ไม่ระบุวันที่"] ||= []).push(j); });
      const dates = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
      const safeCust = customer.replace(/[^a-zA-Z0-9ก-๙]/g, "_");
      return `
      <div class="cs-customer-block">
        <div class="cs-customer-header">
          <span class="cs-customer-name">${safeHtml(customer)}</span>
          <span class="cs-customer-count">${cJobs.length} HAWB · ${cJobs.reduce((s, j) => s + Number(j.pieceCount || 0), 0)} ชิ้น · ${dates.length} กลุ่มวัน</span>
        </div>
        ${dates.map(([date, dJobs], di) => {
          const gkey = `${safeCust}_${di}`;
          return `
          <div class="cs-date-group" data-gkey="${gkey}">
            <div class="cs-date-head">
              <span>📅 ${safeHtml(date)} <em>· ${dJobs.length} HAWB · ${dJobs.reduce((s, j) => s + Number(j.pieceCount || 0), 0)} ชิ้น · 1 Invoice</em></span>
              <button type="button" class="cs-group-select" onclick="csSelectDateGroup(this)">เลือกทั้งกลุ่ม</button>
            </div>
            <div class="cs-jobs-list">
              ${dJobs.map(j => `
                <label class="cs-job-row" data-house="${safeHtml(j.houseNumber)}">
                  <input type="checkbox" class="cs-job-check" value="${safeHtml(j.houseNumber)}" onchange="onCsJobCheck()">
                  <div class="cs-job-info">
                    <strong>${safeHtml(j.houseNumber)}</strong>
                    <span>${safeHtml(j.destAirport || j.flightNo || "-")} · ${safeHtml(j.pieceCount || "-")} ชิ้น</span>
                  </div>
                  <div class="cs-job-meta">
                    <span class="cs-status-badge pending">${safeHtml(j.manualExtra ? "Manual extra" : "Pending CS")}</span>
                    <small>${safeHtml([j.evidenceChannel || "", j.planRound || ""].filter(Boolean).join(" / ") || "Need approval")}</small>
                  </div>
                </label>`).join("")}
            </div>
            <div class="cs-confirm-bar">
              <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                <div style="font-size:11px;font-weight:600;color:#075985">📞 โทรยืนยันแล้ว — Invoice ของกลุ่มวันนี้:</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <input type="text" class="cs-invoice-input" placeholder="เลข Invoice (เช่น INV-2026-0001)" id="csInvoice-${gkey}">
                  <input type="text" class="cs-invoice-input" style="max-width:150px" placeholder="ชื่อผู้ติดต่อ" id="csContact-${gkey}">
                  <select class="cs-invoice-input" style="max-width:130px" id="csEvidenceChannel-${gkey}">
                    <option value="Line">Line</option>
                    <option value="Email">Email</option>
                    <option value="Phone">Phone</option>
                  </select>
                  <input type="text" class="cs-invoice-input" style="max-width:220px" placeholder="หลักฐาน/หมายเหตุ" id="csEvidenceNote-${gkey}">
                  <input type="file" class="cs-evidence-file" accept="image/*,application/pdf" multiple id="csEvidenceFiles-${gkey}">
                  <button class="cs-confirm-btn" onclick="submitCsConfirm('${gkey}')">✅ Confirm</button>
                </div>
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>`;
    }).join("");
  onCsJobCheck();
}

function _renderCsHistoryTable(listEl) {
  const rows = _csApplyFilters(_csHistoryData, _csConfirmDate);
  const summary = document.getElementById("csQueueSummary");
  if (summary) summary.textContent = `ประวัติการยืนยัน ${rows.length}${rows.length !== _csHistoryData.length ? " / " + _csHistoryData.length : ""} รายการ (ล่าสุด 500)`;
  listEl.innerHTML = !rows.length
    ? `<div class="empty-state" style="margin-top:40px"><p>ไม่พบประวัติการยืนยัน</p></div>`
    : `
    <div class="cs-history-wrap">
      <table class="cs-history-table">
        <thead><tr>
          <th>ยืนยันเมื่อ</th><th>House</th><th>บริษัท</th><th>Invoice</th><th>ผู้ยืนยัน</th><th>ผู้ติดต่อ</th><th>สถานะงาน</th>
        </tr></thead>
        <tbody>
          ${rows.map(j => `
            <tr>
              <td>${safeHtml(j.timeLabel || "-")}</td>
              <td><strong>${safeHtml(j.houseNumber)}</strong></td>
              <td>${safeHtml(j.customerName || "-")}</td>
              <td>${safeHtml(j.csInvoiceNo || "-")}</td>
              <td>${safeHtml(j.csConfirmedBy || "-")}</td>
              <td>${safeHtml(j.csContactName || "-")}</td>
              <td><span class="pill ${statusClass(j.status)}" title="${safeHtml(j.status || "")}">${statusLabelTh(j.status)}</span></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function onCsJobCheck() {
  document.querySelectorAll(".cs-date-group").forEach(grp => {
    const checks = grp.querySelectorAll(".cs-job-check:checked");
    const bar = grp.querySelector(".cs-confirm-bar");
    if (bar) bar.style.display = checks.length ? "flex" : "none";
  });
}

async function submitCsConfirm(gkey) {
  const grp = document.querySelector(`.cs-date-group[data-gkey="${gkey}"]`);
  if (!grp) return;
  const invoiceEl = document.getElementById("csInvoice-" + gkey);
  const invoiceNo = invoiceEl?.value?.trim() || "";
  if (!invoiceNo) { toast("กรุณากรอกเลข Invoice ก่อน Confirm"); invoiceEl?.focus(); return; }
  const checked = Array.from(grp.querySelectorAll(".cs-job-check:checked")).map(el => el.value);
  if (!checked.length) { toast("เลือก HAWB ในกลุ่มนี้ก่อน"); return; }
  const contactName = document.getElementById("csContact-" + gkey)?.value?.trim() || "";
  const evidenceChannel = document.getElementById("csEvidenceChannel-" + gkey)?.value || "";
  const evidenceNote = document.getElementById("csEvidenceNote-" + gkey)?.value?.trim() || "";
  const evidenceFiles = await filesToCompressedBase64(document.getElementById("csEvidenceFiles-" + gkey));
  const user = currentWebUser();
  try {
    const res = await fetch(apiUrl("/api/jobs/cs-confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ houseNumbers: checked, invoiceNo, confirmedBy: user?.name || "CS", contactName, evidenceChannel, evidenceNote, evidenceFiles })
    });
    const data = await res.json();
    if (data.ok) {
      toast(`✅ Confirm แล้ว ${data.confirmed} รายการ — Invoice: ${invoiceNo}`);
      _csHistoryData = [];
      renderCsQueue();
    } else {
      toast("เกิดข้อผิดพลาด: " + (data.error || "unknown"));
    }
  } catch (e) { toast("เกิดข้อผิดพลาด"); }
}

async function renderAttendance() {
  const container = $("#view-attendance");
  if (!container) return;

  container.innerHTML = `
  <div class="att-dash-wrap">
    <!-- ── Header ── -->
    <div class="att-dash-header">
      <div>
        <h2 class="att-dash-title">การเข้างานวันนี้</h2>
        <div id="attDashDate" class="att-dash-subtitle">กำลังโหลด...</div>
      </div>
      <div class="att-dash-actions">
        <button id="attNotifBtn" onclick="requestAttNotifPermission()" class="att-action-btn notif-btn">
          🔔 เปิดการแจ้งเตือน
        </button>
        <button onclick="renderAttendance()" class="att-action-btn">🔄 รีเฟรช</button>
      </div>
    </div>

    <!-- ── Stats ── -->
    <div class="att-stats-row" id="attStatsRow">
      <div class="att-stat-card green"><div class="att-stat-num" id="statOnDuty">—</div><div class="att-stat-lbl">เข้างานอยู่</div></div>
      <div class="att-stat-card grey"><div class="att-stat-num" id="statCheckedOut">—</div><div class="att-stat-lbl">ออกแล้ว</div></div>
      <div class="att-stat-card red"><div class="att-stat-num" id="statAbsent">—</div><div class="att-stat-lbl">ยังไม่มา</div></div>
      <div class="att-stat-card blue"><div class="att-stat-num" id="statTasks">—</div><div class="att-stat-lbl">กลุ่มงาน</div></div>
      <div class="att-stat-card navy"><div class="att-stat-num" id="statGpsPoints">—</div><div class="att-stat-lbl">จุด GPS เริ่ม-สิ้นสุด</div></div>
    </div>

    <!-- ── Main Board ── -->
    <div class="att-ops-grid">
      <section class="att-map-panel">
        <div class="att-panel-head compact">
          <span>Operations Map · จุดเช็คอินพนักงาน</span>
          <span id="attMapSummary" class="att-map-summary">0 จุด</span>
        </div>
        <div id="attOpsMap" class="att-ops-map">
          <div class="att-map-empty">กำลังโหลดตำแหน่ง...</div>
        </div>
        <div class="att-map-legend-row">
          <span><i class="att-legend-dot start"></i> เริ่มงาน / Check-in</span>
          <span><i class="att-legend-dot end"></i> สิ้นสุด / Check-out</span>
          <span><i class="att-legend-dot untagged"></i> ยังไม่ผูกกลุ่มงาน</span>
        </div>
      </section>

      <section class="att-timeline-panel">
        <div class="att-panel-head compact">
          <span>Start-End Timeline</span>
          <span id="attTimelineSummary" class="att-map-summary">วันนี้</span>
        </div>
        <div id="attStartEndTimeline" class="att-startend-list">
          <div class="att-loading">กำลังโหลด...</div>
        </div>
      </section>
    </div>

    <div class="att-board">

      <!-- LEFT: Staff Pool -->
      <div class="att-staff-panel">
        <div class="att-panel-head">
          <span>👥 พนักงาน</span>
          <span id="attStaffCount" class="att-count-badge">0</span>
        </div>
        <div class="att-staff-filter">
          <button class="att-filter-btn active" data-filter="all" onclick="filterAttStaff(this,'all')">ทั้งหมด</button>
          <button class="att-filter-btn" data-filter="checkin" onclick="filterAttStaff(this,'checkin')">เข้างาน</button>
          <button class="att-filter-btn" data-filter="unassigned" onclick="filterAttStaff(this,'unassigned')">ยังไม่มีงาน</button>
        </div>
        <div id="attStaffList" class="att-staff-list">
          <div class="att-loading">กำลังโหลด...</div>
        </div>
      </div>

      <!-- RIGHT: Task Groups Board -->
      <div class="att-tasks-panel">
        <div class="att-panel-head">
          <span>📋 กลุ่มงาน</span>
          <button onclick="openCreateTaskModal()" class="att-add-task-btn">+ สร้างกลุ่มงาน</button>
        </div>
        <div id="attTaskBoard" class="att-task-board">
          <div class="att-loading">กำลังโหลด...</div>
        </div>
      </div>

    </div>
  </div>

  <!-- Create Task Modal -->
  <div id="createTaskModal" class="att-modal-backdrop" style="display:none">
    <div class="att-modal-box">
      <h3 class="att-modal-title">➕ สร้างกลุ่มงาน</h3>
      <label class="att-modal-label">ชื่องาน *</label>
      <input id="newTaskName" placeholder="เช่น โหลดสินค้า EK9815" class="att-modal-input">
      <div class="att-modal-row2">
        <div>
          <label class="att-modal-label">โซน</label>
          <select id="newTaskZone" class="att-modal-select">
            <option value="">— เลือกโซน —</option>
          </select>
        </div>
        <div>
          <label class="att-modal-label">ประเภทงาน</label>
          <select id="newTaskType" class="att-modal-select">
            <option value="Inbound">📦 Inbound</option>
            <option value="Loading">✈ Loading</option>
            <option value="Pickup">🚛 Pickup</option>
            <option value="XRay">🔍 X-Ray</option>
            <option value="Transport">🚗 Transport</option>
            <option value="Other">⚙ อื่นๆ</option>
          </select>
        </div>
      </div>
      <label class="att-modal-label">สีกลุ่ม</label>
      <div class="att-color-picker">
        <button class="att-color-swatch active" data-color="#2563eb" style="background:#2563eb" onclick="selectTaskColor(this,'#2563eb')"></button>
        <button class="att-color-swatch" data-color="#16a34a" style="background:#16a34a" onclick="selectTaskColor(this,'#16a34a')"></button>
        <button class="att-color-swatch" data-color="#dc2626" style="background:#dc2626" onclick="selectTaskColor(this,'#dc2626')"></button>
        <button class="att-color-swatch" data-color="#d97706" style="background:#d97706" onclick="selectTaskColor(this,'#d97706')"></button>
        <button class="att-color-swatch" data-color="#7c3aed" style="background:#7c3aed" onclick="selectTaskColor(this,'#7c3aed')"></button>
        <button class="att-color-swatch" data-color="#0891b2" style="background:#0891b2" onclick="selectTaskColor(this,'#0891b2')"></button>
      </div>
      <input type="hidden" id="newTaskColor" value="#2563eb">
      <div class="att-modal-btns">
        <button onclick="submitCreateTask()" class="att-modal-confirm">✔ สร้างกลุ่มงาน</button>
        <button onclick="closeCreateTaskModal()" class="att-modal-cancel">ยกเลิก</button>
      </div>
      <div id="createTaskResult" class="att-modal-result"></div>
    </div>
  </div>`;

  // Load data and render
  await loadAttDashData();
  startNotifPoller();
}

async function loadAttDashData() {
  try {
    const user = currentWebUser();
    const [attRes, tgRes, dashRes] = await Promise.all([
      api("/api/attendance/today", null, "GET"),
      api("/api/taskgroups/today", null, "GET"),
      api("/api/bootstrap", null, "GET")
    ]);

    attDash.staff = attRes.records || [];
    attDash.taskGroups = tgRes.groups || [];
    attDash.allUsers = (dashRes.users || []).filter(u =>
      ["WH_Staff","Driver","WH3_TeamLeader","Team_Transport"].includes(u.role)
    );

    const date = attRes.date || "";
    const dateEl = $("#attDashDate");
    if (dateEl) dateEl.textContent = "วันที่ " + date + " · อัปเดตล่าสุด " + new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour:"2-digit", minute:"2-digit" }).format(new Date());

    updateAttStats();
    renderAttOperations();
    renderAttStaffList("all");
    renderAttTaskBoard();

    // Load zones for create modal
    try {
      const zRes = await api("/api/warehouse/zones", null, "GET");
      const sel = $("#newTaskZone");
      if (sel && zRes.zones?.length) {
        sel.innerHTML = '<option value="">— เลือกโซน —</option>' +
          zRes.zones.map(z => `<option value="${escHtml(z.name)}">${escHtml(z.name)}</option>`).join("");
      }
    } catch (e) {}

    updateNotifBtn();
  } catch (err) {
    const board = $("#attTaskBoard");
    if (board) board.innerHTML = `<div style="color:red;padding:20px">โหลดไม่ได้: ${escHtml(err.message)}</div>`;
  }
}

function updateAttStats() {
  const onDuty = attDash.staff.filter(r => !r.checkOutTime).length;
  const out = attDash.staff.filter(r => r.checkOutTime).length;
  const absent = Math.max(0, attDash.allUsers.length - attDash.staff.length);
  const taskCount = attDash.taskGroups.filter(g => g.status !== "done").length;
  const gpsPoints = attDash.staff.reduce((sum, r) => {
    return sum + (hasAttPoint(r, "in") ? 1 : 0) + (hasAttPoint(r, "out") ? 1 : 0);
  }, 0);

  setText("statOnDuty", onDuty);
  setText("statCheckedOut", out);
  setText("statAbsent", absent);
  setText("statTasks", taskCount);
  setText("statGpsPoints", gpsPoints);
}

function setText(id, val) { const el = $("#" + id); if (el) el.textContent = val; }
function escHtml(value) { return safeHtml(value); }

function attNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasAttPoint(record, type) {
  const lat = attNumber(type === "out" ? record.checkOutLat : record.checkInLat);
  const lon = attNumber(type === "out" ? record.checkOutLon : record.checkInLon);
  return lat !== null && lon !== null;
}

function attPoint(record, type) {
  return {
    type,
    lat: attNumber(type === "out" ? record.checkOutLat : record.checkInLat),
    lon: attNumber(type === "out" ? record.checkOutLon : record.checkInLon),
    time: type === "out" ? record.checkOutTime : record.checkInTime,
    label: type === "out" ? "สิ้นสุดงาน" : "เริ่มงาน",
    record
  };
}

function attTimeShort(iso) {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(iso));
  } catch (e) { return "-"; }
}

function attDurationLabel(record) {
  if (!record.checkInTime) return "ยังไม่เริ่ม";
  const end = record.checkOutTime ? new Date(record.checkOutTime) : new Date();
  const start = new Date(record.checkInTime);
  const mins = Math.max(0, Math.round((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

function attAssignedGroupForRecord(record) {
  return attDash.taskGroups.find(g =>
    g.status !== "done" && (g.assignedUsers || []).some(u => u.userId === record.userId)
  );
}

function renderAttOperations() {
  const map = $("#attOpsMap");
  const list = $("#attStartEndTimeline");
  if (!map || !list) return;

  const records = (attDash.staff || []).slice().sort((a, b) =>
    String(a.checkInTime || "").localeCompare(String(b.checkInTime || ""))
  );
  const points = records.flatMap(record => {
    const arr = [];
    if (hasAttPoint(record, "in")) arr.push(attPoint(record, "in"));
    if (hasAttPoint(record, "out")) arr.push(attPoint(record, "out"));
    return arr;
  });

  const mapSummary = $("#attMapSummary");
  const timelineSummary = $("#attTimelineSummary");
  const untaggedCount = records.filter(r => !attAssignedGroupForRecord(r)).length;
  if (mapSummary) mapSummary.textContent = `${points.length} จุด · ${records.length} คน`;
  if (timelineSummary) timelineSummary.textContent = `${untaggedCount} ยังไม่ผูกงาน`;

  if (!points.length) {
    map.innerHTML = `
      <div class="att-map-empty">
        <strong>ยังไม่มีพิกัดเช็คอินวันนี้</strong>
        <span>เมื่อพนักงานเช็คอิน/เช็คเอาต์จาก Mobile ระบบจะแสดงจุดเริ่มต้นและสิ้นสุดที่นี่</span>
      </div>`;
  } else {
    const minLat = Math.min(...points.map(p => p.lat));
    const maxLat = Math.max(...points.map(p => p.lat));
    const minLon = Math.min(...points.map(p => p.lon));
    const maxLon = Math.max(...points.map(p => p.lon));
    const latSpan = Math.max(0.0005, maxLat - minLat);
    const lonSpan = Math.max(0.0005, maxLon - minLon);
    const project = p => ({
      x: 10 + ((p.lon - minLon) / lonSpan) * 80,
      y: 88 - ((p.lat - minLat) / latSpan) * 76
    });
    const routes = records
      .filter(r => hasAttPoint(r, "in") && hasAttPoint(r, "out"))
      .map(r => {
        const a = project(attPoint(r, "in"));
        const b = project(attPoint(r, "out"));
        return `<line x1="${a.x.toFixed(2)}%" y1="${a.y.toFixed(2)}%" x2="${b.x.toFixed(2)}%" y2="${b.y.toFixed(2)}%" />`;
      }).join("");
    const markers = points.map(p => {
      const pos = project(p);
      const group = attAssignedGroupForRecord(p.record);
      const cls = `${p.type === "out" ? "end" : "start"} ${group ? "" : "untagged"}`;
      const initials = (p.record.userName || "?").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
      return `<button class="att-map-marker ${cls}" style="left:${pos.x.toFixed(2)}%;top:${pos.y.toFixed(2)}%" title="${escHtml(p.record.userName || "")} · ${p.label} ${attTimeShort(p.time)} — คลิกเปิด Google Maps" onclick="window.open('https://maps.google.com/?q=${p.lat},${p.lon}','_blank')">
        <span>${p.type === "out" ? "OUT" : initials}</span>
      </button>`;
    }).join("");
    map.innerHTML = `
      <div class="att-map-grid-bg"></div>
      <svg class="att-map-routes" aria-hidden="true">${routes}</svg>
      ${markers}
      <div class="att-map-location-badge">
        <strong>SCD Operations</strong>
        <span>Live attendance points · start/end</span>
      </div>`;
  }

  list.innerHTML = records.length ? records.map(record => {
    const group = attAssignedGroupForRecord(record);
    const hasIn = hasAttPoint(record, "in");
    const hasOut = hasAttPoint(record, "out");
    return `
      <article class="att-startend-item ${group ? "" : "untagged"}">
        <div class="att-se-dotline">
          <span class="att-se-dot start"></span>
          <span class="att-se-line ${hasOut ? "complete" : ""}"></span>
          <span class="att-se-dot ${hasOut ? "end" : "pending"}"></span>
        </div>
        <div class="att-se-main">
          <div class="att-se-head">
            <strong>${escHtml(record.userName || "-")}</strong>
            <span class="att-se-badge ${group ? "tagged" : "untagged"}">${group ? escHtml(group.name) : "ยังไม่ผูกกลุ่มงาน"}</span>
          </div>
          <div class="att-se-meta">
            <span>เริ่ม ${attTimeShort(record.checkInTime)}${hasIn ? ` · <a class="att-gps-link" href="https://maps.google.com/?q=${Number(record.checkInLat)},${Number(record.checkInLon)}" target="_blank" rel="noopener">📍 ${Number(record.checkInLat).toFixed(4)}, ${Number(record.checkInLon).toFixed(4)}</a>` : " · ไม่มี GPS"}</span>
            <span>สิ้นสุด ${record.checkOutTime ? attTimeShort(record.checkOutTime) : "ยังทำงานอยู่"}${hasOut ? ` · <a class="att-gps-link" href="https://maps.google.com/?q=${Number(record.checkOutLat)},${Number(record.checkOutLon)}" target="_blank" rel="noopener">📍 ${Number(record.checkOutLat).toFixed(4)}, ${Number(record.checkOutLon).toFixed(4)}</a>` : ""}</span>
          </div>
          <div class="att-se-foot">
            <span>${escHtml(record.zone || "ไม่ระบุโซน")} · ${escHtml(record.jobType || "ไม่ระบุประเภทงาน")}</span>
            <b>${attDurationLabel(record)}</b>
          </div>
        </div>
      </article>`;
  }).join("") : `
    <div class="att-empty-board compact">
      <div style="font-weight:700">ยังไม่มีประวัติเข้างานวันนี้</div>
      <div style="font-size:12px;color:var(--muted)">เมื่อพนักงานเช็คอินจาก Mobile จะเห็นเวลาเริ่ม-สิ้นสุดทันที แม้ยังไม่ได้ลากเข้ากลุ่มงาน</div>
    </div>`;
}

// ── Staff cards ────────────────────────────────────────────────

const ROLE_ICON = { WH_Staff:"🏭", Driver:"🚛", WH3_TeamLeader:"👑", Team_Transport:"🚗" };
const TASK_COLOR = { Inbound:"#2563eb", Loading:"#7c3aed", Pickup:"#16a34a", XRay:"#dc2626", Transport:"#d97706", Other:"#6b7280" };

function getAssignedGroupForUser(userId) {
  return attDash.taskGroups.find(g => g.status !== "done" && g.assignedUsers.some(u => u.userId === userId));
}

function renderAttStaffList(filter) {
  const list = $("#attStaffList");
  if (!list) return;

  let users = attDash.allUsers;
  const checkedInIds = new Set(attDash.staff.filter(r => !r.checkOutTime).map(r => r.userId));

  if (filter === "checkin") users = users.filter(u => checkedInIds.has(u.id));
  if (filter === "unassigned") users = users.filter(u => checkedInIds.has(u.id) && !getAssignedGroupForUser(u.id));

  const countEl = $("#attStaffCount");
  if (countEl) countEl.textContent = users.length;

  if (!users.length) {
    list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--muted);font-size:13px">ไม่มีพนักงาน</div>`;
    return;
  }

  list.innerHTML = users.map(u => {
    const attRec = attDash.staff.find(r => r.userId === u.id && !r.checkOutTime);
    const isIn = !!attRec;
    const assignedGroup = getAssignedGroupForUser(u.id);
    const initials = (u.name || "?").split(/\s+/).map(p => p[0]).join("").slice(0,2).toUpperCase();
    const photoHtml = attRec?.checkInPhoto
      ? `<img src="${escHtml(attRec.checkInPhoto)}" class="att-staff-avatar">`
      : `<div class="att-staff-avatar att-staff-initials">${initials}</div>`;

    return `<div class="att-staff-card ${isIn ? "is-in" : "is-out"}"
      draggable="${isIn ? 'true' : 'false'}"
      data-user-id="${u.id}"
      data-user-name="${escHtml(u.name)}"
      ondragstart="onStaffDragStart(event,'${u.id}')"
      ondragend="onStaffDragEnd(event)">
      <div class="att-staff-card-left">
        <div class="att-avatar-wrap">
          ${photoHtml}
          <span class="att-status-dot ${isIn ? "dot-in" : "dot-out"}"></span>
        </div>
        <div class="att-staff-info">
          <div class="att-staff-name">${escHtml(u.name)}</div>
          <div class="att-staff-role">${ROLE_ICON[u.role] || "👤"} ${u.role}</div>
          ${attRec?.zone ? `<div class="att-staff-zone">📍 ${escHtml(attRec.zone)}</div>` : ""}
        </div>
      </div>
      <div class="att-staff-card-right">
        ${isIn
          ? (assignedGroup
            ? `<span class="att-task-chip" style="background:${assignedGroup.color}22;color:${assignedGroup.color};border:1px solid ${assignedGroup.color}44">${escHtml(assignedGroup.name.slice(0,15))}</span>`
            : `<span class="att-free-chip">ว่าง</span>`)
          : `<span class="att-out-chip">ออกแล้ว/ไม่มา</span>`
        }
      </div>
    </div>`;
  }).join("");
}

// ── Task Board ─────────────────────────────────────────────────

function renderAttTaskBoard() {
  const board = $("#attTaskBoard");
  if (!board) return;

  const active = attDash.taskGroups.filter(g => g.status !== "done");
  const done = attDash.taskGroups.filter(g => g.status === "done");

  if (!attDash.taskGroups.length) {
    board.innerHTML = `<div class="att-empty-board">
      <div style="font-size:40px">📋</div>
      <div style="font-weight:700;font-size:15px;margin:8px 0 4px">ยังไม่มีกลุ่มงาน</div>
      <div style="font-size:12px;color:var(--muted)">กด "+ สร้างกลุ่มงาน" เพื่อเริ่ม<br>แล้วลากพนักงานมาใส่กลุ่ม</div>
    </div>`;
    return;
  }

  board.innerHTML = [
    ...active.map(g => renderTaskGroupCard(g, false)),
    ...done.map(g => renderTaskGroupCard(g, true))
  ].join("");
}

function renderTaskGroupCard(g, isDone) {
  const staffHtml = g.assignedUsers.length
    ? g.assignedUsers.map(u => `
        <div class="att-tg-staff">
          <span class="att-tg-staff-init" style="background:${g.color}33;color:${g.color}">${(u.userName||"?")[0].toUpperCase()}</span>
          <span class="att-tg-staff-name">${escHtml(u.userName)}</span>
          ${!isDone ? `<button class="att-tg-remove" onclick="unassignFromTask('${g.id}','${u.userId}')" title="ถอดออก">×</button>` : ""}
        </div>`).join("")
    : `<div class="att-tg-empty">ลากพนักงานมาวางที่นี่</div>`;

  const statusLabel = { pending:"⏳ รอเริ่ม", inprogress:"🔥 กำลังทำ", done:"✅ เสร็จแล้ว" }[g.status] || g.status;

  return `<div class="att-task-card ${isDone ? "att-task-done" : ""}"
    id="tg-${g.id}"
    data-group-id="${g.id}"
    ondragover="onTaskDragOver(event)"
    ondragleave="onTaskDragLeave(event)"
    ondrop="onTaskDrop(event,'${g.id}')">
    <div class="att-task-card-header" style="border-left:4px solid ${g.color}">
      <div>
        <div class="att-task-name">${escHtml(g.name)}</div>
        <div class="att-task-meta">
          ${g.zone ? `<span>📍 ${escHtml(g.zone)}</span>` : ""}
          <span style="color:${TASK_COLOR[g.type]||"#6b7280"}">${escHtml(g.type)}</span>
          <span class="att-task-status-badge" style="background:${isDone?"#dcfce7":g.status==="inprogress"?"#fef9c3":"#f3f4f6"};color:${isDone?"#16a34a":g.status==="inprogress"?"#92400e":"#6b7280"}">${statusLabel}</span>
        </div>
      </div>
      ${!isDone ? `<div class="att-task-btns">
        <button onclick="completeTask('${g.id}')" class="att-complete-btn" title="งานเสร็จแล้ว">✅ เสร็จ</button>
        <button onclick="deleteTask('${g.id}')" class="att-delete-btn" title="ลบกลุ่ม">🗑</button>
      </div>` : `<div style="font-size:11px;color:var(--muted)">${g.completedAt ? formatBangkok(g.completedAt).slice(-5) : ""}</div>`}
    </div>
    <div class="att-tg-staff-list">${staffHtml}</div>
    ${!isDone && g.assignedUsers.length ? `<div class="att-drop-hint">ลากพนักงานมาเพิ่มได้</div>` : ""}
  </div>`;
}

// ── Drag & Drop ────────────────────────────────────────────────

function onStaffDragStart(e, userId) {
  attDash.draggingUserId = userId;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", userId);
  e.currentTarget.classList.add("att-dragging");
}
function onStaffDragEnd(e) {
  e.currentTarget.classList.remove("att-dragging");
  attDash.draggingUserId = null;
  $$(".att-task-card.drag-over").forEach(el => el.classList.remove("drag-over"));
}
function onTaskDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}
function onTaskDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}
async function onTaskDrop(e, groupId) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const userId = e.dataTransfer.getData("text/plain") || attDash.draggingUserId;
  if (!userId || !groupId) return;
  try {
    await api("/api/taskgroups/assign", { groupId, userId });
    await loadAttDashData();
    toast("มอบหมายงานแล้ว ✓");
  } catch (err) {
    toast("เกิดข้อผิดพลาด: " + (err.message || ""));
  }
}

async function unassignFromTask(groupId, userId) {
  try {
    await api("/api/taskgroups/unassign", { groupId, userId });
    await loadAttDashData();
  } catch (err) { toast("Error: " + err.message); }
}

async function completeTask(groupId) {
  const user = currentWebUser();
  if (!confirm("ยืนยันว่างานเสร็จสิ้นแล้ว?")) return;
  try {
    await api("/api/taskgroups/complete", { groupId, completedBy: user?.name || "Admin" });
    await loadAttDashData();
    showAttWebNotif("✅ งานเสร็จแล้ว!", attDash.taskGroups.find(g=>g.id===groupId)?.name || "");
    toast("บันทึกเรียบร้อย ✅");
  } catch (err) { toast("Error: " + err.message); }
}

async function deleteTask(groupId) {
  if (!confirm("ลบกลุ่มงานนี้?")) return;
  try {
    await api("/api/taskgroups/delete", { groupId });
    await loadAttDashData();
  } catch (err) { toast("Error: " + err.message); }
}

// ── Create Task Modal ───────────────────────────────────────────

function openCreateTaskModal() {
  const m = $("#createTaskModal");
  if (m) m.style.display = "flex";
  const r = $("#createTaskResult");
  if (r) r.textContent = "";
  const n = $("#newTaskName");
  if (n) n.value = "";
}
function closeCreateTaskModal() {
  const m = $("#createTaskModal");
  if (m) m.style.display = "none";
}
function selectTaskColor(btn, color) {
  $$(".att-color-swatch").forEach(s => s.classList.remove("active"));
  btn.classList.add("active");
  const inp = $("#newTaskColor");
  if (inp) inp.value = color;
}
async function submitCreateTask() {
  const name = $("#newTaskName")?.value?.trim();
  if (!name) { const r = $("#createTaskResult"); if(r){r.textContent="กรุณากรอกชื่องาน";r.style.color="red";} return; }
  const zone = $("#newTaskZone")?.value || "";
  const type = $("#newTaskType")?.value || "Other";
  const color = $("#newTaskColor")?.value || "#2563eb";
  const user = currentWebUser();
  try {
    await api("/api/taskgroups/create", { name, zone, type, color, createdBy: user?.name || "Admin" });
    closeCreateTaskModal();
    await loadAttDashData();
    toast("สร้างกลุ่มงานแล้ว ✓");
  } catch (err) {
    const r = $("#createTaskResult");
    if (r) { r.textContent = "Error: " + err.message; r.style.color = "red"; }
  }
}

// ── Filter ──────────────────────────────────────────────────────

function filterAttStaff(btn, filter) {
  $$(".att-filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderAttStaffList(filter);
}

// ── Notifications ──────────────────────────────────────────────

function updateNotifBtn() {
  const btn = $("#attNotifBtn");
  if (!btn) return;
  if (!("Notification" in window)) { btn.textContent = "🔕 ไม่รองรับ"; btn.disabled = true; return; }
  if (Notification.permission === "granted") { btn.textContent = "🔔 รับการแจ้งเตือนแล้ว"; btn.style.background = "#dcfce7"; btn.style.color = "#16a34a"; }
  else if (Notification.permission === "denied") { btn.textContent = "🚫 ถูกบล็อก"; btn.disabled = true; }
}

async function requestAttNotifPermission() {
  if (!("Notification" in window)) return alert("เบราว์เซอร์ไม่รองรับ");
  const result = await Notification.requestPermission();
  updateNotifBtn();
  if (result === "granted") {
    toast("✅ เปิดการแจ้งเตือนแล้ว — แจ้งเตือนนอกแอพได้ทันที");
    attDash.notifSince = new Date().toISOString();
  } else {
    toast("⚠️ ไม่ได้รับอนุญาต — ตรวจสอบการตั้งค่า Chrome");
  }
}

function startNotifPoller() {
  if (attDash.notifTimer) clearInterval(attDash.notifTimer);
  if (!attDash.notifSince) attDash.notifSince = new Date().toISOString();
  attDash.notifTimer = setInterval(pollAttNotifs, 30000);
}

async function pollAttNotifs() {
  if (Notification.permission !== "granted") return;
  const user = currentWebUser();
  if (!user) return;
  try {
    const res = await api("/api/notifications/poll?role=" + encodeURIComponent(user.role) + "&since=" + encodeURIComponent(attDash.notifSince || ""), null, "GET");
    const notifs = res.notifications || [];
    if (!notifs.length) return;
    attDash.notifSince = new Date().toISOString();
    // Mark as read
    await api("/api/notifications/mark-read", { ids: notifs.map(n => n.id) });
    // Show each as OS notification
    notifs.forEach(n => showAttWebNotif(n.title, n.body));
  } catch (e) {}
}

function showAttWebNotif(title, body) {
  if (Notification.permission !== "granted") return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body: body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "scd-attendance-" + Date.now(),
        requireInteraction: false,
        data: { url: window.location.href }
      });
    });
  } else {
    new Notification(title, { body });
  }
}
