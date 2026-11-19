(() => {
  const file = document.getElementById("file"), preview = document.getElementById("preview"), apply = document.getElementById("apply"), result = document.getElementById("result");
  let records = null;
  const show = value => { result.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); };
  async function request(previewOnly) {
    const token = localStorage.getItem("scdTransportWebSession");
    if (!token) throw new Error("กรุณาเข้าสู่ระบบด้วย Admin ที่หน้าเว็บหลักก่อน");
    const response = await fetch("/api/people-viewers/provision", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ preview: previewOnly, records }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }
  file.addEventListener("change", async () => { preview.disabled = true; apply.disabled = true; try { const payload = JSON.parse(await file.files[0].text()); records = payload.records; if (!Array.isArray(records) || records.length !== 2) throw new Error("ไฟล์ต้องมี records จำนวน 2 รายการ"); show("พร้อมตรวจสอบบัญชี 2 รายการ"); preview.disabled = false; } catch (error) { records = null; show(`ไฟล์ไม่ถูกต้อง: ${error.message}`); } });
  preview.addEventListener("click", async () => { preview.disabled = true; try { show(await request(true)); apply.disabled = false; } catch (error) { show(`ตรวจสอบไม่ผ่าน: ${error.message}`); } finally { preview.disabled = false; } });
  apply.addEventListener("click", async () => { preview.disabled = true; apply.disabled = true; show("กำลังสร้างบัญชี…"); try { show(await request(false)); } catch (error) { show(`สร้างไม่สำเร็จ: ${error.message}`); apply.disabled = false; } finally { preview.disabled = false; } });
  const additionalCode = document.getElementById("additionalCode"), additionalName = document.getElementById("additionalName"), additionalNickname = document.getElementById("additionalNickname"), additionalPosition = document.getElementById("additionalPosition"), additionalDepartment = document.getElementById("additionalDepartment"), additionalPassword = document.getElementById("additionalPassword"), previewAdditional = document.getElementById("previewAdditional"), applyAdditional = document.getElementById("applyAdditional"), additionalResult = document.getElementById("additionalResult");
  const showAdditional = value => { additionalResult.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); };
  async function requestAdditional(previewOnly) {
    const token = localStorage.getItem("scdTransportWebSession");
    if (!token) throw new Error("กรุณาเข้าสู่ระบบด้วย Admin ที่หน้าเว็บหลักก่อน");
    const record = { code: additionalCode.value.trim(), name: additionalName.value.trim(), nickname: additionalNickname.value.trim(), position: additionalPosition.value.trim(), department: additionalDepartment.value.trim(), temporaryPassword: additionalPassword.value };
    if (!record.code || !record.name || !record.position || !record.department || record.temporaryPassword.length < 6) throw new Error("กรุณากรอกข้อมูลให้ครบและรหัสผ่านอย่างน้อย 6 ตัวอักษร");
    const response = await fetch("/api/people-viewers/provision-additional", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ preview: previewOnly, record }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }
  previewAdditional.addEventListener("click", async () => { applyAdditional.disabled = true; try { showAdditional(await requestAdditional(true)); applyAdditional.disabled = false; } catch (error) { showAdditional(`ตรวจสอบไม่ผ่าน: ${error.message}`); } });
  applyAdditional.addEventListener("click", async () => { applyAdditional.disabled = true; showAdditional("กำลังสร้างบัญชีใหม่…"); try { showAdditional(await requestAdditional(false)); additionalPassword.value = ""; } catch (error) { showAdditional(`สร้างไม่สำเร็จ: ${error.message}`); applyAdditional.disabled = false; } });
  const testName = document.getElementById("testName"), testNickname = document.getElementById("testNickname"), testPassword = document.getElementById("testPassword"), previewTest = document.getElementById("previewTest"), applyTest = document.getElementById("applyTest"), testResult = document.getElementById("testResult");
  const showTest = value => { testResult.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); };
  async function requestTest(previewOnly) {
    const token = localStorage.getItem("scdTransportWebSession");
    if (!token) throw new Error("กรุณาเข้าสู่ระบบด้วย Admin ที่หน้าเว็บหลักก่อน");
    const record = { code: "VIEW999", name: testName.value.trim(), nickname: testNickname.value.trim(), temporaryPassword: testPassword.value };
    if (!record.name || record.temporaryPassword.length < 6) throw new Error("กรุณาระบุชื่อและรหัสผ่านอย่างน้อย 6 ตัวอักษร");
    const response = await fetch("/api/people-viewers/provision-test", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ preview: previewOnly, record }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }
  previewTest.addEventListener("click", async () => { applyTest.disabled = true; try { showTest(await requestTest(true)); applyTest.disabled = false; } catch (error) { showTest(`ตรวจสอบไม่ผ่าน: ${error.message}`); } });
  applyTest.addEventListener("click", async () => { applyTest.disabled = true; showTest("กำลังสร้าง VIEW999…"); try { showTest(await requestTest(false)); testPassword.value = ""; } catch (error) { showTest(`สร้างไม่สำเร็จ: ${error.message}`); applyTest.disabled = false; } });
})();
