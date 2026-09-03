import type { ReactElement } from "react";
import { PiDeviceTabletSpeaker, PiHouse, PiGear } from "react-icons/pi";
import { useCurrentRoute } from "../../../../../../hooks/@citadela/routing/useCurrentRoute";
import { useNavigation } from "../../../../../../hooks/@citadela/routing/useNavigation";

type NavItem = {
  icon: ReactElement;
  label: string;
  route: string;
};

const NavItems: NavItem[] = [
  {
    icon: <PiHouse className="size-4" />,
    label: "Dashboard",
    route: "/dashboard",
  },
  {
    icon: <PiDeviceTabletSpeaker className="size-4" />,
    label: "Devices",
    route: "/devices",
  },
  { icon: <PiGear className="size-4" />, label: "Profile", route: "/settings/profile" },
  { icon: <PiGear className="size-4" />, label: "Network", route: "/settings/network" },
];

function SidebarNav() {
  const currentRoute = useCurrentRoute();
  const { navigate } = useNavigation();

  return (
    <nav className="flex flex-col gap-1" aria-label="Main navigation">
      {NavItems.map((item) => (
        <li
          key={item.route}
          onClick={() => navigate(item.route)}
          className={`flex h-8 items-center gap-2 border-l-2 px-2 text-xs text-muted transition-colors hover:bg-hover hover:text-primary ${currentRoute === item.route ? "active border-accent bg-white/6 text-primary" : "border-transparent"}`}
          aria-current={currentRoute === item.route ? "page" : undefined}
        >
          {item.icon}
          <span className="app-sidebar-nav-label">{item.label}</span>
        </li>
      ))}
    </nav>
  );
}

export default SidebarNav;
