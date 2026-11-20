import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { TaskScreen } from "@/components/task-screen";

export const Route = createFileRoute("/tasks/$taskId")({
  component: TaskRoute,
});

function TaskRoute() {
  const { taskId } = Route.useParams();
  return (
    <Shell>
      <TaskScreen taskId={taskId} />
    </Shell>
  );
}
