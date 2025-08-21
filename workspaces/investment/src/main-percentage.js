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
    companyValuationDate: null, // Date when company was valued
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

function updateValueChart() {
  const canvas = document.getElementById('valueChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = 350;
  
  ctx.clearRect(0, 0, width, height);
  
  // Collect all value points
  const valuePoints = [];
  
  // Add initial valuation point
  if (state.companyValuation > 0) {
    valuePoints.push({
      date: state.companyValuationDate ? new Date(state.companyValuationDate) : new Date(),
      value: state.companyValuation,
      type: 'initial'
    });
  }
  
  // Add points for each transaction
  let runningValue = state.companyValuation;
  const allEvents = [
    ...state.transactions.map(t => ({ ...t, category: 'operation' })),
    ...state.shareTransactions.map(t => ({ ...t, category: 'shares' }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  allEvents.forEach(event => {
    if (event.category === 'operation') {
      runningValue = event.newValue;
      valuePoints.push({
        date: new Date(event.date),
        value: runningValue,
        type: event.direction,
        description: event.description
      });
    }
  });
  
  // Add today's value point
  if (valuePoints.length > 0) {
    const today = new Date();
    const todayValue = getCurrentValue();
    
    // Check if there are future transactions
    const hasFutureTransactions = valuePoints.some(p => p.date > today);
    
    // Find if we already have a point for today
    const todayPoint = valuePoints.find(p => {
      const pointDate = new Date(p.date);
      return pointDate.toDateString() === today.toDateString();
    });
    
    // Add today point if we don't have one and there are past or future transactions
    if (!todayPoint) {
      // Find the right position to insert today's value
      const todayIndex = valuePoints.findIndex(p => p.date > today);
      const insertPoint = {
        date: today,
        value: todayValue,
        type: 'current'
      };
      
      if (todayIndex === -1) {
        // No future transactions, add at end
        valuePoints.push(insertPoint);
      } else {
        // Insert before future transactions
        valuePoints.splice(todayIndex, 0, insertPoint);
      }
    }
  }
  
  if (valuePoints.length < 2) {
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Add transactions to see value over time', width / 2, height / 2);
    return;
  }
  
  // Calculate scale
  const padding = 60;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  
  const minValue = Math.min(...valuePoints.map(p => p.value)) * 0.9;
  const maxValue = Math.max(...valuePoints.map(p => p.value)) * 1.1;
  const valueRange = maxValue - minValue;
  
  const minDate = valuePoints[0].date;
  const maxDate = valuePoints[valuePoints.length - 1].date;
  const dateRange = maxDate - minDate || 1;
  
  // Draw axes
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
  
  // Draw grid lines and labels
  ctx.strokeStyle = '#444';
  ctx.fillStyle = '#aaa';
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';
  
  // Y-axis labels (values)
  for (let i = 0; i <= 5; i++) {
    const y = padding + (i * graphHeight / 5);
    const value = maxValue - (i * valueRange / 5);
    
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    
    ctx.fillText(formatCurrency(value).replace('$', ''), padding - 5, y + 3);
  }
  
  // Draw value line
  ctx.strokeStyle = '#4a90e2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  valuePoints.forEach((point, i) => {
    const x = padding + ((point.date - minDate) / dateRange) * graphWidth;
    const y = padding + ((maxValue - point.value) / valueRange) * graphHeight;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  
  // Draw points
  valuePoints.forEach(point => {
    const x = padding + ((point.date - minDate) / dateRange) * graphWidth;
    const y = padding + ((maxValue - point.value) / valueRange) * graphHeight;
    
    ctx.fillStyle = point.type === 'income' ? '#50c878' : 
                     point.type === 'expense' ? '#ff6b6b' : 
                     point.type === 'current' ? '#ffd700' : '#4a90e2';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // Draw "today" line if there are future transactions
  const today = new Date();
  const hasFutureTransactions = valuePoints.some(p => p.date > today);
  if (hasFutureTransactions && minDate < today && today < maxDate) {
    const todayX = padding + ((today - minDate) / dateRange) * graphWidth;
    
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(todayX, padding);
    ctx.lineTo(todayX, height - padding);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Label for today
    ctx.fillStyle = '#888';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Today', todayX, padding - 5);
  }
  
  // Draw legend
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  const legendY = 20;
  
  ctx.fillStyle = '#4a90e2';
  ctx.fillRect(width - 200, legendY, 10, 10);
  ctx.fillText('Value', width - 185, legendY + 9);
  
  ctx.fillStyle = '#50c878';
  ctx.fillRect(width - 130, legendY, 10, 10);
  ctx.fillText('Income', width - 115, legendY + 9);
  
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(width - 60, legendY, 10, 10);
  ctx.fillText('Expense', width - 45, legendY + 9);
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

function getCurrentValue() {
  // Calculate the current value based on transactions up to today
  const today = new Date();
  let value = state.companyValuation;
  
  // Only include transactions that have occurred (not future)
  const pastTransactions = state.transactions.filter(t => new Date(t.date) <= today);
  
  // Sort by date to ensure proper calculation
  pastTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  pastTransactions.forEach(t => {
    value += t.amount; // amount is already negative for expenses
  });
  
  return value;
}

function calculateInvestorProfit(name) {
  const investor = state.shareholders[name];
  if (!investor) return { invested: 0, currentValue: 0, profit: 0, roi: 0 };

  const todayValue = getCurrentValue();
  const currentValue = (investor.percentage / 100) * todayValue;
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

  const todayValue = getCurrentValue(); // Use today's value, not future value

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
    <td>${formatCurrency((state.companyShares / 100) * todayValue)}</td>
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
    ...state.transactions.map((t, i) => ({ ...t, category: 'operation', originalIndex: i })),
    ...state.shareTransactions.map((t, i) => ({ ...t, category: 'shares', originalIndex: i }))
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
      
      let amountDisplay = `${transaction.percentage.toFixed(1)}% for ${formatCurrency(transaction.amount)}`;
      
      // If viewing as specific investor who is involved in this transaction
      if (currentInvestor !== 'all' && state.shareholders[currentInvestor]) {
        if (transaction.buyer === currentInvestor || transaction.seller === currentInvestor) {
          const impact = transaction.buyer === currentInvestor ? -transaction.amount : transaction.amount;
          const impactClass = impact > 0 ? 'gain' : 'loss';
          const impactSign = impact > 0 ? '+' : '-';
          amountDisplay = `${transaction.percentage.toFixed(1)}% - <span class="${impactClass}">${impactSign}${formatCurrency(Math.abs(impact))}</span>`;
        }
      }
      
      item.innerHTML = `
        <div class="timeline-date">${dateStr} at ${timeStr}</div>
        <div class="timeline-content">
          <div class="timeline-main">
            <div class="timeline-left">
              <span class="timeline-type">[Share ${transaction.type === 'buy' ? 'Purchase' : 'Sale'}]</span>
              <span class="timeline-description">${transaction.buyer} ${action} ${counterparty}</span>
            </div>
            <div class="timeline-right">
              <span class="timeline-amount">${amountDisplay}</span>
              <span class="timeline-balance${currentInvestor !== 'all' && (transaction.buyer === currentInvestor || transaction.seller === currentInvestor) ? ' ' + (transaction.buyer === currentInvestor ? 'loss' : 'gain') : ''}">@ ${formatCurrency(transaction.pricePerPercent)}/1%</span>
            </div>
          </div>
          <div class="transaction-actions">
            <button class="delete-btn" onclick="deleteShareTransaction(${transaction.originalIndex})">Delete</button>
          </div>
        </div>
      `;
    } else {
      // Regular transaction
      item.className = `timeline-item ${transaction.direction}`;
      const directionLabel = transaction.direction === 'income' ? '+' : '-';
      
      let amountDisplay = `${directionLabel}${formatCurrency(Math.abs(transaction.amount))}`;
      let balanceDisplay = `Balance: ${formatCurrency(transaction.newValue)}`;
      
      // If viewing as specific investor, show their impact inline
      if (currentInvestor !== 'all' && state.shareholders[currentInvestor]) {
        const shareholderPercentage = state.shareholders[currentInvestor].percentage;
        const impact = (shareholderPercentage / 100) * transaction.amount;
        const impactClass = transaction.direction === 'income' ? 'gain' : 'loss';
        const impactSign = transaction.direction === 'income' ? '+' : '-';
        amountDisplay = `<span class="${impactClass}">${impactSign}${formatCurrency(Math.abs(impact))}</span> / <span class="${transaction.direction}">${directionLabel}${formatCurrency(Math.abs(transaction.amount))}</span>`;
        balanceDisplay = `<span class="${impactClass}">${shareholderPercentage.toFixed(1)}% share</span>`;
      }
      
      item.innerHTML = `
        <div class="timeline-date">${dateStr} at ${timeStr}</div>
        <div class="timeline-content">
          <div class="timeline-main">
            <div class="timeline-left">
              <span class="timeline-type">[Company ${transaction.direction === 'income' ? 'Income' : 'Expense'}]</span>
              <span class="timeline-description">${transaction.description}</span>
            </div>
            <div class="timeline-right">
              <span class="timeline-amount ${currentInvestor === 'all' ? transaction.direction : ''}">${amountDisplay}</span>
              <span class="timeline-balance ${currentInvestor === 'all' ? '' : ''}">${balanceDisplay}</span>
            </div>
          </div>
          <div class="transaction-actions">
            <button class="delete-btn" onclick="deleteTransaction(${transaction.originalIndex})">Delete</button>
          </div>
        </div>
      `;
    }

    list.appendChild(item);
  });

  timeline.appendChild(list);
}

function updateTotal() {
  const todayValue = getCurrentValue();
  document.getElementById('total').textContent = formatCurrency(todayValue).replace('$', '');
  document.getElementById('company-valuation').textContent = formatCurrency(state.companyValuation).replace('$', '');
  
  const availableElement = document.getElementById('available-shares');
  if (availableElement) {
    availableElement.textContent = `${state.companyShares.toFixed(1)}%`;
  }
}

function setCompanyValuation() {
  const input = document.getElementById('company-valuation-input');
  const dateInput = document.getElementById('company-valuation-date');
  const value = parseFloat(input.value);
  const dateValue = dateInput.value;
  
  if (!value || value <= 0) {
    alert('Please enter a valid valuation amount');
    return;
  }
  
  if (!dateValue) {
    alert('Please select a valuation date');
    return;
  }

  state.companyValuation = value;
  state.companyValuationDate = new Date(dateValue).toISOString();
  state.currentValue = value;
  
  saveState();
  updateTotal();
  updateShareholdersList();
  updateOwnershipChart();
  updateValueChart();
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

  const todayValue = getCurrentValue();
  const pricePerPercent = todayValue / 100;
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
  updateValueChart();
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

  const todayValue = getCurrentValue();
  const pricePerPercent = todayValue / 100;
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
  updateValueChart();
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
  updateValueChart();
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
  updateValueChart();
  updateCalculatedValue();
}

function deleteShareTransaction(index) {
  if (!confirm('Are you sure you want to delete this share transaction?')) return;
  
  const transaction = state.shareTransactions[index];
  if (!transaction) {
    console.error('Transaction not found at index:', index);
    return;
  }
  
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
  updateValueChart();
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

  updatePersonalValueChart();
  updatePersonalTransactions();
}

function updatePersonalValueChart() {
  const canvas = document.getElementById('personalValueChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = 280;
  
  ctx.clearRect(0, 0, width, height);
  
  const investor = state.shareholders[currentInvestor];
  if (!investor) return;
  
  // Collect all value points for this investor
  const valuePoints = [];
  let runningShares = 0;
  let runningInvested = 0;
  
  // Get all events that affect this investor
  const allEvents = [];
  
  // Add share transactions
  if (investor.transactions) {
    investor.transactions.forEach(t => {
      allEvents.push({
        date: new Date(t.date),
        type: 'share-' + t.type,
        shares: t.percentage,
        amount: t.amount,
        companyValue: t.companyValue || t.totalValue || state.currentValue
      });
    });
  }
  
  // Add company operations
  state.transactions.forEach(t => {
    allEvents.push({
      date: new Date(t.date),
      type: 'company-' + t.direction,
      companyValue: t.newValue
    });
  });
  
  // Sort by date
  allEvents.sort((a, b) => a.date - b.date);
  
  // Calculate value at each point
  const today = new Date();
  allEvents.forEach(event => {
    if (event.type === 'share-buy') {
      runningShares += event.shares;
      runningInvested += event.amount;
    } else if (event.type === 'share-sell') {
      runningShares -= event.shares;
      runningInvested -= event.amount;
    }
    
    // For future company operations, use projected value
    // For past/today operations, use actual value
    let companyValueToUse = event.companyValue;
    if (event.type.startsWith('company-') && event.date <= today) {
      // This is a past company operation, value is accurate
      companyValueToUse = event.companyValue;
    }
    
    const value = (runningShares / 100) * companyValueToUse;
    
    if (runningShares > 0) {
      valuePoints.push({
        date: event.date,
        value: value,
        invested: runningInvested,
        type: event.type,
        shares: runningShares
      });
    }
  });
  
  // Add today's value point
  if (investor.percentage > 0 && valuePoints.length > 0) {
    // Use the 'today' variable already declared above
    const todayValue = getCurrentValue();
    const currentShareValue = (investor.percentage / 100) * todayValue;
    
    // Find if we already have a point for today
    const todayPoint = valuePoints.find(p => {
      const pointDate = new Date(p.date);
      return pointDate.toDateString() === today.toDateString();
    });
    
    // Add today point if we don't have one
    if (!todayPoint) {
      // Find the right position to insert today's value
      const todayIndex = valuePoints.findIndex(p => p.date > today);
      const insertPoint = {
        date: today,
        value: currentShareValue,
        invested: investor.totalInvested || runningInvested,
        type: 'current',
        shares: investor.percentage
      };
      
      if (todayIndex === -1) {
        // No future transactions, add at end
        valuePoints.push(insertPoint);
      } else {
        // Insert before future transactions
        valuePoints.splice(todayIndex, 0, insertPoint);
      }
    }
  }
  
  if (valuePoints.length < 2) {
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No value history to display', width / 2, height / 2);
    return;
  }
  
  // Calculate scale
  const padding = 60;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  
  const values = valuePoints.flatMap(p => [p.value, p.invested]);
  const minValue = Math.min(...values) * 0.9;
  const maxValue = Math.max(...values) * 1.1;
  const valueRange = maxValue - minValue || 1;
  
  const minDate = valuePoints[0].date;
  const maxDate = valuePoints[valuePoints.length - 1].date;
  const dateRange = maxDate - minDate || 1;
  
  // Draw axes
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
  
  // Draw grid lines and labels
  ctx.strokeStyle = '#444';
  ctx.fillStyle = '#aaa';
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';
  
  // Y-axis labels (values)
  for (let i = 0; i <= 4; i++) {
    const y = padding + (i * graphHeight / 4);
    const value = maxValue - (i * valueRange / 4);
    
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    
    ctx.fillText(formatCurrency(value).replace('$', ''), padding - 5, y + 3);
  }
  
  // Draw value line
  ctx.strokeStyle = '#4a90e2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  valuePoints.forEach((point, i) => {
    const x = padding + ((point.date - minDate) / dateRange) * graphWidth;
    const y = padding + ((maxValue - point.value) / valueRange) * graphHeight;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  
  // Draw invested line
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  
  valuePoints.forEach((point, i) => {
    const x = padding + ((point.date - minDate) / dateRange) * graphWidth;
    const y = padding + ((maxValue - point.invested) / valueRange) * graphHeight;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw points
  valuePoints.forEach(point => {
    const x = padding + ((point.date - minDate) / dateRange) * graphWidth;
    const y = padding + ((maxValue - point.value) / valueRange) * graphHeight;
    
    let color = '#4a90e2';
    if (point.type === 'share-buy') color = '#ff6b6b';
    else if (point.type === 'share-sell') color = '#50c878';
    else if (point.type === 'current') color = '#ffd700';
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // Draw "today" line if there are future transactions
  // 'today' variable already declared above in this function
  const hasFutureTransactions = valuePoints.some(p => p.date > today);
  if (hasFutureTransactions && minDate < today && today < maxDate) {
    const todayX = padding + ((today - minDate) / dateRange) * graphWidth;
    
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(todayX, padding);
    ctx.lineTo(todayX, height - padding);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Label for today
    ctx.fillStyle = '#888';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Today', todayX, padding - 5);
  }
  
  // Draw legend
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  const legendY = 20;
  
  ctx.fillStyle = '#4a90e2';
  ctx.fillRect(width - 250, legendY, 10, 10);
  ctx.fillText('Value', width - 235, legendY + 9);
  
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(width - 180, legendY, 10, 10);
  ctx.fillText('Invested', width - 165, legendY + 9);
  
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(width - 100, legendY, 10, 10);
  ctx.fillText('Buy', width - 85, legendY + 9);
  
  ctx.fillStyle = '#50c878';
  ctx.fillRect(width - 50, legendY, 10, 10);
  ctx.fillText('Sell', width - 35, legendY + 9);
}

function updatePersonalTransactions() {
  const container = document.getElementById('personal-transactions');
  container.innerHTML = '<h3>Your Transaction History</h3>';

  const investor = state.shareholders[currentInvestor];
  if (!investor) {
    container.innerHTML += '<p>No transactions yet</p>';
    return;
  }

  // Combine share transactions with company operations
  const allTransactions = [];
  
  // Add share transactions
  if (investor.transactions) {
    investor.transactions.forEach(t => {
      allTransactions.push({
        ...t,
        category: 'shares',
        date: t.date
      });
    });
  }
  
  // Add company operations that affect this investor
  state.transactions.forEach(t => {
    const impact = (investor.percentage / 100) * t.amount;
    allTransactions.push({
      ...t,
      category: 'operation',
      impact: impact,
      shareholderPercentage: investor.percentage
    });
  });
  
  // Sort by date
  allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (allTransactions.length === 0) {
    container.innerHTML += '<p>No transactions yet</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'timeline-list';

  allTransactions.forEach(transaction => {
    const item = document.createElement('div');
    const transactionDate = new Date(transaction.date);
    const dateStr = transactionDate.toLocaleDateString();
    const timeStr = transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (transaction.category === 'shares') {
      const typeClass = transaction.type === 'buy' ? 'income' : 'expense';
      const action = transaction.type === 'buy' ? 'Purchased from' : 'Sold to';
      const counterparty = transaction.type === 'buy' ? 
        (transaction.seller || 'Company') : 
        (transaction.buyer || 'Company');
      const impact = transaction.type === 'buy' ? -transaction.amount : transaction.amount;
      const impactClass = impact > 0 ? 'gain' : 'loss';
      const impactSign = impact > 0 ? '+' : '-';

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
              <span class="timeline-amount">
                <span class="${impactClass}">${impactSign}${formatCurrency(Math.abs(impact))}</span> / <span class="${impactClass}">${formatCurrency(transaction.amount)}</span>
              </span>
              <span class="timeline-balance ${impactClass}">@ ${formatCurrency(transaction.pricePerPercent)}/1%</span>
            </div>
          </div>
        </div>
      `;
    } else {
      // Company operation
      const impactClass = transaction.direction === 'income' ? 'gain' : 'loss';
      const impactSign = transaction.direction === 'income' ? '+' : '-';
      const companySign = transaction.direction === 'income' ? '+' : '-';
      
      item.className = `timeline-item ${transaction.direction}`;
      item.innerHTML = `
        <div class="timeline-date">${dateStr} at ${timeStr}</div>
        <div class="timeline-content">
          <div class="timeline-main">
            <div class="timeline-left">
              <span class="timeline-type">[Company ${transaction.direction}]</span>
              <span class="timeline-description">${transaction.description}</span>
            </div>
            <div class="timeline-right">
              <span class="timeline-amount">
                <span class="${impactClass}">${impactSign}${formatCurrency(Math.abs(transaction.impact))}</span> / <span class="${impactClass}">${companySign}${formatCurrency(Math.abs(transaction.amount))}</span>
              </span>
              <span class="timeline-balance ${impactClass}">${transaction.shareholderPercentage.toFixed(1)}% share</span>
            </div>
          </div>
        </div>
      `;
    }

    list.appendChild(item);
  });

  container.appendChild(list);
}

function updateCalculatedValue() {
  const percentageInput = document.getElementById('share-percentage');
  const calculatedValueDiv = document.getElementById('calculated-value');

  const percentage = parseFloat(percentageInput.value) || 0;
  const todayValue = getCurrentValue();
  const value = (percentage / 100) * todayValue;

  calculatedValueDiv.textContent = `Cost: ${formatCurrency(value)} @ ${formatCurrency(todayValue / 100)}/1%`;
}

function exportData() {
  // Create a clean export object with metadata
  const exportObject = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    data: state
  };
  
  // Convert to JSON with nice formatting
  const jsonString = JSON.stringify(exportObject, null, 2);
  
  // Create blob and download link
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  // Create temporary download link
  const a = document.createElement('a');
  a.href = url;
  a.download = `investment-data-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Clean up
  URL.revokeObjectURL(url);
}

function importData() {
  // Trigger file input click
  document.getElementById('import-file').click();
}

function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      
      // Validate the imported data
      if (!importedData.data) {
        alert('Invalid file format. Please select a valid investment data export file.');
        return;
      }
      
      // Show confirmation dialog
      const shareholderCount = Object.keys(importedData.data.shareholders || {}).length;
      const transactionCount = (importedData.data.transactions || []).length + (importedData.data.shareTransactions || []).length;
      
      const message = `This will replace all current data with:\n` +
        `- Company Valuation: ${formatCurrency(importedData.data.companyValuation || 0)}\n` +
        `- ${shareholderCount} shareholder(s)\n` +
        `- ${transactionCount} transaction(s)\n\n` +
        `Are you sure you want to continue? This cannot be undone.`;
      
      if (!confirm(message)) {
        return;
      }
      
      // Import the data
      state = importedData.data;
      
      // Ensure all required fields exist
      state.companyValuation = state.companyValuation || 0;
      state.companyValuationDate = state.companyValuationDate || null;
      state.companyShares = state.companyShares !== undefined ? state.companyShares : 100;
      state.shareholders = state.shareholders || {};
      state.transactions = state.transactions || [];
      state.shareTransactions = state.shareTransactions || [];
      state.currentValue = state.currentValue || 0;
      
      // Save and reload
      saveState();
      location.reload();
      
    } catch (error) {
      alert('Error importing file: ' + error.message);
    }
  };
  
  reader.readAsText(file);
  
  // Reset file input
  event.target.value = '';
}

function resetData() {
  if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
    state = {
      companyValuation: 0,
      companyValuationDate: null,
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
window.exportData = exportData;
window.importData = importData;

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
  const valuationDateInput = document.getElementById('company-valuation-date');
  if (shareDateInput) shareDateInput.value = nowString;
  if (transactionDateInput) transactionDateInput.value = nowString;
  if (valuationDateInput) valuationDateInput.value = nowString;

  // Event listeners
  document.getElementById('set-valuation')?.addEventListener('click', setCompanyValuation);
  document.getElementById('buy-shares')?.addEventListener('click', buyShares);
  document.getElementById('sell-shares')?.addEventListener('click', sellShares);
  document.getElementById('add-transaction')?.addEventListener('click', addTransaction);
  document.getElementById('reset-data')?.addEventListener('click', resetData);
  document.getElementById('export-data')?.addEventListener('click', exportData);
  document.getElementById('import-data')?.addEventListener('click', importData);
  document.getElementById('import-file')?.addEventListener('change', handleFileImport);

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
  updateValueChart();
  updateInvestorSelector();
  updateInvestorView();
  updateCalculatedValue();
}

document.addEventListener('DOMContentLoaded', init);