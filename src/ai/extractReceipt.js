const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const EXTRACTION_PROMPT = `
Kamu adalah asisten yang membaca foto struk/nota belanja Indonesia.
Baca gambar berikut dan keluarkan HANYA JSON valid (tanpa markdown, tanpa penjelasan tambahan)
dengan struktur persis seperti ini:

{
  "store_name": "string atau null",
  "transaction_date": "YYYY-MM-DD atau null jika tidak terbaca",
  "items": [
    { "name": "string", "qty": number, "price": number }
  ],
  "subtotal": number atau null,
  "discount": number atau null,
  "tax": number atau null,
  "total": number
}

Aturan:
- "price" pada setiap item adalah harga SATUAN, bukan harga total per baris.
- Semua nominal dalam angka murni (tanpa "Rp", tanpa titik/koma ribuan), contoh: 15000 bukan "Rp15.000".
- Jika tanggal tidak terlihat di struk, isi null.
- "tax" adalah nominal pajak/PPN yang tertulis di struk (misal baris "PPN" atau "Pajak"). Jika tidak ada baris pajak sama sekali di struk, isi null — jangan mengarang angka.
- Jika field tidak ditemukan, isi null (untuk angka) atau [] (untuk items).
- "total" wajib diisi, gunakan estimasi terbaik dari subtotal dikurangi diskon ditambah pajak jika total tidak tertulis eksplisit.
- Jangan tambahkan field lain di luar struktur di atas.
`;

/**
 * Kirim gambar struk ke Gemini dan kembalikan hasil ekstraksi terstruktur.
 * @param {Buffer} imageBuffer - buffer gambar struk (jpg/png)
 * @param {string} mimeType - contoh: "image/jpeg"
 * @returns {Promise<object>} data terstruktur hasil ekstraksi
 */
async function extractReceipt(imageBuffer, mimeType = 'image/jpeg') {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent([
    { text: EXTRACTION_PROMPT },
    {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType,
      },
    },
  ]);

  const rawText = result.response.text().trim();

  // Gemini kadang membungkus JSON dengan ```json ... ``` walau sudah diminta tidak.
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Gagal parse hasil Gemini sebagai JSON. Raw output: ${rawText.slice(0, 500)}`
    );
  }

  // Normalisasi minimal supaya field yang hilang tidak bikin crash di tempat lain
  return {
    store_name: parsed.store_name ?? null,
    transaction_date: parsed.transaction_date ?? null,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : null,
    discount: typeof parsed.discount === 'number' ? parsed.discount : null,
    tax: typeof parsed.tax === 'number' ? parsed.tax : null,
    total: typeof parsed.total === 'number' ? parsed.total : 0,
  };
}

module.exports = { extractReceipt };
