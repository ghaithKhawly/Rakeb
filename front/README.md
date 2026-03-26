# Frontend Setup (Expo)

This app uses axios through `config/api.ts`. The backend base URL is read from `EXPO_PUBLIC_API_URL`.

## 1) Install frontend dependencies

```bash
npm install
```

## 2) Configure backend URL

`.env` is already created with a default value for local development:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
```

If you run on a physical phone, change it to your PC LAN IP:

```env
EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:3000
```

Example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
```

## 3) Start backend (from `back/`)

```bash
npm install
npm run dev
```

Expected health check:

```bash
curl http://localhost:3000/health
```

Should return JSON like:

```json
{ "status": "OK", "timestamp": "..." }
```

## 4) Start frontend

```bash
npx expo start -c
```

Use one of:

- Web (`w`) -> usually works with `http://localhost:3000`
- Android emulator -> `localhost` also works with current setup
- Physical phone -> requires LAN IP in `.env`

## 5) In-app verification

Open Settings and check the `Backend Graph Cache` card:

- It shows `API: ...` resolved URL.
- If status keeps loading/failing, URL is likely wrong or backend is not running.

## Common issues

- Timeout errors: wrong IP or backend not running.
- Works on web but not phone: use LAN IP in `.env` instead of `localhost`.
- Firewall blocks phone access: allow inbound port `3000` on your machine.
