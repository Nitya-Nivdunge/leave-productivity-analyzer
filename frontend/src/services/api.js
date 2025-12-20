import axios from 'axios';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3000/api';
  
// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15 second timeout for complex operations
});

// File upload with progress tracking
export const uploadAttendance = async (file, month, year, override = false) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('month', month);
  formData.append('year', year);
  formData.append('override', override);

  try {
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    // Handle duplicate key error specifically
    if (error.response?.data?.error?.includes('duplicate key') || 
        error.response?.data?.error?.includes('E11000')) {
      throw { 
        status: 409, 
        message: 'Attendance record already exists for this employee and date. Check "Override" to replace existing data.' 
      };
    }
    throw error.response?.data || error;
  }
};

// Get dashboard data
export const getDashboardData = async () => {
  try {
    const response = await api.get('/dashboard');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// Get monthly data
export const getMonthlyData = async (year, month) => {
  try {
    const response = await api.get(`/month/${year}/${month}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error.response?.data || error;
  }
};

// Get all months data for a year
export const getYearData = async (year) => {
  try {
    const response = await api.get(`/year/${year}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error.response?.data || error;
  }
};

// Get aggregated yearly data for employees
export const getYearlyAggregatedData = async (year) => {
  try {
    const response = await api.get(`/year-aggregated/${year}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error.response?.data || error;
  }
};

// Get all months
export const getAllMonths = async () => {
  try {
    const response = await api.get('/months');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// Get employees
export const getEmployees = async () => {
  try {
    const response = await api.get('/employees');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};


// Get overall insights
export const getOverallInsights = async (year) => {
  try {
    const response = await api.get(`/overall/${year}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error.response?.data || error;
  }
};

// Get year comparison data
export const getYearComparison = async () => {
  try {
    const response = await api.get('/year-comparison');
    
    // Ensure we have the right data structure
    if (response.data && Array.isArray(response.data)) {
      return response.data.map(item => ({
        year: item.year,
        avgProductivity: item.avgProductivity || 0,
        avgHours: item.avgHours || 0,
        avgLeavesPerEmployee: item.avgLeavesPerEmployee || 0,
        totalWorkedHours: item.totalWorkedHours || 0,
        totalLeaves: item.totalLeaves || 0,
        employeeCount: item.employeeCount || 0
      }));
    }
    
    return response.data || [];
  } catch (error) {
    if (error.response?.status === 404) {
      return [];
    }
    throw error.response?.data || error;
  }
};

// Get all employees productivity
export const getAllEmployeesProductivity = async (year) => {
  try {
    const response = await api.get(`/employees/productivity/${year}`);
    
    // Transform the response to include leaves data
    if (response.data && response.data.employees) {
      // Get leaves data separately
      const yearData = await getOverallInsights(year);
      if (yearData && yearData.employees) {
        // Merge productivity data with leaves data
        const mergedEmployees = response.data.employees.map(prodEmp => {
          const leaveData = yearData.employees.find(leaveEmp => 
            leaveEmp.employeeId === prodEmp.employeeId || 
            leaveEmp.employeeName === prodEmp.employeeName
          );
          
          return {
            ...prodEmp,
            leaveDays: leaveData ? leaveData.leaveDays : 0
          };
        });
        
        return {
          ...response.data,
          employees: mergedEmployees
        };
      }
    }
    
    return response.data || { employees: [] };
  } catch (error) {
    if (error.response?.status === 404) {
      return { employees: [] };
    }
    throw error.response?.data || error;
  }
};

// Get workforce daily breakdown
export const getWorkforceDailyBreakdown = async (year, month) => {
  try {
    const response = await api.get(`/workforce/${year}/${month}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error.response?.data || error;
  }
};

// Get previous month data
export const getPreviousMonthData = async (year, month) => {
  try {
    // Calculate previous month
    let prevYear = year;
    let prevMonth = month - 1;
    
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    
    const response = await api.get(`/month/${prevYear}/${prevMonth}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error.response?.data || error;
  }
};

// Helper function to aggregate year data from monthly data
export const aggregateYearDataFromMonthly = async (year) => {
  try {
    // Try to get aggregated data first
    const aggregated = await getYearlyAggregatedData(year);
    if (aggregated) return aggregated;
    
    // Fallback: Get all months data and aggregate
    const yearData = await getYearData(year);
    if (!yearData || !yearData.months) return null;
    
    return aggregateMonthlyData(yearData.months, year);
  } catch (error) {
    console.error(`Error aggregating year ${year} data:`, error);
    return null;
  }
};

// Helper function to aggregate monthly data
const aggregateMonthlyData = (monthsData, year) => {
  if (!monthsData || monthsData.length === 0) return null;
  
  const employeeMap = new Map();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // Process each month's data
  monthsData.forEach(monthData => {
    if (!monthData || !monthData.statistics) return;
    
    const monthIndex = parseInt(monthData.month) - 1;
    const monthName = monthNames[monthIndex];
    
    monthData.statistics.forEach(employee => {
      const empId = employee.employeeId || employee.employeeName;
      
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employeeId: empId,
          employeeName: employee.employeeName,
          monthsData: [],
          totalWorkedHours: 0,
          totalLeavesTaken: 0,
          totalProductivity: 0,
          monthCount: 0,
          exceededLimitMonths: 0,
          monthlyPerformance: {}
        });
      }
      
      const empData = employeeMap.get(empId);
      
      // Add monthly data
      const monthKey = `${monthName} ${year}`;
      empData.monthsData.push({
        month: monthKey,
        monthNumber: monthData.month,
        productivity: employee.productivity || 0,
        workedHours: employee.totalWorkedHours || 0,
        leavesTaken: employee.leavesTaken || 0,
        leavesAllowed: employee.leavesAllowed || 2
      });
      
      // Update totals
      empData.totalWorkedHours += employee.totalWorkedHours || 0;
      empData.totalLeavesTaken += employee.leavesTaken || 0;
      empData.totalProductivity += employee.productivity || 0;
      empData.monthCount++;
      
      // Check if exceeded limit this month
      if ((employee.leavesTaken || 0) > (employee.leavesAllowed || 2)) {
        empData.exceededLimitMonths++;
      }
      
      // Track monthly performance
      empData.monthlyPerformance[monthKey] = {
        productivity: employee.productivity || 0,
        leavesTaken: employee.leavesTaken || 0,
        leavesAllowed: employee.leavesAllowed || 2
      };
    });
  });
  
  // Convert map to array and calculate averages
  const aggregatedEmployees = Array.from(employeeMap.values()).map(emp => {
    // Find best and worst months
    let bestMonth = { month: 'N/A', productivity: 0 };
    let worstMonth = { month: 'N/A', productivity: 100 };
    
    Object.entries(emp.monthlyPerformance).forEach(([month, data]) => {
      if (data.productivity > bestMonth.productivity) {
        bestMonth = { month, productivity: data.productivity };
      }
      if (data.productivity < worstMonth.productivity && data.productivity > 0) {
        worstMonth = { month, productivity: data.productivity };
      }
    });
    
    return {
      ...emp,
      avgProductivity: emp.monthCount > 0 ? emp.totalProductivity / emp.monthCount : 0,
      avgMonthlyHours: emp.monthCount > 0 ? emp.totalWorkedHours / emp.monthCount : 0,
      bestMonth: bestMonth.productivity > 0 ? `${bestMonth.month} (${bestMonth.productivity.toFixed(1)}%)` : 'N/A',
      worstMonth: worstMonth.productivity < 100 ? `${worstMonth.month} (${worstMonth.productivity.toFixed(1)}%)` : 'N/A',
      totalLeavesAllowed: emp.monthCount * 2,
      leavesStatus: emp.totalLeavesTaken > (emp.monthCount * 2) ? 'Over Limit' : 
                   emp.totalLeavesTaken === (emp.monthCount * 2) ? 'Limit Reached' : 'Within Limit'
    };
  });
  
  // Calculate overall year stats
  const totalEmployees = aggregatedEmployees.length;
  const totalHours = aggregatedEmployees.reduce((sum, emp) => sum + emp.totalWorkedHours, 0);
  const totalLeaves = aggregatedEmployees.reduce((sum, emp) => sum + emp.totalLeavesTaken, 0);
  const avgProductivity = aggregatedEmployees.reduce((sum, emp) => sum + emp.avgProductivity, 0) / totalEmployees;
  const avgHours = totalHours / totalEmployees;
  
  return {
    year,
    totalEmployees,
    totalHours,
    totalLeaves,
    avgProductivity,
    avgHours,
    employees: aggregatedEmployees,
    monthCount: monthsData.length
  };
};

export default api;