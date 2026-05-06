
console.log("Modüler Masraf OCR v19 stable loaded");

function q(sel){ return document.querySelector(sel); }

function setVal(names, value){
  if(value === undefined || value === null || value === "") return;
  for(const name of names){
    const el = document.querySelector(`[name="${name}"], #${name}`);
    if(el){ el.value = value; return; }
  }
}

function trToNumberText(v){
  if(!v) return "";
  let s = String(v).trim();
  s = s.replace(/[^\d,\.]/g, "");
  if(s.includes(",") && s.includes(".")){
    s = s.replace(/\./g, "").replace(",", ".");
  } else if(s.includes(",")){
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if(!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

function fillFields(data){
  if(!data) return;

  const total = data.total_amount || data.amount;
  const date = data.document_date || data.expense_date;

  setVal(["company_name","vendor_name","firma_unvani"], data.company_name);
  setVal(["document_date","belge_tarihi","expense_date","date"], date);
  setVal(["document_number","belge_numarasi"], data.document_number);
  setVal(["receipt_no","fis_no"], data.receipt_no);
  setVal(["subtotal","tax_base","vergi_matrahi"], trToNumberText(data.subtotal));
  setVal(["vat_amount","kdv_tutari"], trToNumberText(data.vat_amount));
  setVal(["total_amount","toplam_tutar","amount"], trToNumberText(total));
}

window.runOcrNow = async function(event){
  if(event) event.preventDefault();

  const input = document.querySelector('input[type="file"][name="receipt"], input[type="file"][name="file"], input[type="file"]');
  const status = document.getElementById("ocrStatus");
  const debug = document.getElementById("ocrDebug");

  if(!input || !input.files || !input.files[0]){
    if(status) status.textContent = "Önce fiş/fatura görseli seç.";
    return false;
  }

  if(status) status.textContent = "OCR okunuyor, lütfen bekle...";
  if(debug) debug.textContent = "";

  const fd = new FormData();
  fd.append("receipt", input.files[0]);

  try{
    const res = await fetch("/api/ocr", { method:"POST", body: fd });
    const data = await res.json();

    if(!data.ok){
      if(status) status.textContent = "OCR hata: " + (data.error || "Bilinmeyen hata");
      if(debug) debug.textContent = JSON.stringify(data, null, 2);
      return false;
    }

    fillFields(data);

    if(status){
      status.textContent = `OCR tamamlandı (${data.provider || "google"}). Tutar: ${data.total_amount || data.amount || "-"} Tarih: ${data.document_date || data.expense_date || "-"}.`;
    }
    if(debug){
      debug.textContent = "Okunan metin önizleme:\n" + (data.text || "").slice(0, 3000);
    }
  }catch(e){
    if(status) status.textContent = "OCR bağlantı hatası: " + e.message;
    if(debug) debug.textContent = String(e.stack || e);
  }

  return false;
};
