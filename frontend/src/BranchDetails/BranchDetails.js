import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Tag, Typography, Button, Modal, DatePicker as AntDatePicker } from "antd";
import { 
  CalendarOutlined, 
  ClockCircleOutlined, 
  SearchOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  ShoppingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  RiseOutlined,
  DollarOutlined,
  ArrowLeftOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { Avatar } from 'antd';
import { api } from "../config/api";

const { Title, Text } = Typography;

const formatStatus = (status, timeIn, timeOut) => {
  if (timeIn && timeOut) return "Completed";
  if (timeIn) return status?.includes("late") ? "Late" : "Present";
  return status ? status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ") : "Unknown";
};

const isPresentForDay = (staff) => Boolean(staff.time_in_raw);

const formatTime = (value) => {
  if (!value) return "-";

  // Parse the time string directly (format is HH:MM:SS from backend)
  const [hours, minutes] = value.split(':');
  const hour = parseInt(hours, 10);
  const minute = parseInt(minutes, 10);
  
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12; // Convert 0 to 12
  const displayMinute = minute.toString().padStart(2, '0');
  
  return `${displayHour}:${displayMinute} ${period}`;
};

function BranchDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [branch, setBranch] = useState(null);
  const [sales, setSales] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPrintModalVisible, setIsPrintModalVisible] = useState(false);


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

  useEffect(() => {
    const loadBranchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const [branchRes, salesRes, attendanceRes] = await Promise.all([
          api.get(`/branches/${id}`),
          api.get(`/branches/${id}/sales`, { params: { date: selectedDate } }),
          api.get(`/branches/${id}/attendance`, { params: { date: selectedDate } }),
        ]);

        setBranch(branchRes.data);
        setSales(
          (salesRes.data || []).flatMap((sale) =>
            (sale.items || []).map((item) => ({
              id: `${sale.id}-${item.id}`,
              date: (sale.sale_date || "").slice(0, 10),
              product: item.product,
              quantity: item.quantity,
              total: item.total,
            }))
          )
        );
        setAttendance(
          (attendanceRes.data || []).map((a) => {
            const timeIn = a.time_in || null;
            const timeOut = a.time_out || null;

            return {
              id: a.id,
              name: `${a.user?.firstname || ""} ${a.user?.lastname || ""}`.trim(),
              position: a.user?.role || "Staff",
              status: formatStatus(a.status, timeIn, timeOut),
              time_in_raw: timeIn,
              time_out_raw: timeOut,
              time_in: formatTime(timeIn),
              time_out: formatTime(timeOut),
              hours_worked: a.hours_worked,
            };
          })
        );
      } catch (err) {
        setError("Failed to load branch details");
        setBranch(null);
        setSales([]);
        setAttendance([]);
      } finally {
        setLoading(false);
      }
    };

    loadBranchDetails();
  }, [id, selectedDate]);

  // Filter sales by selected date
  const filteredSales = useMemo(() => {
    if (!selectedDate) return sales;
    return sales.filter(sale => sale.date === selectedDate);
  }, [sales, selectedDate]);

  // Filter attendance by search term
  const filteredAttendance = useMemo(() => {
    if (!searchTerm) return attendance;
    return attendance.filter(staff => 
      staff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staff.position.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [attendance, searchTerm]);

  // Filter to get only present staff
  const presentStaff = useMemo(() => {
    return filteredAttendance.filter(isPresentForDay);
  }, [filteredAttendance]);

  const totalSales = useMemo(
    () => filteredSales.reduce((sum, item) => sum + parseFloat(item.total || 0), 0),
    [filteredSales]
  );

  const totalItems = useMemo(
    () => filteredSales.reduce((sum, item) => sum + (item.quantity || 0), 0),
    [filteredSales]
  );

  const averageSale = useMemo(
    () => filteredSales.length > 0 ? totalSales / filteredSales.length : 0,
    [totalSales, filteredSales.length]
  );

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₱0.00';
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const getStatusTag = (status) => {
    switch(status) {
      case "Present":
        return <Tag color="success" icon={<CheckCircleOutlined />}>Present</Tag>;
      case "Completed":
        return <Tag color="blue" icon={<CheckCircleOutlined />}>Completed</Tag>;
      case "Absent":
        return <Tag color="error" icon={<CloseCircleOutlined />}>Absent</Tag>;
      case "Late":
        return <Tag color="warning" icon={<ClockCircleOutlined />}>Late</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  // Sales table columns
  const salesColumns = [
    {
      title: "NO.",
      key: "no",
      width: 60,
      render: (_, __, index) => <span className="text-gray-500">{index + 1}</span>,
    },
    {
      title: "DATE",
      dataIndex: "date",
      key: "date",
      render: (date) => (
        <div className="flex items-center gap-2">
          <CalendarOutlined className="text-gray-400" />
          <span className="font-medium">{date}</span>
        </div>
      ),
    },
    {
      title: "PRODUCT",
      dataIndex: "product",
      key: "product",
      render: (product) => (
        <Tag color="blue" className="px-3 py-1 rounded-full">
          {product?.name || 'N/A'}
        </Tag>
      ),
    },
    {
      title: "QUANTITY",
      dataIndex: "quantity",
      key: "quantity",
      render: (quantity) => (
        <div className="flex items-center gap-2">
          <ShoppingCartOutlined className="text-gray-400" />
          <span className="font-semibold">{quantity}</span>
        </div>
      ),
    },
    {
      title: "TOTAL",
      dataIndex: "total",
      key: "total",
      render: (total) => (
        <span className="text-green-600 font-semibold">
          {formatCurrency(total)}
        </span>
      ),
    },
  ];

  // Attendance table columns
  const attendanceColumns = [
    {
      title: "NO.",
      key: "no",
      width: 60,
      render: (_, __, index) => <span className="text-gray-500">{index + 1}</span>,
    },
    {
      title: "STAFF NAME",
      dataIndex: "name",
      key: "name",
      render: (name) => (
        <div className="flex items-center gap-2">
          <UserOutlined className="text-blue-500" />
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
      dataIndex: "time_in",
      key: "timeIn",
      render: (time) => time || '-',
    },
    {
      title: "TIME OUT",
      dataIndex: "time_out",
      key: "timeOut",
      render: (time) => time || '-',
    },
    {
      title: "STATUS",
      dataIndex: "status",
      key: "status",
      render: (status) => getStatusTag(status),
    },
  ];

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${branch?.name} - Sales Report</title>
        <style>
          @media print {
            body { margin: 0; padding: 20px; }
            @page { size: portrait; margin: 1cm; }
          }
          body {
            font-family: 'Times New Roman', Arial, sans-serif;
            margin: 0;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
          }
          .company-name { font-size: 20px; font-weight: bold; }
          .report-title { font-size: 16px; margin-top: 5px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background: #f5f5f5;
            font-weight: bold;
          }
          .summary {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 10px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">NEW MOON</div>
          <div class="report-title">${branch?.name} - SALES REPORT</div>
          <div>Date: ${new Date(selectedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>No.</th><th>Date</th><th>Product</th><th>Quantity</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${filteredSales.map((sale, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${sale.date}</td>
                <td>${sale.product.name}</td>
                <td>${sale.quantity}</td>
                <td>${formatCurrency(sale.total)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background: #f0f0f0; font-weight: bold;">
              <td colspan="4" style="text-align: right;">TOTAL:</td>
              <td>${formatCurrency(totalSales)}</td>
            </tr>
          </tfoot>
        </table>
        
        <div class="summary">
          <div><strong>Total Items Sold:</strong> ${totalItems}</div>
          <div><strong>Average Sale:</strong> ${formatCurrency(averageSale)}</div>
          <div><strong>Staff Present:</strong> ${presentStaff.length} / ${attendance.length}</div>
        </div>
        
        <div class="footer">
          <p>Generated on ${currentTime.toLocaleString()} | This is a computer-generated document</p>
        </div>
        <script>
          window.onload = function() { window.print(); setTimeout(() => window.close(), 500); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
    setIsPrintModalVisible(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading branch details...</p>
        </div>
      </div>
    );
  }

  if (error || !branch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <div className="text-center">
            <div className="text-red-500 text-5xl mb-4">!</div>
            <Title level={4} className="text-red-600">Error</Title>
            <Text type="secondary">{error || "Branch not found"}</Text>
            <div className="mt-4">
              <Button onClick={() => navigate('/Dashboard')}>Back to Branches</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header - Fixed */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate('/Dashboard')}
              type="text"
            >
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{branch.name}</h1>
              <p className="text-gray-500 mt-1">Sales Report & Staff Attendance</p>
            </div>
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

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Sales Revenue</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalSales)}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <DollarOutlined className="text-xl text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Average Sale Value</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(averageSale)}</p>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <RiseOutlined className="text-xl text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Items Sold</p>
                  <p className="text-2xl font-bold text-purple-600">{totalItems}</p>
                </div>
                <div className="bg-purple-100 rounded-full p-3">
                  <ShoppingOutlined className="text-xl text-purple-600" />
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
                  <label className="text-xs text-gray-500 block mb-1">Search Staff</label>
                  <div className="flex items-center border border-gray-300 rounded-md px-3 py-1.5">
                    <SearchOutlined className="text-gray-400 text-sm mr-2" />
                    <input
                      type="text"
                      placeholder="Enter name or position..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="text-sm outline-none w-48"
                    />
                  </div>
                </div>
              </div>
              <Button 
                type="primary" 
                icon={<PrinterOutlined />}
                onClick={() => setIsPrintModalVisible(true)}
                className="bg-blue-600"
              >
                Print Report
              </Button>
            </div>
          </div>

          {/* Present Staff Section */}
          <div className="bg-white rounded-lg border border-gray-200 mb-6 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
              <div className="flex items-center gap-2">
                <TeamOutlined className="text-green-600" />
                <span className="font-semibold text-gray-700">Present Staff</span>
                <Tag color="green" className="ml-2">
                  {presentStaff.length} / {filteredAttendance.length}
                </Tag>
              </div>
            </div>
            <div className="p-4">
              {presentStaff.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {presentStaff.map((staff, idx) => (
                    <div key={staff.id} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar icon={<UserOutlined />} className="!bg-blue-500" />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{staff.name}</div>
                          <div className="text-xs text-gray-500">{staff.position}</div>
                        </div>
                        {getStatusTag(staff.status)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No staff present for the selected date.
                </div>
              )}
            </div>
          </div>

          {/* Attendance Table */}
          <div className="bg-white rounded-lg border border-gray-200 mb-6 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
              <div className="flex items-center gap-2">
                <UserOutlined className="text-blue-600" />
                <span className="font-semibold text-gray-700">Staff Attendance</span>
                <Tag color="blue" className="ml-2">
                  {filteredAttendance.length} Staff
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
                        No staff records found.
                      </td>
                    </tr>
                  ) : (
                    filteredAttendance.map((staff, idx) => (
                      <tr key={staff.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{staff.name}</td>
                        <td className="px-4 py-3 text-gray-600">{staff.position}</td>
                        <td className="px-4 py-3 font-mono text-sm">{staff.time_in || '-'}</td>
                        <td className="px-4 py-3 font-mono text-sm">{staff.time_out || '-'}</td>
                        <td className="px-4 py-3">{getStatusTag(staff.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transaction History Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
              <div className="flex items-center gap-2">
                <ShoppingCartOutlined className="text-blue-600" />
                <span className="font-semibold text-gray-700">Transaction History</span>
                <Tag color="blue" className="ml-2">
                  {filteredSales.length} Transactions
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
                        No sales records found for this date.
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((sale, idx) => (
                      <tr key={sale.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <CalendarOutlined className="text-gray-400" />
                            <span className="font-medium">{sale.date}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Tag color="blue" className="px-3 py-1 rounded-full">
                            {sale.product?.name || 'N/A'}
                          </Tag>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ShoppingCartOutlined className="text-gray-400" />
                            <span className="font-semibold">{sale.quantity}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-green-600 font-semibold">
                            {formatCurrency(sale.total)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredSales.length > 0 && (
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700">TOTAL:</td>
                      <td className="px-4 py-3 font-semibold text-green-600">{formatCurrency(totalSales)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
            <p>Generated on {currentTime.toLocaleString()} | New Moon POS System</p>
          </div>
        </div>
      </div>

      {/* Print Modal */}
      <Modal
        title="Print Sales Report"
        open={isPrintModalVisible}
        onOk={handlePrintReport}
        onCancel={() => setIsPrintModalVisible(false)}
        okText="Print"
        cancelText="Cancel"
        width={400}
      >
        <p>Print sales report for <strong>{branch?.name}</strong>?</p>
        <p className="text-gray-500 text-sm mt-2">
          Date: {new Date(selectedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <p className="text-gray-500 text-sm">
          Transactions: {filteredSales.length} | Total Sales: {formatCurrency(totalSales)}
        </p>
      </Modal>
    </div>
  );
}

export default BranchDetails;
