# World Desk Daily — automated animated world news

Every morning at 5 AM Eastern, GitHub runs this pipeline for free. Each episode is about 10 minutes: 8–10 stories, mostly U.S. news, then a world roundup.

```
U.S. + world news RSS (16 outlets) ─► Gemini writes a 2-anchor script (every story checked against 2+ outlets)
   ─► Kokoro gives the two anchors their voices ─► Rhubarb works out the lip sync
   ─► Remotion renders the cartoon studio video + thumbnail
   ─► YouTube upload (optional) ─► email to you with the script, the sources and a download link
```

Monthly cost: **$0** (Gemini free tier, open-source voice and lip-sync tools, Remotion free license for individuals, free GitHub Actions minutes).

| Folder | What's in it |
|---|---|
| `config/channel.json` | Channel name, anchor names and voices, news feeds, episode length |
| `src/pipeline/` | News fetch, script writer, voices, lip sync, render, YouTube upload, email |
| `remotion/` | The video: studio, anchors (`Anchor.tsx`), map, lower thirds, ticker, thumbnail |
| `.github/workflows/daily.yml` | The 5 AM schedule |

---

## 1. Run it on your PC first (about 20 minutes)

You need Node 22+, Python 3.10–3.12 and Git. In PowerShell:

```powershell
cd C:\Users\rkell\cartoon-news
npm install
pip install -r requirements.txt
npm run setup
```

✅ **Checkpoint:** setup ends with `Setup complete.` It downloads the voice model (~120 MB) and the Rhubarb lip-sync tool into `.cache\`.

Next, make a test video. It uses `samples/sample-script.json`, so no API keys are needed:

```powershell
npm run daily -- --sample --no-upload
```

✅ **Checkpoint:** open `out\<today>\episode.mp4`. You should hear two different voices, see the mouths move with the words, and see the map fly to Japan and then Brazil.

> If `python` isn't found, add `PYTHON=py` to a `.env` file (copy `.env.example` to `.env`).

## 2. Get the free API keys

1. **Gemini (script writer):** go to https://aistudio.google.com/apikey and click *Create API key*. No card is needed.
2. **Gmail app password (notification emails):** turn on 2-Step Verification for your Google account, then go to https://myaccount.google.com/apppasswords, create a password called "news bot" and copy the 16 characters.

Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` and `NOTIFY_EMAIL`. Then test the news and script step only:

```powershell
npm run daily -- --script-only
```

✅ **Checkpoint:** an email arrives with today's real script and a list of sources. Read it: this is the step that has to be right.

Then do a full real episode:

```powershell
npm run daily -- --no-upload
```

## 3. Put it on GitHub so it runs every morning

```powershell
cd C:\Users\rkell\cartoon-news
git init
git add .
git commit -m "World Desk Daily pipeline"
gh repo create rgkmkt1-spec/cartoon-news --private --source . --push
```

> If the push is rejected with a message about `workflow` scope, run `gh auth refresh -s workflow` and then `git push -u origin HEAD`.

On GitHub, go to the repo, then **Settings → Secrets and variables → Actions**.

- **Secrets tab:** `GEMINI_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL`
- **Variables tab:** `YOUTUBE_MODE` = `off`, for now

Then go to **Actions → Daily episode → Run workflow** and choose mode `full`.

✅ **Checkpoint:** the run turns green (about 15–30 minutes), the email arrives, and the video is under **Artifacts** at the bottom of the run page. From then on it runs automatically every morning.

## 4. YouTube auto-upload (optional)

YouTube locks every video uploaded through the API to **private** until your Google Cloud project passes a free compliance audit. Until then, keep `YOUTUBE_MODE=off`, download the MP4 from the email link, and upload it from the YouTube app.

Setting it up:

1. Go to https://console.cloud.google.com, create a project called "World Desk Daily" and enable **YouTube Data API v3**.
2. Set up the **OAuth consent screen**: External, add your email as a test user, then click **Publish app** (set it to *In production*). If you leave it in *Testing*, your login stops working after 7 days.
3. Go to **Credentials → Create credentials → OAuth client ID → Desktop app**. Put the ID and secret in `.env` as `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.
4. Run `npm run youtube-auth`, sign in with the channel's Google account and approve. Copy the printed `YOUTUBE_REFRESH_TOKEN` into `.env` and into the GitHub secrets, along with the client ID and secret.
5. Apply for the audit: https://support.google.com/youtube/contact/yt_api_form

Once the audit is approved, set the GitHub variable `YOUTUBE_MODE` to one of:

- `private`: uploads privately. You review it and click Publish yourself.
- `scheduled`: uploads privately and **auto-publishes after `REVIEW_WINDOW_HOURS`** (default 2) unless you switch it to Private in YouTube Studio. This is fully automatic with a veto window.
- `public`: publishes immediately. Not recommended for news.

## Changing things

- **Names, voices, length, feeds:** `config/channel.json`. Voices: male `am_michael`, `am_adam`, `am_eric`, `am_onyx`, `bm_george`; female `af_heart`, `af_bella`, `af_nicole`, `af_sarah`, `bf_emma`.
- **Look of the anchors and studio:** `remotion/Anchor.tsx` and `remotion/NewsShow.tsx`. Run `npm run studio` to preview live in your browser.
- **Let Claude write the script instead of Gemini:** set `SCRIPT_PROVIDER=claude`. This uses Claude Code (`claude -p`) on your PC and your Pro plan limits, so it only works for runs on your PC, not on GitHub.
- **Run time:** change the cron line in `.github/workflows/daily.yml`. The time is in UTC.

## Editorial safeguards built in

- Every story must be backed by items from **at least two different outlets**, or the script is rejected and rewritten (up to 3 tries).
- Country codes, story count and length are validated before any audio is made.
- The prompt forbids opinions, speculation and invented details, and requires attributing claims.
- Wire summaries are rewritten, never copied. The YouTube description links every original story.
- No AI-generated pictures of real events: only maps, flags and the cartoon studio.
- If anything fails, you get a ❌ email with the error.

Reuters and AP don't offer free public RSS feeds, so the default sources are BBC, Al Jazeera, NPR, The Guardian, DW, France 24, UN News, CBC and ABC (Australia).

## Music & sound effects

The opening theme, whooshes and impacts are generated in code (`src/pipeline/sfx.py`), so they're original and copyright-free.

- **Use your own theme:** put a track at `public/music/intro.mp3` (or `.wav`), for example one from the YouTube Audio Library, then commit and push it. It's used for the opening and the end card instead of the built-in theme.
- **Turn music and effects off:** set `SOUND_FX=off` in `.env` (local runs) or as a GitHub variable.
