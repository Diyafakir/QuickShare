const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const filesByRoom = new Map();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^\w.\- ()]/g, "_");
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024
  }
});

function createCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function cleanupRoom(code) {
  const roomFiles = filesByRoom.get(code) || [];

  for (const file of roomFiles) {
    try {
      fs.unlinkSync(file.path);
    } catch {}
  }

  filesByRoom.delete(code);
  rooms.delete(code);
}

app.post("/api/create-room", (_req, res) => {
  let code;

  do {
    code = createCode();
  } while (rooms.has(code));

  rooms.set(code, {
    createdAt: Date.now(),
    laptop: null,
    phone: null
  });

  filesByRoom.set(code, []);

  res.json({
    ok: true,
    code
  });

  console.log("Room created:", code);
});

app.post("/api/join-room", (req, res) => {
  const code = String(req.body.code || "").trim();
  const room = rooms.get(code);

  if (!room) {
    return res.status(404).json({
      ok: false,
      message: "Room not found. Check the 6-digit code."
    });
  }

  room.phone = true;

  res.json({
    ok: true,
    message: "Joined successfully."
  });

  console.log("Phone joined room:", code);
});

app.post("/api/upload/:code", upload.array("files", 100), (req, res) => {
  const code = String(req.params.code);
  const room = rooms.get(code);

  if (!room) {
    for (const file of req.files || []) {
      try { fs.unlinkSync(file.path); } catch {}
    }
    return res.status(404).json({
      ok: false,
      message: "Room expired or does not exist."
    });
  }

  const roomFiles = filesByRoom.get(code) || [];

  for (const file of req.files || []) {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.originalname,
      size: file.size,
      mime: file.mimetype,
      path: file.path,
      createdAt: Date.now()
    };

    roomFiles.push(item);
  }

  filesByRoom.set(code, roomFiles);

  const roomState = rooms.get(code);
  if (roomState && roomState.laptopSocket) {
    send(roomState.laptopSocket, {
      type: "files-added",
      files: roomFiles.map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        mime: file.mime
      }))
    });
  }

  res.json({
    ok: true,
    files: roomFiles.map(file => ({
      id: file.id,
      name: file.name,
      size: file.size,
      mime: file.mime
    }))
  });

  console.log(`${req.files?.length || 0} file(s) uploaded to room ${code}`);
});

app.get("/api/files/:code", (req, res) => {
  const code = String(req.params.code);
  if (!rooms.has(code)) {
    return res.status(404).json({ ok: false, message: "Room not found." });
  }

  const roomFiles = filesByRoom.get(code) || [];

  res.json({
    ok: true,
    files: roomFiles.map(file => ({
      id: file.id,
      name: file.name,
      size: file.size,
      mime: file.mime
    }))
  });
});

app.get("/download/:code/:id", (req, res) => {
  const code = String(req.params.code);
  const roomFiles = filesByRoom.get(code) || [];
  const file = roomFiles.find(item => item.id === req.params.id);

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).send("File not found or expired.");
  }

  res.download(file.path, file.name);
});

app.post("/api/cleanup/:code", (req, res) => {
  const code = String(req.params.code);
  cleanupRoom(code);
  res.json({ ok: true });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  ws.on("message", raw => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "watch-room") {
      const code = String(data.code || "");
      const room = rooms.get(code);

      if (!room) {
        send(ws, { type: "error", message: "Room not found." });
        return;
      }

      room.laptopSocket = ws;
      ws.roomCode = code;
      ws.role = "laptop";

      send(ws, {
        type: "room-status",
        phoneJoined: Boolean(room.phone),
        files: (filesByRoom.get(code) || []).map(file => ({
          id: file.id,
          name: file.name,
          size: file.size,
          mime: file.mime
        }))
      });
      return;
    }

    if (data.type === "phone-joined") {
      const room = rooms.get(String(data.code || ""));
      if (room && room.laptopSocket) {
        send(room.laptopSocket, { type: "phone-joined" });
      }
    }
  });

  ws.on("close", () => {
    const code = ws.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (room && room.laptopSocket === ws) {
      room.laptopSocket = null;
    }
  });
});

// Remove rooms/files after 60 minutes.
setInterval(() => {
  const now = Date.now();

  for (const [code, room] of rooms) {
    if (now - room.createdAt > 60 * 60 * 1000) {
      console.log("Cleaning expired room:", code);
      cleanupRoom(code);
    }
  }
}, 5 * 60 * 1000);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "QuickShare" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("================================");
  console.log("        QUICKSHARE 2.0");
  console.log("================================");
  console.log(`Server running on port ${PORT}`);
  console.log("");
});