package httpapi

// Multi-calendar Google sync (fork addition). Upstream synced only the
// primary calendar into one "Google" feed. Here every calendar the user has
// selected in Google (calendarList.selected) becomes its own Cal feed,
// url "google:<calendarId>", so each can be toggled/coloured independently.
// The primary calendar keeps upstream's url "google:primary" and name
// "Google" so existing installs upgrade without a migration.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"cal/apps/api/internal/store"
)

const googleFeedPrefix = "google:"

type googleCalendar struct {
	ID              string `json:"id"`
	Summary         string `json:"summary"`
	SummaryOverride string `json:"summaryOverride"`
	Primary         bool   `json:"primary"`
	Selected        bool   `json:"selected"`
	Deleted         bool   `json:"deleted"`
	BackgroundColor string `json:"backgroundColor"`
}

func (g googleCalendar) feedURL() string {
	if g.Primary {
		return googleFeedPrefix + "primary"
	}
	return googleFeedPrefix + g.ID
}

func (g googleCalendar) feedName() string {
	if g.Primary {
		return "Google"
	}
	if g.SummaryOverride != "" {
		return g.SummaryOverride
	}
	if g.Summary != "" {
		return g.Summary
	}
	return g.ID
}

// fetchGoogleCalendarList returns the calendars shown in the user's Google
// Calendar sidebar (selected, not deleted). Hidden ones are excluded by the API.
func fetchGoogleCalendarList(ctx context.Context, access string) ([]googleCalendar, error) {
	var out []googleCalendar
	pageToken := ""
	for {
		q := url.Values{"minAccessRole": {"reader"}, "maxResults": {"250"}}
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet,
			"https://www.googleapis.com/calendar/v3/users/me/calendarList?"+q.Encode(), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+access)
		resp, err := gcalClient.Do(req)
		if err != nil {
			return nil, err
		}
		var data struct {
			Items         []googleCalendar `json:"items"`
			NextPageToken string           `json:"nextPageToken"`
		}
		status := resp.StatusCode
		body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		if status != 200 {
			return nil, fmt.Errorf("calendarList: %d: %s", status, truncate(string(body), 200))
		}
		if err := json.Unmarshal(body, &data); err != nil {
			return nil, err
		}
		for _, c := range data.Items {
			if c.Deleted || !c.Selected || c.ID == "" {
				continue
			}
			out = append(out, c)
		}
		if data.NextPageToken == "" {
			return out, nil
		}
		pageToken = data.NextPageToken
	}
}

// syncGoogleCalendars mirrors the selected Google calendars onto Cal feeds:
// creates missing feeds, renames/recolours changed ones, refreshes each ICS
// cache, and removes feeds for calendars no longer selected. Returns the
// primary feed id (for google_tokens.feed_id) and nil if at least one
// calendar synced.
func (s *Server) syncGoogleCalendars(ctx context.Context, userID, access string, cals []googleCalendar) (string, error) {
	feeds, err := s.store.ListFeeds(ctx, userID)
	if err != nil {
		return "", err
	}
	existing := map[string]store.Feed{}
	for _, f := range feeds {
		if strings.HasPrefix(f.URL, googleFeedPrefix) {
			existing[f.URL] = f
		}
	}
	want := map[string]bool{}
	primaryID := ""
	var firstErr error
	synced := 0
	for _, cal := range cals {
		u := cal.feedURL()
		want[u] = true
		name, color := cal.feedName(), paletteForHex(cal.BackgroundColor)
		feed, ok := existing[u]
		if !ok {
			feed, err = s.store.CreateFeed(ctx, userID, name, u, color, "calendar", "")
			if err != nil {
				log.Printf("google sync: create feed %s: %v", name, err)
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
		} else if feed.Name != name || feed.Color != color {
			if err := s.store.UpdateFeedMeta(ctx, userID, feed.ID, name, color); err != nil {
				log.Printf("google sync: update feed %s: %v", name, err)
			}
		}
		if cal.Primary {
			primaryID = feed.ID
		}
		ics, err := fetchGoogleICS(ctx, access, cal.ID)
		if err != nil {
			log.Printf("google sync: %s (%s): %v", name, cal.ID, err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if err := s.store.RefreshFeedCache(ctx, userID, feed.ID, ics); err != nil {
			log.Printf("google sync: cache %s: %v", name, err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		synced++
	}
	// Drop feeds for calendars the user unselected/unsubscribed in Google.
	for u, f := range existing {
		if !want[u] {
			if err := s.store.DeleteFeed(ctx, userID, f.ID); err != nil && err != store.ErrNotFound {
				log.Printf("google sync: remove feed %s: %v", f.Name, err)
			}
		}
	}
	if synced == 0 && firstErr != nil {
		return primaryID, firstErr
	}
	return primaryID, nil
}

// deleteGoogleFeeds removes every Google-backed feed (disconnect).
func (s *Server) deleteGoogleFeeds(ctx context.Context, userID string) {
	feeds, err := s.store.ListFeeds(ctx, userID)
	if err != nil {
		return
	}
	for _, f := range feeds {
		if strings.HasPrefix(f.URL, googleFeedPrefix) {
			_ = s.store.DeleteFeed(ctx, userID, f.ID)
		}
	}
}

// paletteForHex maps a Google calendar colour (#rrggbb) onto Cal's named
// palette by hue, so feeds roughly keep the colours the user chose in Google.
func paletteForHex(hex string) string {
	hex = strings.TrimPrefix(strings.TrimSpace(hex), "#")
	if len(hex) != 6 {
		return "sky"
	}
	v, err := strconv.ParseUint(hex, 16, 32)
	if err != nil {
		return "sky"
	}
	r := float64(v>>16&0xff) / 255
	g := float64(v>>8&0xff) / 255
	b := float64(v&0xff) / 255
	max := math.Max(r, math.Max(g, b))
	min := math.Min(r, math.Min(g, b))
	d := max - min
	if d < 0.12 { // grey-ish
		return "slate"
	}
	var h float64
	switch max {
	case r:
		h = math.Mod((g-b)/d, 6)
	case g:
		h = (b-r)/d + 2
	default:
		h = (r-g)/d + 4
	}
	h *= 60
	if h < 0 {
		h += 360
	}
	switch {
	case h < 15 || h >= 340:
		return "red"
	case h < 40:
		return "orange"
	case h < 75:
		return "amber"
	case h < 180:
		return "mint"
	case h < 250:
		return "sky"
	case h < 300:
		return "violet"
	default:
		return "rose"
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
