(function(){
  console.log('Modüler Masraf OCR v18.11 TL UI yüklendi');
  function $(id){return document.getElementById(id)}
  function setVal(id,v){const el=$(id); if(el && v!==undefined && v!==null && String(v).trim()!=='') el.value=v}
  function setStatus(msg){const el=$('ocrStatus'); if(el) el.textContent=msg}
  function setDebug(obj){const el=$('ocrDebug'); if(el) el.textContent=typeof obj==='string'?obj:JSON.stringify(obj,null,2)}
  async function runOcrNow(ev){
    if(ev) ev.preventDefault();
    const fileInput=$('receipt');
    if(!fileInput || !fileInput.files || !fileInput.files[0]){ setStatus('Önce fiş/fatura seçiniz.'); return; }
    setStatus('OCR okunuyor...'); setDebug('');
    const fd=new FormData(); fd.append('receipt', fileInput.files[0]);
    try{
      const r=await fetch('/api/ocr',{method:'POST',body:fd});
      const data=await r.json();
      setDebug(data);
      if(!data.ok){ setStatus('OCR hata: '+(data.error||'Bilinmeyen hata')); return; }
      const p=data.parsed||{};
      setVal('companyName',p.companyName);
      setVal('documentDate',p.documentDate);
      setVal('documentNo',p.documentNo);
      setVal('receiptNo',p.receiptNo);
      setVal('taxBase',p.taxBase);
      setVal('vatAmount',p.vatAmount);
      setVal('amount',p.totalAmount||p.amount);
      setVal('expenseDate',p.documentDate);
      setStatus('OCR tamamlandı. Lütfen alanları kontrol ediniz. Tutarlar TL olarak kabul edilir.');
    }catch(e){ setStatus('OCR bağlantı hatası: '+e.message); setDebug(String(e.stack||e)); }
  }
  window.runOcrNow=runOcrNow;
  document.addEventListener('DOMContentLoaded',function(){
    const btn=$('ocrBtn'); if(btn) btn.addEventListener('click',runOcrNow);
  });
})();
