FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum from the root of the repo
COPY go.mod go.sum ./
RUN go mod download

# Copy the entire backend directory to retain the pkg structure
COPY backend/ ./backend/

WORKDIR /app/backend/core-api
RUN go build -o core-api .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/backend/core-api/core-api /app/
RUN apk add --no-cache git
EXPOSE 10000

# Run the backend
CMD ["/app/core-api"]
