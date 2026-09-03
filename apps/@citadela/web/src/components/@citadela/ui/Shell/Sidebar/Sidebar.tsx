import SidebarNav from "./Nav/SidebarNav";

function Sidebar() {
  return (
    <aside className="flex h-full w-[10rem] shrink-0 flex-col justify-between pt-8 overflow-hidden border-r-1 border-line" aria-label="Main navigation">
      <SidebarNav />
    </aside>
  );
}

export default Sidebar;
