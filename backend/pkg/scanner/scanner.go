package scanner

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

// --- XML Types for .NET ---
type csprojDependencies struct {
	XMLName    xml.Name `xml:"Project"`
	ItemGroups []struct {
		PackageRefs []struct {
			Include string `xml:"Include,attr"`
			Version string `xml:"Version,attr"`
		} `xml:"PackageReference"`
		ProjectRefs []struct {
			Include string `xml:"Include,attr"`
		} `xml:"ProjectReference"`
	} `xml:"ItemGroup"`
}

// --- Graph types used by scanner ---
type EdgeV struct {
	From string `json:"from"`
	To   string `json:"to"`
	Via  string `json:"via,omitempty"`
}
type GraphV struct {
	Nodes []string `json:"nodes"`
	Edges []EdgeV  `json:"edges"`
}
type NodeMeta struct {
	Path      string   `json:"path"`
	Language  string   `json:"language,omitempty"`
	Manifests []string `json:"manifests,omitempty"`
	RawDeps   []string `json:"raw_deps,omitempty"`
}

// --- Clone helper (uses git binary) ---
func GitCloneToTemp(repoURL, ref, token string) (string, error) {
	tmpDir, err := ioutil.TempDir("", "devsync-scan-")
	if err != nil {
		return "", err
	}
	cloneURL := repoURL
	if token != "" && strings.HasPrefix(repoURL, "https://") {
		cloneURL = strings.Replace(repoURL, "https://", "https://"+token+"@", 1)
	}
	args := []string{"clone", "--depth", "1", cloneURL, tmpDir}
	if ref != "" {
		args = []string{"clone", "--branch", ref, "--depth", "1", cloneURL, tmpDir}
	}
	cmd := exec.Command("git", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		_ = os.RemoveAll(tmpDir)
		return "", fmt.Errorf("git clone failed: %v - %s", err, string(out))
	}
	return tmpDir, nil
}

// --- Parsers for manifests ---

// parse go.mod -> module path and require list (module paths)
func ParseGoModDir(dir string) (string, []string, error) {
	gomod := filepath.Join(dir, "go.mod")
	data, err := ioutil.ReadFile(gomod)
	if err != nil {
		return "", nil, err
	}
	// simple parse: find "module ..." and "require ..." occurrences
	module := ""
	reqs := []string{}
	lines := strings.Split(string(data), "\n")
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if strings.HasPrefix(l, "module ") && module == "" {
			module = strings.TrimSpace(strings.TrimPrefix(l, "module "))
		}
		// capture individual require lines (naive)
		if strings.HasPrefix(l, "require ") {
			parts := strings.Fields(l)
			if len(parts) >= 2 && parts[1] != "(" {
				reqs = append(reqs, parts[1])
			}
		}
		// handle lines inside a require(...) block
		if strings.HasPrefix(l, "//") || l == "" {
			continue
		}
		// also look for module-like tokens anywhere
		if strings.Contains(l, "/") && strings.Count(l, " ") <= 1 {
			// naive heuristics: lines with slashes likely module paths
			tok := strings.Fields(l)[0]
			if strings.Contains(tok, "/") {
				reqs = append(reqs, tok)
			}
		}
	}
	return module, UniqueStrings(reqs), nil
}

// parse package.json -> dependency names
func ParsePackageJSONDir(dir string) ([]string, error) {
	pj := filepath.Join(dir, "package.json")
	data, err := ioutil.ReadFile(pj)
	if err != nil {
		return nil, err
	}
	var obj map[string]interface{}
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, err
	}
	deps := []string{}
	for _, key := range []string{"dependencies", "devDependencies", "peerDependencies"} {
		if v, ok := obj[key]; ok {
			if m, ok := v.(map[string]interface{}); ok {
				for name := range m {
					deps = append(deps, name)
				}
			}
		}
	}
	return UniqueStrings(deps), nil
}

// parse requirements.txt -> package names
func ParseRequirementsDir(dir string) ([]string, error) {
	rq := filepath.Join(dir, "requirements.txt")
	data, err := ioutil.ReadFile(rq)
	if err != nil {
		return nil, err
	}
	deps := []string{}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		part := strings.Split(line, "==")[0]
		part = strings.Split(part, ">=")[0]
		deps = append(deps, strings.TrimSpace(part))
	}
	return UniqueStrings(deps), nil
}

// parse pyproject.toml - naive: look for dependencies section keywords
func ParsePyprojectDir(dir string) ([]string, error) {
	p := filepath.Join(dir, "pyproject.toml")
	data, err := ioutil.ReadFile(p)
	if err != nil {
		return nil, err
	}
	deps := []string{}
	// naive regex for common names
	re := regexp.MustCompile(`(?m)^\s*([A-Za-z0-9_\-\.]+)\s*=`)
	for _, m := range re.FindAllStringSubmatch(string(data), -1) {
		if len(m) > 1 {
			deps = append(deps, strings.TrimSpace(m[1]))
		}
	}
	return UniqueStrings(deps), nil
}

// parse pom.xml -> groupId:artifactId and dependencies
type pomDependencies struct {
	XMLName     xml.Name `xml:"project"`
	GroupId     string   `xml:"groupId"`
	ArtifactId  string   `xml:"artifactId"`
	DepsWrapper struct {
		Deps []struct {
			GroupId    string `xml:"groupId"`
			ArtifactId string `xml:"artifactId"`
		} `xml:"dependency"`
	} `xml:"dependencies"`
}

func ParsePomDir(dir string) (string, []string, error) {
	p := filepath.Join(dir, "pom.xml")
	data, err := ioutil.ReadFile(p)
	if err != nil {
		return "", nil, err
	}
	var pom pomDependencies
	if err := xml.Unmarshal(data, &pom); err != nil {
		// fallback: try regex for artifactId
		aid := findFirstTagValue(string(data), "artifactId")
		if aid == "" {
			return "", nil, err
		}
		return aid, nil, nil
	}
	name := strings.TrimSpace(pom.ArtifactId)
	deps := []string{}
	for _, d := range pom.DepsWrapper.Deps {
		if d.ArtifactId != "" {
			deps = append(deps, fmt.Sprintf("%s:%s", d.GroupId, d.ArtifactId))
		}
	}
	return name, UniqueStrings(deps), nil
}

// parse build.gradle (naive) -> find implementation 'group:name:version' style
func ParseGradleDir(dir string) ([]string, error) {
	f := filepath.Join(dir, "build.gradle")
	data, err := ioutil.ReadFile(f)
	if err != nil {
		// try build.gradle.kts
		f2 := filepath.Join(dir, "build.gradle.kts")
		data2, err2 := ioutil.ReadFile(f2)
		if err2 != nil {
			return nil, err
		}
		data = data2
	}
	re := regexp.MustCompile(`['"]([A-Za-z0-9\-_\.]+:[A-Za-z0-9\-_\.]+:[^'"]+)['"]`)
	matches := re.FindAllStringSubmatch(string(data), -1)
	deps := []string{}
	for _, m := range matches {
		if len(m) > 1 {
			deps = append(deps, m[1])
		}
	}
	return UniqueStrings(deps), nil
}

// parse Dockerfile (collect image names used in FROM)
func ParseDockerfileDir(dir string) ([]string, error) {
	f := filepath.Join(dir, "Dockerfile")
	data, err := ioutil.ReadFile(f)
	if err != nil {
		return nil, err
	}
	re := regexp.MustCompile(`(?mi)^FROM\s+([^\s]+)`)
	deps := []string{}
	for _, m := range re.FindAllStringSubmatch(string(data), -1) {
		if len(m) > 1 {
			deps = append(deps, m[1])
		}
	}
	return UniqueStrings(deps), nil
}

// uniqueStrings utility
func UniqueStrings(arr []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range arr {
		if s == "" {
			continue
		}
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// --- detect service directories and build graph ---
// --- detect service directories and build graph ---
func ScanRepoPathMulti(root string) (*GraphV, map[string]NodeMeta, error) {
	nodeMeta := map[string]NodeMeta{} // nodeName -> meta
	manifests := []string{"go.mod", "package.json", "requirements.txt", "pyproject.toml", "pom.xml", "build.gradle", "Dockerfile", "build.gradle.kts", ".csproj", ".sln"}

	_ = filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			return nil
		}
		base := filepath.Base(p)
		// skip common noise dirs
		if base == ".git" || base == "node_modules" || base == "venv" || base == "__pycache__" {
			return filepath.SkipDir
		}
		found := false
		meta := NodeMeta{Path: "", Language: "", Manifests: []string{}, RawDeps: []string{}}

		for _, m := range manifests {
			mf := filepath.Join(p, m)
			if _, statErr := os.Stat(mf); statErr == nil {
				log.Printf("Scanner: found manifest %s in %s", m, p)
				found = true
				meta.Manifests = append(meta.Manifests, m)
				switch m {
				case "go.mod":
					moduleName, reqs, err := ParseGoModDir(p)
					if err == nil {
						meta.RawDeps = append(meta.RawDeps, reqs...)
						if moduleName != "" {
							meta.RawDeps = append(meta.RawDeps, moduleName)
						}
						meta.Language = "go"
					}
				case "package.json":
					if reqs, err := ParsePackageJSONDir(p); err == nil {
						meta.RawDeps = append(meta.RawDeps, reqs...)
						meta.Language = "node"
					}
				case "requirements.txt":
					if reqs, err := ParseRequirementsDir(p); err == nil {
						meta.RawDeps = append(meta.RawDeps, reqs...)
						meta.Language = "python"
					}
				case "pyproject.toml":
					if reqs, err := ParsePyprojectDir(p); err == nil {
						meta.RawDeps = append(meta.RawDeps, reqs...)
						meta.Language = "python"
					}
				case "pom.xml":
					if name, reqs, err := ParsePomDir(p); err == nil {
						if name != "" {
							meta.RawDeps = append(meta.RawDeps, name)
						}
						meta.RawDeps = append(meta.RawDeps, reqs...)
						meta.Language = "java-maven"
					}
				case "build.gradle", "build.gradle.kts":
					if reqs, err := ParseGradleDir(p); err == nil {
						meta.RawDeps = append(meta.RawDeps, reqs...)
						meta.Language = "java-gradle"
					}
				case "Dockerfile":
					if reqs, err := ParseDockerfileDir(p); err == nil {
						meta.RawDeps = append(meta.RawDeps, reqs...)
						// don't set language; docker can be present in any project
					}
				}
			}
			// Special check for .csproj since the filename is dynamic
			if strings.HasSuffix(m, ".csproj") {
				name, reqs, err := ParseCsprojDir(p)
				if err == nil {
					if name != "" {
						meta.RawDeps = append(meta.RawDeps, name)
					}
					meta.RawDeps = append(meta.RawDeps, reqs...)
					meta.Language = "dotnet"
					found = true
				}
			}
		}

		if found {
			rel, _ := filepath.Rel(root, p)
			if rel == "." || rel == "" {
				rel = filepath.Base(root)
			}
			nodeName := rel
			meta.Path = rel
			meta.RawDeps = UniqueStrings(meta.RawDeps)
			nodeMeta[nodeName] = meta
		}
		return nil
	})

	// Build nodes list and edges by matching dependency tokens to other nodes or heuristics
	nodes := []string{}
	for n := range nodeMeta {
		nodes = append(nodes, n)
	}
	edges := []EdgeV{}
	for from, meta := range nodeMeta {
		for _, dep := range meta.RawDeps {
			// try match to node by folder name or by artifact id
			for to := range nodeMeta { // <--- fixed: no unused variable
				if from == to {
					continue
				}
				// heuristics: exact match, suffix match, or token contains folder name
				if dep == to || strings.HasSuffix(dep, "/"+to) || strings.Contains(dep, "/"+to) || (len(to) > 2 && strings.Contains(dep, to)) {
					edges = append(edges, EdgeV{From: from, To: to, Via: dep})
				} else {
					// also try matching by artifactId/group:artifactId for Java: "group:artifact"
					parts := strings.Split(dep, ":")
					if len(parts) >= 2 {
						artifact := parts[len(parts)-1]
						if artifact == to || strings.Contains(artifact, to) {
							edges = append(edges, EdgeV{From: from, To: to, Via: dep})
						}
					}
				}
			}
		}
	}
	return &GraphV{Nodes: nodes, Edges: edges}, nodeMeta, nil
}

func findFirstTagValue(s, tag string) string {
	re := regexp.MustCompile(`(?s)<` + regexp.QuoteMeta(tag) + `\b[^>]*>(.*?)</` + regexp.QuoteMeta(tag) + `>`)
	m := re.FindStringSubmatch(s)
	if len(m) >= 2 {
		return strings.TrimSpace(m[1])
	}
	return ""
}
