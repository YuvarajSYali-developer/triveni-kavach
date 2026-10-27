# Putting Triveni Kavach online (Neon + Render + Vercel)

| Part | Service | What it hosts | Free-tier notes |
|---|---|---|---|
| Database | [Neon](https://neon.tech) | PostgreSQL | Does not expire; small storage quota |
| Backend API | [Render](https://render.com) | FastAPI (`backend/`) | Sleeps after ~15 min idle; the first request then takes up to about a minute |
| Website | [Vercel](https://vercel.com) | React build (`frontend/`) | Static hosting with HTTPS |

All three let you sign up with your GitHub account. Do the steps in order. The values you
copy in one step are pasted in a later one, so keep a notepad open.

> Before you start: the public site holds **no fictional farm records**. It gets fictional
> *accounts* only, plus real data (live weather, and the notices and statistics you enter
> from official sources). Farm records appear when real users register farms.

---

## 1. Database — Neon

1. Sign in at <https://console.neon.tech> with GitHub.
2. **Create project** → name `triveni-kavach` → choose the region closest to India
   (Asia Pacific / Singapore) → Postgres version 16 or 17 → Create.
3. On the project dashboard click **Connect** and copy the **connection string**. It looks like
   `postgresql://neondb_owner:••••@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   → save it in your notepad as **DATABASE_URL**. Treat it like a password.

## 2. Backend — Render

1. Sign in at <https://dashboard.render.com> with GitHub and allow Render to see the
   `triveni-kavach` repository.
2. **New** → **Blueprint** → select `triveni-kavach`. Render reads `render.yaml` from the repo.
3. Render asks for the values marked `sync: false`:
   * `DATABASE_URL` → the Neon string from step 1.
   * `CORS_ORIGINS` → `https://triveni-kavach.vercel.app` (the address Vercel will most likely
     give you in step 4; you can correct it later).
   * `DATA_GOV_IN_API_KEY` → leave empty for now (see step 6).
4. **Apply**. The first build installs Python packages and takes several minutes. When the
   service shows **Live**, open
   `https://triveni-kavach-api.onrender.com/api/v1/health` (use the address Render shows for
   your service). You should see `"status":"ok"` and `"environment":"production"`.
   Save the address (without `/api/v1/health`) as **API_URL**.

The start command runs the database migrations automatically, so Neon now has all tables.
If the service fails to start, open **Logs**: a message such as "Use PostgreSQL" or
"CORS_ORIGINS must list the public frontend URL" names the setting to fix.

## 3. Create the sign-in accounts (from your PC)

Run this in PowerShell from your local `triveni-kavach\backend` folder (the one you already
set up). It connects to the Neon database directly. Replace the two quoted values:

```powershell
cd "C:\Users\Yuvaraj S Yali\triveni-kavach\backend"
git pull
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:DATABASE_URL = "PASTE-YOUR-NEON-CONNECTION-STRING"
$env:APP_ENV = "production"
$env:DEMO_PASSWORD = "Choose-A-Strong-Passw0rd"
.\.venv\Scripts\python.exe scripts\seed_demo.py --users-only
Remove-Item Env:DATABASE_URL, Env:APP_ENV, Env:DEMO_PASSWORD
```

This creates the six fictional accounts (administrator, two veterinarians, three farmers)
listed in the README, with no farm records. Choose a password you are willing to share with
the people who will try the site. Anyone who has it can sign in, and with the
administrator account they can change data.

To create a personal administrator instead (or as well), run
`.\.venv\Scripts\python.exe scripts\create_admin.py` with the same `$env:DATABASE_URL` set.

## 4. Website — Vercel

1. Sign in at <https://vercel.com> with GitHub → **Add New…** → **Project** → import
   `triveni-kavach`.
2. Set **Root Directory** to `frontend`. Vercel detects Vite. `frontend/vercel.json` already
   sets the build command and makes page links work after a refresh.
3. Under **Environment Variables** add
   `VITE_API_BASE_URL` = `API_URL/api/v1`
   (for example `https://triveni-kavach-api.onrender.com/api/v1`).
4. **Deploy**. Vercel shows the site address, for example `https://triveni-kavach.vercel.app`.

## 5. Connect the two

If the Vercel address differs from what you entered for `CORS_ORIGINS` in step 2, go to Render
→ your service → **Environment** → edit `CORS_ORIGINS` to the exact Vercel address (no
trailing slash; several addresses can be separated by commas) → **Save**. Render
redeploys automatically.

Open the Vercel address. The login page should say "Backend connected · database ok ·
production". If it says the backend is unreachable, wait a minute (Render may be waking up)
and refresh.

Then check the public pages (no sign-in needed):

| Page | What you should see |
|---|---|
| `/` | Map of the eight Haveri taluks with live temperatures; "Try it now" panel ranks diseases as you tap signs |
| `/check` | Full symptom checker; e.g. pig + fever + red/purple skin + sudden deaths → "Report immediately" |
| `/diseases` | 14 pig and 13 poultry conditions with source links |

Maps use free CARTO/OpenStreetMap tiles through Leaflet, so no Google Maps or other API key
is needed. If tiles are blocked on a network the map shows a notice and the markers still work.

## 6. Add real data

* **Weather** works immediately for Haveri taluks (Open-Meteo, no key needed).
* **Disease notices**: sign in as an administrator or veterinarian → *Disease notices* →
  *Add notice*, copying the details from an official publication and pasting its link.
* **Livestock statistics**:
  * *Import from data.gov.in*: register at <https://data.gov.in>, generate an API key under
    your account, then in Render → Environment add `DATA_GOV_IN_API_KEY` and save. In the
    app, open the dataset's resource page on data.gov.in, copy its resource ID, click
    *Preview*, map the state, district, pig and poultry columns, and import.
  * *Import CSV* or *Add figure*: type figures from the published Livestock Census tables,
    with the link to the table you used.

## Updating the site later

Push to the `main` branch on GitHub. Render and Vercel both rebuild automatically, and
migrations run on the next backend start.

## Troubleshooting

| Problem | Fix |
|---|---|
| Login page: "Cannot reach the server" | Check `VITE_API_BASE_URL` on Vercel ends with `/api/v1`, then **Redeploy** (Vite reads it at build time). Render may also still be waking up. |
| Browser console: CORS error | `CORS_ORIGINS` on Render must equal the Vercel address exactly (`https://…`, no trailing slash). |
| Render log: "SECRET_KEY must be set" | The blueprint generates it; if you created the service manually, add a long random `SECRET_KEY`. |
| Render log mentions `sslmode` or connection refused | Re-copy the full Neon string including `?sslmode=require`. |
| Weather card shows "could not be reached" | Open-Meteo was unavailable or rate-limited; it retries on the next page load (cached 30 min). |
| "Too many failed sign-in attempts" | Wait 15 minutes, or restart the Render service to clear the counter. |
| Statistics import says the key is missing | Add `DATA_GOV_IN_API_KEY` in Render → Environment, then save. |
