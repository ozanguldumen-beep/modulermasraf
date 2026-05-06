
function parseReceipt(text) {
  const result = {
    company_name: "",
    document_date: "",
    receipt_no: "",
    vat_amount: "",
    total_amount: "",
    subtotal: ""
  };

  const lines = text.split("\n").map(x => x.trim()).filter(Boolean);

  result.company_name = lines[0] || "";

  const dateMatch = text.match(/(\d{2}[\/\.]\d{2}[\/\.]\d{4})/);
  if(dateMatch) result.document_date = dateMatch[1];

  const fisMatch = text.match(/F[İI]Ş\s*NO[: ]+([A-Z0-9\-]+)/i);
  if(fisMatch) result.receipt_no = fisMatch[1];

  const totalMatch = text.match(/TOPLAM[: ]+([\d\.\,]+)/i);
  if(totalMatch) result.total_amount = totalMatch[1];

  const vatMatch = text.match(/KDV[: ]+([\d\.\,]+)/i);
  if(vatMatch) result.vat_amount = vatMatch[1];

  return result;
}
