/**
 * transactions.js — Transaction Business Logic, Validation & History View Controller
 *
 * Separates pure transaction filtering, sorting, and validation logic from DOM
 * manipulation and LocalStorage calls so rules remain portable.
 */

import {
  getTransactions,
  getTransactionById,
  saveTransaction,
  updateTransaction,
  deleteTransaction,
} from './storage.js';

export const TRANSACTION_CATEGORIES = {
  expense: [
    'Food',
    'Housing',
    'Transportation',
    'Utilities',
    'Healthcare',
    'Entertainment',
    'Shopping',
    'Education',
    'Other',
  ],
  income: [
    'Salary',
    'Freelance',
    'Investments',
    'Gift',
    'Refund',
    'Other',
  ],
};

export const ALL_CATEGORIES = Array.from(
  new Set([...TRANSACTION_CATEGORIES.expense, ...TRANSACTION_CATEGORIES.income])
);

const CATEGORY_COLORS = {
  Food: '#2563eb',
  Housing: '#0f172a',
  Transportation: '#0891b2',
  Utilities: '#4f46e5',
  Healthcare: '#dc2626',
  Entertainment: '#d97706',
  Shopping: '#7c3aed',
  Education: '#059669',
  Salary: '#16a34a',
  Freelance: '#0d9488',
  Investments: '#0284c7',
  Gift: '#65a30d',
  Refund: '#0ea5e9',
  Other: '#64748b',
};

export function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#64748b';
}

/**
 * Validates transaction form input independently of DOM/storage.
 * @param {object} data
 * @returns {{ valid: boolean, errors: object, sanitized: object }}
 */
export function validateTransactionInput(data) {
  const errors = {};
  const type = data.type === 'income' ? 'income' : 'expense';
  const title = String(data.title || '').trim();
  const amount = Number(data.amount);
  const category = String(data.category || '').trim();
  const date = String(data.date || '').trim();
  const description = String(data.description || '').trim();

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length > 80) {
    errors.title = 'Title must be 80 characters or fewer.';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than $0.00.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount exceeds maximum supported value.';
  }

  const validCats = TRANSACTION_CATEGORIES[type];
  if (!category || !validCats.includes(category)) {
    errors.category = 'Please select a valid category.';
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Please select a valid date.';
  } else {
    const parsedDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      errors.date = 'Please select a valid calendar date.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      title,
      amount: Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0,
      category,
      type,
      date,
      description,
    },
  };
}

/**
 * Filters and sorts transactions without mutating the source array.
 * @param {Array<object>} transactions
 * @param {object} options
 * @returns {Array<object>}
 */
export function filterAndSortTransactions(
  transactions,
  { search = '', type = 'all', category = 'all', sortBy = 'date-desc' } = {}
) {
  const query = search.trim().toLowerCase();

  const filtered = transactions.filter((tx) => {
    if (type !== 'all' && tx.type !== type) return false;
    if (category !== 'all' && tx.category !== category) return false;

    if (query) {
      const haystack = `${tx.title} ${tx.description} ${tx.category} ${tx.amount}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
      case 'amount-desc':
        return b.amount - a.amount || b.date.localeCompare(a.date);
      case 'amount-asc':
        return a.amount - b.amount || b.date.localeCompare(a.date);
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
    }
  });
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Controller for Transaction History view and Add/Edit/Delete Modals.
 */
export function createTransactionsController({ formatCurrency, formatDate, getTodayISO, onDataChanged, showToast, refreshIcons }) {
  const state = {
    search: '',
    type: 'all',
    category: 'all',
    sortBy: 'date-desc',
    pendingDeleteId: null,
  };

  // DOM References
  const searchInput = document.getElementById('tx-search');
  const typeButtons = document.querySelectorAll('[data-type-filter]');
  const categorySelect = document.getElementById('tx-filter-category');
  const sortSelect = document.getElementById('tx-sort');
  const tableBody = document.getElementById('tx-table-body');
  const emptyState = document.getElementById('tx-empty-state');
  const emptyTitle = document.getElementById('tx-empty-title');
  const emptyDesc = document.getElementById('tx-empty-desc');
  const clearFiltersBtn = document.getElementById('btn-clear-filters');
  const resultsSummary = document.getElementById('tx-results-summary');

  // Add/Edit Modal DOM
  const txModal = document.getElementById('transaction-modal');
  const txModalTitle = document.getElementById('modal-tx-title');
  const txForm = document.getElementById('transaction-form');
  const txIdInput = document.getElementById('tx-id');
  const txTypeInput = document.getElementById('tx-type');
  const txTitleInput = document.getElementById('tx-title');
  const txAmountInput = document.getElementById('tx-amount');
  const txCategorySelect = document.getElementById('tx-category');
  const txDateInput = document.getElementById('tx-date');
  const txDescInput = document.getElementById('tx-description');
  const formTypeButtons = document.querySelectorAll('[data-form-type]');
  const closeTxModalBtn = document.getElementById('btn-close-tx-modal');
  const cancelTxModalBtn = document.getElementById('btn-cancel-tx-modal');
  const submitTxBtn = document.getElementById('btn-submit-tx');

  // Delete Modal DOM
  const deleteModal = document.getElementById('delete-modal');
  const deleteTxName = document.getElementById('delete-tx-name');
  const closeDeleteBtn = document.getElementById('btn-close-delete-modal');
  const cancelDeleteBtn = document.getElementById('btn-cancel-delete');
  const confirmDeleteBtn = document.getElementById('btn-confirm-delete');

  function populateFilterCategories() {
    const current = categorySelect.value;
    const options = ['<option value="all">All Categories</option>'];
    ALL_CATEGORIES.forEach((cat) => {
      options.push(`<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`);
    });
    categorySelect.innerHTML = options.join('');
    if (ALL_CATEGORIES.includes(current)) {
      categorySelect.value = current;
    }
  }

  function populateFormCategories(type, selectedCategory = '') {
    const categories = TRANSACTION_CATEGORIES[type] || TRANSACTION_CATEGORIES.expense;
    txCategorySelect.innerHTML = categories
      .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
      .join('');
    if (selectedCategory && categories.includes(selectedCategory)) {
      txCategorySelect.value = selectedCategory;
    } else {
      txCategorySelect.value = categories[0];
    }
  }

  function setFormType(type, preserveCategory = false) {
    const normalized = type === 'income' ? 'income' : 'expense';
    txTypeInput.value = normalized;
    formTypeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.formType === normalized);
    });
    populateFormCategories(normalized, preserveCategory ? txCategorySelect.value : '');
  }

  function clearFormErrors() {
    ['title', 'amount', 'category', 'date'].forEach((field) => {
      const errEl = document.getElementById(`err-tx-${field}`);
      const inputEl = document.getElementById(`tx-${field}`);
      if (errEl) {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }
      if (inputEl) {
        inputEl.classList.remove('input-invalid');
      }
    });
  }

  function displayFormErrors(errors) {
    Object.entries(errors).forEach(([field, message]) => {
      const errEl = document.getElementById(`err-tx-${field}`);
      const inputEl = document.getElementById(`tx-${field}`);
      if (errEl) {
        errEl.textContent = message;
        errEl.classList.remove('hidden');
      }
      if (inputEl) {
        inputEl.classList.add('input-invalid');
      }
    });
  }

  function openTransactionModal(mode = 'add', txId = null, defaultType = 'expense') {
    clearFormErrors();
    txForm.reset();

    if (mode === 'edit' && txId) {
      const tx = getTransactionById(txId);
      if (!tx) return;
      txModalTitle.textContent = 'Edit Transaction';
      submitTxBtn.textContent = 'Update Transaction';
      txIdInput.value = tx.id;
      setFormType(tx.type);
      txTitleInput.value = tx.title;
      txAmountInput.value = tx.amount.toFixed(2);
      txCategorySelect.value = tx.category;
      txDateInput.value = tx.date;
      txDescInput.value = tx.description || '';
    } else {
      txModalTitle.textContent = 'Add Transaction';
      submitTxBtn.textContent = 'Save Transaction';
      txIdInput.value = '';
      setFormType(defaultType);
      txDateInput.value = getTodayISO();
    }

    txModal.classList.remove('hidden');
    txTitleInput.focus();
  }

  function closeTransactionModal() {
    txModal.classList.add('hidden');
    clearFormErrors();
  }

  function openDeleteModal(txId) {
    const tx = getTransactionById(txId);
    if (!tx) return;
    state.pendingDeleteId = txId;
    deleteTxName.textContent = `"${tx.title}" (${formatCurrency(tx.amount)})`;
    deleteModal.classList.remove('hidden');
    confirmDeleteBtn.focus();
  }

  function closeDeleteModal() {
    state.pendingDeleteId = null;
    deleteModal.classList.add('hidden');
  }

  function hasActiveFilters() {
    return (
      state.search.trim() !== '' ||
      state.type !== 'all' ||
      state.category !== 'all'
    );
  }

  function resetFilters() {
    state.search = '';
    state.type = 'all';
    state.category = 'all';
    searchInput.value = '';
    categorySelect.value = 'all';
    typeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.typeFilter === 'all');
    });
    render();
  }

  function render() {
    const allTransactions = getTransactions();
    const filtered = filterAndSortTransactions(allTransactions, state);

    const netSum = filtered.reduce(
      (acc, tx) => (tx.type === 'income' ? acc + tx.amount : acc - tx.amount),
      0
    );

    resultsSummary.textContent =
      allTransactions.length === 0
        ? 'No recorded transactions yet.'
        : `Showing ${filtered.length} of ${allTransactions.length} transactions · Net ${netSum >= 0 ? '+' : '-'}${formatCurrency(Math.abs(netSum))}`;

    if (filtered.length === 0) {
      tableBody.innerHTML = '';
      emptyState.classList.remove('hidden');
      if (hasActiveFilters() && allTransactions.length > 0) {
        emptyTitle.textContent = 'No matching transactions found';
        emptyDesc.textContent = 'Try adjusting your search keywords or filter selections.';
        clearFiltersBtn.classList.remove('hidden');
      } else {
        emptyTitle.textContent = 'No transactions recorded yet';
        emptyDesc.textContent = 'Add your first income or expense entry to get started.';
        clearFiltersBtn.classList.add('hidden');
      }
      refreshIcons();
      return;
    }

    emptyState.classList.add('hidden');
    tableBody.innerHTML = filtered
      .map((tx) => {
        const isIncome = tx.type === 'income';
        const signedAmount = `${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}`;
        const descMarkup = tx.description
          ? `<span class="tx-desc" title="${escapeHtml(tx.description)}">${escapeHtml(tx.description)}</span>`
          : '';

        return `
          <tr>
            <td class="tx-date-cell tabular-nums">${escapeHtml(formatDate(tx.date))}</td>
            <td>
              <div class="tx-title-cell">
                <span class="tx-name">${escapeHtml(tx.title)}</span>
                ${descMarkup}
              </div>
            </td>
            <td class="tx-category-cell">${escapeHtml(tx.category)}</td>
            <td class="tx-type-text ${isIncome ? 'text-income' : 'text-secondary'}">${isIncome ? 'Income' : 'Expense'}</td>
            <td class="text-right tx-amount tabular-nums ${isIncome ? 'text-income' : 'text-expense'}">${signedAmount}</td>
            <td class="text-right">
              <div class="row-actions">
                <button type="button" class="icon-btn" data-edit-id="${escapeHtml(tx.id)}" aria-label="Edit ${escapeHtml(tx.title)}" title="Edit transaction">
                  <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="icon-btn icon-btn-danger" data-delete-id="${escapeHtml(tx.id)}" aria-label="Delete ${escapeHtml(tx.title)}" title="Delete transaction">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    refreshIcons();
  }

  function exportCSV() {
    const transactions = filterAndSortTransactions(getTransactions(), state);
    if (transactions.length === 0) {
      showToast('No transactions available to export.', 'warning');
      return;
    }

    const header = ['ID', 'Date', 'Title', 'Type', 'Category', 'Amount', 'Description'];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = transactions.map((tx) =>
      [tx.id, tx.date, tx.title, tx.type, tx.category, tx.amount.toFixed(2), tx.description]
        .map(escapeCsv)
        .join(',')
    );

    const csvContent = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledgerflow-transactions-${getTodayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${transactions.length} transactions to CSV.`, 'success');
  }

  // Bind Event Listeners
  function bindEvents() {
    populateFilterCategories();

    searchInput.addEventListener('input', (e) => {
      state.search = e.target.value;
      render();
    });

    typeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.type = btn.dataset.typeFilter;
        typeButtons.forEach((b) => b.classList.toggle('active', b === btn));
        render();
      });
    });

    categorySelect.addEventListener('change', (e) => {
      state.category = e.target.value;
      render();
    });

    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      render();
    });

    clearFiltersBtn.addEventListener('click', resetFilters);

    tableBody.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-id]');
      if (editBtn) {
        openTransactionModal('edit', editBtn.dataset.editId);
        return;
      }
      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn) {
        openDeleteModal(delBtn.dataset.deleteId);
      }
    });

    formTypeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        setFormType(btn.dataset.formType);
      });
    });

    txForm.addEventListener('submit', (e) => {
      e.preventDefault();
      clearFormErrors();

      const payload = {
        type: txTypeInput.value,
        title: txTitleInput.value,
        amount: txAmountInput.value,
        category: txCategorySelect.value,
        date: txDateInput.value,
        description: txDescInput.value,
      };

      const validation = validateTransactionInput(payload);
      if (!validation.valid) {
        displayFormErrors(validation.errors);
        return;
      }

      const existingId = txIdInput.value.trim();
      if (existingId) {
        updateTransaction(existingId, validation.sanitized);
        closeTransactionModal();
        showToast('Transaction updated.', 'success');
      } else {
        saveTransaction(validation.sanitized);
        closeTransactionModal();
        showToast('Transaction added.', 'success');
      }

      onDataChanged();
    });

    closeTxModalBtn.addEventListener('click', closeTransactionModal);
    cancelTxModalBtn.addEventListener('click', closeTransactionModal);
    txModal.addEventListener('click', (e) => {
      if (e.target === txModal) closeTransactionModal();
    });

    closeDeleteBtn.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });

    confirmDeleteBtn.addEventListener('click', () => {
      if (!state.pendingDeleteId) return;
      deleteTransaction(state.pendingDeleteId);
      closeDeleteModal();
      showToast('Transaction deleted.', 'success');
      onDataChanged();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!txModal.classList.contains('hidden')) closeTransactionModal();
        if (!deleteModal.classList.contains('hidden')) closeDeleteModal();
      }
    });
  }

  bindEvents();

  return {
    render,
    openTransactionModal,
    exportCSV,
  };
}
