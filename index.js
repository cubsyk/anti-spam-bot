require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true,
});

console.log("Bot berjalan...");

// =======================
// CONFIG
// =======================
let ANTI_LINK = true;
let ANTI_SPAM = true;
let DEFAULT_MUTE_DURATION = 60;

const SPAM_LIMIT = 5;
const TIME_WINDOW = 5000;

const userMessages = {};

// =======================
// 🎉 JOIN NOTICE (COMPACT)
// =======================
// =======================
// 🎉 JOIN NOTICE (AUTO DELETE PREVIOUS)
// =======================

let lastWelcomeMessage = {};

bot.on("message", async (msg) => {
  if (!msg.new_chat_members) return;

  const chatId = msg.chat.id;
  const groupName = msg.chat.title;

  for (const member of msg.new_chat_members) {

    const mentionUser = member.username
      ? `@${member.username}`
      : `[${member.first_name}](tg://user?id=${member.id})`;

    try {
      // 🔥 Hapus welcome sebelumnya kalau ada
      if (lastWelcomeMessage[chatId]) {
        await bot.deleteMessage(chatId, lastWelcomeMessage[chatId]);
      }
    } catch (err) {
      // abaikan kalau gagal hapus
    }

    // 🔥 Kirim welcome baru
    const sentMessage = await bot.sendMessage(
      chatId,
`𝐇𝐚𝐥𝐨 ${member.first_name} 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝗧𝗼 ${groupName}
User: ${mentionUser}
ID: ${member.id}
JANGAN SPAM & KIRIM LINK SEMBARANGAN YAA`,
      {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        ...(msg.message_thread_id && {
          message_thread_id: msg.message_thread_id
        })
      }
    );

    // 🔥 Simpan ID pesan terakhir
    lastWelcomeMessage[chatId] = sentMessage.message_id;
  }
});

// =======================
// MAIN LISTENER
// =======================
bot.on("message", async (msg) => {
  if (!msg.text || !msg.from || msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const now = Date.now();

  try {
    const member = await bot.getChatMember(chatId, userId);
    if (["administrator", "creator"].includes(member.status)) return;

    // 🔥 ANTI LINK
    if (ANTI_LINK) {
      const linkRegex = /(https?:\/\/|t\.me|www\.)/i;

      if (linkRegex.test(msg.text)) {
        await bot.deleteMessage(chatId, msg.message_id);
        await muteUser(chatId, userId, msg, "Mengirim link tidak diperbolehkan.");
        return;
      }
    }

    // 🔥 ANTI SPAM
    if (ANTI_SPAM) {
      if (!userMessages[userId]) {
        userMessages[userId] = [];
      }

      userMessages[userId].push(now);

      userMessages[userId] = userMessages[userId].filter(
        (time) => now - time < TIME_WINDOW
      );

      if (userMessages[userId].length > SPAM_LIMIT) {
        await muteUser(chatId, userId, msg, "Terlalu banyak pesan (spam).");
      }
    }

  } catch (err) {
    console.log("ERROR:", err.response?.body || err.message);
  }
});

// =======================
// 🔒 AUTO MUTE FUNCTION
// =======================
async function muteUser(chatId, userId, msg, reason, customDuration) {
  const duration = customDuration || DEFAULT_MUTE_DURATION;
  const until = Math.floor(Date.now() / 1000) + duration;

  await bot.restrictChatMember(chatId, userId, {
    permissions: { can_send_messages: false },
    until_date: until,
  });

  await bot.sendMessage(
    chatId,
    `🚫 *PERINGATAN MODERASI*\n\`\`\`\nUser : ${msg.from.first_name}\nMuted: ${duration} detik\nAlasan: ${reason}\n\`\`\``,
    {
      parse_mode: "Markdown",
      ...(msg.message_thread_id && {
        message_thread_id: msg.message_thread_id
      })
    }
  );
}

// =======================
// 👮 ADMIN COMMANDS
// =======================

// 🔧 Set default mute
bot.onText(/\/setmute (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const member = await bot.getChatMember(chatId, userId);
  if (!["administrator", "creator"].includes(member.status)) {
    return bot.sendMessage(chatId, "❌ Hanya admin.", {
      ...(msg.message_thread_id && {
        message_thread_id: msg.message_thread_id
      })
    });
  }

  DEFAULT_MUTE_DURATION = parseInt(match[1]);

  bot.sendMessage(chatId, `✅ Durasi mute default diubah menjadi ${DEFAULT_MUTE_DURATION} detik.`, {
    ...(msg.message_thread_id && {
      message_thread_id: msg.message_thread_id
    })
  });
});

// 🔒 Manual mute
bot.onText(/\/mute (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  const member = await bot.getChatMember(chatId, adminId);
  if (!["administrator", "creator"].includes(member.status)) {
    return bot.sendMessage(chatId, "❌ Hanya admin.", {
      ...(msg.message_thread_id && {
        message_thread_id: msg.message_thread_id
      })
    });
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply ke pesan user yang ingin dimute.", {
      ...(msg.message_thread_id && {
        message_thread_id: msg.message_thread_id
      })
    });
  }

  const targetId = msg.reply_to_message.from.id;
  const duration = parseInt(match[1]);

  await muteUser(chatId, targetId, msg.reply_to_message, "Mute manual oleh admin.", duration);
});

// 🔓 Unmute
bot.onText(/\/unmute/, async (msg) => {
  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  const member = await bot.getChatMember(chatId, adminId);
  if (!["administrator", "creator"].includes(member.status)) {
    return bot.sendMessage(chatId, "❌ Hanya admin.", {
      ...(msg.message_thread_id && {
        message_thread_id: msg.message_thread_id
      })
    });
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply ke pesan user yang ingin di-unmute.", {
      ...(msg.message_thread_id && {
        message_thread_id: msg.message_thread_id
      })
    });
  }

  const targetId = msg.reply_to_message.from.id;
  const targetName = msg.reply_to_message.from.first_name;

  await bot.restrictChatMember(chatId, targetId, {
    permissions: { can_send_messages: true },
  });

  await bot.sendMessage(
    chatId,
    `✅ *UNMUTE BERHASIL*\n\`\`\`\nUser : ${targetName}\nStatus: Aktif kembali\n\`\`\``,
    {
      parse_mode: "Markdown",
      ...(msg.message_thread_id && {
        message_thread_id: msg.message_thread_id
      })
    }
  );
});