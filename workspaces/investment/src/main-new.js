import './style.css'

function loadState() {
  const saved = localStorage.getItem('investmentState');
  if (saved) {
    const state = JSON.parse(saved);
    // Migration: Add company ownership if not present
    if (!state.companyShares && state.totalInitialInvestment > 0) {
      state.companyShares = 100;
      Object.values(state.shareholders).forEach(s => {
        state.companyShares -= s.percentage;
      });
    }
    return state;
  }
  return {
    companyValuation: 0,  // Total company valuation
    companyShares: 100,    // Percentage of shares owned by company (unallocated)
    shareholders: {},      // Individual shareholders
    transactions: [],      // All transactions (income/expenses)
    shareTransactions: [], // Share buy/sell transactions
    currentValue: 0       // Current total value
  };
}

function saveState() {
  localStorage.setItem('investmentState', JSON.stringify(state));
}

let state = loadState();
let currentInvestor = 'all';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function updateOwnershipChart() {
  const canvas = document.getElementById('pieChart');
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 10;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let startAngle = -Math.PI / 2;
  const colors = ['#95a5a6', '#4a90e2', '#50c878', '#ff6b6b', '#ffd700', '#9370db', '#ff9f40', '#20b2aa', '#ff69b4'];
  let colorIndex = 0;

  // Draw company shares first (unallocated)
  if (state.companyShares > 0) {
    const angle = (state.companyShares / 100) * Math.PI * 2;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = colors[0]; // Gray for unallocated
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const labelAngle = startAngle + angle / 2;
    const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
    const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (state.companyShares > 5) {
      ctx.fillText('Unallocated', labelX, labelY - 10);
      ctx.fillText(`${state.companyShares.toFixed(1)}%`, labelX, labelY + 10);
    }

    startAngle += angle;
    colorIndex = 1; // Start shareholder colors from index 1
  }

  // Draw shareholder shares
  Object.entries(state.shareholders).forEach(([name, data]) => {
    if (data.percentage > 0) {
      const angle = (data.percentage / 100) * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
      ctx.closePath();
      ctx.fillStyle = colors[colorIndex % colors.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      const labelAngle = startAngle + angle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
      const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (data.percentage > 5) {
        ctx.fillText(`${name}`, labelX, labelY - 10);
        ctx.fillText(`${data.percentage.toFixed(1)}%`, labelX, labelY + 10);
      }

      startAngle += angle;
      colorIndex++;
    }
  });
}

function calculateInvestorProfit(name) {
  const investor = state.shareholders[name];
  if (!investor) return { invested: 0, currentValue: 0, profit: 0, roi: 0 };

  const currentValue = (investor.percentage / 100) * state.currentValue;
  const profit = currentValue - investor.totalInvested;
  const roi = investor.totalInvested > 0 ? (profit / investor.totalInvested) * 100 : 0;

  return {
    invested: investor.totalInvested,
    currentValue: currentValue,
    profit: profit,
    roi: roi
  };
}

function updateShareholdersList() {
  const list = document.getElementById('shareholders-list');
  list.innerHTML = '<h3>Ownership Structure</h3>';

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Shareholder</th>
        <th>Ownership %</th>
        <th>Investment</th>
        <th>Current Value</th>
        <th>Profit/Loss</th>
        <th>ROI</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  // Add company row
  const companyRow = document.createElement('tr');
  companyRow.className = 'company-row';
  companyRow.innerHTML = `
    <td>Company (Unallocated)</td>
    <td>${state.companyShares.toFixed(1)}%</td>
    <td>-</td>
    <td>${formatCurrency((state.companyShares / 100) * state.currentValue)}</td>
    <td>-</td>
    <td>-</td>
  `;
  tbody.appendChild(companyRow);

  // Add shareholder rows
  Object.entries(state.shareholders).forEach(([name, data]) => {
    if (data.percentage > 0) {
      const stats = calculateInvestorProfit(name);
      const profitClass = stats.profit >= 0 ? 'gain' : 'loss';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${name}</td>
        <td>${data.percentage.toFixed(1)}%</td>
        <td>${formatCurrency(stats.invested)}</td>
        <td>${formatCurrency(stats.currentValue)}</td>
        <td class="${profitClass}">${formatCurrency(stats.profit)}</td>
        <td class="${profitClass}">${stats.roi.toFixed(1)}%</td>
      `;
      tbody.appendChild(row);
    }
  });

  list.appendChild(table);

  // Add summary
  const summary = document.createElement('div');
  summary.className = 'ownership-summary';
  summary.innerHTML = `
    <div class="summary-item">
      <strong>Total Allocated:</strong> ${(100 - state.companyShares).toFixed(1)}%
    </div>
    <div class="summary-item">
      <strong>Available for Purchase:</strong> ${state.companyShares.toFixed(1)}%
    </div>
  `;
  list.appendChild(summary);
}

function updateTimeline() {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '<h3>Transaction History</h3>';

  const allTransactions = [
    ...state.transactions.map(t => ({ ...t, category: 'operation' })),
    ...state.shareTransactions.map(t => ({ ...t, category: 'shares' }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (allTransactions.length === 0) {
    timeline.innerHTML += '<p>No transactions yet</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'timeline-list';

  allTransactions.forEach((transaction, index) => {
    const item = document.createElement('div');
    const transactionDate = new Date(transaction.date);
    const dateStr = transactionDate.toLocaleDateString();
    const timeStr = transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (transaction.category === 'shares') {
      const typeClass = transaction.type === 'buy' ? 'income' : 'expense';
      item.className = `timeline-item ${typeClass}`;
      
      const counterparty = transaction.seller === 'Company' ? 'Company Treasury' : transaction.seller;
      const action = transaction.type === 'buy' ? 'purchased from' : 'sold to';
      
      item.innerHTML = `
        <div class="timeline-date">${dateStr} at ${timeStr}</div>
        <div class="timeline-content">
          <div class="timeline-main">
            <div class="timeline-left">
              <span class="timeline-type">[Share ${transaction.type === 'buy' ? 'Purchase' : 'Sale'}]</span>
              <span class="timeline-description">${transaction.buyer} ${action} ${counterparty}</span>
            </div>
            <div class="timeline-right">
              <span class="timeline-amount">${transaction.percentage.toFixed(1)}% for ${formatCurrency(transaction.amount)}</span>
              <span class="timeline-balance">@ ${formatCurrency(transaction.pricePerPercent)}/1%</span>
            </div>
          </div>
          <div class="transaction-actions">
            <button class="delete-btn" onclick="deleteShareTransaction(${state.shareTransactions.indexOf(transaction)})">Delete</button>
          </div>
        </div>
      `;
    } else {
      // Regular transaction
      item.className = `timeline-item ${transaction.direction}`;
      const directionLabel = transaction.direction === 'income' ? '+' : '-';
      
      item.innerHTML = `
        <div class="timeline-date">${dateStr} at ${timeStr}</div>
        <div class="timeline-content">
          <div class="timeline-main">
            <div class="timeline-left">
              <span class="timeline-type">[Company ${transaction.direction === 'income' ? 'Income' : 'Expense'}]</span>
              <span class="timeline-description">${transaction.description}</span>
            </div>
            <div class="timeline-right">
              <span class="timeline-amount ${transaction.direction}">${directionLabel}${formatCurrency(Math.abs(transaction.amount))}</span>
              <span class="timeline-balance">Balance: ${formatCurrency(transaction.newValue)}</span>
            </div>
          </div>
          <div class="transaction-actions">
            <button class="delete-btn" onclick="deleteTransaction(${state.transactions.indexOf(transaction)})">Delete</button>
          </div>
        </div>
      `;
    }

    list.appendChild(item);
  });

  timeline.appendChild(list);
}

function updateTotal() {
  document.getElementById('total').textContent = formatCurrency(state.currentValue).replace('$', '');
  document.getElementById('company-valuation').textContent = formatCurrency(state.companyValuation).replace('$', '');
  
  const availableElement = document.getElementById('available-shares');
  if (availableElement) {
    availableElement.textContent = `${state.companyShares.toFixed(1)}%`;
  }
}

function setCompanyValuation() {
  const input = document.getElementById('company-valuation-input');
  const value = parseFloat(input.value);
  
  if (!value || value <= 0) {
    alert('Please enter a valid valuation amount');
    return;
  }

  state.companyValuation = value;
  state.currentValue = value;
  
  saveState();
  updateTotal();
  updateShareholdersList();
  updateOwnershipChart();
  updateCalculatedValue();
  
  // Hide setup section, show main sections
  document.getElementById('setup-section').style.display = 'none';
  document.querySelectorAll('.main-section').forEach(section => {
    section.style.display = 'block';
  });
}

function buyShares() {
  const nameInput = document.getElementById('investor-name');
  const percentageInput = document.getElementById('share-percentage');
  const dateInput = document.getElementById('share-date');

  const name = nameInput.value.trim();
  const percentage = parseFloat(percentageInput.value);
  const dateValue = dateInput.value;

  if (!name || !percentage || !dateValue) {
    alert('Please fill in all fields');
    return;
  }

  if (state.companyValuation === 0) {
    alert('Please set company valuation first');
    return;
  }

  if (percentage > state.companyShares) {
    alert(`Only ${state.companyShares.toFixed(1)}% shares are available from the company`);
    return;
  }

  const pricePerPercent = state.currentValue / 100;
  const totalCost = percentage * pricePerPercent;

  // Create or update buyer
  if (!state.shareholders[name]) {
    state.shareholders[name] = {
      percentage: 0,
      totalInvested: 0,
      transactions: []
    };
  }

  // Record transaction
  const transaction = {
    type: 'buy',
    buyer: name,
    seller: 'Company',
    percentage: percentage,
    amount: totalCost,
    pricePerPercent: pricePerPercent,
    date: new Date(dateValue).toISOString(),
    companyValue: state.currentValue
  };

  // Update ownership
  state.shareholders[name].percentage += percentage;
  state.shareholders[name].totalInvested += totalCost;
  state.shareholders[name].transactions.push(transaction);
  state.companyShares -= percentage;

  // Add to share transactions
  state.shareTransactions.push(transaction);

  // Clear inputs
  nameInput.value = '';
  percentageInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  saveState();
  updateOwnershipChart();
  updateShareholdersList();
  updateTimeline();
  updateInvestorSelector();
  updateCalculatedValue();
}

function sellShares() {
  const nameInput = document.getElementById('investor-name');
  const percentageInput = document.getElementById('share-percentage');
  const dateInput = document.getElementById('share-date');

  const name = nameInput.value.trim();
  const percentage = parseFloat(percentageInput.value);
  const dateValue = dateInput.value;

  if (!name || !percentage || !dateValue) {
    alert('Please fill in all fields');
    return;
  }

  if (!state.shareholders[name]) {
    alert(`${name} is not a shareholder`);
    return;
  }

  if (state.shareholders[name].percentage < percentage) {
    alert(`${name} only owns ${state.shareholders[name].percentage.toFixed(1)}%`);
    return;
  }

  const pricePerPercent = state.currentValue / 100;
  const saleAmount = percentage * pricePerPercent;

  // Record transaction
  const transaction = {
    type: 'sell',
    buyer: 'Company',
    seller: name,
    percentage: percentage,
    amount: saleAmount,
    pricePerPercent: pricePerPercent,
    date: new Date(dateValue).toISOString(),
    companyValue: state.currentValue
  };

  // Update ownership (shares go back to company)
  state.shareholders[name].percentage -= percentage;
  state.shareholders[name].totalInvested -= saleAmount;
  state.shareholders[name].transactions.push(transaction);
  state.companyShares += percentage;

  // Remove shareholder if they have 0%
  if (state.shareholders[name].percentage === 0) {
    delete state.shareholders[name];
  }

  // Add to share transactions
  state.shareTransactions.push(transaction);

  // Clear inputs
  nameInput.value = '';
  percentageInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  saveState();
  updateOwnershipChart();
  updateShareholdersList();
  updateTimeline();
  updateInvestorSelector();
  updateCalculatedValue();
}

function addTransaction() {
  const directionSelect = document.getElementById('transaction-direction');
  const amountInput = document.getElementById('transaction-amount');
  const descriptionInput = document.getElementById('transaction-description');
  const dateInput = document.getElementById('transaction-date');

  const direction = directionSelect.value;
  const amount = parseFloat(amountInput.value);
  const description = descriptionInput.value.trim();
  const dateValue = dateInput.value;

  if (!amount || !description || !dateValue) {
    alert('Please fill in all fields');
    return;
  }

  let newValue = state.currentValue;

  if (direction === 'expense') {
    newValue -= amount;
  } else {
    newValue += amount;
  }

  if (newValue < 0) {
    alert('Transaction would result in negative value');
    return;
  }

  state.currentValue = newValue;

  state.transactions.push({
    direction,
    amount: direction === 'expense' ? -amount : amount,
    description,
    date: new Date(dateValue).toISOString(),
    newValue
  });

  // Clear inputs
  amountInput.value = '';
  descriptionInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  saveState();
  updateTotal();
  updateShareholdersList();
  updateTimeline();
  updateCalculatedValue();
}

function deleteTransaction(index) {
  if (!confirm('Are you sure you want to delete this transaction?')) return;
  
  state.transactions.splice(index, 1);
  
  // Recalculate value
  state.currentValue = state.companyValuation;
  state.transactions.forEach(t => {
    state.currentValue += t.amount;
    t.newValue = state.currentValue;
  });
  
  saveState();
  updateTotal();
  updateShareholdersList();
  updateTimeline();
  updateCalculatedValue();
}

function deleteShareTransaction(index) {
  if (!confirm('Are you sure you want to delete this share transaction?')) return;
  
  const transaction = state.shareTransactions[index];
  
  if (transaction.type === 'buy') {
    // Reverse buy: shares go back to company
    if (state.shareholders[transaction.buyer]) {
      state.shareholders[transaction.buyer].percentage -= transaction.percentage;
      state.shareholders[transaction.buyer].totalInvested -= transaction.amount;
      
      // Remove from their transactions
      const tIndex = state.shareholders[transaction.buyer].transactions.findIndex(
        t => t.date === transaction.date && t.percentage === transaction.percentage
      );
      if (tIndex !== -1) {
        state.shareholders[transaction.buyer].transactions.splice(tIndex, 1);
      }
      
      // Remove shareholder if 0%
      if (state.shareholders[transaction.buyer].percentage === 0) {
        delete state.shareholders[transaction.buyer];
      }
    }
    state.companyShares += transaction.percentage;
  } else {
    // Reverse sell: shares go back to seller
    if (!state.shareholders[transaction.seller]) {
      state.shareholders[transaction.seller] = {
        percentage: 0,
        totalInvested: 0,
        transactions: []
      };
    }
    state.shareholders[transaction.seller].percentage += transaction.percentage;
    state.shareholders[transaction.seller].totalInvested += transaction.amount;
    state.companyShares -= transaction.percentage;
  }
  
  state.shareTransactions.splice(index, 1);
  
  saveState();
  updateOwnershipChart();
  updateShareholdersList();
  updateTimeline();
  updateInvestorSelector();
}

function updateInvestorSelector() {
  const selector = document.getElementById('current-investor');
  const currentValue = selector.value;

  selector.innerHTML = '<option value="all">All Investors</option>';

  Object.keys(state.shareholders).forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    selector.appendChild(option);
  });

  if (currentValue && Array.from(selector.options).some(opt => opt.value === currentValue)) {
    selector.value = currentValue;
  }
}

function updateInvestorView() {
  const investorView = document.getElementById('investor-view');

  if (currentInvestor === 'all') {
    investorView.style.display = 'none';
    return;
  }

  investorView.style.display = 'block';

  const investor = state.shareholders[currentInvestor];
  if (!investor) return;

  document.getElementById('investor-name-display').textContent = currentInvestor;

  const stats = calculateInvestorProfit(currentInvestor);

  document.getElementById('personal-invested').textContent = formatCurrency(stats.invested);
  document.getElementById('personal-value').textContent = formatCurrency(stats.currentValue);

  const profitElement = document.getElementById('personal-profit');
  profitElement.textContent = formatCurrency(stats.profit);
  profitElement.className = stats.profit >= 0 ? 'stat-value gain' : 'stat-value loss';

  const roiElement = document.getElementById('personal-roi');
  roiElement.textContent = `${stats.roi.toFixed(1)}%`;
  roiElement.className = stats.roi >= 0 ? 'stat-value gain' : 'stat-value loss';

  updatePersonalTransactions();
}

function updatePersonalTransactions() {
  const container = document.getElementById('personal-transactions');
  container.innerHTML = '<h3>Your Share Transactions</h3>';

  const investor = state.shareholders[currentInvestor];
  if (!investor || !investor.transactions || investor.transactions.length === 0) {
    container.innerHTML += '<p>No transactions yet</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'timeline-list';

  investor.transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(transaction => {
    const item = document.createElement('div');
    const transactionDate = new Date(transaction.date);
    const dateStr = transactionDate.toLocaleDateString();
    const timeStr = transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const typeClass = transaction.type === 'buy' ? 'income' : 'expense';
    const action = transaction.type === 'buy' ? 'Purchased from' : 'Sold to';
    const counterparty = transaction.type === 'buy' ? 
      (transaction.seller || 'Company') : 
      (transaction.buyer || 'Company');

    item.className = `timeline-item ${typeClass}`;
    item.innerHTML = `
      <div class="timeline-date">${dateStr} at ${timeStr}</div>
      <div class="timeline-content">
        <div class="timeline-main">
          <div class="timeline-left">
            <span class="timeline-type">${action} ${counterparty}</span>
            <span class="timeline-description">${transaction.percentage.toFixed(1)}% shares</span>
          </div>
          <div class="timeline-right">
            <span class="timeline-amount">${formatCurrency(transaction.amount)}</span>
            <span class="timeline-balance">@ ${formatCurrency(transaction.pricePerPercent)}/1%</span>
          </div>
        </div>
      </div>
    `;

    list.appendChild(item);
  });

  container.appendChild(list);
}

function updateCalculatedValue() {
  const percentageInput = document.getElementById('share-percentage');
  const calculatedValueDiv = document.getElementById('calculated-value');

  const percentage = parseFloat(percentageInput.value) || 0;
  const value = (percentage / 100) * state.currentValue;

  calculatedValueDiv.textContent = `Cost: ${formatCurrency(value)} @ ${formatCurrency(state.currentValue / 100)}/1%`;
}

function resetData() {
  if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
    state = {
      companyValuation: 0,
      companyShares: 100,
      shareholders: {},
      transactions: [],
      shareTransactions: [],
      currentValue: 0
    };
    saveState();
    location.reload();
  }
}

// Make functions globally accessible
window.setCompanyValuation = setCompanyValuation;
window.buyShares = buyShares;
window.sellShares = sellShares;
window.addTransaction = addTransaction;
window.deleteTransaction = deleteTransaction;
window.deleteShareTransaction = deleteShareTransaction;
window.resetData = resetData;

function init() {
  const canvas = document.getElementById('pieChart');
  canvas.width = 300;
  canvas.height = 300;

  // Set default dates to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const nowString = now.toISOString().slice(0, 16);
  
  const shareDateInput = document.getElementById('share-date');
  const transactionDateInput = document.getElementById('transaction-date');
  if (shareDateInput) shareDateInput.value = nowString;
  if (transactionDateInput) transactionDateInput.value = nowString;

  // Event listeners
  document.getElementById('set-valuation')?.addEventListener('click', setCompanyValuation);
  document.getElementById('buy-shares')?.addEventListener('click', buyShares);
  document.getElementById('sell-shares')?.addEventListener('click', sellShares);
  document.getElementById('add-transaction')?.addEventListener('click', addTransaction);
  document.getElementById('reset-data')?.addEventListener('click', resetData);

  document.getElementById('current-investor')?.addEventListener('change', (e) => {
    currentInvestor = e.target.value;
    updateInvestorView();
  });

  document.getElementById('share-percentage')?.addEventListener('input', updateCalculatedValue);

  // Check if we need to show setup
  if (state.companyValuation === 0) {
    document.getElementById('setup-section').style.display = 'block';
    document.querySelectorAll('.main-section').forEach(section => {
      section.style.display = 'none';
    });
  } else {
    document.getElementById('setup-section').style.display = 'none';
    document.querySelectorAll('.main-section').forEach(section => {
      section.style.display = 'block';
    });
  }

  // Initial updates
  updateOwnershipChart();
  updateShareholdersList();
  updateTimeline();
  updateTotal();
  updateInvestorSelector();
  updateInvestorView();
  updateCalculatedValue();
}

document.addEventListener('DOMContentLoaded', init);