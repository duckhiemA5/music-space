
const audio = document.getElementById("audioPlayer");

let tracks = [];
let currentIndex = -1;
let toastTimer;

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function getFileExtension(name) {
  return (name.split(".").pop() || "").toUpperCase();
}

function getFilteredTracks() {
  const keyword = $("searchInput").value.trim().toLowerCase();
  const genre = $("genreFilter").value;
  const format = $("formatFilter").value;

  return tracks.filter(track => {
    const matchesSearch =
      `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(keyword);
    const matchesGenre = genre === "all" || track.genre === genre;
    const matchesFormat = format === "all" || track.format === format;
    return matchesSearch && matchesGenre && matchesFormat;
  });
}

function renderTrack(track, index) {
  const row = document.createElement("div");
  row.className = "track-row";

  const cover = document.createElement("div");
  cover.className = "track-cover";
  cover.textContent = "♫";

  const info = document.createElement("div");
  info.className = "track-info";

  const title = document.createElement("strong");
  title.textContent = track.title;

  const artist = document.createElement("span");
  artist.textContent = track.artist;

  info.append(title, artist);

  const genre = document.createElement("span");
  genre.className = "track-meta";
  genre.textContent = track.genre;

  const format = document.createElement("span");
  format.className = "track-format";
  format.textContent = track.format;

  const actions = document.createElement("div");
  actions.className = "track-actions";

  const play = document.createElement("button");
  play.className = "icon-btn";
  play.textContent = "▶";
  play.title = "Phát nhạc";
  play.addEventListener("click", () => playTrack(index));

  const download = document.createElement("button");
  download.className = "icon-btn";
  download.textContent = "↓";
  download.title = "Tải nhạc";
  download.addEventListener("click", () => downloadTrack(track));

  actions.append(play, download);
  row.append(cover, info, genre, format, actions);
  return row;
}

function fillTrackList(container, list) {
  container.replaceChildren();
  list.forEach(track => {
    const originalIndex = tracks.indexOf(track);
    container.appendChild(renderTrack(track, originalIndex));
  });
}

function renderAll() {
  fillTrackList($("homeTracks"), tracks.slice(0, 5));

  const filtered = getFilteredTracks();
  fillTrackList($("libraryTracks"), filtered);

  $("trackCount").textContent = `${filtered.length} bài hát`;
  $("emptyLibrary").classList.toggle("hidden", filtered.length !== 0);
}

function openView(view) {
  const views = {
    home: $("homeView"),
    library: $("libraryView"),
    upload: $("uploadView")
  };

  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("hidden", key !== view);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  const names = { home: "Khám phá", library: "Thư viện", upload: "Thêm nhạc" };
  $("page-name").textContent = names[view] || "Music Space";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function playTrack(index) {
  if (index < 0 || index >= tracks.length) return;

  currentIndex = index;
  const track = tracks[currentIndex];

  audio.src = track.url;
  audio.play().then(() => {
    $("playBtn").textContent = "Ⅱ";
  }).catch(() => {
    showToast("Không thể phát tệp này trên trình duyệt.");
  });

  $("playerTitle").textContent = track.title;
  $("playerArtist").textContent = `${track.artist} · ${track.format}`;
}

function togglePlay() {
  if (currentIndex === -1) {
    if (tracks.length) playTrack(0);
    else showToast("Thư viện chưa có bài hát.");
    return;
  }

  if (audio.paused) {
    audio.play().then(() => $("playBtn").textContent = "Ⅱ")
      .catch(() => showToast("Không thể phát bài hát này."));
  } else {
    audio.pause();
    $("playBtn").textContent = "▶";
  }
}

function nextTrack() {
  if (!tracks.length) return;
  playTrack((currentIndex + 1) % tracks.length);
}

function previousTrack() {
  if (!tracks.length) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else {
    playTrack((currentIndex - 1 + tracks.length) % tracks.length);
  }
}

function downloadTrack(track) {
  const link = document.createElement("a");
  link.href = track.url;
  link.download = track.fileName || `${track.title}.${track.format.toLowerCase()}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function addTrack(track) {
  tracks.unshift(track);
  renderAll();
  showToast("Đã thêm nhạc vào thư viện!");
  openView("library");
}

// Điều hướng
document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => openView(button.dataset.view));
});

document.querySelectorAll("[data-open-upload]").forEach(button => {
  button.addEventListener("click", () => openView("upload"));
});

$("exploreBtn").addEventListener("click", () => openView("library"));
$("seeAllBtn").addEventListener("click", () => openView("library"));

document.querySelectorAll("[data-genre]").forEach(button => {
  button.addEventListener("click", () => {
    $("genreFilter").value = button.dataset.genre;
    $("searchInput").value = "";
    openView("library");
    renderAll();
  });
});

// Tìm kiếm và bộ lọc
$("searchInput").addEventListener("input", () => {
  if ($("libraryView").classList.contains("hidden")) {
    openView("library");
  }
  renderAll();
});

$("genreFilter").addEventListener("change", renderAll);
$("formatFilter").addEventListener("change", renderAll);

// Chọn file và tự điền tên
$("audioFile").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;

  const name = file.name.replace(/\.[^/.]+$/, "");
  $("uploadTitle").value = name;
  $("uploadFormat").value = getFileExtension(file.name) === "M4A"
    ? "M4A"
    : getFileExtension(file.name);

  const dropZone = document.querySelector(".drop-zone strong");
  dropZone.textContent = file.name;
});

// Thêm nhạc từ máy tính
$("uploadForm").addEventListener("submit", event => {
  event.preventDefault();

  const file = $("audioFile").files[0];
  if (!file) {
    showToast("Bạn chưa chọn tệp nhạc.");
    return;
  }

  const allowed = ["AAC", "ALAC", "M4A", "MP3", "FLAC", "WAV"];
  const extension = getFileExtension(file.name);

  if (!allowed.includes(extension)) {
    showToast("Định dạng tệp chưa được hỗ trợ.");
    return;
  }

  const url = URL.createObjectURL(file);

  addTrack({
    title: $("uploadTitle").value.trim(),
    artist: $("uploadArtist").value.trim(),
    genre: $("uploadGenre").value,
    format: $("uploadFormat").value,
    license: $("uploadLicense").value.trim(),
    url,
    fileName: file.name,
    local: true
  });

  $("uploadForm").reset();
  document.querySelector(".drop-zone strong").textContent = "Chọn tệp nhạc";
});

// Thêm nhạc bằng URL trực tiếp
$("linkForm").addEventListener("submit", event => {
  event.preventDefault();

  const url = $("audioUrl").value.trim();

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Invalid protocol");
    }
  } catch {
    showToast("Đường dẫn không hợp lệ.");
    return;
  }

  addTrack({
    title: $("linkTitle").value.trim(),
    artist: $("linkArtist").value.trim(),
    genre: $("linkGenre").value,
    format: $("linkFormat").value,
    license: $("linkLicense").value.trim(),
    url,
    fileName: `${$("linkTitle").value.trim()}.${$("linkFormat").value.toLowerCase()}`,
    local: false
  });

  $("linkForm").reset();
});

// Điều khiển trình phát
$("playBtn").addEventListener("click", togglePlay);
$("nextBtn").addEventListener("click", nextTrack);
$("prevBtn").addEventListener("click", previousTrack);

$("volumeBar").addEventListener("input", event => {
  audio.volume = Number(event.target.value);
});
audio.volume = 0.8;

audio.addEventListener("timeupdate", () => {
  $("currentTime").textContent = formatTime(audio.currentTime);
  $("duration").textContent = formatTime(audio.duration);

  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    $("seekBar").value = (audio.currentTime / audio.duration) * 100;
  }
});

$("seekBar").addEventListener("input", event => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
  }
});

audio.addEventListener("ended", nextTrack);
audio.addEventListener("play", () => $("playBtn").textContent = "Ⅱ");
audio.addEventListener("pause", () => $("playBtn").textContent = "▶");

// Khởi tạo
renderAll();
openView("home");
