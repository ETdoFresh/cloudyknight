import './style.css'

function loadState() {
  const saved = localStorage.getItem('investmentStateShares');
  if (saved) {
    const state = JSON.parse(saved);
    // Migration from old percentage-based system if needed
    if (!state.totalShares && state.companyShares) {
      // Convert percentage to shares (e.g., 100% = 1,000,000 shares)
      state.totalShares = 1000000;
      state.treasuryShares = (state.companyShares / 100) * state.totalShares;
      
      // Convert shareholder percentages to shares
      Object.entries(state.shareholders || {}).forEach(([name, data]) => {
        data.shares = (data.percentage / 100) * state.totalShares;
        delete data.percentage;
      });
    }
    return state;
  }
  return {
    totalShares: 0,        // Total shares that exist
    treasuryShares: 0,     // Shares owned by company (available to sell)
    outstandingShares: 0,  // Shares owned by shareholders
    companyValue: 0,       // Current company value (from transactions)
    shareholders: {},      // Individual shareholders with share counts
    transactions: [],      // All transactions (income/expenses)
    shareTransactions: []  // Share buy/sell transactions
  };
}

function saveState() {
  localStorage.setItem('investmentStateShares', JSON.stringify(state));
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

function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

function getSharePrice() {
  // Share price = Company Value / Total Shares
  if (state.totalShares === 0) return 0;
  return state.companyValue / state.totalShares;
}

function getCurrentValue() {
  // Calculate the current value based on transactions up to today
  const today = new Date();
  let value = 0;
  
  // Sum all transactions up to today
  const pastTransactions = state.transactions.filter(t => new Date(t.date) <= today);
  pastTransactions.forEach(t => {
    value += t.amount; // amount is already negative for expenses
  });
  
  return value;
}

function issueShares() {
  const sharesInput = document.getElementById('issue-shares-amount');
  const priceInput = document.getElementById('issue-shares-price');
  const dateInput = document.getElementById('issue-shares-date');
  
  const shares = parseInt(sharesInput.value);
  const pricePerShare = parseFloat(priceInput.value);
  const dateValue = dateInput.value;
  
  if (!shares || shares <= 0) {
    alert('Please enter a valid number of shares');
    return;
  }
  
  if (!pricePerShare || pricePerShare <= 0) {
    alert('Please enter a valid price per share');
    return;
  }
  
  if (!dateValue) {
    alert('Please select a date');
    return;
  }
  
  // Create new shares
  state.totalShares += shares;
  state.treasuryShares += shares;
  
  // Update company value based on the issuance
  const totalValue = shares * pricePerShare;
  state.companyValue += totalValue;
  
  // Record the transaction
  state.transactions.push({
    type: 'share-issuance',
    shares: shares,
    pricePerShare: pricePerShare,
    amount: totalValue,
    date: new Date(dateValue).toISOString(),
    description: `Issued ${formatNumber(shares)} new shares at ${formatCurrency(pricePerShare)}/share`
  });
  
  // Clear inputs
  sharesInput.value = '';
  priceInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);
  
  saveState();
  updateAll();
}

function buyShares() {
  const nameInput = document.getElementById('investor-name');
  const sharesInput = document.getElementById('share-amount');
  const dateInput = document.getElementById('share-date');
  
  const name = nameInput.value.trim();
  const shares = parseInt(sharesInput.value);
  const dateValue = dateInput.value;
  
  if (!name || !shares || !dateValue) {
    alert('Please fill in all fields');
    return;
  }
  
  if (shares > state.treasuryShares) {
    alert(`Only ${formatNumber(state.treasuryShares)} shares are available from the company`);
    return;
  }
  
  const pricePerShare = getSharePrice();
  const totalCost = shares * pricePerShare;
  
  // Create or update shareholder
  if (!state.shareholders[name]) {
    state.shareholders[name] = {
      shares: 0,
      totalInvested: 0,
      transactions: []
    };
  }
  
  // Record transaction
  const transaction = {
    type: 'buy',
    buyer: name,
    seller: 'Company',
    shares: shares,
    amount: totalCost,
    pricePerShare: pricePerShare,
    date: new Date(dateValue).toISOString()
  };
  
  // Update ownership
  state.shareholders[name].shares += shares;
  state.shareholders[name].totalInvested += totalCost;
  state.shareholders[name].transactions.push(transaction);
  state.treasuryShares -= shares;
  state.outstandingShares += shares;
  
  // Add to share transactions
  state.shareTransactions.push(transaction);
  
  // Clear inputs
  nameInput.value = '';
  sharesInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);
  
  saveState();
  updateAll();
}

function sellShares() {
  const nameInput = document.getElementById('investor-name');
  const sharesInput = document.getElementById('share-amount');
  const dateInput = document.getElementById('share-date');
  
  const name = nameInput.value.trim();
  const shares = parseInt(sharesInput.value);
  const dateValue = dateInput.value;
  
  if (!name || !shares || !dateValue) {
    alert('Please fill in all fields');
    return;
  }
  
  if (!state.shareholders[name]) {
    alert(`${name} is not a shareholder`);
    return;
  }
  
  if (state.shareholders[name].shares < shares) {
    alert(`${name} only owns ${formatNumber(state.shareholders[name].shares)} shares`);
    return;
  }
  
  const pricePerShare = getSharePrice();
  const saleAmount = shares * pricePerShare;
  
  // Record transaction
  const transaction = {
    type: 'sell',
    buyer: 'Company',
    seller: name,
    shares: shares,
    amount: saleAmount,
    pricePerShare: pricePerShare,
    date: new Date(dateValue).toISOString()
  };
  
  // Update ownership (shares go back to company)
  state.shareholders[name].shares -= shares;
  state.shareholders[name].totalInvested -= saleAmount;
  state.shareholders[name].transactions.push(transaction);
  state.treasuryShares += shares;
  state.outstandingShares -= shares;
  
  // Remove shareholder if they have 0 shares
  if (state.shareholders[name].shares === 0) {
    delete state.shareholders[name];
  }
  
  // Add to share transactions
  state.shareTransactions.push(transaction);
  
  // Clear inputs
  nameInput.value = '';
  sharesInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);
  
  saveState();
  updateAll();
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
  
  let amountChange = direction === 'expense' ? -amount : amount;
  state.companyValue += amountChange;
  
  if (state.companyValue < 0) {
    alert('Transaction would result in negative company value');
    state.companyValue -= amountChange;
    return;
  }
  
  state.transactions.push({
    type: 'operation',
    direction,
    amount: amountChange,
    description,
    date: new Date(dateValue).toISOString()
  });
  
  // Clear inputs
  amountInput.value = '';
  descriptionInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);
  
  saveState();
  updateAll();
}

function updateOwnershipChart() {
  const canvas = document.getElementById('pieChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 10;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (state.totalShares === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No shares issued yet', centerX, centerY);
    return;
  }
  
  let startAngle = -Math.PI / 2;
  const colors = ['#95a5a6', '#4a90e2', '#50c878', '#ff6b6b', '#ffd700', '#9370db', '#ff9f40', '#20b2aa', '#ff69b4'];
  let colorIndex = 0;
  
  // Draw treasury shares first (unallocated)
  if (state.treasuryShares > 0) {
    const percentage = (state.treasuryShares / state.totalShares) * 100;
    const angle = (percentage / 100) * Math.PI * 2;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = colors[0]; // Gray for treasury
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
    if (percentage > 5) {
      ctx.fillText('Treasury', labelX, labelY - 10);
      ctx.fillText(`${percentage.toFixed(1)}%`, labelX, labelY + 10);
    }
    
    startAngle += angle;
    colorIndex = 1;
  }
  
  // Draw shareholder shares
  Object.entries(state.shareholders).forEach(([name, data]) => {
    if (data.shares > 0) {
      const percentage = (data.shares / state.totalShares) * 100;
      const angle = (percentage / 100) * Math.PI * 2;
      
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
      if (percentage > 5) {
        ctx.fillText(`${name}`, labelX, labelY - 10);
        ctx.fillText(`${percentage.toFixed(1)}%`, labelX, labelY + 10);
      }
      
      startAngle += angle;
      colorIndex++;
    }
  });
}

function updateShareholdersList() {
  const list = document.getElementById('shareholders-list');
  if (!list) return;
  
  list.innerHTML = '<h3>Ownership Structure</h3>';
  
  const todayValue = getCurrentValue();
  const sharePrice = getSharePrice();
  
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Shareholder</th>
        <th>Shares</th>
        <th>Ownership %</th>
        <th>Value @ ${formatCurrency(sharePrice)}</th>
        <th>Invested</th>
        <th>Profit/Loss</th>
        <th>ROI</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector('tbody');
  
  // Add treasury row
  if (state.totalShares > 0) {
    const treasuryRow = document.createElement('tr');
    treasuryRow.className = 'company-row';
    const treasuryPercentage = (state.treasuryShares / state.totalShares) * 100;
    treasuryRow.innerHTML = `
      <td>Company Treasury</td>
      <td>${formatNumber(state.treasuryShares)}</td>
      <td>${treasuryPercentage.toFixed(1)}%</td>
      <td>${formatCurrency(state.treasuryShares * sharePrice)}</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
    `;
    tbody.appendChild(treasuryRow);
  }
  
  // Add shareholder rows
  Object.entries(state.shareholders).forEach(([name, data]) => {
    if (data.shares > 0) {
      const percentage = (data.shares / state.totalShares) * 100;
      const currentValue = data.shares * sharePrice;
      const profit = currentValue - data.totalInvested;
      const roi = data.totalInvested > 0 ? (profit / data.totalInvested) * 100 : 0;
      const profitClass = profit >= 0 ? 'gain' : 'loss';
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${name}</td>
        <td>${formatNumber(data.shares)}</td>
        <td>${percentage.toFixed(1)}%</td>
        <td>${formatCurrency(currentValue)}</td>
        <td>${formatCurrency(data.totalInvested)}</td>
        <td class="${profitClass}">${formatCurrency(profit)}</td>
        <td class="${profitClass}">${roi.toFixed(1)}%</td>
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
      <strong>Total Shares:</strong> ${formatNumber(state.totalShares)}
    </div>
    <div class="summary-item">
      <strong>Outstanding:</strong> ${formatNumber(state.outstandingShares)}
    </div>
    <div class="summary-item">
      <strong>Treasury:</strong> ${formatNumber(state.treasuryShares)}
    </div>
    <div class="summary-item">
      <strong>Share Price:</strong> ${formatCurrency(sharePrice)}
    </div>
  `;
  list.appendChild(summary);
}

function updateTotal() {
  const todayValue = getCurrentValue();
  const sharePrice = getSharePrice();
  
  document.getElementById('total').textContent = formatCurrency(todayValue).replace('$', '');
  document.getElementById('share-price').textContent = formatCurrency(sharePrice).replace('$', '');
  document.getElementById('total-shares').textContent = formatNumber(state.totalShares);
  document.getElementById('treasury-shares').textContent = formatNumber(state.treasuryShares);
}

function updateCalculatedValue() {
  const sharesInput = document.getElementById('share-amount');
  const calculatedValueDiv = document.getElementById('calculated-value');
  
  const shares = parseInt(sharesInput.value) || 0;
  const sharePrice = getSharePrice();
  const value = shares * sharePrice;
  
  calculatedValueDiv.textContent = `Cost: ${formatCurrency(value)} (${formatNumber(shares)} × ${formatCurrency(sharePrice)})`;
}

function resetData() {
  if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
    state = {
      totalShares: 0,
      treasuryShares: 0,
      outstandingShares: 0,
      companyValue: 0,
      shareholders: {},
      transactions: [],
      shareTransactions: []
    };
    saveState();
    location.reload();
  }
}

function updateAll() {
  updateOwnershipChart();
  updateShareholdersList();
  updateTotal();
  updateCalculatedValue();
  // Add other update functions as needed
}

// Make functions globally accessible
window.issueShares = issueShares;
window.buyShares = buyShares;
window.sellShares = sellShares;
window.addTransaction = addTransaction;
window.resetData = resetData;

function init() {
  const canvas = document.getElementById('pieChart');
  if (canvas) {
    canvas.width = 300;
    canvas.height = 300;
  }
  
  // Set default dates
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const nowString = now.toISOString().slice(0, 16);
  
  document.querySelectorAll('input[type="datetime-local"]').forEach(input => {
    input.value = nowString;
  });
  
  // Event listeners
  document.getElementById('issue-shares')?.addEventListener('click', issueShares);
  document.getElementById('buy-shares')?.addEventListener('click', buyShares);
  document.getElementById('sell-shares')?.addEventListener('click', sellShares);
  document.getElementById('add-transaction')?.addEventListener('click', addTransaction);
  document.getElementById('reset-data')?.addEventListener('click', resetData);
  
  document.getElementById('share-amount')?.addEventListener('input', updateCalculatedValue);
  
  // Initial updates
  updateAll();
}

document.addEventListener('DOMContentLoaded', init);