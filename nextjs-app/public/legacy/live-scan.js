/* ══ Live Barcode Scanner กลางของระบบ — ใช้ร่วมทุกหน้า ══
 * เรียกใช้: openLiveScan(function (code) { ... })
 * - อ่านสดจากกล้อง (html5-qrcode ผ่าน CDN) เหมือนเครื่องยิงบาร์โค้ด
 * - ต้องอ่านค่าเดิมซ้ำ 2 เฟรมติดถึงยอมรับ (กันอ่านเพี้ยน)
 * - ตัดส่วนท้าย +XXXX (ลำดับชิ้น) ออกให้อัตโนมัติ code ที่ส่งกลับคือเลข House
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

  function beep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 1400; gain.gain.value = 0.2;
      osc.start(); osc.stop(ctx.currentTime + 0.12);
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

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "liveScanOverlay";
    overlay.setAttribute("style",
      "position:fixed;inset:0;z-index:99999;background:rgba(10,18,32,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;");
    overlay.innerHTML =
      '<div style="width:min(560px,96vw);background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4)">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;background:#0b4ea2;color:#fff;padding:13px 18px">' +
      '    <strong style="font-size:15px">📷 สแกนบาร์โค้ด / QR</strong>' +
      '    <button id="liveScanClose" type="button" style="min-height:36px;padding:6px 14px;border:none;border-radius:9px;background:rgba(255,255,255,.15);color:#fff;font-weight:700;cursor:pointer">ปิด</button>' +
      '  </div>' +
      '  <div id="liveScanView" style="background:#020617;min-height:280px"></div>' +
      '  <p id="liveScanHint" style="margin:0;padding:12px 16px;text-align:center;font-size:13px;color:#475569">กำลังเปิดกล้อง...</p>' +
      "</div>";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeLiveScan(); });
    overlay.querySelector("#liveScanClose").addEventListener("click", closeLiveScan);
  }

  window.openLiveScan = function (onResult) {
    closeLiveScan();
    buildOverlay();
    var candidate = null;
    var hits = 0;
    var locked = false;
    loadLib().then(function (Html5Qrcode) {
      if (!overlay) return;
      scanner = new Html5Qrcode("liveScanView");
      return scanner.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 300, height: 150 } },
        function (decodedText) {
          if (locked) return;
          var code = String(decodedText || "").trim();
          if (code.length < 5) return;
          if (code === candidate) { hits += 1; } else { candidate = code; hits = 1; }
          if (hits < 2) return;
          locked = true;
          beep();
          if (typeof navigator.vibrate === "function") navigator.vibrate(150);
          var house = code.split("+")[0].trim();
          closeLiveScan();
          try { onResult(house, code); } catch (e) { /* ignore */ }
        },
        function () { /* เฟรมที่ยังไม่เจอ */ }
      ).then(function () {
        var hint = document.getElementById("liveScanHint");
        if (hint) hint.textContent = "เล็งให้บาร์โค้ดอยู่ในกรอบ ระบบจะอ่านและปิดให้อัตโนมัติ";
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
