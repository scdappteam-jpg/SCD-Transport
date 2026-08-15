/* ══ Live Barcode Scanner กลางของระบบ — ใช้ร่วมทุกหน้า ══
 * เรียกใช้: openLiveScan(function (house, detail) { ... })
 *   detail = { house, master, mode }  โดย mode = "dual" (Master+House → ส่งออก) หรือ "single" (House เดียว → เข้าโกดัง)
 * พฤติกรรม: สแกนต่อเนื่องในรอบเดียว
 *   - เจอ House (เช่น 484xxxxxxx) และ Master (MAWB 11 หลัก เช่น 724-88587763) → ครบคู่ ปิดอัตโนมัติ
 *   - มีบาร์เดียวก็กด "ใช้เลขนี้" จบได้
 * ความแม่น: ต้องอ่านค่าเดิมซ้ำ 2 เฟรมติด + คัดทิ้งค่าที่มีอักขระแปลกปลอม
 */
(function () {
  var CDN_SRC = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
  var scanner = null;
  var overlay = null;

  function loadLib() {
    return new Promise(function (resolve, reject) {
      if (window.Html5Qrcode) return resolve(window.Html5Qrcode);
      var fail = function () { reject(new Error("โหลดตัวสแกนไม่สำเร็จ (ต้องต่ออินเทอร์เน็ตครั้งแรก)")); };
      var done = function () { window.Html5Qrcode ? resolve(window.Html5Qrcode) : fail(); };
      var existing = document.querySelector('script[src="' + CDN_SRC + '"]');
      if (existing) { existing.addEventListener("load", done); existing.addEventListener("error", fail); return; }
      var s = document.createElement("script");
      s.src = CDN_SRC; s.async = true; s.onload = done; s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  function beep(freq, dur) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq || 1400; gain.gain.value = 0.2;
      osc.start(); osc.stop(ctx.currentTime + (dur || 0.12));
    } catch (e) { /* เสียงเป็นของเสริม */ }
  }

  function closeLiveScan() {
    var current = scanner;
    scanner = null;
    if (current) {
      try { current.stop().then(function () { current.clear(); }).catch(function () {}); } catch (e) { /* ignore */ }
    }
    if (overlay) { overlay.remove(); overlay = null; }
  }

  /* แยกประเภทบาร์โค้ดตามกฎงานจริง:
   * - Master (MAWB): ตัวเลขล้วน >= 11 หลัก (เช่น 72488587763 + เลขเสริมท้าย) → เก็บ 11 หลักแรก
   * - House: อย่างอื่น เช่น 4840791806, F842037622 (ตัดส่วน +XXXX ลำดับชิ้นออก)
   */
  function classify(raw) {
    var parts = String(raw || "").trim().split("+");
    var clean = parts[0].replace(/[^0-9A-Za-z]/g, "");
    var piece = parts.length > 1 ? String(parts[1]).replace(/[^0-9]/g, "") : "";
    if (!clean) return null;
    if (/^\d{11,}$/.test(clean)) {
      return { type: "master", value: clean.slice(0, 11) };
    }
    return { type: "house", value: clean, piece: piece };
  }

  function fmtMaster(m) {
    return m ? m.slice(0, 3) + "-" + m.slice(3) : "";
  }

  window.openLiveScan = function (onResult) {
    closeLiveScan();
    var found = { house: null, master: null, pieces: [] };
    var candidate = null;
    var hits = 0;
    var finished = false;

    overlay = document.createElement("div");
    overlay.id = "liveScanOverlay";
    overlay.setAttribute("style",
      "position:fixed;inset:0;z-index:99999;background:rgba(10,18,32,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;");
    overlay.innerHTML =
      '<div style="width:min(560px,96vw);background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4)">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;background:#0b4ea2;color:#fff;padding:13px 18px">' +
      '    <strong style="font-size:15px">📷 สแกนบาร์โค้ด (เดี่ยว/คู่)</strong>' +
      '    <div style="display:flex;gap:8px">' +
      '      <button id="liveScanTorch" type="button" style="display:none;min-height:36px;padding:6px 14px;border:none;border-radius:9px;background:rgba(255,255,255,.15);color:#fff;font-weight:700;cursor:pointer">🔦 เปิดไฟ</button>' +
      '      <button id="liveScanClose" type="button" style="min-height:36px;padding:6px 14px;border:none;border-radius:9px;background:rgba(255,255,255,.15);color:#fff;font-weight:700;cursor:pointer">ยกเลิก</button>' +
      '    </div>' +
      '  </div>' +
      '  <div id="liveScanView" style="background:#020617;min-height:260px"></div>' +
      '  <div id="lsZoomRow" style="display:none;justify-content:center;gap:8px;padding:10px 16px 0">' +
      '    <button type="button" data-zoom="1" style="min-height:38px;padding:6px 18px;border:1.5px solid #cbd5e1;border-radius:999px;background:#fff;font-weight:800;font-size:13px;cursor:pointer">1x</button>' +
      '    <button type="button" data-zoom="2" style="min-height:38px;padding:6px 18px;border:1.5px solid #cbd5e1;border-radius:999px;background:#fff;font-weight:800;font-size:13px;cursor:pointer">2x</button>' +
      '    <button type="button" data-zoom="3" style="min-height:38px;padding:6px 18px;border:1.5px solid #cbd5e1;border-radius:999px;background:#fff;font-weight:800;font-size:13px;cursor:pointer">3x</button>' +
      '  </div>' +
      '  <div style="display:flex;gap:8px;padding:12px 16px 4px">' +
      '    <div id="lsHouseChip" style="flex:1;padding:9px 12px;border-radius:11px;background:#f1f5f9;border:1.5px dashed #cbd5e1;font-size:12.5px;font-weight:700;color:#94a3b8;text-align:center">House: รอสแกน...</div>' +
      '    <div id="lsMasterChip" style="flex:1;padding:9px 12px;border-radius:11px;background:#f1f5f9;border:1.5px dashed #cbd5e1;font-size:12.5px;font-weight:700;color:#94a3b8;text-align:center">Master: รอสแกน...</div>' +
      '  </div>' +
      '  <p id="liveScanHint" style="margin:0;padding:8px 16px;text-align:center;font-size:12.5px;color:#475569">กำลังเปิดกล้อง...</p>' +
      '  <div style="padding:0 16px 16px">' +
      '    <button id="liveScanDone" type="button" disabled style="width:100%;min-height:48px;border:none;border-radius:13px;background:#e2e8f0;color:#94a3b8;font-size:15px;font-weight:800;cursor:pointer">ใช้เลขที่สแกนได้</button>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(overlay);

    function updateChips() {
      var h = document.getElementById("lsHouseChip");
      var m = document.getElementById("lsMasterChip");
      var done = document.getElementById("liveScanDone");
      if (h && found.house) {
        h.textContent = "House: " + found.house + (found.pieces.length ? " · " + found.pieces.length + " ชิ้น (" + found.pieces.map(function (x) { return "+" + x; }).join(",") + ")" : "");
        h.setAttribute("style", h.getAttribute("style").replace("#f1f5f9", "#dcfce7").replace("dashed #cbd5e1", "solid #86efac").replace("#94a3b8", "#15803d"));
      }
      if (m && found.master) {
        m.textContent = "Master: " + fmtMaster(found.master);
        m.setAttribute("style", m.getAttribute("style").replace("#f1f5f9", "#dbeafe").replace("dashed #cbd5e1", "solid #93c5fd").replace("#94a3b8", "#1d4ed8"));
      }
      if (done && (found.house || found.master)) {
        done.disabled = false;
        done.setAttribute("style", done.getAttribute("style").replace("#e2e8f0", "#0b4ea2").replace("color:#94a3b8", "color:#fff"));
      }
      if (done && (found.house || found.master)) {
        done.textContent = "เสร็จสิ้น" + (found.pieces.length ? " (" + found.pieces.length + " ชิ้น)" : " — ใช้เลขที่สแกนได้");
      }
      var hint = document.getElementById("liveScanHint");
      if (hint) {
        if (found.house && found.master) hint.textContent = "ครบคู่ Master+House (ส่งออก) — ยิงชิ้นถัดไปต่อได้ หรือกดเสร็จสิ้น";
        else if (found.house) hint.textContent = "ได้ House แล้ว — ยิงชิ้นถัดไป (+xxxx) ต่อเพื่อตรวจยอด หรือกดเสร็จสิ้น (บาร์เดี่ยว = เข้าโกดัง)";
        else if (found.master) hint.textContent = "ได้ Master แล้ว — สแกนบาร์ House (484...) ต่อ";
      }
    }

    function finish() {
      if (finished) return;
      finished = true;
      var detail = {
        house: found.house || "",
        master: found.master ? fmtMaster(found.master) : "",
        mode: found.house && found.master ? "dual" : "single",
        pieces: found.pieces.slice(),
        pieceCount: found.pieces.length
      };
      beep(1800, 0.18);
      if (typeof navigator.vibrate === "function") navigator.vibrate([120, 60, 120]);
      closeLiveScan();
      try { onResult(detail.house || detail.master, detail); } catch (e) { /* ignore */ }
    }

    var torchOn = false;
    function setupTorch() {
      var btn = document.getElementById("liveScanTorch");
      if (!btn || !overlay) return;
      var video = overlay.querySelector("#liveScanView video");
      var stream = video && video.srcObject;
      var track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
      var caps = track && track.getCapabilities ? track.getCapabilities() : null;

      /* ── ซูม: แก้อาการ iPhone โฟกัสวืดเข้า-ออก (ถือห่างขึ้นแล้วซูมแทน) ── */
      var zoomRow = document.getElementById("lsZoomRow");
      if (zoomRow && caps && caps.zoom && track) {
        var minZ = caps.zoom.min || 1;
        var maxZ = caps.zoom.max || 3;
        var applyZoom = function (z, activeBtn) {
          var target = Math.max(minZ, Math.min(maxZ, z));
          track.applyConstraints({ advanced: [{ zoom: target }] }).then(function () {
            zoomRow.querySelectorAll("button").forEach(function (b) {
              b.style.background = "#fff"; b.style.borderColor = "#cbd5e1"; b.style.color = "#0f172a";
            });
            if (activeBtn) {
              activeBtn.style.background = "#0b4ea2"; activeBtn.style.borderColor = "#0b4ea2"; activeBtn.style.color = "#fff";
            }
          }).catch(function () { /* บางเครื่องไม่ให้ซูมผ่านเว็บ */ });
        };
        zoomRow.style.display = "flex";
        zoomRow.querySelectorAll("button").forEach(function (b) {
          b.onclick = function () { applyZoom(Number(b.dataset.zoom), b); };
        });
        /* เริ่มต้น 2x อัตโนมัติ — ระยะถือ ~20-30 ซม. โฟกัสนิ่งพอดี */
        var defaultBtn = zoomRow.querySelector('[data-zoom="2"]');
        applyZoom(2, defaultBtn);
        var hintEl = document.getElementById("liveScanHint");
        if (hintEl) hintEl.textContent = "ถือห่างบาร์โค้ด ~20-30 ซม. (ซูม 2x ให้แล้ว) — ภาพเบลอให้ถอยออก อย่าจ่อใกล้";
      }

      /* ── ไฟฉาย ── */
      if (!caps || !caps.torch) { btn.style.display = "none"; return; }
      btn.style.display = "";
      btn.onclick = function () {
        torchOn = !torchOn;
        track.applyConstraints({ advanced: [{ torch: torchOn }] }).then(function () {
          btn.textContent = torchOn ? "🔦 ปิดไฟ" : "🔦 เปิดไฟ";
          btn.style.background = torchOn ? "#f59e0b" : "rgba(255,255,255,.15)";
        }).catch(function () {
          torchOn = false;
          btn.style.display = "none";
        });
      };
    }

    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeLiveScan(); });
    overlay.querySelector("#liveScanClose").addEventListener("click", closeLiveScan);
    overlay.querySelector("#liveScanDone").addEventListener("click", finish);

    loadLib().then(function (Html5Qrcode) {
      if (!overlay) return;
      scanner = new Html5Qrcode("liveScanView");
      return scanner.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 300, height: 150 }, videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } },
        function (decodedText) {
          if (finished) return;
          var code = String(decodedText || "").trim();
          if (code.length < 5) return;
          if (!/^[0-9A-Za-z+\-\s]+$/.test(code)) return; /* คัดทิ้งค่าเพี้ยนที่มีอักขระแปลก */
          if (code === candidate) { hits += 1; } else { candidate = code; hits = 1; }
          if (hits < 2) return;
          candidate = null; hits = 0;
          var item = classify(code);
          if (!item) return;
          var hint = document.getElementById("liveScanHint");
          if (item.type === "house") {
            if (found.house && found.house !== item.value) {
              beep(500, 0.2); /* เสียงต่ำ = คนละ House */
              if (hint) { hint.textContent = "⚠ " + item.value + " เป็นคนละ House กับที่สแกนอยู่ (" + found.house + ") — ข้ามให้แล้ว"; }
              return;
            }
            found.house = item.value;
            if (item.piece) {
              if (found.pieces.indexOf(item.piece) >= 0) {
                beep(500, 0.2);
                if (hint) { hint.textContent = "⚠ ชิ้น +" + item.piece + " สแกนซ้ำ — ข้ามให้แล้ว"; }
                return;
              }
              found.pieces.push(item.piece);
            }
            beep(1400);
          } else {
            if (found.master === item.value) return;
            found.master = item.value;
            beep(1000);
          }
          if (typeof navigator.vibrate === "function") navigator.vibrate(100);
          updateChips();
        },
        function () { /* เฟรมที่ยังไม่เจอ */ }
      ).then(function () {
        var hint = document.getElementById("liveScanHint");
        if (hint) hint.textContent = "เล็งทีละบาร์ — บาร์เดี่ยว (484...) = เข้าโกดัง · บาร์คู่ Master+House = ส่งออก";
        setTimeout(setupTorch, 400); /* รอ video ต่อ stream ก่อน */
      });
    }).catch(function (err) {
      var hint = document.getElementById("liveScanHint");
      if (hint) {
        hint.textContent = (err && err.message ? err.message : "เปิดกล้องไม่สำเร็จ") + " — ตรวจว่าอนุญาตกล้องแล้ว";
        hint.style.color = "#dc2626";
      }
    });
  };

  window.closeLiveScan = closeLiveScan;
})();
