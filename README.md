# 🔐 UPSIDE DESK - Morse Code Digital Vault

A secure authentication system using ESP32, Blynk Cloud, and a modern React dashboard.

## 📁 Project Structure
- `vault-backend`: Node.js/Express API (Proxies Blynk calls, stores logs).
- `vault-dashboard`: React + Vite Frontend (Premium UI with Framer Motion).

## 🚀 Local Setup

### 1. Backend
```bash
cd vault-backend
npm install
# Create .env and add your BLYNK_TOKEN
npm start
```

### 2. Frontend
```bash
cd vault-dashboard
npm install
# Create .env and set VITE_BACKEND_URL=http://localhost:3000
npm run dev
```

## ☁️ Vercel Deployment (Monorepo)

1. **Push to GitHub**: Initialize a Git repo in the root directory and push.
2. **Import to Vercel**: Choose the root directory.
3. **Environment Variables**: Add the following in Vercel settings:
   - `BLYNK_TOKEN`: [Your Token]
   - `CORS_ORIGIN`: [Your Dashboard URL]
   - `VITE_BACKEND_URL`: [Your Backend API URL] (e.g. https://your-api.vercel.app)
4. **Blynk Webhook**: Update your Blynk webhook to `https://your-api.vercel.app/api/access`.

## 🛠️ Security Checklist
- [x] Tokens moved to `.env`
- [x] `.gitignore` prevents secret leaks
- [x] Frontend no longer calls Blynk directly (Proxied via Backend)
- [x] CORS configured for production
- [x] Input validation on all API endpoints
