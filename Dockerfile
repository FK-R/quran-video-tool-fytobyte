# syntax=docker/dockerfile:1
FROM node:22.18-bookworm-slim AS base
# ffmpeg = video engine, fontconfig + Amiri/Noto = correct Arabic shaping in overlays
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fontconfig fonts-hosny-amiri fonts-noto-core openssl ca-certificates \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# comment
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ENV DATABASE_URL="postgresql://quran:quran@db:5432/quran?schema=public"
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    STORAGE_DIR=/data \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && mkdir -p /data
# VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
