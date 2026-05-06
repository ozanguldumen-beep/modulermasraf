document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('ocrBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const expenseId = btn.dataset.expenseId;
    const result = document.getElementById('ocrResult');
    btn.disabled = true;
    btn.textContent = 'OCR okunuyor...';
    result.textContent = 'Google Vision ve AI parsing çalışıyor...';
    try {
      const res = await fetch(`/expenses/${expenseId}/ocr`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'OCR başarısız');
      result.textContent = `OCR TEXT:\n${data.ocrText}\n\nAI PARSE:\n${JSON.stringify(data.parsed, null, 2)}`;
      btn.textContent = 'Tekrar OCR + AI Oku';
    } catch (err) {
      result.textContent = err.message;
      btn.textContent = 'OCR + AI Oku';
    } finally {
      btn.disabled = false;
    }
  });
});
