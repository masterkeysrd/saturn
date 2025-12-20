FROM golang:1.24-alpine AS builder

# Copy the Go module files and download dependencies.
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code.
COPY . ./

# Build generator binary.
RUN CGO_ENABLED=0 go build -o saturn ./cmd/saturn

FROM scratch

# Copy the generator binary from the builder stage.
COPY --from=builder /app/saturn /usr/local/bin/saturn

# Copy necessary CA certificates for HTTPS support.
COPY --from=builder /etc/ssl/certs /etc/ssl/certs

# Verify installations.
ENTRYPOINT ["/usr/local/bin/saturn"]
