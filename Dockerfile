FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

RUN mkdir -p /app/cache /app/data && chown -R node:node /app

USER node
EXPOSE 7777

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '7777') + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
