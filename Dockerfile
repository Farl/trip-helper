FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY public/trips ./public/trips
ENV NODE_ENV=production API_HOST=0.0.0.0 STORAGE_DRIVER=firestore
USER node
CMD ["node", "--import", "tsx", "server/index.ts"]
