let roomCodeValue = "";
let socket = null;
let selectedFiles = [];

const home = document.getElementById("home");
const laptop = document.getElementById("laptop");
const client = document.getElementById("client");
const laptopFiles = document.getElementById("laptopFiles");

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const codeInput = document.getElementById("codeInput");
const roomCode = document.getElementById("roomCode");
const copyBtn = document.getElementById("copyBtn");
const qr = document.getElementById("qr");
const phoneStatus = document.getElementById("phoneStatus");

const fileInput = document.getElementById("fileInput");
const filesBox = document.getElementById("files");
const sendBtn = document.getElementById("sendBtn");

const progressContainer = document.getElementById("progressContainer");
const progress = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const percent = document.getElementById("percent");
const sent = document.getElementById("sent");

const downloadList = document.getElementById("downloadList");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const newRoomBtn = document.getElementById("newRoomBtn");
const errorBox = document.getElementById("error");

let laptopFilesData = [];

function api(path, options = {}) {
  return fetch(path, options);
}

function connectSocket(code) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}`);

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "watch-room",
      code
    }));
  };

  socket.onmessage = event => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "room-status") {
        if (data.phoneJoined) showPhoneJoined();
        updateLaptopFiles(data.files || []);
      }

      if (data.type === "phone-joined") {
        showPhoneJoined();
      }

      if (data.type === "files-added") {
        updateLaptopFiles(data.files || []);
      }

      if (data.type === "error") {
        showError(data.message);
      }
    } catch (error) {
      console.error(error);
    }
  };

  socket.onerror = () => {
    showError("Could not connect to the sharing server.");
  };
}

createBtn.addEventListener("click", async () => {
  createBtn.disabled = true;
  createBtn.textContent = "Creating...";

  try {
    const response = await api("/api/create-room", { method: "POST" });
    const data = await response.json();

    if (!response.ok) throw new Error(data.message || "Could not create room.");

    roomCodeValue = data.code;
    roomCode.textContent = roomCodeValue;

    const joinUrl = `${location.origin}/?code=${roomCodeValue}`;

    qr.innerHTML = "";
    if (window.QRCode) {
      new QRCode(qr, {
        text: joinUrl,
        width: 180,
        height: 180
      });
    }

    home.classList.add("hidden");
    laptop.classList.remove("hidden");

    connectSocket(roomCodeValue);
  } catch (error) {
    showError(error.message);
  }

  createBtn.disabled = false;
  createBtn.textContent = "💻 Receive on Laptop";
});

joinBtn.addEventListener("click", () => joinRoom(codeInput.value.trim()));

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
});

async function joinRoom(code) {
  if (!/^\d{6}$/.test(code)) {
    showError("Please enter a 6-digit code.");
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = "Joining...";

  try {
    const response = await api("/api/join-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message || "Could not join room.");

    roomCodeValue = code;

    home.classList.add("hidden");
    client.classList.remove("hidden");

    // Notify laptop through WebSocket when possible.
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}`);

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "phone-joined",
        code
      }));
    };
  } catch (error) {
    showError(error.message);
  }

  joinBtn.disabled = false;
  joinBtn.textContent = "Join & Send";
}

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCodeValue);
    copyBtn.textContent = "Copied!";
    setTimeout(() => copyBtn.textContent = "Copy Code", 1500);
  } catch {
    alert(roomCodeValue);
  }
});

fileInput.addEventListener("change", () => {
  selectedFiles = Array.from(fileInput.files);
  displayFiles();
});

function displayFiles() {
  filesBox.innerHTML = "";

  if (!selectedFiles.length) {
    sendBtn.classList.add("hidden");
    return;
  }

  selectedFiles.forEach((file, index) => {
    const div = document.createElement("div");
    div.className = "file";

    const left = document.createElement("span");
    left.textContent = `${file.type.startsWith("image/") ? "🖼️" : "📄"} ${file.name}`;

    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = formatSize(file.size);

    div.append(left, size);
    filesBox.appendChild(div);
  });

  sendBtn.classList.remove("hidden");
}

sendBtn.addEventListener("click", async () => {
  if (!selectedFiles.length || !roomCodeValue) return;

  sendBtn.disabled = true;
  progressContainer.classList.remove("hidden");
  sent.classList.add("hidden");

  try {
    const formData = new FormData();

    selectedFiles.forEach(file => {
      formData.append("files", file, file.name);
    });

    progressText.textContent = "Uploading files...";

    const response = await api(`/api/upload/${roomCodeValue}`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Upload failed.");
    }

    progress.style.width = "100%";
    percent.textContent = "100%";
    progressText.textContent = "Upload complete";

    sent.classList.remove("hidden");
  } catch (error) {
    showError(error.message);
  }

  sendBtn.disabled = false;
});

function showPhoneJoined() {
  phoneStatus.textContent = "🟢 iPhone connected! Select photos on the iPhone.";
  phoneStatus.classList.add("success-status");

  setTimeout(() => {
    laptop.classList.add("hidden");
    laptopFiles.classList.remove("hidden");
  }, 700);
}

function updateLaptopFiles(files) {
  laptopFilesData = files;
  downloadList.innerHTML = "";

  if (!files.length) {
    downloadAllBtn.classList.add("hidden");
    downloadList.innerHTML = `<div class="empty">Waiting for photos...</div>`;
    return;
  }

  files.forEach(file => {
    const row = document.createElement("div");
    row.className = "file";

    const info = document.createElement("div");
    info.className = "file-info";

    const icon = file.mime?.startsWith("image/") ? "🖼️" :
                 file.mime?.startsWith("video/") ? "🎥" : "📄";

    info.innerHTML = `<span>${icon} ${escapeHtml(file.name)}</span>
                      <small>${formatSize(file.size)}</small>`;

    const button = document.createElement("a");
    button.className = "download-button";
    button.textContent = "Download";
    button.href = `/download/${roomCodeValue}/${encodeURIComponent(file.id)}`;
    button.download = file.name;

    row.append(info, button);
    downloadList.appendChild(row);
  });

  downloadAllBtn.classList.remove("hidden");
}

downloadAllBtn.addEventListener("click", async () => {
  for (const file of laptopFilesData) {
    const link = document.createElement("a");
    link.href = `/download/${roomCodeValue}/${encodeURIComponent(file.id)}`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();

    await new Promise(resolve => setTimeout(resolve, 250));
  }
});

newRoomBtn.addEventListener("click", () => {
  location.href = "/";
});

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function showError(text) {
  errorBox.textContent = text;
  errorBox.classList.remove("hidden");

  setTimeout(() => {
    errorBox.classList.add("hidden");
  }, 5000);
}

// If the laptop QR code was scanned, automatically open the join screen.
const params = new URLSearchParams(location.search);
const codeFromUrl = params.get("code");

if (codeFromUrl && /^\d{6}$/.test(codeFromUrl)) {
  codeInput.value = codeFromUrl;
  setTimeout(() => joinRoom(codeFromUrl), 300);
}
