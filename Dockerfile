FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY backend ./backend
RUN CGO_ENABLED=0 go build -o scanner ./backend/repo-scanner
RUN CGO_ENABLED=0 go build -o orchestrator ./backend/orchestrator

FROM alpine:3.18
RUN apk add --no-cache git ca-certificates
WORKDIR /root/
COPY --from=builder /app/scanner .
COPY --from=builder /app/orchestrator .

# Default to scanner, can be overridden by setting CMD in Render
EXPOSE 10000
CMD ["./scanner"]
