import { Check, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { todayIso } from "../lib/date";
import { groupTodoistTasks, plainTaskText } from "../lib/todoist";
import { usePlanner } from "../stores/planner";
import { useUi } from "../stores/ui";

type Filter = "all" | "undated";

function formatDue(due: string, today: string): string {
  if (due === today) return "Today";
  const date = new Date(`${due}T12:00:00`);
  const sameYear = due.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString(
    undefined,
    sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" },
  );
}

export function TodoistPanel() {
  const tasks = usePlanner((state) => state.todoistTasks);
  const projects = usePlanner((state) => state.todoistProjects);
  const loading = usePlanner((state) => state.todoistLoading);
  const error = usePlanner((state) => state.todoistError);
  const loadTodoistTasks = usePlanner((state) => state.loadTodoistTasks);
  const setTodoistDone = usePlanner((state) => state.setTodoistDone);
  const toggleTodoistPanel = useUi((state) => state.toggleTodoistPanel);
  const [filter, setFilter] = useState<Filter>("all");
  const today = todayIso();

  useEffect(() => {
    void loadTodoistTasks();
  }, [loadTodoistTasks]);

  const shown = filter === "undated" ? tasks.filter((t) => !t.due) : tasks;
  const groups = useMemo(() => groupTodoistTasks(shown, projects), [shown, projects]);
  const undated = tasks.filter((t) => !t.due).length;

  return (
    <aside className="todoist-panel" aria-label="Todoist tasks">
      <header className="todoist-head">
        <h2>Todoist</h2>
        <span className="todoist-count">{tasks.length}</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label="Refresh Todoist" onClick={() => void loadTodoistTasks()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
        <button type="button" className="icon-btn" aria-label="Close Todoist panel" onClick={toggleTodoistPanel}>
          <X size={15} />
        </button>
      </header>
      <div className="seg todoist-filter" role="group" aria-label="Todoist filter">
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
          All <span className="n">{tasks.length}</span>
        </button>
        <button type="button" className={filter === "undated" ? "active" : ""} onClick={() => setFilter("undated")}>
          No date <span className="n">{undated}</span>
        </button>
      </div>
      <div className="todoist-body">
        {error && <p className="todoist-note error">{error}</p>}
        {!error && loading && tasks.length === 0 && <p className="todoist-note">Loading…</p>}
        {!error && !loading && groups.length === 0 && <p className="todoist-note">Nothing open.</p>}
        {groups.map(({ project, rows }) => (
          <section key={project.id} className="todoist-group">
            <h3>
              {project.name} <span className="n">{rows.length}</span>
            </h3>
            <ul>
              {rows.map(({ task, depth }) => {
                const text = plainTaskText(task.content);
                const overdue = task.due !== undefined && task.due < today;
                return (
                  <li key={task.id} className={`todoist-row p${task.priority}`} style={{ "--depth": depth } as React.CSSProperties}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={false}
                      aria-label={`Complete ${text} in Todoist`}
                      className="todoist-check"
                      onClick={() => void setTodoistDone(task.id, true)}
                    >
                      <Check size={10} strokeWidth={3.5} />
                    </button>
                    <a className="todoist-text" href={`https://app.todoist.com/app/task/${task.id}`} target="_blank" rel="noreferrer">
                      {text}
                    </a>
                    {task.due && <span className={`todoist-due ${overdue ? "overdue" : ""}`}>{formatDue(task.due, today)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
