FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY backend ./backend
RUN CGO_ENABLED=0 go build -o orchestrator ./backend/orchestrator

FROM alpine:3.18
WORKDIR /root/
COPY --from=builder /app/orchestrator .
EXPOSE 10000
CMD ["./orchestrator"]
