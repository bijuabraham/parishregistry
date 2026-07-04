"use client";

import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register ChartJS plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const GROUP_COLORS = {
  'Tri-Valley': '#4f46e5',      // Indigo
  'Central Valley': '#10b981',  // Emerald
  'Fremont': '#06b6d4',         // Cyan
  'South Bay': '#8b5cf6',        // Purple
  'San Francisco': '#f43f5e',    // Rose
  'Sacramento': '#ec4899',       // Pink
  'Unassigned': '#64748b'
};

// Common tooltip config
const tooltipConfig = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  titleFont: { family: 'Outfit, sans-serif', weight: 'bold', size: 13 },
  bodyFont: { family: 'Plus Jakarta Sans, sans-serif', size: 12 },
  padding: 14,
  cornerRadius: 10,
  borderColor: 'rgba(79, 70, 229, 0.2)',
  borderWidth: 1,
  caretSize: 6,
  boxPadding: 4,
};

// Common scales config
const getScales = (horizontal = false) => ({
  [horizontal ? 'x' : 'y']: {
    grid: {
      color: 'rgba(226, 232, 240, 0.6)',
      drawBorder: false,
    },
    ticks: {
      font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 },
      color: '#94a3b8',
      padding: 6
    },
    border: { display: false }
  },
  [horizontal ? 'y' : 'x']: {
    grid: { display: false },
    ticks: {
      font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 },
      color: '#64748b',
      padding: 6
    },
    border: { display: false }
  }
});

// Common options helper
const getCommonOptions = (onElementClick, labels, horizontal = false) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: tooltipConfig,
  },
  scales: getScales(horizontal),
  onClick: (event, elements) => {
    if (elements && elements.length > 0 && onElementClick) {
      const idx = elements[0].index;
      const clickedLabel = labels[idx];
      onElementClick(clickedLabel);
    }
  },
  cursor: 'pointer',
  animation: {
    duration: 600,
    easing: 'easeInOutQuart',
  }
});

// 1. Age Distribution Chart
export function AgeDistributionChart({ data = {}, onFilterClick }) {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const total = values.reduce((a, b) => a + b, 0);

  const chartData = {
    labels,
    datasets: [{
      label: 'Members',
      data: values,
      backgroundColor: labels.map((_, i) => {
        const alpha = 0.5 + (i / labels.length) * 0.45;
        return `rgba(79, 70, 229, ${alpha})`;
      }),
      hoverBackgroundColor: 'rgba(79, 70, 229, 1)',
      borderRadius: 6,
      borderWidth: 0,
    }]
  };

  const options = {
    ...getCommonOptions(onFilterClick, labels),
    plugins: {
      ...getCommonOptions(onFilterClick, labels).plugins,
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return ` ${ctx.raw} members (${pct}%)`;
          }
        }
      }
    }
  };

  return <Bar data={chartData} options={options} />;
}

// 2. Gender Chart
export function GenderChart({ data = {}, onFilterClick }) {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const total = values.reduce((a, b) => a + b, 0);

  const chartData = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: [
        'rgba(6, 182, 212, 0.8)',   // Male -> Cyan
        'rgba(244, 63, 94, 0.8)'    // Female -> Rose
      ],
      hoverBackgroundColor: [
        'rgba(6, 182, 212, 1)',
        'rgba(244, 63, 94, 1)'
      ],
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverBorderWidth: 4,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          font: { family: 'Plus Jakarta Sans, sans-serif', size: 12, weight: '600' },
          color: '#334155',
          boxWidth: 12,
          boxHeight: 12,
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
          }
        }
      }
    },
    animation: { duration: 600, easing: 'easeInOutQuart' },
    onClick: (event, elements) => {
      if (elements && elements.length > 0 && onFilterClick) {
        onFilterClick(labels[elements[0].index]);
      }
    }
  };

  return <Doughnut data={chartData} options={options} />;
}

// 3. Location / City Chart
export function CityChart({ data = [], onFilterClick }) {
  const labels = data.map(item => item.city || 'Unknown');
  const values = data.map(item => item.count);
  const total = values.reduce((a, b) => a + b, 0);

  const chartData = {
    labels,
    datasets: [{
      label: 'Households',
      data: values,
      backgroundColor: labels.map((_, i) => {
        const alpha = 0.45 + (1 - i / labels.length) * 0.5;
        return `rgba(6, 182, 212, ${alpha})`;
      }),
      hoverBackgroundColor: 'rgba(6, 182, 212, 1)',
      borderRadius: 4,
      borderWidth: 0,
    }]
  };

  const options = {
    ...getCommonOptions(onFilterClick, labels, true),
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return ` ${ctx.raw} households (${pct}%)`;
          }
        }
      }
    },
    scales: getScales(true),
  };

  return <Bar data={chartData} options={options} />;
}

// 4. Distance Chart
export function DistanceChart({ data = {}, onFilterClick }) {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const total = values.reduce((a, b) => a + b, 0);

  const distColors = [
    'rgba(16, 185, 129, 0.8)',   // green - closest
    'rgba(6, 182, 212, 0.8)',    // cyan
    'rgba(245, 158, 11, 0.8)',   // amber
    'rgba(239, 68, 68, 0.8)',    // red
    'rgba(139, 92, 246, 0.8)',   // purple - farthest
  ];

  const chartData = {
    labels,
    datasets: [{
      label: 'Households',
      data: values,
      backgroundColor: distColors.slice(0, labels.length),
      hoverBackgroundColor: distColors.slice(0, labels.length).map(c => c.replace('0.8', '1')),
      borderRadius: 6,
      borderWidth: 0,
    }]
  };

  const options = {
    ...getCommonOptions(onFilterClick, labels),
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return ` ${ctx.raw} households (${pct}%)`;
          }
        }
      }
    }
  };
  return <Bar data={chartData} options={options} />;
}

// 5. Prayer Group Chart
export function PrayerGroupChart({ data = [], onFilterClick }) {
  const labels = data.map(item => item.name);
  const values = data.map(item => item.count);
  const colors = data.map(item => GROUP_COLORS[item.name] || '#64748b');
  const total = values.reduce((a, b) => a + b, 0);

  const chartData = {
    labels,
    datasets: [{
      label: 'Members',
      data: values,
      backgroundColor: colors.map(c => `${c}bb`),
      hoverBackgroundColor: colors,
      borderRadius: 6,
      borderWidth: 0,
    }]
  };

  const options = {
    ...getCommonOptions(onFilterClick, labels),
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return ` ${ctx.raw} members (${pct}%)`;
          }
        }
      }
    }
  };

  return <Bar data={chartData} options={options} />;
}

// 6. Growth Chart (Line Chart of Registration History)
export function GrowthHistoryChart({ data = {} }) {
  const hhData = data.households || [];
  const memData = data.members || [];

  const allYears = Array.from(new Set([
    ...hhData.map(d => d.year),
    ...memData.map(d => d.year)
  ])).sort();

  const hhMap = hhData.reduce((acc, curr) => ({ ...acc, [curr.year]: curr.count }), {});
  const memMap = memData.reduce((acc, curr) => ({ ...acc, [curr.year]: curr.count }), {});

  const hhValues = allYears.map(yr => hhMap[yr] || 0);
  const memValues = allYears.map(yr => memMap[yr] || 0);

  // Cumulative calculation
  let hhCumulative = [];
  let memCumulative = [];
  let hhSum = 0;
  let memSum = 0;
  for (let i = 0; i < allYears.length; i++) {
    hhSum += hhValues[i];
    memSum += memValues[i];
    hhCumulative.push(hhSum);
    memCumulative.push(memSum);
  }

  const chartData = {
    labels: allYears,
    datasets: [
      {
        label: 'Total Members',
        data: memCumulative,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.08)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#4f46e5',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: '#4f46e5',
      },
      {
        label: 'Total Households',
        data: hhCumulative,
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.08)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: '#06b6d4',
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          font: { family: 'Plus Jakarta Sans, sans-serif', size: 12, weight: '600' },
          color: '#334155',
          boxWidth: 12,
          boxHeight: 12,
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          title: (items) => `Year ${items[0].label}`,
        }
      }
    },
    scales: {
      y: {
        grid: { color: 'rgba(226, 232, 240, 0.6)', drawBorder: false },
        ticks: { font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 }, color: '#94a3b8' },
        border: { display: false }
      },
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 }, color: '#64748b' },
        border: { display: false }
      }
    },
    animation: { duration: 800, easing: 'easeInOutQuart' }
  };

  return <Line data={chartData} options={options} />;
}

// 7. Relationship Breakdown Chart
export function RelationshipChart({ data = [], onFilterClick }) {
  const labels = data.map(item => item.name);
  const values = data.map(item => item.count);
  const total = values.reduce((a, b) => a + b, 0);

  const relColors = [
    'rgba(79, 70, 229, 0.85)',   // Husband - indigo
    'rgba(244, 63, 94, 0.85)',   // Wife - rose
    'rgba(6, 182, 212, 0.85)',   // Son - cyan
    'rgba(16, 185, 129, 0.85)',  // Daughter - emerald
    'rgba(245, 158, 11, 0.85)',  // Other
    'rgba(100, 116, 139, 0.85)', // Unknown
  ];

  const chartData = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: relColors.slice(0, labels.length),
      hoverBackgroundColor: relColors.slice(0, labels.length).map(c => c.replace('0.85', '1')),
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverBorderWidth: 4,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          font: { family: 'Plus Jakarta Sans, sans-serif', size: 11, weight: '600' },
          color: '#334155',
          boxWidth: 11,
          boxHeight: 11,
          padding: 12,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
          }
        }
      }
    },
    animation: { duration: 600, easing: 'easeInOutQuart' },
    onClick: (event, elements) => {
      if (elements && elements.length > 0 && onFilterClick) {
        onFilterClick(labels[elements[0].index]);
      }
    }
  };

  return <Doughnut data={chartData} options={options} />;
}

// Financial Trend Chart - Year over Year
export function FinancialTrendChart({ data = [], onFilterClick }) {
  const labels = data.map(item => item.year);
  const values = data.map(item => item.total || 0);

  const chartData = {
    labels,
    datasets: [{
      label: 'Total Giving ($)',
      data: values,
      borderColor: 'rgba(79, 70, 229, 1)',
      backgroundColor: 'rgba(79, 70, 229, 0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: 'rgba(79, 70, 229, 1)',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => ` $${ctx.raw?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 } }
      },
      y: {
        grid: { color: 'rgba(100, 116, 139, 0.1)' },
        ticks: {
          color: '#64748b',
          font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 },
          callback: (value) => '$' + value.toLocaleString()
        }
      }
    }
  };

  return <Line data={chartData} options={options} />;
}

// Financial Monthly Trend Chart
export function FinancialMonthlyTrendChart({ data = [], selectedYear = null }) {
  const filteredData = selectedYear ? data.filter(item => item.year === selectedYear) : data;

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const values = monthLabels.map((_, idx) => {
    const month = String(idx + 1).padStart(2, '0');
    const monthData = filteredData.find(item => item.month === month);
    return monthData ? monthData.total : 0;
  });

  const chartData = {
    labels: monthLabels,
    datasets: [{
      label: selectedYear ? `Monthly Giving ${selectedYear}` : 'Monthly Giving',
      data: values,
      borderColor: 'rgba(16, 185, 129, 1)',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: 'rgba(16, 185, 129, 1)',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => ` $${ctx.raw?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 } }
      },
      y: {
        grid: { color: 'rgba(100, 116, 139, 0.1)' },
        ticks: {
          color: '#64748b',
          font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 },
          callback: (value) => '$' + value.toLocaleString()
        }
      }
    }
  };

  return <Bar data={chartData} options={options} />;
}

// Financial Bar Chart - Comparison between years
export function FinancialYearComparisonChart({ data = [] }) {
  const labels = data.map(item => item.year);
  const values = data.map(item => item.total || 0);

  const chartData = {
    labels,
    datasets: [{
      label: 'Total Giving ($)',
      data: values,
      backgroundColor: labels.map((_, i) => {
        const colors = ['rgba(79, 70, 229, 0.8)', 'rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(239, 68, 68, 0.8)', 'rgba(139, 92, 246, 0.8)'];
        return colors[i % colors.length];
      }),
      borderRadius: 6,
      borderWidth: 0,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipConfig,
        callbacks: {
          label: (ctx) => ` $${ctx.raw?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 } }
      },
      y: {
        grid: { color: 'rgba(100, 116, 139, 0.1)' },
        ticks: {
          color: '#64748b',
          font: { family: 'Plus Jakarta Sans, sans-serif', size: 11 },
          callback: (value) => '$' + value.toLocaleString()
        }
      }
    }
  };

  return <Bar data={chartData} options={options} />;
}
