FROM golang:1.24-alpine AS builder

# Copy the Go module files and download dependencies.
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code.
COPY . ./

# Build generator binary.
RUN go build -o protoc-gen-saturn-axios ./cmd/protoc-gen-saturn-axios

FROM bufbuild/buf:latest

# Install protoc.
RUN apk add --no-cache protobuf-dev

# Copy the generator binary from the builder stage.
COPY --from=builder /app/protoc-gen-saturn-axios /usr/local/bin/protoc-gen-saturn-axios

# Verify installations.
RUN buf --version && \
    protoc --version

# Set working directory.
WORKDIR /workspace
