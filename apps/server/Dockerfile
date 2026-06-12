# ---- Build stage ----
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ src/
COPY prisma/ prisma/

RUN npx prisma generate
RUN npx tsc

# ---- Production stage ----
FROM node:24-alpine

WORKDIR /app

RUN addgroup -g 1001 imwallet && \
    adduser -u 1001 -G imwallet -s /bin/sh -D imwallet

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json ./

USER imwallet

EXPOSE 3000

CMD ["node", "dist/index.js"]
