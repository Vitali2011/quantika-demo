# Google OAuth Setup for Quantika Demo

## Prerequisites
- Google account with access to Google Cloud Console
- Domain `demo.quantika.org` pointing to your VPS

## Steps

### 1. Create Google Cloud Project
1. Go to https://console.cloud.google.com
2. Click "New Project"
3. Name: `Quantika Demo`
4. Click "Create"

### 2. Enable Gmail API
1. In the project, go to "APIs & Services" → "Library"
2. Search for "Gmail API"
3. Click "Enable"

### 3. Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: `Quantika Demo Web Client`
5. Authorized redirect URIs: add `https://demo.quantika.org/api/auth/google`
6. Click "Create"
7. Copy **Client ID** and **Client Secret** → add to `.env.local`

### 4. Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. User Type: **External**
3. App name: `Quantika Demo`
4. User support email: your email
5. Scopes: add `https://www.googleapis.com/auth/gmail.readonly`
6. Test users: add the Gmail accounts you'll use for demos
7. Status: **Testing** (up to 100 test users, no verification needed)

### 5. Update .env.local
```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

### 6. Before Each Demo
Add the client's Gmail address to Test Users in the OAuth consent screen.
