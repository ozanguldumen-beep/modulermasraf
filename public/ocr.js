
(function(){
  console.log("Modüler Masraf OCR v18.4 google restore yüklendi");

  function byId(id){ return document.getElementById(id); }

  function setFieldValue(selectors, value) {
    if (value === undefined || value === null || value === "") return;
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
  }

  function setOcrStatus(message) {
    let status = byId("ocrStatus");
    if (!status) {
      status = document.createElement("div");
      status.id = "ocrStatus";
      status.className = "ocr-status";
      const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
      if (fileInput && fileInput.parentNode) fileInput.parentNode.insertBefore(status, fileInput.nextSibling);
    }
    if (status) status.textContent = message;
  }

  function setOcrDebug(message) {
    let debug = byId("ocrDebug");
    if (!debug) {
      debug = document.createElement("div");
      debug.id = "ocrDebug";
      debug.className = "ocr-debug";
      const status = byId("ocrStatus");
      if (status && status.parentNode) status.parentNode.insertBefore(debug, status.nextSibling);
    }
    if (debug) debug.textContent = message || "";
  }

  function normalizeDateForInput(value) {
    if (!value) return "";
    const s = String(value).trim();
    // dd.mm.yyyy veya dd/mm/yyyy -> yyyy-mm-dd
    const m = s.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    // yyyy-mm-dd zaten uygunsa
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s;
  }

  function fillSmartReceiptFields(result) {
    if (!result) return;

    const documentDate = normalizeDateForInput(result.document_date || result.date || result.expense_date);
    const totalAmount = result.total_amount || result.amount || "";

    setFieldValue(['#company_name','input[name="company_name"]'], result.company_name);
    setFieldValue(['#document_date','input[name="document_date"]'], documentDate);
    setFieldValue(['#document_number','input[name="document_number"]'], result.document_number);
    setFieldValue(['#receipt_no','input[name="receipt_no"]'], result.receipt_no);
    setFieldValue(['#subtotal','input[name="subtotal"]'], result.subtotal);
    setFieldValue(['#vat_amount','input[name="vat_amount"]'], result.vat_amount);
    setFieldValue(['#amount','input[name="amount"]'], totalAmount);
    setFieldValue(['#expense_date','input[name="expense_date"]'], normalizeDateForInput(result.date || result.document_date || result.expense_date));
  }

  async function runOcrNow(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
    const btn = byId("ocrBtn");
    const file = fileInput && fileInput.files && fileInput.files[0];

    if (!file) {
      setOcrStatus("Önce fiş/fatura fotoğrafı seçmelisin.");
      setOcrDebug("Dosya bulunamadı. Input name/id: receipt olmalı.");
      return false;
    }

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "OCR okunuyor...";
      }

      setOcrStatus("Fiş sunucuya yükleniyor ve Google OCR okunuyor...");
      setOcrDebug("Dosya: " + file.name + " / " + Math.round(file.size / 1024) + " KB");

      const formData = new FormData();
      formData.append("receipt", file);

      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
        credentials: "same-origin"
      });

      const raw = await response.text();
      let result;
      try {
        result = JSON.parse(raw);
      } catch (e) {
        setOcrStatus("OCR JSON dönmedi. Muhtemelen login sayfası veya server hata HTML'i döndü.");
        setOcrDebug(raw.slice(0, 1200));
        return false;
      }

      console.log("OCR result:", result);

      if (!response.ok || !result.ok) {
        setOcrStatus("OCR hata: " + (result.error || response.statusText || "Bilinmeyen hata"));
        setOcrDebug(JSON.stringify(result, null, 2));
        return false;
      }

      fillSmartReceiptFields(result);

      const amountText = result.total_amount || result.amount || "-";
      const dateText = result.document_date || result.date || "-";

      setOcrStatus("OCR tamamlandı (" + (result.provider || "google") + "). Tutar: " + amountText + ". Tarih: " + dateText + ". Metin uzunluğu: " + (result.textLength || 0));
      setOcrDebug("Okunan metin önizleme:\n" + (result.text || "").slice(0, 2500));
    } catch (err) {
      console.error("OCR frontend error:", err);
      setOcrStatus("OCR bağlantı hatası: " + err.message);
      setOcrDebug(err.stack || String(err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Fişi Oku / Tutarı Otomatik Doldur";
      }
    }

    return false;
  }

  window.runOcrNow = runOcrNow;

  function bindOcrButton() {
    const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
    let btn = byId("ocrBtn");

    if (fileInput && !btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "ocrBtn";
      btn.className = "secondary";
      btn.textContent = "Fişi Oku / Tutarı Otomatik Doldur";
      fileInput.insertAdjacentElement("afterend", btn);
    }

    if (btn) {
      btn.type = "button";
      btn.removeAttribute("onclick");
      btn.addEventListener("click", runOcrNow);
      console.log("OCR butonu bağlandı");
    } else {
      console.warn("OCR butonu bulunamadı");
    }

    if (fileInput) {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        setOcrStatus(file ? "Fiş seçildi. OCR için “Fişi Oku” butonuna bas." : "Fiş seçip “Fişi Oku” butonuna bas.");
        setOcrDebug(file ? ("Seçilen dosya: " + file.name) : "");
      });
      setOcrStatus("OCR hazır. Fiş seçip “Fişi Oku” butonuna bas.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindOcrButton);
  } else {
    bindOcrButton();
  }
})();
