package httpapi

import (
	"context"
	"fmt"
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

func TestTodoistOpenTasks(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/projects":
			fmt.Fprint(w, `{"results":[{"id":"p1","name":"Inbox","child_order":0,"inbox_project":true},{"id":"p2","name":"Shop","child_order":1}],"next_cursor":null}`)
		case r.URL.Path == "/tasks" && r.URL.Query().Get("cursor") == "":
			fmt.Fprint(w, `{"results":[{"id":"t1","content":"Pay rent","project_id":"p1","child_order":2,"priority":4,"due":{"date":"2026-11-12T09:00:00"}}],"next_cursor":"c2"}`)
		case r.URL.Path == "/tasks" && r.URL.Query().Get("cursor") == "c2":
			fmt.Fprint(w, `{"results":[{"id":"t2","content":"Oil wrench","project_id":"p2","parent_id":"t9","child_order":1,"priority":1,"due":null},{"id":"t3","content":"old","project_id":"p2","checked":true}],"next_cursor":null}`)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	old := todoistBaseURL
	todoistBaseURL = srv.URL
	defer func() { todoistBaseURL = old }()

	tasks, projects, err := todoistOpenTasks(context.Background(), "tok")
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 2 || !projects[0].Inbox {
		t.Fatalf("projects = %+v", projects)
	}
	if len(tasks) != 2 {
		t.Fatalf("want 2 open tasks across pages, got %+v", tasks)
	}
	if tasks[0].Due != "2026-11-12" || tasks[0].ProjectName != "Inbox" || tasks[0].Priority != 4 {
		t.Errorf("task 1 = %+v", tasks[0])
	}
	if tasks[1].Due != "" || tasks[1].ParentID != "t9" || tasks[1].ProjectName != "Shop" {
		t.Errorf("task 2 = %+v", tasks[1])
	}
}
