
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("MUSIC_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ADMIN_ID = Deno.env.get("TELEGRAM_ADMIN_ID")!;
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function escapeHTML(value: string) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[c]!);
}

// ==========================================
// SUPABASE DATABASE
// ==========================================

async function db(path: string, options: RequestInit = {}) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    },
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase error ${response.status}: ${responseText}`,
    );
  }

  return responseText ? JSON.parse(responseText) : null;
}

// ==========================================
// TELEGRAM API
// ==========================================

async function telegram(method: string, body: unknown) {
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(
      result.description || `Telegram API error: ${response.status}`,
    );
  }

  return result;
}

async function sendMessage(chatId: number, message: string) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

// ==========================================
// SEARCH MUSIC FROM ITUNES
// ==========================================

async function searchMusic(term: string) {
  const url = new URL("https://itunes.apple.com/search");

  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "15");
  url.searchParams.set("country", "VN");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Không thể tìm kiếm trên iTunes.");
  }

  const data = await response.json();
  const tracks = data.results || [];

  let added = 0;

  for (const track of tracks) {
    if (!track.trackId) continue;

    const sourceId = String(track.trackId);

    const existing = await db(
      `music_discoveries?select=id&source_id=eq.${encodeURIComponent(sourceId)}&limit=1`,
    );

    if (existing.length > 0) continue;

    await db("music_discoveries", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        source_id: sourceId,
        title: track.trackName || "Unknown",
        artist: track.artistName || "Unknown",
        album: track.collectionName || "",
        artwork_url: track.artworkUrl100 || "",
        track_url: track.trackViewUrl || "",
        preview_url: track.previewUrl || null,
        release_date: track.releaseDate || null,
        country_code: "VN",
        source: "itunes",
        status: "pending",
      }),
    });

    added++;
  }

  return {
    tracks,
    added,
  };
}

// ==========================================
// PENDING TRACKS
// ==========================================

async function pendingTracks() {
  return await db(
    "music_discoveries?select=id,title,artist,album,preview_url,track_url&status=eq.pending&order=discovered_at.desc&limit=20",
  );
}

function identifyMusicSource(value: string) {
  if (!value) return null;

  try {
    const url = new URL(value.trim());

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    // YouTube
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be"
    ) {
      let id = "";

      if (host === "youtu.be") {
        id = url.pathname.split("/").filter(Boolean)[0] || "";
      } else if (url.pathname === "/watch") {
        id = url.searchParams.get("v") || "";
      } else {
        id =
          url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] || "";
      }

      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return {
          type: "youtube",
          url: `https://www.youtube.com/watch?v=${id}`,
        };
      }
    }

    // Spotify
    if (host === "open.spotify.com") {
      const match = url.pathname.match(
        /^\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/,
      );

      if (match) {
        return {
          type: "spotify",
          url: `https://open.spotify.com/${match[1]}/${match[2]}`,
        };
      }
    }

    // SoundCloud
    if (
      host === "soundcloud.com" ||
      host === "m.soundcloud.com"
    ) {
      return {
        type: "soundcloud",
        url: url.href,
      };
    }
  } catch {
    return null;
  }

  return null;
}

// ==========================================
// APPROVE / REJECT TRACK
// ==========================================

async function reviewTrack(
  id: string,
  approve: boolean,
  playbackUrl?: string | null,
) {
  const found = await db(
    `music_discoveries?select=*&id=eq.${encodeURIComponent(id)}&status=eq.pending&limit=1`,
  );

  if (!found.length) {
    throw new Error("Không tìm thấy bài hát đang chờ duyệt.");
  }

  const track = found[0];

  if (approve) {
    const source = identifyMusicSource(playbackUrl || "");

    if (!source) {
      throw new Error(
        "Bài hát chưa có nguồn phát đầy đủ. " +
        "Không sử dụng iTunes Preview 30 giây làm nguồn phát. " +
          "Hãy gửi file nhạc vào Telegram hoặc duyệt trên website với link YouTube, Spotify hay SoundCloud.",
      );
    }

    await db("music_tracks", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        title: track.title,
        artist: track.artist,
        genre: "Pop",
        format: "link",

        audio_url: source.url,
        playback_url: source.url,

        storage_path: null,
        file_name: null,
        source_type: source.type,
      }),
    });
  }

  await db(
    `music_discoveries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: approve ? "approved" : "rejected",
      }),
    },
  );

  return track;
}

// ==========================================
// TELEGRAM WEBHOOK
// ==========================================

async function setWebhook() {
  const url =
    `${SUPABASE_URL}/functions/v1/music-space-bot`;

  return telegram("setWebhook", {
    url,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message"],
  });
}

async function checkWebhook() {
  const result = await telegram("getWebhookInfo", {});
  const info = result.result;

  return {
    url: info.url,
    pending_update_count: info.pending_update_count,
    last_error_message: info.last_error_message || null,
    last_error_date: info.last_error_date || null,
    allowed_updates: info.allowed_updates || [],
  };
}
// ==========================================
// UPLOAD MUSIC FROM TELEGRAM TO SUPABASE
// ==========================================

async function uploadTelegramMusic(message: any) {
  const audio = message.audio;

  const document = message.document;

  // Chỉ nhận audio hoặc document có định dạng âm thanh
  const isAudioDocument =
    document &&
    (
      document.mime_type?.startsWith("audio/") ||
      /\.(mp3|m4a|wav|flac|ogg|opus|aac)$/i.test(
        document.file_name || "",
      )
    );

  const media = audio || (isAudioDocument ? document : null);

  if (!media) return false;

  if (media.file_size && media.file_size > 20 * 1024 * 1024) {
    await sendMessage(
      message.chat.id,
      "⚠️ File vượt quá giới hạn tải xuống 20 MB của Telegram Bot API.",
    );
    return true;
  }

  // Lấy đường dẫn file từ Telegram
  const fileInfo = await telegram("getFile", {
    file_id: media.file_id,
  });

  const filePath = fileInfo.result.file_path;

  if (!filePath) {
    throw new Error("Không lấy được đường dẫn file Telegram.");
  }

  // Tải file từ Telegram
  const downloadUrl =
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

  const downloadResponse = await fetch(downloadUrl);

  if (!downloadResponse.ok) {
    throw new Error("Không tải được file từ Telegram.");
  }

  const fileBuffer = await downloadResponse.arrayBuffer();

  // Xác định tên file
  const originalName =
    media.file_name ||
    `${media.title || "music"}.${filePath.split(".").pop()}`;

  const extension =
    originalName.includes(".")
      ? originalName.split(".").pop()!.toLowerCase()
      : "mp3";

  const safeName = originalName
    .replace(/[^\w.-]/g, "_")
    .slice(0, 100);

  const storagePath =
    `telegram/${Date.now()}_${safeName}`;

  const contentType =
    media.mime_type ||
    (
      extension === "mp3"
        ? "audio/mpeg"
        : extension === "m4a"
          ? "audio/mp4"
          : extension === "wav"
            ? "audio/wav"
            : "application/octet-stream"
    );

  // Upload lên Supabase Storage
  const uploadResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/music/${storagePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: fileBuffer,
    },
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(
      `Không upload được lên Storage: ${errorText}`,
    );
  }

  // Tạo URL công khai
  const audioUrl =
    `${SUPABASE_URL}/storage/v1/object/public/music/${storagePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;

  const title =
    media.title ||
    message.caption ||
    originalName.replace(/\.[^.]+$/, "");

  const artist = media.performer || "Unknown";

  // Lưu thông tin vào music_tracks
  await db("music_tracks", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      title,
      artist,
      genre: "Pop",
      format: extension,
      audio_url: audioUrl,
      playback_url: audioUrl,
      storage_path: storagePath,
      file_name: originalName,
      source_type: "file",
      license: null,
    }),
  });

  await sendMessage(
    message.chat.id,
    "✅ <b>Đã thêm nhạc vào Music Space!</b>\n\n" +
    `🎵 ${escapeHTML(title)}\n` +
    `👤 ${escapeHTML(artist)}\n` +
    `📁 ${escapeHTML(originalName)}\n\n` +
    "File đã được lưu trên Supabase Storage.",
  );

  return true;
}

// ==========================================
// TELEGRAM COMMAND HANDLER
// ==========================================

async function handleTelegram(update: any) {
  const message = update.message;

  if (!message) return;
  const chatId = message.chat.id;
  const senderId = String(message.from?.id || "");

  // Chỉ admin mới được sử dụng bot
  if (senderId !== ADMIN_ID) {
    await sendMessage(
      chatId,
      "Bạn không có quyền sử dụng Music Space Bot.",
    );
    return;
  }
    // Nhận file nhạc gửi trực tiếp từ Telegram
  const uploaded = await uploadTelegramMusic(message);

  if (uploaded) return;

  // Tin nhắn không phải file nhạc thì xử lý lệnh
  if (!message.text) return;

  const input = message.text.trim();

  const [rawCommand, ...args] = input.split(/\s+/);

  // Hỗ trợ /start@MusicSpaceVN_bot
  const command = rawCommand
    .split("@")[0]
    .toLowerCase();

  const term = args.join(" ");

  // START / HELP
  if (command === "/start" || command === "/help") {
    await sendMessage(
      chatId,
      "🎵 <b>Music Space Bot</b>\n\n" +
      "/search tên bài hát - Tìm nhạc\n" +
      "/discover tên nghệ sĩ - Khám phá nhạc\n" +
      "/pending - Danh sách chờ duyệt\n" +
      "/approve ID - Duyệt bài hát\n" +
      "/reject ID - Từ chối bài hát\n\n" +
      "Bài được duyệt sẽ tự động thêm vào Music Space.",
    );
    return;
  }

  // SEARCH / DISCOVER
  if (command === "/search" || command === "/discover") {
    if (!term) {
      await sendMessage(
        chatId,
        "Hãy nhập tên bài hát hoặc nghệ sĩ.\n\nVí dụ: /search Sơn Tùng M-TP",
      );
      return;
    }

    const result = await searchMusic(term);
    const tracks = result.tracks;

    const output = tracks.slice(0, 10).map(
      (track: any, index: number) => {
        return (
          `${index + 1}. <b>${escapeHTML(track.trackName)}</b>\n` +
          `👤 ${escapeHTML(track.artistName)}\n` +
          `${escapeHTML(track.trackViewUrl || "")}`
        );
      },
    );

    await sendMessage(
      chatId,
      output.length
        ? `🔎 Tìm thấy ${tracks.length} kết quả.\n` +
          `➕ Thêm mới vào hàng chờ: ${result.added}\n\n` +
          output.join("\n\n")
        : "Không tìm thấy bài hát phù hợp.",
    );

    return;
  }

  // PENDING
  if (command === "/pending") {
    const tracks = await pendingTracks();

    if (!tracks.length) {
      await sendMessage(
        chatId,
        "Không có bài hát đang chờ duyệt.",
      );
      return;
    }

    const output = tracks.map((track: any) => {
      return (
        `ID: <code>${escapeHTML(String(track.id))}</code>\n` +
        `🎵 <b>${escapeHTML(track.title)}</b>\n` +
        `👤 ${escapeHTML(track.artist)}\n` +
        `🎧 Preview: ${track.preview_url ? "Có" : "Không có"}`
      );
    });

    await sendMessage(
      chatId,
      "📋 <b>DANH SÁCH CHỜ DUYỆT</b>\n\n" +
      output.join("\n\n"),
    );

    return;
  }

  // APPROVE / REJECT
  if (command === "/approve" || command === "/reject") {
    if (!args[0]) {
      await sendMessage(
        chatId,
        "Cú pháp:\n/approve ID\n/reject ID",
      );
      return;
    }

    const approve = command === "/approve";

    const track = await reviewTrack(
      args[0],
      approve,
      null,
    );

    if (approve) {
      await sendMessage(
        chatId,
        `✅ <b>Đã xử lý bài hát!</b>\n\n` +
          `🎵 ${escapeHTML(track.title)}\n` +
          `👤 ${escapeHTML(track.artist)}\n\n` +
          "Nếu chưa có nguồn phát đầy đủ, hãy gửi file nhạc trực tiếp vào bot để thêm vào Music Space.",
      );
    } else {
      await sendMessage(
        chatId,
        `❌ Đã từ chối: ${escapeHTML(track.title)}`,
      );
    }

    return;
  }

  await sendMessage(
    chatId,
    "Lệnh không hợp lệ. Gửi /help để xem hướng dẫn.",
  );
}

// ==========================================
// MAIN SERVER
// ==========================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return json({
        error: "Method not allowed",
      }, 405);
    }

    const body = await req.json();

    // ======================================
    // TELEGRAM WEBHOOK
    // ======================================

    if (body.update_id !== undefined) {
      console.log("Telegram update received:", body.update_id);

      const secret = req.headers.get(
        "x-telegram-bot-api-secret-token",
      );

      if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
        console.error("Telegram webhook secret mismatch");

        return json({
          error: "Invalid Telegram webhook secret",
        }, 401);
      }

      try {
        await handleTelegram(body);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        console.error("Telegram handler error:", message);

        // Báo lỗi cho admin nếu có thể
        try {
          if (body.message?.chat?.id) {
            await sendMessage(
              body.message.chat.id,
              "⚠️ Có lỗi khi xử lý lệnh:\n" +
              escapeHTML(message),
            );
          }
        } catch (telegramError) {
          console.error(
            "Cannot send Telegram error message:",
            telegramError,
          );
        }
      }

      // Trả 200 để Telegram không lặp vô hạn
      return json({
        ok: true,
      });
    }

    // ======================================
    // WEBSITE / ADMIN API
    // ======================================

    const sentPassword = req.headers.get(
      "x-admin-password",
    );

    if (!ADMIN_PASSWORD) {
      return json({
        error: "ADMIN_PASSWORD_SECRET_MISSING",
      }, 500);
    }

    if (!sentPassword) {
      return json({
        error: "HEADER_X_ADMIN_PASSWORD_MISSING",
      }, 401);
    }

    if (sentPassword !== ADMIN_PASSWORD) {
      return json({
        error: "ADMIN_PASSWORD_INCORRECT",
      }, 401);
    }

    const action = body?.action;

    if (typeof action !== "string" || !action) {
      return json({
        error: "ACTION_MISSING_OR_INVALID",
      }, 400);
    }

    // TEST BOT
    if (action === "testBot") {
      const result = await telegram("getMe", {});

      return json({
        success: true,
        bot: result.result.username,
        is_bot: result.result.is_bot,
      });
    }

    // CHECK WEBHOOK
    if (action === "checkWebhook") {
      return json({
        success: true,
        webhook: await checkWebhook(),
      });
    }

    // SET WEBHOOK
    if (action === "setWebhook") {
      await setWebhook();

      return json({
        success: true,
        message: "Telegram webhook connected",
      });
    }

    // SEARCH
    if (action === "search" || action === "discover") {
      if (!body.term?.trim()) {
        return json({
          error: "Missing search term",
        }, 400);
      }

      const result = await searchMusic(
        body.term.trim(),
      );

      return json({
        success: true,
        count: result.tracks.length,
        added: result.added,
        tracks: result.tracks,
      });
    }

    // PENDING
    if (action === "pending") {
      return json({
        success: true,
        tracks: await pendingTracks(),
      });
    }

    // APPROVE / REJECT
    if (action === "approve" || action === "reject") {
      if (!body.id) {
        return json({
          error: "Missing ID",
        }, 400);
      }

      const track = await reviewTrack(
        String(body.id),
        action === "approve",
        body.playback_url || null,
      );

      return json({
        success: true,
        track,
      });
    }

    return json({
      error: "Unknown action",
    }, 400);

  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error("Music Space Bot error:", message);

    return json({
      success: false,
      error: message,
    }, 500);
  }
});
