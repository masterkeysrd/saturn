FROM golang:1.24-alpine AS builder


RUN apk add --no-cache git
RUN go install github.com/pressly/goose/v3/cmd/goose@latest

# Copy migration files
WORKDIR /migrations

