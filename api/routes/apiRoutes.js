const express = require('express');
const router = express.Router();
const upload = require('./middleware/upload');
const uploadController = require('./controllers/uploadController');
const attendanceController = require('./controllers/attendanceController');
const Attendance = require('./models/Attendance');
const Employee = require('./models/Employee');

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Leave & Productivity Analyzer API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// File upload endpoint - FIX: Proper error handling for multer
router.post('/upload',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({
          error: 'File upload error',
          message: err.message
        });
      }
      next();
    });
  },
  uploadController.uploadAttendance
);

// Get dashboard data (current and previous month)
router.get('/dashboard', attendanceController.getDashboardData);

// Get data for specific month
router.get('/month/:year/:month', attendanceController.getMonthlyData);

// Get all available months
router.get('/months', attendanceController.getAllMonths);

// Get all employees
router.get('/employees', attendanceController.getEmployees);

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    message: 'API is working',
    endpoints: {
      upload: 'POST /api/upload',
      dashboard: 'GET /api/dashboard',
      monthlyData: 'GET /api/month/:year/:month',
      months: 'GET /api/months',
      employees: 'GET /api/employees'
    }
  });
});

// GET /api/year/:year - Get all months data for a specific year
router.get('/year/:year', async (req, res) => {
  try {
    const { year } = req.params;
    
    if (!year || isNaN(year) || year < 2000 || year > new Date().getFullYear() + 1) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const monthsData = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${parseInt(year) + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$date" },
            month: { $month: "$date" }
          },
          employees: {
            $push: {
              employeeId: "$employeeId",
              employeeName: "$employeeName",
              date: "$date",
              workedHours: "$workedHours",
              isLeave: "$isLeave",
              isHoliday: "$isHoliday",
              expectedHours: "$expectedHours"
            }
          }
        }
      },
      {
        $project: {
          year: "$_id.year",
          month: "$_id.month",
          employees: 1,
          _id: 0
        }
      },
      { $sort: { month: 1 } }
    ]);
    
    if (!monthsData || monthsData.length === 0) {
      return res.status(404).json({ error: 'No data found for this year' });
    }

    const processedMonths = await Promise.all(monthsData.map(async (monthData) => {
      const employeeMap = new Map();
      
      monthData.employees.forEach(record => {
        const empId = record.employeeId ? record.employeeId.toString() : record.employeeName;
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employeeId: record.employeeId,
            employeeName: record.employeeName,
            totalWorkedHours: 0,
            leaveDays: 0,
            workingDays: 0,
            expectedHours: 0
          });
        }
        
        const emp = employeeMap.get(empId);
        
        if (record.isLeave) {
          emp.leaveDays++;
        } else if (!record.isHoliday) {
          emp.totalWorkedHours += record.workedHours || 0;
          emp.expectedHours += record.expectedHours || 0;
          emp.workingDays++;
        }
      });
      
      const statistics = Array.from(employeeMap.values()).map(emp => {
        const productivity = emp.expectedHours > 0 
          ? (emp.totalWorkedHours / emp.expectedHours) * 100 
          : 0;
        
        return {
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          totalWorkedHours: emp.totalWorkedHours,
          leavesTaken: emp.leaveDays,
          productivity: Math.min(productivity, 100),
          leavesAllowed: 2
        };
      });
      
      return {
        month: monthData.month,
        year: monthData.year,
        statistics
      };
    }));
    
    res.json({ 
      year, 
      months: processedMonths,
      totalMonths: processedMonths.length
    });
    
  } catch (error) {
    console.error('Error fetching year data:', error);
    res.status(500).json({ error: 'Failed to fetch year data' });
  }
});

// GET /api/year-aggregated/:year
router.get('/year-aggregated/:year', async (req, res) => {
  try {
    const { year } = req.params;

    if (!year || isNaN(year) || year < 2000 || year > new Date().getFullYear() + 1) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const yearResponse = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${parseInt(year) + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: { 
            employeeId: "$employeeId",
            employeeName: "$employeeName",
            month: { $month: "$date" }
          },
          totalWorkedHours: { $sum: "$workedHours" },
          leaveDays: { $sum: { $cond: [{ $eq: ["$isLeave", true] }, 1, 0] } },
          expectedHours: { $sum: "$expectedHours" }
        }
      },
      {
        $group: {
          _id: {
            employeeId: "$_id.employeeId",
            employeeName: "$_id.employeeName"
          },
          monthlyData: {
            $push: {
              month: "$_id.month",
              workedHours: "$totalWorkedHours",
              leavesTaken: "$leaveDays",
              expectedHours: "$expectedHours"
            }
          },
          totalWorkedHours: { $sum: "$totalWorkedHours" },
          totalLeavesTaken: { $sum: "$leaveDays" },
          totalExpectedHours: { $sum: "$expectedHours" }
        }
      },
      {
        $project: {
          employeeId: "$_id.employeeId",
          employeeName: "$_id.employeeName",
          monthlyData: 1,
          totalWorkedHours: 1,
          totalLeavesTaken: 1,
          totalExpectedHours: 1,
          monthlyProductivity: {
            $map: {
              input: "$monthlyData",
              as: "month",
              in: {
                month: "$$month.month",
                productivity: {
                  $cond: [
                    { $gt: ["$$month.expectedHours", 0] },
                    { $multiply: [{ $divide: ["$$month.workedHours", "$$month.expectedHours"] }, 100] },
                    0
                  ]
                },
                leavesTaken: "$$month.leavesTaken"
              }
            }
          }
        }
      }
    ]);
    
    if (!yearResponse || yearResponse.length === 0) {
      return res.status(404).json({ error: 'No data found for this year' });
    }
    
    const employees = yearResponse.map(emp => {
      const validMonths = emp.monthlyProductivity.filter(m => m.productivity > 0);
      const avgProductivity = validMonths.length > 0 
        ? validMonths.reduce((sum, m) => sum + m.productivity, 0) / validMonths.length
        : 0;
      
      let bestMonth = { month: 0, productivity: 0 };
      let worstMonth = { month: 0, productivity: 100 };
      let exceededLimitMonths = 0;
      
      emp.monthlyProductivity.forEach(month => {
        if (month.productivity > bestMonth.productivity) {
          bestMonth = month;
        }
        if (month.productivity < worstMonth.productivity && month.productivity > 0) {
          worstMonth = month;
        }
        if (month.leavesTaken > 2) {
          exceededLimitMonths++;
        }
      });
      
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      return {
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        totalWorkedHours: emp.totalWorkedHours,
        totalLeavesTaken: emp.totalLeavesTaken,
        totalLeavesAllowed: emp.monthlyProductivity.length * 2,
        avgProductivity,
        avgMonthlyHours: emp.totalWorkedHours / emp.monthlyProductivity.length,
        exceededLimitMonths,
        bestMonth: bestMonth.productivity > 0 
          ? `${monthNames[bestMonth.month - 1]} (${bestMonth.productivity.toFixed(1)}%)`
          : 'N/A',
        worstMonth: worstMonth.productivity < 100
          ? `${monthNames[worstMonth.month - 1]} (${worstMonth.productivity.toFixed(1)}%)`
          : 'N/A',
        monthlyData: emp.monthlyProductivity
      };
    });
    
    const totalEmployees = employees.length;
    const totalHours = employees.reduce((sum, emp) => sum + emp.totalWorkedHours, 0);
    const totalLeaves = employees.reduce((sum, emp) => sum + emp.totalLeavesTaken, 0);
    const avgProductivity = employees.reduce((sum, emp) => sum + emp.avgProductivity, 0) / totalEmployees;
    const avgHours = totalHours / totalEmployees;
    
    res.json({
      year,
      totalEmployees,
      totalHours,
      totalLeaves,
      avgProductivity,
      avgHours,
      employees,
      monthCount: employees.length > 0 ? employees[0].monthlyData.length : 0
    });
    
  } catch (error) {
    console.error('Error fetching aggregated year data:', error);
    res.status(500).json({ error: 'Failed to fetch aggregated year data' });
  }
});

// GET /api/previous-month/:year/:month
router.get('/previous-month/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    
    let prevYear = parseInt(year);
    let prevMonth = parseInt(month) - 1;
    
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = prevYear - 1;
    }
    
    const monthlyData = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(prevYear, prevMonth - 1, 1),
            $lt: new Date(prevYear, prevMonth, 1)
          }
        }
      },
      {
        $group: {
          _id: "$employeeId",
          employeeName: { $first: "$employeeName" },
          totalWorkedHours: { $sum: "$workedHours" },
          leaveDays: { $sum: { $cond: [{ $eq: ["$isLeave", true] }, 1, 0] } },
          expectedHours: { $sum: "$expectedHours" }
        }
      },
      {
        $project: {
          employeeId: "$_id",
          employeeName: 1,
          totalWorkedHours: 1,
          leavesTaken: "$leaveDays",
          productivity: {
            $cond: [
              { $gt: ["$expectedHours", 0] },
              { $multiply: [{ $divide: ["$totalWorkedHours", "$expectedHours"] }, 100] },
              0
            ]
          },
          leavesAllowed: 2
        }
      }
    ]);
    
    if (!monthlyData || monthlyData.length === 0) {
      return res.status(404).json({ error: 'No previous month data found' });
    }
    
    res.json({
      year: prevYear,
      month: prevMonth,
      statistics: monthlyData
    });
    
  } catch (error) {
    console.error('Error fetching previous month data:', error);
    res.status(500).json({ error: 'Failed to fetch previous month data' });
  }
});

// GET /api/overall/:year
router.get('/overall/:year', async (req, res) => {
  try {
    const { year } = req.params;
    
    if (!year || isNaN(year) || year < 2000 || year > new Date().getFullYear() + 1) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const yearData = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${parseInt(year) + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: {
            employeeId: "$employeeId",
            employeeName: "$employeeName"
          },
          totalWorkedHours: { $sum: "$workedHours" },
          leaveDays: { $sum: { $cond: [{ $eq: ["$isLeave", true] }, 1, 0] } },
          expectedHours: { $sum: "$expectedHours" }
        }
      }
    ]);

    if (!yearData || yearData.length === 0) {
      return res.status(404).json({ error: 'No data found for this year' });
    }

    const totalEmployees = yearData.length;
    const totalHours = yearData.reduce((sum, emp) => sum + emp.totalWorkedHours, 0);
    const totalLeaves = yearData.reduce((sum, emp) => sum + emp.leaveDays, 0);
    const totalExpectedHours = yearData.reduce((sum, emp) => sum + emp.expectedHours, 0);
    const avgProductivity = totalExpectedHours > 0 ? (totalHours / totalExpectedHours) * 100 : 0;
    const avgHours = totalHours / totalEmployees;

    res.json({
      year,
      totalEmployees,
      totalHours,
      totalLeaves,
      avgProductivity,
      avgHours,
      employees: yearData.map(emp => ({
        employeeId: emp._id.employeeId,
        employeeName: emp._id.employeeName,
        totalWorkedHours: emp.totalWorkedHours,
        leaveDays: emp.leaveDays,
        productivity: emp.expectedHours > 0 ? (emp.totalWorkedHours / emp.expectedHours) * 100 : 0
      }))
    });

  } catch (error) {
    console.error('Error fetching overall insights:', error);
    res.status(500).json({ error: 'Failed to fetch overall insights' });
  }
});

// GET /api/workforce/:year/:month
router.get('/workforce/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    
    if (!year || isNaN(year) || year < 2000 || year > new Date().getFullYear() + 1) {
      return res.status(400).json({ error: 'Invalid year' });
    }
    
    if (!month || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const dailyData = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: startDate,
            $lt: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            employeeId: "$employeeId",
            employeeName: "$employeeName"
          },
          workedHours: { $sum: "$workedHours" },
          isLeave: { $max: "$isLeave" },
          isHoliday: { $max: "$isHoliday" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          date: { $first: "$_id.date" },
          employees: {
            $push: {
              employeeId: "$_id.employeeId",
              employeeName: "$_id.employeeName",
              workedHours: "$workedHours",
              isLeave: "$isLeave",
              isHoliday: "$isHoliday"
            }
          },
          totalEmployees: { $sum: 1 },
          presentEmployees: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$isLeave", false] }, { $eq: ["$isHoliday", false] }] },
                1,
                0
              ]
            }
          },
          leaveEmployees: {
            $sum: {
              $cond: [
                { $eq: ["$isLeave", true] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.json({
      year: parseInt(year),
      month: parseInt(month),
      dailyBreakdown: dailyData || [],
      totalDays: dailyData.length,
      totalEmployees: dailyData.length > 0 ? 
        Math.max(...dailyData.map(day => day.employees.length)) : 0
    });

  } catch (error) {
    console.error('Error fetching workforce daily breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch workforce daily breakdown' });
  }
});

// GET /api/year-comparison
router.get('/year-comparison', async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear];
    
    const yearData = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${years[0]}-01-01`),
            $lt: new Date(`${years[1] + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            employeeId: "$employeeId",
            employeeName: "$employeeName"
          },
          totalWorkedHours: { $sum: "$workedHours" },
          leaveDays: { $sum: { $cond: [{ $eq: ["$isLeave", true] }, 1, 0] } },
          expectedHours: { $sum: "$expectedHours" }
        }
      },
      {
        $group: {
          _id: "$_id.year",
          year: { $first: "$_id.year" },
          totalWorkedHours: { $sum: "$totalWorkedHours" },
          totalLeaves: { $sum: "$leaveDays" },
          totalExpectedHours: { $sum: "$expectedHours" },
          employeeCount: { $sum: 1 }
        }
      },
      { $sort: { year: 1 } }
    ]);

    const comparisonData = yearData.map(item => {
      const avgProductivity = item.totalExpectedHours > 0 
        ? (item.totalWorkedHours / item.totalExpectedHours) * 100 
        : 0;
      
      const avgHours = item.employeeCount > 0 
        ? item.totalWorkedHours / item.employeeCount 
        : 0;
      
      const avgLeavesPerEmployee = item.employeeCount > 0 
        ? item.totalLeaves / item.employeeCount 
        : 0;
      
      return {
        year: item.year,
        totalWorkedHours: item.totalWorkedHours,
        totalLeaves: item.totalLeaves,
        totalExpectedHours: item.totalExpectedHours,
        employeeCount: item.employeeCount,
        avgProductivity: parseFloat(avgProductivity.toFixed(1)),
        avgHours: parseFloat(avgHours.toFixed(1)),
        avgLeavesPerEmployee: parseFloat(avgLeavesPerEmployee.toFixed(1))
      };
    });

    res.json(comparisonData || []);

  } catch (error) {
    console.error('Error fetching year comparison data:', error);
    res.status(500).json({ error: 'Failed to fetch year comparison data' });
  }
});

// GET /api/employees/productivity/:year
router.get('/employees/productivity/:year', async (req, res) => {
  try {
    const { year } = req.params;
    
    if (!year || isNaN(year) || year < 2000 || year > new Date().getFullYear() + 1) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const productivityData = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${parseInt(year) + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: {
            employeeId: "$employeeId",
            employeeName: "$employeeName"
          },
          totalWorkedHours: { $sum: "$workedHours" },
          totalExpectedHours: { $sum: "$expectedHours" },
          leaveDays: { $sum: { $cond: [{ $eq: ["$isLeave", true] }, 1, 0] } }
        }
      },
      {
        $project: {
          employeeId: "$_id.employeeId",
          employeeName: "$_id.employeeName",
          totalWorkedHours: 1,
          leaveDays: 1,
          productivity: {
            $cond: [
              { $gt: ["$totalExpectedHours", 0] },
              { $multiply: [{ $divide: ["$totalWorkedHours", "$totalExpectedHours"] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { employeeName: 1 } }
    ]);

    res.json({
      year,
      employees: productivityData
    });
    
  } catch (error) {
    console.error('Error fetching employees productivity:', error);
    res.status(500).json({ error: 'Failed to fetch employees productivity data' });
  }
});

module.exports = router;
