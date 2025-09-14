FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/repo-scanner ./cmd/repo-scanner

RUN go build -tags netgo -ldflags '-s -w' -o app ./cmd/repo-scanner

FROM alpine:3.18
WORKDIR /root/
COPY --from=builder /app/app .
EXPOSE 8080
CMD ["./app"]
