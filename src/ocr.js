const fs = require('fs');

async function runGoogleVision(filePath) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY tanımlı değil.');

  const content = fs.readFileSync(filePath).toString('base64');
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
      }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Vision hatası: ${response.status} ${text}`);
  }
  const data = await response.json();
  return data.responses?.[0]?.fullTextAnnotation?.text || data.responses?.[0]?.textAnnotations?.[0]?.description || '';
}

module.exports = { runGoogleVision };
