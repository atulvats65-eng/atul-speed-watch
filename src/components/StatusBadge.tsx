import type { Status } from "../lib/engine";
import { Badge } from "./ui";

const MAP: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-700",
  "in progress": "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

export default function StatusBadge({ status }: { status: Status }) {
  const label = status === "in progress" ? "In Progress" : status[0]!.toUpperCase() + status.slice(1);
  return <Badge className={MAP[status]}>{label}</Badge>;
}
