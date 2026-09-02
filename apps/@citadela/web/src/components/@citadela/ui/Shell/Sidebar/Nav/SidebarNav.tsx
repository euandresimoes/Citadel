import type { ReactElement } from "react";
import "./SidebarNav.scss";
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
    icon: <PiHouse className="app-sidebar-nav-icon" />,
    label: "Dashboard",
    route: "/dashboard",
  },
  {
    icon: <PiDeviceTabletSpeaker className="app-sidebar-nav-icon" />,
    label: "Devices",
    route: "/devices",
  },
  { icon: <PiGear className="app-sidebar-nav-icon" />, label: "Settings", route: "/settings/profile" },
];

function SidebarNav() {
  const currentRoute = useCurrentRoute();
  const { navigate } = useNavigation();

  return (
    <nav className="app-sidebar-nav" aria-label="Main navigation">
      {NavItems.map((item) => (
        <li
          key={item.route}
          onClick={() => navigate(item.route)}
          className={`app-sidebar-nav-item${currentRoute === item.route ? " active" : ""}`}
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
