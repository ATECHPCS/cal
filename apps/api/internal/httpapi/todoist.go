package httpapi

// Todoist task completion. Todoist tasks reach Cal read-only through the
// Google Calendar feed; each event's description carries the task URL, so the
// web app can close or reopen the task here. Env: TODOIST_API_TOKEN. Without
// it the status endpoint reports disabled and the web app hides the tick box.

import (
	"context"
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
