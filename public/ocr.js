document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("receipt");
  const amountInput = document.getElementById("amount");
  const dateInput = document.getElementById("expense_date");
  const status = document.getElementById("ocrStatus");

  if (!fileInput || !amountInput) return;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      if (status) status.textContent = "Profesyonel OCR fişi okuyor...";

      const formData = new FormData();
      formData.append("receipt", file);

      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      if (!result.ok) {
        if (status) status.textContent = "OCR hata: " + (result.error || "Bilinmeyen hata");
        return;
      }

      if (result.amount && !amountInput.value) amountInput.value = result.amount;
      if (result.date && dateInput && !dateInput.value) dateInput.value = result.date;

      if (status) {
        status.textContent =
          "OCR tamamlandı (" + result.provider + "). " +
          (result.amount ? "Tutar: " + result.amount + ". " : "Tutar bulunamadı. ") +
          (result.date ? "Tarih: " + result.date + "." : "Tarih bulunamadı.");
      }
    } catch (err) {
      console.error(err);
      if (status) status.textContent = "OCR bağlantı hatası. Tutarı elle yazabilirsin.";
    }
  });
});
