package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTodoistSetTaskDone(t *testing.T) {
	var gotPath, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotAuth = r.Method+" "+r.URL.Path, r.Header.Get("Authorization")
		if r.URL.Path == "/tasks/missing/close" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()
	old := todoistBaseURL
	todoistBaseURL = srv.URL
	defer func() { todoistBaseURL = old }()

	if err := todoistSetTaskDone(context.Background(), "tok", "6h5cp884", true); err != nil {
		t.Fatal(err)
	}
	if gotPath != "POST /tasks/6h5cp884/close" || gotAuth != "Bearer tok" {
		t.Fatalf("close sent %q auth %q", gotPath, gotAuth)
	}
	if err := todoistSetTaskDone(context.Background(), "tok", "6h5cp884", false); err != nil || gotPath != "POST /tasks/6h5cp884/reopen" {
		t.Fatalf("reopen sent %q err %v", gotPath, err)
	}
	if err := todoistSetTaskDone(context.Background(), "tok", "missing", true); err == nil {
		t.Fatal("expected error on 404")
	}
}

func TestTodoistTaskIDPattern(t *testing.T) {
	for _, id := range []string{"6h5cp884FpfgVjJC", "123"} {
		if !todoistTaskID.MatchString(id) {
			t.Errorf("%q should be valid", id)
		}
	}
	for _, id := range []string{"", "../projects", "a/b", "x y"} {
		if todoistTaskID.MatchString(id) {
			t.Errorf("%q should be rejected", id)
		}
	}
}
