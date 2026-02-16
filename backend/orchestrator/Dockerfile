FROM golang:1.23-alpine AS builder
WORKDIR /app
# We need go.mod from the root. Adjusting context to root in render.yaml
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o orchestrator ./backend/orchestrator

FROM alpine:3.18
RUN apk add --no-cache ca-certificates
WORKDIR /root/
COPY --from=builder /app/orchestrator .
EXPOSE 10000
CMD ["./orchestrator"]
