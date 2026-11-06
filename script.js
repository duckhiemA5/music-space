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

const $ = id => document.getElementById(id);

const audio = $("audioPlayer");
const embedPlayer = $("embedPlayer");

const nowTitle = $("nowTitle");
const nowArtist = $("nowArtist");
const playBtn = $("playBtn");
const prevBtn = $("prevBtn");
const nextBtn = $("nextBtn");

const progressBar = $("progressBar");
const currentTimeText = $("currentTime");
const durationText = $("duration");
const volumeBar = $("volumeBar");

const recentTracks = $("recentTracks");
const libraryTracks = $("libraryTracks");
const emptyLibrary = $("emptyLibrary");
const formMessage = $("formMessage");

const discoverTracks = $("discoverTracks");
const discoverMessage = $("discoverMessage");
const pendingCount = $("pendingCount");
const refreshDiscover = $("refreshDiscover");

let tracks = [];
let currentIndex = -1;
let currentMode = "none";

let youtubePlayer = null;
let soundCloudWidget = null;
let spotifyController = null;

let spotifyReady = false;
let spotifyAPI = null;
let pendingSpotifyUrl = null;
let pendingYouTubeId = null;

let searchTerm = "";
let selectedGenre = "";
let discoveryPassword = "";

// ==========================================
// HELPERS
// ==========================================

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function getFileExtension(filename = "") {
  return filename.split(".").pop().toLowerCase();
}

function showMessage(message) {
  if (formMessage) {
    formMessage.textContent = message;
  }
}

function resetProgress() {
  if (progressBar) progressBar.value = 0;
  if (currentTimeText) currentTimeText.textContent = "0:00";
  if (durationText) durationText.textContent = "0:00";
}

// ==========================================
// IDENTIFY MUSIC LINKS
// ==========================================

function identifySource(value) {
  if (!value || typeof value !== "string") {
    return { type: "invalid" };
  }

  let url;

  try {
    url = new URL(value.trim());
  } catch {
    return { type: "invalid" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { type: "invalid" };
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube
  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    let id = "";

    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (url.pathname === "/watch") {
      id = url.searchParams.get("v") || "";
    } else {
      const match = url.pathname.match(
        /^\/(?:embed|shorts|live)\/([^/?]+)/
      );

      if (match) id = match[1];
    }

    if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return {
        type: "youtube",
        id,
        url: url.href
      };
    }

    return { type: "invalid" };
  }

  // Spotify
  if (host === "open.spotify.com") {
    const match = url.pathname.match(
      /^\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/
    );

    if (match) {
      return {
        type: "spotify",
        kind: match[1],
        id: match[2],
        url: url.href
      };
    }

    return { type: "invalid" };
  }

  // SoundCloud
  if (host === "soundcloud.com" || host === "m.soundcloud.com") {
    return {
      type: "soundcloud",
      url: url.href
    };
  }

  // Direct audio
  if (/\.(mp3|m4a|wav|ogg|oga|aac|flac|opus|alac)(?:$|[?#])/i.test(url.href)) {
    return {
      type: "direct",
      url: url.href
    };
  }

  return { type: "unsupported" };
}

// ==========================================
// VIEW NAVIGATION
// ==========================================

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(view => {
    view.classList.remove("active");
    view.hidden = true;
  });

  const target = $(viewName + "View");

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

  if ($("pageTitle")) {
    $("pageTitle").textContent = titles[viewName] || "Music Space";
  }

  if (viewName === "discover") {
    loadDiscoveries();
  }
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
// STOP PLAYBACK
// ==========================================

function stopCurrentPlayback() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  if (youtubePlayer) {
    try {
      youtubePlayer.destroy();
    } catch (error) {
      console.warn(error);
    }

    youtubePlayer = null;
  }

  if (spotifyController) {
    try {
      spotifyController.destroy();
    } catch (error) {
      console.warn(error);
    }

    spotifyController = null;
  }

  soundCloudWidget = null;

  if (embedPlayer) {
    embedPlayer.innerHTML = "";
    embedPlayer.hidden = true;
  }

  pendingYouTubeId = null;
  pendingSpotifyUrl = null;

  currentMode = "none";

  if (playBtn) playBtn.textContent = "▶";

  resetProgress();
}

// ==========================================
// YOUTUBE PLAYER
// ==========================================

window.onYouTubeIframeAPIReady = function () {
  if (pendingYouTubeId) {
    createYouTubePlayer(pendingYouTubeId);
  }
};

function createYouTubePlayer(videoId) {
  if (!window.YT || !window.YT.Player || !embedPlayer) {
    return false;
  }

  embedPlayer.innerHTML = '<div id="youtubePlayer"></div>';
  embedPlayer.hidden = false;

  youtubePlayer = new YT.Player("youtubePlayer", {
    width: "100%",
    height: "200",
    videoId,

    playerVars: {
      autoplay: 1,
      playsinline: 1,
      controls: 1
    },

    events: {
      onReady: event => {
        event.target.playVideo();
      },

      onStateChange: event => {
        if (!window.YT) return;

        if (event.data === YT.PlayerState.PLAYING) {
          playBtn.textContent = "Ⅱ";
        }

        if (event.data === YT.PlayerState.PAUSED) {
          playBtn.textContent = "▶";
        }

        if (event.data === YT.PlayerState.ENDED) {
          playNextTrack();
        }
      },

      onError: event => {
        console.error("YouTube error:", event.data);
        playBtn.textContent = "▶";
      }
    }
  });

  return true;
}

// ==========================================
// SPOTIFY PLAYER
// ==========================================

window.onSpotifyIframeApiReady = function (api) {
  spotifyReady = true;
  spotifyAPI = api;

  if (pendingSpotifyUrl) {
    createSpotifyPlayer(pendingSpotifyUrl, api);
  }
};

function createSpotifyPlayer(url, api = window.SpotifyIframeApi) {
  if (!api || !embedPlayer) return false;

  embedPlayer.innerHTML = '<div id="spotifyPlayer"></div>';
  embedPlayer.hidden = false;

  api.createController(
    $("spotifyPlayer"),
    {
      uri: url,
      width: "100%",
      height: 152
    },
    controller => {
      spotifyController = controller;

      controller.addListener("ready", () => {
        controller.play();
      });

      controller.addListener("playback_update", event => {
        const data = event.data;

        playBtn.textContent = data.isPaused ? "▶" : "Ⅱ";

        const position = data.position || 0;
        const duration = data.duration || 0;

        window.spotifyDuration = duration;

        if (duration > 0) {
          progressBar.value = position / duration * 100;

          currentTimeText.textContent =
            formatTime(position / 1000);

          durationText.textContent =
            formatTime(duration / 1000);
        }
      });
    }
  );

  return true;
}

// ==========================================
// SOUNDCLOUD PLAYER
// ==========================================

async function createSoundCloudPlayer(url) {
  try {
    if (!window.SC) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src =
          "https://w.soundcloud.com/player/api.js";

        script.onload = resolve;
        script.onerror = reject;

        document.head.appendChild(script);
      });
    }

    const response = await fetch(
      "https://soundcloud.com/oembed?format=json&url=" +
      encodeURIComponent(url)
    );

    if (!response.ok) {
      throw new Error("Không lấy được dữ liệu SoundCloud.");
    }

    const data = await response.json();

    const parser = new DOMParser();
    const doc = parser.parseFromString(data.html, "text/html");

    const original = doc.querySelector("iframe");

    if (!original) {
      throw new Error("Không tìm thấy trình phát.");
    }

    const iframe = document.createElement("iframe");

    iframe.width = "100%";
    iframe.height = "166";
    iframe.scrolling = "no";
    iframe.frameBorder = "0";
    iframe.allow = "autoplay";

    const playerURL = new URL(original.src);
    playerURL.searchParams.set("auto_play", "true");

    iframe.src = playerURL.href;

    embedPlayer.innerHTML = "";
    embedPlayer.appendChild(iframe);
    embedPlayer.hidden = false;

    iframe.onload = () => {
      soundCloudWidget = SC.Widget(iframe);

      soundCloudWidget.bind(SC.Widget.Events.READY, () => {
        soundCloudWidget.play();
      });

      soundCloudWidget.bind(SC.Widget.Events.PLAY, () => {
        playBtn.textContent = "Ⅱ";
      });

      soundCloudWidget.bind(SC.Widget.Events.PAUSE, () => {
        playBtn.textContent = "▶";
      });

      soundCloudWidget.bind(SC.Widget.Events.FINISH, playNextTrack);
    };

    return true;

  } catch (error) {
    console.error(error);
    alert("Không thể phát SoundCloud: " + error.message);
    return false;
  }
}

// ==========================================
// CREATE EMBED
// ==========================================

async function createEmbed(source) {
  if (source.type === "youtube") {
    pendingYouTubeId = source.id;

    if (window.YT && window.YT.Player) {
      return createYouTubePlayer(source.id);
    }

    return true;
  }

  if (source.type === "spotify") {
    const url =
      `https://open.spotify.com/${source.kind}/${source.id}`;

    pendingSpotifyUrl = url;

    if (spotifyReady && spotifyAPI) {
      return createSpotifyPlayer(url, spotifyAPI);
    }

    return true;
  }

  if (source.type === "soundcloud") {
    return await createSoundCloudPlayer(source.url);
  }

  return false;
}

// ==========================================
// PLAY TRACK
// ==========================================

async function playTrack(index) {
  if (index < 0 || index >= tracks.length) return;

  const track = tracks[index];

  currentIndex = index;

  stopCurrentPlayback();

  nowTitle.textContent = track.title || "Không có tên";
  nowArtist.textContent = track.artist || "Không rõ nghệ sĩ";

  const playbackUrl =
    track.playback_url ||
    track.audio_url ||
    "";

  if (!playbackUrl) {
    alert("Bài hát chưa có nguồn phát.");
    return;
  }

  // File lưu trên Supabase
  if (track.source_type === "file" || track.storage_path) {
    currentMode = "audio";
    audio.src = playbackUrl;

    try {
      await audio.play();
    } catch (error) {
      console.error(error);
      alert("Không phát được file nhạc. Hãy kiểm tra URL và quyền Storage.");
    }

    renderTracks();
    return;
  }

  const source = identifySource(playbackUrl);

  // File âm thanh trực tiếp
  if (source.type === "direct") {
    currentMode = "audio";
    audio.src = source.url;

    try {
      await audio.play();
    } catch (error) {
      console.error(error);
      alert("Không phát được nguồn âm thanh này.");
    }

    renderTracks();
    return;
  }

  // Nhạc nhúng
  if (
    ["youtube", "spotify", "soundcloud"].includes(source.type)
  ) {
    currentMode = "embed";

    const success = await createEmbed(source);

    if (!success) {
      alert("Không thể tạo trình phát cho link này.");
    }

    renderTracks();
    return;
  }

  alert("Link nhạc không được hỗ trợ.");
}

// ==========================================
// NEXT / PREVIOUS
// ==========================================

function playNextTrack() {
  if (!tracks.length) return;

  playTrack((currentIndex + 1) % tracks.length);
}

function playPreviousTrack() {
  if (!tracks.length) return;

  const index =
    currentIndex <= 0
      ? tracks.length - 1
      : currentIndex - 1;

  playTrack(index);
}

// ==========================================
// PLAYER CONTROLS
// ==========================================

if (playBtn) {
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

      return;
    }

    if (currentMode === "embed") {
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
}

prevBtn?.addEventListener("click", playPreviousTrack);
nextBtn?.addEventListener("click", playNextTrack);

audio?.addEventListener("play", () => {
  playBtn.textContent = "Ⅱ";
});

audio?.addEventListener("pause", () => {
  playBtn.textContent = "▶";
});

audio?.addEventListener("ended", playNextTrack);

// ==========================================
// PROGRESS
// ==========================================

function updateProgress() {
  if (currentMode === "audio" && audio) {
    if (!Number.isFinite(audio.duration)) return;

    progressBar.value =
      audio.currentTime / audio.duration * 100;

    currentTimeText.textContent =
      formatTime(audio.currentTime);

    durationText.textContent =
      formatTime(audio.duration);
  }

  if (currentMode === "embed" && youtubePlayer) {
    try {
      const current = youtubePlayer.getCurrentTime();
      const total = youtubePlayer.getDuration();

      if (total > 0) {
        progressBar.value = current / total * 100;
        currentTimeText.textContent = formatTime(current);
        durationText.textContent = formatTime(total);
      }
    } catch (error) {
      console.warn(error);
    }
  }

  if (currentMode === "embed" && soundCloudWidget) {
    soundCloudWidget.getPosition(position => {
      soundCloudWidget.getDuration(duration => {
        if (duration > 0) {
          progressBar.value = position / duration * 100;

          currentTimeText.textContent =
            formatTime(position / 1000);

          durationText.textContent =
            formatTime(duration / 1000);
        }
      });
    });
  }
}

setInterval(updateProgress, 500);

audio?.addEventListener("loadedmetadata", () => {
  durationText.textContent = formatTime(audio.duration);
});

progressBar?.addEventListener("change", () => {
  const percent = Number(progressBar.value) / 100;

  if (currentMode === "audio" && Number.isFinite(audio.duration)) {
    audio.currentTime = percent * audio.duration;
  } else if (youtubePlayer) {
    const total = youtubePlayer.getDuration();

    if (total > 0) {
      youtubePlayer.seekTo(percent * total, true);
    }
  } else if (soundCloudWidget) {
    soundCloudWidget.getDuration(duration => {
      soundCloudWidget.seekTo(percent * duration);
    });
  } else if (spotifyController) {
    const total = window.spotifyDuration || 0;

    if (total > 0) {
      spotifyController.seek(percent * total);
    }
  }
});

// ==========================================
// VOLUME
// ==========================================

function updateVolume() {
  const volume = Number(volumeBar.value);

  audio.volume = volume;

  if (youtubePlayer) {
    youtubePlayer.setVolume(volume * 100);
  }

  if (soundCloudWidget) {
    soundCloudWidget.setVolume(volume * 100);
  }

  if (spotifyController) {
    spotifyController.setVolume(volume);
  }
}

volumeBar?.addEventListener("input", updateVolume);

if (audio) audio.volume = 0.8;

// ==========================================
// RENDER TRACKS
// ==========================================

function createTrackHTML(track, index) {
  return `
        <div class="track-row">
            <div class="track-cover">♫</div>

            <div>
                <div class="track-name">
                    ${escapeHTML(track.title || "Không có tên")}
                </div>

                <div class="track-artist">
                    ${escapeHTML(track.artist || "Không rõ nghệ sĩ")}
                </div>
            </div>

            <div class="track-genre">
                ${escapeHTML(track.genre || "Khác")}
            </div>

            <div class="track-actions">
                <button class="track-play"
                    data-play="${index}" title="Phát">▶</button>

                <button class="track-delete"
                    data-delete="${index}" title="Xóa">🗑</button>
            </div>
        </div>
    `;
}

function renderTracks() {
  const filtered = tracks.filter(track => {
    const text = [
      track.title,
      track.artist,
      track.genre
    ].join(" ").toLowerCase();

    const matchesSearch = text.includes(searchTerm);

    const matchesGenre =
      !selectedGenre ||
      (track.genre || "").toLowerCase() ===
      selectedGenre.toLowerCase();

    return matchesSearch && matchesGenre;
  });

  const sort = $("sortSelect")?.value;

  if (sort === "title") {
    filtered.sort((a, b) =>
      (a.title || "").localeCompare(b.title || "")
    );
  } else if (sort === "artist") {
    filtered.sort((a, b) =>
      (a.artist || "").localeCompare(b.artist || "")
    );
  } else {
    filtered.sort((a, b) =>
      new Date(b.created_at || 0) -
      new Date(a.created_at || 0)
    );
  }

  if (libraryTracks) {
    libraryTracks.innerHTML = filtered.map(track =>
      createTrackHTML(track, tracks.indexOf(track))
    ).join("");
  }

  if (emptyLibrary) {
    emptyLibrary.hidden = filtered.length > 0;
  }

  if (recentTracks) {
    const recent = [...tracks]
      .sort((a, b) =>
        new Date(b.created_at || 0) -
        new Date(a.created_at || 0)
      )
      .slice(0, 5);

    recentTracks.innerHTML = recent.map(track =>
      createTrackHTML(track, tracks.indexOf(track))
    ).join("");
  }
}

// ==========================================
// PLAY BUTTON DELEGATION
// ==========================================

document.addEventListener("click", event => {
  const button = event.target.closest("[data-play]");

  if (!button) return;

  playTrack(Number(button.dataset.play));
});

// ==========================================
// SEARCH / SORT / GENRE
// ==========================================

$("sortSelect")?.addEventListener("change", renderTracks);

$("searchInput")?.addEventListener("input", event => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderTracks();
});

document.querySelectorAll("[data-genre]").forEach(button => {
  button.addEventListener("click", () => {
    selectedGenre = button.dataset.genre;
    searchTerm = "";

    if ($("searchInput")) {
      $("searchInput").value = "";
    }

    switchView("library");
    renderTracks();
  });
});

// ==========================================
// LOAD TRACKS FROM SUPABASE
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

    if (libraryTracks) {
      libraryTracks.innerHTML =
        `<p class="empty-state">
                    Không tải được thư viện: ${escapeHTML(error.message)}
                </p>`;
    }
  }
}
// ==========================================
// UPLOAD AUDIO FILE
// ==========================================

$("uploadForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const file = $("audioFile")?.files?.[0];

  if (!file) {
    showMessage("Bạn chưa chọn file nhạc.");
    return;
  }

  const allowedExtensions = [
    "mp3", "wav", "ogg", "oga",
    "m4a", "aac", "flac", "alac",
    "opus", "mp4"
  ];

  const extension = getFileExtension(file.name);

  if (!allowedExtensions.includes(extension)) {
    showMessage("Định dạng file không được hỗ trợ.");
    return;
  }

  const maxSize = 50 * 1024 * 1024;

  if (file.size > maxSize) {
    showMessage("File vượt quá giới hạn 50 MB.");
    return;
  }

  const title =
    $("fileTitle").value.trim() ||
    file.name.replace(/\.[^/.]+$/, "");

  const artist =
    $("fileArtist").value.trim() ||
    "Không rõ nghệ sĩ";

  const genre = $("fileGenre").value;

  const button = event.submitter;

  if (button) {
    button.disabled = true;
    button.textContent = "Đang tải lên...";
  }

  let uploadedPath = null;

  try {
    const safeName = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_.-]/g, "_");

    uploadedPath = `${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabaseClient
      .storage
      .from(BUCKET)
      .upload(uploadedPath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient
      .storage
      .from(BUCKET)
      .getPublicUrl(uploadedPath);

    const audioUrl = publicData.publicUrl;

    const { error: insertError } = await supabaseClient
      .from("music_tracks")
      .insert({
        title,
        artist,
        genre,
        format: extension,
        audio_url: audioUrl,
        storage_path: uploadedPath,
        file_name: file.name,
        source_type: "file",
        license: null
      });

    if (insertError) throw insertError;

    showMessage("Đã tải nhạc lên thành công!");

    event.target.reset();

    await loadTracks();

  } catch (error) {
    console.error("Upload error:", error);

    // Nếu lưu DB thất bại, xóa file vừa tải lên
    if (uploadedPath) {
      await supabaseClient
        .storage
        .from(BUCKET)
        .remove([uploadedPath]);
    }

    showMessage(
      "Tải lên thất bại: " + error.message
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Tải lên thư viện";
    }
  }
});

// ==========================================
// ADD MUSIC LINK
// ==========================================

$("linkForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const url = $("musicUrl").value.trim();
  const title = $("linkTitle").value.trim();
  const artist = $("linkArtist").value.trim();
  const genre = $("linkGenre").value;

  const source = identifySource(url);

  if (source.type === "invalid") {
    showMessage("Đường link không hợp lệ.");
    return;
  }

  if (source.type === "unsupported") {
    showMessage(
      "Link chưa được hỗ trợ. Hãy dùng link MP3, M4A, YouTube, Spotify hoặc SoundCloud."
    );
    return;
  }

  const button = event.submitter;

  if (button) {
    button.disabled = true;
    button.textContent = "Đang thêm...";
  }

  try {
    const { error } = await supabaseClient
      .from("music_tracks")
      .insert({
        title,
        artist: artist || "Không rõ nghệ sĩ",
        genre,
        format: "link",
        audio_url: url,
        playback_url: url,
        storage_path: null,
        file_name: null,
        source_type: source.type,
        license: null
      });

    if (error) throw error;

    showMessage("Đã thêm bài hát vào thư viện!");

    event.target.reset();

    await loadTracks();

  } catch (error) {
    console.error("Add link error:", error);

    showMessage(
      "Không thể thêm link: " + error.message
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Thêm vào thư viện";
    }
  }
});

// ==========================================
// DELETE TRACK - ADMIN ONLY
// ==========================================

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-delete]");

  if (!button) return;

  const index = Number(button.dataset.delete);
  const track = tracks[index];

  if (!track) return;

  const password = prompt(
    "Nhập mật khẩu quản trị để xóa bài hát:"
  );

  if (password === null || !password.trim()) return;

  const confirmed = confirm(
    `Bạn có chắc chắn muốn xóa "${track.title}" không?`
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Đang xóa...";

  const oldIndex = currentIndex;

  try {
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
          const result =
            await error.context.clone().json();

          detail = result.error || detail;
        } catch {
          detail = await error.context.clone().text();
        }
      }

      throw new Error(detail);
    }

    if (!data || !data.success) {
      throw new Error(
        data?.error || "Không thể xóa bài hát."
      );
    }

    if (oldIndex === index) {
      stopCurrentPlayback();

      currentIndex = -1;

      nowTitle.textContent = "Chưa phát nhạc";
      nowArtist.textContent =
        "Chọn một bài hát để bắt đầu";

    } else if (oldIndex > index) {
      currentIndex = oldIndex - 1;
    }

    alert("Đã xóa bài hát thành công!");

    await loadTracks();

  } catch (error) {
    console.error("Delete error:", error);

    alert("Không thể xóa bài hát: " + error.message);

    button.disabled = false;
    button.textContent = "🗑";
  }
});

// ==========================================
// MUSIC DISCOVERY
// ==========================================

function discoveryMessageText(message) {
  if (!discoverMessage) return;

  discoverMessage.textContent = message;
  discoverMessage.hidden = false;
}

function createDiscoveryHTML(track) {
  const artwork = track.artwork_url
    ? `
            <img
                src="${escapeHTML(track.artwork_url)}"
                alt="Ảnh bìa"
                class="discover-cover"
                onerror="this.style.display='none'"
            >
        `
    : `
            <div class="discover-cover-placeholder">♫</div>
        `;

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

                <a
                    href="${escapeHTML(track.track_url || "#")}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Nghe thử trên Apple Music ↗
                </a>
            </div>

            <div class="discover-actions">
                <button
                    class="approve-btn"
                    data-review-action="approve"
                    data-review-id="${escapeHTML(track.id)}"
                >
                    ✓ Chấp nhận
                </button>

                <button
                    class="reject-btn"
                    data-review-action="reject"
                    data-review-id="${escapeHTML(track.id)}"
                >
                    ✕ Từ chối
                </button>
            </div>
        </article>
    `;
}

// ==========================================
// CALL REVIEW EDGE FUNCTION
// ==========================================

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
        const result =
          await error.context.clone().json();

        detail = result.error || result.detail || detail;
      } catch {
        detail = await error.context.clone().text();
      }
    }

    throw new Error(detail);
  }

  if (!data || !data.success) {
    throw new Error(
      data?.error || "Không thể xử lý yêu cầu."
    );
  }

  return data;
}

// ==========================================
// LOAD DISCOVERIES
// ==========================================

async function loadDiscoveries() {
  if (!discoverTracks) return;

  discoverTracks.innerHTML = "";

  discoveryMessageText("Đang tải danh sách nhạc mới...");

  if (!discoveryPassword) {
    const password = prompt(
      "Nhập mật khẩu quản trị để xem danh sách nhạc mới:"
    );

    if (!password) {
      discoveryMessageText(
        "Bạn chưa nhập mật khẩu quản trị."
      );
      return;
    }

    discoveryPassword = password;
  }

  if (refreshDiscover) {
    refreshDiscover.disabled = true;
  }

  try {
    const result = await callReviewFunction({
      action: "list"
    });

    const items = result.tracks || [];

    if (pendingCount) {
      pendingCount.textContent = items.length;
    }

    if (items.length === 0) {
      discoveryMessageText(
        "Hiện chưa có bài hát nào đang chờ duyệt."
      );
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
// APPROVE / REJECT DISCOVERY
// ==========================================

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-review-action]");

  if (!button) return;

  const action = button.dataset.reviewAction;
  const id = button.dataset.reviewId;

  if (!id || !["approve", "reject"].includes(action)) {
    return;
  }

  const card = button.closest(".discover-card");

  const title =
    card?.querySelector("h3")?.textContent || "";

  const artist =
    card?.querySelector(".discover-info p")?.textContent || "";

  let playbackUrl = null;

  if (action === "reject") {
    if (!confirm(`Bạn có chắc muốn từ chối "${title}"?`)) {
      return;
    }
  }

  if (action === "approve") {
    if (!confirm(`Tìm nguồn phát YouTube cho "${title}"?`)) {
      return;
    }

    const searchQuery = encodeURIComponent(
      `${title} ${artist}`
    );

    window.open(
      `https://www.youtube.com/results?search_query=${searchQuery}`,
      "_blank",
      "noopener,noreferrer"
    );

    playbackUrl = prompt(
      `Đã mở YouTube để tìm bài "${title}".\n\n` +
      "1. Chọn video đúng bài hát.\n" +
      "2. Sao chép đường link video.\n" +
      "3. Dán link vào đây.\n\n" +
      "Có thể để trống nếu chưa tìm được nguồn phát."
    );

    if (playbackUrl === null) return;

    playbackUrl = playbackUrl.trim();

    if (playbackUrl) {
      const source = identifySource(playbackUrl);

      if (source.type !== "youtube") {
        alert("Vui lòng dán link video YouTube hợp lệ.");
        return;
      }
    } else {
      playbackUrl = null;
    }
  }

  const buttons = card.querySelectorAll("button");

  buttons.forEach(item => {
    item.disabled = true;
  });

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

    if (pendingCount) {
      pendingCount.textContent = remaining;
    }

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

    buttons.forEach(item => {
      item.disabled = false;
    });

    button.textContent =
      action === "approve"
        ? "✓ Chấp nhận"
        : "✕ Từ chối";
  }
});

// ==========================================
// REFRESH DISCOVERY
// ==========================================

refreshDiscover?.addEventListener("click", loadDiscoveries);

// ==========================================
// INITIALIZE
// ==========================================

async function init() {
  switchView("home");

  await loadTracks();
}

init();