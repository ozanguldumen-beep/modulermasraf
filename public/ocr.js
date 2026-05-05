console.log("Modüler Masraf OCR v9 yüklendi");

function setOcrStatus(message) {
  let status = document.getElementById("ocrStatus");
  if (!status) {
    status = document.createElement("div");
    status.id = "ocrStatus";
    status.className = "ocr-status";
    const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
    if (fileInput && fileInput.parentNode) {
      fileInput.parentNode.insertBefore(status, fileInput.nextSibling);
    } else {
      document.body.prepend(status);
    }
  }
  status.textContent = message;
}

async function checkOcrConfig() {
  try {
    const res = await fetch("/api/ocr-status");
    const data = await res.json();
    console.log("OCR config:", data);
    if (!data.googleKey && data.provider === "google") {
      setOcrStatus("OCR ayarı eksik: Railway Variables içinde GOOGLE_VISION_API_KEY görünmüyor.");
    }
  } catch (e) {
    console.warn("OCR status kontrol edilemedi:", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
  const amountInput = document.querySelector('#amount, input[name="amount"]');
  const dateInput = document.querySelector('#expense_date, input[name="expense_date"]');

  if (!fileInput) {
    console.log("OCR: fiş input bulunamadı; bu sayfada OCR yok.");
    return;
  }

  setOcrStatus("OCR hazır. Fotoğraf seçince otomatik başlayacak.");
  checkOcrConfig();

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      setOcrStatus("Profesyonel OCR fişi okuyor... Lütfen bekle.");

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
        return;
      }

      if (result.amount && amountInput && !amountInput.value) amountInput.value = result.amount;
      if (result.date && dateInput && !dateInput.value) dateInput.value = result.date;

      setOcrStatus(
        "OCR tamamlandı (" + result.provider + "). " +
        (result.amount ? "Tutar: " + result.amount + ". " : "Tutar bulunamadı. ") +
        (result.date ? "Tarih: " + result.date + "." : "Tarih bulunamadı.")
      );
    } catch (err) {
      console.error("OCR frontend error:", err);
      setOcrStatus("OCR bağlantı hatası: " + err.message);
    }
  });
});
