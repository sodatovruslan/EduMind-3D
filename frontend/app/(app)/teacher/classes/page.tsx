import ProtectedRoute from "@/components/ProtectedRoute";
import ClassesList from "@/components/teacher/classes/ClassesList";

export default function TeacherClassesPage() {
  return <ProtectedRoute allowedRoles={["teacher", "admin"]}><ClassesList /></ProtectedRoute>;
}
