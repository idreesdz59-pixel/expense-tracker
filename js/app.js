/**
 * app.js — Application Shell, Navigation Router & Cross-Module Coordinator
 *
 * Initializes storage, coordinates the four workspace views (Dashboard,
 * Transactions, Analytics, Budget), manages responsive sidebar state,
 * shared formatters, and toast notifications.
 */

import { initializeStorage, resetSampleData, getTransactions } from './storage.js';
import { createTransactionsController, escapeHtml } from './transactions.js';
import { createDashboardController, calculateFinancialSummary } from './dashboard.js';
import { createAnalyticsController } from './analytics.js';
import { createBudgetController } from './budget.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Analytics',
  budget: 'Budget',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value) {
  const num = Number(value || 0);
  return currencyFormatter.format(Math.abs(num) < 0.005 ? 0 : num);
}

function formatDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMonthLabel(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return monthStr || '';
  const [y, m] = monthStr.split('-').map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentMonthISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function showToast(message, variant = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  const iconName = variant === 'warning' ? 'alert-triangle' : 'check-circle-2';
  toast.innerHTML = `
    <i data-lucide="${iconName}" aria-hidden="true"></i>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function bootstrapApp() {
  initializeStorage();

  let activeView = 'dashboard';

  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const openSidebarBtn = document.getElementById('btn-open-sidebar');
  const closeSidebarBtn = document.getElementById('btn-close-sidebar');
  const topbarTitle = document.getElementById('topbar-title');
  const sidebarNetBalance = document.getElementById('sidebar-net-balance');
  const navButtons = document.querySelectorAll('.nav-item[data-view]');
  const viewSections = document.querySelectorAll('.view-section');

  function openSidebar() {
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('active');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('active');
  }

  function updateSidebarNetBalance() {
    const summary = calculateFinancialSummary(getTransactions(), getCurrentMonthISO());
    sidebarNetBalance.textContent =
      summary.totalBalance < 0
        ? `-${formatCurrency(Math.abs(summary.totalBalance))}`
        : formatCurrency(summary.totalBalance);
    sidebarNetBalance.classList.toggle('text-expense', summary.totalBalance < 0);
  }

  // Forward declarations for cross-module synchronization
  let transactionsCtrl;
  let dashboardCtrl;
  let analyticsCtrl;
  let budgetCtrl;

  function syncAllViews() {
    updateSidebarNetBalance();
    if (activeView === 'dashboard') {
      dashboardCtrl.render();
    } else if (activeView === 'transactions') {
      transactionsCtrl.render();
    } else if (activeView === 'analytics') {
      analyticsCtrl.render();
    } else if (activeView === 'budget') {
      budgetCtrl.render();
    }
  }

  function navigateTo(viewName) {
    if (!VIEW_TITLES[viewName]) return;
    activeView = viewName;

    navButtons.forEach((btn) => {
      const isCurrent = btn.dataset.view === viewName;
      btn.classList.toggle('active', isCurrent);
      if (isCurrent) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    viewSections.forEach((sec) => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });

    topbarTitle.textContent = VIEW_TITLES[viewName];
    closeSidebar();
    syncAllViews();
  }

  // Instantiate Feature Controllers
  transactionsCtrl = createTransactionsController({
    formatCurrency,
    formatDate,
    getTodayISO,
    onDataChanged: syncAllViews,
    showToast,
    refreshIcons,
  });

  dashboardCtrl = createDashboardController({
    formatCurrency,
    formatDate,
    formatMonthLabel,
    getCurrentMonthISO,
    onEditTransaction: (txId) => transactionsCtrl.openTransactionModal('edit', txId),
    onNavigate: navigateTo,
    refreshIcons,
  });

  analyticsCtrl = createAnalyticsController({
    formatCurrency,
    refreshIcons,
  });

  budgetCtrl = createBudgetController({
    formatCurrency,
    formatMonthLabel,
    getCurrentMonthISO,
    onDataChanged: syncAllViews,
    showToast,
    refreshIcons,
  });

  // Global Event Bindings
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  openSidebarBtn.addEventListener('click', openSidebar);
  closeSidebarBtn.addEventListener('click', closeSidebar);
  sidebarBackdrop.addEventListener('click', closeSidebar);

  document.getElementById('btn-open-add-modal').addEventListener('click', () => {
    transactionsCtrl.openTransactionModal('add', null, 'expense');
  });

  document.querySelectorAll('[data-action="open-add"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      transactionsCtrl.openTransactionModal('add', null, 'expense');
    });
  });

  document.querySelectorAll('[data-action="open-add-income"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      transactionsCtrl.openTransactionModal('add', null, 'income');
    });
  });

  document.querySelectorAll('[data-action="open-add-expense"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      transactionsCtrl.openTransactionModal('add', null, 'expense');
    });
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    transactionsCtrl.exportCSV();
  });

  document.getElementById('btn-reset-demo').addEventListener('click', () => {
    resetSampleData();
    syncAllViews();
    showToast('Sample transactions and budget restored.', 'success');
  });

  // Initial Render
  navigateTo('dashboard');
  refreshIcons();

  // Safety re-render once deferred CDN scripts finish loading if needed
  window.addEventListener('load', () => {
    syncAllViews();
    refreshIcons();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
