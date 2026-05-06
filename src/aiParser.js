async function parseReceiptText(ocrText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-5.3';
  if (!apiKey) throw new Error('OPENAI_API_KEY tanımlı değil.');

  const schemaPrompt = `Aşağıdaki OCR metninden fiş/fatura alanlarını çıkar. Sadece geçerli JSON döndür.
Alanlar: company_name, document_date, document_number, subtotal, vat_amount, total_amount, currency, confidence, notes.
Tutarları sayı olarak ver. Emin değilsen boş string veya 0 ver. OCR metni:\n${ocrText}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: schemaPrompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'receipt_parse',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              company_name: { type: 'string' },
              document_date: { type: 'string' },
              document_number: { type: 'string' },
              subtotal: { type: 'number' },
              vat_amount: { type: 'number' },
              total_amount: { type: 'number' },
              currency: { type: 'string' },
              confidence: { type: 'number' },
              notes: { type: 'string' }
            },
            required: ['company_name','document_date','document_number','subtotal','vat_amount','total_amount','currency','confidence','notes']
          }
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI parse hatası: ${response.status} ${text}`);
  }
  const data = await response.json();
  const out = data.output_text || data.output?.[0]?.content?.[0]?.text || '{}';
  return JSON.parse(out);
}

module.exports = { parseReceiptText };
