FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy Go module files
COPY go.mod go.sum ./
RUN go mod download

# Copy backend source code
COPY cmd/repo-scanner ./cmd/repo-scanner

# Build the app
RUN go build -tags netgo -ldflags '-s -w' -o app ./cmd/repo-scanner

# Final stage
FROM alpine:3.18
WORKDIR /root/
COPY --from=builder /app/app .
EXPOSE 8080
CMD ["./app"]
