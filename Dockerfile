FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY backend ./backend
COPY launcher.sh ./launcher.sh
RUN chmod +x ./launcher.sh
RUN CGO_ENABLED=0 go build -o scanner ./backend/repo-scanner
RUN CGO_ENABLED=0 go build -o orchestrator ./backend/orchestrator

FROM alpine:3.18
RUN apk add --no-cache git ca-certificates
WORKDIR /root/
COPY --from=builder /app/scanner .
COPY --from=builder /app/orchestrator .
COPY --from=builder /app/launcher.sh .

EXPOSE 10000
ENTRYPOINT ["./launcher.sh"]
