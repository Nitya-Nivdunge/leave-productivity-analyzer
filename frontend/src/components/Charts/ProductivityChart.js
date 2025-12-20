// Replace the existing imports and component with this updated version
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ProductivityChart = ({ data, year, month, detailed = false }) => {
  
  if (!data || !data.dailyBreakdown || data.dailyBreakdown.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
        <p className="text-sm text-gray-500">No productivity data available</p>
      </div>
    );
  }

  // Get number of days in the selected month
  const daysInMonth = new Date(year, month, 0).getDate();
  
  // Create array of all days in the month (1 to daysInMonth)
  const allDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  
  // Create a map of date to data for quick lookup
  const dataMap = {};
  data.dailyBreakdown.forEach(day => {
    const date = new Date(day.date);
    dataMap[date.getDate()] = day;
  });

  // Prepare continuous productivity data
  // Use linear interpolation for leave/holiday days
  const productivityValues = allDays.map(day => {
    const dayData = dataMap[day];
    if (!dayData) return null;
    if (dayData.isHoliday || dayData.isLeave) return null;
    if (dayData.expectedHours > 0) {
      return Math.min((dayData.workedHours / dayData.expectedHours) * 100, 120);
    }
    return null;
  });

  // Interpolate missing values for continuous line
  const continuousProductivity = [...productivityValues];
  for (let i = 0; i < continuousProductivity.length; i++) {
    if (continuousProductivity[i] === null) {
      // Find previous valid value
      let prev = i - 1;
      while (prev >= 0 && continuousProductivity[prev] === null) prev--;
      
      // Find next valid value
      let next = i + 1;
      while (next < continuousProductivity.length && continuousProductivity[next] === null) next++;
      
      // Interpolate if we have both neighbors
      if (prev >= 0 && next < continuousProductivity.length) {
        const prevVal = continuousProductivity[prev];
        const nextVal = continuousProductivity[next];
        const steps = next - prev;
        continuousProductivity[i] = prevVal + ((nextVal - prevVal) * (i - prev)) / steps;
      } else if (prev >= 0) {
        // Use last known value
        continuousProductivity[i] = continuousProductivity[prev];
      } else if (next < continuousProductivity.length) {
        // Use next known value
        continuousProductivity[i] = continuousProductivity[next];
      }
    }
  }

  // Extract leave and holiday days for info panel
  const leaveDays = data.dailyBreakdown
    .filter(day => day.isLeave)
    .map(day => {
      const date = new Date(day.date);
      return {
        date: date.getDate(),
        fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        type: 'Leave'
      };
    })
    .sort((a, b) => a.date - b.date);

  const holidayDays = data.dailyBreakdown
    .filter(day => day.isHoliday)
    .map(day => {
      const date = new Date(day.date);
      return {
        date: date.getDate(),
        fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        type: 'Holiday'
      };
    })
    .sort((a, b) => a.date - b.date);

  // Calculate stats
  const validDays = data.dailyBreakdown.filter(day => 
    !day.isHoliday && !day.isLeave && day.expectedHours > 0
  );
  
  const avgProductivity = validDays.length > 0 
    ? validDays.reduce((sum, day) => sum + (day.workedHours / day.expectedHours) * 100, 0) / validDays.length
    : 0;

  const peakProductivity = validDays.length > 0 
    ? Math.max(...validDays.map(day => (day.workedHours / day.expectedHours) * 100))
    : 0;
    
  const lowestProductivity = validDays.length > 0 
    ? Math.min(...validDays.map(day => (day.workedHours / day.expectedHours) * 100))
    : 0;

  const chartData = {
    labels: allDays.map(day => day.toString()),
    datasets: [
      {
        label: 'Daily Productivity',
        data: continuousProductivity,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: function(context) {
          const day = context.dataIndex + 1;
          const dayData = dataMap[day];
          if (dayData && (dayData.isHoliday || dayData.isLeave)) return 'transparent';
          
          const value = productivityValues[context.dataIndex];
          if (value === null) return 'rgba(156, 163, 175, 0.5)';
          if (value >= 90) return 'rgb(34, 197, 94)';
          if (value >= 70) return 'rgb(59, 130, 246)';
          return 'rgb(239, 68, 68)';
        },
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: function(context) {
          const day = context.dataIndex + 1;
          const dayData = dataMap[day];
          if (dayData && (dayData.isHoliday || dayData.isLeave)) return 0;
          return productivityValues[context.dataIndex] === null ? 0 : 5;
        },
        pointHoverRadius: function(context) {
          const day = context.dataIndex + 1;
          const dayData = dataMap[day];
          if (dayData && (dayData.isHoliday || dayData.isLeave)) return 0;
          return productivityValues[context.dataIndex] === null ? 0 : 7;
        },
        spanGaps: true, // Make the line continuous
      },
      {
        label: 'Target (80%)',
        data: allDays.map(() => 80),
        borderColor: 'rgba(156, 163, 175, 0.5)',
        borderWidth: 1,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
      },
      {
        label: 'Average',
        data: allDays.map(() => avgProductivity),
        borderColor: 'rgba(234, 179, 8, 0.3)',
        borderWidth: 1,
        borderDash: [3, 3],
        fill: false,
        pointRadius: 0,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          padding: 15,
          font: {
            size: 11
          },
          usePointStyle: true,
          filter: function(legendItem) {
            // Hide legend items for leave and holiday markers
            return legendItem.text !== 'Leave Days' && legendItem.text !== 'Holidays';
          }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function(context) {
            const label = context.dataset.label || '';
            const day = context.dataIndex + 1;
            const dayData = dataMap[day];
            
            if (dayData && dayData.isLeave) {
              return 'Leave Day';
            }
            if (dayData && dayData.isHoliday) {
              return 'Holiday';
            }
            
            if (label === 'Daily Productivity' && context.parsed.y !== null) {
              return `${label}: ${context.parsed.y.toFixed(1)}%`;
            }
            
            if (context.parsed.y !== null) {
              return `${label}: ${context.parsed.y.toFixed(1)}%`;
            }
            return label;
          },
          afterLabel: function(context) {
            const day = context.dataIndex + 1;
            const dayData = dataMap[day];
            if (dayData) {
              if (dayData.isLeave) return 'No work expected';
              if (dayData.isHoliday) return 'Company holiday';
              return `Worked: ${dayData.workedHours.toFixed(1)}h / Expected: ${dayData.expectedHours.toFixed(1)}h`;
            }
            return '';
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        min: 0,
        max: 120,
        title: {
          display: true,
          text: 'Productivity (%)',
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.03)'
        },
        ticks: {
          callback: function(value) {
            return value + '%';
          },
          font: {
            size: 10
          }
        }
      },
      x: {
        title: {
          display: true,
          text: 'Day of Month',
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.03)'
        },
        ticks: {
          font: {
            size: 10
          }
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">
        {detailed ? 'Detailed Productivity Analysis' : 'Productivity Trend'} - {data.employeeName}
      </h3>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <div className="h-64">
            <Line data={chartData} options={options} />
          </div>
        </div>
        
        {/* Leave & Holiday Info Panel */}
        <div className="border rounded-lg p-3 bg-gray-50">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Non-Working Days</h4>
          
          {leaveDays.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center text-xs font-medium text-red-600 mb-1">
                <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                <span>Leave Days ({leaveDays.length})</span>
              </div>
              <div className="text-xs text-gray-600 grid grid-cols-2 gap-1">
                {leaveDays.map((day, idx) => (
                  <div key={idx} className="bg-white border rounded px-2 py-1">
                    {day.fullDate}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {holidayDays.length > 0 && (
            <div>
              <div className="flex items-center text-xs font-medium text-purple-600 mb-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                <span>Holidays ({holidayDays.length})</span>
              </div>
              <div className="text-xs text-gray-600 grid grid-cols-2 gap-1">
                {holidayDays.map((day, idx) => (
                  <div key={idx} className="bg-white border rounded px-2 py-1">
                    {day.fullDate}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {leaveDays.length === 0 && holidayDays.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">
              No leave or holiday days in this period
            </p>
          )}
        </div>
      </div>
      
      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="border rounded p-2 text-center">
          <div className="text-gray-600">Average</div>
          <div className={`font-bold ${avgProductivity >= 80 ? 'text-green-600' : avgProductivity >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
            {avgProductivity.toFixed(1)}%
          </div>
        </div>
        <div className="border rounded p-2 text-center">
          <div className="text-gray-600">Peak</div>
          <div className="font-bold text-green-600">
            {peakProductivity.toFixed(1)}%
          </div>
        </div>
        <div className="border rounded p-2 text-center">
          <div className="text-gray-600">Lowest</div>
          <div className="font-bold text-red-600">
            {lowestProductivity.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductivityChart;