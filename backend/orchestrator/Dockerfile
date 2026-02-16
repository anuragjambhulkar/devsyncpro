FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o orchestrator ./backend/orchestrator

FROM alpine:3.18
WORKDIR /root/
COPY --from=builder /app/orchestrator .
EXPOSE 10000
CMD ["./orchestrator"]
