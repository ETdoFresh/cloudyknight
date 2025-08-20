import './style.css'

function loadState() {
  const saved = localStorage.getItem('investmentState');
  if (saved) {
    return JSON.parse(saved);
  }
  return {
    initialInvestments: [],  // Track initial investments
    totalInitialInvestment: 0,  // Total amount invested initially
    shareholders: {},  // Start with no shareholders
    transactions: [],
    currentValue: 0,  // Start with $0
    shareTransactions: []
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
  const colors = ['#4a90e2', '#50c878', '#ff6b6b', '#ffd700', '#9370db', '#ff9f40', '#20b2aa', '#ff69b4'];
  let colorIndex = 0;

  Object.entries(state.shareholders).forEach(([name, data]) => {
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
  });
}

function calculateInvestorProfit(name) {
  const investor = state.shareholders[name];
  if (!investor) return { invested: 0, currentValue: 0, profit: 0, roi: 0 };

  let totalInvested = 0;
  let totalSold = 0;
  let currentShares = 0;

  if (investor.transactions) {
    investor.transactions.forEach(t => {
      if (t.type === 'buy') {
        totalInvested += t.amount;
        currentShares += t.percentage;
      } else if (t.type === 'sell') {
        totalSold += t.amount;
        currentShares -= t.percentage;
      }
    });
  } else {
    totalInvested = investor.investment;
    currentShares = investor.percentage;
  }

  const currentValue = (currentShares / 100) * state.currentValue;
  const netInvested = totalInvested - totalSold;
  const profit = currentValue + totalSold - totalInvested;
  const roi = netInvested > 0 ? (profit / netInvested) * 100 : 0;

  return {
    invested: netInvested,
    currentValue: currentValue,
    profit: profit,
    roi: roi,
    totalInvested: totalInvested,
    totalSold: totalSold
  };
}

function updateShareholdersList() {
  const list = document.getElementById('shareholders-list');
  list.innerHTML = '<h3>Shareholders</h3>';

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Percentage</th>
        <th>Net Investment</th>
        <th>Current Value</th>
        <th>Profit/Loss</th>
        <th>ROI</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  Object.entries(state.shareholders).forEach(([name, data]) => {
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
  });

  list.appendChild(table);
}

function updateTimeline() {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '<h3>Transaction History</h3>';

  if (state.transactions.length === 0) {
    timeline.innerHTML += '<p>No transactions yet</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'timeline-list';

  state.transactions.slice().reverse().forEach((transaction, reversedIndex) => {
    const actualIndex = state.transactions.length - 1 - reversedIndex;
    const item = document.createElement('div');
    item.className = `timeline-item ${transaction.direction}`;

    const typeLabel = transaction.type === 'et-side' ? 'ET Only' : 'All Shareholders';
    const directionLabel = transaction.direction === 'income' ? '+' : '-';
    const transactionDate = new Date(transaction.date);
    const dateStr = transactionDate.toLocaleDateString();
    const timeStr = transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let impactInfo = '';
    if (currentInvestor !== 'all' && state.shareholders[currentInvestor]) {
      const investor = state.shareholders[currentInvestor];
      const impact = (investor.percentage / 100) * Math.abs(transaction.amount);
      const impactClass = transaction.direction === 'income' ? 'gain' : 'loss';
      if (transaction.type === 'company-side') {
        impactInfo = `
          <div class="investor-impact ${impactClass}">
            ${currentInvestor}'s impact: ${directionLabel}${formatCurrency(impact)} of ${directionLabel}${formatCurrency(Math.abs(transaction.amount))} (${investor.percentage.toFixed(1)}%)
          </div>
        `;
      } else if (transaction.type === 'et-side' && currentInvestor === 'ET') {
        impactInfo = `
          <div class="investor-impact ${impactClass}">
            ET bears full impact: ${directionLabel}${formatCurrency(Math.abs(transaction.amount))}
          </div>
        `;
      }
    }

    item.innerHTML = `
      <div class="timeline-date">${dateStr} at ${timeStr}</div>
      <div class="timeline-content">
        <div class="timeline-main">
          <div class="timeline-left">
            <span class="timeline-type">[${typeLabel}]</span>
            <span class="timeline-description">${transaction.description}</span>
          </div>
          <div class="timeline-right">
            <span class="timeline-amount ${transaction.direction}">${directionLabel}${formatCurrency(Math.abs(transaction.amount))}</span>
            <span class="timeline-balance">Balance: ${formatCurrency(transaction.newValue)}</span>
          </div>
        </div>
        ${impactInfo}
        <div class="transaction-actions">
          <button class="edit-btn" onclick="editTransaction(${actualIndex})">Edit</button>
          <button class="delete-btn" onclick="deleteTransaction(${actualIndex})">Delete</button>
        </div>
      </div>
    `;

    list.appendChild(item);
  });

  timeline.appendChild(list);
}

function updateTotal() {
  document.getElementById('total').textContent = formatCurrency(state.currentValue).replace('$', '');
  document.getElementById('initial-capital').textContent = formatCurrency(state.totalInitialInvestment || 0).replace('$', '');
}

function addInitialInvestment() {
  const nameInput = document.getElementById('initial-investor-name');
  const amountInput = document.getElementById('initial-amount');
  const dateInput = document.getElementById('initial-date');

  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const dateValue = dateInput.value;

  if (!name || !amount || !dateValue) {
    alert('Please fill in all fields');
    return;
  }

  if (amount <= 0) {
    alert('Investment amount must be positive');
    return;
  }

  // Add to initial investments
  if (!state.initialInvestments) {
    state.initialInvestments = [];
  }

  const investment = {
    investor: name,
    amount: amount,
    date: new Date(dateValue).toISOString(),
    id: Date.now() // Simple ID for tracking
  };

  state.initialInvestments.push(investment);
  state.totalInitialInvestment = (state.totalInitialInvestment || 0) + amount;
  state.currentValue = state.totalInitialInvestment;

  // Create or update shareholder with initial percentage based on investment
  if (!state.shareholders[name]) {
    state.shareholders[name] = {
      percentage: 0,
      investment: 0,
      initialInvestment: 0,
      transactions: []
    };
  }

  state.shareholders[name].initialInvestment = (state.shareholders[name].initialInvestment || 0) + amount;

  // Recalculate ownership percentages based on initial investments
  recalculateInitialOwnership();

  // Clear inputs
  nameInput.value = '';
  amountInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  saveState();
  updateInitialInvestmentsList();
  updateOwnershipChart();
  updateShareholdersList();
  updateTotal();
  updateInvestorSelector();
}

function recalculateInitialOwnership() {
  if (state.totalInitialInvestment === 0) return;

  // Calculate ownership based on initial investments
  Object.keys(state.shareholders).forEach(name => {
    const investor = state.shareholders[name];
    if (investor.initialInvestment) {
      investor.percentage = (investor.initialInvestment / state.totalInitialInvestment) * 100;
    }
  });
}

function updateInitialInvestmentsList() {
  const list = document.getElementById('initial-investments-list');
  if (!list) return;

  list.innerHTML = '<h3>Initial Investments</h3>';

  if (!state.initialInvestments || state.initialInvestments.length === 0) {
    list.innerHTML += '<p>No initial investments yet</p>';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Investor</th>
        <th>Amount</th>
        <th>Date</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  state.initialInvestments.forEach((investment, index) => {
    const row = document.createElement('tr');
    const date = new Date(investment.date);
    row.innerHTML = `
      <td>${investment.investor}</td>
      <td>${formatCurrency(investment.amount)}</td>
      <td>${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      <td>
        <button class="edit-btn" onclick="editInitialInvestment(${index})">Edit</button>
        <button class="delete-btn" onclick="deleteInitialInvestment(${index})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  list.appendChild(table);

  // Show total
  const totalDiv = document.createElement('div');
  totalDiv.className = 'initial-total';
  totalDiv.innerHTML = `<strong>Total Initial Investment: ${formatCurrency(state.totalInitialInvestment || 0)}</strong>`;
  list.appendChild(totalDiv);
}

function deleteInitialInvestment(index) {
  if (!confirm('Are you sure you want to delete this initial investment?')) return;

  const investment = state.initialInvestments[index];

  // Update totals
  state.totalInitialInvestment -= investment.amount;
  state.currentValue = state.totalInitialInvestment;

  // Update shareholder
  if (state.shareholders[investment.investor]) {
    state.shareholders[investment.investor].initialInvestment -= investment.amount;

    // Remove shareholder if no investment left
    if (state.shareholders[investment.investor].initialInvestment <= 0 &&
        (!state.shareholders[investment.investor].transactions ||
         state.shareholders[investment.investor].transactions.length === 0)) {
      delete state.shareholders[investment.investor];
    }
  }

  // Remove investment
  state.initialInvestments.splice(index, 1);

  // Recalculate ownership
  recalculateInitialOwnership();

  saveState();
  updateInitialInvestmentsList();
  updateOwnershipChart();
  updateShareholdersList();
  updateTotal();
  updateInvestorSelector();
}

let currentInitialEditIndex = null;

function editInitialInvestment(index) {
  currentInitialEditIndex = index;
  const investment = state.initialInvestments[index];
  const modal = document.getElementById('edit-initial-modal');

  // Populate modal with current values
  document.getElementById('edit-initial-investor').value = investment.investor;
  document.getElementById('edit-initial-amount').value = investment.amount;

  // Format date for input
  const date = new Date(investment.date);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  document.getElementById('edit-initial-date').value = date.toISOString().slice(0, 16);

  modal.style.display = 'flex';
}

function saveInitialEdit() {
  if (currentInitialEditIndex === null) return;

  const investor = document.getElementById('edit-initial-investor').value.trim();
  const amount = parseFloat(document.getElementById('edit-initial-amount').value);
  const dateValue = document.getElementById('edit-initial-date').value;

  if (!investor || !amount || !dateValue) {
    alert('Please fill all fields');
    return;
  }

  if (amount <= 0) {
    alert('Investment amount must be positive');
    return;
  }

  const oldInvestment = state.initialInvestments[currentInitialEditIndex];
  const amountDifference = amount - oldInvestment.amount;
  const nameChanged = investor !== oldInvestment.investor;

  // Update the investment
  state.initialInvestments[currentInitialEditIndex] = {
    investor: investor,
    amount: amount,
    date: new Date(dateValue).toISOString(),
    id: oldInvestment.id
  };

  // Update total
  state.totalInitialInvestment += amountDifference;
  state.currentValue += amountDifference;

  // Handle investor name change
  if (nameChanged) {
    // Transfer ownership from old name to new name
    if (state.shareholders[oldInvestment.investor]) {
      const oldShareholder = state.shareholders[oldInvestment.investor];

      // Create new shareholder entry if needed
      if (!state.shareholders[investor]) {
        state.shareholders[investor] = {
          percentage: 0,
          investment: 0,
          initialInvestment: 0,
          transactions: []
        };
      }

      // Transfer the initial investment amount
      state.shareholders[investor].initialInvestment =
        (state.shareholders[investor].initialInvestment || 0) + oldInvestment.amount;
      oldShareholder.initialInvestment -= oldInvestment.amount;

      // Clean up old shareholder if no longer has investments
      if (oldShareholder.initialInvestment <= 0 &&
          (!oldShareholder.transactions || oldShareholder.transactions.length === 0)) {
        delete state.shareholders[oldInvestment.investor];
      }
    }
  }

  // Update shareholder amounts
  if (state.shareholders[investor]) {
    state.shareholders[investor].initialInvestment =
      (state.shareholders[investor].initialInvestment || 0) + amountDifference;
  }

  // Recalculate ownership
  recalculateInitialOwnership();

  saveState();
  updateInitialInvestmentsList();
  updateOwnershipChart();
  updateShareholdersList();
  updateTotal();
  updateInvestorSelector();
  closeInitialEditModal();
}

function closeInitialEditModal() {
  document.getElementById('edit-initial-modal').style.display = 'none';
  currentInitialEditIndex = null;
}

// Make functions globally accessible
window.deleteInitialInvestment = deleteInitialInvestment;
window.editInitialInvestment = editInitialInvestment;

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

  updateInvestmentGraph();
  updatePersonalTransactions();
}

function updateInvestmentGraph() {
  const canvas = document.getElementById('investmentGraph');
  const ctx = canvas.getContext('2d');

  canvas.width = canvas.offsetWidth;
  canvas.height = 300;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const investor = state.shareholders[currentInvestor];
  if (!investor || !investor.transactions || investor.transactions.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No transaction history', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Combine share transactions with company transactions
  let allEvents = [...investor.transactions];

  // Add company transactions that affect this investor
  state.transactions.forEach(t => {
    if (t.type === 'company-side') {
      allEvents.push({
        type: 'company-transaction',
        date: t.date,
        description: t.description,
        impact: (investor.percentage / 100) * t.amount
      });
    }
  });

  // Sort by date
  allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (allEvents.length === 0) return;

  // Calculate cumulative values
  let cumulativeValue = 0;
  let cumulativeInvested = 0;
  const dataPoints = [];

  allEvents.forEach(event => {
    if (event.type === 'buy') {
      cumulativeInvested += event.amount;
      cumulativeValue = (event.percentage / 100) * event.totalValue;
    } else if (event.type === 'sell') {
      cumulativeInvested -= event.amount;
      cumulativeValue = (investor.percentage / 100) * event.totalValue;
    }

    dataPoints.push({
      date: new Date(event.date),
      value: cumulativeValue,
      invested: cumulativeInvested,
      type: event.type
    });
  });

  // Add current value
  const currentValue = (investor.percentage / 100) * state.currentValue;
  dataPoints.push({
    date: new Date(),
    value: currentValue,
    invested: cumulativeInvested,
    type: 'current'
  });

  // Find min/max for scaling
  const values = dataPoints.map(p => Math.max(p.value, p.invested));
  const maxValue = Math.max(...values);
  const minDate = dataPoints[0].date;
  const maxDate = dataPoints[dataPoints.length - 1].date;
  const dateRange = maxDate - minDate;

  // Draw axes
  const padding = 60;
  const graphWidth = canvas.width - padding * 2;
  const graphHeight = canvas.height - padding * 2;

  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, canvas.height - padding);
  ctx.lineTo(canvas.width - padding, canvas.height - padding);
  ctx.stroke();

  // Draw value line
  ctx.strokeStyle = '#4a90e2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  dataPoints.forEach((point, i) => {
    const x = padding + ((point.date - minDate) / dateRange) * graphWidth;
    const y = canvas.height - padding - (point.value / maxValue) * graphHeight;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw invested line
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  dataPoints.forEach((point, i) => {
    const x = padding + ((point.date - minDate) / dateRange) * graphWidth;
    const y = canvas.height - padding - (point.invested / maxValue) * graphHeight;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw buy/sell points
  dataPoints.forEach(point => {
    if (point.type === 'buy' || point.type === 'sell') {
      const x = padding + ((point.date - minDate) / dateRange) * graphWidth;
      const y = canvas.height - padding - (point.value / maxValue) * graphHeight;

      ctx.fillStyle = point.type === 'buy' ? '#50c878' : '#ff6b6b';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Draw legend
  ctx.font = '12px Arial';
  ctx.fillStyle = '#4a90e2';
  ctx.fillText('Current Value', canvas.width - 150, 20);
  ctx.fillStyle = '#ffd700';
  ctx.fillText('Total Invested', canvas.width - 150, 40);

  // Draw scale
  ctx.fillStyle = '#666';
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(formatCurrency(maxValue), padding - 5, padding);
  ctx.fillText(formatCurrency(0), padding - 5, canvas.height - padding);
}

function updatePersonalTransactions() {
  const container = document.getElementById('personal-transactions');
  container.innerHTML = '<h3>Your Transactions</h3>';

  const investor = state.shareholders[currentInvestor];
  if (!investor || !investor.transactions || investor.transactions.length === 0) {
    container.innerHTML += '<p>No transactions yet</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'timeline-list';

  // Combine share transactions with company transactions for complete history
  let allTransactions = [];

  // Add share transactions
  investor.transactions.forEach(t => {
    allTransactions.push({
      ...t,
      category: 'share'
    });
  });

  // Add company transactions that affect this investor
  state.transactions.forEach(t => {
    const investorImpact = (investor.percentage / 100) * Math.abs(t.amount);
    allTransactions.push({
      ...t,
      category: 'company',
      investorImpact: investorImpact,
      investorPercentage: investor.percentage
    });
  });

  // Sort by date
  allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  allTransactions.forEach(transaction => {
    const item = document.createElement('div');
    const transactionDate = new Date(transaction.date);
    const dateStr = transactionDate.toLocaleDateString();
    const timeStr = transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (transaction.category === 'share') {
      item.className = `timeline-item ${transaction.type}`;
      const typeLabel = transaction.type === 'buy' ? 'BOUGHT' : 'SOLD';
      const typeClass = transaction.type === 'buy' ? 'gain' : 'loss';

      // Find the index of this transaction in the investor's transaction array
      const transactionIndex = investor.transactions.findIndex(t =>
        t.date === transaction.date &&
        t.type === transaction.type &&
        t.percentage === transaction.percentage
      );

      item.innerHTML = `
        <div class="timeline-date">${dateStr} at ${timeStr}</div>
        <div class="timeline-content">
          <div class="timeline-main">
            <div class="timeline-left">
              <span class="timeline-type ${typeClass}">${typeLabel}</span>
              <span class="timeline-description">${transaction.percentage.toFixed(1)}% @ ${formatCurrency(transaction.pricePerShare)}/1%</span>
            </div>
            <div class="timeline-right">
              <span class="timeline-amount ${typeClass}">${transaction.type === 'buy' ? '-' : '+'}${formatCurrency(transaction.amount)}</span>
              <span class="timeline-balance">Value: ${formatCurrency(transaction.totalValue)}</span>
            </div>
          </div>
          <div class="transaction-actions">
            <button class="edit-btn" onclick="editShareTransaction('${currentInvestor}', ${transactionIndex})">Edit</button>
            <button class="delete-btn" onclick="deleteShareTransaction('${currentInvestor}', ${transactionIndex})">Delete</button>
          </div>
        </div>
      `;
    } else {
      // Company transaction
      const impactClass = transaction.direction === 'income' ? 'gain' : 'loss';
      const impactSign = transaction.direction === 'income' ? '+' : '-';
      item.className = `timeline-item ${transaction.direction}`;
      item.innerHTML = `
        <div class="timeline-date">${dateStr} at ${timeStr}</div>
        <div class="timeline-content">
          <div class="timeline-main">
            <div class="timeline-left">
              <span class="timeline-type">[${transaction.type === 'et-side' ? 'ET Only' : 'Company'}]</span>
              <span class="timeline-description">${transaction.description}</span>
            </div>
            <div class="timeline-right">
              <span class="timeline-amount ${impactClass}">${impactSign}${formatCurrency(transaction.investorImpact)}</span>
              <span class="timeline-balance">of ${impactSign}${formatCurrency(Math.abs(transaction.amount))}</span>
            </div>
          </div>
        </div>
      `;
    }

    list.appendChild(item);
  });

  container.appendChild(list);
}

function buyShares() {
  const nameInput = document.getElementById('investor-name');
  const percentageInput = document.getElementById('share-percentage');
  const dateInput = document.getElementById('share-date');

  const name = nameInput.value.trim();
  const percentage = parseFloat(percentageInput.value);
  const dateValue = dateInput.value;

  if (!name || !percentage) {
    alert('Please enter both name and percentage');
    return;
  }

  if (!dateValue) {
    alert('Please select a date and time');
    return;
  }

  if (state.totalInitialInvestment === 0) {
    alert('No initial investment has been made yet. Please add initial investments first.');
    return;
  }

  if (percentage < 0.1 || percentage > 100) {
    alert('Percentage must be between 0.1 and 100');
    return;
  }

  // Check if shares are available from initial investors
  let availableShares = 0;
  Object.values(state.shareholders).forEach(shareholder => {
    if (shareholder.percentage > 0) {
      availableShares += shareholder.percentage;
    }
  });

  if (availableShares < percentage) {
    alert(`Only ${availableShares.toFixed(1)}% shares are available for purchase`);
    return;
  }

  const pricePerShare = state.currentValue / 100;
  const actualCost = (percentage / 100) * state.currentValue;

  // For the new model, buyers need to specify from whom they're buying
  // For simplicity, we'll distribute the purchase proportionally from all current shareholders
  const sellersInfo = [];
  Object.entries(state.shareholders).forEach(([sellerName, seller]) => {
    if (seller.percentage > 0 && sellerName !== name) {
      const shareToSell = (seller.percentage / availableShares) * percentage;
      sellersInfo.push({
        name: sellerName,
        shareToSell: shareToSell,
        amount: (shareToSell / 100) * state.currentValue
      });
    }
  });

  // Create buyer entry if doesn't exist
  if (!state.shareholders[name]) {
    state.shareholders[name] = {
      percentage: 0,
      investment: 0,
      initialInvestment: 0,
      transactions: []
    };
  }

  // Record buy transaction
  const buyTransaction = {
    type: 'buy',
    investor: name,
    percentage: percentage,
    amount: actualCost,
    date: new Date(dateValue).toISOString(),
    pricePerShare: pricePerShare,
    totalValue: state.currentValue,
    sellers: sellersInfo
  };

  state.shareholders[name].percentage += percentage;
  state.shareholders[name].investment += actualCost;
  state.shareholders[name].transactions = state.shareholders[name].transactions || [];
  state.shareholders[name].transactions.push(buyTransaction);

  // Update sellers
  sellersInfo.forEach(sellerInfo => {
    const seller = state.shareholders[sellerInfo.name];
    seller.percentage -= sellerInfo.shareToSell;

    const sellTransaction = {
      type: 'sell',
      investor: sellerInfo.name,
      percentage: sellerInfo.shareToSell,
      amount: sellerInfo.amount,
      date: new Date(dateValue).toISOString(),
      pricePerShare: pricePerShare,
      totalValue: state.currentValue,
      buyer: name
    };

    seller.transactions = seller.transactions || [];
    seller.transactions.push(sellTransaction);
  });

  if (!state.shareTransactions) {
    state.shareTransactions = [];
  }
  state.shareTransactions.push(buyTransaction);

  nameInput.value = '';
  percentageInput.value = '';

  // Reset date to current date/time
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  saveState();
  updateOwnershipChart();
  updateShareholdersList();
  updateInvestorSelector();
  updateInvestorView();
}

function sellShares() {
  const nameInput = document.getElementById('investor-name');
  const percentageInput = document.getElementById('share-percentage');
  const dateInput = document.getElementById('share-date');

  const name = nameInput.value.trim();
  const percentage = parseFloat(percentageInput.value);
  const dateValue = dateInput.value;

  if (!name || !percentage) {
    alert('Please enter both name and percentage');
    return;
  }

  if (!dateValue) {
    alert('Please select a date and time');
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

  const pricePerShare = state.currentValue / 100;
  const saleAmount = (percentage / 100) * state.currentValue;

  const transaction = {
    type: 'sell',
    investor: name,
    percentage: percentage,
    amount: saleAmount,
    date: new Date(dateValue).toISOString(),
    pricePerShare: pricePerShare,
    totalValue: state.currentValue,
    soldToMarket: true  // Indicates shares are available for others to buy
  };

  state.shareholders[name].percentage -= percentage;
  state.shareholders[name].transactions = state.shareholders[name].transactions || [];
  state.shareholders[name].transactions.push(transaction);

  // In the new model, sold shares are distributed back to initial investors proportionally
  // This maintains the original investment ratios
  if (state.totalInitialInvestment > 0) {
    Object.entries(state.shareholders).forEach(([investorName, investor]) => {
      if (investorName !== name && investor.initialInvestment > 0) {
        const proportion = investor.initialInvestment / state.totalInitialInvestment;
        const sharesReturned = percentage * proportion;
        investor.percentage += sharesReturned;
      }
    });
  }

  if (state.shareholders[name].percentage < 0.1 &&
      state.shareholders[name].initialInvestment === 0) {
    delete state.shareholders[name];
  }

  if (!state.shareTransactions) {
    state.shareTransactions = [];
  }
  state.shareTransactions.push(transaction);

  nameInput.value = '';
  percentageInput.value = '';

  // Reset date to current date/time
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  saveState();
  updateOwnershipChart();
  updateShareholdersList();
  updateInvestorSelector();
  updateInvestorView();
}

function addTransaction() {
  const typeSelect = document.getElementById('transaction-type');
  const directionSelect = document.getElementById('transaction-direction');
  const amountInput = document.getElementById('transaction-amount');
  const descriptionInput = document.getElementById('transaction-description');
  const dateInput = document.getElementById('transaction-date');

  const type = typeSelect.value;
  const direction = directionSelect.value;
  const amount = parseFloat(amountInput.value);
  const description = descriptionInput.value.trim();
  const dateValue = dateInput.value;

  if (!amount || !description) {
    alert('Please enter amount and description');
    return;
  }

  if (!dateValue) {
    alert('Please select a date and time');
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
    type,
    direction,
    amount: direction === 'expense' ? -amount : amount,
    description,
    date: new Date(dateValue).toISOString(),
    newValue
  });

  amountInput.value = '';
  descriptionInput.value = '';

  // Reset date to current date/time
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  saveState();
  updateTotal();
  updateShareholdersList();
  updateTimeline();
  updateInvestorView();
}

let currentEditIndex = null;

function editTransaction(index) {
  currentEditIndex = index;
  const transaction = state.transactions[index];
  const modal = document.getElementById('edit-modal');

  // Populate modal with current values
  document.getElementById('edit-type').value = transaction.type;
  document.getElementById('edit-direction').value = transaction.direction;
  document.getElementById('edit-amount').value = Math.abs(transaction.amount);
  document.getElementById('edit-description').value = transaction.description;

  // Format date for input
  const date = new Date(transaction.date);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  document.getElementById('edit-date').value = date.toISOString().slice(0, 16);

  modal.style.display = 'flex';
}

function saveEdit() {
  if (currentEditIndex === null) return;

  const type = document.getElementById('edit-type').value;
  const direction = document.getElementById('edit-direction').value;
  const amount = parseFloat(document.getElementById('edit-amount').value);
  const description = document.getElementById('edit-description').value;
  const dateValue = document.getElementById('edit-date').value;

  if (!amount || !description || !dateValue) {
    alert('Please fill all fields');
    return;
  }

  // Update the transaction
  const oldTransaction = state.transactions[currentEditIndex];
  state.transactions[currentEditIndex] = {
    type,
    direction,
    amount: direction === 'expense' ? -amount : amount,
    description,
    date: new Date(dateValue).toISOString(),
    newValue: oldTransaction.newValue // Will recalculate
  };

  recalculateAllValues();
  closeEditModal();
}

function deleteTransaction(index) {
  if (confirm('Are you sure you want to delete this transaction?')) {
    state.transactions.splice(index, 1);
    recalculateAllValues();
  }
}

function recalculateAllValues() {
  // Reset to initial value
  state.currentValue = state.totalInitialInvestment || 0;

  // Recalculate based on all transactions
  state.transactions.forEach(transaction => {
    if (transaction.direction === 'expense') {
      state.currentValue += transaction.amount; // amount is already negative
    } else {
      state.currentValue += Math.abs(transaction.amount);
    }
    transaction.newValue = state.currentValue;
  });

  saveState();
  updateTotal();
  updateShareholdersList();
  updateTimeline();
  updateInvestorView();
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  currentEditIndex = null;
}

function resetData() {
  if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
    state = {
      initialInvestments: [],
      totalInitialInvestment: 0,
      shareholders: {},
      transactions: [],
      currentValue: 0,
      shareTransactions: []
    };
    saveState();
    updateInitialInvestmentsList();
    updateOwnershipChart();
    updateShareholdersList();
    updateTimeline();
    updateTotal();
    updateInvestorSelector();
    updateInvestorView();
  }
}

let currentShareEditInfo = null;

function editShareTransaction(investorName, index) {
  const investor = state.shareholders[investorName];
  if (!investor || !investor.transactions || !investor.transactions[index]) return;

  currentShareEditInfo = { investorName, index };
  const transaction = investor.transactions[index];
  const modal = document.getElementById('edit-share-modal');

  // Populate modal with current values
  document.getElementById('edit-share-investor').value = investorName;
  document.getElementById('edit-share-type').value = transaction.type;
  document.getElementById('edit-share-percentage').value = transaction.percentage;

  // Format date for input
  const date = new Date(transaction.date);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  document.getElementById('edit-share-date').value = date.toISOString().slice(0, 16);

  // Update calculated value
  updateEditCalculatedValue();

  modal.style.display = 'flex';
}

function updateEditCalculatedValue() {
  const percentageInput = document.getElementById('edit-share-percentage');
  const calculatedValueDiv = document.getElementById('edit-calculated-value');

  const percentage = parseFloat(percentageInput.value) || 0;
  const value = (percentage / 100) * state.currentValue;

  calculatedValueDiv.textContent = `Value: ${formatCurrency(value)}`;
}

function saveShareEdit() {
  if (!currentShareEditInfo) return;

  const { investorName, index } = currentShareEditInfo;
  const type = document.getElementById('edit-share-type').value;
  const percentage = parseFloat(document.getElementById('edit-share-percentage').value);
  const dateValue = document.getElementById('edit-share-date').value;

  if (!percentage || !dateValue) {
    alert('Please fill all fields');
    return;
  }

  if (percentage < 0.1 || percentage > 49) {
    alert('Percentage must be between 0.1 and 49');
    return;
  }

  const investor = state.shareholders[investorName];
  const oldTransaction = investor.transactions[index];

  // Calculate the net effect of this edit on ownership
  let percentageChange = 0;
  if (oldTransaction.type === 'buy' && type === 'sell') {
    percentageChange = -oldTransaction.percentage - percentage;
  } else if (oldTransaction.type === 'sell' && type === 'buy') {
    percentageChange = oldTransaction.percentage + percentage;
  } else if (oldTransaction.type === type) {
    percentageChange = percentage - oldTransaction.percentage;
  }

  // Validate the change won't break ownership rules
  if (investorName === 'ET') {
    const newETPercentage = state.shareholders['ET'].percentage + percentageChange;
    if (newETPercentage < 51) {
      alert('ET must maintain at least 51% ownership');
      return;
    }
  } else {
    const newInvestorPercentage = investor.percentage + percentageChange;
    if (newInvestorPercentage < 0) {
      alert('This change would result in negative ownership');
      return;
    }
    if (newInvestorPercentage > 49) {
      alert('Non-ET investors cannot own more than 49%');
      return;
    }
  }

  // Update the transaction
  const pricePerShare = state.currentValue / 100;
  const amount = (percentage / 100) * state.currentValue;

  investor.transactions[index] = {
    type,
    percentage,
    amount,
    date: new Date(dateValue).toISOString(),
    pricePerShare,
    totalValue: state.currentValue
  };

  recalculateShareOwnership();
  closeShareEditModal();
}

function deleteShareTransaction(investorName, index) {
  if (!confirm('Are you sure you want to delete this share transaction?')) return;

  const investor = state.shareholders[investorName];
  if (!investor || !investor.transactions || !investor.transactions[index]) return;

  const transaction = investor.transactions[index];

  // Check if deleting this would violate ownership rules
  if (investorName === 'ET' && transaction.type === 'buy') {
    const etPercentageAfter = state.shareholders['ET'].percentage - transaction.percentage;
    if (etPercentageAfter < 51) {
      alert('Cannot delete: ET must maintain at least 51% ownership');
      return;
    }
  }

  // Remove the transaction
  investor.transactions.splice(index, 1);

  // If this was the last transaction for a non-ET investor, remove them
  if (investorName !== 'ET' && investor.transactions.length === 0) {
    delete state.shareholders[investorName];
  }

  recalculateShareOwnership();
}

function recalculateShareOwnership() {
  // Reset all shareholders to 0
  const newShareholders = { 'ET': { percentage: 100, investment: state.totalInitialInvestment || 0, transactions: [] } };

  // Rebuild ownership from all transactions
  Object.entries(state.shareholders).forEach(([name, data]) => {
    if (data.transactions && data.transactions.length > 0) {
      if (!newShareholders[name]) {
        newShareholders[name] = { percentage: 0, investment: 0, transactions: [] };
      }

      data.transactions.forEach(t => {
        newShareholders[name].transactions.push(t);

        if (t.type === 'buy') {
          newShareholders[name].percentage += t.percentage;
          newShareholders[name].investment += t.amount;
          if (name !== 'ET') {
            newShareholders['ET'].percentage -= t.percentage;
          }
        } else if (t.type === 'sell') {
          newShareholders[name].percentage -= t.percentage;
          newShareholders[name].investment -= t.amount;
          if (name !== 'ET') {
            newShareholders['ET'].percentage += t.percentage;
          }
        }
      });
    }
  });

  // Clean up investors with 0 or negative percentage
  Object.keys(newShareholders).forEach(name => {
    if (name !== 'ET' && newShareholders[name].percentage <= 0) {
      delete newShareholders[name];
    }
  });

  state.shareholders = newShareholders;

  saveState();
  updateOwnershipChart();
  updateShareholdersList();
  updateInvestorSelector();
  updateInvestorView();
}

function closeShareEditModal() {
  document.getElementById('edit-share-modal').style.display = 'none';
  currentShareEditInfo = null;
}

// Make functions globally accessible
window.editTransaction = editTransaction;
window.deleteTransaction = deleteTransaction;
window.editShareTransaction = editShareTransaction;
window.deleteShareTransaction = deleteShareTransaction;

function updateCalculatedValue() {
  const percentageInput = document.getElementById('share-percentage');
  const calculatedValueDiv = document.getElementById('calculated-value');

  const percentage = parseFloat(percentageInput.value) || 0;
  const value = (percentage / 100) * state.currentValue;

  calculatedValueDiv.textContent = `Value: ${formatCurrency(value)}`;
}

function init() {
  const canvas = document.getElementById('pieChart');
  canvas.width = 300;
  canvas.height = 300;

  // Set default dates to now
  const shareDateInput = document.getElementById('share-date');
  const transactionDateInput = document.getElementById('transaction-date');
  const initialDateInput = document.getElementById('initial-date');
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const nowString = now.toISOString().slice(0, 16);
  shareDateInput.value = nowString;
  transactionDateInput.value = nowString;
  initialDateInput.value = nowString;

  document.getElementById('add-initial-investment').addEventListener('click', addInitialInvestment);
  document.getElementById('buy-shares').addEventListener('click', buyShares);
  document.getElementById('sell-shares').addEventListener('click', sellShares);
  document.getElementById('add-transaction').addEventListener('click', addTransaction);
  document.getElementById('reset-data').addEventListener('click', resetData);
  document.getElementById('save-edit').addEventListener('click', saveEdit);
  document.getElementById('cancel-edit').addEventListener('click', closeEditModal);
  document.getElementById('save-share-edit').addEventListener('click', saveShareEdit);
  document.getElementById('cancel-share-edit').addEventListener('click', closeShareEditModal);
  document.getElementById('save-initial-edit').addEventListener('click', saveInitialEdit);
  document.getElementById('cancel-initial-edit').addEventListener('click', closeInitialEditModal);

  // Update calculated value when percentage changes in edit modal
  document.getElementById('edit-share-percentage').addEventListener('input', updateEditCalculatedValue);

  // Close modals when clicking outside
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') {
      closeEditModal();
    }
  });

  document.getElementById('edit-share-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-share-modal') {
      closeShareEditModal();
    }
  });

  document.getElementById('edit-initial-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-initial-modal') {
      closeInitialEditModal();
    }
  });

  document.getElementById('current-investor').addEventListener('change', (e) => {
    currentInvestor = e.target.value;
    updateInvestorView();
  });

  document.getElementById('share-percentage').addEventListener('input', updateCalculatedValue);

  document.getElementById('investor-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') buyShares();
  });

  document.getElementById('share-percentage').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') buyShares();
  });

  document.getElementById('transaction-description').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTransaction();
  });

  updateInitialInvestmentsList();
  updateOwnershipChart();
  updateShareholdersList();
  updateTimeline();
  updateTotal();
  updateInvestorSelector();
  updateInvestorView();
  updateCalculatedValue();
}

document.addEventListener('DOMContentLoaded', init);