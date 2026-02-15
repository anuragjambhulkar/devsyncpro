FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY backend ./backend
# We need scanner.go too
RUN CGO_ENABLED=0 go build -o scanner ./backend/repo-scanner

FROM alpine:3.18
RUN apk add --no-cache git
WORKDIR /root/
COPY --from=builder /app/scanner .
EXPOSE 10000
CMD ["./scanner"]
