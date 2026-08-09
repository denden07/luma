# Luma Event Camera PWA

## Environment Variables

Create a `.env` file in the root of the `/luma` directory:

```env
# App mode: 'local' or 'production'
VITE_APP_MODE=local

# API base URL (for future backend integration)
VITE_API_BASE_URL=http://localhost:3000
```

## Local Development

### Standard Development

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`

### Mobile Testing via LAN

For testing on a physical phone with camera access:

1. Start the dev server:
```bash
npm run dev
```

2. Find your PC's LAN IP address:
   - Windows: `ipconfig` (look for IPv4 Address)
   - Mac/Linux: `ifconfig` or `ip addr`

3. The dev server will show the LAN URL, e.g.:
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.1.100:5173/
   ```

4. Access the app from your phone using the Network URL

5. Test event URL: `http://192.168.1.100:5173/e/demo`

### Camera Access on Mobile

Browser camera APIs require HTTPS in production. For local development:

**Option 1: Use the LAN URL directly (may work on some browsers)**
- Some browsers allow camera access on local network IPs

**Option 2: Use a local HTTPS certificate (recommended)**
- Set up a local SSL certificate for development
- Configure Vite to use HTTPS

**Option 3: Use a tunnel (quick testing)**
- Use ngrok, Cloudflare Tunnel, or similar
- Provides temporary HTTPS URL

## Project Structure

```
luma/
├── public/
│   └── manifest.json          # PWA manifest
├── src/
│   ├── screens/               # Screen components
│   │   ├── Landing.tsx
│   │   ├── NameEntry.tsx
│   │   ├── Camera.tsx
│   │   ├── Developing.tsx
│   │   ├── Uploading.tsx
│   │   ├── Complete.tsx
│   │   └── Message.tsx
│   ├── utils/                 # Utilities
│   │   ├── participant.ts     # Participant management
│   │   └── env.ts             # Environment config
│   ├── assets/
│   │   └── images/
│   │       └── pwa_camera_assets/  # Visual assets
│   ├── App.tsx                # Main app with routing
│   ├── globals.css            # Design tokens
│   └── main.tsx               # Entry point
├── .env                       # Environment variables
├── package.json
└── vite.config.ts
```

## Features Implemented

### User Flow
- ✅ QR code event access (`/e/{eventToken}`)
- ✅ Name entry (required before camera)
- ✅ Anonymous participant token generation
- ✅ Participant restoration from localStorage
- ✅ Camera preview with device camera
- ✅ Front/rear camera switching
- ✅ Flash toggle
- ✅ Photo capture
- ✅ Shot counter (10 photos per participant)
- ✅ Developing animation
- ✅ Upload progress
- ✅ Completion flow
- ✅ Optional message

### Design
- ✅ Exact color tokens from spec
- ✅ Custom fonts (DM Sans, Caveat, Cormorant Garamond)
- ✅ Mobile-first responsive design
- ✅ Safe area support for notched devices
- ✅ Disposable camera aesthetic
- ✅ Scrapbook-style screens
- ✅ Smooth animations

### Technical
- ✅ React + TypeScript + Vite
- ✅ React Router for navigation
- ✅ localStorage for participant data
- ✅ PWA manifest
- ✅ Local mode indicator
- ✅ LAN server support for mobile testing

## Testing the Flow

1. Visit `http://localhost:5173/e/demo` (or LAN URL on mobile)
2. You'll see the landing screen
3. Click "LET'S TAKE PHOTOS"
4. Enter your name
5. Grant camera permission
6. Take photos (10 shots available)
7. Each photo goes through: capture → developing → uploading → complete
8. After all shots or clicking "I'M DONE", leave an optional message

## Next Steps

To complete the MVP, you'll need to:

1. **Backend Integration**
   - Set up Supabase project
   - Create database schema (events, participants, photos)
   - Implement event join endpoint
   - Implement photo upload to R2/S3
   - Enforce participant and photo limits server-side

2. **Host Dashboard**
   - Event creation UI
   - QR code generation
   - Participant count display
   - Photo gallery

3. **Production Deployment**
   - Deploy to hosting platform
   - Configure production environment variables
   - Set up HTTPS
   - Configure domain

4. **Polish**
   - Add film grain texture
   - Add paper texture overlays
   - Improve animations
   - Optimize images and bundle size
   - Add error handling for network failures

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Browser Support

- iOS Safari 14+
- Android Chrome 90+
- Modern desktop browsers

## License

Private project
