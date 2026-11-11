package httpapi

// Todoist task completion. Todoist tasks reach Cal read-only through the
// Google Calendar feed; each event's description carries the task URL, so the
// web app can close or reopen the task here. Env: TODOIST_API_TOKEN. Without
// it the status endpoint reports disabled and the web app hides the tick box.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	todoistClient  = &http.Client{Timeout: 15 * time.Second}
	todoistBaseURL = "https://api.todoist.com/api/v1"
	todoistTaskID  = regexp.MustCompile(`^[A-Za-z0-9]{1,40}$`)
)

func todoistToken() string { return os.Getenv("TODOIST_API_TOKEN") }

func (s *Server) todoistStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": todoistToken() != ""})
}

func (s *Server) todoistSetDone(c *gin.Context) {
	token := todoistToken()
	if token == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Todoist is not configured"})
		return
	}
	id := c.Param("id")
	if !todoistTaskID.MatchString(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task id"})
		return
	}
	var body struct {
		Done bool `json:"done"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if err := todoistSetTaskDone(c.Request.Context(), token, id, body.Done); err != nil {
		log.Printf("todoist: task %s done=%v: %v", id, body.Done, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Todoist update failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "done": body.Done})
}

// TodoistTask is the panel's view of an open Todoist task.
type TodoistTask struct {
	ID          string `json:"id"`
	Content     string `json:"content"`
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	ParentID    string `json:"parentId,omitempty"`
	Due         string `json:"due,omitempty"`
	Priority    int    `json:"priority"`
	Order       int    `json:"order"`
}

// TodoistProject orders the panel's groups; the inbox comes first.
type TodoistProject struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Inbox bool   `json:"inbox"`
	Order int    `json:"order"`
}

func (s *Server) todoistTasks(c *gin.Context) {
	token := todoistToken()
	if token == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Todoist is not configured"})
		return
	}
	tasks, projects, err := todoistOpenTasks(c.Request.Context(), token)
	if err != nil {
		log.Printf("todoist: list tasks: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Todoist request failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tasks": tasks, "projects": projects})
}

func todoistOpenTasks(ctx context.Context, token string) ([]TodoistTask, []TodoistProject, error) {
	var rawProjects []struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		ChildOrder int    `json:"child_order"`
		Inbox      bool   `json:"inbox_project"`
	}
	if err := todoistList(ctx, token, "/projects", &rawProjects); err != nil {
		return nil, nil, err
	}
	var rawTasks []struct {
		ID         string  `json:"id"`
		Content    string  `json:"content"`
		ProjectID  string  `json:"project_id"`
		ParentID   *string `json:"parent_id"`
		ChildOrder int     `json:"child_order"`
		Priority   int     `json:"priority"`
		Checked    bool    `json:"checked"`
		Due        *struct {
			Date string `json:"date"`
		} `json:"due"`
	}
	if err := todoistList(ctx, token, "/tasks", &rawTasks); err != nil {
		return nil, nil, err
	}
	names := map[string]string{}
	projects := make([]TodoistProject, 0, len(rawProjects))
	for _, p := range rawProjects {
		names[p.ID] = p.Name
		projects = append(projects, TodoistProject{ID: p.ID, Name: p.Name, Inbox: p.Inbox, Order: p.ChildOrder})
	}
	tasks := make([]TodoistTask, 0, len(rawTasks))
	for _, t := range rawTasks {
		if t.Checked {
			continue
		}
		task := TodoistTask{ID: t.ID, Content: t.Content, ProjectID: t.ProjectID, ProjectName: names[t.ProjectID], Priority: t.Priority, Order: t.ChildOrder}
		if t.ParentID != nil {
			task.ParentID = *t.ParentID
		}
		if t.Due != nil {
			// Timed dues are "2026-11-12T09:00:00"; the panel only shows the day.
			task.Due = t.Due.Date[:min(10, len(t.Due.Date))]
		}
		tasks = append(tasks, task)
	}
	return tasks, projects, nil
}

// todoistList follows Todoist's cursor pagination and appends every page's
// results into out, which must point to a slice.
func todoistList[T any](ctx context.Context, token, path string, out *[]T) error {
	cursor := ""
	for page := 0; page < 50; page++ {
		u := todoistBaseURL + path + "?limit=200"
		if cursor != "" {
			u += "&cursor=" + url.QueryEscape(cursor)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := todoistClient.Do(req)
		if err != nil {
			return err
		}
		var body struct {
			Results    []T     `json:"results"`
			NextCursor *string `json:"next_cursor"`
		}
		if resp.StatusCode/100 != 2 {
			msg, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
			resp.Body.Close()
			return fmt.Errorf("todoist %s: %s %s", path, resp.Status, strings.TrimSpace(string(msg)))
		}
		err = json.NewDecoder(resp.Body).Decode(&body)
		resp.Body.Close()
		if err != nil {
			return fmt.Errorf("todoist %s: %w", path, err)
		}
		*out = append(*out, body.Results...)
		if body.NextCursor == nil || *body.NextCursor == "" {
			return nil
		}
		cursor = *body.NextCursor
	}
	return fmt.Errorf("todoist %s: too many pages", path)
}

func todoistSetTaskDone(ctx context.Context, token, id string, done bool) error {
	action := "reopen"
	if done {
		action = "close"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, todoistBaseURL+"/tasks/"+url.PathEscape(id)+"/"+action, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := todoistClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return fmt.Errorf("todoist %s: %s %s", action, resp.Status, strings.TrimSpace(string(msg)))
	}
	return nil
}
