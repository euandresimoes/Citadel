import Sidebar from "./Sidebar/Sidebar";
import Viewport from "./Viewport/Viewport";
import "./Shell.scss";

function Shell() {
  return (
    <main className="app-shell">
      <Sidebar />
      <Viewport />
    </main>
  );
}

export default Shell;
