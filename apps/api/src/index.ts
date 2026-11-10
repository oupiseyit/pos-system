import { createApp } from './app.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
// 07 §3: ≥ 32 random bytes. A short secret lets anyone brute-force it offline and forge tokens.
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32)
  throw new Error('JWT_SECRET must be at least 32 characters (openssl rand -hex 32)');

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => console.log(JSON.stringify({ msg: 'api listening', port })));
