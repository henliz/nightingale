import { Navigate, Outlet } from "react-router";
import type { Role } from "../data/users";
import { useSession } from "../session/SessionContext";

/** Gate a route subtree to a signed-in user with the given role. */
export function RequireRole({ role }: { role: Role }) {
  const { user } = useSession();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to={user.role === "firefighter" ? "/fire" : "/paramedic"} replace />;
  return <Outlet />;
}
