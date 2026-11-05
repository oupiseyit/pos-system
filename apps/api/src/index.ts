import express, { type ErrorRequestHandler } from 'express';

const app = express();
app.use(express.json());

// JSON request log, one line per request
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () =>
    console.log(JSON.stringify({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start })),
  );
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Central error handler: never leak stack traces to the client
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
app.use(onError);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(JSON.stringify({ msg: 'api listening', port })));
