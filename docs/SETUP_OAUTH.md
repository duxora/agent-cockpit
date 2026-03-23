# Google OAuth 2.0 Setup Guide

This guide walks you through setting up Google OAuth authentication for Agent Cockpit.

## Prerequisites

- Google Cloud Console account
- Node.js 18+ with npm
- Agent Cockpit development environment set up

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top and select **"New Project"**
3. Enter a project name (e.g., "Agent Cockpit")
4. Click **Create**
5. Wait for the project to be created and select it

## Step 2: Enable Google+ API

1. In the Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Google+ API"
3. Click on it and press **Enable**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen first:
   - Select **External** for User Type
   - Fill in Application Name: "Agent Cockpit"
   - Add your email as the support email
   - Skip optional fields for development
   - Save and continue
4. Back on Credentials, click **Create Credentials** > **OAuth client ID**
5. Select **Web application** as the Application type
6. Under "Authorized redirect URIs", click **Add URI** and enter:
   ```
   http://localhost:4200/api/auth/google/callback
   ```
7. For production, also add:
   ```
   https://your-domain.com/api/auth/google/callback
   ```
8. Click **Create**
9. Copy the **Client ID** and **Client Secret** (you'll need these next)

## Step 4: Configure Environment Variables

1. Create a `.env` file in the project root (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. Update the values with your credentials:
   ```bash
   GOOGLE_CLIENT_ID=<your-client-id-from-step-3>
   GOOGLE_CLIENT_SECRET=<your-client-secret-from-step-3>
   GOOGLE_REDIRECT_URI=http://localhost:4200/api/auth/google/callback
   ADMIN_EMAIL=your.email@gmail.com
   DATABASE_URL=postgresql://user:password@localhost:5432/cockpit
   NODE_ENV=development
   ```

3. **Important**: Never commit `.env` to version control. It's listed in `.gitignore`.

## Step 5: Run Agent Cockpit Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. The application will be available at `http://localhost:4200`

4. Click **Login with Google** to authenticate using your Google account

## Step 6: Deploy to Production

### Using Railway

1. Push your code to GitHub (without `.env`)

2. In Railway, create a new project from your GitHub repository

3. Add environment variables in Railway:
   ```
   GOOGLE_CLIENT_ID=<production-client-id>
   GOOGLE_CLIENT_SECRET=<production-client-secret>
   GOOGLE_REDIRECT_URI=https://your-railway-domain.com/api/auth/google/callback
   ADMIN_EMAIL=your.email@gmail.com
   DATABASE_URL=<railway-postgres-url>
   NODE_ENV=production
   ```

4. **Important**: Create a NEW OAuth app in Google Cloud Console for production with the correct redirect URI:
   ```
   https://your-railway-domain.com/api/auth/google/callback
   ```

5. Deploy and verify the `/login` page loads

## Important Notes

### Authentication Requirements

- Only users with the email address matching `ADMIN_EMAIL` can access the dashboard
- Other Google accounts will be rejected with a 403 Forbidden response
- The `/api/share/*` endpoints remain public (no authentication required)

### Security

- **HTTPS Required**: OAuth will only work with HTTPS in production
- **Session Cookies**: Sessions use HTTP-only, Secure, SameSite=Strict cookies
- **Session Expiration**: Sessions automatically expire after 30 days
- **Automatic Cleanup**: Expired sessions are deleted hourly

### Troubleshooting

**"Invalid redirect URI"**
- Ensure the `GOOGLE_REDIRECT_URI` in your `.env` matches the URI registered in Google Cloud Console
- Must be exact match (including http vs https)

**"Login button redirects but doesn't authenticate"**
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Check that the Google+ API is enabled in Cloud Console
- Ensure your email is in Google's OAuth consent screen

**"403 Forbidden after login"**
- Verify the email you logged in with matches `ADMIN_EMAIL`
- Check .env file has correct `ADMIN_EMAIL`

**"Session expires too quickly"**
- Default session timeout is 30 days
- To customize, set `SESSION_MAX_AGE` (in milliseconds) in `.env`
- Example: `SESSION_MAX_AGE=604800000` for 7 days

## API Endpoints

After authentication is set up, the following endpoints are available:

- `GET /api/auth/google` - Initiates OAuth flow, redirects to Google
- `GET /api/auth/google/callback` - Google OAuth callback (automatic)
- `POST /api/auth/logout` - Logs out current user and clears session
- `GET /api/auth/me` - Returns current user info or 401 if not authenticated

## Frontend Routes

- `/` - Shows LoginPage if not authenticated, dashboard if authenticated
- `/login` - Login page (always accessible)
- `/api/share/*` - Public share endpoints (no authentication)

## Next Steps

1. Verify login works locally
2. Test the logout functionality
3. Verify that only your email can access the dashboard
4. Set up production credentials for your deployment environment
5. Deploy and test in production
