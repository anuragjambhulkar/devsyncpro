FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY . .
WORKDIR /app/cmd/repo-scanner
RUN go build -o repo-scanner

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/cmd/repo-scanner/repo-scanner .
EXPOSE 8080
CMD ["./repo-scanner"]
