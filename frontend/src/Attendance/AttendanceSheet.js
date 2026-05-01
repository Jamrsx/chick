import React, { useEffect, useState } from "react";
import { Tag, Button, Modal, Form, InputNumber, Select, message, Divider, Radio, Space, DatePicker as AntDatePicker } from "antd";
import {  
  SearchOutlined,
  PrinterOutlined,
  EditOutlined,
  UserOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../config/api";
import { getCache, setCache, invalidateCache } from "../utils/cache";

const { Option } = Select;

function AttendanceAdmin() {
  const [attendanceData, setAttendanceData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    dayjs().format("YYYY-MM-DD")
  );
  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showDeductionsModal, setShowDeductionsModal] = useState(false);
  const [deductions, setDeductions] = useState({});
  const [incentives, setIncentives] = useState({});
  const [isPrintModalVisible, setIsPrintModalVisible] = useState(false);
  const [printType, setPrintType] = useState("all");
  const [selectedStaffForPrint, setSelectedStaffForPrint] = useState([]);
  const [attendanceActionLoading, setAttendanceActionLoading] = useState(false);
  const [activeAttendanceId, setActiveAttendanceId] = useState(null);
  const [form] = Form.useForm();

  const getStaffDailyRate = (staffName) => {
    const record = attendanceData.find((r) => {
      const fullName = `${r.user?.firstname || ""} ${r.user?.lastname || ""}`.trim();
      return fullName === staffName;
    });
    return record?.dailyRate || 0;
  };

  const toNumber = (value, fallback = 0) => {
    if (value === null || value === undefined || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const hasSavedValues = (values = {}) =>
    Object.keys(values).length > 0 && 
    (Object.values(values).some(v => v !== 0 && v !== false && v !== null && v !== undefined));

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

  // Helper function to extract time from ISO string or time string
  const extractTimeFromISO = (timeValue) => {
    if (!timeValue) return null;
    
    try {
      // If it's a full ISO string like "2026-04-25T01:43:00.000000Z"
      if (typeof timeValue === 'string' && timeValue.includes('T')) {
        const date = new Date(timeValue);
        const hours = date.getUTCHours();
        const minutes = date.getUTCMinutes();
        return { hours, minutes };
      }
      
      // If it's just time string like "01:43:00" or "01:43"
      if (typeof timeValue === 'string' && timeValue.match(/^\d{2}:\d{2}/)) {
        const [hours, minutes] = timeValue.split(':');
        return { hours: parseInt(hours), minutes: parseInt(minutes) };
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting time:', error);
      return null;
    }
  };

  // Format time for display
  const formatTimeForDisplay = (timeValue) => {
    if (!timeValue) return '-';
    
    const extracted = extractTimeFromISO(timeValue);
    if (!extracted) return '-';
    
    let { hours, minutes } = extracted;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes.toString().padStart(2, '0');
    return `${hours}:${minutesStr} ${ampm}`;
  };

  // Load attendance data
  async function loadAttendanceData(forceRefresh = true) {
    setIsLoading(true);
    try {
      // Always fetch fresh data from backend (bypass cache)
      const { data } = await api.get("/attendance/payroll/report", {
        params: { date: selectedDate },
      });
      
      const mapped = (data || []).map((record, index) => {
        const [firstname, ...lastParts] = (record.staff_name || "").split(" ");
        const fallbackUser = {
          firstname: firstname || "",
          lastname: lastParts.join(" ") || "",
        };

        // Handle branch
        let branchName = "N/A";
        let branchId = null;
        
        if (record.branch) {
          if (typeof record.branch === 'string') {
            branchName = record.branch;
          } else if (typeof record.branch === 'object') {
            branchName = record.branch.name || "N/A";
            branchId = record.branch.id || null;
          }
        } else if (record.branch_name) {
          branchName = record.branch_name;
        }
        
        const finalBranchId = record.branch_id || branchId || record.branch?.id || null;

        // Extract user ID from various possible locations
        const userId = record.user?.id || 
                      record.user_id || 
                      record.staff_id || 
                      record.id || 
                      null;

        console.log('[ATTENDANCE MAPPING] Record:', record);
        console.log('[ATTENDANCE MAPPING] Extracted userId:', userId);

        return {
          id: record.attendance_id || index + 1,
          user: record.user || fallbackUser,
          userId: userId,
          branch: { 
            name: branchName,
            id: finalBranchId 
          },
          branchId: finalBranchId,
          time_in_raw: record.time_in,
          time_out_raw: record.time_out,
          time_in: formatTimeForDisplay(record.time_in),
          time_out: formatTimeForDisplay(record.time_out),
          status: record.status,
          isLate: record.is_late,
          lateMinutes: record.late_minutes || 0,
          dailyRate: toNumber(record.daily_rate),
          dailyEarningsApi: toNumber(record.daily_earnings, null),
          deductionsApi: toNumber(record.deductions, null),
          incentivesApi: toNumber(record.incentives, null),
          netPayApi: toNumber(record.net_pay, null),
          hours_worked: toNumber(record.hours_worked),
        };
      });
      
      setAttendanceData(mapped);
      
      // Load deductions and incentives for all staff
      await loadDeductionsAndIncentives(mapped);
    } catch (error) {
      console.error("Error loading attendance:", error);
      message.error("Failed to load attendance payroll from backend.");
      setAttendanceData([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Load deductions and incentives from database
  async function loadDeductionsAndIncentives(attendanceRecords) {
    const dateObj = new Date(selectedDate);
    const month = dateObj.getMonth() + 1;
    const year = dateObj.getFullYear();
    
    console.log('[LOAD DEDUCTIONS/INCENTIVES] Loading for date:', selectedDate, 'month:', month, 'year:', year);
    
    const newDeductions = {};
    const newIncentives = {};
    
    for (const record of attendanceRecords) {
      if (!record.userId) continue;
      
      const staffName = `${record.user.firstname} ${record.user.lastname}`;
      
      try {
        // Fetch deductions
        const deductionsRes = await api.get(`/staff/${record.userId}/deductions/${month}/${year}`);
        console.log(`[LOAD DEDUCTIONS] ${staffName}:`, deductionsRes.data);
        newDeductions[staffName] = {
          sss: deductionsRes.data.sss || 0,
          philhealth: deductionsRes.data.philhealth || 0,
          pagibig: deductionsRes.data.pagibig || 0,
          cashAdvance: deductionsRes.data.cash_advance || 0,
          otherDeductions: deductionsRes.data.other_deductions || 0,
        };
        
        // Fetch incentives
        const incentivesRes = await api.get(`/staff/${record.userId}/incentives/${month}/${year}`);
        console.log(`[LOAD INCENTIVES] ${staffName}:`, incentivesRes.data);
        newIncentives[staffName] = {
          perfectAttendance: incentivesRes.data.perfect_attendance || false,
          commission: incentivesRes.data.commission || 0,
          otherIncentives: incentivesRes.data.other_incentives || 0,
          chicken_sales_incentive: incentivesRes.data.chicken_sales_incentive || 0,
          chickens_sold: incentivesRes.data.chickens_sold || 0,
        };
      } catch (error) {
        console.error(`Error loading deductions/incentives for ${staffName}:`, error);
        // Set defaults if API fails
        newDeductions[staffName] = {
          sss: 0,
          philhealth: 0,
          pagibig: 0,
          cashAdvance: 0,
          otherDeductions: 0,
        };
        newIncentives[staffName] = {
          perfectAttendance: false,
          commission: 0,
          otherIncentives: 0,
          chicken_sales_incentive: 0,
          chickens_sold: 0,
        };
      }
    }
    
    console.log('[LOAD DEDUCTIONS/INCENTIVES] Final deductions:', newDeductions);
    console.log('[LOAD DEDUCTIONS/INCENTIVES] Final incentives:', newIncentives);
    
    setDeductions(newDeductions);
    setIncentives(newIncentives);
  }

  useEffect(() => {
    loadAttendanceData();
  }, [selectedDate]);

  const formatPHTimeForAPI = (date = new Date()) => {
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const phDate = new Date(utc + 8 * 60 * 60 * 1000);
    const hours = String(phDate.getHours()).padStart(2, '0');
    const minutes = String(phDate.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const fetchAttendanceRecord = async (attendanceId) => {
    try {
      const { data } = await api.get('/attendance', {
        params: { date: selectedDate },
      });
      return (data || []).find((record) => record.id === attendanceId);
    } catch (error) {
      console.error('Error fetching attendance record:', error);
      return null;
    }
  };

  // ✅ FIXED: HOURS CALCULATION using raw time values
  const calculateHoursWorked = (timeInRaw, timeOutRaw) => {
    if (!timeInRaw || !timeOutRaw) return { hours: 0, minutes: 0, totalHours: 0, isValid: false };

    try {
      const timeIn = extractTimeFromISO(timeInRaw);
      const timeOut = extractTimeFromISO(timeOutRaw);
      
      if (!timeIn || !timeOut) {
        return { hours: 0, minutes: 0, totalHours: 0, isValid: false };
      }

      let inMinutes = timeIn.hours * 60 + timeIn.minutes;
      let outMinutes = timeOut.hours * 60 + timeOut.minutes;
      
      // Handle overnight shifts
      if (outMinutes < inMinutes) {
        outMinutes += 24 * 60;
      }
      
      const diffMinutes = outMinutes - inMinutes;
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      const totalHours = diffMinutes / 60;

      return { hours, minutes, totalHours, isValid: true };
    } catch (error) {
      console.error('Error calculating hours:', error);
      return { hours: 0, minutes: 0, totalHours: 0, isValid: false };
    }
  };

  // Daily earnings calculation
  const calculateDailyEarnings = (record) => {
    const dailyRate = record.dailyRate || 0;
    const { totalHours, isValid } = calculateHoursWorked(record.time_in_raw, record.time_out_raw);
    
    if (!isValid || totalHours <= 0 || dailyRate <= 0) {
      return record.dailyEarningsApi ?? 0;
    }
    
    // If working 12 hours (standard 9 AM to 9 PM shift), use full daily rate
    if (Math.abs(totalHours - 12) < 0.1) {
      return dailyRate;
    }
    
    let earnings = 0;
    if (totalHours <= 8) {
      earnings = (totalHours / 8) * dailyRate;
    } else {
      const overtimeHours = totalHours - 8;
      const overtimeRate = (dailyRate / 8) * 1.25;
      earnings = dailyRate + (overtimeHours * overtimeRate);
    }
    
    return earnings;
  };

  const calculateDeductions = (staffName, record) => {
    const staffDeductions = deductions[staffName] || {};
    const dailyRate = record.dailyRate || 0;
    
    let totalDeductions = 0;

    if (record.isLate && record.lateMinutes > 0) {
      totalDeductions += record.lateMinutes * 5;
    }
    
    // Only calculate deductions if there are database values
    if (hasSavedValues(staffDeductions)) {
      // Calculate standard government deductions as percentage of daily rate
      if (dailyRate > 0) {
        totalDeductions += dailyRate * 0.045; // SSS: 4.5%
        totalDeductions += dailyRate * 0.025; // PhilHealth: 2.5%
        totalDeductions += dailyRate * 0.02; // Pag-IBIG: 2%
      }
      
      // Cash advance from database (monthly, so divide by 22 for daily)
      if (staffDeductions.cashAdvance) totalDeductions += staffDeductions.cashAdvance / 22;
    }
    
    // Fallback to backend API values if no database values
    if (!hasSavedValues(staffDeductions) && record.deductionsApi !== null && record.deductionsApi !== undefined) {
      return record.deductionsApi;
    }

    return totalDeductions;
  };

  // Incentives calculation with commission
  const calculateIncentives = (staffName, record) => {
    const staffIncentives = incentives[staffName] || {};
    
    let totalIncentives = 0;

    // Only calculate incentives if there are database values
    if (hasSavedValues(staffIncentives)) {
      // Perfect attendance incentive from database
      if (staffIncentives.perfectAttendance && !record.isLate) {
        totalIncentives += 500 / 22;
      }
      
      // Commission from database (monthly, so divide by 22 for daily)
      if (staffIncentives.commission) {
        totalIncentives += staffIncentives.commission / 22;
      }
    }
    
    // Fallback to backend API values if no database values
    if (!hasSavedValues(staffIncentives) && record.incentivesApi !== null && record.incentivesApi !== undefined) {
      return record.incentivesApi;
    }

    return totalIncentives;
  };

  const filteredData = attendanceData
    .filter(item => item && item.user)
    .filter(item => {
      const fullName = `${item.user.firstname} ${item.user.lastname}`;
      return fullName.toLowerCase().includes(searchTerm.toLowerCase());
    });

  // Calculate payroll records
  const payrollRecords = filteredData.map(record => {
    const staffName = `${record.user.firstname} ${record.user.lastname}`;
    const dailyRate = record.dailyRate || getStaffDailyRate(staffName);
    const dailyEarnings = calculateDailyEarnings(record);
    const deductionsAmt = calculateDeductions(staffName, record);
    const incentivesAmt = calculateIncentives(staffName, record);
    const netPay = dailyEarnings - deductionsAmt + incentivesAmt;
    const { hours, minutes, totalHours, isValid } = calculateHoursWorked(record.time_in_raw, record.time_out_raw);
    
    return {
      ...record,
      staffName,
      dailyRate,
      dailyEarnings,
      deductionsAmt,
      incentivesAmt,
      netPay,
      hoursWorked: (record.time_out_raw && isValid) ? `${hours}h ${minutes}m` : '-',
      totalHours: totalHours || 0
    };
  });

  const totalGrossPay = payrollRecords.reduce((sum, r) => sum + (r.dailyEarnings || 0), 0);
  const totalDeductions = payrollRecords.reduce((sum, r) => sum + (r.deductionsAmt || 0), 0);
  const totalNetPay = payrollRecords.reduce((sum, r) => sum + (r.netPay || 0), 0);

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₱0.00';
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  // Generate individual staff payroll slip
  const generateIndividualPayrollSlip = (record) => {
    const staffName = `${record.user.firstname} ${record.user.lastname}`;
    const deductionsAmt = calculateDeductions(staffName, record);
    const incentivesAmt = calculateIncentives(staffName, record);
    const selectedDateObj = new Date(selectedDate);
    const staffDeductions = deductions[staffName] || {};
    const { hours, minutes } = calculateHoursWorked(record.time_in_raw, record.time_out_raw);
    
    return `
      <div style="margin-bottom: 40px; page-break-after: always;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 16px; font-weight: bold;">NEW MOON</div>
          <div style="font-size: 12px; margin-top: 5px;">PAYROLL SLIP</div>
          <div style="font-size: 11px; margin-top: 3px; color: #666;">${selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; width: 30%; background: #f5f5f5;">Employee Name:</td>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>${staffName}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Branch:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${record.branch?.name || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Pay Period:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${selectedDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Daily Rate:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(record.dailyRate)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Time In:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${record.time_in || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Time Out:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${record.time_out || 'Not yet'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Hours Worked:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${record.time_out ? `${hours}h ${minutes}m` : '-'}</td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Earnings</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Amount</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Deductions</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">Basic Pay</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(record.dailyEarnings)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">Late/Tardiness</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${record.isLate ? formatCurrency(record.lateMinutes * 5) : '₱0.00'}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">Overtime Pay</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${record.totalHours > 8 ? formatCurrency((record.totalHours - 8) * (record.dailyRate / 8) * 1.25) : '₱0.00'}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">SSS</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency((staffDeductions.sss || 0) / 22)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">Incentives</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(incentivesAmt)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">PhilHealth</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency((staffDeductions.philhealth || 0) / 22)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"></td>
              <td style="padding: 8px; border: 1px solid #ddd;"></td>
              <td style="padding: 8px; border: 1px solid #ddd;">Pag-IBIG</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency((staffDeductions.pagibig || 0) / 22)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style="background: #e8f5e9;">
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">TOTAL EARNINGS</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${formatCurrency(record.dailyEarnings + incentivesAmt)}</td>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">TOTAL DEDUCTIONS</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${formatCurrency(deductionsAmt)}</td>
            </tr>
            <tr style="background: #c8e6c9;">
              <td colspan="3" style="padding: 8px; border: 1px solid #ddd; font-weight: bold; text-align: center;">NET PAY</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold; font-size: 16px;">${formatCurrency(record.netPay)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top: 30px;">
          <table style="width: 100%;">
            <tr>
              <td style="text-align: center; width: 33%;">
                <hr style="width: 80%;" />
                <div style="font-size: 11px;">Employee Signature</div>
              </td>
              <td style="text-align: center; width: 33%;">
                <hr style="width: 80%;" />
                <div style="font-size: 11px;">Prepared by</div>
              </td>
              <td style="text-align: center; width: 33%;">
                <hr style="width: 80%;" />
                <div style="font-size: 11px;">Approved by</div>
              </td>
            </tr>
          </table>
        </div>
      </div>
    `;
  };

  // Generate complete payroll report
  const generateCompletePayrollReport = () => {
    return payrollRecords.map(record => generateIndividualPayrollSlip(record)).join('');
  };

  const handlePrintPayroll = () => {
    let htmlContent = '';
    
    if (printType === "all") {
      htmlContent = generateCompletePayrollReport();
    } else {
      const selectedRecords = payrollRecords.filter(r => 
        selectedStaffForPrint.includes(r.staffName)
      );
      
      if (selectedRecords.length === 0) {
        message.warning("Please select at least one staff member to print");
        return;
      }
      
      htmlContent = selectedRecords.map(record => generateIndividualPayrollSlip(record)).join('');
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${printType === "all" ? "Payroll Report" : "Payroll Slip"} - NEW MOON</title>
        <style>
          @media print {
            body {
              margin: 0;
              padding: 20px;
            }
            @page {
              size: portrait;
              margin: 1cm;
            }
          }
          body {
            font-family: 'Times New Roman', Arial, sans-serif;
            margin: 0;
            padding: 20px;
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
        ${htmlContent}
        <div class="footer">
          <p>Generated on ${currentTime.toLocaleString()} | This is a computer-generated document</p>
        </div>
        <script>
          window.onload = function() { 
            window.print(); 
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
    setIsPrintModalVisible(false);
  };

  // ✅ FIXED: Changed from PUT to POST
  const handleAttendanceTimeIn = async (attendanceId, staffName) => {
    setAttendanceActionLoading(true);
    setActiveAttendanceId(attendanceId);

    try {
      const attendanceRecord = await fetchAttendanceRecord(attendanceId);
      
      if (!attendanceRecord) {
        throw new Error('Attendance record not found');
      }
      
      const userId = attendanceRecord?.user?.id || attendanceRecord?.user_id;
      const branchId = attendanceRecord?.branch?.id || attendanceRecord?.branch_id;
      
      const timeIn24h = formatPHTimeForAPI();

      if (!userId || !branchId) {
        throw new Error('Unable to determine staff or branch for time in.');
      }

      // If date is today, use time-in endpoint, otherwise use store endpoint
      if (selectedDate === dayjs().format('YYYY-MM-DD')) {
        await api.post('/attendance/time-in', {
          user_id: userId,
          branch_id: branchId,
          date: selectedDate,
          time_in: timeIn24h,
        });
      } else {
        await api.post('/attendance', {
          user_id: userId,
          branch_id: branchId,
          date: selectedDate,
          time_in: timeIn24h,
        });
      }

      message.success(`Time In recorded for ${staffName}`);
      
      // Invalidate cache to reflect the time-in
      invalidateCache(`attendance_${selectedDate}`);
      
      await loadAttendanceData();
    } catch (error) {
      console.error('Time In error:', error);
      const errorMessage = error?.response?.data?.message || 
                          error?.response?.data?.error || 
                          error.message || 
                          'Failed to record Time In.';
      message.error(errorMessage);
    } finally {
      setAttendanceActionLoading(false);
      setActiveAttendanceId(null);
    }
  };

  // ✅ FIXED: Changed from PUT to POST - THIS IS THE MAIN FIX
  const handleAttendanceTimeOut = async (attendanceId, staffName) => {
    setAttendanceActionLoading(true);
    setActiveAttendanceId(attendanceId);

    try {
      const timeOut24h = formatPHTimeForAPI();

      // Use POST instead of PUT - matches your backend route
      const response = await api.post(`/attendance/${attendanceId}/time-out`, {
        time_out: timeOut24h,
      });

      console.log('Time out response:', response.data);
      message.success(`Time Out recorded for ${staffName}`);
      
      // Invalidate cache to reflect the time-out
      invalidateCache(`attendance_${selectedDate}`);
      
      await loadAttendanceData();
    } catch (error) {
      console.error('Time Out error:', error);
      
      // Better error handling to show validation errors
      let errorMessage = 'Failed to record Time Out.';
      
      if (error.response) {
        console.log('Error response data:', error.response.data);
        
        if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.errors) {
          // Handle validation errors
          const errors = error.response.data.errors;
          errorMessage = Object.values(errors).flat().join(', ');
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      message.error(errorMessage);
    } finally {
      setAttendanceActionLoading(false);
      setActiveAttendanceId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">NEW MOON</h1>
            <p className="text-gray-500 mt-1">Staff Attendance & Payroll Report</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Current Philippines Time</p>
            <p className="text-lg font-semibold">
              {currentTime.toLocaleTimeString('en-PH', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-xs text-gray-400">
              {new Date(selectedDate).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Staff</p>
            <p className="text-2xl font-bold text-gray-800">{filteredData.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Gross</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalGrossPay)}</p>
          </div> 
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Deductions</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totalDeductions)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Net Pay</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalNetPay)}</p>
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
                    placeholder="Enter name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="text-sm outline-none w-48"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                icon={<ReloadOutlined />}
                onClick={() => loadAttendanceData(true)}
              >
                Refresh
              </Button>
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
        </div>

        {/* Attendance Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">NO.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">STAFF NAME</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">BRANCH</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">TIME IN</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">TIME OUT</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">HOURS</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">GROSS PAY</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">DEDUCTIONS</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">NET PAY</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">STATUS</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                      <p className="text-gray-500 mt-2 text-sm">Loading...</p>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-500">
                      No attendance records found for this date.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((record, idx) => {
                    const staffName = `${record.user.firstname} ${record.user.lastname}`;
                    const earnings = calculateDailyEarnings(record);
                    const deductionsAmt = calculateDeductions(staffName, record);
                    const incentivesAmt = calculateIncentives(staffName, record);
                    const net = earnings - deductionsAmt + incentivesAmt;
                    const { hours, minutes, isValid } = calculateHoursWorked(record.time_in_raw, record.time_out_raw);
                    
                    return (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{staffName}</td>
                        <td className="px-4 py-3 text-gray-600">{record.branch?.name || 'N/A'}</td>
                        <td className="px-4 py-3 font-mono text-sm">{record.time_in || '-'}</td>
                        <td className="px-4 py-3 font-mono text-sm">{record.time_out || '-'}</td>
                        <td className="px-4 py-3">{record.time_out_raw && isValid ? `${hours}h ${minutes}m` : '-'}</td>
                        <td className="px-4 py-3 text-green-600 font-medium">{formatCurrency(earnings)}</td>
                        <td className="px-4 py-3 text-red-500">{formatCurrency(deductionsAmt)}</td>
                        <td className="px-4 py-3 text-blue-600 font-bold">{formatCurrency(net)}</td>
                        <td className="px-4 py-3">
                          {record.time_in && record.time_out ? (
                            <Tag color="green">Completed</Tag>
                          ) : record.time_in ? (
                            <Tag color="blue">On Duty</Tag>
                          ) : <Tag color="default">-</Tag>}
                        </td>
                        <td className="px-4 py-3">
                          <Space size="small">
                            {!record.time_in ? (
                              <Button
                                type="primary"
                                size="small"
                                loading={attendanceActionLoading && activeAttendanceId === record.id}
                                onClick={() => handleAttendanceTimeIn(record.id, staffName)}
                              >
                                Time In
                              </Button>
                            ) : !record.time_out ? (
                              <Button
                                type="default"
                                size="small"
                                loading={attendanceActionLoading && activeAttendanceId === record.id}
                                onClick={() => handleAttendanceTimeOut(record.id, staffName)}
                              >
                                Time Out
                              </Button>
                            ) : null}
                            <Button 
                              type="link" 
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => {
                                setSelectedStaff(record);
                                setShowDeductionsModal(true);
                                
                                // Set form values when opening modal
                                const staffName = `${record.user.firstname} ${record.user.lastname}`;
                                const dailyRate = record.dailyRate || 0;
                                
                                // Calculate daily deduction amounts (what will actually be deducted)
                                const dailySSS = dailyRate * 0.045; // 4.5% of daily rate
                                const dailyPhilHealth = dailyRate * 0.025; // 2.5% of daily rate
                                const dailyPagibig = dailyRate * 0.02; // 2% of daily rate
                                
                                form.setFieldsValue({
                                  sss: dailySSS,
                                  philhealth: dailyPhilHealth,
                                  pagibig: dailyPagibig,
                                  cashAdvance: deductions[staffName]?.cashAdvance || 0,
                                  perfectAttendance: incentives[staffName]?.perfectAttendance || false,
                                  commission: incentives[staffName]?.commission || 0,
                                });
                              }}
                            />
                          </Space>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredData.length > 0 && (
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right font-semibold text-gray-700">TOTAL:</td>
                    <td className="px-4 py-3 font-semibold text-green-600">{formatCurrency(totalGrossPay)}</td>
                    <td className="px-4 py-3 font-semibold text-red-500">{formatCurrency(totalDeductions)}</td>
                    <td className="px-4 py-3 font-semibold text-blue-600">{formatCurrency(totalNetPay)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
          <p>Generated on {currentTime.toLocaleString()} | New Moon Lechon Manok and Liempo</p>
        </div>
      </div>

      {/* Print Modal */}
      <Modal
        title="Print Payroll Report"
        open={isPrintModalVisible}
        onCancel={() => {
          setIsPrintModalVisible(false);
          setPrintType("all");
          setSelectedStaffForPrint([]);
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setIsPrintModalVisible(false);
            setPrintType("all");
            setSelectedStaffForPrint([]);
          }}>
            Cancel
          </Button>,
          <Button key="print" type="primary" onClick={handlePrintPayroll} className="bg-blue-600">
            <PrinterOutlined /> Print
          </Button>,
        ]}
        width={500}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Select Print Type:</label>
            <Radio.Group 
              onChange={(e) => setPrintType(e.target.value)} 
              value={printType}
              className="flex flex-col gap-2"
            >
              <Radio value="all">
                <span className="font-medium">All Staff</span>
                <p className="text-xs text-gray-500 ml-6">Print individual payroll slips for all staff members (each on separate page)</p>
              </Radio>
              <Radio value="individual">
                <span className="font-medium">Individual Staff</span>
                <p className="text-xs text-gray-500 ml-6">Print individual payroll slips for selected staff only</p>
              </Radio>
            </Radio.Group>
          </div>

          {printType === "individual" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Staff Members:</label>
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Select staff members"
                value={selectedStaffForPrint}
                onChange={setSelectedStaffForPrint}
                optionFilterProp="children"
                showSearch
              >
                {payrollRecords.map(record => (
                  <Option key={record.staffName} value={record.staffName}>
                    <UserOutlined className="mr-2" /> {record.staffName} - {record.branch?.name || 'N/A'}
                  </Option>
                ))}
              </Select>
              <p className="text-xs text-gray-500 mt-2">
                Selected: {selectedStaffForPrint.length} staff member(s)
              </p>
            </div>
          )}

          <div className="bg-blue-50 p-3 rounded-lg mt-4">
            <p className="text-xs text-blue-800">
              <strong>📄 Print Preview:</strong><br />
              {printType === "all" 
                ? "The report will print individual payroll slips for ALL staff members. Each staff will have their own separate page."
                : `You will get individual payroll slips for ${selectedStaffForPrint.length} selected staff member(s).`}
            </p>
          </div>
        </div>
      </Modal>

      {/* Deductions Modal */}
      <Modal
        title={`Edit Deductions - ${selectedStaff?.user?.firstname || ''} ${selectedStaff?.user?.lastname || ''}`}
        open={showDeductionsModal}
        onCancel={() => setShowDeductionsModal(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" initialValues={{
          sss: deductions[`${selectedStaff?.user?.firstname || ''} ${selectedStaff?.user?.lastname || ''}`]?.sss || 0,
          philhealth: deductions[`${selectedStaff?.user?.firstname || ''} ${selectedStaff?.user?.lastname || ''}`]?.philhealth || 0,
          pagibig: deductions[`${selectedStaff?.user?.firstname || ''} ${selectedStaff?.user?.lastname || ''}`]?.pagibig || 0,
          cashAdvance: deductions[`${selectedStaff?.user?.firstname || ''} ${selectedStaff?.user?.lastname || ''}`]?.cashAdvance || 0,
          perfectAttendance: incentives[`${selectedStaff?.user?.firstname || ''} ${selectedStaff?.user?.lastname || ''}`]?.perfectAttendance || false,
          commission: incentives[`${selectedStaff?.user?.firstname || ''} ${selectedStaff?.user?.lastname || ''}`]?.commission || 0,
        }}>
          <Divider orientation="left" className="!text-sm">Monthly Deductions</Divider>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="sss" label="SSS (4.5%)">
              <InputNumber prefix="₱" className="w-full" min={0} disabled />
            </Form.Item>
            <Form.Item name="philhealth" label="PhilHealth (2.5%)">
              <InputNumber prefix="₱" className="w-full" min={0} disabled />
            </Form.Item>
            <Form.Item name="pagibig" label="Pag-IBIG (2%)">
              <InputNumber prefix="₱" className="w-full" min={0} disabled />
            </Form.Item>
            <Form.Item name="cashAdvance" label="Cash Advance">
              <InputNumber prefix="₱" className="w-full" min={0} />
            </Form.Item>
          </div>

          <Divider orientation="left" className="!text-sm">Incentives</Divider>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="perfectAttendance" label="Perfect Attendance">
              <Select>
                <Option value={true}>Yes</Option>
                <Option value={false}>No</Option>
              </Select>
            </Form.Item>
            <Form.Item name="commission" label="Sales Commission">
              <InputNumber prefix="₱" className="w-full" min={0} />
            </Form.Item>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button onClick={() => setShowDeductionsModal(false)}>Cancel</Button>
            <Button type="primary" onClick={async () => {
              const staffName = `${selectedStaff?.user?.firstname || ''} ${selectedStaff?.user?.lastname || ''}`;
              const values = form.getFieldsValue();
              const userId = selectedStaff?.userId;
              const dailyRate = selectedStaff?.dailyRate || 0;
              
              console.log('[DEDUCTIONS MODAL] Selected staff:', selectedStaff);
              console.log('[DEDUCTIONS MODAL] Staff name:', staffName);
              console.log('[DEDUCTIONS MODAL] User ID:', userId);
              console.log('[DEDUCTIONS MODAL] Selected date:', selectedDate);
              console.log('[DEDUCTIONS MODAL] Daily rate:', dailyRate);
              
              if (!userId) {
                console.error('[DEDUCTIONS MODAL] ERROR: Unable to determine staff ID. selectedStaff:', selectedStaff);
                message.error("Unable to determine staff ID. Please check the staff record.");
                return;
              }
              
              const dateObj = new Date(selectedDate);
              const month = dateObj.getMonth() + 1;
              const year = dateObj.getFullYear();
              
              // Calculate standard government deductions (always based on current daily rate)
              const monthlyRate = dailyRate * 22;
              const standardSSS = monthlyRate * 0.045; // 4.5%
              const standardPhilHealth = monthlyRate * 0.025; // 2.5%
              const standardPagibig = monthlyRate * 0.02; // 2%
              
              try {
                // Save deductions to API (use calculated standard deductions)
                await api.post(`/staff/${userId}/deductions`, {
                  sss: standardSSS,
                  philhealth: standardPhilHealth,
                  pagibig: standardPagibig,
                  cash_advance: values.cashAdvance || 0,
                  other_deductions: 0,
                  month: month,
                  year: year,
                });
                
                // Save incentives to API
                await api.post(`/staff/${userId}/incentives`, {
                  perfect_attendance: values.perfectAttendance || false,
                  commission: values.commission || 0,
                  other_incentives: 0,
                  chicken_sales_incentive: 0,
                  chickens_sold: 0,
                  month: month,
                  year: year,
                });
                
                // Update local state with calculated values
                setDeductions(prev => ({
                  ...prev,
                  [staffName]: {
                    sss: standardSSS,
                    philhealth: standardPhilHealth,
                    pagibig: standardPagibig,
                    cashAdvance: values.cashAdvance || 0,
                    otherDeductions: 0,
                  }
                }));
                
                setIncentives(prev => ({
                  ...prev,
                  [staffName]: {
                    perfectAttendance: values.perfectAttendance,
                    commission: values.commission,
                    otherIncentives: 0,
                    chicken_sales_incentive: 0,
                    chickens_sold: 0,
                  }
                }));
                
                message.success("Deductions and incentives saved to database");
                setShowDeductionsModal(false);
                
                // Refresh attendance data to show updated values immediately
                await loadAttendanceData(true);
              } catch (error) {
                console.error("Error saving deductions/incentives:", error);
                message.error("Failed to save deductions and incentives");
              }
            }}>Save Changes</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default AttendanceAdmin;
