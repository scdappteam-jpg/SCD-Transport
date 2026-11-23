(() => {
  const TOKEN_KEY = "scdPeopleViewerSession";
  const MAX_PROFILE_PHOTO_BYTES = 8 * 1024 * 1024;
  const FIXED_POSITIONS = ["พนักงานวัดขนาดสินค้า (Dimension)"];
  const $ = id => document.getElementById(id);
  const esc = value => String(value || "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  let items = [];
  let photoBase64 = "";
  let editorMode = "edit";
  let statusFilter = "all";
  const photoExtension = (url, contentType = "") => {
    const normalizedType = String(contentType || "").toLowerCase();
    if (normalizedType.includes("png")) return "png";
    if (normalizedType.includes("webp")) return "webp";
    if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return "jpg";
    const match = String(url || "").match(/\.(jpe?g|png|webp)(?:[?#]|$)/i);
    return match ? (match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase()) : "jpg";
  };
  const photoFilename = (item, contentType = "") => `SCD-${String(item?.id || "employee").replace(/[^A-Za-z0-9_-]/g, "-")}-profile.${photoExtension(item?.photoUrl, contentType)}`;

  async function exportPhoto(item, messageElement = $("directoryMessage")) {
    if (!item?.photoUrl) return;
    const response = await fetch(item.photoUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("ไม่สามารถดาวน์โหลดรูปได้");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = photoFilename(item, blob.type);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    if (messageElement) messageElement.textContent = `ส่งออกรูป ${item.firstName || ""} ${item.lastName || ""} แล้ว`;
  }

  async function exportAllPeople() {
    const button = $("exportAll");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "กำลังรวมข้อมูลและรูป…";
    $("directoryMessage").textContent = "กำลังสร้าง ZIP อาจใช้เวลาสักครู่ตามจำนวนรูป";
    try {
      const response = await fetch("/api/people-directory/export", { headers: { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}` }, cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "สร้างชุดส่งออกไม่สำเร็จ");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "SCD-People-Generation-Package.zip";
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      $("directoryMessage").textContent = `ส่งออกชุดงาน ${items.length.toLocaleString("th-TH")} รายชื่อแล้ว`;
    } catch (error) {
      $("directoryMessage").textContent = error?.message || "ส่งออกชุดงานไม่สำเร็จ กรุณาลองใหม่";
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}` });
  const initials = item => `${item.firstName || ""} ${item.lastName || ""}`.trim().split(/\s+/).map(part => part[0]).join("").slice(-2).toUpperCase() || "SCD";
  const foldThaiSearch = value => String(value || "").normalize("NFC").toLocaleLowerCase("th-TH").replace(/[\u0e47-\u0e4c]/g, "").replace(/\s+/g, " ").trim();
  const matchesStatus = item => statusFilter === "all" || (statusFilter === "edited" && item.hasBeenEdited) || (statusFilter === "untouched" && !item.hasBeenEdited) || (statusFilter === "photo" && item.photoUrl) || (statusFilter === "no-photo" && !item.photoUrl) || (statusFilter === "reviewed" && item.isReviewed) || (statusFilter === "pending-review" && !item.isReviewed);
  const progressCounts = () => ({ all: items.length, edited: items.filter(item => item.hasBeenEdited).length, untouched: items.filter(item => !item.hasBeenEdited).length, photo: items.filter(item => item.photoUrl).length, "no-photo": items.filter(item => !item.photoUrl).length, reviewed: items.filter(item => item.isReviewed).length, "pending-review": items.filter(item => !item.isReviewed).length });

  function renderKpis() {
    const counts = progressCounts();
    const cards = [["all", "ทั้งหมด"], ["edited", "แก้ไขแล้ว"], ["untouched", "ยังไม่เคยแก้ไข"], ["photo", "มีรูปแล้ว"], ["no-photo", "ยังไม่มีรูป"], ["reviewed", "ตรวจเรียบร้อย"], ["pending-review", "รอตรวจ"]];
    $("kpiGrid").innerHTML = cards.map(([key, label]) => `<button class="kpi-card${statusFilter === key ? " active" : ""}" type="button" data-status="${key}" aria-pressed="${statusFilter === key}"><span class="kpi-value">${counts[key].toLocaleString("th-TH")}</span><span class="kpi-label">${label}</span></button>`).join("");
  }

  function render() {
    const query = foldThaiSearch($("search").value);
    const department = $("department").value;
    const visible = items.filter(item => matchesStatus(item) && (!department || item.department === department) && (!query || foldThaiSearch([item.employeeCode, item.firstName, item.lastName, item.phone, item.nickname, item.position, item.department].join(" ")).includes(query)));
    $("count").textContent = `${visible.length.toLocaleString("th-TH")} จาก ${items.length.toLocaleString("th-TH")} คน`;
    renderKpis();
    $("grid").innerHTML = visible.length ? visible.map(item => `
      <article class="person card">
        <div class="photo">${item.photoUrl ? `<img src="${esc(item.photoUrl)}" alt="รูปถ่าย ${esc(item.firstName)} ${esc(item.lastName)}"><div class="initials photo-fallback hidden">${esc(initials(item))}</div>` : `<div class="initials">${esc(initials(item))}</div>`}</div>
        <strong>${esc(item.firstName || "-")} ${esc(item.lastName)}</strong>
        <span class="meta"><b>${esc(item.employeeCode || item.id)}</b></span>
        <span>${esc(item.nickname ? `ชื่อเล่น ${item.nickname}` : "ยังไม่ระบุชื่อเล่น")}</span>
        <span class="meta">${esc(item.position || "ยังไม่ระบุตำแหน่ง")} · ${esc(item.department || "ไม่ระบุแผนก")}</span>
        <span class="meta">${esc(item.phone || "ยังไม่ระบุเบอร์โทร")}</span>
        <div class="status-row"><span class="status-badge ${item.hasBeenEdited ? "edited" : "untouched"}">${item.hasBeenEdited ? "แก้ไขแล้ว" : "ยังไม่เคยแก้ไข"}</span><span class="status-badge ${item.photoUrl ? "photo-ready" : "photo-missing"}">${item.photoUrl ? "มีรูปแล้ว" : "ยังไม่มีรูป"}</span><span class="status-badge ${item.isReviewed ? "reviewed" : "pending-review"}">${item.isReviewed ? "ตรวจเรียบร้อย" : "รอตรวจ"}</span></div>
        <div class="person-actions"><button class="edit" type="button" data-id="${esc(item.id)}">แก้ไขข้อมูล</button>${item.photoUrl ? `<button class="export" type="button" data-export-id="${esc(item.id)}">ส่งออกรูป</button>` : ""}${item.isReviewed ? `<button class="review done" type="button" disabled>✓ ตรวจแล้ว</button>` : `<button class="review" type="button" data-review-id="${esc(item.id)}">ตรวจเรียบร้อยแล้ว</button>`}</div>
      </article>`).join("") : '<div class="card empty">ไม่พบรายชื่อพนักงาน</div>';
    $("grid").querySelectorAll(".photo img").forEach(image => {
      const showFallback = () => {
        image.classList.add("hidden");
        image.nextElementSibling?.classList.remove("hidden");
      };
      image.addEventListener("error", showFallback, { once: true });
      if (image.complete && image.naturalWidth === 0) showFallback();
    });
  }

  function refreshDepartments() {
    const selected = $("department").value;
    const departments = [...new Set(items.map(item => item.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    $("department").innerHTML = '<option value="">ทุกแผนก</option>' + departments.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
    if (departments.includes(selected)) $("department").value = selected;
  }

  function populateEditorSelect(selectId, values, selectedValue, emptyLabel) {
    const selected = String(selectedValue || "").trim();
    const options = [...new Set([...values.filter(Boolean), selected].filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    $(selectId).innerHTML = `<option value="">${esc(emptyLabel)}</option>` + options.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
    $(selectId).value = selected;
  }

  async function loadDirectory() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    let response;
    try {
      response = await fetch("/api/people-directory", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    } catch (_) {
      $("directoryMessage").textContent = $("message").textContent = "การเชื่อมต่อขัดข้องชั่วคราว กรุณาลองโหลดข้อมูลอีกครั้ง ระบบยังเก็บการเข้าสู่ระบบไว้";
      return false;
    }
    if (response.status === 428) { $("login").classList.add("hidden"); $("changePassword").classList.remove("hidden"); return true; }
    if (!response.ok) {
      if (response.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        $("directory").classList.add("hidden"); $("login").classList.remove("hidden");
      }
      $("directoryMessage").textContent = $("message").textContent = response.status === 401
        ? "การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่"
        : "โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง ระบบยังเก็บการเข้าสู่ระบบไว้";
      return false;
    }
    const body = await response.json();
    items = body.items || [];
    refreshDepartments(); render();
    $("login").classList.add("hidden"); $("changePassword").classList.add("hidden"); $("directory").classList.remove("hidden");
    return true;
  }

  async function signIn() {
    $("message").textContent = "กำลังตรวจสอบ…";
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: $("code").value.trim(), password: $("password").value }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { $("message").textContent = body.error || "เข้าสู่ระบบไม่สำเร็จ"; return; }
    if (body.user?.role !== "People_Viewer") { $("message").textContent = "บัญชีนี้ไม่ใช่ผู้ดูแลทะเบียนบุคลากร"; return; }
    sessionStorage.setItem(TOKEN_KEY, body.token); $("password").value = ""; $("message").textContent = "";
    if (body.user.mustChangePassword) { $("login").classList.add("hidden"); $("changePassword").classList.remove("hidden"); return; }
    if (!await loadDirectory()) $("message").textContent = "ไม่สามารถโหลดทะเบียนบุคลากรได้";
  }

  async function changePassword() {
    const password = $("newPassword").value;
    if (!/^\d{6}$/.test(password)) { $("changeMessage").textContent = "PIN ต้องเป็นตัวเลข 6 หลัก"; return; }
    if (password !== $("confirmPassword").value) { $("changeMessage").textContent = "PIN ทั้งสองช่องไม่ตรงกัน"; return; }
    const response = await fetch("/api/auth/change-password", { method: "POST", headers: authHeaders(), body: JSON.stringify({ password }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { $("changeMessage").textContent = body.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ"; return; }
    $("newPassword").value = $("confirmPassword").value = ""; $("changeMessage").textContent = "";
    await loadDirectory();
  }

  function openEditor(id) {
    const item = items.find(entry => entry.id === id); if (!item) return;
    editorMode = "edit";
    $("editorTitle").textContent = "แก้ไขข้อมูลบุคลากร";
    $("editorSubmit").textContent = "บันทึกข้อมูล";
    $("employeeId").value = item.id || item.employeeId || id;
    $("employeeCodeDisplay").value = item.employeeCode || item.code || item.id || item.employeeId || "";
    for (const field of ["firstName", "lastName", "phone", "nickname"]) $(field).value = item[field] || "";
    populateEditorSelect("position", [...items.map(person => person.position), ...FIXED_POSITIONS], item.position, "เลือกตำแหน่ง");
    populateEditorSelect("editDepartment", items.map(person => person.department), item.department, "เลือกแผนก");
    $("photo").value = ""; photoBase64 = "";
    $("photoPreview").src = item.photoUrl || ""; $("photoPreviewBlock").classList.toggle("hidden", !item.photoUrl); $("downloadPhoto").href = item.photoUrl || "#"; $("downloadPhoto").download = photoFilename(item); $("downloadPhoto").dataset.itemId = item.id || ""; $("editorMessage").textContent = "";
    $("editorModal").classList.remove("hidden");
  }

  function openCreate() {
    editorMode = "create";
    $("editorTitle").textContent = "เพิ่มพนักงานใหม่";
    $("editorSubmit").textContent = "เพิ่มพนักงาน";
    $("employeeId").value = "";
    $("employeeCodeDisplay").value = "ระบบจะกำหนดรหัส SCD ให้อัตโนมัติ";
    for (const field of ["firstName", "lastName", "phone", "nickname"]) $(field).value = "";
    populateEditorSelect("position", [...items.map(person => person.position), ...FIXED_POSITIONS], "", "เลือกตำแหน่ง");
    populateEditorSelect("editDepartment", items.map(person => person.department), "", "เลือกแผนก");
    $("photo").value = ""; photoBase64 = "";
    $("photoPreview").src = ""; $("photoPreviewBlock").classList.add("hidden"); $("downloadPhoto").href = "#"; $("downloadPhoto").dataset.itemId = ""; $("editorMessage").textContent = "ระบบจะสร้างรหัสพนักงาน SCD ให้อัตโนมัติ";
    $("editorModal").classList.remove("hidden");
  }

  function closeEditor() { $("editorModal").classList.add("hidden"); photoBase64 = ""; }

  async function saveEditor(event) {
    event.preventDefault(); $("editorMessage").textContent = editorMode === "create" ? "กำลังเพิ่มพนักงาน…" : "กำลังบันทึก…";
    $("editorSubmit").disabled = true;
    const payload = { employeeId: $("employeeId").value, firstName: $("firstName").value.trim(), lastName: $("lastName").value.trim(), phone: $("phone").value.trim(), nickname: $("nickname").value.trim(), position: $("position").value.trim(), department: $("editDepartment").value.trim(), ...(photoBase64 ? { photoBase64 } : {}) };
    try {
      const endpoint = editorMode === "create" ? "/api/people-directory/create" : "/api/people-directory/update";
      const response = await fetch(endpoint, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { $("editorMessage").textContent = body.error || (editorMode === "create" ? "เพิ่มพนักงานไม่สำเร็จ" : "บันทึกไม่สำเร็จ"); return; }
      if (editorMode === "create") {
        items.push(body.item);
        $("directoryMessage").textContent = `เพิ่ม ${body.item.firstName} ${body.item.lastName || ""} เรียบร้อย · รหัสพนักงาน ${body.item.id}`;
      } else {
        const index = items.findIndex(item => item.id === body.item.id); if (index >= 0) items[index] = body.item;
        $("directoryMessage").textContent = `บันทึกข้อมูล ${body.item.firstName} ${body.item.lastName || ""} เรียบร้อย`;
      }
      refreshDepartments(); render(); closeEditor();
    } finally {
      $("editorSubmit").disabled = false;
    }
  }

  async function markReviewed(id, button) {
    button.disabled = true;
    try {
      const response = await fetch("/api/people-directory/review", { method: "POST", headers: authHeaders(), body: JSON.stringify({ employeeId: id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "ยืนยันการตรวจไม่สำเร็จ");
      const index = items.findIndex(item => item.id === body.item.id);
      if (index >= 0) items[index] = body.item;
      $("directoryMessage").textContent = `ยืนยันว่าตรวจข้อมูล ${body.item.firstName} ${body.item.lastName || ""} เรียบร้อยแล้ว`;
      render();
    } catch (error) {
      $("directoryMessage").textContent = error?.message || "ยืนยันการตรวจไม่สำเร็จ";
      button.disabled = false;
    }
  }

  $("photo").addEventListener("change", () => {
    const file = $("photo").files[0]; if (!file) return;
    if (file.size > MAX_PROFILE_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { $("editorMessage").textContent = "รูปต้องเป็น JPG, PNG หรือ WEBP และไม่เกิน 8 MB"; $("photo").value = ""; return; }
    const reader = new FileReader(); reader.onload = () => { photoBase64 = String(reader.result); $("photoPreview").src = photoBase64; $("photoPreviewBlock").classList.remove("hidden"); $("downloadPhoto").href = photoBase64; $("downloadPhoto").download = `SCD-${$("employeeId").value || "employee"}-preview.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`; $("downloadPhoto").dataset.itemId = ""; $("editorMessage").textContent = "ตรวจรูปในพรีวิวก่อนกดบันทึกข้อมูล"; }; reader.readAsDataURL(file);
  });
  $("loginButton").addEventListener("click", signIn); $("password").addEventListener("keydown", event => { if (event.key === "Enter") signIn(); });
  $("changePasswordButton").addEventListener("click", changePassword); $("search").addEventListener("input", render); $("department").addEventListener("change", render); $("exportAll").addEventListener("click", exportAllPeople); $("addPerson").addEventListener("click", openCreate);
  $("kpiGrid").addEventListener("click", event => { const button = event.target.closest("button[data-status]"); if (!button) return; statusFilter = button.dataset.status; render(); });
  $("grid").addEventListener("click", async event => {
    const reviewButton = event.target.closest("button[data-review-id]");
    if (reviewButton) return markReviewed(reviewButton.dataset.reviewId, reviewButton);
    const editButton = event.target.closest("button[data-id]");
    if (editButton) return openEditor(editButton.dataset.id);
    const exportButton = event.target.closest("button[data-export-id]");
    if (!exportButton) return;
    exportButton.disabled = true;
    try {
      await exportPhoto(items.find(item => item.id === exportButton.dataset.exportId));
    } catch (error) {
      $("directoryMessage").textContent = error?.message || "ส่งออกรูปไม่สำเร็จ กรุณาลองใหม่";
    } finally {
      exportButton.disabled = false;
    }
  });
  $("downloadPhoto").addEventListener("click", async event => {
    event.preventDefault();
    const item = items.find(entry => entry.id === $("downloadPhoto").dataset.itemId);
    if (!item && photoBase64) {
      const temporaryItem = { id: $("employeeId").value || "employee", firstName: $("firstName").value, lastName: $("lastName").value, photoUrl: photoBase64 };
      try { await exportPhoto(temporaryItem, $("editorMessage")); } catch (error) { $("editorMessage").textContent = error?.message || "ส่งออกรูปไม่สำเร็จ กรุณาลองใหม่"; }
      return;
    }
    try { await exportPhoto(item, $("editorMessage")); } catch (error) { $("editorMessage").textContent = error?.message || "ส่งออกรูปไม่สำเร็จ กรุณาลองใหม่"; }
  });
  $("editor").addEventListener("submit", saveEditor); $("closeEditor").addEventListener("click", closeEditor); $("cancelEditor").addEventListener("click", closeEditor);
  function logoutDirectory() {
    sessionStorage.removeItem(TOKEN_KEY);
    for (const key of ["scdTransportWebAuth", "scdTransportWebSession", "scdTransportWebUser"]) localStorage.removeItem(key);
    location.reload();
  }
  $("logout").addEventListener("click", logoutDirectory);
  const mainSystemButton=document.createElement("button");
  mainSystemButton.type="button";mainSystemButton.className="secondary";mainSystemButton.textContent="เปิดระบบหลักด้วยบัญชีนี้";
  $("logout").before(mainSystemButton);
  mainSystemButton.addEventListener("click",async()=>{
    mainSystemButton.disabled=true;
    try {
      const response=await fetch("/api/auth/me",{headers:authHeaders(),cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"ตรวจเซสชันไม่สำเร็จ");
      if(data.user.role!=="Admin")throw new Error(`บัญชีที่เข้าอยู่คือ ${data.user.name} (${data.user.role}) — ต้องเข้าสู่ระบบ Admin เพื่อสร้างบัญชีทดสอบ`);
      if(data.user.mustChangePassword||data.user.mustChangePin)throw new Error("กรุณาตั้ง PIN ใหม่ให้เรียบร้อยก่อนเปิดระบบหลัก");
      localStorage.setItem("scdTransportWebSession",sessionStorage.getItem(TOKEN_KEY)||"");
      localStorage.setItem("scdTransportWebUser",data.user.id);
      localStorage.setItem("scdTransportWebAuth","ok");
      location.href="/legacy/index.html?view=staff";
    } catch(error){$("directoryMessage").textContent=error.message||"เปิดระบบหลักไม่สำเร็จ";mainSystemButton.disabled=false;}
  });
  loadDirectory();
})();
