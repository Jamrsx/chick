import React from "react";
import MenuSidebar from "./Menu";

function MenuLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <MenuSidebar />

      <div className="flex-1 h-full overflow-hidden p-6 bg-gray-100">
        {children}
      </div>
    </div>
  );
}

export default MenuLayout;
  