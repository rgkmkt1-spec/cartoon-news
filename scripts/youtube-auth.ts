/**
 * One-time: get a YouTube refresh token so the pipeline can upload to your channel.
 *   1. Put YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env (Desktop-app OAuth client)
 *   2. npm run youtube-auth
 *   3. Sign in with the Google account that owns the channel, approve.
 *   4. Copy the printed YOUTUBE_REFRESH_TOKEN into .env and into GitHub secrets.
 */
import http from "node:http";
import { google } from "googleapis";
import { loadDotEnv, env } from "../src/config";

loadDotEnv();
const clientId = env("YOUTUBE_CLIENT_ID");
const clientSecret = env("YOUTUBE_CLIENT_SECRET");
if (!clientId || !clientSecret) {
  console.error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/callback`;
const oauth = new google.auth.OAuth2(clientId, clientSecret, redirect);
const url = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"],
});

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) return void res.end();
  const code = new URL(req.url, redirect).searchParams.get("code");
  if (!code) return void res.end("No code in callback.");
  const { tokens } = await oauth.getToken(code);
  res.end("Done! You can close this tab and go back to the terminal.");
  console.log("\n✔ Success. Add this to .env and to GitHub secrets:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  server.close();
});

server.listen(PORT, () => {
  console.log("Open this URL in your browser and approve access:\n");
  console.log(url + "\n");
});
