package middleware

import (
	"log"
	"net/http"
	"strings"
)

// AuthMiddleware ensures a valid Bearer token is present
func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Unauthorized: No token provided", http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Unauthorized: Invalid token format", http.StatusUnauthorized)
			return
		}

		token := parts[1]
		// TODO: Validate token with OAuth2 provider (Google/Auth0)
		// For now, accept any token that isn't empty (Mock Mode)
		if token == "invalid-token" {
			http.Error(w, "Unauthorized: Invalid token", http.StatusUnauthorized)
			return
		}

		displayToken := token
		if len(token) > 5 {
			displayToken = token[:5] + "..."
		}
		log.Printf("Authenticated request from token: %s", displayToken)
		next(w, r)
	}
}
