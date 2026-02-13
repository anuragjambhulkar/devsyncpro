package scanner

import (
	"io/ioutil"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// Helper to create a temp file with content
func createTempFile(t *testing.T, dir, name, content string) string {
	path := filepath.Join(dir, name)
	err := ioutil.WriteFile(path, []byte(content), 0644)
	if err != nil {
		t.Fatalf("Failed to create temp file %s: %v", name, err)
	}
	return path
}

func TestParseGoModDir(t *testing.T) {
	// Setup temp dir
	tmpDir := t.TempDir()

	// 1. Valid go.mod
	content := `
module github.com/my/project

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/stretchr/testify v1.8.4
)
`
	createTempFile(t, tmpDir, "go.mod", content)

	// Execute
	module, deps, err := ParseGoModDir(tmpDir)

	// Verify
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if module != "github.com/my/project" {
		t.Errorf("Expected module 'github.com/my/project', got '%s'", module)
	}

	expectedDeps := []string{"github.com/gin-gonic/gin", "github.com/stretchr/testify"}
	sort.Strings(deps)
	sort.Strings(expectedDeps)
	if !reflect.DeepEqual(deps, expectedDeps) {
		t.Errorf("Deps mismatch.\nExpected: %v\nGot: %v", expectedDeps, deps)
	}
}

func TestParsePackageJSONDir(t *testing.T) {
	tmpDir := t.TempDir()

	content := `{
  "name": "demo-node-app",
  "dependencies": {
    "react": "^18.0.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}`
	createTempFile(t, tmpDir, "package.json", content)

	deps, err := ParsePackageJSONDir(tmpDir)
	if err != nil {
		t.Fatalf("Error parsing package.json: %v", err)
	}

	expected := []string{"axios", "react", "typescript"}
	sort.Strings(deps)
	sort.Strings(expected)

	if !reflect.DeepEqual(deps, expected) {
		t.Errorf("Node deps mismatch.\nExpected: %v\nGot: %v", expected, deps)
	}
}

func TestScanRepoPathMulti_NoManifests(t *testing.T) {
	tmpDir := t.TempDir()
	// Empty dir

	graph, _, err := ScanRepoPathMulti(tmpDir)
	if err != nil {
		t.Fatalf("Scan failed on empty dir: %v", err)
	}

	if len(graph.Nodes) != 0 {
		t.Errorf("Expected 0 nodes for empty repo, got %d", len(graph.Nodes))
	}
}
