import { createApp } from './app.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => console.log(JSON.stringify({ msg: 'api listening', port })));
