FROM node:20-alpine

WORKDIR /app

# Install build deps and runtime SSL certs (needed by Prisma)
RUN apk add --no-cache python3 make g++ openssl ca-certificates \
	&& update-ca-certificates || true

# Copy package files first for caching
COPY package.json package-lock.json ./

RUN npm ci --production=false --no-audit --no-fund

# Copy rest
COPY . .

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

ENV PORT=3333

# At container start, run migrations then start the server
CMD ["/bin/sh", "-lc", "npx prisma migrate deploy && node dist/index.js"]
