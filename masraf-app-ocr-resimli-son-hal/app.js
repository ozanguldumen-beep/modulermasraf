async function upload() {
  const status = document.getElementById("status");
  const sendBtn = document.getElementById("sendBtn");

  try {
    if (!WEBHOOK || WEBHOOK.includes("BURAYA_")) {
      alert("Lütfen config.js dosyasına çalışan Bitrix24 webhook adresini yaz.");
      return;
    }

    sendBtn.disabled = true;
    status.textContent = "İşleniyor...";

    const file = document.getElementById("file").files[0];
    const expenseType = document.getElementById("expenseType").value;
    const desc = document.getElementById("desc").value || "";
    let amount = document.getElementById("amount").value.trim();

    let ocrText = "";
    let fileForBitrix = null;

    if (file) {
      status.textContent = "Fiş görseli hazırlanıyor...";
      fileForBitrix = await prepareImageForBitrix(file);

      status.textContent = "OCR fişi okuyor. İlk denemede biraz sürebilir...";
      ocrText = await readText(file);
      const foundAmount = extractAmount(ocrText);

      if (!amount && foundAmount) {
        amount = foundAmount;
        document.getElementById("amount").value = amount;
      }
    }

    if (!amount) {
      alert("Tutar bulunamadı. Lütfen tutarı elle yaz.");
      status.textContent = "Tutar eksik.";
      return;
    }

    const normalizedAmount = normalizeAmount(amount);

    const comments =
      "Masraf Türü: " + expenseType + "\n" +
      "Açıklama: " + desc + "\n\n" +
      "OCR Metni:\n" + (ocrText ? ocrText.substring(0, 1500) : "Fiş yüklenmedi / OCR kullanılmadı");

    const dealData = {
      fields: {
        TITLE: "Masraf Talebi - " + expenseType,
        OPPORTUNITY: normalizedAmount,
        CURRENCY_ID: "TRY",
        COMMENTS: comments
      }
    };

    status.textContent = "Bitrix24 anlaşma kaydı oluşturuluyor...";

    const dealResponse = await fetch(WEBHOOK + "crm.deal.add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dealData)
    });

    const dealResult = await dealResponse.json();

    if (!dealResult.result) {
      console.error(dealResult);
      status.textContent = "Bitrix kayıt hatası:\n" + JSON.stringify(dealResult, null, 2);
      alert("Bitrix kayıt hatası. Detay ekranda.");
      return;
    }

    const dealId = dealResult.result;

    if (fileForBitrix) {
      status.textContent = "Fiş görseli Bitrix timeline yorumuna ekleniyor...";

      const commentData = {
        fields: {
          ENTITY_ID: dealId,
          ENTITY_TYPE: "deal",
          COMMENT: "Fiş / fatura görseli ektedir.",
          FILES: [
            [fileForBitrix.fileName, fileForBitrix.base64]
          ]
        }
      };

      const commentResponse = await fetch(WEBHOOK + "crm.timeline.comment.add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commentData)
      });

      const commentResult = await commentResponse.json();

      if (!commentResult.result) {
        console.error(commentResult);
        status.textContent =
          "Kayıt oluştu ama fiş görseli eklenemedi.\n" +
          "Bitrix kayıt ID: " + dealId + "\n\n" +
          JSON.stringify(commentResult, null, 2);
        alert("Kayıt oluştu ama görsel eklenemedi. Detay ekranda.");
        return;
      }

      status.textContent =
        "Gönderildi ✅\n" +
        "Bitrix kayıt ID: " + dealId + "\n" +
        "Timeline yorum ID: " + commentResult.result + "\n" +
        "Tutar: " + normalizedAmount + " TL\n" +
        "Fiş görseli eklendi.";
      alert("Gönderildi! Fiş görseli de eklendi.");
    } else {
      status.textContent =
        "Gönderildi ✅\n" +
        "Bitrix kayıt ID: " + dealId + "\n" +
        "Tutar: " + normalizedAmount + " TL\n" +
        "Fiş görseli seçilmedi.";
      alert("Gönderildi!");
    }
  } catch (err) {
    console.error(err);
    status.textContent = "Hata:\n" + err.message;
    alert("Hata oluştu: " + err.message);
  } finally {
    sendBtn.disabled = false;
  }
}

async function readText(file) {
  const result = await Tesseract.recognize(file, "tur+eng", {
    logger: m => {
      if (m.status === "recognizing text") {
        const pct = Math.round((m.progress || 0) * 100);
        document.getElementById("status").textContent = "OCR okuyor: %" + pct;
      }
    }
  });
  return result.data.text || "";
}

function extractAmount(text) {
  if (!text) return null;
  const cleaned = text.replace(/\s/g, " ");

  const priorityRegex = /(TOPLAM|TOTAL|GENEL TOPLAM|TUTAR|ÖDENECEK|ODENECEK)[^\d]{0,30}(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/i;
  const priorityMatch = cleaned.match(priorityRegex);
  if (priorityMatch && priorityMatch[2]) return priorityMatch[2];

  const matches = cleaned.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g);
  if (!matches || !matches.length) return null;

  const sorted = matches
    .map(v => ({ raw: v, num: parseFloat(normalizeAmount(v)) }))
    .filter(x => !isNaN(x.num))
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

async function prepareImageForBitrix(file) {
  const dataUrl = await resizeImageToJpegDataUrl(file, 1600, 0.78);
  const base64 = dataUrl.split(",")[1];

  const safeName = (file.name || "fis.jpg")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\-çğıöşüÇĞİÖŞÜ]/g, "_");

  return {
    fileName: safeName + "_fis.jpg",
    base64
  };
}

function resizeImageToJpegDataUrl(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = e => {
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height >= width && height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      img.onerror = reject;
      img.src = e.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
