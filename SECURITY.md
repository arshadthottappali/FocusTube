# Security Guidelines

## Firebase Credentials

### ⚠️ Never Commit Credentials
Firebase API keys should **never** be committed to version control. They contain sensitive information that can be used to abuse your Firebase project.

### How to Securely Configure Firebase

#### Option 1: Local Development (Recommended for Development)
1. Copy `.env.example` to `.env` in your project root
2. Fill in your Firebase credentials from [Firebase Console](https://console.firebase.google.com)
3. The `.env` file is in `.gitignore` — it will never be committed

```bash
# .env (local only, never committed)
VITE_FIREBASE_API_KEY=AIzaSyBJF3av9wODz8r_tu-xwdvZ1Y8tjcI0nnc
VITE_FIREBASE_AUTH_DOMAIN=focustube1-36ac7.firebaseapp.com
# ... other values
```

#### Option 2: Environment Variables in Production
When deploying, set environment variables in your hosting platform:
- **Vercel**: Project Settings > Environment Variables
- **Netlify**: Site Settings > Build & Deploy > Environment
- **Firebase Hosting**: Use `.env.production` for build-time variables

#### Option 3: Firebase Security Rules Only (Recommended for Public Apps)
If you're building a public app where credentials exposure is unavoidable:
1. Use **Firebase Security Rules** to restrict access strictly
2. Disable sensitive operations in client code
3. Monitor Firebase console for unusual activity
4. Set up billing alerts to catch abuse early

**Example Security Rule** (Firestore):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

### Checking if Your Credentials Are Exposed
1. **Regular Audits**: Search your git history for `VITE_FIREBASE` or `apiKey`
2. **Rotate Keys**: If credentials are exposed, regenerate them in Firebase Console
3. **Monitor Usage**: Check Firebase Analytics & Firestore usage for anomalies

```bash
# Check if credentials are in git history
git log -S "apiKey" --oneline
```

### What an API Key Can Do
Firebase API Keys allow:
- ✅ Viewing public data
- ✅ Authentication operations
- ❌ Cannot directly delete data (if Security Rules are properly set)
- ⚠️ Can trigger billing if misused

### Best Practices
1. **Use Environment Variables** — Never hardcode credentials
2. **Add .env to .gitignore** — Already configured, but verify
3. **Rotate Keys Regularly** — Especially if exposed
4. **Use Firebase Security Rules** — Your primary defense
5. **Monitor Billing** — Set up alerts for unusual costs
6. **Review Access Logs** — Firebase provides usage analytics
7. **Use Private Deployments** — Use Firebase Hosting or Vercel for automatic security

---

**Questions?** Refer to [Firebase Security Best Practices](https://firebase.google.com/docs/projects/best-practices)
