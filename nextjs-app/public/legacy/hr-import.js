(() => {
  const file = document.getElementById("file");
  const preview = document.getElementById("preview");
  const apply = document.getElementById("apply");
  const result = document.getElementById("result");
  let records = null;

  function show(value) {
    result.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  async function request(previewOnly) {
    const token = localStorage.getItem("scdTransportWebSession");
    if (!token) throw new Error("กรุณาเข้าสู่ระบบด้วย Admin ที่หน้าเว็บหลักก่อน");
    const response = await fetch("/api/hr/bulk-import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ preview: previewOnly, records }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  file.addEventListener("change", async () => {
    preview.disabled = true;
    apply.disabled = true;
    try {
      const payload = JSON.parse(await file.files[0].text());
      records = payload.records;
      if (!Array.isArray(records) || !records.length) throw new Error("ไฟล์ไม่มี records");
      show(`พร้อมตรวจสอบ ${records.length} รายการ`);
      preview.disabled = false;
    } catch (error) {
      records = null;
      show(`ไฟล์ไม่ถูกต้อง: ${error.message}`);
    }
  });

  preview.addEventListener("click", async () => {
    preview.disabled = true;
    try {
      const body = await request(true);
      show(body);
      apply.disabled = false;
    } catch (error) { show(`ตรวจสอบไม่ผ่าน: ${error.message}`); }
    finally { preview.disabled = false; }
  });

  apply.addEventListener("click", async () => {
    preview.disabled = true;
    apply.disabled = true;
    show("กำลังนำเข้าข้อมูล กรุณาอย่าปิดหน้านี้…");
    try { show(await request(false)); }
    catch (error) { show(`นำเข้าไม่สำเร็จ: ${error.message}`); apply.disabled = false; }
    finally { preview.disabled = false; }
  });
})();


