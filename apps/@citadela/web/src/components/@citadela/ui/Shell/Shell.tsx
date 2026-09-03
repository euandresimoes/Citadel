import Sidebar from "./Sidebar/Sidebar";
import Viewport from "./Viewport/Viewport";

function Shell() {
  return (
    <main className="flex h-screen w-screen items-center justify-center gap-8 overflow-hidden bg-canvas text-primary">
      <Sidebar />
      <Viewport />
    </main>
  );
}

export default Shell;
