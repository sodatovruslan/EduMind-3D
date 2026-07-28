// простой спиннер загрузки, используем пока не завезли скелетоны
export default function Loader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
    </div>
  );
}
