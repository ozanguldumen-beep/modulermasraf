console.log("Modüler Masraf OCR v11 yüklendi");

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

async function runOcrNow(event) {
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
    return false;
  }

  try {
    if (btn) btn.disabled = true;
    setOcrStatus("Fiş sunucuya yükleniyor ve OCR okunuyor...");

    const formData = new FormData();
    formData.append("receipt", file);

    const response = await fetch("/api/ocr", {
      method: "POST",
      body: formData
    });

    let result;
    try {
      result = await response.json();
    } catch (e) {
      const raw = await response.text();
      throw new Error("OCR JSON dönmedi: " + raw.slice(0, 200));
    }

    console.log("OCR result:", result);

    if (!response.ok || !result.ok) {
      setOcrStatus("OCR hata: " + (result.error || response.statusText || "Bilinmeyen hata"));
      return false;
    }

    if (result.amount && amountInput) amountInput.value = result.amount;
    if (result.date && dateInput) dateInput.value = result.date;

    setOcrStatus(
      "OCR tamamlandı (" + result.provider + "). " +
      (result.amount ? "Tutar: " + result.amount + ". " : "Tutar bulunamadı. ") +
      (result.date ? "Tarih: " + result.date + "." : "Tarih bulunamadı.")
    );
  } catch (err) {
    console.error("OCR frontend error:", err);
    setOcrStatus("OCR bağlantı hatası: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }

  return false;
}

window.runOcrNow = runOcrNow;

document.addEventListener("DOMContentLoaded", async () => {
  const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
  const btn = document.getElementById("ocrBtn");

  if (!fileInput) {
    console.log("OCR: bu sayfada fiş alanı yok.");
    return;
  }

  if (btn) {
    btn.type = "button";
    btn.onclick = runOcrNow;
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    setOcrStatus(file ? "Fiş seçildi. OCR için “Fişi Oku” butonuna bas." : "Fiş seçip “Fişi Oku” butonuna bas.");
  });

  setOcrStatus("Fiş seçip “Fişi Oku” butonuna bas.");

  // OCR config check
  try {
    const res = await fetch("/api/ocr-status");
    const data = await res.json();
    console.log("OCR config:", data);
    if (data.provider === "google" && !data.googleKey) {
      setOcrStatus("OCR ayarı eksik: Railway Variables içinde GOOGLE_VISION_API_KEY görünmüyor.");
    }
  } catch (e) {
    console.warn("OCR status kontrol edilemedi:", e);
  }
});
