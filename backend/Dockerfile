# Builder stage
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
WORKDIR /app/cmd/repo-scanner
RUN go build -o repo-scanner

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/cmd/repo-scanner/repo-scanner .
COPY --from=builder /app/testdata ./testdata
EXPOSE 8081
CMD ["./repo-scanner"]
