import "./Sidebar.scss";
import SidebarNav from "./Nav/SidebarNav";

function Sidebar() {
  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <SidebarNav />
    </aside>
  );
}

export default Sidebar;
