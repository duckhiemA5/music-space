// ==========================================
// MUSIC SPACE - SUPABASE CONFIG
// ==========================================

const SUPABASE_URL = "https://vgwixirwiubqydggvepg.supabase.co";
const SUPABASE_KEY = "sb_publishable_KggJYi1-KgKxmN9hr-kODg_KTj_KMvC";
const BUCKET = "music";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ==========================================
// ELEMENTS
// ==========================================

const audio = document.getElementById("audioPlayer");
const embedPlayer = document.getElementById("embedPlayer");

const nowTitle = document.getElementById("nowTitle");
const nowArtist = document.getElementById("nowArtist");
const playBtn = document.getElementById("playBtn");

const progressBar = document.getElementById("progressBar");
const currentTimeText = document.getElementById("currentTime");
const durationText = document.getElementById("duration");
const volumeBar = document.getElementById("volumeBar");

const recentTracks = document.getElementById("recentTracks");
const libraryTracks = document.getElementById("libraryTracks");
const emptyLibrary = document.getElementById("emptyLibrary");
const formMessage = document.getElementById("formMessage");

let tracks = [];
let currentIndex = -1;
let currentMode = "none";
let currentEmbedFrame = null;
let youtubePlayer = null;
let soundCloudWidget = null;
let spotifyController = null;
let spotifyReady = false;
let pendingSpotifyUrl = null;
let pendingYouTubeId = null;
let searchTerm = "";
let selectedGenre = "";
function loadExternalScript(url) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(s => s.src === url);

    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// YouTube API
window.onYouTubeIframeAPIReady = function () {
  if (pendingYouTubeId) {
    createYouTubePlayer(pendingYouTubeId);
  }
};

function createYouTubePlayer(videoId) {
  embedPlayer.innerHTML = '<div id="youtubePlayer"></div>';

  if (youtubePlayer) {
    youtubePlayer.destroy();
    youtubePlayer = null;
  }

  youtubePlayer = new YT.Player("youtubePlayer", {
    width: "200",
    height: "200",
    videoId,
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      controls: 0
    },
    events: {
      onReady: event => {
        event.target.playVideo();
        playBtn.textContent = "Ⅱ";
      },
      onStateChange: event => {
        if (event.data === YT.PlayerState.PLAYING) {
          playBtn.textContent = "Ⅱ";
        }

        if (event.data === YT.PlayerState.PAUSED) {
          playBtn.textContent = "▶";
        }

        if (event.data === YT.PlayerState.ENDED) {
          if (tracks.length) {
            playTrack((currentIndex + 1) % tracks.length);
          }
        }
      },
      onError: event => {
        console.error("YouTube error:", event.data);
        playBtn.textContent = "▶";
      }
    }
  });
}

// Spotify API
window.onSpotifyIframeApiReady = function (IFrameAPI) {
  spotifyReady = true;

  if (pendingSpotifyUrl) {
    createSpotifyPlayer(pendingSpotifyUrl, IFrameAPI);
  }
};

function createSpotifyPlayer(url, api = window.SpotifyIframeApi) {
  if (!api) {
    console.error("Spotify API chưa sẵn sàng");
    return;
  }

  embedPlayer.innerHTML = '<div id="spotifyPlayer"></div>';

  api.createController(
    document.getElementById("spotifyPlayer"),
    { url, width: 200, height: 200 },
    controller => {
      spotifyController = controller;

      controller.addListener("ready", () => {
        controller.play();
        playBtn.textContent = "Ⅱ";
      });

      controller.addListener("playback_update", event => {
        playBtn.textContent = event.data.isPaused ? "▶" : "Ⅱ";

        const position = event.data.position || 0;
        const duration = event.data.duration || 0;

        window.spotifyDuration = duration;

        if (duration > 0) {
          progressBar.value = (position / duration) * 100;

          currentTimeText.textContent =
            formatTime(position / 1000);

          durationText.textContent =
            formatTime(duration / 1000);
        }
      });
    }
  );
}

// ==========================================
// VIEW NAVIGATION
// ==========================================

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(view => {
    view.classList.remove("active");
    view.hidden = true;
  });

  const target = document.getElementById(viewName + "View");

  if (target) {
    target.hidden = false;
    target.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewName
    );
  });

  const titles = {
    home: "Khám phá âm nhạc",
    library: "Thư viện nhạc",
    discover: "Khám phá nhạc mới",
    upload: "Thêm nhạc"
  };

  document.getElementById("pageTitle").textContent =
    titles[viewName] || "Music Space";
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    switchView(button.dataset.go);
  });
});

// ==========================================
// HELPERS
// ==========================================

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function getFileExtension(filename = "") {
  return filename.split(".").pop().toLowerCase();
}

// ==========================================
// IDENTIFY MUSIC LINKS
// ==========================================

function identifySource(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return { type: "invalid" };
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube
  if (host === "youtu.be" || host.includes("youtube.com")) {
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else {
      videoId =
        url.searchParams.get("v") ||
        url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ||
        "";
    }

    return videoId
      ? { type: "youtube", id: videoId }
      : { type: "unsupported" };
  }

  // SoundCloud
  if (host.includes("soundcloud.com")) {
    return { type: "soundcloud", url: url.href };
  }

  // Spotify
  if (host === "open.spotify.com" || host === "spotify.link") {
    const match = url.pathname.match(
      /\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/
    );

    if (match) {
      return {
        type: "spotify",
        kind: match[1],
        id: match[2]
      };
    }

    return { type: "unsupported" };
  }

  // Direct audio files
  const audioExtensions = [
    "mp3", "wav", "ogg", "oga", "m4a",
    "aac", "flac", "opus", "mp4"
  ];

  const extension = getFileExtension(url.pathname);

  if (audioExtensions.includes(extension)) {
    return { type: "direct", url: url.href };
  }

  // Dropbox
  if (host.includes("dropbox.com")) {
    url.searchParams.set("raw", "1");
    return { type: "direct", url: url.href };
  }

  // Google Drive: only public files with permission to access
  if (host === "drive.google.com") {
    const fileId =
      url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ||
      url.searchParams.get("id");

    if (fileId) {
      return {
        type: "direct",
        url: `https://drive.google.com/uc?export=download&id=${fileId}`
      };
    }
  }

  return { type: "unsupported" };
}

// ==========================================
// CREATE EMBED PLAYER
// ==========================================

async function createEmbed(source) {
  embedPlayer.innerHTML = "";
  embedPlayer.hidden = false;

  youtubePlayer = null;
  soundCloudWidget = null;
  spotifyController = null;

  // YOUTUBE
  if (source.type === "youtube") {
    pendingYouTubeId = source.id;

    if (window.YT && window.YT.Player) {
      createYouTubePlayer(source.id);
    }

    return true;
  }

  // SOUNDCLOUD
  if (source.type === "soundcloud") {
    try {
      // Chuyển link rút gọn thành mã nhúng chính thức
      const oembedUrl =
        "https://soundcloud.com/oembed?format=json&url=" +
        encodeURIComponent(source.url);

      const response = await fetch(oembedUrl);

      if (!response.ok) {
        throw new Error("SoundCloud không nhận diện được link.");
      }

      const data = await response.json();

      // Lấy địa chỉ iframe do SoundCloud trả về
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.html, "text/html");
      const originalFrame = doc.querySelector("iframe");

      if (!originalFrame || !originalFrame.src) {
        throw new Error("Không lấy được trình phát SoundCloud.");
      }

      const iframe = document.createElement("iframe");

      iframe.id = "soundcloudPlayer";
      iframe.width = "100%";
      iframe.height = "166";
      iframe.scrolling = "no";
      iframe.frameBorder = "0";
      iframe.allow = "autoplay";

      const playerUrl = new URL(originalFrame.src);
      playerUrl.searchParams.set("auto_play", "true");
      playerUrl.searchParams.set("visual", "false");

      iframe.src = playerUrl.href;

      // Gán sự kiện trước khi thêm iframe vào trang
      iframe.onload = () => {
        if (!window.SC) return;

        soundCloudWidget = SC.Widget(iframe);

        soundCloudWidget.bind(SC.Widget.Events.READY, () => {
          soundCloudWidget.play();
          playBtn.textContent = "Ⅱ";
        });

        soundCloudWidget.bind(SC.Widget.Events.PLAY, () => {
          playBtn.textContent = "Ⅱ";
        });

        soundCloudWidget.bind(SC.Widget.Events.PAUSE, () => {
          playBtn.textContent = "▶";
        });

        soundCloudWidget.bind(SC.Widget.Events.FINISH, () => {
          if (tracks.length) {
            playTrack((currentIndex + 1) % tracks.length);
          }
        });
      };



embedPlayer.appendChild(iframe);
      return true;

    } catch (error) {
      console.error("SoundCloud error:", error);
      alert("Không thể tải nhạc SoundCloud: " + error.message);
      return false;
    }
  }

  // SPOTIFY
  if (source.type === "spotify") {
    const url =
      `https://open.spotify.com/${source.kind}/${source.id}`;

    pendingSpotifyUrl = url;

    if (spotifyReady && window.SpotifyIframeApi) {
      createSpotifyPlayer(url, window.SpotifyIframeApi);
    }

    return true;
  }

  return false;
}

// ==========================================
// PLAY MUSIC
// ==========================================

function stopCurrentPlayback() {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();

  embedPlayer.innerHTML = "";
  embedPlayer.hidden = true;

  currentEmbedFrame = null;
  if (youtubePlayer) {
  youtubePlayer.destroy();
  youtubePlayer = null;
}

if (soundCloudWidget) {
  soundCloudWidget = null;
}

if (spotifyController) {
  spotifyController.destroy();
  spotifyController = null;
}

pendingYouTubeId = null;
pendingSpotifyUrl = null;
  currentMode = "none";

  playBtn.textContent = "▶";
}

async function playTrack(index) {
  if (index < 0 || index >= tracks.length) return;

  const track = tracks[index];

  currentIndex = index;

  stopCurrentPlayback();

  nowTitle.textContent = track.title || "Không có tên";
  nowArtist.textContent = track.artist || "Không rõ nghệ sĩ";

  const playableUrl = track.playback_url || track.audio_url;

  const source = track.source_type === "file"
    ? { type: "direct", url: track.audio_url }
    : identifySource(playableUrl);

  if (source.type === "direct") {
    currentMode = "audio";
    audio.src = source.url;

    try {
      await audio.play();
      playBtn.textContent = "Ⅱ";
    } catch (error) {
      console.error("Audio playback error:", error);
      playBtn.textContent = "▶";
      alert(
        "Không phát được file âm thanh. Hãy kiểm tra đường link, quyền truy cập hoặc định dạng file."
      );
    }

  } else if (
    source.type === "youtube" ||
    source.type === "soundcloud" ||
    source.type === "spotify"
  ) {
    currentMode = "embed";

    if (!(await createEmbed(source))) {
      alert("Không thể tạo trình phát cho đường link này.");
      return;
    }

    playBtn.textContent = "Ⅱ";

  } else {
    alert(
      "Bài hát này chưa có nguồn phát. Hãy thêm link YouTube, SoundCloud hoặc Spotify cho bài hát."
    );
  }

  renderTracks();
}

// ==========================================
// PLAYER CONTROLS
// ==========================================

playBtn.addEventListener("click", async () => {
  if (currentIndex === -1) {
    if (tracks.length) playTrack(0);
    return;
  }

  if (currentMode === "audio") {
    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        console.error(error);
      }
    } else {
      audio.pause();
    }

  } else if (currentMode === "embed") {
    if (youtubePlayer) {
      const state = youtubePlayer.getPlayerState();

      if (state === YT.PlayerState.PLAYING) {
        youtubePlayer.pauseVideo();
      } else {
        youtubePlayer.playVideo();
      }

    } else if (soundCloudWidget) {
      soundCloudWidget.isPaused(paused => {
        if (paused) {
          soundCloudWidget.play();
        } else {
          soundCloudWidget.pause();
        }
      });

    } else if (spotifyController) {
      spotifyController.togglePlay();
    }
  }
});

document.getElementById("prevBtn").addEventListener("click", () => {
  if (!tracks.length) return;

  const previous = currentIndex <= 0
    ? tracks.length - 1
    : currentIndex - 1;

  playTrack(previous);
});

document.getElementById("nextBtn").addEventListener("click", () => {
  if (!tracks.length) return;

  const next = (currentIndex + 1) % tracks.length;
  playTrack(next);
});

audio.addEventListener("play", () => {
  playBtn.textContent = "Ⅱ";
});

audio.addEventListener("pause", () => {
  playBtn.textContent = "▶";
});

audio.addEventListener("ended", () => {
  if (tracks.length) {
    playTrack((currentIndex + 1) % tracks.length);
  }
});


// CẬP NHẬT THANH THỜI GIAN
function updateProgress() {
  if (currentMode === "audio") {
    if (!Number.isFinite(audio.duration)) return;

    progressBar.value =
      (audio.currentTime / audio.duration) * 100;

    currentTimeText.textContent = formatTime(audio.currentTime);
    durationText.textContent = formatTime(audio.duration);
  }

  // YOUTUBE
  else if (currentMode === "embed" && youtubePlayer) {
    try {
      const current = youtubePlayer.getCurrentTime();
      const total = youtubePlayer.getDuration();

      if (total > 0) {
        progressBar.value = (current / total) * 100;
        currentTimeText.textContent = formatTime(current);
        durationText.textContent = formatTime(total);
      }
    } catch (error) {
      console.log(error);
    }
  }

  // SOUNDCLOUD
  else if (currentMode === "embed" && soundCloudWidget) {
    soundCloudWidget.getPosition(position => {
      soundCloudWidget.getDuration(duration => {
        if (duration > 0) {
          progressBar.value = (position / duration) * 100;
          currentTimeText.textContent =
            formatTime(position / 1000);
          durationText.textContent =
            formatTime(duration / 1000);
        }
      });
    });
  }
}

// Cập nhật thời gian liên tục
setInterval(updateProgress, 500);

// FILE AUDIO
audio.addEventListener("loadedmetadata", () => {
  durationText.textContent = formatTime(audio.duration);
});

// KÉO THANH ĐỂ TUA
progressBar.addEventListener("change", () => {
  const percent = Number(progressBar.value) / 100;

  // File audio
  if (currentMode === "audio" && Number.isFinite(audio.duration)) {
    audio.currentTime = percent * audio.duration;
  }

  // YouTube
  else if (currentMode === "embed" && youtubePlayer) {
    const total = youtubePlayer.getDuration();

    if (total > 0) {
      youtubePlayer.seekTo(percent * total, true);
    }
  }

  // SoundCloud
  else if (currentMode === "embed" && soundCloudWidget) {
    soundCloudWidget.getDuration(duration => {
      soundCloudWidget.seekTo(percent * duration);
    });
  }

  // Spotify
  else if (currentMode === "embed" && spotifyController) {
    // Spotify yêu cầu thời gian tính bằng mili giây
    const total = window.spotifyDuration || 0;

    if (total > 0) {
      spotifyController.seek(percent * total);
    }
  }
});


// ĐIỀU CHỈNH ÂM LƯỢNG
function updateVolume() {
  const volume = Number(volumeBar.value);

  // File nhạc trực tiếp
  audio.volume = volume;

  // YouTube
  if (youtubePlayer) {
    youtubePlayer.setVolume(volume * 100);
  }

  // SoundCloud
  if (soundCloudWidget) {
    soundCloudWidget.setVolume(volume * 100);
  }
}

// Khi kéo thanh âm lượng
volumeBar.addEventListener("input", updateVolume);

// Âm lượng mặc định
audio.volume = 0.8;

// ==========================================
// RENDER TRACKS
// ==========================================

function createTrackHTML(track, index) {
  return `
    <div class="track-row">
      <div class="track-cover">♫</div>

      <div>
        <div class="track-name">${escapeHTML(track.title)}</div>
        <div class="track-artist">${escapeHTML(track.artist || "Không rõ nghệ sĩ")}</div>
      </div>

      <div class="track-genre">${escapeHTML(track.genre || "Khác")}</div>

      <div class="track-actions">
        <button class="track-play" data-play="${index}" title="Phát">▶</button>
        <button class="track-delete" data-delete="${index}" title="Xóa">🗑</button>
      </div>
    </div>
  `;
}

function renderTracks() {
  let filtered = tracks.filter(track => {
    const text = `${track.title} ${track.artist} ${track.genre}`.toLowerCase();

    const matchesSearch = text.includes(searchTerm);
    const matchesGenre =
      !selectedGenre ||
      (track.genre || "").toLowerCase() === selectedGenre.toLowerCase();

    return matchesSearch && matchesGenre;
  });

  const sort = document.getElementById("sortSelect")?.value;

  if (sort === "title") {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "artist") {
    filtered.sort((a, b) =>
      (a.artist || "").localeCompare(b.artist || "")
    );
  } else {
    filtered.sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }

  const html = filtered.map(track =>
    createTrackHTML(track, tracks.indexOf(track))
  ).join("");

  libraryTracks.innerHTML = html;
  emptyLibrary.hidden = filtered.length > 0;

  const recent = [...tracks]
    .sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    )
    .slice(0, 5);

  recentTracks.innerHTML = recent.map(track =>
    createTrackHTML(track, tracks.indexOf(track))
  ).join("");
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-play]");

  if (button) {
    playTrack(Number(button.dataset.play));
  }
});

document.getElementById("sortSelect").addEventListener("change", renderTracks);

document.getElementById("searchInput").addEventListener("input", event => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderTracks();
});

document.querySelectorAll("[data-genre]").forEach(button => {
  button.addEventListener("click", () => {
    selectedGenre = button.dataset.genre;
    searchTerm = "";

    document.getElementById("searchInput").value = "";

    switchView("library");
    renderTracks();
  });
});

// ==========================================
// LOAD MUSIC FROM SUPABASE
// ==========================================

async function loadTracks() {
  try {
    const { data, error } = await supabaseClient
      .from("music_tracks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    tracks = data || [];
    renderTracks();

  } catch (error) {
    console.error("Không tải được thư viện:", error);

    libraryTracks.innerHTML =
      `<p class="empty-state">Không tải được thư viện. Hãy kiểm tra kết nối Supabase.</p>`;
  }
}

// ==========================================
// UPLOAD AUDIO FILE
// ==========================================

document.getElementById("uploadForm").addEventListener("submit", async event => {
  event.preventDefault();

  const file = document.getElementById("audioFile").files[0];

  if (!file) {
    formMessage.textContent = "Bạn chưa chọn file nhạc.";
    return;
  }

  const allowedExtensions = [
    "mp3", "wav", "ogg", "oga",
    "m4a", "aac", "flac", "alac",
    "opus", "mp4"
  ];

  const extension = file.name.split(".").pop().toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    formMessage.textContent = "Định dạng file không được hỗ trợ.";
    return;
  }

  const maxSize = 50 * 1024 * 1024;

  if (file.size > maxSize) {
    formMessage.textContent = "File vượt quá giới hạn 50 MB của kho lưu trữ.";
    return;
  }

  const title =
    document.getElementById("fileTitle").value.trim() ||
    file.name.replace(/\.[^/.]+$/, "");

  const artist =
    document.getElementById("fileArtist").value.trim() ||
    "Không rõ nghệ sĩ";

  const genre = document.getElementById("fileGenre").value;

  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Đang tải lên...";

  try {
    const safeName = file.name.replace(/[^\w.-]/g, "_");
    const path = `${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabaseClient
      .storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient
      .storage
      .from(BUCKET)
      .getPublicUrl(path);

    const audioUrl = publicData.publicUrl;

    const { error: insertError } = await supabaseClient
      .from("music_tracks")
      .insert({
        title,
        artist,
        genre,
        format: getFileExtension(file.name),
        audio_url: audioUrl,
        storage_path: path,
        file_name: file.name,
        source_type: "file",
        license: null
      });

    if (insertError) {
      await supabaseClient.storage.from(BUCKET).remove([path]);
      throw insertError;
    }

    formMessage.textContent = "Đã tải nhạc lên thành công!";
    event.target.reset();

    await loadTracks();

  } catch (error) {
    console.error("Upload error:", error);
    formMessage.textContent =
      "Tải lên thất bại: " + (error.message || "Lỗi không xác định");
  } finally {
    button.disabled = false;
    button.textContent = "Tải lên thư viện";
  }
});

// ==========================================
// ADD MUSIC LINK
// ==========================================

document.getElementById("linkForm").addEventListener("submit", async event => {
  event.preventDefault();

  const url = document.getElementById("musicUrl").value.trim();
  const title = document.getElementById("linkTitle").value.trim();
  const artist = document.getElementById("linkArtist").value.trim();
  const genre = document.getElementById("linkGenre").value;

  const source = identifySource(url);

  if (source.type === "invalid") {
    formMessage.textContent = "Đường link không hợp lệ.";
    return;
  }

  if (source.type === "unsupported") {
    formMessage.textContent =
      "Link này chưa có cách phát được hỗ trợ. Hãy thử link file âm thanh, YouTube, SoundCloud hoặc Spotify.";
    return;
  }

  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Đang thêm...";

  try {
    const { error } = await supabaseClient
      .from("music_tracks")
      .insert({
        title,
        artist: artist || "Không rõ nghệ sĩ",
        genre,
        format: "link",
        audio_url: url,
        storage_path: null,
        file_name: null,
        source_type: "link",
        license: null
      });

    if (error) throw error;

    formMessage.textContent = "Đã thêm bài hát vào thư viện!";
    event.target.reset();

    await loadTracks();

  } catch (error) {
    console.error("Add link error:", error);
    formMessage.textContent =
      "Không thể thêm link: " + (error.message || "Lỗi không xác định");
  } finally {
    button.disabled = false;
    button.textContent = "Thêm vào thư viện";
  }
});

// ==========================================
// INITIALIZE
// ==========================================

async function init() {
  switchView("home");
  await loadTracks();
}
// XÓA BÀI HÁT
// ==========================================
// XÓA BÀI HÁT
// ==========================================


// ==========================================
// XÓA BÀI HÁT - CHỈ CHỦ WEBSITE
// ==========================================

document.addEventListener("click", async event => {
    const button = event.target.closest("[data-delete]");

    if (!button) return;

    const index = Number(button.dataset.delete);
    const track = tracks[index];

    if (!track) return;

    // Yêu cầu mật khẩu quản trị
    const password = prompt("Nhập mật khẩu quản trị để xóa bài hát:");

    if (password === null || password.trim() === "") {
        return;
    }

    const confirmed = confirm(
        `Bạn có chắc chắn muốn xóa "${track.title}" không?`
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Đang xóa...";

    const oldCurrentIndex = currentIndex;

    try {
        // Gọi Supabase Edge Function
        const { data, error } = await supabaseClient.functions.invoke(
            "delete-track",
            {
                body: {
                    trackId: track.id
                },
                headers: {
                    "x-admin-password": password
                }
            }
        );

        if (error) {
            let detail = error.message;

            if (error.context instanceof Response) {
                try {
                    const result = await error.context.clone().json();
                    detail = result.error || JSON.stringify(result);
                } catch {
                    detail = await error.context.clone().text();
                }
            }

            throw new Error(detail);
        }

        if (!data || !data.success) {
            throw new Error(data?.error || "Không thể xóa bài hát.");
        }

        // Nếu đang phát bài bị xóa thì dừng
        if (oldCurrentIndex === index) {
            stopCurrentPlayback();
            currentIndex = -1;

            nowTitle.textContent = "Chưa phát nhạc";
            nowArtist.textContent = "Chọn một bài hát để bắt đầu";
        } else if (oldCurrentIndex > index) {
            currentIndex = oldCurrentIndex - 1;
        }

        alert("Đã xóa bài hát thành công!");

        await loadTracks();

    } catch (error) {
        console.error("Delete error:", error);

        alert(
            "Không thể xóa bài hát: " +
            (error.message || "Lỗi không xác định")
        );

        button.disabled = false;
        button.textContent = "🗑";
    }
});

// ==========================================
// MUSIC DISCOVERY - DUYỆT NHẠC MỚI
// ==========================================

const discoverTracks = document.getElementById("discoverTracks");
const discoverMessage = document.getElementById("discoverMessage");
const pendingCount = document.getElementById("pendingCount");
const refreshDiscover = document.getElementById("refreshDiscover");

let discoveryPassword = "";

function discoveryMessageText(message) {
  discoverMessage.textContent = message;
  discoverMessage.hidden = false;
}

function createDiscoveryHTML(track) {
  const artwork = track.artwork_url
    ? `<img src="${escapeHTML(track.artwork_url)}"
         alt="Ảnh bìa"
         class="discover-cover"
         onerror="this.style.display='none'">`
    : `<div class="discover-cover-placeholder">♫</div>`;

  const releaseDate = track.release_date
    ? new Date(track.release_date).toLocaleDateString("vi-VN")
    : "Chưa rõ";

  return `
    <article class="discover-card">
      ${artwork}

      <div class="discover-info">
        <h3>${escapeHTML(track.title || "Không có tên")}</h3>

        <p>${escapeHTML(track.artist || "Không rõ nghệ sĩ")}</p>

        <div class="discover-meta">
          <span>🌍 ${escapeHTML(track.country_code || "N/A")}</span>
          <span>📅 ${escapeHTML(releaseDate)}</span>
        </div>

        <a href="${escapeHTML(track.track_url || "#")}"
           target="_blank"
           rel="noopener noreferrer">
          Nghe thử trên Apple Music ↗
        </a>
      </div>

      <div class="discover-actions">
        <button
          class="approve-btn"
          data-review-action="approve"
          data-review-id="${escapeHTML(track.id)}">
          ✓ Chấp nhận
        </button>

        <button
          class="reject-btn"
          data-review-action="reject"
          data-review-id="${escapeHTML(track.id)}">
          ✕ Từ chối
        </button>
      </div>
    </article>
  `;
}

// Gọi Edge Function
async function callReviewFunction(body) {
  const { data, error } = await supabaseClient.functions.invoke(
    "review-discovery",
    {
      body,
      headers: {
        "x-admin-password": discoveryPassword
      }
    }
  );

  if (error) {
    let detail = error.message;

    if (error.context instanceof Response) {
      try {
        const result = await error.context.clone().json();
        detail = result.error || result.detail || detail;
      } catch {
        detail = await error.context.clone().text();
      }
    }

    throw new Error(detail);
  }

  if (!data || !data.success) {
    throw new Error(data?.error || "Không thể xử lý yêu cầu.");
  }

  return data;
}

// Tải danh sách bài hát chờ duyệt
async function loadDiscoveries() {
  if (!discoverTracks) return;

  discoverTracks.innerHTML = "";
  discoveryMessageText("Đang tải danh sách nhạc mới...");

  if (!discoveryPassword) {
    discoveryPassword = prompt(
      "Nhập mật khẩu quản trị để xem danh sách nhạc mới:"
    );

    if (!discoveryPassword) {
      discoveryPassword = "";
      discoveryMessageText("Bạn chưa nhập mật khẩu quản trị.");
      return;
    }
  }

  if (refreshDiscover) {
    refreshDiscover.disabled = true;
  }

  try {
    const result = await callReviewFunction({
      action: "list"
    });

    const items = result.tracks || [];

    pendingCount.textContent = items.length;

    if (items.length === 0) {
      discoveryMessageText("Hiện chưa có bài hát nào đang chờ duyệt.");
      return;
    }

    discoverTracks.innerHTML = items
      .map(createDiscoveryHTML)
      .join("");

    discoverMessage.hidden = true;

  } catch (error) {
    console.error("Discovery error:", error);

    discoveryPassword = "";

    discoveryMessageText(
      "Không tải được danh sách: " + error.message
    );

  } finally {
    if (refreshDiscover) {
      refreshDiscover.disabled = false;
    }
  }
}

// ==========================================
// CHẤP NHẬN / TỪ CHỐI BÀI HÁT
// TÌM LINK YOUTUBE MIỄN PHÍ
// ==========================================

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-review-action]");
  if (!button) return;

  const action = button.dataset.reviewAction;
  const id = button.dataset.reviewId;

  if (!id || !["approve", "reject"].includes(action)) return;

  const card = button.closest(".discover-card");
  const title = card?.querySelector("h3")?.textContent || "";
  const artist = card?.querySelector(".discover-info p")?.textContent || "";

  let playbackUrl = null;

  if (action === "reject") {
    if (!confirm(`Bạn có chắc muốn từ chối "${title}"?`)) return;
  }

  if (action === "approve") {
    if (!confirm(`Tìm nguồn phát YouTube cho "${title}"?`)) return;

    const searchQuery = encodeURIComponent(`${title} ${artist}`);
    window.open(
      `https://www.youtube.com/results?search_query=${searchQuery}`,
      "_blank",
      "noopener,noreferrer"
    );

    playbackUrl = prompt(
      `Đã mở YouTube để tìm bài "${title}".\n\n` +
      `1. Chọn video đúng bài hát.\n` +
      `2. Sao chép đường link video.\n` +
      `3. Dán link vào đây.\n\n` +
      `Lưu ý: Có thể để trống nếu chưa tìm được nguồn phát.`
    );

    if (playbackUrl === null) return;

    playbackUrl = playbackUrl.trim();

    if (playbackUrl) {
      const source = identifySource(playbackUrl);

      if (source.type !== "youtube") {
        alert("Link không hợp lệ. Vui lòng dán link video YouTube.");
        return;
      }
    } else {
      playbackUrl = null;
    }
  }

  const buttons = card.querySelectorAll("button");
  buttons.forEach(item => item.disabled = true);
  button.textContent = "Đang xử lý...";

  try {
    await callReviewFunction({
      action,
      id,
      playback_url: playbackUrl
    });

    card.remove();

    const remaining =
      discoverTracks.querySelectorAll(".discover-card").length;

    pendingCount.textContent = remaining;

    if (remaining === 0) {
      discoveryMessageText(
        "Bạn đã xử lý hết danh sách nhạc chờ duyệt."
      );
    }

    if (action === "approve") {
      alert(
        playbackUrl
          ? "Đã thêm bài hát và lưu nguồn phát YouTube!"
          : "Đã thêm bài hát. Bạn có thể bổ sung nguồn phát sau."
      );

      await loadTracks();
    } else {
      alert("Đã từ chối bài hát.");
    }

  } catch (error) {
    console.error("Review error:", error);

    alert("Không thể xử lý: " + error.message);

    buttons.forEach(item => item.disabled = false);

    button.textContent =
      action === "approve" ? "✓ Chấp nhận" : "✕ Từ chối";
  }
});

// Nút làm mới
if (refreshDiscover) {
  refreshDiscover.addEventListener("click", loadDiscoveries);
}

// Tự tải khi mở mục Khám phá
const originalSwitchView = switchView;

switchView = function(viewName) {
  originalSwitchView(viewName);

  if (viewName === "discover") {
    loadDiscoveries();
  }
};



init();