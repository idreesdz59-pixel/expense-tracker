/**
 * budget.js — Pure Budget Calculations & Budget Management View Controller
 *
 * Computes monthly budget utilization, remaining allowance, and 80% warning /
 * 100% exceeded states independently of LocalStorage and DOM APIs.
 */

import { getTransactions, getBudget, saveBudget } from './storage.js';
import { escapeHtml, getCategoryColor } from './transactions.js';

export const BUDGET_WARNING_THRESHOLD = 80;

/**
 * Computes monthly budget metrics for a given YYYY-MM month.
 * @param {Array<object>} transactions
 * @param {{ monthlyLimit: number }} budgetConfig
 * @param {string} targetMonth - YYYY-MM
 * @returns {object}
 */
export function calculateBudgetStatus(transactions, budgetConfig, targetMonth) {
  const monthlyLimit = Math.max(0, Number(budgetConfig?.monthlyLimit || 0));

  const monthExpenses = transactions.filter(
    (tx) => tx.type === 'expense' && typeof tx.date === 'string' && tx.date.startsWith(targetMonth)
  );

  const monthlySpent = Number(
    monthExpenses.reduce((sum, tx) => sum + Number(tx.amount || 0), 0).toFixed(2)
  );

  const remainingBudget = Number((monthlyLimit - monthlySpent).toFixed(2));
  const utilizationPercent =
    monthlyLimit > 0 ? Number(((monthlySpent / monthlyLimit) * 100).toFixed(1)) : 0;

  let status = 'unset';
  if (monthlyLimit > 0) {
    if (utilizationPercent > 100) {
      status = 'exceeded';
    } else if (utilizationPercent >= BUDGET_WARNING_THRESHOLD) {
      status = 'warning';
    } else {
      status = 'healthy';
    }
  }

  // Group month expenses by category
  const categoryTotals = {};
  monthExpenses.forEach((tx) => {
    categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
  });

  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([category, amount]) => ({
      category,
      amount: Number(amount.toFixed(2)),
      shareOfBudget: monthlyLimit > 0 ? Number(((amount / monthlyLimit) * 100).toFixed(1)) : 0,
      shareOfSpent: monthlySpent > 0 ? Number(((amount / monthlySpent) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    targetMonth,
    monthlyLimit,
    monthlySpent,
    remainingBudget,
    utilizationPercent,
    status,
    expenseCount: monthExpenses.length,
    categoryBreakdown,
  };
}

/**
 * Validates monthly budget input.
 * @param {string|number} rawLimit
 * @returns {{ valid: boolean, error: string, value: number }}
 */
export function validateBudgetLimit(rawLimit) {
  const num = Number(rawLimit);
  if (!Number.isFinite(num) || num <= 0) {
    return {
      valid: false,
      error: 'Enter a valid monthly budget greater than $0.00.',
      value: 0,
    };
  }
  if (num > 100000000) {
    return {
      valid: false,
      error: 'Budget limit exceeds maximum supported amount.',
      value: 0,
    };
  }
  return {
    valid: true,
    error: '',
    value: Number(num.toFixed(2)),
  };
}

/**
 * Renders a reusable budget alert banner into a target DOM container.
 * @param {HTMLElement} container
 * @param {object} budgetStatus
 * @param {function} formatCurrency
 * @param {function} formatMonthLabel
 */
export function renderBudgetAlertBanner(container, budgetStatus, formatCurrency, formatMonthLabel) {
  if (!container) return;

  if (budgetStatus.status === 'exceeded') {
    const overAmount = Math.abs(budgetStatus.remainingBudget);
    container.className = 'alert-banner alert-danger';
    container.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-octagon" aria-hidden="true"></i>
        <span><strong>Budget Exceeded (${escapeHtml(formatMonthLabel(budgetStatus.targetMonth))}):</strong> Monthly spending is ${escapeHtml(formatCurrency(budgetStatus.monthlySpent))}, which is <strong>${escapeHtml(formatCurrency(overAmount))}</strong> over your ${escapeHtml(formatCurrency(budgetStatus.monthlyLimit))} budget (${budgetStatus.utilizationPercent.toFixed(1)}%).</span>
      </div>
    `;
    container.classList.remove('hidden');
  } else if (budgetStatus.status === 'warning') {
    container.className = 'alert-banner alert-warning';
    container.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-triangle" aria-hidden="true"></i>
        <span><strong>Approaching Budget Limit (${escapeHtml(formatMonthLabel(budgetStatus.targetMonth))}):</strong> You have used <strong>${budgetStatus.utilizationPercent.toFixed(1)}%</strong> of your ${escapeHtml(formatCurrency(budgetStatus.monthlyLimit))} monthly budget. ${escapeHtml(formatCurrency(budgetStatus.remainingBudget))} remaining.</span>
      </div>
    `;
    container.classList.remove('hidden');
  } else {
    container.className = 'alert-banner hidden';
    container.innerHTML = '';
  }
}

/**
 * Budget Management View Controller.
 */
export function createBudgetController({
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthISO,
  onDataChanged,
  showToast,
  refreshIcons,
}) {
  let selectedMonth = getCurrentMonthISO();

  const monthPicker = document.getElementById('budget-month-picker');
  const alertBanner = document.getElementById('budget-alert-banner');
  const periodLabel = document.getElementById('budget-period-label');
  const statusLabel = document.getElementById('budget-status-label');
  const limitDisplay = document.getElementById('budget-limit-display');
  const spentDisplay = document.getElementById('budget-spent-display');
  const remainingDisplay = document.getElementById('budget-remaining-display');
  const utilizationPct = document.getElementById('budget-utilization-pct');
  const progressBar = document.getElementById('budget-progressbar');
  const progressFill = document.getElementById('budget-progress-fill');

  const budgetForm = document.getElementById('budget-form');
  const limitInput = document.getElementById('budget-limit-input');
  const errLimit = document.getElementById('err-budget-limit');

  const categoryList = document.getElementById('budget-category-list');
  const categoryEmpty = document.getElementById('budget-category-empty');

  function renderStatusBadge(status) {
    if (status === 'exceeded') {
      statusLabel.className = 'status-indicator text-expense';
      statusLabel.innerHTML = `<i data-lucide="alert-octagon" aria-hidden="true"></i><span>Budget Exceeded</span>`;
    } else if (status === 'warning') {
      statusLabel.className = 'status-indicator text-warning';
      statusLabel.innerHTML = `<i data-lucide="alert-triangle" aria-hidden="true"></i><span>Warning: ≥80% Used</span>`;
    } else if (status === 'healthy') {
      statusLabel.className = 'status-indicator text-income';
      statusLabel.innerHTML = `<i data-lucide="check-circle-2" aria-hidden="true"></i><span>On Track</span>`;
    } else {
      statusLabel.className = 'status-indicator text-secondary';
      statusLabel.innerHTML = `<i data-lucide="sliders-horizontal" aria-hidden="true"></i><span>Not Configured</span>`;
    }
  }

  function render() {
    const transactions = getTransactions();
    const budgetConfig = getBudget();
    const status = calculateBudgetStatus(transactions, budgetConfig, selectedMonth);

    monthPicker.value = selectedMonth;
    periodLabel.textContent = `Tracking ${formatMonthLabel(selectedMonth)} (${status.expenseCount} expense ${status.expenseCount === 1 ? 'entry' : 'entries'})`;

    limitDisplay.textContent = formatCurrency(status.monthlyLimit);
    spentDisplay.textContent = formatCurrency(status.monthlySpent);

    if (status.remainingBudget < 0) {
      remainingDisplay.textContent = `-${formatCurrency(Math.abs(status.remainingBudget))}`;
      remainingDisplay.classList.add('text-expense');
      remainingDisplay.classList.remove('text-income');
    } else {
      remainingDisplay.textContent = formatCurrency(status.remainingBudget);
      remainingDisplay.classList.remove('text-expense');
      if (status.monthlyLimit > 0) {
        remainingDisplay.classList.add('text-income');
      }
    }

    utilizationPct.textContent = `${status.utilizationPercent.toFixed(1)}%`;
    const clampedWidth = Math.min(100, Math.max(0, status.utilizationPercent));
    progressFill.style.width = `${clampedWidth}%`;
    progressFill.classList.remove('is-warning', 'is-exceeded');
    if (status.status === 'warning') {
      progressFill.classList.add('is-warning');
    } else if (status.status === 'exceeded') {
      progressFill.classList.add('is-exceeded');
    }
    progressBar.setAttribute('aria-valuenow', String(Math.round(clampedWidth)));

    renderStatusBadge(status.status);
    renderBudgetAlertBanner(alertBanner, status, formatCurrency, formatMonthLabel);

    if (document.activeElement !== limitInput) {
      limitInput.value = budgetConfig.monthlyLimit > 0 ? budgetConfig.monthlyLimit.toFixed(2) : '';
    }

    // Render Category Contributions
    if (status.categoryBreakdown.length === 0) {
      categoryList.innerHTML = '';
      categoryEmpty.classList.remove('hidden');
    } else {
      categoryEmpty.classList.add('hidden');
      categoryList.innerHTML = status.categoryBreakdown
        .map((item) => {
          const barPct =
            status.monthlyLimit > 0
              ? Math.min(100, item.shareOfBudget)
              : item.shareOfSpent;
          const pctLabel =
            status.monthlyLimit > 0
              ? `${item.shareOfBudget.toFixed(1)}% of budget`
              : `${item.shareOfSpent.toFixed(1)}% of spent`;
          const color = getCategoryColor(item.category);

          return `
            <div class="budget-cat-row">
              <div class="budget-cat-top">
                <span class="budget-cat-name">${escapeHtml(item.category)}</span>
                <span class="budget-cat-values tabular-nums">
                  <strong>${escapeHtml(formatCurrency(item.amount))}</strong> · ${pctLabel}
                </span>
              </div>
              <div class="budget-cat-track">
                <div class="budget-cat-fill" style="width: ${barPct}%; background-color: ${color};"></div>
              </div>
            </div>
          `;
        })
        .join('');
    }

    refreshIcons();
  }

  function clearError() {
    errLimit.textContent = '';
    errLimit.classList.add('hidden');
    limitInput.classList.remove('input-invalid');
  }

  function bindEvents() {
    monthPicker.value = selectedMonth;

    monthPicker.addEventListener('change', (e) => {
      if (e.target.value) {
        selectedMonth = e.target.value;
        render();
      }
    });

    budgetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      clearError();

      const validation = validateBudgetLimit(limitInput.value);
      if (!validation.valid) {
        errLimit.textContent = validation.error;
        errLimit.classList.remove('hidden');
        limitInput.classList.add('input-invalid');
        return;
      }

      saveBudget({ monthlyLimit: validation.value });
      showToast(`Monthly budget updated to ${formatCurrency(validation.value)}.`, 'success');
      onDataChanged();
    });
  }

  bindEvents();

  return {
    render,
    setSelectedMonth(month) {
      if (month) selectedMonth = month;
    },
  };
}
