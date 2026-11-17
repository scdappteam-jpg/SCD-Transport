(() => {
  const TOKEN_KEY = "scdPeopleViewerSession";
  const login = document.getElementById("login");
  const directory = document.getElementById("directory");
  const message = document.getElementById("message");
  const grid = document.getElementById("grid");
  const count = document.getElementById("count");
  const esc = value => String(value || "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);

  function initials(item) {
    return `${item.firstName || ""} ${item.lastName || ""}`.trim().split(/\s+/).map(part => part[0]).join("").slice(-2).toUpperCase() || "SCD";
  }

  function render(items) {
    count.textContent = `${items.length.toLocaleString("th-TH")} คน`;
    grid.innerHTML = items.length ? items.map(item => `
      <article class="person card">
        <div class="photo">${item.photoUrl ? `<img src="${esc(item.photoUrl)}" alt="รูปถ่าย ${esc(item.firstName)} ${esc(item.lastName)}">` : `<div class="initials">${esc(initials(item))}</div>`}</div>
        <strong>${esc(item.firstName || "-")}</strong><span>${esc(item.lastName)}</span>
        ${item.photoUrl ? "" : '<div class="no-photo">ยังไม่มีรูปถ่าย</div>'}
      </article>`).join("") : '<div class="card empty">ไม่พบรายชื่อพนักงาน</div>';
  }

  async function loadDirectory() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    const response = await fetch("/api/people-directory", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) { sessionStorage.removeItem(TOKEN_KEY); return false; }
    const body = await response.json();
    render(body.items || []);
    login.classList.add("hidden"); directory.classList.remove("hidden");
    return true;
  }

  async function signIn() {
    message.textContent = "กำลังตรวจสอบ…";
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: document.getElementById("code").value.trim(), password: document.getElementById("password").value }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { message.textContent = body.error || "เข้าสู่ระบบไม่สำเร็จ"; return; }
    if (body.user?.role !== "People_Viewer") { message.textContent = "บัญชีนี้ไม่ใช่ผู้ดูแลทะเบียนบุคลากร"; return; }
    sessionStorage.setItem(TOKEN_KEY, body.token);
    document.getElementById("password").value = "";
    if (!await loadDirectory()) message.textContent = "ไม่สามารถโหลดทะเบียนบุคลากรได้";
  }

  document.getElementById("loginButton").addEventListener("click", signIn);
  document.getElementById("password").addEventListener("keydown", event => { if (event.key === "Enter") signIn(); });
  document.getElementById("logout").addEventListener("click", () => { sessionStorage.removeItem(TOKEN_KEY); location.reload(); });
  loadDirectory();
})();
