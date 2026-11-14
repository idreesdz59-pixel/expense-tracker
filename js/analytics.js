/**
 * analytics.js — Expense Analytics Computations & Dynamic Charts Controller
 *
 * Computes category-wise breakdowns, monthly income vs. expenses, spending
 * distribution, highest spending category, and total savings.
 */

import { getTransactions } from './storage.js';
import { escapeHtml, getCategoryColor } from './transactions.js';

/**
 * Computes analytics datasets for the selected period ('current-month', '3-months', '6-months', 'all').
 * @param {Array<object>} transactions
 * @param {string} period
 * @returns {object}
 */
export function computeAnalyticsData(transactions, period = '6-months') {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  let startMonthKey = null;
  if (period === 'current-month') {
    const mm = String(currentMonthIdx + 1).padStart(2, '0');
    startMonthKey = `${currentYear}-${mm}`;
  } else if (period === '3-months') {
    const d = new Date(currentYear, currentMonthIdx - 2, 1);
    startMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } else if (period === '6-months') {
    const d = new Date(currentYear, currentMonthIdx - 5, 1);
    startMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const scoped = transactions.filter((tx) => {
    if (!startMonthKey) return true;
    const txMonth = typeof tx.date === 'string' ? tx.date.slice(0, 7) : '';
    return txMonth >= startMonthKey;
  });

  let totalIncome = 0;
  let totalExpenses = 0;
  let expenseCount = 0;

  const categoryMap = {};
  const monthMap = {};

  scoped.forEach((tx) => {
    const amt = Number(tx.amount || 0);
    const monthKey = typeof tx.date === 'string' && tx.date.length >= 7 ? tx.date.slice(0, 7) : 'Unknown';

    if (!monthMap[monthKey]) {
      monthMap[monthKey] = { income: 0, expense: 0 };
    }

    if (tx.type === 'income') {
      totalIncome += amt;
      monthMap[monthKey].income += amt;
    } else {
      totalExpenses += amt;
      expenseCount += 1;
      monthMap[monthKey].expense += amt;

      if (!categoryMap[tx.category]) {
        categoryMap[tx.category] = { amount: 0, count: 0 };
      }
      categoryMap[tx.category].amount += amt;
      categoryMap[tx.category].count += 1;
    }
  });

  totalIncome = Number(totalIncome.toFixed(2));
  totalExpenses = Number(totalExpenses.toFixed(2));
  const totalSavings = Number((totalIncome - totalExpenses).toFixed(2));
  const savingsRate = totalIncome > 0 ? Number(((totalSavings / totalIncome) * 100).toFixed(1)) : 0;
  const averageExpense = expenseCount > 0 ? Number((totalExpenses / expenseCount).toFixed(2)) : 0;

  const categoryBreakdown = Object.entries(categoryMap)
    .map(([category, info]) => ({
      category,
      amount: Number(info.amount.toFixed(2)),
      count: info.count,
      percentage: totalExpenses > 0 ? Number(((info.amount / totalExpenses) * 100).toFixed(1)) : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  const highestCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

  const sortedMonthKeys = Object.keys(monthMap)
    .filter((k) => /^\d{4}-\d{2}$/.test(k))
    .sort((a, b) => a.localeCompare(b));

  const monthlyComparison = sortedMonthKeys.map((key) => {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return {
      monthKey: key,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      income: Number(monthMap[key].income.toFixed(2)),
      expense: Number(monthMap[key].expense.toFixed(2)),
    };
  });

  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate,
    averageExpense,
    expenseCount,
    highestCategory,
    categoryBreakdown,
    monthlyComparison,
  };
}

/**
 * Analytics View Controller.
 */
export function createAnalyticsController({ formatCurrency, refreshIcons }) {
  let activePeriod = '6-months';
  let incomeExpenseChart = null;
  let categoryBarChart = null;
  let distributionChart = null;

  const periodButtons = document.querySelectorAll('[data-analytics-period]');
  const savingsEl = document.getElementById('analytics-total-savings');
  const savingsMetaEl = document.getElementById('analytics-savings-meta');
  const topCatEl = document.getElementById('analytics-top-category');
  const topCatMetaEl = document.getElementById('analytics-top-category-meta');
  const avgExpenseEl = document.getElementById('analytics-avg-expense');
  const avgMetaEl = document.getElementById('analytics-avg-meta');

  const ieCanvas = document.getElementById('chart-analytics-income-expense');
  const ieEmpty = document.getElementById('chart-analytics-ie-empty');
  const barCanvas = document.getElementById('chart-analytics-category-bar');
  const barEmpty = document.getElementById('chart-analytics-bar-empty');
  const distCanvas = document.getElementById('chart-analytics-distribution');
  const distEmpty = document.getElementById('chart-analytics-dist-empty');

  const tableBody = document.getElementById('analytics-category-tbody');
  const tableEmpty = document.getElementById('analytics-table-empty');

  function destroyCharts() {
    if (incomeExpenseChart) {
      incomeExpenseChart.destroy();
      incomeExpenseChart = null;
    }
    if (categoryBarChart) {
      categoryBarChart.destroy();
      categoryBarChart = null;
    }
    if (distributionChart) {
      distributionChart.destroy();
      distributionChart = null;
    }
  }

  function renderCharts(data) {
    if (typeof window.Chart !== 'function') return;
    destroyCharts();

    // 1. Monthly Income vs Expenses
    if (data.monthlyComparison.length === 0) {
      ieEmpty.classList.remove('hidden');
    } else {
      ieEmpty.classList.add('hidden');
      incomeExpenseChart = new window.Chart(ieCanvas, {
        type: 'bar',
        data: {
          labels: data.monthlyComparison.map((m) => m.label),
          datasets: [
            {
              label: 'Income',
              data: data.monthlyComparison.map((m) => m.income),
              backgroundColor: '#16a34a',
              borderRadius: 4,
              barPercentage: 0.72,
              categoryPercentage: 0.6,
            },
            {
              label: 'Expenses',
              data: data.monthlyComparison.map((m) => m.expense),
              backgroundColor: '#dc2626',
              borderRadius: 4,
              barPercentage: 0.72,
              categoryPercentage: 0.6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                pointStyle: 'rectRounded',
                font: { family: "'DM Sans', sans-serif", size: 12 },
                color: '#475569',
              },
            },
            tooltip: {
              backgroundColor: '#0f172a',
              padding: 10,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#64748b', font: { family: "'DM Sans', sans-serif", size: 12 } },
            },
            y: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: '#f1f5f9' },
              ticks: {
                color: '#64748b',
                font: { family: "'JetBrains Mono', monospace", size: 11 },
                callback: (val) => `$${Number(val).toLocaleString('en-US')}`,
              },
            },
          },
        },
      });
    }

    // 2. Category-Wise Expense Breakdown (Horizontal Bar)
    if (data.categoryBreakdown.length === 0) {
      barEmpty.classList.remove('hidden');
      distEmpty.classList.remove('hidden');
    } else {
      barEmpty.classList.add('hidden');
      distEmpty.classList.add('hidden');

      categoryBarChart = new window.Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: data.categoryBreakdown.map((c) => c.category),
          datasets: [
            {
              label: 'Spent',
              data: data.categoryBreakdown.map((c) => c.amount),
              backgroundColor: data.categoryBreakdown.map((c) => c.color),
              borderRadius: 4,
              barThickness: 18,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              padding: 10,
              callbacks: {
                label: (ctx) => {
                  const item = data.categoryBreakdown[ctx.dataIndex];
                  return `${formatCurrency(item.amount)} (${item.percentage}%)`;
                },
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: '#f1f5f9' },
              ticks: {
                color: '#64748b',
                font: { family: "'JetBrains Mono', monospace", size: 11 },
                callback: (val) => `$${Number(val).toLocaleString('en-US')}`,
              },
            },
            y: {
              grid: { display: false },
              ticks: {
                color: '#334155',
                font: { family: "'DM Sans', sans-serif", size: 12 },
              },
            },
          },
        },
      });

      // 3. Spending Distribution (Doughnut)
      distributionChart = new window.Chart(distCanvas, {
        type: 'doughnut',
        data: {
          labels: data.categoryBreakdown.map((c) => c.category),
          datasets: [
            {
              data: data.categoryBreakdown.map((c) => c.amount),
              backgroundColor: data.categoryBreakdown.map((c) => c.color),
              borderColor: '#ffffff',
              borderWidth: 2,
              hoverOffset: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                padding: 12,
                font: { family: "'DM Sans', sans-serif", size: 12 },
                color: '#475569',
              },
            },
            tooltip: {
              backgroundColor: '#0f172a',
              padding: 10,
              callbacks: {
                label: (ctx) => {
                  const item = data.categoryBreakdown[ctx.dataIndex];
                  return `${item.category}: ${formatCurrency(item.amount)} (${item.percentage}%)`;
                },
              },
            },
          },
        },
      });
    }
  }

  function renderTable(breakdown) {
    if (breakdown.length === 0) {
      tableBody.innerHTML = '';
      tableEmpty.classList.remove('hidden');
      return;
    }

    tableEmpty.classList.add('hidden');
    tableBody.innerHTML = breakdown
      .map(
        (item) => `
        <tr>
          <td class="tx-name">${escapeHtml(item.category)}</td>
          <td class="text-right tabular-nums">${item.count}</td>
          <td class="text-right tx-amount tabular-nums">${escapeHtml(formatCurrency(item.amount))}</td>
          <td class="text-right tabular-nums">${item.percentage.toFixed(1)}%</td>
          <td>
            <div class="inline-bar-track" aria-hidden="true">
              <div class="inline-bar-fill" style="width: ${item.percentage}%; background-color: ${item.color};"></div>
            </div>
          </td>
        </tr>
      `
      )
      .join('');
  }

  function render() {
    const transactions = getTransactions();
    const data = computeAnalyticsData(transactions, activePeriod);

    // Update Analytics KPI Cards
    savingsEl.textContent =
      data.totalSavings < 0
        ? `-${formatCurrency(Math.abs(data.totalSavings))}`
        : formatCurrency(data.totalSavings);
    savingsEl.classList.toggle('text-expense', data.totalSavings < 0);
    savingsEl.classList.toggle('text-income', data.totalSavings >= 0);

    savingsMetaEl.textContent =
      data.totalIncome > 0
        ? `${data.savingsRate.toFixed(1)}% of ${formatCurrency(data.totalIncome)} income saved`
        : 'Income minus expenses in period';

    if (data.highestCategory) {
      topCatEl.textContent = data.highestCategory.category;
      topCatMetaEl.textContent = `${formatCurrency(data.highestCategory.amount)} (${data.highestCategory.percentage}% of spending)`;
    } else {
      topCatEl.textContent = '—';
      topCatMetaEl.textContent = 'No expense data in period';
    }

    avgExpenseEl.textContent = formatCurrency(data.averageExpense);
    avgMetaEl.textContent = `Across ${data.expenseCount} expense ${data.expenseCount === 1 ? 'entry' : 'entries'}`;

    renderCharts(data);
    renderTable(data.categoryBreakdown);
    refreshIcons();
  }

  function bindEvents() {
    periodButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        activePeriod = btn.dataset.analyticsPeriod;
        periodButtons.forEach((b) => b.classList.toggle('active', b === btn));
        render();
      });
    });
  }

  bindEvents();

  return { render };
}
