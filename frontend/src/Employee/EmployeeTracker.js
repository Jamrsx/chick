import React, { useState, useEffect } from "react";
import { Tag, Progress, DatePicker as AntDatePicker } from "antd";
import { 
  CalendarOutlined, 
  CheckCircleOutlined, 
  StarOutlined,
  UserOutlined,
  ShoppingCartOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  DollarOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../config/api";



function EmployeeTracker() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [attendanceData, setAttendanceData] = useState([]);
  const [staffSalesData, setStaffSalesData] = useState([]);
  const [performanceData, setPerformanceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Update current time
  useEffect(() => {
    const updatePHTime = () => {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const phTime = new Date(utc + 8 * 60 * 60 * 1000);
      setCurrentTime(phTime);
    };

    updatePHTime();
    const timer = setInterval(updatePHTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const toTitle = (value) => {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const safeName = (u) => `${u?.firstname || ""} ${u?.lastname || ""}`.trim() || u?.username || "Unknown";

  const formatTime = (value) => {
    if (!value) return "-";

    if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
      const [hourRaw, minuteRaw] = value.split(":");
      const hour24 = Number(hourRaw);
      const minute = Number(minuteRaw);
      if (Number.isFinite(hour24) && Number.isFinite(minute)) {
        const hour12 = hour24 % 12 || 12;
        const ampm = hour24 >= 12 ? "PM" : "AM";
        return `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;
      }
    }

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
      });
    }

    return value;
  };

  const calculateAttendanceRate = (record) => {
    if (!record.hasTimeIn) return 0;

    const lateMinutes = Number(record.lateMinutes || 0);
    const completionBase = record.hasTimeOut ? 100 : 50;
    const latePenalty = Math.min(lateMinutes, completionBase);

    return Math.max(0, completionBase - latePenalty);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const results = await Promise.allSettled([
          api.get("/staff"),
          api.get("/attendance", { params: { date: selectedDate } }),
          api.get("/sales", { params: { date: selectedDate } }),
        ]);

        const labels = ["GET /staff", "GET /attendance", "GET /sales"];
        const rejectedIdx = results.findIndex((r) => r.status === "rejected");
        if (rejectedIdx !== -1) {
          const reason = results[rejectedIdx].reason;
          const status = reason?.response?.status;
          const backendMessage =
            reason?.response?.data?.message ||
            reason?.response?.data?.error ||
            reason?.message;

          const authHint =
            status === 401 || status === 419
              ? "Unauthorized. Please login again (token missing/expired)."
              : "";

          throw new Error(
            `${labels[rejectedIdx]} failed` +
              (status ? ` (HTTP ${status})` : "") +
              (backendMessage ? `: ${backendMessage}` : "") +
              (authHint ? `\n${authHint}` : "")
          );
        }

        const staffRes = results[0].value;
        const attendanceRes = results[1].value;
        const salesRes = results[2].value;

        const staff = staffRes.data || [];
        const staffById = new Map(staff.map((s) => [s.id, s]));

        const attendance = (attendanceRes.data || []).map((a) => {
          const staffUser = staffById.get(a.user_id) || a.user;
          const name = safeName(staffUser);
          const position = staffUser?.branchAssignments?.[0]?.position || "Staff";
          const statusRaw = a.status || (a.is_late ? "late" : "present");
          const status = statusRaw === "present" ? "Present" : statusRaw === "late" ? "Late" : toTitle(statusRaw);

          const tardiness =
            a.is_late && (a.late_minutes || a.lateMinutes)
              ? `${a.late_minutes || a.lateMinutes} min`
              : a.is_late
                ? "Late"
                : "0 min";

          return {
            id: a.id,
            user_id: a.user_id,
            name,
            position,
            status,
            hasTimeIn: Boolean(a.time_in),
            hasTimeOut: Boolean(a.time_out),
            lateMinutes: Number(a.late_minutes || a.lateMinutes || 0),
            checkIn: formatTime(a.time_in),
            time_out: formatTime(a.time_out),
            tardiness: a.time_in ? tardiness : "-",
          };
        });

        // Sales aggregation per staff (POS checkout)
        const sales = salesRes.data || [];
        const byStaff = new Map();

        for (const sale of sales) {
          const userId = sale.user_id || sale.user?.id;
          const staffUser = staffById.get(userId) || sale.user;
          const employee = safeName(staffUser);

          if (!byStaff.has(employee)) {
            byStaff.set(employee, {
              id: employee,
              employee,
              checkoutCount: 0,
              totalItemsSold: 0,
              grossTotal: 0,
              cashCollected: 0,
              changeGiven: 0,
              productCounts: new Map(),
            });
          }

          const agg = byStaff.get(employee);
          agg.checkoutCount += 1;
          agg.grossTotal += Number(sale.total || 0);
          agg.cashCollected += Number(sale.cash_collected || 0);
          // tolerate backend naming
          const change = Number(sale.change_given ?? sale.changeGiven ?? 0);
          agg.changeGiven += change;

          for (const item of sale.items || []) {
            const qty = Number(item.quantity || 0);
            agg.totalItemsSold += qty;
            const productName = item.product?.name || `Product ${item.product_id}`;
            agg.productCounts.set(productName, (agg.productCounts.get(productName) || 0) + qty);
          }
        }

        const salesRows = Array.from(byStaff.values()).map((row, idx) => {
          let topCategory = "N/A";
          let best = 0;
          for (const [productName, qty] of row.productCounts.entries()) {
            if (qty > best) {
              best = qty;
              topCategory = productName;
            }
          }
          return {
            ...row,
            id: idx + 1,
            topCategory,
          };
        });

        // Basic performance metrics (computed from attendance + sales for the selected date)
        const perfByName = new Map();
        for (const a of attendance) {
          perfByName.set(a.name, {
            id: a.id,
            employee: a.name,
            attendanceRate: calculateAttendanceRate(a),
            productivity: 0,
            qualityScore: 100,
          });
        }
        const maxCheckouts = Math.max(1, ...salesRows.map((s) => s.checkoutCount || 0));
        for (const s of salesRows) {
          const existing = perfByName.get(s.employee) || {
            id: s.id,
            employee: s.employee,
            attendanceRate: 0,
            productivity: 0,
            qualityScore: 100,
          };
          existing.productivity = Math.round((Number(s.checkoutCount || 0) / maxCheckouts) * 100);
          perfByName.set(s.employee, existing);
        }

        setAttendanceData(attendance);
        setStaffSalesData(salesRows);
        setPerformanceData(Array.from(perfByName.values()));
      } catch (e) {
        setError(e?.message || "Failed to load employee tracker data from backend.");
        setAttendanceData([]);
        setStaffSalesData([]);
        setPerformanceData([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [selectedDate]);

  // Filter data by search term
  const filteredAttendance = attendanceData.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSales = staffSalesData.filter(item =>
    item.employee.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPerformance = performanceData.filter(item =>
    item.employee.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate statistics
  const presentCount = attendanceData.filter(item => item.status === "Present").length;
  const lateCount = attendanceData.filter(item => item.status === "Late").length;
  const absentCount = attendanceData.filter(item => item.status === "Absent").length;
  const totalTransactions = staffSalesData.reduce((sum, item) => sum + item.checkoutCount, 0);
  const totalSales = staffSalesData.reduce((sum, item) => sum + item.grossTotal, 0);
  const avgPerformance = performanceData.length
    ? Math.round(performanceData.reduce((sum, item) => sum + (item.productivity || 0), 0) / performanceData.length)
    : 0;

  const formatCurrency = (amount) => {
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const getStatusTag = (status) => {
    switch(status) {
      case "Present":
        return <Tag color="success" icon={<CheckCircleOutlined />}>Present</Tag>;
      case "Late":
        return <Tag color="warning" icon={<ClockCircleOutlined />}>Late</Tag>;
      case "Absent":
        return <Tag color="error">Absent</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  // Attendance Table Columns
  const attendanceColumns = [
    {
      title: "NO.",
      key: "no",
      width: 60,
      render: (_, __, index) => <span className="text-gray-500">{index + 1}</span>,
    },
    {
      title: "EMPLOYEE",
      dataIndex: "name",
      key: "name",
      render: (name) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {name.charAt(0)}
          </div>
          <span className="font-medium">{name}</span>
        </div>
      ),
    },
    {
      title: "POSITION",
      dataIndex: "position",
      key: "position",
    },
    {
      title: "TIME IN",
      dataIndex: "checkIn",
      key: "checkIn",
      render: (time) => time || '-',
    },
    {
      title: "TIME OUT",
      dataIndex: "time_out",
      key: "timeOut",
      render: (time) => time || '-',
    },
    {
      title: "TARDINESS",
      dataIndex: "tardiness",
      key: "tardiness",
      render: (tardiness) => tardiness !== '-' ? <span className="text-orange-500">{tardiness}</span> : '-',
    },
    {
      title: "STATUS",
      dataIndex: "status",
      key: "status",
      render: (status) => getStatusTag(status),
    },
  ];

  // Staff Sales Table Columns
  const salesColumns = [
    {
      title: "NO.",
      key: "no",
      width: 60,
      render: (_, __, index) => <span className="text-gray-500">{index + 1}</span>,
    },
    {
      title: "EMPLOYEE",
      dataIndex: "employee",
      key: "employee",
      render: (name) => (
        <div className="flex items-center gap-2">
          <UserOutlined className="text-blue-500" />
          <span className="font-medium">{name}</span>
        </div>
      ),
    },
    {
      title: "CHECKOUTS",
      dataIndex: "checkoutCount",
      key: "checkoutCount",
      render: (count) => (
        <div className="flex items-center gap-2">
          <ShoppingCartOutlined className="text-gray-400" />
          <span className="font-semibold">{count}</span>
        </div>
      ),
    },
    {
      title: "ITEMS SOLD",
      dataIndex: "totalItemsSold",
      key: "totalItemsSold",
    },
    {
      title: "GROSS TOTAL",
      dataIndex: "grossTotal",
      key: "grossTotal",
      render: (value) => <span className="text-green-600 font-semibold">{formatCurrency(value)}</span>,
    },
    {
      title: "NET SALES",
      key: "netSales",
      render: (_, record) => <span className="text-blue-600 font-semibold">{formatCurrency(record.cashCollected - record.changeGiven)}</span>,
    },
    {
      title: "TOP CATEGORY",
      dataIndex: "topCategory",
      key: "topCategory",
      render: (category) => <Tag color="blue">{category}</Tag>,
    },
  ];

  // Performance Table Columns
  const performanceColumns = [
    {
      title: "NO.",
      key: "no",
      width: 60,
      render: (_, __, index) => <span className="text-gray-500">{index + 1}</span>,
    },
    {
      title: "EMPLOYEE",
      dataIndex: "employee",
      key: "employee",
      render: (name) => (
        <div className="flex items-center gap-2">
          <UserOutlined className="text-blue-500" />
          <span className="font-medium">{name}</span>
        </div>
      ),
    },
    {
      title: "ATTENDANCE RATE",
      dataIndex: "attendanceRate",
      key: "attendanceRate",
      render: (value) => (
        <div className="flex items-center gap-2">
          <Progress percent={value} size="small" className="w-32" />
          <span className="text-sm font-medium">{value}%</span>
        </div>
      ),
    },
    {
      title: "PRODUCTIVITY",
      dataIndex: "productivity",
      key: "productivity",
      render: (value) => (
        <div className="flex items-center gap-2">
          <Progress percent={value} size="small" strokeColor="#1677ff" className="w-32" />
          <span className="text-sm font-medium">{value}%</span>
        </div>
      ),
    },
    {
      title: "QUALITY SCORE",
      dataIndex: "qualityScore",
      key: "qualityScore",
      render: (value) => (
        <div className="flex items-center gap-2">
          <Progress percent={value} size="small" strokeColor="#52c41a" className="w-32" />
          <span className="text-sm font-medium">{value}%</span>
        </div>
      ),
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header - Sticky at top */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Employee Logs</h1>
              <p className="text-gray-500 mt-1">Track employee attendance, sales, and performance in one view</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Current Philippines Time</p>
              <p className="text-lg font-semibold">
                {currentTime.toLocaleTimeString('en-PH', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
              <p className="text-xs text-gray-400">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6">
              {error}
            </div>
          )}
          {loading && (
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-6 text-gray-600">
              Loading data from backend...
            </div>
          )}
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Attendance Today</p>
                  <p className="text-2xl font-bold text-gray-800">{presentCount} / {attendanceData.length} Present</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-orange-500">Late: {lateCount}</span>
                    <span className="text-xs text-red-500">Absent: {absentCount}</span>
                  </div>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <CalendarOutlined className="text-xl text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Transactions</p>
                  <p className="text-2xl font-bold text-green-600">{totalTransactions}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <ShoppingCartOutlined className="text-xl text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Sales</p>
                  <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalSales)}</p>
                </div>
                <div className="bg-purple-100 rounded-full p-3">
                  <DollarOutlined className="text-xl text-purple-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Avg. Performance</p>
                  <p className="text-2xl font-bold text-orange-600">{avgPerformance}%</p>
                </div>
                <div className="bg-orange-100 rounded-full p-3">
                  <StarOutlined className="text-xl text-orange-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-4 items-center">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Select Date</label>
                  <AntDatePicker
                    value={dayjs(selectedDate)}
                    onChange={(date) => {
                      if (date) {
                        setSelectedDate(date.format("YYYY-MM-DD"));
                      }
                    }}
                    format="YYYY-MM-DD"
                    className="w-full"
                    size="middle"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Search Employee</label>
                  <div className="flex items-center border border-gray-300 rounded-md px-3 py-1.5">
                    <SearchOutlined className="text-gray-400 text-sm mr-2" />
                    <input
                      type="text"
                      placeholder="Enter name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="text-sm outline-none w-48"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Overview Table */}
          <div className="bg-white rounded-lg border border-gray-200 mb-6 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
              <div className="flex items-center gap-2">
                <CalendarOutlined className="text-blue-600" />
                <span className="font-semibold text-gray-700">Attendance Overview</span>
                <Tag color="blue" className="ml-2">
                  {filteredAttendance.length} Records
                </Tag>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {attendanceColumns.map((col, idx) => (
                      <th key={idx} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {col.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={attendanceColumns.length} className="text-center py-12 text-gray-500">
                        No attendance records found.
                      </td>
                    </tr>
                  ) : (
                    filteredAttendance.map((record, idx) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {record.name.charAt(0)}
                            </div>
                            <span className="font-medium">{record.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{record.position}</td>
                        <td className="px-4 py-3 font-mono text-sm">{record.checkIn}</td>
                        <td className="px-4 py-3 font-mono text-sm">{record.time_out}</td>
                        <td className="px-4 py-3">
                          {record.tardiness !== '-' ? (
                            <span className="text-orange-500">{record.tardiness}</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3">{getStatusTag(record.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Staff Sales Table */}
          <div className="bg-white rounded-lg border border-gray-200 mb-6 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
              <div className="flex items-center gap-2">
                <ShoppingCartOutlined className="text-green-600" />
                <span className="font-semibold text-gray-700">Staff Sales (Based on POS Checkout)</span>
                <Tag color="green" className="ml-2">
                  {filteredSales.length} Staff
                </Tag>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {salesColumns.map((col, idx) => (
                      <th key={idx} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {col.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={salesColumns.length} className="text-center py-12 text-gray-500">
                        No sales records found.
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((record, idx) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <UserOutlined className="text-blue-500" />
                            <span className="font-medium">{record.employee}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ShoppingCartOutlined className="text-gray-400" />
                            <span className="font-semibold">{record.checkoutCount}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{record.totalItemsSold}</td>
                        <td className="px-4 py-3">
                          <span className="text-green-600 font-semibold">{formatCurrency(record.grossTotal)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-blue-600 font-semibold">{formatCurrency(record.cashCollected - record.changeGiven)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Tag color="blue">{record.topCategory}</Tag>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredSales.length > 0 && (
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700">TOTAL:</td>
                      <td className="px-4 py-3 font-semibold text-green-600">
                        {formatCurrency(filteredSales.reduce((sum, r) => sum + r.grossTotal, 0))}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-600">
                        {formatCurrency(filteredSales.reduce((sum, r) => sum + (r.cashCollected - r.changeGiven), 0))}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Performance Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
              <div className="flex items-center gap-2">
                <StarOutlined className="text-purple-600" />
                <span className="font-semibold text-gray-700">Performance Metrics</span>
                <Tag color="purple" className="ml-2">
                  {filteredPerformance.length} Employees
                </Tag>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {performanceColumns.map((col, idx) => (
                      <th key={idx} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {col.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={performanceColumns.length} className="text-center py-12 text-gray-500">
                        No performance records found.
                      </td>
                    </tr>
                  ) : (
                    filteredPerformance.map((record, idx) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <UserOutlined className="text-blue-500" />
                            <span className="font-medium">{record.employee}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Progress percent={record.attendanceRate} size="small" className="w-32" />
                            <span className="text-sm font-medium">{record.attendanceRate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Progress percent={record.productivity} size="small" strokeColor="#1677ff" className="w-32" />
                            <span className="text-sm font-medium">{record.productivity}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Progress percent={record.qualityScore} size="small" strokeColor="#52c41a" className="w-32" />
                            <span className="text-sm font-medium">{record.qualityScore}%</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
            <p>Generated on {currentTime.toLocaleString()} | New Moon Lechon Manok and Liempo</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmployeeTracker;
