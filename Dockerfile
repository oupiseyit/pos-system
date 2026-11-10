# Production image (09 §4): one Node process serves the API, the POS at / and the back office at /admin.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/pos/package.json apps/pos/
COPY apps/backoffice/package.json apps/backoffice/
RUN npm ci
COPY . .
RUN npx prisma generate --schema prisma/schema.prisma \
 && npm run build --workspaces          # api → dist, pos/backoffice → dist

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Prisma's query engine needs OpenSSL on Alpine
RUN apk add --no-cache openssl
COPY package*.json ./
COPY apps/api/package.json apps/api/
# `prisma` is in apps/api "dependencies": migrate deploy runs at startup
RUN npm ci --omit=dev -w apps/api && npm cache clean --force
COPY prisma prisma
RUN npx prisma generate --schema prisma/schema.prisma
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/pos/dist apps/api/public/pos
COPY --from=build /app/apps/backoffice/dist apps/api/public/admin
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node apps/api/dist/index.js"]
