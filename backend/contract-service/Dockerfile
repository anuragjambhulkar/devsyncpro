FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod ./
# Copy shared code if any, but simplistic for now
COPY backend/contract-service ./backend/contract-service

RUN go build -o contract-service ./backend/contract-service

FROM alpine:3.18
WORKDIR /root/
COPY --from=builder /app/contract-service .
EXPOSE 8084
CMD ["./contract-service"]
