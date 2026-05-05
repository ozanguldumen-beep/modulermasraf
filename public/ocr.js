console.log("Modüler Masraf OCR v10 yüklendi");

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

async function runOcrNow() {
  const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
  const amountInput = document.querySelector('#amount, input[name="amount"]');
  const dateInput = document.querySelector('#expense_date, input[name="expense_date"]');

  const file = fileInput && fileInput.files && fileInput.files[0];

  if (!file) {
    setOcrStatus("Önce fiş/fatura fotoğrafı seçmelisin.");
    return;
  }

  try {
    setOcrStatus("Fiş sunucuya yükleniyor ve OCR okunuyor...");

    const formData = new FormData();
    formData.append("receipt", file);

    const response = await fetch("/api/ocr", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    console.log("OCR result:", result);

    if (!response.ok || !result.ok) {
      setOcrStatus("OCR hata: " + (result.error || response.statusText || "Bilinmeyen hata"));
      return;
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
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.querySelector('#receipt, input[name="receipt"], input[type="file"]');
  if (!fileInput) return;

  let btn = document.getElementById("ocrBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "ocrBtn";
    btn.className = "secondary";
    btn.textContent = "Fişi Oku / Tutarı Otomatik Doldur";
    fileInput.parentNode.insertBefore(btn, fileInput.nextSibling);
  }

  btn.addEventListener("click", runOcrNow);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    setOcrStatus(file ? "Fiş seçildi. OCR için “Fişi Oku” butonuna bas." : "Fiş seçip “Fişi Oku” butonuna bas.");
  });

  setOcrStatus("Fiş seçip “Fişi Oku” butonuna bas.");
});
