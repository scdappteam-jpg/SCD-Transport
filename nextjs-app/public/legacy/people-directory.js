(() => {
  const TOKEN_KEY = "scdPeopleViewerSession";
  const MAX_PROFILE_PHOTO_BYTES = 8 * 1024 * 1024;
  const FIXED_POSITIONS = ["วัดไดแมนชั่น"];
  const $ = id => document.getElementById(id);
  const esc = value => String(value || "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  let items = [];
  let photoBase64 = "";
  let editorMode = "edit";
  const photoFilename = item => `SCD-${String(item?.id || "employee").replace(/[^A-Za-z0-9_-]/g, "-")}-profile.jpg`;

  const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}` });
  const initials = item => `${item.firstName || ""} ${item.lastName || ""}`.trim().split(/\s+/).map(part => part[0]).join("").slice(-2).toUpperCase() || "SCD";

  function render() {
    const query = $("search").value.trim().toLocaleLowerCase("th-TH");
    const department = $("department").value;
    const visible = items.filter(item => (!department || item.department === department) && (!query || [item.firstName, item.lastName, item.phone, item.nickname, item.position].join(" ").toLocaleLowerCase("th-TH").includes(query)));
    $("count").textContent = `${visible.length.toLocaleString("th-TH")} จาก ${items.length.toLocaleString("th-TH")} คน`;
    $("grid").innerHTML = visible.length ? visible.map(item => `
      <article class="person card">
        <div class="photo">${item.photoUrl ? `<img src="${esc(item.photoUrl)}" alt="รูปถ่าย ${esc(item.firstName)} ${esc(item.lastName)}">` : `<div class="initials">${esc(initials(item))}</div>`}</div>
        <strong>${esc(item.firstName || "-")} ${esc(item.lastName)}</strong>
        <span>${esc(item.nickname ? `ชื่อเล่น ${item.nickname}` : "ยังไม่ระบุชื่อเล่น")}</span>
        <span class="meta">${esc(item.position || "ยังไม่ระบุตำแหน่ง")} · ${esc(item.department || "ไม่ระบุแผนก")}</span>
        <span class="meta">${esc(item.phone || "ยังไม่ระบุเบอร์โทร")}</span>
        ${item.photoUrl ? "" : '<div class="no-photo">ยังไม่มีรูปถ่าย</div>'}
        <div class="person-actions"><button class="edit" type="button" data-id="${esc(item.id)}">แก้ไขข้อมูล</button>${item.photoUrl ? `<a class="export" href="${esc(item.photoUrl)}" download="${esc(photoFilename(item))}">ส่งออกรูป</a>` : ""}</div>
      </article>`).join("") : '<div class="card empty">ไม่พบรายชื่อพนักงาน</div>';
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
    const response = await fetch("/api/people-directory", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (response.status === 428) { $("login").classList.add("hidden"); $("changePassword").classList.remove("hidden"); return true; }
    if (!response.ok) { sessionStorage.removeItem(TOKEN_KEY); return false; }
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
    if (password.length < 6) { $("changeMessage").textContent = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"; return; }
    if (password !== $("confirmPassword").value) { $("changeMessage").textContent = "รหัสผ่านทั้งสองช่องไม่ตรงกัน"; return; }
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
    for (const field of ["firstName", "lastName", "phone", "nickname"]) $(field).value = item[field] || "";
    populateEditorSelect("position", [...items.map(person => person.position), ...FIXED_POSITIONS], item.position, "เลือกตำแหน่ง");
    populateEditorSelect("editDepartment", items.map(person => person.department), item.department, "เลือกแผนก");
    $("photo").value = ""; photoBase64 = "";
    $("photoPreview").src = item.photoUrl || ""; $("photoPreviewBlock").classList.toggle("hidden", !item.photoUrl); $("downloadPhoto").href = item.photoUrl || "#"; $("downloadPhoto").download = photoFilename(item); $("editorMessage").textContent = "";
    $("editorModal").classList.remove("hidden");
  }

  function openCreate() {
    editorMode = "create";
    $("editorTitle").textContent = "เพิ่มพนักงานใหม่";
    $("editorSubmit").textContent = "เพิ่มพนักงาน";
    $("employeeId").value = "";
    for (const field of ["firstName", "lastName", "phone", "nickname"]) $(field).value = "";
    populateEditorSelect("position", [...items.map(person => person.position), ...FIXED_POSITIONS], "", "เลือกตำแหน่ง");
    populateEditorSelect("editDepartment", items.map(person => person.department), "", "เลือกแผนก");
    $("photo").value = ""; photoBase64 = "";
    $("photoPreview").src = ""; $("photoPreviewBlock").classList.add("hidden"); $("downloadPhoto").href = "#"; $("editorMessage").textContent = "ระบบจะสร้างรหัสพนักงาน EMP ให้อัตโนมัติ";
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

  $("photo").addEventListener("change", () => {
    const file = $("photo").files[0]; if (!file) return;
    if (file.size > MAX_PROFILE_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { $("editorMessage").textContent = "รูปต้องเป็น JPG, PNG หรือ WEBP และไม่เกิน 8 MB"; $("photo").value = ""; return; }
    const reader = new FileReader(); reader.onload = () => { photoBase64 = String(reader.result); $("photoPreview").src = photoBase64; $("photoPreviewBlock").classList.remove("hidden"); $("downloadPhoto").href = photoBase64; $("downloadPhoto").download = `SCD-${$("employeeId").value || "employee"}-preview.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`; $("editorMessage").textContent = "ตรวจรูปในพรีวิวก่อนกดบันทึกข้อมูล"; }; reader.readAsDataURL(file);
  });
  $("loginButton").addEventListener("click", signIn); $("password").addEventListener("keydown", event => { if (event.key === "Enter") signIn(); });
  $("changePasswordButton").addEventListener("click", changePassword); $("search").addEventListener("input", render); $("department").addEventListener("change", render); $("addPerson").addEventListener("click", openCreate);
  $("grid").addEventListener("click", event => { const button = event.target.closest("button[data-id]"); if (button) openEditor(button.dataset.id); });
  $("editor").addEventListener("submit", saveEditor); $("closeEditor").addEventListener("click", closeEditor); $("cancelEditor").addEventListener("click", closeEditor);
  $("logout").addEventListener("click", () => { sessionStorage.removeItem(TOKEN_KEY); location.reload(); });
  loadDirectory();
})();
