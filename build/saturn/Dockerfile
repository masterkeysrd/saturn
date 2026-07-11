# syntax=docker/dockerfile:1
# -----------------------------------------------
# Saturn — Multi-stage Dockerfile
# -----------------------------------------------

# --- Stage 1: Builder ---
FROM golang:1.26-alpine AS builder

# Install git (required by Go modules for VCS resolution)
RUN apk add --no-cache git

WORKDIR /app

# Cache Go module dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build the binary
COPY . .
ARG VERSION=dev
RUN go build \
    -ldflags="-s -w -X main.version=${VERSION}" \
    -o /usr/local/bin/saturn \
    ./cmd/saturn

# --- Stage 2: Runtime ---
FROM alpine:3.21

RUN apk add --no-cache \
    ca-certificates \
    && addgroup -S saturn \
    && adduser -S saturn -G saturn

RUN mkdir -p /data /tmp /etc/saturn && chown -R saturn:saturn /data /tmp /etc/saturn

COPY --from=builder --chown=saturn:saturn /usr/local/bin/saturn /usr/local/bin/saturn

USER saturn
WORKDIR /data

# Expose the HTTP gateway port (gRPC is served over Unix socket)
EXPOSE 8080

ENTRYPOINT ["saturn"]
CMD ["serve"]
