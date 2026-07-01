const {
  getTransactionById,
  updateTransactionStatus,
} = require('../db/supabaseClient');
const { appendToSheet } = require('../sheets/appendToSheet');

/**
 * Dipanggil saat user menekan tombol inline "✅ Simpan" / "❌ Batal".
 * @param {import('node-telegram-bot-api')} bot
 * @param {object} callbackQuery
 */
async function handleCallback(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data; // format: "confirm:<id>" atau "cancel:<id>"

  const [action, idStr] = data.split(':');
  const transactionId = Number(idStr);

  try {
    const tx = await getTransactionById(transactionId);

    if (!tx || tx.status !== 'pending') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Transaksi ini sudah diproses sebelumnya.',
      });
      return;
    }

    if (action === 'confirm') {
      await appendToSheet(tx);
      await updateTransactionStatus(transactionId, 'confirmed');

      await bot.editMessageText(
        `${callbackQuery.message.text}\n\n✅ *Tersimpan ke Google Sheets*`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        }
      );
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Tersimpan ✅' });
    } else if (action === 'cancel') {
      await updateTransactionStatus(transactionId, 'cancelled');

      await bot.editMessageText(
        `${callbackQuery.message.text}\n\n❌ *Dibatalkan*`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        }
      );
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Dibatalkan' });
    }
  } catch (err) {
    console.error('Error di handleCallback:', err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Terjadi kesalahan, coba lagi.',
      show_alert: true,
    });
  }
}

module.exports = { handleCallback };
