# UPSIDE DESK - Morse Code Digital Vault

A secure authentication system using ESP32, Blynk Cloud, and a modern React dashboard.

## Project Structure
- `vault-backend`: Node.js/Express API that proxies Blynk calls, sends OTP emails, and stores logs.
- `vault-dashboard`: React + Vite frontend with the vault auth flow and dashboard UI.

## Local Setup

### 1. Backend
```bash
cd vault-backend
npm install
npm start
```

Create `vault-backend/.env` with:
```env
BLYNK_TOKEN=your_blynk_token
CORS_ORIGIN=http://localhost:5173
PORT=3000
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
OTP_EXPIRY_MS=300000
```

### 2. Frontend
```bash
cd vault-dashboard
npm install
# Create .env and set VITE_BACKEND_URL=http://localhost:3000
npm run dev
```

## Gmail App Password Setup
1. Go to [myaccount.google.com](https://myaccount.google.com).
2. Enable `2-Step Verification`.
3. Go to `Security` -> `App Passwords`.
4. Create one for `Mail` and copy the 16-character password.
5. Put it in `vault-backend/.env` as `EMAIL_PASS` with no spaces.

## Vercel Deployment (Monorepo)
1. Push the repo to GitHub.
2. Import the root directory into Vercel.
3. Add these environment variables in Vercel:
   - `BLYNK_TOKEN`
   - `CORS_ORIGIN`
   - `VITE_BACKEND_URL`
   - `EMAIL_USER`
   - `EMAIL_PASS`
   - `OTP_EXPIRY_MS=300000`
4. Update your Blynk webhook to `https://your-api.vercel.app/api/access`.

## Security Checklist
- [x] Tokens moved to `.env`
- [x] `.gitignore` prevents secret leaks
- [x] Frontend no longer calls Blynk directly
- [x] CORS configured for production
- [x] Input validation on API endpoints
