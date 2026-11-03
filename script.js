
// ======================================
// 1. KẾT NỐI SUPABASE
// ======================================

const SUPABASE_URL = "https://vgwixirwiubqydggvepg.supabase.co";
const SUPABASE_KEY = "sb_publishable_KggJYi1-KgKxmN9hr-kODg_KTj_KMvC";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const BUCKET = "music";

let tracks = [];
let currentIndex = -1;


// ======================================
// 2. CÁC PHẦN TỬ HTML
// ======================================

const audio = document.getElementById("audioPlayer");
const playBtn = document.getElementById("playBtn");
const seekBar = document.getElementById("seekBar");
const volumeBar = document.getElementById("volumeBar");


// ======================================
// 3. THÔNG BÁO
// ======================================

function showToast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.style.display = "block";

    setTimeout(() => {
        toast.style.display = "none";
    }, 3500);
}


// ======================================
// 4. CHUYỂN TRANG
// ======================================

function switchView(viewName) {
    document.querySelectorAll(".view").forEach(view => {
        view.hidden = true;
    });

    const selected = document.getElementById(viewName + "View");

    if (selected) selected.hidden = false;

    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === viewName
        );
    });

    const names = {
        home: "Khám phá",
        library: "Thư viện",
        upload: "Thêm nhạc"
    };

    document.getElementById("page-name").textContent =
        names[viewName] || "Music Space";
}

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
        switchView(button.dataset.view);
    });
});


// ======================================
// 5. TẢI DANH SÁCH NHẠC
// ======================================

async function loadTracks() {
    try {
        const { data, error } = await db
            .from("music_tracks")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        tracks = data || [];

        renderTracks();
        updateStatistics();

    } catch (error) {
        console.error("Lỗi tải danh sách:", error);
        showToast("Không tải được thư viện: " + error.message);
    }
}


// ======================================
// 6. HIỂN THỊ NHẠC
// ======================================

function createTrackElement(track, index) {
    const item = document.createElement("div");
    item.className = "track-item";

    const info = document.createElement("div");
    info.className = "track-info";

    const cover = document.createElement("div");
    cover.className = "track-cover";
    cover.textContent = "♫";

    const text = document.createElement("div");

    const title = document.createElement("h4");
    title.textContent = track.title;

    const artist = document.createElement("p");
    artist.textContent = track.artist + " · " + track.genre;

    text.append(title, artist);
    info.append(cover, text);

    const actions = document.createElement("div");

    const play = document.createElement("button");
    play.textContent = "▶";
    play.title = "Phát nhạc";
    play.addEventListener("click", () => playTrack(index));

    const download = document.createElement("button");
    download.textContent = "↓";
    download.title = "Tải xuống";
    download.addEventListener("click", () => {
        const link = document.createElement("a");
        link.href = track.audio_url;
        link.download = track.file_name || track.title;
        link.target = "_blank";
        link.click();
    });

    actions.append(play, download);
    item.append(info, actions);

    return item;
}


function renderTracks() {
    const home = document.getElementById("homeTracks");
    const library = document.getElementById("libraryTracks");

    home.innerHTML = "";
    library.innerHTML = "";

    const keyword =
        document.getElementById("searchInput").value.toLowerCase();

    const genre =
        document.getElementById("genreFilter")?.value || "all";

    const format =
        document.getElementById("formatFilter")?.value || "all";

    const filtered = tracks.filter(track => {
        const matchesSearch =
            (track.title || "").toLowerCase().includes(keyword) ||
            (track.artist || "").toLowerCase().includes(keyword);

        const matchesGenre =
            genre === "all" || track.genre === genre;

        const matchesFormat =
            format === "all" || track.format === format;

        return matchesSearch && matchesGenre && matchesFormat;
    });

    filtered.forEach(track => {
        const index = tracks.indexOf(track);

        library.appendChild(createTrackElement(track, index));
    });

    tracks.slice(0, 5).forEach(track => {
        const index = tracks.indexOf(track);
        home.appendChild(createTrackElement(track, index));
    });

    document.getElementById("trackCount").textContent =
        filtered.length + " bài hát";

    document.getElementById("emptyLibrary").hidden =
        filtered.length !== 0;
}


// ======================================
// 7. THỐNG KÊ
// ======================================


function updateStatistics() {
    const countElement = document.getElementById("homeTrackCount");

    if (countElement) {
        countElement.textContent = tracks.length;
    }
}


// ======================================
// 8. PHÁT NHẠC
// ======================================


function playTrack(index) {
    if (!tracks[index]) return;

    currentIndex = index;
    const track = tracks[index];

    const isZingLink =
        track.audio_url.includes("zingmp3.vn");

    if (isZingLink) {
        window.open(track.audio_url, "_blank");
        showToast("Đang mở bài hát trên Zing MP3");

        document.getElementById("playerTitle").textContent =
            track.title;

        document.getElementById("playerArtist").textContent =
            track.artist + " · Zing MP3";

        return;
    }

    audio.src = track.audio_url;

    document.getElementById("playerTitle").textContent =
        track.title;

    document.getElementById("playerArtist").textContent =
        track.artist;

    audio.play()
        .then(() => {
            playBtn.textContent = "Ⅱ";
        })
        .catch(() => {
            showToast("Không phát được file âm thanh này.");
        });

    renderRecent(track);
}


playBtn.addEventListener("click", () => {
    if (!audio.src) {
        if (tracks.length > 0) playTrack(0);
        return;
    }

    if (audio.paused) {
        audio.play();
        playBtn.textContent = "Ⅱ";
    } else {
        audio.pause();
        playBtn.textContent = "▶";
    }
});

document.getElementById("prevBtn").addEventListener("click", () => {
    if (tracks.length === 0) return;

    currentIndex =
        (currentIndex - 1 + tracks.length) % tracks.length;

    playTrack(currentIndex);
});

document.getElementById("nextBtn").addEventListener("click", () => {
    if (tracks.length === 0) return;

    currentIndex = (currentIndex + 1) % tracks.length;

    playTrack(currentIndex);
});

audio.addEventListener("ended", () => {
    if (tracks.length === 0) return;

    currentIndex = (currentIndex + 1) % tracks.length;
    playTrack(currentIndex);
});

audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;

    seekBar.value =
        (audio.currentTime / audio.duration) * 100;

    document.getElementById("currentTime").textContent =
        formatTime(audio.currentTime);

    document.getElementById("duration").textContent =
        formatTime(audio.duration);
});

seekBar.addEventListener("input", () => {
    if (audio.duration) {
        audio.currentTime =
            (seekBar.value / 100) * audio.duration;
    }
});

volumeBar.addEventListener("input", () => {
    audio.volume = volumeBar.value;
});

audio.volume = 0.8;

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    return minutes + ":" + String(remaining).padStart(2, "0");
}


// ======================================
// 9. NHẠC NGHE GẦN ĐÂY
// ======================================

function renderRecent(track) {
    const container = document.getElementById("recentTracks");

    const item = document.createElement("div");
    item.className = "recent-item";

    const cover = document.createElement("div");
    cover.className = "recent-cover";
    cover.textContent = "♫";

    const text = document.createElement("span");
    text.textContent = track.title + " - " + track.artist;

    item.append(cover, text);

    if (container.querySelector(".muted")) {
        container.innerHTML = "";
    }

    container.prepend(item);

    while (container.children.length > 5) {
        container.lastElementChild.remove();
    }
}


// ======================================
// 10. TẢI NHẠC TỪ MÁY TÍNH
// ======================================


// ======================================
// 10. TẢI NHẠC TỪ MÁY TÍNH
// ======================================

const uploadForm = document.getElementById("uploadForm");

uploadForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const file = document.getElementById("audioFile").files[0];

    if (!file) {
        showToast("Bạn chưa chọn file nhạc!");
        return;
    }

    // Giới hạn file 50 MB
    const MAX_SIZE = 50 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
        showToast("File quá lớn! Hãy chọn file dưới 50 MB.");
        return;
    }

    const title = document.getElementById("uploadTitle").value.trim();
    const artist = document.getElementById("uploadArtist").value.trim();
    const genre = document.getElementById("uploadGenre").value;
    const format = document.getElementById("uploadFormat").value;
    const license = document.getElementById("uploadLicense").value.trim();

    const submitButton = this.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    submitButton.textContent = "Đang tải file lên...";

    let filePath = null;
    let uploadSucceeded = false;

    try {
        // BƯỚC 1: TẠO TÊN FILE
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        filePath = Date.now() + "-" + safeName;

        console.log("Bắt đầu tải file:", file.name);

        // BƯỚC 2: TẢI FILE LÊN SUPABASE
        const { data: uploadData, error: uploadError } =
            await db.storage
                .from(BUCKET)
                .upload(filePath, file, {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file.type || "application/octet-stream"
                });

        if (uploadError) {
            throw new Error("Lỗi tải file: " + uploadError.message);
        }

        uploadSucceeded = true;
        console.log("Đã tải file lên:", uploadData);

        // BƯỚC 3: LẤY URL FILE
        submitButton.textContent = "Đang lưu thông tin...";

        const { data: urlData } = db.storage
            .from(BUCKET)
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        if (!publicUrl) {
            throw new Error("Không lấy được đường dẫn file.");
        }

        // BƯỚC 4: LƯU THÔNG TIN VÀO DATABASE
        const { error: insertError } = await db
            .from("music_tracks")
            .insert([{
                title: title,
                artist: artist,
                genre: genre,
                format: format,
                audio_url: publicUrl,
                storage_path: filePath,
                file_name: file.name,
                source_type: "upload",
                license: license
            }]);

        if (insertError) {
            throw new Error("Lỗi lưu thông tin: " + insertError.message);
        }

        console.log("Đã lưu bài hát vào database.");

        showToast("Tải nhạc thành công!");
        this.reset();

    } catch (error) {
        console.error("LỖI UPLOAD:", error);

        showToast(error.message || "Có lỗi khi tải nhạc lên.");

        // Xóa file nếu đã tải lên nhưng lưu database thất bại
        if (uploadSucceeded && filePath) {
            const { error: removeError } = await db.storage
                .from(BUCKET)
                .remove([filePath]);

            if (removeError) {
                console.error("Không xóa được file tạm:", removeError);
            }
        }

    } finally {
        // MỞ KHÓA NÚT NGAY SAU KHI XỬ LÝ UPLOAD
        submitButton.disabled = false;
        submitButton.textContent = "Tải nhạc lên ↑";
    }

    // BƯỚC 5: TẢI LẠI THƯ VIỆN SAU KHI MỞ KHÓA NÚT
    if (uploadSucceeded) {
        loadTracks();
    }
});



// ======================================
// 11. THÊM NHẠC BẰNG LINK
// ======================================

document.getElementById("linkForm")
    .addEventListener("submit", async function(event) {

    event.preventDefault();

    const submitButton = this.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    submitButton.textContent = "Đang thêm...";

    try {
        const track = {
            title: document.getElementById("linkTitle").value.trim(),
            artist: document.getElementById("linkArtist").value.trim(),
            genre: document.getElementById("linkGenre").value,
            format: document.getElementById("linkFormat").value,
            audio_url: document.getElementById("audioUrl").value.trim(),
            source_type: "external",
            license: document.getElementById("linkLicense").value.trim()
        };

        const { error } = await db
            .from("music_tracks")
            .insert([track]);

        if (error) throw error;

        showToast("Đã thêm bài hát thành công!");

        this.reset();

        await loadTracks();

    } catch (error) {
        console.error("Lỗi thêm link:", error);
        showToast("Không thêm được nhạc: " + error.message);

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Thêm vào thư viện →";
    }
});


// ======================================
// 12. TÌM KIẾM VÀ LỌC
// ======================================

document.getElementById("searchInput")
    .addEventListener("input", renderTracks);

document.getElementById("genreFilter")
    .addEventListener("change", renderTracks);

document.getElementById("formatFilter")
    .addEventListener("change", renderTracks);


// Nhấn thể loại ở sidebar hoặc trang chủ
document.querySelectorAll("[data-genre]").forEach(button => {
    button.addEventListener("click", () => {
        switchView("library");

        document.getElementById("genreFilter").value =
            button.dataset.genre;

        renderTracks();
    });
});


// Nút xem thư viện từ banner
document.getElementById("featuredPlay")
    ?.addEventListener("click", () => {
        if (tracks.length > 0) playTrack(0);
        else showToast("Thư viện chưa có bài hát.");
    });


// ======================================
// 13. KHỞI ĐỘNG
// ======================================

loadTracks();
