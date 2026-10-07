FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS builder
COPY . .
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
RUN npm run build

FROM deps AS migrate
COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
CMD ["npm","run","db:migrate"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage
USER nextjs
EXPOSE 3000
CMD ["node","server.js"]
