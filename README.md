# QuickShare 2.0

QuickShare is now an internet-based iPhone → laptop sharing website.

## Important

The old version used local WebRTC and required the iPhone and laptop to communicate directly on the same local network.

This version uses the QuickShare server as a temporary relay:
- Laptop creates a room.
- iPhone joins with a 6-digit code or QR code.
- iPhone uploads photos/files to the server.
- Laptop sees the files and downloads them.
- Rooms/files are automatically cleaned after 60 minutes.

This means an iPhone Personal Hotspot can be used. The laptop and iPhone do NOT need to be on the same Wi-Fi router.

## Run locally

1. Open this folder in VS Code.
2. Open Terminal.
3. Run:

   npm install
   npm start

4. Open http://localhost:3000 on the laptop.

For the iPhone to use the website from a different device, deploy this project to a public HTTPS host first. A localhost address is only available on the laptop itself.

## Deploy

This project is suitable for Node.js hosting such as Render, Railway, or another Node-compatible host.

Set the start command to:

npm start

The server uses the PORT environment variable supplied by the hosting platform.

## Storage note

Uploaded files are temporarily stored in the server's `uploads` folder. The app deletes rooms/files after 60 minutes.

For a production service, use object storage (such as S3-compatible storage) instead of local disk, especially if the hosting provider uses ephemeral storage.
