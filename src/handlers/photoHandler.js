const { extractReceipt } = require('../ai/extractReceipt');
const { createPendingTransaction } = require('../db/supabaseClient');

function formatRupiah(num) {
  if (num === null || num === undefined || num === '') return '-';
  return 'Rp' + Number(num).toLocaleString('id-ID');
}

function buildSummaryText(tx) {
  const lines = [];
  lines.push(`🧾 *${tx.store_name || 'Toko tidak diketahui'}*`);
  lines.push(`📅 ${tx.transaction_date || 'Tanggal tidak terbaca'}`);
  lines.push('');

  if (Array.isArray(tx.items) && tx.items.length > 0) {
    tx.items.forEach((item) => {
      const qty = item.qty ?? 1;
      const price = formatRupiah(item.price);
      lines.push(`• ${item.name} (${qty}x) — ${price}`);
    });
  } else {
    lines.push('• (rincian item tidak terbaca)');
  }

  lines.push('');
  if (tx.subtotal !== null) lines.push(`Subtotal: ${formatRupiah(tx.subtotal)}`);
  if (tx.discount !== null && tx.discount > 0) lines.push(`Diskon: -${formatRupiah(tx.discount)}`);
  if (tx.tax !== null && tx.tax > 0) lines.push(`Pajak: +${formatRupiah(tx.tax)}`);
  lines.push(`*Total: ${formatRupiah(tx.total)}*`);
  lines.push('');
  lines.push('Simpan transaksi ini ke Google Sheets?');

  return lines.join('\n');
}

/**
 * Dipanggil saat bot menerima pesan berisi foto.
 * @param {import('node-telegram-bot-api')} bot
 * @param {object} msg - Telegram message object
 */
async function handlePhoto(bot, msg) {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  let processingMsg;
  try {
    processingMsg = await bot.sendMessage(chatId, '🔎 Membaca struk, mohon tunggu...');

    // Ambil foto dengan resolusi tertinggi
    const photos = msg.photo;
    const bestPhoto = photos[photos.length - 1];

    const fileLink = await bot.getFileLink(bestPhoto.file_id);
    const response = await fetch(fileLink);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const extracted = await extractReceipt(imageBuffer, 'image/jpeg');
    const savedRow = await createPendingTransaction(telegramUserId, extracted);

    const summaryText = buildSummaryText(savedRow);

    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});

    await bot.sendMessage(chatId, summaryText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Simpan', callback_data: `confirm:${savedRow.id}` },
            { text: '❌ Batal', callback_data: `cancel:${savedRow.id}` },
          ],
        ],
      },
    });
  } catch (err) {
    console.error('Error di handlePhoto:', err);
    if (processingMsg) {
      await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
    }
    await bot.sendMessage(
      chatId,
      '⚠️ Maaf, gagal membaca struk ini. Coba kirim ulang dengan foto yang lebih jelas/tidak buram.'
    );
  }
}

module.exports = { handlePhoto };
