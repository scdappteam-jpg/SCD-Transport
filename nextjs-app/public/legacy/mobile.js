const state = {
    dashboard: null,
    users: [],
    currentUserId: localStorage.getItem("smartLogisticsMobileUser") || "u_driver_01",
    lang: localStorage.getItem("smartLogisticsLang") || "th",
    pickupStartTime: null,
    cargoLoaded: false,
    outboundUnlockedHouse: "",
    outboundReturnMode: false,
    pickupUnlockedSelection: "",
    inboundUnlockedHouse: "",
    billingUnlockedHouse: "",
    offlineQueue: JSON.parse(localStorage.getItem("offlineQueue") || "[]")
};

const $ = selector => document.querySelector(selector);

const $$ = selector => Array.from(document.querySelectorAll(selector));

const AUTH_CONFIG = window.SCD_AUTH_CONFIG || {
    defaultPassword: "1234",
    userPasswords: {},
    companyName: "S.C.D.TRANSPORT Co., LTD"
};

const MOBILE_AUTH_KEY = "scdTransportMobileAuth";

const configuredApiBase = window.SMART_LOGISTICS_API_BASE || "";

const API_BASE = configuredApiBase || "";

const i18nOriginalText = new WeakMap;

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
            if ([ "SCRIPT", "STYLE", "TEXTAREA" ].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
            return node.nodeValue.includes(" / ") || i18nOriginalText.has(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
        if (!i18nOriginalText.has(node)) i18nOriginalText.set(node, node.nodeValue);
        node.nodeValue = localizeText(i18nOriginalText.get(node));
    });
    $$("[placeholder], [title], [aria-label]").forEach(element => {
        [ "placeholder", "title", "aria-label" ].forEach(attr => {
            if (!element.hasAttribute(attr)) return;
            const key = `i18nOriginal${attr.replace(/-./g, match => match[1].toUpperCase())}`;
            if (!element.dataset[key]) element.dataset[key] = element.getAttribute(attr);
            element.setAttribute(attr, localizeText(element.dataset[key]));
        });
    });
    const toggle = $("#mobileLanguageToggle");
    if (toggle) toggle.textContent = state.lang === "en" ? "EN" : "TH";
}

function isMobileAuthenticated() {
    return localStorage.getItem(MOBILE_AUTH_KEY) === "ok";
}

function passwordForUser(userId) {
    return AUTH_CONFIG.userPasswords?.[userId] || AUTH_CONFIG.defaultPassword || "1234";
}

function renderMobileAuthState() {
    const auth = isMobileAuthenticated();
    document.body.classList.toggle("mobile-locked", !auth);
    const loginCard = document.querySelector(".login-card");
    if (loginCard) loginCard.hidden = auth;
    const logout = $("#mobileLogoutBtn");
    const headerLogout = $("#mobileHeaderLogoutBtn");
    const password = $("#mobileLoginPassword");
    if (logout) logout.hidden = !auth;
    if (headerLogout) headerLogout.hidden = !auth;
    if (password && !auth) password.value = "";
    if (auth && typeof showMnav === "function" && !document.body.dataset.mnav) {
        setTimeout(() => showMnav("home"), 250);
    }
}

function quickMobileLogin(userId) {
    const sel = document.getElementById("mobileUserSelect");
    const pw = document.getElementById("mobileLoginPassword");
    if (sel) sel.value = userId;
    if (pw) pw.value = "1234";
    submitMobileLogin();
}

function submitMobileLogin() {
    const userId = $("#mobileUserSelect")?.value || "";
    const password = $("#mobileLoginPassword")?.value.trim();
    if (!userId) {
        $("#mobileLoginStatus").textContent = "กรุณาเลือกผู้ใช้งาน";
        $("#mobileUserSelect")?.focus();
        return;
    }
    if (password !== passwordForUser(userId)) {
        $("#mobileLoginStatus").textContent = "รหัสผ่านไม่ถูกต้อง";
        $("#mobileLoginPassword")?.focus();
        return;
    }
    state.currentUserId = userId;
    localStorage.setItem("smartLogisticsMobileUser", state.currentUserId);
    localStorage.setItem(MOBILE_AUTH_KEY, "ok");
    state.pickupUnlockedSelection = "";
    state.inboundUnlockedHouse = "";
    state.outboundUnlockedHouse = "";
    state.billingUnlockedHouse = "";
    renderMobileAuthState();
    render();
    toast("เข้าสู่ระบบแล้ว / Logged in");
}

function apiUrl(path) {
    return `${API_BASE}${path}`;
}

function assetUrl(path) {
    if (!path) return "";
    return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

async function recoverCompletedRequest(path, payload) {
    const expectedStatuses = {
        "/api/pickup/complete": [ "Delivered" ],
        "/api/inbound/close": [ "Stored", "ReadyForTerminal" ]
    }[path];
    if (!expectedStatuses || !payload?.houseNumber) return null;
    const res = await fetch(apiUrl("/api/bootstrap"));
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return null;
    const data = await res.json();
    const house = normalizeHouseBarcode(payload.houseNumber);
    const job = (data.dashboard?.jobs || []).find(item => item.houseNumber === house);
    if (!job || !expectedStatuses.includes(job.status)) return null;
    state.dashboard = data.dashboard;
    state.users = data.users || state.users;
    return job;
}

async function api(path, payload) {
    try {
        const res = await fetch(apiUrl(path), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed");
        return data;
    } catch (error) {
        // A mobile connection can drop after Render has finished the write but
        // before its response reaches the phone. Verify the resulting status
        // first, so a driver is not told to submit the same evidence twice.
        try {
            const job = await recoverCompletedRequest(path, payload);
            if (job) {
                toast(`บันทึกสำเร็จแล้ว: ${job.houseNumber} · ${job.status}`);
                return { ok: true, recovered: true, job: job };
            }
        } catch (_) {
            // Fall through to the normal offline/error handling below.
        }
        if (!navigator.onLine) {
            state.offlineQueue.push({
                path: path,
                payload: payload,
                createdAt: (new Date).toISOString()
            });
            localStorage.setItem("offlineQueue", JSON.stringify(state.offlineQueue));
            toast("เก็บไว้รอ Sync / Saved offline");
            return {
                ok: true,
                queued: true
            };
        }
        if (error instanceof TypeError && /fetch/i.test(error.message || "")) {
            throw new Error("เชื่อมต่อเซิร์ฟเวอร์ขาดตอน และยังยืนยันผลไม่ได้ กรุณารอ 10 วินาทีแล้วรีเฟรชเพื่อตรวจสถานะก่อนกดซ้ำ");
        }
        throw error;
    }
}

async function refresh() {
    let data;
    try {
        const res = await fetch(apiUrl("/api/bootstrap"));
        if (!res.ok) throw new Error("API unavailable");
        if (!res.headers.get("content-type")?.includes("application/json")) throw new Error("API returned HTML");
        data = await res.json();
    } catch (error) {
        data = window.SMART_LOGISTICS_DEMO;
        toast("Demo mode: แสดงข้อมูลงานตัวอย่าง 10 งาน");
    }
    state.dashboard = data.dashboard;
    state.users = data.users || [];
    render();
}

function render() {
    if (!state.dashboard) return;
    renderMobileLogin();
    const jobs = visibleDriverJobs();
    $("#mobileOpenJobs").textContent = jobs.filter(job => job.status !== "Billed").length;
    $("#mobileBillingJobs").textContent = jobs.filter(job => job.readyForBilling).length;
    renderDriverJobSelect();
    $("#mobileJobList").innerHTML = jobs.length ? jobs.map((job, index) => foDriverJobCard(job, index)).join("") : `<article class="job"><div><strong>ยังไม่มีงานของคนขับคนนี้</strong><br><small>No assigned jobs for this driver</small></div></article>`;
    $("#locationList").innerHTML = state.dashboard.locations.map(location => `\n    <article class="location">\n      <strong>${location.id}</strong><br>\n      <small>${location.status}${location.currentHouseId ? ` · ${location.currentHouseId}` : ""}</small>\n    </article>\n  `).join("");
    renderBillingReadyList();
    updateInboundInfo();
    updateTerminalRequirements();
    renderGuidedModules();
    applyLanguage();
}

function renderBillingReadyList() {
    const list = $("#billingReadyList");
    if (!list || !state.dashboard) return;
    const jobs = (state.dashboard.jobs || []).filter(job => job.readyForBilling || [ "BillingReviewed", "InvoiceDrafted", "InvoiceSent", "PendingBillingReview" ].includes(job.status));
    list.innerHTML = jobs.length ? jobs.map(job => `\n    <article class="job billing-pick" data-billing-house="${job.houseNumber}">\n      <div>\n        <strong>${job.houseNumber} · ${job.customerName || "-"}</strong><br>\n        <small>${job.status} · ${job.billingReviewStatus || "รอตรวจเอกสาร"} · ${job.flightTimeLabel || ""}</small>\n      </div>\n      <span class="badge">${job.amount || 0}</span>\n    </article>\n  `).join("") : `<article class="job"><div><strong>ยังไม่มีงานพร้อมวางบิล</strong><br><small>No ready billing jobs</small></div></article>`;
    list.querySelectorAll("[data-billing-house]").forEach(item => {
        item.addEventListener("click", () => {
            $("#billingHouse").value = item.dataset.billingHouse;
            state.billingUnlockedHouse = item.dataset.billingHouse;
            renderBillingGuide();
            toast(`เลือก ${item.dataset.billingHouse}`);
        });
    });
}

function mobileUsers() {
    return (state.users || []).filter(user => user.status !== "Inactive");
}

function driverUsers() {
    return mobileUsers().filter(user => user.role === "Driver");
}

function currentUser() {
    return mobileUsers().find(user => user.id === state.currentUserId) || mobileUsers()[0];
}

function allowedMobileTabs(role) {
    if (role === "Driver") return [ "pickup", "attendance" ];
    if (role === "WH_Staff") return [ "inbound", "attendance" ];
    if (role === "WH3_TeamLeader") return [ "inbound", "attendance" ];
    if (role === "Team_Transport") return [ "inbound", "outbound", "attendance" ];
    if (role === "EI_Customer") return [ "inbound" ];
    if (role === "Check_House") return [ "outbound" ];
    if (role === "Terminal") return [ "outbound" ];
    if (role === "Billing") return [ "billing" ];
    return [ "pickup", "inbound", "outbound", "billing" ];
}

function visibleDriverJobs() {
    const user = currentUser();
    if (!user) return [];
    if (user.role !== "Driver") return state.dashboard?.jobs || [];
    return (state.dashboard?.jobs || []).filter(job => job.driverId === user.id);
}

function renderMobileLogin() {
    const select = $("#mobileUserSelect");
    if (!select) return;
    const users = mobileUsers();
    select.innerHTML = users.map(user => `<option value="${user.id}">${user.name}${user.vehiclePlate ? ` / ${user.vehiclePlate}` : ""} · ${user.role}</option>`).join("");
    if (!users.some(user => user.id === state.currentUserId)) {
        state.currentUserId = users[0]?.id || "";
    }
    select.value = state.currentUserId;
    const user = currentUser();
    const authText = isMobileAuthenticated() ? "เข้าสู่ระบบแล้ว" : "กรอกรหัส 1234 เพื่อเข้าใช้งาน";
    $("#mobileLoginStatus").textContent = user ? `${authText}: ${user.name}${user.vehiclePlate ? ` / ${user.vehiclePlate}` : ""} · ${user.role}` : "ยังไม่มีผู้ใช้";
    renderMobileAuthState();
    applyRoleVisibility();
}

function renderDriverJobSelect() {
    const select = $("#driverJobSelect");
    if (!select) return;
    const current = select.value;
    const groups = pickupGroups();
    const jobs = visibleDriverJobs();
    select.innerHTML = [ `<option value="manual">กรอกเอง / Manual form</option>`, ...groups.filter(group => group.jobs.length > 1).map(group => `<option value="group::${encodeURIComponent(group.key)}">กลุ่มรับงาน: ${group.customerName} · ${group.pickupLocation} (${group.jobs.length} งาน)</option>`), ...jobs.map(job => `<option value="${job.houseNumber}">${job.houseNumber} · ${job.customerName}</option>`) ].join("");
    const validValues = Array.from(select.options).map(option => option.value);
    select.value = validValues.includes(current) ? current : "";
    applyDriverJob(select.value);
}

function findJob(houseNumber) {
    return visibleDriverJobs().find(job => job.houseNumber === houseNumber || job.id === houseNumber);
}

function findAnyJob(houseNumber) {
    const normalized = normalizeHouseBarcode(houseNumber);
    return state.dashboard?.jobs.find(job => job.houseNumber === normalized || job.houseNumber === houseNumber || job.id === normalized || job.id === houseNumber);
}

function inboundWdChecklist() {
    return $$(".inbound-wd-check:checked").map(input => input.value);
}

function normalizeHouseBarcode(value) {
    const raw = String(value || "").trim();
    const compact = raw.replace(/\s+/g, "");
    const houseMatch = compact.match(/(?:H-?)?(\d{8,12})/i);
    if (houseMatch?.[1]) return houseMatch[1];
    return compact.toUpperCase();
}

function terminalHouseValue() {
    return normalizeHouseBarcode($("#terminalHouse")?.value);
}

function stepUserName(userId) {
    return state.users.find(user => user.id === userId)?.name || userId || "-";
}

function renderOutboundStepTrackers() {
    const job = findAnyJob(terminalHouseValue());
    $$("#tab-outbound .step-tracker").forEach(container => {
        const step = job?.stepTracking?.[container.dataset.stepKey];
        const status = step?.status || "NotStarted";
        const statusLabel = status === "Completed" ? "เสร็จแล้ว" : status === "InProgress" ? "กำลังดำเนินการ" : "ยังไม่เริ่ม";
        const detail = step ? `${stepUserName(step.userId)}${step.durationMinutes ? ` · ${step.durationMinutes} นาที` : ""}` : "กดเริ่มงานเพื่อบันทึกผู้ทำและเวลา";
        const controls = container.dataset.manual === "true" ? "" : `\n      <div class="step-tracker-actions">\n        <button type="button" class="step-start" data-step-action="start" ${status === "InProgress" || status === "Completed" ? "disabled" : ""}>เริ่มขั้นตอน</button>\n        <button type="button" class="step-finish" data-step-action="finish" ${status !== "InProgress" ? "disabled" : ""}>จบขั้นตอน</button>\n      </div>`;
        container.className = `step-tracker ${status.toLowerCase()}`;
        container.innerHTML = `\n      <div class="step-tracker-state">\n        <span class="step-status-dot"></span>\n        <div><strong>${statusLabel}</strong><small>${detail}</small></div>\n      </div>\n      ${controls}`;
    });
    renderOutboundWorkflow();
}

const OUTBOUND_FLOW_STEPS = [ {
    key: "outbound_locate",
    label: "ค้นหาและยืนยันสินค้า"
}, {
    key: "outbound_picking",
    label: "เบิกสินค้าและ EI อนุมัติ"
}, {
    key: "outbound_delivery",
    label: "จองคิวและนำส่ง"
}, {
    key: "outbound_terminal",
    label: "Terminal, ชั่ง/วัด และ X-Ray"
}, {
    key: "outbound_close",
    label: "Loading Detail และปิดงาน"
} ];

function renderOutboundWorkflow() {
    const job = findAnyJob(terminalHouseValue());
    const unlocked = Boolean(job && state.outboundUnlockedHouse === job.houseNumber);
    const nextStepIndex = unlocked ? OUTBOUND_FLOW_STEPS.findIndex(item => job.stepTracking?.[item.key]?.status !== "Completed") : -1;
    const summary = $("#outboundFlowSummary");
    if (summary) {
        summary.innerHTML = OUTBOUND_FLOW_STEPS.map((item, index) => {
            const status = unlocked ? job.stepTracking?.[item.key]?.status || "NotStarted" : "Locked";
            const isNext = index === nextStepIndex && status === "NotStarted";
            const statusLabel = status === "Completed" ? "เสร็จ" : status === "InProgress" ? "กำลังทำ" : status === "Locked" ? "รอสแกน" : isNext ? "ขั้นตอนถัดไป" : "ล็อก";
            return `<article class="flow-summary-item ${status.toLowerCase()} ${isNext ? "current" : ""}"><span>${index + 1}</span><div><strong>${item.label}</strong><small>${statusLabel}</small></div></article>`;
        }).join("");
    }
    $("#outboundScanGate").hidden = unlocked;
    $("#openReturnProcessBtn").disabled = !unlocked;
    const details = $$("#tab-outbound .outbound-workflow-detail");
    details.forEach(element => {
        element.hidden = true;
    });
    if (!unlocked) return;
    $("#terminalJobInfo").hidden = false;
    $("#changeOutboundHouseBtn").hidden = false;
    const normalSections = $$("#tab-outbound .inbound-step.outbound-workflow-detail:not(.return-process)");
    const returnSection = $("#tab-outbound .return-process");
    if (state.outboundReturnMode) {
        if (returnSection) returnSection.hidden = false;
        const returnStatus = job.stepTracking?.return_goods?.status || "NotStarted";
        $("#startReturnBtn").disabled = returnStatus !== "NotStarted";
        $("#completeReturnBtn").disabled = returnStatus !== "InProgress";
        return;
    }
    const activeIndex = nextStepIndex;
    const visibleIndex = activeIndex < 0 ? OUTBOUND_FLOW_STEPS.length - 1 : activeIndex;
    normalSections.forEach((section, index) => {
        const isCurrent = index === visibleIndex;
        section.hidden = !isCurrent;
        if (!isCurrent) return;
        const stepStatus = job.stepTracking?.[OUTBOUND_FLOW_STEPS[index].key]?.status || "NotStarted";
        section.querySelectorAll("input, select, textarea, button").forEach(control => {
            if (control.closest(".step-tracker")) return;
            control.disabled = stepStatus !== "InProgress";
        });
    });
}

function unlockOutboundWorkflow(value, source = "scanner") {
    const house = normalizeHouseBarcode(value);
    const job = findAnyJob(house);
    if (!job) throw new Error("ไม่พบ House นี้ในระบบ กรุณาตรวจเลขแล้วสแกนใหม่");
    $("#terminalHouse").value = job.houseNumber;
    state.outboundUnlockedHouse = job.houseNumber;
    state.outboundReturnMode = false;
    updateTerminalRequirements();
    toast(source === "camera" ? `สแกนพบ ${job.houseNumber}` : `เปิดงาน ${job.houseNumber}`);
}

function applyScannedHouse(value, source = "scanner") {
    const house = normalizeHouseBarcode(value);
    if (!house) return;
    $("#scanHouse").value = house;
    unlockInboundWorkflow(house, source);
}

async function ensureJobForScan(house, detail) {
    const existing = findAnyJob(house);
    if (existing) return existing.houseNumber;
    const ok = window.confirm(
        `ไม่พบ House ${house} ในระบบ\n\nต้องการ "เพิ่มงานใหม่จากการสแกน" เพื่อทดลองกระบวนการเลยหรือไม่?\n(ข้อมูลลูกค้า/รายละเอียดเติมภายหลังได้ และงานจะเข้าคิวรอ CS ตามปกติ)`
    );
    if (!ok) return null;
    const data = await api("/api/admin/job", {
        houseNumber: house,
        customerName: "รอข้อมูล (เพิ่มจากการสแกน)",
        sourceChannel: "ScanQuickAdd",
        pieceCount: detail?.pieceCount || "",
        pickupDate: new Date().toISOString().slice(0, 10)
    });
    if (data.dashboard) state.dashboard = data.dashboard;
    toast(`เพิ่มงาน ${house} เข้าระบบแล้ว — ทดลอง flow ต่อได้เลย`);
    return house;
}

function unlockInboundWorkflow(value, source = "scanner") {
    const house = normalizeHouseBarcode(value);
    const job = findAnyJob(house);
    if (!job) throw new Error("ไม่พบ House นี้ในระบบ กรุณาสแกนใหม่");
    $("#scanHouse").value = job.houseNumber;
    state.inboundUnlockedHouse = job.houseNumber;
    updateInboundInfo();
    renderInboundGuide();
    toast(source === "camera" ? `สแกนพบ ${job.houseNumber}` : `เปิดงานรับเข้า ${job.houseNumber}`);
}

function renderPickupGuide() {
    const selection = $("#driverJobSelect")?.value || "";
    const unlocked = Boolean(selection && state.pickupUnlockedSelection === selection);
    if ($("#pickupWorkflowDetails")) $("#pickupWorkflowDetails").hidden = !unlocked;
    if ($("#openPickupWorkflowBtn")) $("#openPickupWorkflowBtn").disabled = !selection;
    const job = jobsFromSelection(selection)[0];
    let active = unlocked ? 1 : 0;
    if (job && [ "PickupStarted", "CargoLoaded", "Delivered" ].includes(job.status)) active = 2;
    if (job && [ "CargoLoaded", "Delivered" ].includes(job.status)) active = 3;
    if (job?.status === "Delivered") active = 4;
    $("#tab-pickup .guided-mini-flow")?.querySelectorAll("span").forEach((item, index) => {
        item.classList.toggle("active", index === Math.min(active, 3));
        item.classList.toggle("done", index < active || active === 4);
    });
}

function renderInboundGuide() {
    const job = findAnyJob($("#scanHouse")?.value);
    const unlocked = Boolean(job && state.inboundUnlockedHouse === job.houseNumber);
    if ($("#inboundWorkflowDetails")) $("#inboundWorkflowDetails").hidden = !unlocked;
    if (!unlocked) return;
    let target = "inbound-doc";
    if ([ "InboundOpened" ].includes(job.status)) target = "inbound-scan";
    if ([ "HouseIdentified" ].includes(job.status)) target = job.trackType === "Pair" ? "inbound-close" : "inbound-putaway";
    if ([ "Stored", "ReadyForTerminal", "Inbound" ].includes(job.status)) target = "inbound-close";
    const targetIndex = {
        "inbound-doc": 1,
        "inbound-scan": 2,
        "inbound-putaway": 3,
        "inbound-close": 4
    }[target] ?? 1;
    $("#inboundFlowSummary")?.querySelectorAll("span").forEach((item, index) => {
        item.classList.toggle("active", index === targetIndex);
        item.classList.toggle("done", index < targetIndex);
    });
    $$("#tab-inbound [data-operation-target]").forEach(button => {
        const optionalMove = button.dataset.operationTarget === "inbound-move" && Boolean(job.locationId);
        button.disabled = button.dataset.operationTarget !== target && !optionalMove;
    });
    showOperation(target);
}

function renderBillingGuide() {
    const job = findAnyJob(state.billingUnlockedHouse);
    const unlocked = Boolean(job && state.billingUnlockedHouse === job.houseNumber);
    if ($("#billingWorkflowDetails")) $("#billingWorkflowDetails").hidden = !unlocked;
    if (!unlocked) return;
    const steps = $$("#billingWorkflowDetails .billing-step");
    let active = 0;
    if ([ "BillingReviewed", "InvoiceDrafted", "InvoiceSent", "Billed" ].includes(job.status)) active = 1;
    if ([ "InvoiceDrafted", "InvoiceSent", "Billed" ].includes(job.status)) active = 2;
    steps.forEach((step, index) => {
        step.hidden = index !== active;
    });
    const labels = [ "ตรวจเอกสาร", "สร้าง Draft", "ส่งและปิด" ];
    $("#billingFlowSummary").querySelectorAll("span").forEach((item, index) => {
        if (index === 0) return;
        item.classList.toggle("active", index - 1 === active);
        item.classList.toggle("done", index - 1 < active);
        if (labels[index - 1]) item.title = labels[index - 1];
    });
}

function renderGuidedModules() {
    renderPickupGuide();
    renderInboundGuide();
    renderBillingGuide();
}

function updateInboundInfo() {
    const house = normalizeHouseBarcode($("#scanHouse")?.value);
    const info = $("#inboundJobInfo");
    const currentLocation = $("#currentLocationInfo");
    if (!info) return;
    const job = findAnyJob(house);
    if (!job) {
        info.className = "soft-note warning";
        info.innerHTML = "<strong>ไม่พบ House</strong><span>กรุณาสแกนหรือกรอก House Number ให้ถูกต้อง</span>";
        if (currentLocation) {
            currentLocation.className = "soft-note warning";
            currentLocation.innerHTML = "<strong>Location ปัจจุบัน: -</strong><span>ยังไม่พบงานสำหรับ House นี้</span>";
        }
        return;
    }
    const isSpecial = /wd|western digital|special|lithium/i.test(`${job.customerName || ""} ${job.productType || ""}`);
    $("#wdInboundCard")?.classList.toggle("warning", isSpecial);
    info.className = "soft-note ok";
    info.innerHTML = `\n    <strong>${job.houseNumber} / ${job.status}</strong>\n    <span>${job.customerName || "-"} · Flight ${job.flightNo || "-"} · ${job.destination || job.routeType || "WH3"}</span>\n  `;
    if (currentLocation) {
        currentLocation.className = job.locationId ? "soft-note ok" : "soft-note";
        currentLocation.innerHTML = `\n      <strong>Location ปัจจุบัน: ${job.locationId || "ยังไม่ได้จัดเก็บ"}</strong>\n      <span>${job.locationMovedAt ? `ย้ายล่าสุด ${job.locationMovedAt}` : "ล็อกตำแหน่งหรือย้ายตำแหน่งได้จากช่อง Location ID"}</span>\n    `;
    }
}

function scanApiUrl() {
    return window.SMART_LOGISTICS_SCAN_API || `${API_BASE}/api/scan-barcode`;
}

async function uploadScanImage(blob) {
    const res = await fetch(scanApiUrl(), {
        method: "POST",
        headers: {
            "Content-Type": blob.type || "image/jpeg"
        },
        body: blob
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Scanner service unavailable");
    return Array.isArray(data.barcodes) ? data.barcodes : [];
}

async function compressImageFile(file, maxWidth = 1280) {
    if (!file.type.startsWith("image/")) return file;
    const bitmap = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image;
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = reject;
        img.src = url;
    });
    const scale = bitmap.naturalWidth > maxWidth ? maxWidth / bitmap.naturalWidth : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(bitmap.naturalHeight * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .8));
}

async function handleScanFileUpload(file, options = {}) {
    if (!file) return;
    toast("กำลังถอดรหัสบาร์โค้ด… / Decoding barcode…");
    const blob = await compressImageFile(file);
    const barcodes = await uploadScanImage(blob);
    const match = barcodes.map(normalizeHouseBarcode).find(code => code && findAnyJob(code));
    if (!match) throw new Error("ไม่พบ Barcode ในรูป — ถ่ายให้ชัด/ใกล้ขึ้น / No barcode found in photo");
    if (options.onDetected) options.onDetected(match); else applyScannedHouse(match, "camera");
}

function pickupGroupKey(job) {
    return [ job.pickupDate || "", job.customerName || "", job.pickupLocation || job.startPlace || "", job.driverName || job.driverId || "", job.vehiclePlate || "" ].join("|");
}

function pickupGroups() {
    const map = new Map;
    for (const job of visibleDriverJobs()) {
        const key = pickupGroupKey(job);
        if (!map.has(key)) {
            map.set(key, {
                key: key,
                customerName: job.customerName || "-",
                pickupLocation: job.pickupLocation || job.startPlace || "Customer warehouse",
                jobs: []
            });
        }
        map.get(key).jobs.push(job);
    }
    return Array.from(map.values()).sort((a, b) => b.jobs.length - a.jobs.length);
}

function jobsFromSelection(value = $("#driverJobSelect")?.value) {
    if (!value) return [];
    if (value.startsWith("group::")) {
        const key = decodeURIComponent(value.replace("group::", ""));
        return pickupGroups().find(group => group.key === key)?.jobs || [];
    }
    const job = findJob(value);
    return job ? [ job ] : [];
}

function currentPickupJob() {
    return jobsFromSelection()[0] || findJob($("#driverHouse")?.value);
}

function isSpecialOrWd(job = currentPickupJob()) {
    const pickupCase = $("#driverPickupCase")?.value || job?.pickupCase || "";
    const customer = ($("#driverCustomerName")?.value || job?.customerName || "").toLowerCase();
    return pickupCase === "SpecialMD" || customer.includes("wd") || customer.includes("western digital");
}

function updatePickupFlowNotice(job = currentPickupJob()) {
    const notice = $("#driverFlowNotice");
    const stickerNotice = $("#stickerNotice");
    if (!notice || !stickerNotice) return;
    const pickupCase = $("#driverPickupCase").value;
    const special = isSpecialOrWd(job);
    notice.classList.toggle("warning", pickupCase === "SpecialMD");
    notice.querySelector("strong").textContent = pickupCase === "SpecialMD" ? "งานพิเศษ/MD: คนขับต้องไปรับ Cargo Pickup Form ที่ WH3" : "งานทั่วไป: คนขับกรอก/เขียน Cargo Pickup Form เองได้";
    notice.querySelector("span").textContent = pickupCase === "SpecialMD" ? "หลังรับฟอร์มแล้วจึงเดินทางไปคลังลูกค้าเพื่อ Check-in" : "เมื่อถึงคลังลูกค้าให้ Check-in แล้วตรวจสินค้า 10 รายการ";
    stickerNotice.classList.toggle("warning", special);
    stickerNotice.classList.toggle("ok", !special);
    stickerNotice.querySelector("strong").textContent = special ? "ต้องแปะ Sticker สี" : "ไม่บังคับ Sticker";
    stickerNotice.querySelector("span").textContent = special ? "กรุณากรอกสี Sticker ก่อนกดโหลดสินค้าขึ้นรถ" : "ถ้าไม่ใช่งานพิเศษ/WD สามารถข้ามสี Sticker ได้";
}

function checkedPickupItems() {
    return $$(".pickup-check:checked").map(input => input.value);
}

function validatePickupFlow({requireLoaded: requireLoaded = false} = {}) {
    syncPickupItemsText();
    const missing = [];
    if (!state.pickupStartTime) missing.push("กดเช็คอินก่อนเริ่มงาน");
    if ($$(".pickup-check").length && checkedPickupItems().length < 10) missing.push("ติ๊กตรวจสินค้า 10 รายการให้ครบ");
    if (isSpecialOrWd() && !$("#driverStickerColor").value.trim()) missing.push("กรอกสี Sticker สำหรับงานพิเศษ/WD");
    if (!$("#driverPickupItems").value.trim()) missing.push("เพิ่ม House/Destination อย่างน้อย 1 งาน");
    if (requireLoaded && !state.cargoLoaded) missing.push("กดโหลดสินค้าขึ้นรถก่อนจบงาน");
    if (requireLoaded && !$("#productImages")?.files?.length) missing.push("แนบรูปสินค้าก่อนจบงาน");
    if (requireLoaded && !$("#cargoImages")?.files?.length) missing.push("แนบรูปใบ Cargo Pickup Form ที่เซ็นแล้วก่อนจบงาน");
    if (requireLoaded && !$("#doorClosedImages")?.files?.length) missing.push("แนบรูปปิดประตูตู้/ท้ายรถก่อนจบงาน (กฎ Audit)");
    const _dests = pickupRowsFromInputs().map(row => (row.destination || "").toUpperCase()).filter(Boolean);
    const _nonWh3 = _dests.filter(d => d !== "WH3");
    if (_nonWh3.length) missing.push(`ตามกฎประชุม สินค้าต้องกลับเข้า WH3 ก่อนส่ง Terminal — พบปลายทาง ${[ ...new Set(_nonWh3) ].join(", ")} กรุณาเปลี่ยนเป็น WH3`);
    if (missing.length) throw new Error(missing.join(" / "));
}

function toast(message) {
    const el = $("#toast");
    el.textContent = localizeText(message);
    el.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => el.classList.remove("show"), 3e3);
}

function showMobileActionModal(title, message) {
    const modal = $("#mobileActionModal");
    if (!modal) return;
    $("#mobileActionTitle").textContent = localizeText(title);
    $("#mobileActionMessage").textContent = localizeText(message);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
}

function closeMobileActionModal() {
    const modal = $("#mobileActionModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
}

function addPickupItemRow(values = {}) {
    const list = $("#driverPickupItemRows");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "pickup-item-row";
    row.innerHTML = `\n    <input class="pickup-house" placeholder="House Number" value="${values.houseNumber || ""}">\n    <select class="pickup-destination">\n      <option value="WH3">WH3 เข้าคลัง</option>\n      <option value="TG">TG ส่งออก</option>\n      <option value="TGINT">TGINT ส่งออก</option>\n      <option value="BFS">BFS ส่งออก</option>\n    </select>\n    <input class="pickup-carton" placeholder="Carton/ชิ้น" value="${values.carton || ""}">\n    <button class="remove-row" type="button" aria-label="Remove row">×</button>\n  `;
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
    if (endPlace) endPlace.value = computedEndPlaceFromRows(rows) || "คำนวณจากปลายทางของแต่ละ House";
    return target.value;
}

function pickupRowsFromInputs() {
    return $$("#driverPickupItemRows .pickup-item-row").map(row => {
        const houseNumber = row.querySelector(".pickup-house").value.trim();
        const destination = row.querySelector(".pickup-destination").value;
        const carton = row.querySelector(".pickup-carton").value.trim();
        return houseNumber ? {
            houseNumber: houseNumber,
            destination: destination,
            carton: carton
        } : null;
    }).filter(Boolean);
}

function computedEndPlaceFromRows(rows) {
    const destinations = Array.from(new Set(rows.map(row => row.destination).filter(Boolean)));
    if (!destinations.length) return "";
    return destinations.length === 1 ? destinations[0] : destinations.join(" / ");
}

function clearPickupItemRows() {
    $("#driverPickupItemRows").innerHTML = "";
    syncPickupItemsText();
}

function applyDriverJob(houseNumber) {
    const today = (new Date).toISOString().slice(0, 10);
    $("#driverPickupDate").value ||= today;
    const selectedJobs = jobsFromSelection(houseNumber);
    if (!houseNumber || !selectedJobs.length) {
        if ($("#driverGroupSummary")) $("#driverGroupSummary").hidden = true;
        state.cargoLoaded = false;
        $("#loadCargoBtn")?.classList.remove("loaded");
        if ($("#loadCargoBtn")) $("#loadCargoBtn").textContent = "โหลดสินค้าขึ้นรถ / Load Cargo";
        $("#driverHouse").value = "";
        $("#driverPickupCase").value = "GeneralManual";
        $("#driverStickerColor").value = "";
        $("#driverCustomerName").readOnly = false;
        $("#driverStartPlace").readOnly = false;
        $("#driverVehiclePlate").readOnly = false;
        updatePickupFlowNotice(null);
        return;
    }
    const job = selectedJobs[0];
    const isGroup = selectedJobs.length > 1;
    state.pickupStartTime = job.checkInAt || state.pickupStartTime;
    const summary = $("#driverGroupSummary");
    if (summary) {
        summary.hidden = !isGroup;
        if (isGroup) {
            const destinations = Array.from(new Set(selectedJobs.map(item => item.destination || item.routeType || "WH3"))).join(", ");
            const pieces = selectedJobs.reduce((sum, item) => sum + Number(item.pieceCount || 0), 0);
            summary.innerHTML = `\n        <strong>กลุ่มงานรับที่เดียวกัน ${selectedJobs.length} งาน</strong>\n        <span>${job.customerName} · ${job.pickupLocation || job.startPlace || "Customer warehouse"}</span>\n        <span>รวม ${pieces || "-"} ชิ้น · ปลายทาง ${destinations}</span>\n      `;
        }
    }
    state.cargoLoaded = selectedJobs.every(item => Boolean(item.loadedAt || item.status === "CargoLoaded" || item.status === "Delivered"));
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
    $("#driverEndPlace").value = "";
    $("#driverStickerColor").value = job.stickerColor || "";
    $("#driverCustomerName").readOnly = Boolean(job.adminPrepared || job.cargoFormMode === "AdminPrepared");
    $("#driverStartPlace").readOnly = Boolean(job.adminPrepared || job.cargoFormMode === "AdminPrepared");
    $("#driverVehiclePlate").readOnly = Boolean(job.adminPrepared || job.cargoFormMode === "AdminPrepared");
    clearPickupItemRows();
    const rows = selectedJobs.flatMap(item => Array.isArray(item.pickupItems) && item.pickupItems.length ? item.pickupItems : [ {
        houseNumber: item.houseNumber,
        destination: item.destination || item.routeType || "WH3",
        carton: item.pieceCount || ""
    } ]);
    rows.forEach(row => addPickupItemRow(row));
    if (isGroup) {
        $("#driverPieceCount").value = selectedJobs.reduce((sum, item) => sum + Number(item.pieceCount || 0), 0) || "";
    }
    $("#driverEndPlace").value = computedEndPlace() || "คำนวณจากปลายทางของแต่ละ House";
    updatePickupFlowNotice(job);
}

function primaryHouseNumber() {
    const selected = $("#driverJobSelect").value;
    const selectedJobs = jobsFromSelection(selected);
    if (selectedJobs.length) return selectedJobs[0].houseNumber;
    syncPickupItemsText();
    const firstRow = $("#driverPickupItems").value.split(/\r?\n/).find(Boolean);
    return firstRow ? firstRow.split(",")[0].trim() : "";
}

function pickupHouseNumbers() {
    syncPickupItemsText();
    return Array.from(new Set($("#driverPickupItems").value.split(/\r?\n/).map(line => line.split(",")[0]?.trim()).filter(Boolean)));
}

function pickupDestinations() {
    return Array.from(new Set(pickupRowsFromInputs().map(row => row.destination).filter(Boolean)));
}

function computedEndPlace() {
    return computedEndPlaceFromRows(pickupRowsFromInputs());
}

function showTab(tab) {
    $$(".action-card").forEach(button => button.classList.toggle("active", button.dataset.mobileTab === tab));
    $$(".mobile-panel[id^='tab-']").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tab}`));
    if (tab === "attendance") initAttendanceTab();
}

function applyRoleVisibility() {
    const user = currentUser();
    const allowed = allowedMobileTabs(user?.role);
    const scanCard = $("#smartScanCard");
    if (scanCard) scanCard.hidden = ![ "pickup", "inbound", "outbound" ].some(tab => allowed.includes(tab));
    $$(".action-card").forEach(button => {
        button.hidden = !allowed.includes(button.dataset.mobileTab);
    });
    const active = $(".action-card.active:not([hidden])")?.dataset.mobileTab;
    showTab(active || allowed[0] || "pickup");
}

function showOperation(target) {
    const button = $(`[data-operation-target="${target}"]`);
    const panel = button?.closest(".mobile-panel");
    if (!panel) return;
    panel.querySelectorAll("[data-operation-target]").forEach(item => {
        item.classList.toggle("active", item.dataset.operationTarget === target);
    });
    panel.querySelectorAll("[data-operation-section]").forEach(section => {
        section.classList.toggle("active", section.dataset.operationSection === target);
    });
}

function getGps() {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve({});
        navigator.geolocation.getCurrentPosition(pos => resolve({
            gpsLat: pos.coords.latitude,
            gpsLong: pos.coords.longitude
        }), () => resolve({}), {
            enableHighAccuracy: true,
            timeout: 1e4,
            maximumAge: 0
        });
    });
}

function fileToCompressedBase64(input, maxWidth = 1280, quality = .72) {
    const file = input.files?.[0];
    if (!file) return Promise.resolve({
        base64: "",
        mimeType: ""
    });
    if (file.type === "application/pdf") {
        return new Promise((resolve, reject) => {
            const reader = new FileReader;
            reader.onload = () => resolve({
                base64: reader.result,
                mimeType: file.type
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    return new Promise((resolve, reject) => {
        const img = new Image;
        const reader = new FileReader;
        reader.onload = () => {
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve({
                    base64: canvas.toDataURL("image/jpeg", quality),
                    mimeType: "image/jpeg"
                });
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
        results.push(await fileToCompressedBase64({
            files: [ file ]
        }));
    }
    return results;
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
        ctx.strokeStyle = "#152033";
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        event.preventDefault();
    }
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", () => drawing = false);
    canvas.addEventListener("touchstart", start, {
        passive: false
    });
    canvas.addEventListener("touchmove", move, {
        passive: false
    });
    canvas.addEventListener("touchend", () => drawing = false);
    $("#clearSignature").addEventListener("click", () => ctx.clearRect(0, 0, canvas.width, canvas.height));
}

async function runAction(button, task) {
    button.disabled = true;
    try {
        await task();
        await refresh();
    } catch (error) {
        const message = error && error.message ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
        // The short-lived toast was easy to miss on the final pickup step.
        // Keep it, but also present the actionable reason in a modal.
        showMobileActionModal("ยังดำเนินการไม่สำเร็จ", message);
        toast(message);
    } finally {
        button.disabled = false;
    }
}

function updateTerminalRequirements() {
    const job = findAnyJob(terminalHouseValue());
    const terminal = ($("#terminalDestination")?.value || job?.terminalDestination || job?.destination || "TG").toUpperCase();
    const terminalNotes = {
        TG: "TG: booking, plate/bay confirm, original docs, weighing, X-Ray, loading.",
        TGINT: "TG Inter: tighter document tracking and Re-X-Ray monitoring.",
        BFS: "BFS: watch queue/trailer risk, target unloading 30 minutes, group same-product multi-vehicle jobs."
    };
    if ($("#terminalProfileNote")) $("#terminalProfileNote").textContent = terminalNotes[terminal] || terminalNotes.TG;
    $$(".bfs-only-check").forEach(item => {
        item.style.display = terminal === "BFS" ? "" : "none";
    });
    $$(".tgint-only-check").forEach(item => {
        item.style.display = terminal === "TGINT" ? "" : "none";
    });
    $("#lithiumDocLabel").textContent = job?.requiresLithiumDocs ? "เอกสารลิเธียม / Permit (Required)" : "เอกสารเพิ่มเติม / Optional document";
    const info = $("#terminalJobInfo");
    const locationInfo = $("#outboundLocationInfo");
    if (!info) return;
    if (!job) {
        info.className = "soft-note warning";
        info.innerHTML = "<strong>ไม่พบ House</strong><span>กรุณากรอก House หรือยิงบาร์โค้ดให้ถูกต้อง</span>";
        if (locationInfo) {
            locationInfo.className = "soft-note warning";
            locationInfo.innerHTML = "<strong>ยังไม่ทราบ Location</strong><span>ต้องเลือก House ที่มีงานในระบบก่อน</span>";
        }
        renderOutboundStepTrackers();
        return;
    }
    info.className = job.redFlag ? "soft-note warning" : "soft-note ok";
    info.innerHTML = `\n    <strong>${job.houseNumber} / ${job.status}</strong>\n    <span>Flight ${job.flightNo || "-"} · เหลือ ${job.hoursToFlight ?? "-"} ชม. · ${job.redFlag ? "เสี่ยงเกิน 4 ชั่วโมง" : "อยู่ในเวลา"}</span>\n  `;
    if (locationInfo) {
        const found = Boolean(job.outboundFoundAt);
        const hasLocation = Boolean(job.locationId);
        locationInfo.className = found ? "soft-note ok" : hasLocation ? "soft-note warning" : "soft-note";
        locationInfo.innerHTML = `\n      <strong>Location: ${job.locationId || "ยังไม่มีพิกัด / No location"}</strong>\n      <span>${found ? "สแกนเจอป้ายแล้ว / Label confirmed" : hasLocation ? "ไปที่ Location นี้ แล้วสแกนป้าย House เพื่อยืนยัน" : "ถ้างานนี้ไม่ได้เก็บใน WH3 ให้ข้ามไปขั้น Pick ได้"}</span>\n    `;
    }
    renderOutboundStepTrackers();
}

function bindEvents() {
    $$(".action-card").forEach(button => button.addEventListener("click", () => showTab(button.dataset.mobileTab)));
    $$("[data-operation-target]").forEach(button => {
        button.addEventListener("click", () => showOperation(button.dataset.operationTarget));
    });
    $("#addDriverPickupItem").addEventListener("click", () => addPickupItemRow());
    $("#driverJobSelect").addEventListener("change", event => {
        state.pickupUnlockedSelection = "";
        applyDriverJob(event.target.value);
        renderPickupGuide();
    });
    $("#openPickupWorkflowBtn").addEventListener("click", () => {
        const selection = $("#driverJobSelect").value;
        if (!selection) return toast("กรุณาเลือกใบงานก่อน");
        state.pickupUnlockedSelection = selection;
        renderPickupGuide();
        $("#pickupWorkflowDetails").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });
    $("#scanHouse").addEventListener("input", () => {
        const normalized = normalizeHouseBarcode($("#scanHouse").value);
        if (normalized !== $("#scanHouse").value.trim() && normalized.length >= 8) {
            $("#scanHouse").value = normalized;
        }
        updateInboundInfo();
    });
    $("#scanHouse").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            try {
                applyScannedHouse(event.currentTarget.value);
            } catch (error) {
                toast(error.message);
            }
        }
    });
    $("#confirmInboundHouseBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const typed = normalizeHouseBarcode($("#scanHouse").value);
        const ready = await ensureJobForScan(typed, null);
        if (ready) unlockInboundWorkflow(ready, "manual");
    }));
    $("#cameraScanBtn").addEventListener("click", () => {
        if (typeof openLiveScan === "function") {
            openLiveScan(async (house, detail) => {
                try {
                    const el = $("#scanHouse");
                    if (el) el.value = house;
                    if (detail?.mode === "dual") {
                        toast("⚠ สแกนได้บาร์คู่ (มี Master) — งานนี้เป็น Track คู่สำหรับส่งออก ตรวจสอบก่อนรับเข้าโกดัง");
                    } else if (detail?.pieceCount) {
                        toast(`สแกนแล้ว ${detail.pieceCount} ชิ้น (+${detail.pieces.join(", +")})`);
                    }
                    state.scannedPieces = detail?.pieces || [];
                    state.scannedMode = detail?.mode || "";
                    const ready = await ensureJobForScan(house, detail);
                    if (ready) unlockInboundWorkflow(ready, "camera");
                } catch (err) {
                    toast("เพิ่มงานไม่สำเร็จ: " + (err?.message || "ลองใหม่"));
                }
            });
        } else {
            $("#scanHouseFile")?.click();
        }
    });
    $("#scanHouseFile")?.addEventListener("change", event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) runAction(event.currentTarget, () => handleScanFileUpload(file));
    });
    $("#mobileLoginBtn").addEventListener("click", submitMobileLogin);
    $("#mobileLoginPassword").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            submitMobileLogin();
        }
    });
    const logoutMobile = () => {
        localStorage.removeItem(MOBILE_AUTH_KEY);
        renderMobileAuthState();
        renderMobileLogin();
        toast("ออกจากระบบแล้ว / Logged out");
    };
    $("#mobileLogoutBtn").addEventListener("click", logoutMobile);
    $("#mobileHeaderLogoutBtn")?.addEventListener("click", logoutMobile);
    $("#mobileLanguageToggle").addEventListener("click", () => {
        state.lang = state.lang === "th" ? "en" : "th";
        localStorage.setItem("smartLogisticsLang", state.lang);
        applyLanguage();
        toast(state.lang === "en" ? "English mode" : "แสดงภาษาไทย");
    });
    $("#driverPickupCase").addEventListener("change", () => updatePickupFlowNotice());
    $("#driverCustomerName").addEventListener("input", () => updatePickupFlowNotice());
    $("#terminalHouse").addEventListener("input", updateTerminalRequirements);
    $("#terminalHouse").addEventListener("change", event => {
        event.currentTarget.value = normalizeHouseBarcode(event.currentTarget.value);
        updateTerminalRequirements();
    });
    $("#terminalHouse").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            try {
                unlockOutboundWorkflow(event.currentTarget.value, "scanner");
            } catch (error) {
                toast(error.message);
            }
        }
    });
    $("#confirmOutboundHouseBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        unlockOutboundWorkflow($("#terminalHouse").value, "manual");
    }));
    $("#outboundCameraScanBtn").addEventListener("click", () => {
        if (typeof openLiveScan === "function") {
            openLiveScan((house, detail) => {
                const el = $("#terminalHouse");
                if (el) el.value = house;
                if (detail?.mode === "dual" && detail.master) {
                    state.scannedMasterAwb = detail.master;
                    state.scannedPieces = detail?.pieces || [];
                    toast(`บาร์คู่ ✓ Master ${detail.master} + House ${house}${detail.pieceCount ? ` · ${detail.pieceCount} ชิ้น` : ""}`);
                } else {
                    toast("⚠ ได้บาร์เดี่ยว — งานส่งออกควรมี Master ด้วย ลองสแกนบาร์บนของป้าย");
                }
                unlockOutboundWorkflow(house, "camera");
            });
        } else {
            $("#outboundScanFile")?.click();
        }
    });
    $("#outboundScanFile")?.addEventListener("change", event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) runAction(event.currentTarget, () => handleScanFileUpload(file, {
            onDetected: value => unlockOutboundWorkflow(value, "camera")
        }));
    });
    $("#changeOutboundHouseBtn").addEventListener("click", () => {
        state.outboundUnlockedHouse = "";
        state.outboundReturnMode = false;
        $("#terminalHouse").value = "";
        updateTerminalRequirements();
        $("#terminalHouse").focus();
    });
    $("#openReturnProcessBtn").addEventListener("click", () => {
        if (!state.outboundUnlockedHouse) return toast("กรุณาสแกน House ก่อนเปิดงานตีกลับ");
        state.outboundReturnMode = true;
        renderOutboundWorkflow();
    });
    $("#backToOutboundFlowBtn").addEventListener("click", () => {
        state.outboundReturnMode = false;
        renderOutboundWorkflow();
    });
    $("#tab-outbound").addEventListener("click", event => {
        const button = event.target.closest("[data-step-action]");
        if (!button) return;
        const tracker = button.closest(".step-tracker");
        runAction(button, async () => {
            await api("/api/activity/step", {
                houseNumber: terminalHouseValue(),
                userId: state.currentUserId,
                stepKey: tracker.dataset.stepKey,
                stepName: tracker.dataset.stepName,
                action: button.dataset.stepAction
            });
            toast(button.dataset.stepAction === "start" ? "เริ่มจับเวลาขั้นตอนแล้ว" : "จบขั้นตอนและบันทึกเวลาแล้ว");
        });
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
    $("#closeMobileActionModal")?.addEventListener("click", closeMobileActionModal);
    $("#mobileActionModal")?.addEventListener("click", event => {
        if (event.target.id === "mobileActionModal") closeMobileActionModal();
    });
    $("#checkInBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const gps = await getGps();
        state.pickupStartTime = (new Date).toISOString();
        await api("/api/pickup/checkin", {
            houseNumber: primaryHouseNumber(),
            houseNumbers: pickupHouseNumbers(),
            userId: state.currentUserId,
            startTime: state.pickupStartTime,
            startPlace: $("#driverStartPlace").value.trim(),
            ...gps
        });
        const timeLabel = new Date(state.pickupStartTime).toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit"
        });
        showMobileActionModal("เช็คอินสำเร็จ", `เริ่มงานเวลา ${timeLabel} และบันทึก GPS แล้ว ขั้นตอนถัดไปคือกรอก/ตรวจรายการ House และถ่ายรูปสินค้า`);
        toast("เช็คอินสำเร็จ / Check-in complete");
    }));
    $("#pausePickupBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
        const gps = await getGps();
        await api("/api/pickup/pause", {
            houseNumber: primaryHouseNumber(),
            houseNumbers: pickupHouseNumbers(),
            userId: state.currentUserId,
            action: "pause",
            reason: $("#pickupPauseReason")?.value || "WarehouseDelay",
            note: $("#pickupPauseNote")?.value?.trim() || "",
            ...gps
        });
        toast("Paused KPI timer / หยุดเวลา KPI แล้ว");
    }));
    $("#resumePickupBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
        const gps = await getGps();
        await api("/api/pickup/pause", {
            houseNumber: primaryHouseNumber(),
            houseNumbers: pickupHouseNumbers(),
            userId: state.currentUserId,
            action: "resume",
            reason: $("#pickupPauseReason")?.value || "WarehouseDelay",
            note: $("#pickupPauseNote")?.value?.trim() || "",
            ...gps
        });
        toast("Resumed KPI timer / เริ่มนับเวลา KPI ต่อแล้ว");
    }));
    $("#loadCargoBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        validatePickupFlow();
        const gps = await getGps();
        await api("/api/pickup/load", {
            houseNumber: primaryHouseNumber(),
            houseNumbers: pickupHouseNumbers(),
            userId: state.currentUserId,
            pickupCase: $("#driverPickupCase").value,
            stickerColor: $("#driverStickerColor").value.trim(),
            checklist: checkedPickupItems(),
            pickupItems: syncPickupItemsText(),
            endPlace: computedEndPlace(),
            ...gps
        });
        state.cargoLoaded = true;
        $("#loadCargoBtn").classList.add("loaded");
        $("#loadCargoBtn").textContent = "โหลดขึ้นรถแล้ว / Cargo loaded";
        showMobileActionModal("โหลดสินค้าขึ้นรถแล้ว", `บันทึกปลายทาง ${computedEndPlace()} แล้ว ขั้นตอนถัดไปคือถ่ายรูปใบ Cargo/ลายเซ็น และกดจบงาน`);
        toast("โหลดสินค้าขึ้นรถแล้ว / Cargo loaded");
    }));
    $("#completePickupBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        validatePickupFlow({
            requireLoaded: true
        });
        const gps = await getGps();
        const productImages = await filesToCompressedBase64($("#productImages"));
        const cargoImages = await filesToCompressedBase64($("#cargoImages"));
        const doorClosedImages = await filesToCompressedBase64($("#doorClosedImages"));
        await api("/api/pickup/complete", {
            houseNumber: primaryHouseNumber(),
            houseNumbers: pickupHouseNumbers(),
            userId: state.currentUserId,
            startTime: state.pickupStartTime,
            ...gps,
            productImages: productImages,
            cargoImages: cargoImages,
            doorClosedImages: doorClosedImages,
            signatureBase64: $("#signaturePad").toDataURL("image/png"),
            pickupCase: $("#driverPickupCase").value,
            stickerColor: $("#driverStickerColor").value.trim(),
            checklist: checkedPickupItems(),
            pieceCount: $("#driverPieceCount").value,
            pickupItems: syncPickupItemsText(),
            packageType: $("#driverPackageType").value,
            inspectorName: $("#driverInspectorName").value.trim(),
            receiverName: $("#driverReceiverName").value.trim(),
            endPlace: computedEndPlace()
        });
        // The API has already set the job to Delivered (back at WH3). Close
        // the active form so the driver is not left on a page that looks like
        // the pickup is still in progress.
        state.pickupUnlockedSelection = "";
        state.pickupStartTime = null;
        state.cargoLoaded = false;
        $("#driverJobSelect").value = "";
        showMobileActionModal("จบงานสำเร็จ", "ระบบบันทึกเวลาเช็คเอาท์ รูปสินค้า รูปใบ Cargo และลายเซ็นแล้ว สถานะงานเปลี่ยนเป็น Delivered (กลับ WH3) และส่งให้แอดมินตรวจแล้ว");
        toast("จบงานแล้ว / Completed");
    }));
    $("#twinScanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/inbound/twin-scan", {
            houseNumber: normalizeHouseBarcode($("#scanHouse").value),
            locationId: $("#scanLocation").value.trim(),
            userId: state.currentUserId,
            pieces: state.scannedPieces || [],
            scanMode: state.scannedMode || "",
            trackType: $("#trackType").value,
            dimensionText: $("#dimensionText").value.trim(),
            wdChecklist: inboundWdChecklist(),
            stickerColor: $("#inboundStickerColor").value.trim(),
            pallets: parseInt($("#inboundPallets")?.value) || 0,
            boxes: parseInt($("#inboundBoxes")?.value) || 0
        });
        toast("ล็อกตำแหน่งสำเร็จ / Location locked");
    }));
    $("#moveLocationBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const newLocationId = ($("#moveLocationId").value || $("#scanLocation").value).trim();
        if (!newLocationId) throw new Error("กรุณากรอก Location ใหม่");
        await api("/api/inbound/move-location", {
            houseNumber: normalizeHouseBarcode($("#scanHouse").value),
            newLocationId: newLocationId,
            userId: state.currentUserId,
            note: $("#dimensionText").value.trim()
        });
        toast("ย้าย Location สำเร็จ / Location moved");
    }));
    $("#docCheckBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const documentFiles = await filesToCompressedBase64($("#inboundDocFiles"));
        await api("/api/inbound/document-check", {
            houseNumber: normalizeHouseBarcode($("#scanHouse").value),
            userId: state.currentUserId,
            documentStatus: $("#inboundDocStatus").value,
            note: $("#inboundDocNote").value.trim(),
            documentFiles: documentFiles
        });
        toast($("#inboundDocStatus").value === "Missing" ? "พักงานรอ EI Confirm / Pending EI" : "ตรวจเอกสารแล้ว / Document checked");
    }));
    $("#openInboundBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/inbound/open", {
            houseNumber: normalizeHouseBarcode($("#scanHouse").value),
            userId: state.currentUserId,
            eiConfirmed: $("#inboundDocStatus").value === "EIConfirmed"
        });
        toast("เปิดงานรับเข้าแล้ว / Inbound opened");
    }));
    $("#houseScanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/inbound/scan-house", {
            houseNumber: normalizeHouseBarcode($("#scanHouse").value),
            userId: state.currentUserId,
            trackType: $("#trackType").value,
            flightChanged: $("#flightChanged").value === "Yes",
            updatedFlightNo: $("#updatedFlightNo").value.trim()
        });
        toast($("#trackType").value === "Pair" ? "Track คู่: พร้อมส่ง Terminal / Ready for Terminal" : "Track เดี่ยว: เตรียมจัดเก็บ WH3 / Prepare putaway");
    }));
    $("#closeInboundBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const evidenceFiles = await filesToCompressedBase64($("#inboundEvidenceFiles"));
        await api("/api/inbound/close", {
            houseNumber: normalizeHouseBarcode($("#scanHouse").value),
            userId: state.currentUserId,
            evidenceFiles: evidenceFiles
        });
        toast("ปิดงานรับเข้าแล้ว / Inbound closed");
    }));
    $("#validateDocBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const job = findAnyJob(terminalHouseValue());
        if (job?.requiresLithiumDocs && !$("#lithiumDoc").files.length) {
            throw new Error("ต้องแนบเอกสารลิเธียม / Lithium document required");
        }
        const checkedDocs = $$(".terminal-doc-check:checked").map(cb => cb.value);
        const requiredDocs = [ "permit", "cargo_transfer", "weigh_slip", "airline", "security" ];
        const missingDocs = requiredDocs.filter(d => !checkedDocs.includes(d));
        if (missingDocs.length > 0) {
            const labels = {
                permit: "Permit",
                cargo_transfer: "Cargo Transfer",
                weigh_slip: "ใบชั่ง",
                airline: "ใบ Airline",
                security: "ใบ Security"
            };
            throw new Error("ยังไม่ติ๊ก: " + missingDocs.map(d => labels[d]).join(", "));
        }
        const doc = await fileToCompressedBase64($("#lithiumDoc"));
        await api("/api/outbound/validate", {
            houseNumber: terminalHouseValue(),
            lithiumDocBase64: doc.base64,
            mimeType: doc.mimeType,
            terminalDocChecklist: checkedDocs
        });
        toast("ตรวจเอกสารสำเร็จ / Validated");
    }));
    $("#locateGoodsBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const scannedHouse = normalizeHouseBarcode($("#outboundFoundScan").value || terminalHouseValue());
        if (!scannedHouse) throw new Error("กรุณาสแกนป้าย House ที่ตัวสินค้า");
        await api("/api/outbound/confirm-location", {
            houseNumber: terminalHouseValue(),
            scannedHouse: scannedHouse,
            userId: state.currentUserId
        });
        toast("ยืนยันเจอสินค้าแล้ว / Goods found");
    }));
    $("#pickingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const job = findAnyJob(terminalHouseValue());
        if (job?.locationId && !job.outboundFoundAt) {
            throw new Error("ต้องไปที่ Location และสแกนป้าย House ก่อนเบิกสินค้า");
        }
        const documentFiles = await filesToCompressedBase64($("#outboundDocs"));
        await api("/api/outbound/picking", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            note: $("#cargoTransferNote").value.trim(),
            documentFiles: documentFiles
        });
        toast("เบิกสินค้าแล้ว / Goods picked");
    }));
    $("#eiApproveBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const proof = await fileToCompressedBase64($("#eiProofImage"));
        await api("/api/outbound/ei-approve", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            imageBase64: proof.base64,
            mimeType: proof.mimeType
        });
        toast("EI approve แล้ว / EI approved");
    }));
    $("#wh3DispatchCheckBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
        const evidenceFiles = await filesToCompressedBase64($("#wh3DispatchEvidence"));
        const checklist = $$(".wh3-dispatch-check:checked").map(item => item.value);
        await api("/api/outbound/wh3-dispatch-check", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            terminalDestination: $("#terminalDestination").value,
            checklist: checklist,
            note: $("#wh3DispatchNote").value.trim(),
            evidenceFiles: evidenceFiles
        });
        toast("WH3 documents confirmed");
    }));
    $("#aotBookingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/aot-booking", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            terminalDestination: $("#terminalDestination").value,
            vehiclePlate: $("#aotVehiclePlate").value.trim(),
            driverName: $("#aotDriverName").value.trim(),
            vehicleModel: $("#aotVehicleModel").value.trim(),
            vehicleType: $("#aotVehicleType").value.trim(),
            approved: false
        });
        toast("จองคิว AOT/Terminal แล้ว / Queue booked");
    }));
    $("#aotApproveBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/aot-booking", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
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
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            imageBase64: image.base64,
            mimeType: image.mimeType,
            arrived: false
        });
        toast("รวมของที่ Loading Bay แล้ว / Goods loaded");
    }));
    $("#terminalArrivalBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/load-bay", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            arrived: true
        });
        toast("ส่งถึง Terminal แล้ว / Terminal arrived");
    }));
    $("#terminalUnloadStartBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/weigh-start", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            terminalDestination: $("#terminalDestination").value
        });
        toast("Unloading started");
    }));
    $("#terminalUnloadDoneBtn")?.addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/weight-dimension", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            weight: $("#terminalWeight").value.trim(),
            dimension: $("#terminalDimension").value.trim()
        });
        toast("Unloading completed");
    }));
    $("#weightDimensionBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/weight-dimension", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            weight: $("#terminalWeight").value.trim(),
            dimension: $("#terminalDimension").value.trim()
        });
        toast("บันทึกชั่งน้ำหนัก/Dimension แล้ว");
    }));
    $("#xrayPassedBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/xray", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            passed: true,
            requiresRescan: false
        });
        toast("X-Ray ผ่าน / Passed");
    }));
    $("#rescanBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/xray", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            passed: false,
            requiresRescan: true
        });
        toast("ส่ง Alert แล้ว / Alert sent");
    }));
    $("#xrayHoldBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/xray", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            passed: false,
            requiresRescan: false,
            hold: true
        });
        toast("Hold ตามผลตรวจ / X-Ray hold");
    }));
    $("#packingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/weight-dimension", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            weight: $("#terminalWeight").value.trim(),
            dimension: $("#terminalDimension").value.trim(),
            packing: true
        });
        toast("Packing / Consolidation แล้ว");
    }));
    $("#loadingBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        if (!$("#trayNumber").value.trim()) throw new Error("กรุณากรอก Tray / Pallet / Lot Number");
        const image = await fileToCompressedBase64($("#loadingImage"));
        const image2 = await fileToCompressedBase64($("#loadingImage2"));
        const palletPhotos = await filesToCompressedBase64($("#palletPhoto"));
        await api("/api/outbound/loading-detail", {
            houseNumber: terminalHouseValue(),
            imageBase64: image.base64,
            mimeType: image.mimeType,
            loadingImage2Base64: image2.base64,
            loadingImage2MimeType: image2.mimeType,
            palletPhotos: palletPhotos.map(p => ({
                base64: p.base64,
                mimeType: p.mimeType
            })),
            trayNumber: $("#trayNumber").value.trim(),
            loadingDetailCount: 2
        });
        toast("อัปโหลด Loading Detail 2 ใบ เรียบร้อย / Uploaded");
    }));
    $("#startReturnBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        await api("/api/outbound/return", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            action: "start",
            reason: $("#returnReason").value,
            destination: $("#returnDestination").value
        });
        toast("เริ่มกระบวนการสินค้าตีกลับแล้ว");
    }));
    $("#completeReturnBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const evidenceFiles = await filesToCompressedBase64($("#returnEvidenceFiles"));
        await api("/api/outbound/return", {
            houseNumber: terminalHouseValue(),
            userId: state.currentUserId,
            action: "complete",
            reason: $("#returnReason").value,
            destination: $("#returnDestination").value,
            evidenceFiles: evidenceFiles
        });
        toast("ยืนยันรับสินค้าตีกลับเรียบร้อยแล้ว");
    }));
    $("#generateBillBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const data = await api("/api/billing/generate", {
            houseNumber: $("#billingHouse").value.trim()
        });
        $("#invoiceId").value = data.bill.id;
        $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>Draft · <a href="${assetUrl(data.bill.pdfUrl)}" target="_blank">Preview Invoice</a>`;
        toast("สร้าง Draft แล้ว / Invoice draft created");
    }));
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
        const data = await api("/api/billing/send-email", {
            invoiceId: $("#invoiceId").value.trim()
        });
        $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>${data.bill.status} · ${data.bill.billingEmail}`;
        toast("ส่งอีเมลแล้ว / Sent");
    }));
    $("#markBilledBtn").addEventListener("click", event => runAction(event.currentTarget, async () => {
        const data = await api("/api/billing/mark-billed", {
            invoiceId: $("#invoiceId").value.trim()
        });
        $("#billingResult").innerHTML = `<strong>${data.bill.id}</strong><br>Billed · Due ${data.bill.dueDate}`;
        toast("ปิดเป็น Billed แล้ว");
    }));
}

if ("serviceWorker" in navigator) {
    if ([ "localhost", "127.0.0.1" ].includes(location.hostname)) {
        navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister())).catch(() => {});
    } else {
        navigator.serviceWorker.register("sw.js").catch(() => {});
    }
}

setupSignaturePad();

bindEvents();

renderMobileAuthState();

$("#driverPickupDate").value = (new Date).toISOString().slice(0, 10);

addPickupItemRow({
    houseNumber: "4840779189",
    destination: "WH3",
    carton: "1M"
});

refresh();

const attState = {
    stream: null,
    photoBase64: null,
    gpsLat: null,
    gpsLon: null,
    currentRecord: null
};

function initAttendanceTab() {
    if (!$("#attCheckinBtn")) return;
    loadAttendanceStatus();
    loadAttendanceZones();
    setupAttendanceGps();
    $("#attStartCameraBtn").addEventListener("click", startAttCamera);
    $("#attPhotoFile")?.addEventListener("change", event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) handleAttPhotoFile(file);
    });
    $("#attRetakeBtn").addEventListener("click", retakeAttPhoto);
    $("#attCheckinBtn").addEventListener("click", submitAttCheckin);
    $("#attCheckoutBtn").addEventListener("click", submitAttCheckout);
}

async function loadAttendanceStatus() {
    const user = currentUser();
    if (!user) return;
    try {
        const res = await api("/api/attendance/today");
        const record = (res.records || []).find(r => r.userId === user.id && !r.checkOutTime);
        attState.currentRecord = record || null;
        renderAttendanceStatus(record);
    } catch (e) {}
}

function renderAttendanceStatus(record) {
    const badge = $("#attStatusBadge");
    const card = $("#attCurrentCard");
    const selectors = $("#attSelectors");
    const checkinBtn = $("#attCheckinBtn");
    const checkoutBtn = $("#attCheckoutBtn");
    if (!badge) return;
    if (record && !record.checkOutTime) {
        badge.textContent = "เช็คอินแล้ว ✓";
        badge.className = "att-status-badge att-status-in";
        if (card) {
            card.hidden = false;
            const thumb = $("#attCheckinThumb");
            if (thumb) thumb.src = record.checkInPhoto || "";
            if (thumb) thumb.hidden = !record.checkInPhoto;
            const name = $("#attCardName");
            if (name) name.textContent = record.userName || "";
            const timeEl = $("#attCardTime");
            if (timeEl) timeEl.textContent = "เช็คอิน: " + formatBangkokMobile(record.checkInTime);
            const zoneEl = $("#attCardZone");
            if (zoneEl) zoneEl.textContent = (record.zone ? "โซน: " + record.zone : "") + (record.jobType ? "  งาน: " + record.jobType : "");
            const gpsEl = $("#attCardGps");
            if (gpsEl && record.checkInLat) gpsEl.textContent = "GPS: " + record.checkInLat.toFixed(5) + ", " + record.checkInLon.toFixed(5);
        }
        if (selectors) selectors.hidden = true;
        if (checkinBtn) checkinBtn.hidden = true;
        if (checkoutBtn) checkoutBtn.hidden = false;
        stopAttCamera();
    } else {
        badge.textContent = "ยังไม่ได้เช็คอิน";
        badge.className = "att-status-badge att-status-out";
        if (card) card.hidden = true;
        if (selectors) selectors.hidden = false;
        if (checkinBtn) checkinBtn.hidden = false;
        if (checkoutBtn) checkoutBtn.hidden = true;
    }
}

async function loadAttendanceZones() {
    const select = $("#attZoneSelect");
    if (!select) return;
    try {
        const res = await api("/api/warehouse/zones");
        const zones = res.zones || [];
        select.innerHTML = '<option value="">— เลือกโซน —</option>' + zones.map(z => '<option value="' + escapeHtmlMobile(z.name) + '">' + escapeHtmlMobile(z.name) + "</option>").join("");
    } catch (e) {}
}

function setupAttendanceGps() {
    const gpsText = $("#attGpsText");
    const gpsIcon = $("#attGpsIcon");
    if (!navigator.geolocation) {
        if (gpsText) gpsText.textContent = "ไม่รองรับ GPS";
        return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
        attState.gpsLat = pos.coords.latitude;
        attState.gpsLon = pos.coords.longitude;
        if (gpsText) gpsText.textContent = pos.coords.latitude.toFixed(5) + ", " + pos.coords.longitude.toFixed(5);
        if (gpsIcon) gpsIcon.textContent = "✅";
    }, err => {
        if (gpsText) gpsText.textContent = "ไม่สามารถระบุตำแหน่ง: " + err.message;
        if (gpsIcon) gpsIcon.textContent = "⚠️";
    }, {
        enableHighAccuracy: true,
        timeout: 1e4
    });
}

function startAttCamera() {
    const fileInput = $("#attPhotoFile");
    if (fileInput) fileInput.click();
}

function refreshGpsForAtt() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
        attState.gpsLat = pos.coords.latitude;
        attState.gpsLon = pos.coords.longitude;
    }, () => {}, {
        enableHighAccuracy: true,
        timeout: 8e3
    });
}

function handleAttPhotoFile(file) {
    const canvas = $("#attCameraCanvas");
    const preview = $("#attPhotoPreview");
    const startBtn = $("#attStartCameraBtn");
    const retakeBtn = $("#attRetakeBtn");
    if (!canvas || !file) return;
    if (!file.type.startsWith("image/")) return alert("กรุณาเลือกรูปภาพ / Please choose an image");
    const url = URL.createObjectURL(file);
    const img = new Image;
    img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1280 / (img.naturalWidth || 1280));
        const W = Math.round((img.naturalWidth || 480) * scale);
        const H = Math.round((img.naturalHeight || 640) * scale);
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, W, H);
        const now = new Date;
        const timeStr = new Intl.DateTimeFormat("th-TH", {
            timeZone: "Asia/Bangkok",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        }).format(now);
        const gpsStr = attState.gpsLat && attState.gpsLon ? attState.gpsLat.toFixed(5) + ", " + attState.gpsLon.toFixed(5) : "GPS: ไม่ได้รับอนุญาต";
        const user = typeof currentUser === "function" ? currentUser() : null;
        const nameStr = user ? user.name : "";
        const zoneStr = ($("#attZoneSelect")?.value ? "โซน: " + $("#attZoneSelect").value : "") + ($("#attJobTypeSelect")?.value ? "  " + $("#attJobTypeSelect").value : "");
        const lines = [ nameStr, timeStr, gpsStr, zoneStr ].filter(Boolean);
        const fontSize = Math.max(14, Math.round(W * .035));
        const pad = Math.round(fontSize * .5);
        const lineH = fontSize + Math.round(fontSize * .45);
        const boxH = lines.length * lineH + pad * 2;
        ctx.fillStyle = "rgba(0,0,0,0.58)";
        ctx.fillRect(0, H - boxH, W, boxH);
        ctx.font = "bold " + fontSize + "px 'Helvetica Neue', Arial, sans-serif";
        ctx.textBaseline = "top";
        lines.forEach((line, i) => {
            const y = H - boxH + pad + i * lineH;
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillText(line, pad + 1, y + 1);
            ctx.fillStyle = i === 0 ? "#fbbf24" : "#ffffff";
            ctx.fillText(line, pad, y);
        });
        attState.photoBase64 = canvas.toDataURL("image/jpeg", .82).split(",")[1];
        if (preview) {
            preview.src = "data:image/jpeg;base64," + attState.photoBase64;
            preview.hidden = false;
        }
        if (startBtn) startBtn.hidden = true;
        if (retakeBtn) retakeBtn.hidden = false;
        refreshGpsForAtt();
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        alert("ไม่สามารถอ่านรูปภาพได้ / Cannot read image");
    };
    img.src = url;
}

function retakeAttPhoto() {
    const preview = $("#attPhotoPreview");
    const startBtn = $("#attStartCameraBtn");
    const retakeBtn = $("#attRetakeBtn");
    attState.photoBase64 = null;
    if (preview) {
        preview.src = "";
        preview.hidden = true;
    }
    if (startBtn) startBtn.hidden = false;
    if (retakeBtn) retakeBtn.hidden = true;
    startAttCamera();
}

function stopAttCamera() {
    attState.stream = null;
}

async function submitAttCheckin() {
    const user = currentUser();
    if (!user) return alert("กรุณาเข้าสู่ระบบก่อน");
    const zone = $("#attZoneSelect")?.value || "";
    const jobType = $("#attJobTypeSelect")?.value || "";
    if (!attState.photoBase64) return alert("กรุณาถ่ายรูปยืนยันตัวตนก่อน");
    const btn = $("#attCheckinBtn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "กำลังบันทึก...";
    }
    try {
        const res = await api("/api/attendance/checkin", {
            userId: user.id,
            photo: attState.photoBase64,
            gpsLat: attState.gpsLat,
            gpsLon: attState.gpsLon,
            zone: zone,
            jobType: jobType
        });
        attState.currentRecord = res.record;
        renderAttendanceStatus(res.record);
        loadMyAttTasks();
        showAttResult("✅ เช็คอินสำเร็จ เวลา " + formatBangkokMobile(res.record.checkInTime), false);
    } catch (err) {
        const msg = err.message || "เกิดข้อผิดพลาด";
        showAttResult("❌ " + msg, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "✅ เช็คอิน";
        }
    }
}

async function submitAttCheckout() {
    const user = currentUser();
    if (!user) return alert("กรุณาเข้าสู่ระบบก่อน");
    if (!attState.photoBase64) {
        await startAttCamera();
        showAttResult("📷 ถ่ายรูปยืนยันตัวตนก่อนเช็คเอาต์", false);
        return;
    }
    const btn = $("#attCheckoutBtn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "กำลังบันทึก...";
    }
    try {
        refreshGpsForAtt();
        await new Promise(r => setTimeout(r, 500));
        const res = await api("/api/attendance/checkout", {
            userId: user.id,
            photo: attState.photoBase64,
            gpsLat: attState.gpsLat,
            gpsLon: attState.gpsLon
        });
        attState.currentRecord = null;
        attState.photoBase64 = null;
        renderAttendanceStatus(null);
        showAttResult("👋 เช็คเอาต์สำเร็จ เวลา " + formatBangkokMobile(res.record.checkOutTime), false);
    } catch (err) {
        showAttResult("❌ " + (err.message || "เกิดข้อผิดพลาด"), true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "🚪 เช็คเอาต์";
        }
    }
}

function showAttResult(msg, isError) {
    const el = $("#attResult");
    if (!el) return;
    el.textContent = msg;
    el.className = "result " + (isError ? "error" : "success");
    el.hidden = false;
    setTimeout(() => {
        el.hidden = true;
    }, 5e3);
}

function formatBangkokMobile(iso) {
    if (!iso) return "—";
    try {
        return new Intl.DateTimeFormat("th-TH", {
            timeZone: "Asia/Bangkok",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            day: "2-digit",
            month: "short"
        }).format(new Date(iso));
    } catch (e) {
        return iso;
    }
}

function escapeHtmlMobile(v) {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadMyAttTasks() {
    const user = currentUser();
    if (!user) return;
    const container = $("#attMyTasks");
    if (!container) return;
    try {
        const res = await api("/api/taskgroups/my?userId=" + encodeURIComponent(user.id), null, "GET");
        const groups = res.groups || [];
        if (!groups.length) {
            container.innerHTML = `<div class="att-no-tasks">ยังไม่มีงานที่ได้รับมอบหมาย</div>`;
            return;
        }
        container.innerHTML = groups.map(g => `\n      <div class="att-my-task-card" style="border-left:4px solid ${g.color || "#2563eb"}">\n        <div class="att-my-task-name">${escapeHtmlMobile(g.name)}</div>\n        <div class="att-my-task-meta">\n          ${g.zone ? "📍 " + escapeHtmlMobile(g.zone) + "  " : ""}${g.type || ""}\n          <span class="att-my-task-team">👥 ${g.assignedUsers.length} คน</span>\n        </div>\n        <button class="att-my-complete-btn" onclick="completeMyTask('${g.id}')">✅ งานเสร็จแล้ว</button>\n      </div>`).join("");
    } catch (e) {
        container.innerHTML = `<div style="font-size:12px;color:red">โหลดไม่ได้: ${escapeHtmlMobile(e.message)}</div>`;
    }
}

async function completeMyTask(groupId) {
    const user = currentUser();
    if (!user || !confirm("ยืนยันว่างานเสร็จสิ้น?")) return;
    try {
        await api("/api/taskgroups/complete", {
            groupId: groupId,
            completedBy: user.name
        });
        showAttResult("✅ รายงานเสร็จงานแล้ว — หัวหน้าได้รับแจ้งเตือนแล้ว", false);
        setTimeout(loadMyAttTasks, 600);
    } catch (err) {
        showAttResult("❌ " + (err.message || "เกิดข้อผิดพลาด"), true);
    }
}

function showConfirmSheet(title, desc, onOk) {
    const sheet = document.getElementById("confirmSheet");
    if (!sheet) {
        onOk();
        return;
    }
    document.getElementById("confirmSheetTitle").textContent = title;
    document.getElementById("confirmSheetDesc").textContent = desc;
    sheet.hidden = false;
    const okBtn = document.getElementById("confirmSheetOk");
    const cancelBtn = document.getElementById("confirmSheetCancel");
    const close = () => {
        sheet.hidden = true;
        okBtn.onclick = null;
        cancelBtn.onclick = null;
    };
    okBtn.onclick = () => {
        close();
        onOk();
    };
    cancelBtn.onclick = close;
    sheet.onclick = e => {
        if (e.target === sheet) close();
    };
}

(function initPickupStepper() {
    const steps = Array.from(document.querySelectorAll("#pickupWorkflowDetails .mwf-step"));
    const stepper = document.getElementById("mwfStepper");
    if (!steps.length || !stepper) return;
    const labels = [ "เช็คอิน", "รายละเอียดสินค้า", "ตรวจ + ถ่ายรูป", "เซ็น + จบงาน" ];
    let cur = 1;
    let booted = false;
    function render() {
        steps.forEach(s => {
            s.hidden = Number(s.dataset.mstep) !== cur;
        });
        stepper.innerHTML = labels.map((l, i) => {
            const n = i + 1;
            const cls = n === cur ? "active" : n < cur ? "done" : "";
            return `<button type="button" class="mwf-dot ${cls}" data-goto="${n}"><span>${n < cur ? "✓" : n}</span><small>${l}</small></button>`;
        }).join("");
        const prev = document.getElementById("mwfPrev");
        const next = document.getElementById("mwfNext");
        if (prev) prev.style.visibility = cur === 1 ? "hidden" : "visible";
        if (next) next.style.display = cur === steps.length ? "none" : "";
        if (booted) stepper.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
        booted = true;
    }
    document.getElementById("mwfPrev")?.addEventListener("click", () => {
        if (cur > 1) {
            cur -= 1;
            render();
        }
    });
    document.getElementById("mwfNext")?.addEventListener("click", () => {
        if (cur < steps.length) {
            cur += 1;
            render();
        }
    });
    stepper.addEventListener("click", e => {
        const b = e.target.closest("[data-goto]");
        if (b) {
            cur = Number(b.dataset.goto);
            render();
        }
    });
    render();
})();

(function initConfirmGates() {
    const gate = (id, title, desc) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        let passed = false;
        btn.addEventListener("click", e => {
            if (passed) {
                passed = false;
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation();
            showConfirmSheet(title, desc, () => {
                passed = true;
                btn.click();
            });
        }, true);
    };
    gate("completePickupBtn", "ยืนยันจบงาน Pickup?", "ระบบจะบันทึกเวลา รูปถ่าย และลายเซ็น แล้วปิดงานนี้ — ตรวจสอบข้อมูลครบก่อนยืนยัน");
    gate("loadCargoBtn", "ยืนยันโหลดสินค้าขึ้นรถ?", "ตรวจสินค้าครบตาม checklist และแปะ Sticker (ถ้าเป็นงานพิเศษ) แล้วใช่ไหม");
})();

var foState = {
    nav: "home",
    attToday: [],
    attAt: 0
};

function foMyRecordToday() {
    const user = currentUser();
    return (foState.attToday || []).find(r => r.userId === user?.id) || null;
}

async function foLoadAttToday(force) {
    if (!force && foState.attToday.length && Date.now() - foState.attAt < 6e4) return;
    try {
        const res = await fetch(`${API_BASE}/api/attendance/today`);
        const data = await res.json();
        foState.attToday = data.records || [];
        foState.attAt = Date.now();
    } catch (e) {}
}

function showMnav(nav) {
    foState.nav = nav;
    document.body.dataset.mnav = nav;
    document.querySelectorAll("#foBottomNav button").forEach(b => b.classList.toggle("active", b.dataset.mnav === nav));
    document.querySelectorAll(".mnav-panel").forEach(pn => {
        pn.hidden = pn.id !== `mnav-${nav}`;
    });
    const workEls = document.querySelectorAll(".hero-card, .action-grid, .mobile-panel");
    workEls.forEach(el => {
        el.style.display = nav === "work" ? "" : "none";
    });
    if (nav === "work") {
        document.querySelectorAll(".mobile-panel").forEach(el => {
            el.style.display = "";
        });
    }
    if (nav === "home") renderMHome();
    if (nav === "map") renderMMap();
    if (nav === "docs") renderMDocs();
    if (nav === "profile") renderMProfile();
    window.scrollTo({
        top: 0
    });
}

function foUntaggedBadge(rec) {
    const tagged = rec && rec.taskGroupId;
    return tagged ? "" : '<span class="fo-badge untagged">ยังไม่ผูกกับงาน</span>';
}

function foJobStatusMeta(job) {
    const status = job?.status || "Pending";
    const map = {
        AllowToTMO: [ "อนุญาตให้เข้าคลังสินค้า", "Allow to TMO", "green" ],
        ReadyToTMO: [ "รอ TMO อนุมัติ", "Ready to TMO", "amber" ],
        PassCPIn: [ "เข้าพื้นที่คลังสินค้า", "Pass CP (In)", "green" ],
        PassInnerCurbIn: [ "อยู่ในพื้นที่คลังสินค้า", "Pass Inner Curb (In)", "green" ],
        PassInnerCurbOut: [ "ออกจากพื้นที่คลังสินค้า", "Pass Inner Curb (Out)", "amber" ],
        PassCPOut: [ "เสร็จสิ้น", "Pass CP (Out)", "blue" ],
        Completed: [ "เสร็จสิ้น", "Completed", "blue" ],
        Billed: [ "เสร็จสิ้น", "Billed", "blue" ],
        Rejected: [ "ล่าช้าเกินกำหนด", "Rejected", "red" ],
        Cancelled: [ "ยกเลิก", "Cancelled", "red" ],
        Hold: [ "รอตรวจสอบ", "Hold", "amber" ],
        Inbound: [ "ตรวจสอบแล้ว", "Inbound", "green" ],
        Pending: [ "รอดำเนินการ", "Pending", "amber" ]
    };
    const meta = map[status] || [ status, status, "amber" ];
    return {
        th: meta[0],
        en: meta[1],
        tone: meta[2]
    };
}

function foDriverJobCard(job, index = 0) {
    const meta = foJobStatusMeta(job);
    const direction = (job.routeType || job.destination || "").toLowerCase().includes("in") ? "ขาเข้า" : "ขาออก";
    const pieces = job.pieceCount || job.totalPieces || "-";
    const weight = job.weight || job.grossWeight || "-";
    const bay = job.locationId || job.slotNo || "-";
    const plate = job.vehiclePlate || currentUser()?.vehiclePlate || "-";
    const flightDate = job.flightTimeLabel || job.flightTime || job.pickupDate || "-";
    const isRejected = [ "Rejected", "Hold" ].includes(job.status);
    const houseToken = encodeURIComponent(job.houseNumber || "");
    return `\n    <article class="ez-driver-job" data-house="${escapeHtmlMobile(job.houseNumber || "")}">\n      <div class="ez-job-strip">\n        <span class="ez-direction">${direction}</span>\n        <div class="ez-job-title">\n          <small>หมายเลขใบขนสินค้า</small>\n          <strong>${escapeHtmlMobile(job.houseNumber || "-")}</strong>\n        </div>\n        <span class="ez-status-pill ${meta.tone}">${escapeHtmlMobile(meta.th)}<em>${escapeHtmlMobile(meta.en)}</em></span>\n      </div>\n      <div class="ez-job-airline">\n        <span>Booking Airline</span>\n        <b>${escapeHtmlMobile(job.flightNo || "TBC")}</b>\n        <small>ตรวจสอบแล้ว</small>\n        <small>ได้รับแล้ว</small>\n      </div>\n      <dl class="ez-job-details">\n        <div><dt>คลังสินค้า</dt><dd>${escapeHtmlMobile(job.terminalDestination || job.destination || "-")}</dd></div>\n        <div><dt>เข้าพื้นที่คลังก่อนเวลา</dt><dd class="${job.redFlag ? "danger" : ""}">${escapeHtmlMobile(flightDate)}</dd></div>\n        <div><dt>Pass CP</dt><dd>${escapeHtmlMobile(formatBangkokMobile(job.updatedAt || job.createdAt || ""))}</dd></div>\n        <div><dt>ทะเบียนรถ</dt><dd>${escapeHtmlMobile(plate)}</dd></div>\n        <div><dt>หมายเลขช่องรับสินค้า</dt><dd>${escapeHtmlMobile(bay)}</dd></div>\n        <div><dt>จำนวนหีบห่อทั้งหมด</dt><dd>${escapeHtmlMobile(String(pieces))}</dd></div>\n        <div><dt>น้ำหนักรวมหีบห่อ</dt><dd>${escapeHtmlMobile(String(weight))}</dd></div>\n        <div><dt>ประเภทสินค้า</dt><dd>${escapeHtmlMobile(job.productType || "-")}</dd></div>\n      </dl>\n      <div class="ez-job-actions">\n        <button type="button" onclick="foFocusDriverJob('${houseToken}')">ดูรายละเอียดงาน</button>\n        ${isRejected ? `<button type="button" class="requeue" onclick="foOpenRequeue('${houseToken}')">รีคิว / Re-Queue</button>` : ""}\n      </div>\n    </article>`;
}

function foFocusDriverJob(houseToken) {
    const houseNumber = decodeURIComponent(houseToken || "");
    const select = $("#driverJobSelect");
    if (select && houseNumber) {
        select.value = houseNumber;
        applyDriverJob(houseNumber);
    }
    showMnav("work");
}

function foOpenRequeue(houseToken) {
    const houseNumber = decodeURIComponent(houseToken || "");
    showMobileActionModal("ยืนยันการรีคิว", `งาน ${houseNumber} ต้องรอ CS/ระบบอนุมัติ Re-Queue ก่อนดำเนินการต่อ`);
}

async function renderMHome() {
    const user = currentUser();
    if (!user) return;
    const nameEl = $("#foUserName");
    if (nameEl) nameEl.textContent = user.name || "-";
    await foLoadAttToday();
    const rec = foMyRecordToday();
    const dayStatus = $("#foDayStatus");
    if (dayStatus) {
        if (!rec) {
            dayStatus.textContent = "พร้อมทำงาน";
            dayStatus.className = "fo-status-chip gray";
        } else if (!rec.checkOutTime) {
            dayStatus.textContent = "กำลังปฏิบัติงาน";
            dayStatus.className = "fo-status-chip green";
        } else {
            dayStatus.textContent = "ออกงานแล้ว";
            dayStatus.className = "fo-status-chip blue";
        }
    }
    const card = $("#foCheckinCard");
    if (card) {
        const gpsIn = rec && rec.checkInLat ? `${Number(rec.checkInLat).toFixed(4)}, ${Number(rec.checkInLon).toFixed(4)}` : "ไม่มีพิกัด";
        const gpsOut = rec && rec.checkOutLat ? `${Number(rec.checkOutLat).toFixed(4)}, ${Number(rec.checkOutLon).toFixed(4)}` : "";
        card.innerHTML = !rec ? `\n      <div class="fo-ci-status"><strong>ยังไม่ได้เช็คอินวันนี้</strong><span>เริ่มงานด้วยการเช็คอิน พร้อมรูปถ่ายและ GPS</span></div>\n      <button type="button" class="fo-primary-btn big" onclick="foGoCheckin()">📸 เช็คอินเริ่มงาน</button>` : `\n      <div class="fo-ci-status">\n        <strong>${rec.checkOutTime ? "จบวันทำงานแล้ว" : "กำลังปฏิบัติงาน"} ${foUntaggedBadge(rec)}</strong>\n        <div class="fo-ci-grid">\n          <div><small>เริ่มงาน</small><b>${formatBangkokMobile(rec.checkInTime).slice(-8, -3) || "-"}</b><span>📍 ${gpsIn}</span></div>\n          <div><small>เลิกงาน</small><b>${rec.checkOutTime ? formatBangkokMobile(rec.checkOutTime).slice(-8, -3) : "—"}</b>${gpsOut ? `<span>📍 ${gpsOut}</span>` : ""}</div>\n        </div>\n      </div>\n      ${!rec.checkOutTime ? `<button type="button" class="fo-primary-btn big outline" onclick="foGoCheckin()">🕔 เช็คเอาท์เลิกงาน</button>` : ""}`;
    }
    const allDriverJobs = visibleDriverJobs();
    const runningJobs = allDriverJobs.filter(j => ![ "Billed", "Completed", "PassCPOut" ].includes(j.status));
    const completedJobs = allDriverJobs.filter(j => [ "Billed", "Completed", "PassCPOut" ].includes(j.status));
    const cancelledJobs = allDriverJobs.filter(j => [ "Cancelled", "Rejected" ].includes(j.status));
    const jobs = runningJobs.filter(j => ![ "Cancelled", "Rejected" ].includes(j.status));
    const next = jobs[0];
    const jc = $("#foNextJobCard");
    if (jc) {
        jc.classList.add("ez-driver-home-card");
        jc.innerHTML = `\n      <div class="ez-summary-head">\n        <div><strong>สรุปคิว</strong><span>ข้อมูลวันนี้ ${formatBangkokMobile((new Date).toISOString())}</span></div>\n        <button type="button" class="ez-refresh-btn" onclick="refresh()">↻ รีเฟรช</button>\n      </div>\n      <div class="ez-summary-tiles">\n        <button type="button" class="active" onclick="showMnav('work')"><span>🚚</span><b>${runningJobs.length}</b><small>กำลังดำเนินการ</small></button>\n        <button type="button" onclick="showMnav('map')"><span>📦</span><b>${completedJobs.length}</b><small>เสร็จสิ้น</small></button>\n        <button type="button" onclick="showMnav('work')"><span>✖</span><b>${cancelledJobs.length}</b><small>ยกเลิก</small></button>\n        <button type="button" onclick="showMnav('work')"><span>▦</span><b>${allDriverJobs.length}</b><small>ทั้งหมด</small></button>\n      </div>\n      <div class="ez-queue-title"><strong>จำนวนคิวทั้งหมด: ${allDriverJobs.length}</strong><span>กำลังดำเนินการ (${runningJobs.length}) · เสร็จสิ้น (${completedJobs.length}) · ยกเลิก (${cancelledJobs.length})</span></div>\n      <div class="ez-driver-tabs" role="tablist">\n        <button type="button" class="active">กำลังดำเนินการ (${runningJobs.length})</button>\n        <button type="button" onclick="showMnav('map')">เสร็จสิ้น (${completedJobs.length})</button>\n        <button type="button" onclick="showMnav('work')">ยกเลิก (${cancelledJobs.length})</button>\n        <button type="button" onclick="showMnav('work')">ทั้งหมด (${allDriverJobs.length})</button>\n      </div>\n      ${next ? foDriverJobCard(next) : `<div class="fo-empty">ไม่มีงานค้างของคนขับคนนี้</div>`}`;
    }
    const tl = $("#foTimeline");
    if (tl) {
        const events = [];
        if (rec?.checkInTime) events.push({
            t: rec.checkInTime,
            label: "เช็คอินเริ่มงาน",
            icon: "🟢"
        });
        visibleDriverJobs().forEach(j => {
            if (j.updatedAt && String(j.updatedAt).slice(0, 10) === (new Date).toISOString().slice(0, 10)) {
                events.push({
                    t: j.updatedAt,
                    label: `${j.houseNumber} · ${j.status}`,
                    icon: "🔵"
                });
            }
        });
        if (rec?.checkOutTime) events.push({
            t: rec.checkOutTime,
            label: "เช็คเอาท์เลิกงาน",
            icon: "⚪"
        });
        events.sort((a, b) => String(a.t).localeCompare(String(b.t)));
        const sub = $("#foTimelineSub");
        if (sub) sub.textContent = `${events.length} เหตุการณ์`;
        tl.innerHTML = events.length ? events.slice(-8).map(e => `\n      <div class="fo-tl-row"><span>${e.icon}</span><b>${formatBangkokMobile(e.t).slice(-8, -3)}</b><em>${e.label}</em></div>`).join("") : `<div class="fo-empty">ยังไม่มีกิจกรรมวันนี้</div>`;
    }
}

function foGoCheckin() {
    showMnav("work");
    showTab("attendance");
}

async function renderMMap(force) {
    await foLoadAttToday(force);
    const map = $("#foMap");
    const list = $("#foMapList");
    if (!map) return;
    const user = currentUser();
    const isAdmin = [ "Admin", "Executive", "WH3_TeamLeader", "Team_Transport" ].includes(user?.role);
    const records = (foState.attToday || []).filter(r => isAdmin || r.userId === user?.id);
    const points = [];
    records.forEach(r => {
        if (r.checkInLat != null && r.checkInLon != null) points.push({
            type: "in",
            lat: +r.checkInLat,
            lon: +r.checkInLon,
            time: r.checkInTime,
            rec: r
        });
        if (r.checkOutLat != null && r.checkOutLon != null) points.push({
            type: "out",
            lat: +r.checkOutLat,
            lon: +r.checkOutLon,
            time: r.checkOutTime,
            rec: r
        });
    });
    const sub = $("#foMapListSub");
    if (sub) sub.textContent = `${points.length} จุด · ${records.length} คน`;
    if (!points.length) {
        map.innerHTML = `<div class="fo-empty" style="padding:40px 16px"><strong>ยังไม่มีพิกัดวันนี้</strong><br><small>เช็คอินเพื่อบันทึกจุดเริ่มต้น</small></div>`;
        if (list) list.innerHTML = "";
        return;
    }
    const minLat = Math.min(...points.map(p => p.lat)), maxLat = Math.max(...points.map(p => p.lat));
    const minLon = Math.min(...points.map(p => p.lon)), maxLon = Math.max(...points.map(p => p.lon));
    const latSpan = Math.max(5e-4, maxLat - minLat), lonSpan = Math.max(5e-4, maxLon - minLon);
    const project = p => ({
        x: 10 + (p.lon - minLon) / lonSpan * 80,
        y: 85 - (p.lat - minLat) / latSpan * 70
    });
    map.innerHTML = `<div class="fo-map-grid"></div>` + points.map((p, i) => {
        const pos = project(p);
        const initials = (p.rec.userName || "?").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
        return `<button type="button" class="fo-map-pin ${p.type} ${p.rec.taskGroupId ? "" : "untagged"}"\n      style="left:${pos.x.toFixed(1)}%;top:${pos.y.toFixed(1)}%" onclick="foOpenMapSheet(${i})">\n      <span>${p.type === "out" ? "OUT" : initials}</span></button>`;
    }).join("");
    foState._mapPoints = points;
    if (list) {
        list.innerHTML = points.map((p, i) => `\n      <button type="button" class="fo-point-row" onclick="foOpenMapSheet(${i})">\n        <span class="ct-att-dot ${p.type === "out" ? "out" : "on"}"></span>\n        <b>${p.rec.userName || "-"}</b>\n        <em>${p.type === "out" ? "สิ้นสุด" : "เริ่มงาน"} ${formatBangkokMobile(p.time).slice(-8, -3)}</em>\n      </button>`).join("");
    }
}

function foOpenMapSheet(idx) {
    const p = (foState._mapPoints || [])[idx];
    if (!p) return;
    const sheet = $("#mapSheet");
    const body = $("#mapSheetBody");
    if (!sheet || !body) return;
    body.innerHTML = `\n    <strong>${p.rec.userName || "-"} ${foUntaggedBadge(p.rec)}</strong>\n    <p>${p.type === "out" ? "จุดสิ้นสุดงาน" : "จุดเริ่มงาน"} · ${formatBangkokMobile(p.time)}</p>\n    <p>📍 ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}${p.rec.zone ? ` · โซน ${p.rec.zone}` : ""}${p.rec.jobType ? ` · ${p.rec.jobType}` : ""}</p>\n    <div class="confirm-sheet-actions">\n      <button type="button" onclick="document.getElementById('mapSheet').hidden=true" style="background:#f1f5f9;border:none;color:#475569">ปิด</button>\n      <button type="button" onclick="window.open('https://maps.google.com/?q=${p.lat},${p.lon}','_blank')" style="background:#0b4ea2;border:none;color:#fff">เปิด Google Maps</button>\n    </div>`;
    sheet.hidden = false;
    sheet.onclick = e => {
        if (e.target === sheet) sheet.hidden = true;
    };
}

function renderMDocs() {
    const sel = $("#foDocJobSelect");
    if (!sel) return;
    const jobs = visibleDriverJobs();
    sel.innerHTML = jobs.length ? jobs.map(j => `<option value="${j.houseNumber}">${j.houseNumber} · ${(j.customerName || "").slice(0, 24)}</option>`).join("") : `<option value="">ไม่มีงานของฉัน</option>`;
}

async function foUploadDocs() {
    const house = $("#foDocJobSelect")?.value;
    const fileType = $("#foDocType")?.value || "FieldPhoto";
    const files = Array.from($("#foDocFile")?.files || []);
    const result = $("#foDocResult");
    if (!house) return alert("เลือกงานก่อน");
    if (!files.length) return alert("เลือกรูป/ไฟล์ก่อน");
    const btn = $("#foDocUploadBtn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "กำลังอัปโหลด...";
    }
    let ok = 0;
    for (const f of files) {
        try {
            const b64 = await new Promise((res, rej) => {
                const r = new FileReader;
                r.onload = e => res(e.target.result);
                r.onerror = rej;
                r.readAsDataURL(f);
            });
            await api("/api/jobs/upload-doc", {
                houseNumber: house,
                fileBase64: b64,
                fileType: fileType,
                mimeType: f.type,
                userId: currentUser()?.id
            });
            ok += 1;
        } catch (e) {}
    }
    if (btn) {
        btn.disabled = false;
        btn.textContent = "📤 อัปโหลดเอกสาร";
    }
    if (result) result.innerHTML = `<span class="${ok === files.length ? "ok" : "warn"}">✅ อัปโหลดสำเร็จ ${ok}/${files.length} ไฟล์ → ${house}</span>`;
    const fileEl = $("#foDocFile");
    if (fileEl) fileEl.value = "";
}

async function renderMProfile() {
    const user = currentUser();
    const card = $("#foProfileCard");
    if (card && user) {
        const initials = (user.name || "?").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
        card.innerHTML = `\n      <div class="fo-avatar">${initials}</div>\n      <div class="fo-profile-info">\n        <strong>${user.name || "-"}</strong>\n        <span>${user.role || "-"}${user.vehiclePlate ? ` · ทะเบียน ${user.vehiclePlate}` : ""}</span>\n        <small>ID: ${user.id}</small>\n      </div>`;
    }
    const hist = $("#foAttHistory");
    if (hist && user) {
        try {
            const res = await fetch(`${API_BASE}/api/attendance/all`);
            const data = await res.json();
            const mine = (data.records || []).filter(r => r.userId === user.id).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 7);
            hist.innerHTML = mine.length ? mine.map(r => `\n        <div class="fo-att-row">\n          <b>${r.date}</b>\n          <span>${formatBangkokMobile(r.checkInTime).slice(-8, -3)} → ${r.checkOutTime ? formatBangkokMobile(r.checkOutTime).slice(-8, -3) : "ทำงานอยู่"}</span>\n          ${r.checkInLat ? `<a href="https://maps.google.com/?q=${r.checkInLat},${r.checkInLon}" target="_blank" rel="noopener">📍</a>` : ""}\n        </div>`).join("") : `<div class="fo-empty">ยังไม่มีประวัติ</div>`;
        } catch (e) {
            hist.innerHTML = `<div class="fo-empty">โหลดไม่สำเร็จ</div>`;
        }
    }
}

/* ══ Smart Scan — สแกนปุ่มเดียว ระบบพาไปขั้นตอนถัดไปให้เอง ══ */
function smartScanShowResult(message) {
    const el = $("#smartScanResult");
    if (el) {
        el.hidden = false;
        el.textContent = message;
    }
}

function smartScanGoTab(tab) {
    if (typeof showMnav === "function" && document.body.dataset.mnav !== "work") showMnav("work");
    showTab(tab);
    setTimeout(() => $(`#tab-${tab}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
}

async function smartScanRoute(house, detail) {
    const allowed = allowedMobileTabs(currentUser()?.role);
    state.scannedPieces = detail?.pieces || [];
    state.scannedMode = detail?.mode || "";
    if (detail?.mode === "dual" && detail.master) state.scannedMasterAwb = detail.master;
    let job = findAnyJob(house);
    if (!job) {
        if (!allowed.includes("inbound")) return toast(`ไม่พบงาน ${house} ในระบบ`);
        const ready = await ensureJobForScan(house, detail);
        if (!ready) return;
        smartScanGoTab("inbound");
        try { unlockInboundWorkflow(ready, "camera"); } catch (error) { return toast(error.message); }
        smartScanShowResult(`🆕 ${ready} — งานใหม่จากการสแกน → พาไปขั้นตอนเข้าโกดัง WH3${detail?.pieceCount ? ` · ${detail.pieceCount} ชิ้น` : ""}`);
        return;
    }
    const st = job.status || "";
    const outboundStatuses = [ "Stored", "ReadyForTerminal", "OutboundPicking", "OutboundLocated", "EIApproved",
        "AOTQueueBooked", "AOTQueueApproved", "GoodsLoaded", "TerminalArrived", "WeightDimensionRecorded",
        "PackingConsolidation", "XRayPassed", "XRayHold", "ReXRayRequired" ];
    const pickupStatuses = [ "Pending", "Assigned", "PickupStarted", "CargoLoaded" ];
    if ((detail?.mode === "dual" || outboundStatuses.includes(st)) && allowed.includes("outbound")) {
        smartScanGoTab("outbound");
        const el = $("#terminalHouse");
        if (el) el.value = job.houseNumber;
        try { unlockOutboundWorkflow(job.houseNumber, "camera"); } catch (error) { return toast(error.message); }
        smartScanShowResult(`✈ ${job.houseNumber} → ขั้นตอนส่งออก Terminal (สถานะ: ${st || "-"})${detail?.mode === "dual" ? " · บาร์คู่ ✓" : ""}`);
        return;
    }
    if (pickupStatuses.includes(st) && allowed.includes("pickup")) {
        smartScanGoTab("pickup");
        const sel = $("#driverJobSelect");
        if (sel) {
            const opt = Array.from(sel.options).find(o => `${o.value} ${o.textContent}`.includes(job.houseNumber));
            if (opt) {
                sel.value = opt.value;
                sel.dispatchEvent(new Event("change"));
            }
        }
        smartScanShowResult(`📦 ${job.houseNumber} → งานรับสินค้า (สถานะ: ${st || "-"})`);
        return;
    }
    if (allowed.includes("inbound")) {
        smartScanGoTab("inbound");
        try { unlockInboundWorkflow(job.houseNumber, "camera"); } catch (error) { return toast(error.message); }
        smartScanShowResult(`🏭 ${job.houseNumber} → ขั้นตอนเข้าโกดัง WH3 (สถานะ: ${st || "-"})`);
        return;
    }
    if (allowed.includes("outbound")) {
        smartScanGoTab("outbound");
        const el = $("#terminalHouse");
        if (el) el.value = job.houseNumber;
        try { unlockOutboundWorkflow(job.houseNumber, "camera"); } catch (error) { return toast(error.message); }
        smartScanShowResult(`✈ ${job.houseNumber} → ขั้นตอนส่งออก Terminal`);
        return;
    }
    toast(`พบงาน ${job.houseNumber} (สถานะ: ${st || "-"})`);
}

(function bindSmartScan() {
    const btn = document.getElementById("smartScanBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        if (typeof openLiveScan !== "function") return toast("ตัวสแกนยังไม่พร้อม — ต่ออินเทอร์เน็ตครั้งแรกก่อน");
        openLiveScan((house, detail) => {
            smartScanRoute(house, detail).catch(error => toast(error.message || "สแกนไม่สำเร็จ"));
        });
    });
})();

(function initFieldOpsNav() {
    const nav = document.getElementById("foBottomNav");
    if (!nav) return;
    nav.addEventListener("click", e => {
        const btn = e.target.closest("[data-mnav]");
        if (btn) showMnav(btn.dataset.mnav);
    });
    document.getElementById("foDocUploadBtn")?.addEventListener("click", foUploadDocs);
    document.getElementById("foLogoutBtn")?.addEventListener("click", () => {
        localStorage.removeItem(MOBILE_AUTH_KEY);
        location.reload();
    });
    setTimeout(() => {
        if (currentUser()) showMnav("home");
    }, 600);
    if (window.lucide?.createIcons) {
        try {
            lucide.createIcons();
        } catch (e) {}
    }
})();
