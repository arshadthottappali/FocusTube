# Development Setup Guide

## Quick Start

### 1. Clone & Open
```bash
git clone https://github.com/arshadthottappali/FocusTube.git
cd FocusTube
```

### 2. Configure Firebase (Optional, but recommended)
Cloud sync is **optional** — the app works 100% offline with localStorage.

To enable cloud sync:

1. **Get Firebase Config**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create a new project or select existing one
   - Navigate to Project Settings > Your apps > Web app
   - Copy your config values

2. **Set Environment Variables**
   ```bash
   # Copy the template
   cp .env.example .env
   
   # Edit .env with your Firebase values
   # VITE_FIREBASE_API_KEY=your_api_key_here
   # VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   # ... etc
   ```

3. **Create a `config.html` file** in your project root to inject env vars into the browser:

   ```html
   <!-- config.html -->
   <script>
     // Set window.__FIREBASE_CONFIG__ from environment or local storage
     const envConfig = {
       apiKey: localStorage.getItem('firebase_api_key'),
       authDomain: localStorage.getItem('firebase_auth_domain'),
       projectId: localStorage.getItem('firebase_project_id'),
       storageBucket: localStorage.getItem('firebase_storage_bucket'),
       messagingSenderId: localStorage.getItem('firebase_messaging_sender_id'),
       appId: localStorage.getItem('firebase_app_id'),
       measurementId: localStorage.getItem('firebase_measurement_id'),
     };
     
     window.__FIREBASE_CONFIG__ = envConfig;
   </script>
   ```

### 3. Run Locally

**Option A: VS Code Live Server** (Recommended)
1. Install [Live Server Extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
2. Right-click `index.html` → "Open with Live Server"
3. Opens at `http://127.0.0.1:5500`

**Option B: Python HTTP Server**
```bash
python -m http.server 8000
# Opens at http://localhost:8000
```

**Option C: Node HTTP Server**
```bash
npx http-server
# Opens at http://localhost:8080
```

## Testing the Setup

1. **Offline Mode** (No Setup Required)
   - Open app in browser
   - Import a YouTube playlist
   - Take notes, check offline works

2. **Cloud Sync** (If Firebase configured)
   - Look for "Sign in with Google" button
   - Login and verify data syncs
   - Check browser console for Firebase initialization message

## Security Checklist

- [ ] Never commit `.env` file (already in `.gitignore`)
- [ ] Don't share Firebase credentials in PRs or issues
- [ ] Rotate Firebase keys if accidentally exposed
- [ ] Review `.env.example` — it contains only placeholders
- [ ] Read `SECURITY.md` for best practices

## Troubleshooting

### Firebase Not Initializing
- Check browser console (F12) for errors
- Verify `.env` or `config.html` has correct values
- Firebase is optional — app still works without it

### Playlist Import Fails
- Verify YouTube playlist is public
- Check browser console for CORS errors
- Try a different playlist to isolate issue

### Notes Not Saving
- Check if localStorage is enabled
- Verify browser allows local storage for this site
- Open DevTools > Application > LocalStorage

## Project Structure

```
FocusTube/
├── index.html          Main app file
├── main.js             Core logic (~64KB)
├── style.css           Styling (~39KB)
├── config.js           Firebase config loader
├── .env.example        Template for environment variables
├── .gitignore          Git ignore rules (protects .env)
├── SECURITY.md         Security guidelines
├── README.md           Feature documentation
└── DEVELOPMENT.md      This file
```

## Next Steps

- **Customize**: Modify `style.css` for branding
- **Deploy**: See deployment guides below
- **Contribute**: Create issues or PRs for improvements

## Deployment

### Vercel (Recommended)
1. Push repo to GitHub
2. Connect to [Vercel](https://vercel.com)
3. Add environment variables in project settings
4. Deploy automatically on push

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase init
firebase deploy
```

### Netlify
1. Connect GitHub repo
2. Set environment variables in Netlify UI
3. Deploy automatically on push

### Self-Hosted
- Use any static hosting (Apache, Nginx, etc.)
- Copy all files to web root
- Set environment variables via `.env` or server headers

---

**Need help?** Check [SECURITY.md](./SECURITY.md) or open an [issue](https://github.com/arshadthottappali/FocusTube/issues)
