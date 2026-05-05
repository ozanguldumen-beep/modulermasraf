document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("receipt");
  const amountInput = document.getElementById("amount");
  const dateInput = document.getElementById("expense_date");
  const status = document.getElementById("ocrStatus");

  if (!fileInput || !amountInput) return;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (!window.Tesseract) {
      if (status) status.textContent = "OCR kütüphanesi yüklenemedi. Tutarı elle yazabilirsin.";
      return;
    }

    try {
      if (status) status.textContent = "Fiş okunuyor... İlk okumada biraz sürebilir.";

      const result = await Tesseract.recognize(file, "tur+eng", {
        logger: m => {
          if (status && m.status === "recognizing text") {
            status.textContent = "Fiş okunuyor: %" + Math.round((m.progress || 0) * 100);
          }
        }
      });

      const text = (result && result.data && result.data.text) ? result.data.text : "";
      const amount = extractAmount(text);
      const date = extractDate(text);

      if (amount && !amountInput.value) amountInput.value = normalizeAmount(amount);
      if (date && dateInput && !dateInput.value) dateInput.value = date;

      if (status) {
        status.textContent = "OCR tamamlandı. " +
          (amount ? "Tutar bulundu: " + normalizeAmount(amount) + ". " : "Tutar bulunamadı. ") +
          (date ? "Tarih bulundu: " + date + "." : "Tarih bulunamadı.");
      }
    } catch (err) {
      console.error(err);
      if (status) status.textContent = "OCR hata verdi. Tutarı elle yazabilirsin.";
    }
  });
});

function extractAmount(text) {
  if (!text) return null;
  const cleaned = text.replace(/\s/g, " ");

  const priorityRegex = /(TOPLAM|TOTAL|GENEL TOPLAM|TUTAR|ÖDENECEK|ODENECEK|KREDI|KREDİ)[^\d]{0,35}(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/i;
  const priorityMatch = cleaned.match(priorityRegex);
  if (priorityMatch && priorityMatch[2]) return priorityMatch[2];

  const matches = cleaned.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g);
  if (!matches || !matches.length) return null;

  const sorted = matches
    .map(v => ({ raw: v, num: parseFloat(normalizeAmount(v)) }))
    .filter(x => !isNaN(x.num) && x.num > 0)
    .sort((a, b) => b.num - a.num);

  return sorted.length ? sorted[0].raw : null;
}

function normalizeAmount(value) {
  if (!value) return "";
  let v = String(value).trim();

  if (v.includes(".") && v.includes(",")) {
    v = v.replace(/\./g, "").replace(",", ".");
  } else {
    v = v.replace(",", ".");
  }

  const num = parseFloat(v);
  return isNaN(num) ? "" : num.toFixed(2);
}

function extractDate(text) {
  if (!text) return null;

  const m = text.match(/(\d{1,2})[./-](\d{1,2})[./-](20\d{2}|\d{2})/);
  if (!m) return null;

  let day = m[1].padStart(2, "0");
  let month = m[2].padStart(2, "0");
  let year = m[3];

  if (year.length === 2) year = "20" + year;

  return `${year}-${month}-${day}`;
}
