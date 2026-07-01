const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL atau SUPABASE_KEY belum diset di .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Simpan hasil ekstraksi struk sebagai transaksi baru dengan status "pending".
 * @param {string} telegramUserId
 * @param {object} extracted - hasil parsing dari Gemini
 * @returns {Promise<object>} row yang baru dibuat (termasuk id)
 */
async function createPendingTransaction(telegramUserId, extracted) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      telegram_user_id: String(telegramUserId),
      store_name: extracted.store_name || null,
      transaction_date: extracted.transaction_date || null,
      items: extracted.items || [],
      subtotal: extracted.subtotal ?? null,
      discount: extracted.discount ?? null,
      tax: extracted.tax ?? null,
      total: extracted.total ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Ambil satu transaksi berdasarkan id.
 */
async function getTransactionById(id) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update status transaksi (confirmed / cancelled).
 */
async function updateTransactionStatus(id, status) {
  const { data, error } = await supabase
    .from('transactions')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  supabase,
  createPendingTransaction,
  getTransactionById,
  updateTransactionStatus,
};
