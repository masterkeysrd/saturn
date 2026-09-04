# syntax=docker/dockerfile:1
# -----------------------------------------------
# Saturn — 3-Stage Multi-Architecture Dockerfile
# -----------------------------------------------

# --- Stage 1: Web UI Builder ---
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-builder

WORKDIR /app/apps/web

# Cache node dependencies
COPY apps/web/package*.json ./
RUN npm ci

# Copy web source and build production bundle
COPY apps/web/ ./
RUN npm run build

# --- Stage 2: Go Backend Builder ---
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS go-builder

RUN apk add --no-cache git

WORKDIR /app

# Cache Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy backend source
COPY . .

# Copy compiled frontend from Stage 1 into the Go embed path
COPY --from=web-builder /app/apps/web/dist ./apps/web/dist

ARG VERSION=dev
ARG TARGETOS
ARG TARGETARCH

# Build static binary with stripped debug symbols
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build \
      -ldflags="-s -w -X main.version=${VERSION}" \
      -o /usr/local/bin/saturn \
      ./cmd/saturn

# --- Stage 3: Minimal Production Runtime ---
FROM alpine:3.24

RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    postgresql-client \
 && addgroup -S saturn \
 && adduser -S saturn -G saturn

RUN mkdir -p /data /tmp && chown -R saturn:saturn /data /tmp

COPY --from=go-builder --chown=saturn:saturn /usr/local/bin/saturn /usr/local/bin/saturn

# Configure the JWT signing key path for the running container (inside persistent /data).
ENV SATURN_AUTH_PRIVATE_KEY_PATH=/data/keys/private.pem

USER saturn
WORKDIR /data

# Expose the HTTP gateway port (gRPC is served over Unix socket)
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/saturn"]
CMD ["serve"]
