import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, Button, Modal, Avatar, Badge, Tooltip, Switch, Dropdown, Divider } from "antd";
import {
  DashboardOutlined,
  UnorderedListOutlined,
  TeamOutlined,
  UserOutlined,
  LogoutOutlined,
  ShoppingOutlined,
  CalendarOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  BulbOutlined,
  BulbFilled,
  MoonOutlined,
  SunOutlined
} from "@ant-design/icons";

function MenuSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [logoError, setLogoError] = useState(false);
  
  // Get user info from localStorage
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userRole = localStorage.getItem("role");

  // Load saved states from localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("sidebarCollapsed");
    if (savedCollapsed !== null) {
      setCollapsed(JSON.parse(savedCollapsed));
    }
    
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme !== null) {
      setIsDarkMode(savedTheme === "dark");
      applyTheme(savedTheme === "dark");
    }
  }, []);

  // Apply theme to document
  const applyTheme = (dark) => {
    if (dark) {
      document.documentElement.classList.add("dark");
      document.body.style.backgroundColor = "#111827";
    } else {
      document.documentElement.classList.remove("dark");
      document.body.style.backgroundColor = "#f9fafb";
    }
  };

  // Save collapsed state to localStorage when it changes
  const toggleCollapsed = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem("sidebarCollapsed", JSON.stringify(newCollapsed));
  };

  // Toggle theme
  const toggleTheme = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem("theme", newDarkMode ? "dark" : "light");
    applyTheme(newDarkMode);
  };

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("sidebarCollapsed");
    navigate("/", { replace: true });
    setLogoutModalVisible(false);
  };

  const menuItems = [
    { 
      key: "/dashboard", 
      icon: <DashboardOutlined />, 
      label: "Dashboard",
      role: ["admin", "staff"]
    },
    { 
      key: "/products", 
      icon: <ShoppingOutlined />, 
      label: "Products Management",
      role: ["admin", "staff"]
    },
    { 
      key: "/attendance", 
      icon: <CalendarOutlined />, 
      label: "Attendance Management",
      role: ["admin", "staff"]
    },
    {
      key: "/employee-tracker",
      icon: <UnorderedListOutlined />,
      label: "Employee Logs",
      role: ["admin"]
    },
    { 
      key: "/staff", 
      icon: <TeamOutlined />, 
      label: "Staff Management",
      role: ["admin"]
    },
  ];

  // Filter menu items based on user role
  const filteredMenuItems = menuItems.filter(item => 
    item.role.includes(userRole || "staff")
  );

  // User dropdown menu
  const userMenuItems = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Profile",
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "Settings",
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      danger: true,
      onClick: () => setLogoutModalVisible(true),
    },
  ];

  const sidebarClasses = isDarkMode
    ? "bg-gradient-to-b from-gray-900 to-gray-800 text-white"
    : "bg-gradient-to-b from-white to-gray-50 text-gray-800 border-r border-gray-200";

  const logoTextClasses = isDarkMode ? "text-white" : "text-gray-800";
  const logoSubtextClasses = isDarkMode ? "text-gray-400" : "text-gray-500";
  const borderClasses = isDarkMode ? "border-gray-700" : "border-gray-200";
  const menuTheme = isDarkMode ? "dark" : "light";

  return (
    <>
      <aside 
        className={`${
          collapsed ? "w-20" : "w-64"
        } ${sidebarClasses} flex flex-col transition-all duration-300 ease-in-out shadow-xl overflow-hidden min-h-screen relative`}
      >
        {/* Toggle Button */}
        <button
          onClick={toggleCollapsed}
          className={`absolute -right-3 top-8 ${
            isDarkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-white hover:bg-gray-100 border border-gray-200"
          } rounded-full p-1.5 shadow-lg transition-all duration-200 z-50`}
        >
          {collapsed ? 
            <MenuUnfoldOutlined className={`text-sm ${isDarkMode ? "text-white" : "text-gray-700"}`} /> : 
            <MenuFoldOutlined className={`text-sm ${isDarkMode ? "text-white" : "text-gray-700"}`} />
          }
        </button>

        {/* Logo Section */}
        <div
          className={`flex flex-col items-center justify-center py-6 border-b ${borderClasses} cursor-pointer transition-all duration-300 ${
            collapsed ? "px-2" : "px-4"
          }`}
          onClick={() => navigate("/dashboard")}
        >
          <div className="relative">
            <div className={`${
              collapsed ? "w-12 h-12" : "w-16 h-16"
            } rounded-full flex items-center justify-center shadow-lg transition-all duration-300 overflow-hidden bg-gradient-to-r from-blue-500 to-indigo-600`}>
              {!logoError ? (
                <img 
                  src="/lechon-manok.png" 
                  alt="Lechon Manok Logo" 
                  className="w-full h-full object-cover rounded-full"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span className="text-white font-bold text-xl">NM</span>
              )}
            </div>
            <Badge 
              status="success" 
              offset={collapsed ? [-5, 35] : [-5, 45]}
              className="absolute bottom-0 right-0"
            />
          </div>
          {!collapsed && (
            <div className="mt-3 text-center">
              <h3 className={`font-bold text-sm tracking-wide ${logoTextClasses}`}>NEW MOON</h3>
              <p className={`text-xs ${logoSubtextClasses}`}>LECHON MANOK</p>
            </div>
          )}
        </div>

        {/* User Info (when expanded) */}
        {!collapsed && user && (
          <div className={`px-4 py-4 border-b ${borderClasses}`}>
            <Dropdown
              menu={{ items: userMenuItems }}
              trigger={["click"]}
              placement="bottomLeft"
            >
              <div className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors">
                <Avatar 
                  icon={<UserOutlined />} 
                  className="bg-gradient-to-r from-blue-500 to-indigo-600"
                  size="default"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isDarkMode ? "text-white" : "text-gray-800"}`}>
                    {user.name || user.username || "User"}
                  </p>
                  <p className={`text-xs capitalize ${logoSubtextClasses}`}>
                    {userRole === "admin" ? "Administrator" : "Staff Member"}
                  </p>
                </div>
              </div>
            </Dropdown>
          </div>
        )}

        {/* Menu Section - No scroll */}
        <div className="flex-1 mt-4 px-2">
          <Menu
            theme={menuTheme}
            mode="inline"
            selectedKeys={[location.pathname]}
            onClick={(item) => navigate(item.key)}
            items={filteredMenuItems}
            inlineCollapsed={collapsed}
            className="bg-transparent border-none"
            style={{ background: "transparent" }}
          />
        </div>

        {/* Bottom Actions */}
        <div className={`border-t ${borderClasses} pt-4 pb-6 px-2 space-y-3`}>
          {/* Theme Toggle */}
          {!collapsed && (
            <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}`}>
              <div className="flex items-center gap-2">
                {isDarkMode ? (
                  <MoonOutlined className="text-blue-400 text-sm" />
                ) : (
                  <SunOutlined className="text-orange-500 text-sm" />
                )}
                <span className={`text-xs ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                  {isDarkMode ? "Dark Mode" : "Light Mode"}
                </span>
              </div>
              <Switch
                checked={isDarkMode}
                onChange={toggleTheme}
                checkedChildren={<BulbFilled />}
                unCheckedChildren={<BulbOutlined />}
                size="small"
              />
            </div>
          )}
          
          {collapsed && (
            <Tooltip title={isDarkMode ? "Light Mode" : "Dark Mode"} placement="right">
              <Button
                type="text"
                icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                className="w-full"
                style={{ color: isDarkMode ? "#fbbf24" : "#6366f1" }}
              />
            </Tooltip>
          )}

          <Divider className={`my-2 ${borderClasses}`} style={{ margin: "8px 0" }} />
          
          {/* Logout Button */}
          {collapsed ? (
            <Tooltip title="Logout" placement="right">
              <Button
                type="text"
                danger
                icon={<LogoutOutlined />}
                onClick={() => setLogoutModalVisible(true)}
                className="w-full"
              />
            </Tooltip>
          ) : (
            <Button
              danger
              icon={<LogoutOutlined />}
              onClick={() => setLogoutModalVisible(true)}
              block
              className="shadow-sm"
              size="middle"
            >
              Logout
            </Button>
          )}
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <LogoutOutlined className="text-red-500" />
            <span>Confirm Logout</span>
          </div>
        }
        open={logoutModalVisible}
        onOk={handleLogout}
        onCancel={() => setLogoutModalVisible(false)}
        okText="Yes, Logout"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
        centered
      >
        <p>Are you sure you want to logout?</p>
        <p className="text-sm text-gray-500 mt-2">You will need to login again to access your account.</p>
      </Modal>
    </>
  );
}

export default MenuSidebar;