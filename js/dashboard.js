/**
 * dashboard.js — Pure Financial Summary Calculations & Dashboard View Controller
 *
 * Dynamically calculates Total Balance = Total Income - Total Expenses,
 * monthly spending, recent transactions, 6-month overview series, and
 * expense category breakdown.
 */

import { getTransactions, getBudget } from './storage.js';
import { escapeHtml, getCategoryColor } from './transactions.js';
import { calculateBudgetStatus, renderBudgetAlertBanner } from './budget.js';

/**
 * Pure dashboard calculation engine.
 * @param {Array<object>} transactions
 * @param {string} targetMonth - YYYY-MM
 * @returns {object}
 */
export function calculateFinancialSummary(transactions, targetMonth) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let monthlyIncome = 0;
  let monthlySpending = 0;

  transactions.forEach((tx) => {
    const amt = Number(tx.amount || 0);
    const inTargetMonth = typeof tx.date === 'string' && tx.date.startsWith(targetMonth);

    if (tx.type === 'income') {
      totalIncome += amt;
      incomeCount += 1;
      if (inTargetMonth) monthlyIncome += amt;
    } else {
      totalExpenses += amt;
      expenseCount += 1;
      if (inTargetMonth) monthlySpending += amt;
    }
  });

  totalIncome = Number(totalIncome.toFixed(2));
  totalExpenses = Number(totalExpenses.toFixed(2));
  const totalBalance = Number((totalIncome - totalExpenses).toFixed(2));
  monthlyIncome = Number(monthlyIncome.toFixed(2));
  monthlySpending = Number(monthlySpending.toFixed(2));

  // Recent 6 transactions sorted by date descending
  const recentTransactions = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
    .slice(0, 6);

  // Build 6-month trajectory anchored at targetMonth
  const [yrStr, moStr] = targetMonth.split('-');
  const anchorYear = Number(yrStr) || new Date().getFullYear();
  const anchorMonthIdx = (Number(moStr) || new Date().getMonth() + 1) - 1;

  const monthlySeries = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    const d = new Date(anchorYear, anchorMonthIdx + offset, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const key = `${yyyy}-${mm}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    let income = 0;
    let expense = 0;
    transactions.forEach((tx) => {
      if (typeof tx.date === 'string' && tx.date.startsWith(key)) {
        if (tx.type === 'income') income += tx.amount;
        else expense += tx.amount;
      }
    });

    monthlySeries.push({
      monthKey: key,
      label,
      income: Number(income.toFixed(2)),
      expense: Number(expense.toFixed(2)),
    });
  }

  // Expense category breakdown for targetMonth
  const catMap = {};
  transactions.forEach((tx) => {
    if (tx.type === 'expense' && typeof tx.date === 'string' && tx.date.startsWith(targetMonth)) {
      catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
    }
  });

  const categoryBreakdown = Object.entries(catMap)
    .map(([category, amount]) => ({
      category,
      amount: Number(amount.toFixed(2)),
      percentage: monthlySpending > 0 ? Number(((amount / monthlySpending) * 100).toFixed(1)) : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalBalance,
    totalIncome,
    totalExpenses,
    incomeCount,
    expenseCount,
    monthlyIncome,
    monthlySpending,
    recentTransactions,
    monthlySeries,
    categoryBreakdown,
  };
}

/**
 * Dashboard View Controller.
 */
export function createDashboardController({
  formatCurrency,
  formatDate,
  formatMonthLabel,
  getCurrentMonthISO,
  onEditTransaction,
  onNavigate,
  refreshIcons,
}) {
  let selectedMonth = getCurrentMonthISO();
  let monthlyChart = null;
  let categoryChart = null;

  const monthPicker = document.getElementById('dashboard-month-picker');
  const budgetAlertEl = document.getElementById('dashboard-budget-alert');

  const kpiBalance = document.getElementById('kpi-total-balance');
  const kpiBalanceMeta = document.getElementById('kpi-balance-meta');
  const kpiIncome = document.getElementById('kpi-total-income');
  const kpiIncomeMeta = document.getElementById('kpi-income-meta');
  const kpiExpenses = document.getElementById('kpi-total-expenses');
  const kpiExpensesMeta = document.getElementById('kpi-expenses-meta');
  const kpiMonthlySpending = document.getElementById('kpi-monthly-spending');
  const kpiMonthlyMeta = document.getElementById('kpi-monthly-meta');

  const monthlyCanvas = document.getElementById('chart-dashboard-monthly');
  const monthlyEmpty = document.getElementById('chart-dashboard-monthly-empty');
  const categoryCanvas = document.getElementById('chart-dashboard-categories');
  const categoryEmpty = document.getElementById('chart-dashboard-categories-empty');
  const categoryLegend = document.getElementById('dashboard-category-legend');
  const categorySubtitle = document.getElementById('dashboard-category-subtitle');

  const recentTbody = document.getElementById('dashboard-recent-tbody');
  const recentEmpty = document.getElementById('dashboard-recent-empty');

  function renderCharts(summary) {
    if (typeof window.Chart !== 'function') return;

    // 1. Monthly Spending Overview Chart
    const hasSeriesData = summary.monthlySeries.some((m) => m.income > 0 || m.expense > 0);
    if (monthlyChart) {
      monthlyChart.destroy();
      monthlyChart = null;
    }

    if (!hasSeriesData) {
      monthlyEmpty.classList.remove('hidden');
    } else {
      monthlyEmpty.classList.add('hidden');
      monthlyChart = new window.Chart(monthlyCanvas, {
        type: 'bar',
        data: {
          labels: summary.monthlySeries.map((m) => m.label),
          datasets: [
            {
              label: 'Income',
              data: summary.monthlySeries.map((m) => m.income),
              backgroundColor: '#16a34a',
              borderRadius: 4,
              barPercentage: 0.72,
              categoryPercentage: 0.65,
            },
            {
              label: 'Expenses',
              data: summary.monthlySeries.map((m) => m.expense),
              backgroundColor: '#0f172a',
              borderRadius: 4,
              barPercentage: 0.72,
              categoryPercentage: 0.65,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
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
              ticks: {
                color: '#64748b',
                font: { family: "'DM Sans', sans-serif", size: 12 },
              },
            },
            y: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: '#f1f5f9' },
              ticks: {
                color: '#64748b',
                font: { family: "'JetBrains Mono', monospace", size: 11 },
                callback: (value) => `$${Number(value).toLocaleString('en-US')}`,
              },
            },
          },
        },
      });
    }

    // 2. Expense Category Breakdown Doughnut
    if (categoryChart) {
      categoryChart.destroy();
      categoryChart = null;
    }

    if (summary.categoryBreakdown.length === 0) {
      categoryEmpty.classList.remove('hidden');
      categoryLegend.innerHTML = '';
    } else {
      categoryEmpty.classList.add('hidden');
      categoryChart = new window.Chart(categoryCanvas, {
        type: 'doughnut',
        data: {
          labels: summary.categoryBreakdown.map((c) => c.category),
          datasets: [
            {
              data: summary.categoryBreakdown.map((c) => c.amount),
              backgroundColor: summary.categoryBreakdown.map((c) => c.color),
              borderColor: '#ffffff',
              borderWidth: 2,
              hoverOffset: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '66%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              padding: 10,
              callbacks: {
                label: (ctx) => {
                  const item = summary.categoryBreakdown[ctx.dataIndex];
                  return `${item.category}: ${formatCurrency(item.amount)} (${item.percentage}%)`;
                },
              },
            },
          },
        },
      });

      categoryLegend.innerHTML = summary.categoryBreakdown
        .slice(0, 6)
        .map(
          (item) => `
          <li class="legend-item">
            <span class="legend-left">
              <span class="legend-swatch" style="background-color: ${item.color};"></span>
              <span class="legend-name">${escapeHtml(item.category)}</span>
            </span>
            <span class="legend-value tabular-nums">${escapeHtml(formatCurrency(item.amount))}</span>
          </li>
        `
        )
        .join('');
    }
  }

  function renderRecentTransactions(recent) {
    if (recent.length === 0) {
      recentTbody.innerHTML = '';
      recentEmpty.classList.remove('hidden');
      return;
    }

    recentEmpty.classList.add('hidden');
    recentTbody.innerHTML = recent
      .map((tx) => {
        const isIncome = tx.type === 'income';
        const signed = `${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}`;
        const desc = tx.description
          ? `<span class="tx-desc" title="${escapeHtml(tx.description)}">${escapeHtml(tx.description)}</span>`
          : '';
        return `
          <tr>
            <td class="tx-date-cell tabular-nums">${escapeHtml(formatDate(tx.date))}</td>
            <td>
              <div class="tx-title-cell">
                <span class="tx-name">${escapeHtml(tx.title)}</span>
                ${desc}
              </div>
            </td>
            <td class="tx-category-cell">${escapeHtml(tx.category)}</td>
            <td class="text-right tx-amount tabular-nums ${isIncome ? 'text-income' : 'text-expense'}">${signed}</td>
            <td class="text-right">
              <button type="button" class="icon-btn" data-dash-edit="${escapeHtml(tx.id)}" aria-label="Edit ${escapeHtml(tx.title)}" title="Edit transaction">
                <i data-lucide="pencil"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function render() {
    const transactions = getTransactions();
    const budgetConfig = getBudget();
    const summary = calculateFinancialSummary(transactions, selectedMonth);
    const budgetStatus = calculateBudgetStatus(transactions, budgetConfig, selectedMonth);

    monthPicker.value = selectedMonth;

    // Update KPI Cards
    kpiBalance.textContent =
      summary.totalBalance < 0
        ? `-${formatCurrency(Math.abs(summary.totalBalance))}`
        : formatCurrency(summary.totalBalance);
    kpiBalance.classList.toggle('text-expense', summary.totalBalance < 0);
    kpiBalanceMeta.textContent =
      summary.totalIncome > 0
        ? `Savings rate: ${(((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100).toFixed(1)}% overall`
        : 'Total income minus total expenses';

    kpiIncome.textContent = formatCurrency(summary.totalIncome);
    kpiIncomeMeta.textContent = `${summary.incomeCount} income ${summary.incomeCount === 1 ? 'entry' : 'entries'}`;

    kpiExpenses.textContent = formatCurrency(summary.totalExpenses);
    kpiExpensesMeta.textContent = `${summary.expenseCount} expense ${summary.expenseCount === 1 ? 'entry' : 'entries'}`;

    kpiMonthlySpending.textContent = formatCurrency(summary.monthlySpending);
    if (budgetStatus.monthlyLimit > 0) {
      kpiMonthlyMeta.textContent = `${formatMonthLabel(selectedMonth)} · ${budgetStatus.utilizationPercent.toFixed(0)}% of ${formatCurrency(budgetStatus.monthlyLimit)} budget`;
    } else {
      kpiMonthlyMeta.textContent = `${formatMonthLabel(selectedMonth)} expenses`;
    }

    categorySubtitle.textContent = `${formatMonthLabel(selectedMonth)} distribution`;

    renderBudgetAlertBanner(budgetAlertEl, budgetStatus, formatCurrency, formatMonthLabel);
    renderCharts(summary);
    renderRecentTransactions(summary.recentTransactions);
    refreshIcons();

    return summary;
  }

  function bindEvents() {
    monthPicker.value = selectedMonth;

    monthPicker.addEventListener('change', (e) => {
      if (e.target.value) {
        selectedMonth = e.target.value;
        render();
      }
    });

    recentTbody.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-dash-edit]');
      if (editBtn) {
        onEditTransaction(editBtn.dataset.dashEdit);
      }
    });

    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        onNavigate(el.dataset.nav);
      });
    });
  }

  bindEvents();

  return {
    render,
    getSummary: () => calculateFinancialSummary(getTransactions(), selectedMonth),
  };
}
