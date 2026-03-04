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

  // 🔥 Abaikan command
  if (msg.text.startsWith(".")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const now = Date.now();

  try {

    const member = await bot.getChatMember(chatId, userId);

    if (["administrator","creator"].includes(member.status)) return;

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
async function muteUser(chatId,userId,msg,reason,customDuration){

  const duration = customDuration || DEFAULT_MUTE_DURATION;
  const until = Math.floor(Date.now()/1000)+duration;

  await bot.restrictChatMember(chatId,userId,{
    permissions:{
      can_send_messages:false
    },
    until_date:until
  });

  const name = escapeMarkdown(msg.from.first_name);

  const untilDate = Date.now() + duration * 1000;
  const untilFormatted = formatDateTime(untilDate);

  await bot.sendMessage(
    chatId,
`🚫 *PERINGATAN MODERASI*
\`\`\`
User : ${name}
Muted: ${duration} detik
Sampai: ${untilFormatted}
Alasan: ${reason}
\`\`\``,
{ parse_mode:"Markdown" }
  );

  // AUTO UNMUTE
  setTimeout(async ()=>{

    try{

      await bot.restrictChatMember(chatId,userId,{
        permissions:{
          can_send_messages:true,
          can_send_media_messages:true,
          can_send_other_messages:true,
          can_add_web_page_previews:true
        }
      });

    }catch(err){
      console.log("Auto unmute error:",err.message);
    }

  },duration*1000);
}

// =======================
// COMMAND .SETMUTE
// =======================
bot.onText(/^\.setmute (\d+)/, async (msg,match)=>{

  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  const member = await bot.getChatMember(chatId, adminId);

  if (!["administrator","creator"].includes(member.status)) {
    return bot.sendMessage(chatId,"❌ Hanya admin.");
  }

  DEFAULT_MUTE_DURATION = parseInt(match[1]);

  bot.sendMessage(
    chatId,
`Durasi mute diubah menjadi ${DEFAULT_MUTE_DURATION} detik`
  );

});

// =======================
// COMMAND .MUTE
// =======================
bot.onText(/^\.mute (\d+)/, async (msg,match)=>{

  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  const adminMember = await bot.getChatMember(chatId, adminId);

  if (!["administrator","creator"].includes(adminMember.status)) {
    return bot.sendMessage(chatId,"❌ Hanya admin.");
  }

  if(!msg.reply_to_message){
    return bot.sendMessage(chatId,"Reply pesan user yang ingin dimute.");
  }

  const targetId = msg.reply_to_message.from.id;
  const targetMember = await bot.getChatMember(chatId,targetId);

  // ADMIN tidak boleh mute owner
  if(adminMember.status !== "creator" && targetMember.status === "creator"){
    return bot.sendMessage(chatId,"❌ Tidak bisa mute owner.");
  }

  // ADMIN tidak boleh mute admin lain
  if(adminMember.status !== "creator" && targetMember.status === "administrator"){
    return bot.sendMessage(chatId,"❌ Admin tidak bisa mute admin lain.");
  }

  const duration = parseInt(match[1]);

  await muteUser(
    chatId,
    targetId,
    msg.reply_to_message,
    "Mute manual admin",
    duration
  );

});

// =======================
// COMMAND .KICK
// =======================
bot.onText(/^\.kick/, async (msg)=>{

  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  const adminMember = await bot.getChatMember(chatId, adminId);

  if (!["administrator","creator"].includes(adminMember.status)) {
    return bot.sendMessage(chatId,"❌ Hanya admin.");
  }

  if(!msg.reply_to_message){
    return bot.sendMessage(chatId,"Reply pesan user yang ingin di-kick.");
  }

  const targetId = msg.reply_to_message.from.id;
  const targetMember = await bot.getChatMember(chatId,targetId);

  // ADMIN tidak boleh kick owner
  if(adminMember.status !== "creator" && targetMember.status === "creator"){
    return bot.sendMessage(chatId,"❌ Tidak bisa kick owner.");
  }

  // ADMIN tidak boleh kick admin lain
  if(adminMember.status !== "creator" && targetMember.status === "administrator"){
    return bot.sendMessage(chatId,"❌ Admin tidak bisa kick admin lain.");
  }

  await bot.banChatMember(chatId,targetId);
  await bot.unbanChatMember(chatId,targetId);

  bot.sendMessage(chatId,"User berhasil di-kick");

});