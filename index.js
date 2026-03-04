require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

console.log("Bot berjalan...");

// =======================
// ERROR HANDLER
// =======================
bot.on("polling_error", console.error);
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// =======================
// CONFIG
// =======================
let ANTI_LINK = true;
let ANTI_SPAM = true;

let DEFAULT_MUTE_DURATION = 60;

const SPAM_LIMIT = 5;
const TIME_WINDOW = 5000;
const MIN_MUTE_DURATION = 30;

const PROMO_CHANNEL = "https://t.me/seducteasech";

const userMessages = {};
let lastWelcomeMessage = {};

// =======================
// ESCAPE MARKDOWN
// =======================
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// =======================
// FORMAT WAKTU
// =======================
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

// =======================
// WELCOME MESSAGE
// =======================
bot.on("message", async (msg) => {

  if (!msg.new_chat_members) return;

  const chatId = msg.chat.id;
  const groupName = escapeMarkdown(msg.chat.title);

  for (const member of msg.new_chat_members) {

    const name = escapeMarkdown(member.first_name);

    const mentionUser = member.username
      ? `@${escapeMarkdown(member.username)}`
      : `[${name}](tg://user?id=${member.id})`;

    try {
      if (lastWelcomeMessage[chatId]) {
        await bot.deleteMessage(chatId, lastWelcomeMessage[chatId]);
      }
    } catch {}

    const sent = await bot.sendMessage(
      chatId,
`Halo ${name} Welcome To ${groupName}
User: ${mentionUser}
ID: ${member.id}
JANGAN SPAM & KIRIM LINK SEMBARANGAN`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "ASUPAN",
                url: PROMO_CHANNEL
              }
            ]
          ]
        }
      }
    );

    lastWelcomeMessage[chatId] = sent.message_id;
  }
});

// =======================
// MAIN MODERATION
// =======================
bot.on("message", async (msg) => {

  if (!msg.text || msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const now = Date.now();

  try {

    const member = await bot.getChatMember(chatId, userId);

    if (["administrator", "creator"].includes(member.status)) return;

    // ===================
    // ANTI LINK
    // ===================
    if (ANTI_LINK) {

      const linkRegex = /(https?:\/\/|t\.me|www\.)/i;

      if (linkRegex.test(msg.text)) {

        await bot.deleteMessage(chatId, msg.message_id);

        await muteUser(
          chatId,
          userId,
          msg,
          "Mengirim link tidak diperbolehkan."
        );

        return;
      }
    }

    // ===================
    // ANTI SPAM
    // ===================
    if (ANTI_SPAM) {

      if (!userMessages[userId]) {
        userMessages[userId] = [];
      }

      userMessages[userId].push(now);

      userMessages[userId] = userMessages[userId].filter(
        (time) => now - time < TIME_WINDOW
      );

      if (userMessages[userId].length > SPAM_LIMIT) {

        await muteUser(
          chatId,
          userId,
          msg,
          "Terlalu banyak pesan (spam)."
        );
      }
    }

  } catch (err) {

    console.log("ERROR:", err.response?.body || err.message);

  }

});

// =======================
// MUTE FUNCTION
// =======================
async function muteUser(chatId, userId, msg, reason, customDuration) {

  const duration = customDuration || DEFAULT_MUTE_DURATION;
  const until = Math.floor(Date.now() / 1000) + duration;

  await bot.restrictChatMember(chatId, userId, {
    permissions: {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
    },
    until_date: until
  });

  const name = escapeMarkdown(msg.from.first_name);
  const untilFormatted = formatDateTime(until * 1000);

  await bot.sendMessage(
    chatId,
`🚫 *PERINGATAN MODERASI*
\`\`\`
User  : ${name}
Muted : ${duration} detik
Sampai: ${untilFormatted}
Alasan: ${reason}
\`\`\``,
    { parse_mode: "Markdown" }
  );

}

// =======================
// COMMAND .setmute
// =======================
bot.onText(/^\.setmute (\d+)$/, async (msg, match) => {

  const chatId = msg.chat.id;
  const callerId = msg.from.id;

  const callerMember = await bot.getChatMember(chatId, callerId);

  if (!["administrator", "creator"].includes(callerMember.status)) {
    return bot.sendMessage(chatId, "❌ Hanya admin.");
  }

  let duration = parseInt(match[1]);

  if (duration < MIN_MUTE_DURATION) {
    return bot.sendMessage(chatId, `❌ Durasi minimum ${MIN_MUTE_DURATION} detik.`);
  }

  DEFAULT_MUTE_DURATION = duration;

  bot.sendMessage(chatId, `✅ Durasi mute default diubah menjadi *${DEFAULT_MUTE_DURATION} detik*`, {
    parse_mode: "Markdown"
  });

});

// =======================
// COMMAND .mute
// =======================
bot.onText(/^\.mute (\d+)$/, async (msg, match) => {

  const chatId = msg.chat.id;
  const callerId = msg.from.id;

  const callerMember = await bot.getChatMember(chatId, callerId);
  const callerStatus = callerMember.status;

  if (!["administrator", "creator"].includes(callerStatus)) {
    return bot.sendMessage(chatId, "❌ Hanya admin.");
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply pesan user yang ingin dimute.");
  }

  const targetId = msg.reply_to_message.from.id;
  const targetMember = await bot.getChatMember(chatId, targetId);
  const targetStatus = targetMember.status;

  if (targetStatus === "creator") {
    return bot.sendMessage(chatId, "❌ Tidak bisa mute owner.");
  }

  if (targetStatus === "administrator" && callerStatus !== "creator") {
    return bot.sendMessage(chatId, "❌ Hanya owner yang bisa mute admin.");
  }

  let duration = parseInt(match[1]);

  if (duration < MIN_MUTE_DURATION) {
    await bot.sendMessage(chatId, `⚠️ Durasi minimum ${MIN_MUTE_DURATION} detik, otomatis diset ${MIN_MUTE_DURATION} detik.`);
    duration = MIN_MUTE_DURATION;
  }

  await muteUser(
    chatId,
    targetId,
    msg.reply_to_message,
    "Mute manual oleh admin.",
    duration
  );

});

// =======================
// COMMAND .kick
// =======================
bot.onText(/^\.kick$/, async (msg) => {

  const chatId = msg.chat.id;
  const callerId = msg.from.id;

  const callerMember = await bot.getChatMember(chatId, callerId);
  const callerStatus = callerMember.status;

  if (!["administrator", "creator"].includes(callerStatus)) {
    return bot.sendMessage(chatId, "❌ Hanya admin.");
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply pesan user yang ingin di-kick.");
  }

  const targetId = msg.reply_to_message.from.id;
  const targetMember = await bot.getChatMember(chatId, targetId);
  const targetStatus = targetMember.status;

  if (targetStatus === "creator") {
    return bot.sendMessage(chatId, "❌ Tidak bisa kick owner.");
  }

  if (targetStatus === "administrator" && callerStatus !== "creator") {
    return bot.sendMessage(chatId, "❌ Hanya owner yang bisa kick admin.");
  }

  const name = escapeMarkdown(msg.reply_to_message.from.first_name);

  await bot.banChatMember(chatId, targetId);
  await bot.unbanChatMember(chatId, targetId);

  bot.sendMessage(
    chatId,
`✅ *KICK BERHASIL*
\`\`\`
User  : ${name}
Status: Telah dikeluarkan dari grup
\`\`\``,
    { parse_mode: "Markdown" }
  );

});