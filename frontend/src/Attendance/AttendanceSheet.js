import React, { useEffect, useState } from "react";
import { Tag, Button, Modal, Form, InputNumber, Select, message, Divider, Radio, Space, DatePicker as AntDatePicker, Pagination } from "antd";
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

const DAILY_RECORDS_PAGE_SIZE = 8;

/** Monthly gross salary basis — government contributions (Philippines payroll style). */
const SSS_MONTHLY_RATE = 0.045;
const PHILHEALTH_MONTHLY_RATE = 0.025;
const PAGIBIG_MONTHLY_RATE = 0.02;

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Monthly peso amounts stored in `staff_deductions` (same basis as backend ÷22 for daily reports). */
function computeGovernmentDeductionsFromMonthlyGross(monthlyGross) {
  const g = Number(monthlyGross) || 0;
  return {
    sss: roundMoney(g * SSS_MONTHLY_RATE),
    philhealth: roundMoney(g * PHILHEALTH_MONTHLY_RATE),
    pagibig: roundMoney(g * PAGIBIG_MONTHLY_RATE),
  };
}

function AttendanceAdmin() {
  const [attendanceData, setAttendanceData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    dayjs().format("YYYY-MM-DD")
  );
  const [selectedMonth, setSelectedMonth] = useState(
    dayjs().format("YYYY-MM")
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
  /** Per-staff current page for daily detail rows (key: userId or staff name fallback). */
  const [dailyRecordsPageByStaff, setDailyRecordsPageByStaff] = useState({});
  const [form] = Form.useForm();

  const dailyRecordsStaffKey = (employee) =>
    employee.userId != null ? String(employee.userId) : `name:${employee.staffName}`;

  const getDailyRecordsPage = (employee) => {
    const key = dailyRecordsStaffKey(employee);
    const total = employee.payrollRecords?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / DAILY_RECORDS_PAGE_SIZE));
    const stored = dailyRecordsPageByStaff[key] ?? 1;
    return Math.min(Math.max(1, stored), totalPages);
  };

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

  // Load attendance data for the entire month by fetching daily data
  async function loadAttendanceData(forceRefresh = true) {
    setIsLoading(true);
    try {
      const [year, month] = selectedMonth.split('-');
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      
      // Get all days in the selected month
      const daysInMonth = dayjs(selectedMonth).daysInMonth();
      const allAttendanceData = [];
      
      // Fetch attendance data for each day in the month
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        try {
          const { data } = await api.get("/attendance/payroll/report", {
            params: { date: dateStr },
          });
          
          if (data && data.length > 0) {
            // Ensure each record has the correct date
            const recordsWithDate = data.map(record => ({
              ...record,
              date: record.date || dateStr // Use the date we're fetching for
            }));
            allAttendanceData.push(...recordsWithDate);
          }
        } catch (error) {
          console.warn(`No attendance data for ${dateStr}:`, error.message);
          // Continue with next day even if current day has no data
        }
      }
      
      const mapped = (allAttendanceData || []).map((record, index) => {
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
          date: record.date,
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
    const [year, month] = selectedMonth.split('-');
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    console.log('[LOAD DEDUCTIONS/INCENTIVES] Loading for month:', selectedMonth, 'month:', monthNum, 'year:', yearNum);
    
    const newDeductions = {};
    const newIncentives = {};
    
    // Get unique staff members from attendance records
    const uniqueStaff = [...new Map(attendanceRecords.map(record => [record.userId, record])).values()];
    
    for (const record of uniqueStaff) {
      if (!record.userId) continue;
      
      const staffName = `${record.user.firstname} ${record.user.lastname}`;
      
      try {
        // Fetch deductions
        const deductionsRes = await api.get(`/staff/${record.userId}/deductions/${monthNum}/${yearNum}`);
        console.log(`[LOAD DEDUCTIONS] ${staffName}:`, deductionsRes.data);
        newDeductions[staffName] = {
          deductionRecordExists: deductionsRes.data.deduction_record_exists === true,
          sss: toNumber(deductionsRes.data.sss),
          philhealth: toNumber(deductionsRes.data.philhealth),
          pagibig: toNumber(deductionsRes.data.pagibig),
          cashAdvance: toNumber(deductionsRes.data.cash_advance),
          otherDeductions: toNumber(deductionsRes.data.other_deductions),
        };
        
        // Fetch incentives
        const incentivesRes = await api.get(`/staff/${record.userId}/incentives/${monthNum}/${yearNum}`);
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
          deductionRecordExists: false,
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
  }, [selectedMonth]);

  useEffect(() => {
    setDailyRecordsPageByStaff({});
  }, [selectedMonth]);

  useEffect(() => {
    if (!showDeductionsModal || !selectedStaff) return;
    const staffName = selectedStaff.staffName;
    const gross = selectedStaff.monthlySummary?.totalGrossPay ?? 0;
    const gov = computeGovernmentDeductionsFromMonthlyGross(gross);
    form.setFieldsValue({
      sss: gov.sss,
      philhealth: gov.philhealth,
      pagibig: gov.pagibig,
      cashAdvance: deductions[staffName]?.cashAdvance ?? 0,
      perfectAttendance: incentives[staffName]?.perfectAttendance ?? false,
      commission: incentives[staffName]?.commission ?? 0,
    });
  }, [showDeductionsModal, selectedStaff, deductions, incentives, form]);

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

  const calculateDeductions = (staffName, employeeMonthlySummary = null) => {
    if (!employeeMonthlySummary) return 0;

    const staffDeductions = deductions[staffName] || {};

    if (!staffDeductions.deductionRecordExists) {
      return 0;
    }

    const monthlyGross = employeeMonthlySummary.totalGrossPay || 0;
    const gov = computeGovernmentDeductionsFromMonthlyGross(monthlyGross);

    return (
      gov.sss +
      gov.philhealth +
      gov.pagibig +
      (staffDeductions.cashAdvance || 0) +
      (staffDeductions.otherDeductions || 0)
    );
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

  // Calculate monthly payroll records grouped by employee
  const calculateMonthlyPayroll = () => {
    // Group attendance records by employee
    const groupedByEmployee = attendanceData.reduce((acc, record) => {
      const staffName = `${record.user.firstname} ${record.user.lastname}`;
      if (!acc[staffName]) {
        acc[staffName] = {
          records: [],
          staffName,
          user: record.user,
          userId: record.userId,
          branch: record.branch,
          dailyRate: record.dailyRate || 0
        };
      }
      acc[staffName].records.push(record);
      return acc;
    }, {});

    // Calculate monthly totals for each employee
    return Object.values(groupedByEmployee).map(employee => {
      let totalGrossPay = 0;
      let totalDeductionsAmt = 0;
      let totalIncentives = 0;
      let totalNetPayAmt = 0;
      let totalHoursWorked = 0;
      let daysPresent = 0;
      let daysLate = 0;
      
      const payrollRecords = employee.records.map(record => {
        const staffName = employee.staffName;
        const dailyEarnings = calculateDailyEarnings(record);
        const incentivesAmt = calculateIncentives(staffName, record);
        const { totalHours, isValid } = calculateHoursWorked(record.time_in_raw, record.time_out_raw);
        
        totalGrossPay += dailyEarnings;
        totalIncentives += incentivesAmt;
        totalHoursWorked += totalHours || 0;
        daysPresent++;
        if (record.isLate) daysLate++;
        
        return {
          ...record,
          staffName,
          dailyEarnings,
          incentivesAmt,
          hoursWorked: (record.time_out_raw && isValid) ? `${Math.floor(totalHours)}h ${Math.round((totalHours % 1) * 60)}m` : '-',
          totalHours: totalHours || 0
        };
      });

      // Calculate monthly deductions based on monthly gross
      const monthlySummaryData = {
        totalGrossPay,
        totalIncentives,
        totalHoursWorked,
        daysPresent,
        daysLate
      };
      
      const monthlyDeductions = calculateDeductions(employee.staffName, monthlySummaryData);
      const monthlyNetPay = totalGrossPay - monthlyDeductions + totalIncentives;

      // Calculate projected full month salary (using actual days in month)
      const [year, month] = selectedMonth.split('-');
      const daysInMonth = dayjs(selectedMonth).daysInMonth();
      const averageDailyEarnings = daysPresent > 0 ? totalGrossPay / daysPresent : 0;
      const projectedMonthlyGross = averageDailyEarnings * daysInMonth;
      
      // Calculate projected deductions based on projected monthly gross
      const projectedMonthlySummaryData = {
        totalGrossPay: projectedMonthlyGross,
        totalIncentives: (totalIncentives / daysPresent) * daysInMonth
      };
      const projectedMonthlyDeductions = calculateDeductions(employee.staffName, projectedMonthlySummaryData);
      const projectedMonthlyIncentives = (totalIncentives / daysPresent) * daysInMonth;
      const projectedMonthlyNet = projectedMonthlyGross - projectedMonthlyDeductions + projectedMonthlyIncentives;

      return {
        ...employee,
        payrollRecords,
        monthlySummary: {
          totalGrossPay,
          totalDeductions: monthlyDeductions,
          totalIncentives,
          totalNetPay: monthlyNetPay,
          totalHoursWorked,
          daysPresent,
          daysLate,
          projectedMonthlyGross,
          projectedMonthlyDeductions,
          projectedMonthlyIncentives,
          projectedMonthlyNet,
          daysInMonth
        }
      };
    });
  };

  const monthlyPayroll = calculateMonthlyPayroll();
  const filteredMonthlyPayroll = monthlyPayroll.filter(employee => {
    const staffName = employee.staffName;
    return staffName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Calculate overall totals
  const overallTotalGross = filteredMonthlyPayroll.reduce((sum, emp) => sum + emp.monthlySummary.totalGrossPay, 0);
  const overallTotalDeductions = filteredMonthlyPayroll.reduce((sum, emp) => sum + emp.monthlySummary.totalDeductions, 0);
  const overallTotalNet = filteredMonthlyPayroll.reduce((sum, emp) => sum + emp.monthlySummary.totalNetPay, 0);
  const overallTotalProjected = filteredMonthlyPayroll.reduce((sum, emp) => sum + emp.monthlySummary.projectedMonthlyNet, 0);

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₱0.00';
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  // Generate monthly payroll slip
  const generateMonthlyPayrollSlip = (employee) => {
    const staffName = employee.staffName;
    const staffDeductions = deductions[staffName] || {};
    const govDeductions = staffDeductions.deductionRecordExists
      ? computeGovernmentDeductionsFromMonthlyGross(employee.monthlySummary.totalGrossPay)
      : { sss: 0, philhealth: 0, pagibig: 0 };
    const staffIncentives = incentives[staffName] || {};
    const [year, month] = selectedMonth.split('-');
    
    return `
      <div style="margin-bottom: 40px; page-break-after: always;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 16px; font-weight: bold;">NEW MOON</div>
          <div style="font-size: 12px; margin-top: 5px;">MONTHLY PAYROLL REPORT</div>
          <div style="font-size: 11px; margin-top: 3px; color: #666;">${dayjs(selectedMonth).format('MMMM YYYY')}</div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; width: 30%; background: #f5f5f5;">Employee Name:</td>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>${staffName}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Branch:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${employee.branch?.name || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Pay Period:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${dayjs(selectedMonth).format('MMMM YYYY')}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Daily Rate:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(employee.dailyRate)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Days Present:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${employee.monthlySummary.daysPresent} days</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Days Late:</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${employee.monthlySummary.daysLate} days</td>
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
              <td style="padding: 8px; border: 1px solid #ddd;">Basic Pay (${employee.monthlySummary.daysPresent} days)</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(employee.monthlySummary.totalGrossPay)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">SSS (4.5%)</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(govDeductions.sss)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">Incentives</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(employee.monthlySummary.totalIncentives)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">PhilHealth (2.5%)</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(govDeductions.philhealth)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #;"></td>
              <td style="padding: 8px; border: 1px solid #;"></td>
              <td style="padding: 8px; border: 1px solid #ddd;">Pag-IBIG (2%)</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(govDeductions.pagibig)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #;"></td>
              <td style="padding: 8px; border: 1px solid #;"></td>
              <td style="padding: 8px; border: 1px solid #ddd;">Cash Advance</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrency(staffDeductions.deductionRecordExists ? (staffDeductions.cashAdvance || 0) : 0)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style="background: #e8f5e9;">
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">TOTAL EARNINGS</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${formatCurrency(employee.monthlySummary.totalGrossPay + employee.monthlySummary.totalIncentives)}</td>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">TOTAL DEDUCTIONS</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${formatCurrency(employee.monthlySummary.totalDeductions)}</td>
            </tr>
            <tr style="background: #c8e6c9;">
              <td colspan="3" style="padding: 8px; border: 1px solid #ddd; font-weight: bold; text-align: center;">MONTHLY NET PAY</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold; font-size: 16px;">${formatCurrency(employee.monthlySummary.totalNetPay)}</td>
            </tr>
            <tr style="background: #f0f4ff;">
              <td colspan="3" style="padding: 8px; border: 1px solid #ddd; font-weight: bold; text-align: center;">PROJECTED ({employee.monthlySummary.daysInMonth} days)</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold; font-size: 14px; color: #6366f1;">${formatCurrency(employee.monthlySummary.projectedMonthlyNet)}</td>
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

  // Generate complete monthly payroll report
  const generateCompletePayrollReport = () => {
    return filteredMonthlyPayroll.map(employee => generateMonthlyPayrollSlip(employee)).join('');
  };

  const handlePrintPayroll = () => {
    let htmlContent = '';
    
    if (printType === "all") {
      htmlContent = generateCompletePayrollReport();
    } else {
      const selectedEmployees = filteredMonthlyPayroll.filter(emp => 
        selectedStaffForPrint.includes(emp.staffName)
      );
      
      if (selectedEmployees.length === 0) {
        message.warning("Please select at least one staff member to print");
        return;
      }
      
      htmlContent = selectedEmployees.map(employee => generateMonthlyPayrollSlip(employee)).join('');
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
    <div className="bg-gray-50" style={{ minHeight: '100vh', paddingBottom: '2rem', overflowY: 'auto' }}>
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
              {dayjs(selectedMonth).format('MMMM YYYY')}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6" style={{ minHeight: '120vh' }}>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Staff</p>
            <p className="text-2xl font-bold text-gray-800">{filteredMonthlyPayroll.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Gross</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(overallTotalGross)}</p>
          </div> 
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Deductions</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(overallTotalDeductions)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Net Pay</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(overallTotalNet)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Projected Total</p>
            <p className="text-2xl font-bold text-purple-600">{formatCurrency(overallTotalProjected)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-4 items-center">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Select Month</label>
                <AntDatePicker
                  value={dayjs(selectedMonth)}
                  onChange={(date) => {
                    if (date) {
                      setSelectedMonth(date.format("YYYY-MM"));
                    }
                  }}
                  format="YYYY-MM"
                  picker="month"
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

        {/* Monthly Attendance Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">STAFF NAME</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">BRANCH</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">DAYS PRESENT</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">DAYS LATE</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">MONTHLY GROSS</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">DEDUCTIONS</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">MONTHLY NET</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">PROJECTED</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                      <p className="text-gray-500 mt-2 text-sm">Loading monthly attendance...</p>
                    </td>
                  </tr>
                ) : filteredMonthlyPayroll.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500">
                      No attendance records found for this month.
                    </td>
                  </tr>
                ) : (
                  filteredMonthlyPayroll.map((employee, idx) => (
                    <React.Fragment key={employee.userId}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{employee.staffName}</div>
                          <div className="text-xs text-gray-500">Daily Rate: {formatCurrency(employee.dailyRate)}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{employee.branch?.name || 'N/A'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {employee.monthlySummary.daysPresent}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {employee.monthlySummary.daysLate > 0 ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              {employee.monthlySummary.daysLate}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-green-600 font-medium text-right">{formatCurrency(employee.monthlySummary.totalGrossPay)}</td>
                        <td className="px-4 py-3 text-right">
                          {employee.monthlySummary.totalDeductions > 0 ? (
                            <span className="text-red-600 font-medium">{formatCurrency(employee.monthlySummary.totalDeductions)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-blue-600 font-bold text-right">{formatCurrency(employee.monthlySummary.totalNetPay)}</td>
                        <td className="px-4 py-3 text-purple-600 font-medium text-right">
                          <div>{formatCurrency(employee.monthlySummary.projectedMonthlyNet)}</div>
                          <div className="text-xs text-gray-500">if {employee.monthlySummary.daysInMonth} days</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Space size="small">
                            <Button 
                              type="link" 
                              size="small"
                              onClick={() => {
                                setSelectedStaff(employee);
                                setShowDeductionsModal(true);
                              }}
                            >
                              Edit Deductions
                            </Button>
                          </Space>
                        </td>
                      </tr>
                      
                      {/* Daily attendance details (paginated) */}
                      {(() => {
                        const dailyPage = getDailyRecordsPage(employee);
                        const start = (dailyPage - 1) * DAILY_RECORDS_PAGE_SIZE;
                        const pageRecords = employee.payrollRecords.slice(
                          start,
                          start + DAILY_RECORDS_PAGE_SIZE
                        );
                        const staffKey = dailyRecordsStaffKey(employee);
                        return (
                          <>
                            {pageRecords.map((record, recordIdx) => (
                              <tr
                                key={`${employee.userId}-${start + recordIdx}`}
                                className="bg-gray-50 border-l-4 border-blue-200"
                              >
                                <td className="px-4 py-2 text-xs text-gray-600 pl-8">
                                  {dayjs(record.date).format('MMM DD, YYYY')}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600">
                                  {record.time_in} - {record.time_out}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600 text-center">
                                  {record.hoursWorked}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-600 text-center">
                                  {record.isLate ? 'Late' : 'On Time'}
                                </td>
                                <td className="px-4 py-2 text-xs text-green-600 text-right">
                                  {formatCurrency(record.dailyEarnings)}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-400 text-right">—</td>
                                <td className="px-4 py-2 text-xs text-blue-600 text-right">
                                  {formatCurrency(record.netPay)}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-400 text-center" colSpan={2}>
                                  Daily Record
                                </td>
                              </tr>
                            ))}
                            {employee.payrollRecords.length > DAILY_RECORDS_PAGE_SIZE && (
                              <tr className="bg-gray-50 border-l-4 border-blue-200">
                                <td colSpan={9} className="px-4 py-3">
                                  <div className="flex justify-end">
                                    <Pagination
                                      size="small"
                                      current={dailyPage}
                                      pageSize={DAILY_RECORDS_PAGE_SIZE}
                                      total={employee.payrollRecords.length}
                                      onChange={(p) =>
                                        setDailyRecordsPageByStaff((prev) => ({
                                          ...prev,
                                          [staffKey]: p,
                                        }))
                                      }
                                      showSizeChanger={false}
                                      showTotal={(total, range) =>
                                        `${range[0]}–${range[1]} of ${total} days`
                                      }
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </React.Fragment>
                  ))
                )}
              </tbody>
              {filteredMonthlyPayroll.length > 0 && (
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700">TOTAL:</td>
                    <td className="px-4 py-3 font-semibold text-green-600 text-right">{formatCurrency(overallTotalGross)}</td>
                    <td className="px-4 py-3 font-semibold text-red-600 text-right">{formatCurrency(overallTotalDeductions)}</td>
                    <td className="px-4 py-3 font-semibold text-blue-600 text-right">{formatCurrency(overallTotalNet)}</td>
                    <td className="px-4 py-3 font-semibold text-purple-600 text-right">{formatCurrency(overallTotalProjected)}</td>
                    <td></td>
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
                <p className="text-xs text-gray-500 ml-6">Print monthly payroll slips for all staff members (each on separate page)</p>
              </Radio>
              <Radio value="individual">
                <span className="font-medium">Individual Staff</span>
                <p className="text-xs text-gray-500 ml-6">Print monthly payroll slips for selected staff only</p>
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
                {filteredMonthlyPayroll.map(employee => (
                  <Option key={employee.staffName} value={employee.staffName}>
                    <UserOutlined className="mr-2" /> {employee.staffName} - {employee.branch?.name || 'N/A'}
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
                ? "The report will print monthly payroll slips for ALL staff members. Each staff will have their own separate page with monthly totals and projections."
                : `You will get monthly payroll slips for ${selectedStaffForPrint.length} selected staff member(s) with their complete monthly attendance and salary details.`}
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
        <Form form={form} layout="vertical">
          <p className="text-xs text-gray-500 mb-2">
            Monthly gross for this period:{" "}
            <strong>{formatCurrency(selectedStaff?.monthlySummary?.totalGrossPay ?? 0)}</strong>. SSS (4.5%),
            PhilHealth (2.5%), and Pag-IBIG (2%) are computed from this gross and stored for the selected month when you save.
          </p>
          <Divider orientation="left" className="!text-sm">
            Monthly deductions
          </Divider>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="sss" label="SSS (4.5% of monthly gross)">
              <InputNumber prefix="₱" className="w-full" min={0} disabled precision={2} />
            </Form.Item>
            <Form.Item name="philhealth" label="PhilHealth (2.5% of monthly gross)">
              <InputNumber prefix="₱" className="w-full" min={0} disabled precision={2} />
            </Form.Item>
            <Form.Item name="pagibig" label="Pag-IBIG (2% of monthly gross)">
              <InputNumber prefix="₱" className="w-full" min={0} disabled precision={2} />
            </Form.Item>
            <Form.Item name="cashAdvance" label="Cash Advance (monthly)">
              <InputNumber prefix="₱" className="w-full" min={0} precision={2} />
            </Form.Item>
          </div>

          <Divider orientation="left" className="!text-sm">
            Incentives
          </Divider>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="perfectAttendance" label="Perfect Attendance">
              <Select>
                <Option value={true}>Yes</Option>
                <Option value={false}>No</Option>
              </Select>
            </Form.Item>
            <Form.Item name="commission" label="Sales Commission (monthly)">
              <InputNumber prefix="₱" className="w-full" min={0} precision={2} />
            </Form.Item>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button onClick={() => setShowDeductionsModal(false)}>Cancel</Button>
            <Button type="primary" onClick={async () => {
              const staffName = (selectedStaff?.staffName || `${selectedStaff?.user?.firstname || ""} ${selectedStaff?.user?.lastname || ""}`).trim();
              const values = form.getFieldsValue();
              const userId = selectedStaff?.userId;

              if (!userId) {
                message.error("Unable to determine staff ID. Please check the staff record.");
                return;
              }

              const [, month] = selectedMonth.split("-");
              const monthNum = parseInt(month, 10);
              const yearNum = parseInt(selectedMonth.split("-")[0], 10);

              const monthlyGross = selectedStaff?.monthlySummary?.totalGrossPay ?? 0;
              const gov = computeGovernmentDeductionsFromMonthlyGross(monthlyGross);

              try {
                await api.post(`/staff/${userId}/deductions`, {
                  sss: gov.sss,
                  philhealth: gov.philhealth,
                  pagibig: gov.pagibig,
                  cash_advance: values.cashAdvance || 0,
                  other_deductions: 0,
                  month: monthNum,
                  year: yearNum,
                });

                await api.post(`/staff/${userId}/incentives`, {
                  perfect_attendance: values.perfectAttendance || false,
                  commission: values.commission || 0,
                  other_incentives: 0,
                  month: monthNum,
                  year: yearNum,
                });

                setDeductions((prev) => ({
                  ...prev,
                  [staffName]: {
                    deductionRecordExists: true,
                    sss: gov.sss,
                    philhealth: gov.philhealth,
                    pagibig: gov.pagibig,
                    cashAdvance: values.cashAdvance || 0,
                    otherDeductions: 0,
                  },
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
