import ProtectedRoute from "@/components/ProtectedRoute";
import ClassDetail from "@/components/teacher/classes/ClassDetail";

export default function TeacherClassDetailPage({ params }: { params: { id: string } }) {
  return <ProtectedRoute allowedRoles={["teacher", "admin"]}><ClassDetail classroomId={params.id} /></ProtectedRoute>;
}
