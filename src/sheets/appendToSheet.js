const { google } = require('googleapis');
const path = require('path');

function getAuth() {
  // Membaca file kredensial JSON langsung dari folder root aplikasi
  const keyPath = path.join(__dirname, '../../service-account.json');

  return new google.auth.JWT({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

const DETAIL_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const SUMMARY_SHEET_NAME = process.env.SUMMARY_SHEET_NAME || 'Ringkasan';
const SUMMARY_HEADER = ['ID Transaksi', 'Tanggal', 'Nama Toko', 'Total'];

/**
 * Ambil daftar semua sheet (tab) beserta sheetId (gid)-nya dalam satu spreadsheet.
 */
async function getSheetMetaMap(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const map = {};
  (res.data.sheets || []).forEach((s) => {
    map[s.properties.title] = s.properties.sheetId;
  });
  return map;
}

/**
 * Pastikan sebuah sheet (tab) dengan nama tertentu ada.
 * Kalau belum ada, sheet baru dibuat, dan kalau `headerRow` diberikan,
 * baris header langsung ditulis di baris pertama sheet baru itu.
 * Mengembalikan sheetId (gid) dari sheet tersebut.
 */
async function ensureSheetExists(sheets, spreadsheetId, sheetName, headerRow) {
  const meta = await getSheetMetaMap(sheets, spreadsheetId);
  if (meta[sheetName] !== undefined) {
    return meta[sheetName];
  }

  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });

  const newSheetId = addRes.data.replies[0].addSheet.properties.sheetId;

  if (headerRow) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${String.fromCharCode(64 + headerRow.length)}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headerRow] },
    });
  }

  return newSheetId;
}

/**
 * Hitung jumlah baris yang sudah terpakai di sebuah sheet, dengan memindai range lebar (A:Z)
 * supaya kebal terhadap sisa data "nyasar" di kolom kanan dari percobaan-percobaan sebelumnya.
 */
async function getUsedRowCount(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });
  return res.data.values ? res.data.values.length : 0;
}

/**
 * Tambahkan border tipis di bagian bawah baris terakhir sebuah blok transaksi,
 * supaya jadi garis pemisah visual dari blok transaksi berikutnya.
 */
async function addSeparatorBorder(sheets, spreadsheetId, sheetId, lastRow1Indexed) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateBorders: {
            range: {
              sheetId,
              startRowIndex: lastRow1Indexed - 1,
              endRowIndex: lastRow1Indexed,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            bottom: {
              style: 'SOLID_MEDIUM',
              color: { red: 0.4, green: 0.4, blue: 0.4 },
            },
          },
        },
      ],
    },
  });
}

/**
 * Tambahkan satu baris ringkasan ke sheet "Ringkasan", dengan kolom ID Transaksi
 * berupa hyperlink yang lompat ke awal blok transaksi tersebut di sheet detail.
 */
async function appendSummaryRow(sheets, spreadsheetId, detailSheetId, transaction, detailStartRow) {
  const summarySheetId = await ensureSheetExists(sheets, spreadsheetId, SUMMARY_SHEET_NAME, SUMMARY_HEADER);
  const usedRowCount = await getUsedRowCount(sheets, spreadsheetId, SUMMARY_SHEET_NAME);
  const targetRow = usedRowCount === 0 ? 2 : usedRowCount + 1; // baris 1 selalu header

  const hyperlinkFormula = `=HYPERLINK("#gid=${detailSheetId}&range=A${detailStartRow}", ${transaction.id})`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SUMMARY_SHEET_NAME}!A${targetRow}:D${targetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        hyperlinkFormula,
        transaction.transaction_date || '',
        transaction.store_name || '',
        transaction.total ?? '',
      ]],
    },
  });
}

/**
 * Tambahkan satu blok transaksi (info transaksi + rincian item + ringkasan)
 * ke sheet detail, tambahkan border pemisah di bawahnya, lalu tambahkan juga
 * satu baris ringkasan (dengan hyperlink balik ke blok ini) ke sheet "Ringkasan".
 *
 * @param {object} transaction - row dari Supabase (hasil createPendingTransaction)
 */
async function appendToSheet(transaction) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = DETAIL_SHEET_NAME;

  const detailSheetId = await ensureSheetExists(sheets, spreadsheetId, sheetName);

  const items = Array.isArray(transaction.items) && transaction.items.length > 0
    ? transaction.items
    : [{ name: '(tidak ada rincian item)', qty: '', price: '' }];

  const usedRowCount = await getUsedRowCount(sheets, spreadsheetId, sheetName);
  const startRow = usedRowCount === 0 ? 1 : usedRowCount + 2; // +1 pindah baris, +1 lagi baris kosong pemisah

  const rows = [];
  rows.push(['ID Transaksi', transaction.id]);
  rows.push(['Tanggal', transaction.transaction_date || '']);
  rows.push(['Nama Toko', transaction.store_name || '']);
  rows.push([]);
  rows.push(['Nama Item', 'Qty', 'Harga Satuan', 'Jumlah']);

  items.forEach((item) => {
    const qty = item.qty ?? '';
    const price = item.price ?? '';
    const jumlah =
      typeof item.qty === 'number' && typeof item.price === 'number'
        ? item.qty * item.price
        : '';
    rows.push([item.name || '', qty, price, jumlah]);
  });

  rows.push([]);
  rows.push(['Subtotal', '', '', transaction.subtotal ?? '']);
  rows.push(['Diskon', '', '', transaction.discount ?? '']);
  rows.push(['Pajak', '', '', transaction.tax ?? '']);
  rows.push(['Total', '', '', transaction.total ?? '']);

  const endRow = startRow + rows.length - 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${startRow}:D${endRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  await addSeparatorBorder(sheets, spreadsheetId, detailSheetId, endRow);

  await appendSummaryRow(sheets, spreadsheetId, detailSheetId, transaction, startRow);
}

module.exports = { appendToSheet };
