# --- Stage 1: Frontend bauen ---
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Stage 2: Server mit gebautem Frontend ---
FROM node:22-alpine AS runtime
WORKDIR /app

COPY server/package*.json ./
RUN npm install --omit=dev

COPY server/ ./
COPY --from=client-build /app/client/dist ./public

ENV NODE_ENV=production
ENV PORT=4123
ENV SERVE_STATIC=true

EXPOSE 4123

CMD ["node", "src/index.js"]
