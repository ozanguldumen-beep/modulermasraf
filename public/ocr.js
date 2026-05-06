
function setFieldValue(selectors, value) {
  if (value === undefined || value === null || value === "") return;
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) { el.value = value; return; }
  }
}

function fillSmartReceiptFields(result) {
  if (!result) return;
  setFieldValue(['#company_name','input[name="company_name"]'], result.company_name);
  setFieldValue(['#document_date','input[name="document_date"]'], result.document_date || result.date);
  setFieldValue(['#document_number','input[name="document_number"]'], result.document_number);
  setFieldValue(['#receipt_no','input[name="receipt_no"]'], result.receipt_no);
  setFieldValue(['#subtotal','input[name="subtotal"]'], result.subtotal);
  setFieldValue(['#vat_amount','input[name="vat_amount"]'], result.vat_amount);
  setFieldValue(['#amount','input[name="amount"]'], result.total_amount || result.amount);
  setFieldValue(['#expense_date','input[name="expense_date"]'], result.date || result.document_date);
}

window.runOcrNow = async function(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
  const amountInput = document.querySelector('#amount, input[name="amount"]');
  const dateInput = document.querySelector('#expense_date, input[name="expense_date"]');
  const btn = document.getElementById("ocrBtn");

  const file = fileInput && fileInput.files && fileInput.files[0];

  if (!file) {
    setOcrStatus("Önce fiş/fatura fotoğrafı seçmelisin.");
    setOcrDebug("Dosya bulunamadı.");
    return false;
  }

  try {
    if (btn) btn.disabled = true;
    setOcrStatus("Fiş sunucuya yükleniyor ve Google OCR okunuyor...");
    setOcrDebug("Dosya: " + file.name + " / " + Math.round(file.size / 1024) + " KB");

    const formData = new FormData();
    formData.append("receipt", file);

    const response = await fetch("/api/ocr", {
      method: "POST",
      body: formData
    });

    const raw = await response.text();
    let result;

    try {
      result = JSON.parse(raw);
    } catch (e) {
      setOcrStatus("OCR JSON dönmedi.");
      setOcrDebug(raw.slice(0, 500));
      return false;
    }

    console.log("OCR result:", result);

    if (!response.ok || !result.ok) {
      setOcrStatus("OCR hata: " + (result.error || response.statusText || "Bilinmeyen hata"));
      setOcrDebug(JSON.stringify(result, null, 2));
      return false;
    }

    fillSmartReceiptFields(result);
    if (result.amount && amountInput) amountInput.value = result.amount;
    if (result.date && dateInput) dateInput.value = result.date;

    setOcrStatus(
      "OCR tamamlandı (" + result.provider + "). " +
      (result.amount ? "Tutar: " + result.amount + ". " : "Tutar bulunamadı. ") +
      (result.date ? "Tarih: " + result.date + "." : "Tarih bulunamadı.")
    );

    setOcrDebug("Okunan metin önizleme:\n" + (result.text || "").slice(0, 800));
  } catch (err) {
    console.error("OCR frontend error:", err);
    setOcrStatus("OCR bağlantı hatası: " + err.message);
    setOcrDebug(err.stack || String(err));
  } finally {
    if (btn) btn.disabled = false;
  }

  return false;
};

function setOcrStatus(message) {
  let status = document.getElementById("ocrStatus");
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
  let debug = document.getElementById("ocrDebug");
  if (debug) debug.textContent = message || "";
}

async function checkOcrConfig() {
  try {
    const res = await fetch("/api/ocr-status");
    const data = await res.json();

    console.log("OCR config:", data);

    if (data.provider === "google" && !data.googleKey) {
      setOcrStatus("OCR ayarı eksik: Railway Variables içinde GOOGLE_VISION_API_KEY görünmüyor.");
      setOcrDebug(JSON.stringify(data, null, 2));
    } else if (data.provider === "azure" && (!data.azureEndpoint || !data.azureKey)) {
      setOcrStatus("OCR ayarı eksik: Azure endpoint/key görünmüyor.");
      setOcrDebug(JSON.stringify(data, null, 2));
    } else {
      setOcrStatus("OCR hazır. Fiş seçip “Fişi Oku” butonuna bas.");
      setOcrDebug("OCR ayarı OK: " + data.provider);
    }
  } catch (err) {
    console.warn("OCR status kontrol edilemedi:", err);
    setOcrDebug("OCR status kontrol edilemedi: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("Modüler Masraf OCR v18.2 smart fields yüklendi");

  const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
  let btn = document.getElementById("ocrBtn");

  if (fileInput && !btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "ocrBtn";
    btn.className = "secondary";
    btn.textContent = "Fişi Oku / Tutarı Otomatik Doldur";
    btn.onclick = window.runOcrNow;
    fileInput.parentNode.insertBefore(btn, fileInput.nextSibling);
  } else if (btn) {
    btn.type = "button";
    btn.onclick = window.runOcrNow;
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      setOcrStatus(file ? "Fiş seçildi. OCR için “Fişi Oku” butonuna bas." : "Fiş seçip “Fişi Oku” butonuna bas.");
      setOcrDebug(file ? ("Seçilen dosya: " + file.name) : "");
    });

    checkOcrConfig();
  }
});
