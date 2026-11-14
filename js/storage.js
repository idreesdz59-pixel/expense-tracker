/**
 * storage.js — Centralized Data Persistence Layer (LocalStorage Repository)
 *
 * Isolates all browser LocalStorage operations from UI rendering and financial
 * calculations. Designed with a clean repository interface so each method can
 * later be swapped to async REST API calls (e.g., fetch('/api/transactions'))
 * against a Node.js + Express + SQL backend without altering UI modules.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerflow_transactions_v1',
  BUDGET: 'ledgerflow_budget_v1',
  INITIALIZED: 'ledgerflow_initialized_v1',
};

/**
 * Generates a unique transaction identifier.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalizes a transaction object to enforce consistent schema across storage.
 * @param {object} raw
 * @returns {object}
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateId()),
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || ''),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Formats a Date offset by deltaMonths into YYYY-MM-DD.
 * @param {number} deltaMonths
 * @param {number} day
 * @returns {string}
 */
function buildRelativeDate(deltaMonths, day) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + deltaMonths, 1);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(day, maxDay);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Builds realistic initial sample records anchored to the current month
 * so charts and summaries work dynamically on first load.
 * @returns {Array<object>}
 */
function createDefaultTransactions() {
  return [
    // Current month
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5400.0,
      category: 'Salary',
      type: 'income',
      date: buildRelativeDate(0, 1),
      description: 'Primary monthly payroll deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: buildRelativeDate(0, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Grocery Shopping',
      amount: 285.4,
      category: 'Food',
      type: 'expense',
      date: buildRelativeDate(0, 5),
      description: 'Weekly groceries and household staples',
    },
    {
      id: generateId(),
      title: 'Electric & Internet',
      amount: 164.8,
      category: 'Utilities',
      type: 'expense',
      date: buildRelativeDate(0, 7),
      description: 'Monthly utility and fiber internet bills',
    },
    {
      id: generateId(),
      title: 'UI Consulting Milestone',
      amount: 850.0,
      category: 'Freelance',
      type: 'income',
      date: buildRelativeDate(0, 9),
      description: 'Design system audit deliverable',
    },
    {
      id: generateId(),
      title: 'Transit & Fuel',
      amount: 148.5,
      category: 'Transportation',
      type: 'expense',
      date: buildRelativeDate(0, 10),
      description: 'Commuter pass and fuel refill',
    },
    {
      id: generateId(),
      title: 'Pharmacy & Dental Checkup',
      amount: 210.0,
      category: 'Healthcare',
      type: 'expense',
      date: buildRelativeDate(0, 11),
      description: 'Routine checkup copay and prescriptions',
    },
    {
      id: generateId(),
      title: 'Dining & Coffee',
      amount: 132.25,
      category: 'Food',
      type: 'expense',
      date: buildRelativeDate(0, 12),
      description: 'Team lunch and weekend coffee',
    },
    // Previous months (-1 to -4)
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5400.0,
      category: 'Salary',
      type: 'income',
      date: buildRelativeDate(-1, 1),
      description: 'Primary monthly payroll deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: buildRelativeDate(-1, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Groceries & Produce',
      amount: 420.6,
      category: 'Food',
      type: 'expense',
      date: buildRelativeDate(-1, 14),
      description: 'October grocery runs',
    },
    {
      id: generateId(),
      title: 'Streaming & Books',
      amount: 98.0,
      category: 'Entertainment',
      type: 'expense',
      date: buildRelativeDate(-1, 19),
      description: 'Subscriptions and technical books',
    },
    {
      id: generateId(),
      title: 'Winter Jacket & Footwear',
      amount: 315.0,
      category: 'Shopping',
      type: 'expense',
      date: buildRelativeDate(-1, 22),
      description: 'Seasonal apparel',
    },
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5200.0,
      category: 'Salary',
      type: 'income',
      date: buildRelativeDate(-2, 1),
      description: 'Primary monthly payroll deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: buildRelativeDate(-2, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Groceries & Dining',
      amount: 390.0,
      category: 'Food',
      type: 'expense',
      date: buildRelativeDate(-2, 12),
      description: 'Weekly groceries and dining out',
    },
    {
      id: generateId(),
      title: 'Online Course Subscription',
      amount: 180.0,
      category: 'Education',
      type: 'expense',
      date: buildRelativeDate(-2, 18),
      description: 'Annual architecture workshop',
    },
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5200.0,
      category: 'Salary',
      type: 'income',
      date: buildRelativeDate(-3, 1),
      description: 'Primary monthly payroll deposit',
    },
    {
      id: generateId(),
      title: 'Dividend Payout',
      amount: 320.0,
      category: 'Investments',
      type: 'income',
      date: buildRelativeDate(-3, 15),
      description: 'Quarterly index fund dividend',
    },
    {
      id: generateId(),
      title: 'Housing & Utilities',
      amount: 1620.0,
      category: 'Housing',
      type: 'expense',
      date: buildRelativeDate(-3, 3),
      description: 'Rent and summer cooling bill',
    },
    {
      id: generateId(),
      title: 'Food & Household',
      amount: 465.0,
      category: 'Food',
      type: 'expense',
      date: buildRelativeDate(-3, 16),
      description: 'Groceries and household supplies',
    },
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5200.0,
      category: 'Salary',
      type: 'income',
      date: buildRelativeDate(-4, 1),
      description: 'Primary monthly payroll deposit',
    },
    {
      id: generateId(),
      title: 'Housing & Lease',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: buildRelativeDate(-4, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Car Maintenance & Fuel',
      amount: 340.0,
      category: 'Transportation',
      type: 'expense',
      date: buildRelativeDate(-4, 14),
      description: 'Scheduled tire rotation and fuel',
    },
  ];
}

function createDefaultBudget() {
  return {
    monthlyLimit: 3500.0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Seeds LocalStorage once on very first application visit.
 */
export function initializeStorage() {
  try {
    const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!initialized) {
      const defaults = createDefaultTransactions();
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(defaults));
      localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(createDefaultBudget()));
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  } catch (err) {
    console.error('Failed to initialize LocalStorage:', err);
  }
}

/**
 * Retrieves all stored transactions.
 * Future REST equivalent: GET /api/transactions
 * @returns {Array<object>}
 */
export function getTransactions() {
  initializeStorage();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransaction);
  } catch (err) {
    console.error('Failed to read transactions from LocalStorage:', err);
    return [];
  }
}

/**
 * Finds a single transaction by ID.
 * Future REST equivalent: GET /api/transactions/:id
 * @param {string} id
 * @returns {object|null}
 */
export function getTransactionById(id) {
  const list = getTransactions();
  return list.find((tx) => tx.id === id) || null;
}

/**
 * Saves a new transaction to LocalStorage.
 * Future REST equivalent: POST /api/transactions
 * @param {object} transactionData
 * @returns {object}
 */
export function saveTransaction(transactionData) {
  const list = getTransactions();
  const newTx = normalizeTransaction({
    ...transactionData,
    id: transactionData.id || generateId(),
  });
  list.push(newTx);
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(list));
  return newTx;
}

/**
 * Updates an existing transaction by ID.
 * Future REST equivalent: PUT /api/transactions/:id
 * @param {string} id
 * @param {object} updates
 * @returns {object|null}
 */
export function updateTransaction(id, updates) {
  const list = getTransactions();
  const index = list.findIndex((tx) => tx.id === id);
  if (index === -1) return null;

  const updatedTx = normalizeTransaction({
    ...list[index],
    ...updates,
    id,
  });
  list[index] = updatedTx;
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(list));
  return updatedTx;
}

/**
 * Deletes a transaction by ID.
 * Future REST equivalent: DELETE /api/transactions/:id
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTransaction(id) {
  const list = getTransactions();
  const filtered = list.filter((tx) => tx.id !== id);
  if (filtered.length === list.length) return false;
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(filtered));
  return true;
}

/**
 * Retrieves budget configuration.
 * Future REST equivalent: GET /api/budget
 * @returns {{ monthlyLimit: number, updatedAt: string }}
 */
export function getBudget() {
  initializeStorage();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGET);
    if (!raw) return { monthlyLimit: 0, updatedAt: new Date().toISOString() };
    const parsed = JSON.parse(raw);
    return {
      monthlyLimit: Math.max(0, Number(parsed.monthlyLimit || 0)),
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
    };
  } catch (err) {
    console.error('Failed to read budget from LocalStorage:', err);
    return { monthlyLimit: 0, updatedAt: new Date().toISOString() };
  }
}

/**
 * Persists monthly budget configuration.
 * Future REST equivalent: PUT /api/budget
 * @param {{ monthlyLimit: number }} budgetData
 * @returns {{ monthlyLimit: number, updatedAt: string }}
 */
export function saveBudget(budgetData) {
  const next = {
    monthlyLimit: Math.max(0, Number(Number(budgetData.monthlyLimit || 0).toFixed(2))),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(next));
  return next;
}

/**
 * Restores realistic sample data in LocalStorage.
 */
export function resetSampleData() {
  const defaults = createDefaultTransactions();
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(defaults));
  localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(createDefaultBudget()));
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}
