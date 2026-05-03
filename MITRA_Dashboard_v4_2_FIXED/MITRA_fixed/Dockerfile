FROM node:20-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Create upload directories
RUN mkdir -p uploads/ar_assets uploads/quiz_xlsx uploads/app_assets

# Non-root user for security
RUN addgroup -S mitra && adduser -S mitra -G mitra && chown -R mitra:mitra /app
USER mitra

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
