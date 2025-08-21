import './style.css'

function loadState() {
  const saved = localStorage.getItem('investmentStateDynamic');
  if (saved) {
    return JSON.parse(saved);
  }
  return {
    shareholders: {},      // Individual shareholders with investment amounts
    transactions: [],      // All transactions (income/expenses)
    investments: []        // Investment history
  };
}

function saveState() {
  localStorage.setItem('investmentStateDynamic', JSON.stringify(state));
}

let state = loadState();
let currentInvestor = 'all';
let transactionDisplayCount = 15; // Number of transactions to show initially
let chartTimeRange = '6M'; // Default to 6 months
let selectedDate = new Date(); // Date selected by the slider, default to today
let chartDataPoints = []; // Store chart data points globally for slider interaction

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

function getTotalInvestment() {
  // Sum of all investments minus withdrawals (including future)
  let total = 0;
  state.investments.forEach(inv => {
    if (inv.type === 'investment') {
      total += inv.amount;
    } else if (inv.type === 'withdrawal') {
      total -= inv.amount;
    }
  });
  return total;
}

function getTotalInvestmentToDate() {
  // Sum of investments up to today only
  const today = new Date();
  let total = 0;
  
  state.investments.forEach(inv => {
    if (new Date(inv.date) <= today) {
      if (inv.type === 'investment') {
        total += inv.amount;
      } else if (inv.type === 'withdrawal') {
        total -= inv.amount;
      }
    }
  });
  
  return total;
}

function getOwnershipPercentage(shareholderName, asOfDate = null) {
  // Calculate ownership based on remaining stake after withdrawals
  // When you withdraw, you ARE selling part of your ownership stake
  
  const targetDate = asOfDate || new Date();
  
  // Track each investor's remaining ownership stake
  const investorStakes = {};
  
  // Process chronologically to track ownership changes
  const sortedEvents = [...state.investments]
    .filter(inv => new Date(inv.date) <= targetDate)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  sortedEvents.forEach(event => {
    if (event.type === 'investment') {
      // Investment creates ownership stake
      if (!investorStakes[event.investor]) {
        investorStakes[event.investor] = 0;
      }
      investorStakes[event.investor] += event.amount;
      
    } else if (event.type === 'withdrawal') {
      // When someone withdraws, they reduce their ownership proportionally
      // But we need to ensure other investors' absolute values don't change
      if (investorStakes[event.investor]) {
        // Calculate company value at this point
        let companyValueBefore = 0;
        state.investments.forEach(inv => {
          if (new Date(inv.date) <= new Date(event.date)) {
            if (inv.type === 'investment') {
              companyValueBefore += inv.amount;
            } else if (inv.type === 'withdrawal' && inv !== event) {
              companyValueBefore -= inv.amount;
            }
          }
        });
        state.transactions.forEach(trans => {
          if (new Date(trans.date) <= new Date(event.date)) {
            companyValueBefore += trans.amount;
          }
        });
        
        // Calculate what portion of their value they're withdrawing
        const totalStakesBefore = Object.values(investorStakes).reduce((a, b) => a + b, 0);
        const ownershipBefore = investorStakes[event.investor] / totalStakesBefore;
        const theirValueBefore = companyValueBefore * ownershipBefore;
        
        if (theirValueBefore > 0) {
          // They're withdrawing this fraction of their stake
          const fractionWithdrawn = event.amount / theirValueBefore;
          // Reduce their stake by that fraction
          investorStakes[event.investor] *= (1 - fractionWithdrawn);
          
          // Clean up tiny amounts
          if (investorStakes[event.investor] < 0.01) {
            delete investorStakes[event.investor];
          }
        }
      }
    }
  });
  
  // Calculate percentage ownership
  const totalStakes = Object.values(investorStakes).reduce((a, b) => a + b, 0);
  if (totalStakes === 0) return 0;
  
  const shareholderStake = investorStakes[shareholderName] || 0;
  return (shareholderStake / totalStakes) * 100;
}

function getCurrentValue(asOfDate = null) {
  // Company value is the sum of all investments plus/minus operational transactions
  const targetDate = asOfDate || new Date();
  let value = 0;
  
  // Add all investments up to target date
  const pastInvestments = state.investments.filter(i => new Date(i.date) <= targetDate);
  pastInvestments.forEach(i => {
    if (i.type === 'investment') {
      value += i.amount;
    } else if (i.type === 'withdrawal') {
      value -= i.amount;
    }
  });
  
  // Add all operational transactions up to target date
  const pastTransactions = state.transactions.filter(t => new Date(t.date) <= targetDate);
  pastTransactions.forEach(t => {
    value += t.amount; // amount is already negative for expenses
  });
  
  return value;
}

// Removed setInitialValuation - not needed in dynamic model

function invest() {
  const nameInput = document.getElementById('investor-name');
  const amountInput = document.getElementById('investment-amount');
  const dateInput = document.getElementById('investment-date');
  
  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const dateValue = dateInput.value;
  
  if (!name || !amount || !dateValue) {
    alert('Please fill in all fields');
    return;
  }
  
  if (amount <= 0) {
    alert('Please enter a valid investment amount');
    return;
  }
  
  // Create or update shareholder
  if (!state.shareholders[name]) {
    state.shareholders[name] = {
      transactions: []
    };
  }
  
  // Record investment
  const investment = {
    type: 'investment',
    investor: name,
    amount: amount,
    date: new Date(dateValue).toISOString(),
    companyValueBefore: getCurrentValue()
  };
  
  // Track the investment
  state.shareholders[name].transactions.push(investment);
  
  // Add to investments list
  state.investments.push(investment);
  
  // Clear inputs
  nameInput.value = '';
  amountInput.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);
  
  saveState();
  updateAll();
}

function withdraw() {
  const nameInput = document.getElementById('investor-name');
  const amountInput = document.getElementById('investment-amount');
  const dateInput = document.getElementById('investment-date');
  
  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const dateValue = dateInput.value;
  
  if (!name || !amount || !dateValue) {
    alert('Please fill in all fields');
    return;
  }
  
  if (!state.shareholders[name]) {
    alert(`${name} is not an investor`);
    return;
  }
  
  const ownership = getOwnershipPercentage(name) / 100;
  const currentCompanyValue = getCurrentValue();
  const yourCurrentValue = currentCompanyValue * ownership;
  
  if (amount > yourCurrentValue) {
    alert(`${name} can only withdraw up to ${formatCurrency(yourCurrentValue)} based on their ${(ownership * 100).toFixed(2)}% ownership`);
    return;
  }
  
  // Record withdrawal - simple cash out transaction
  const withdrawal = {
    type: 'withdrawal',
    investor: name,
    amount: amount,  // Cash amount being withdrawn
    date: new Date(dateValue).toISOString()
  };
  
  // Update shareholder records
  state.shareholders[name].transactions.push(withdrawal);
  
  // Add to investments list
  state.investments.push(withdrawal);
  
  // Check if shareholder has withdrawn everything
  const remainingValue = yourCurrentValue - amount;
  if (remainingValue < 0.01) {
    delete state.shareholders[name];
  }
  
  // Clear inputs
  nameInput.value = '';
  amountInput.value = '';
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
  
  // Check if this would result in negative company value
  const currentValue = getCurrentValue();
  if (currentValue + amountChange < 0) {
    alert('Transaction would result in negative company value');
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
  
  const totalInvestment = getTotalInvestmentToDate();
  if (totalInvestment === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No investments yet', centerX, centerY);
    return;
  }
  
  let startAngle = -Math.PI / 2;
  const colors = ['#4a90e2', '#50c878', '#ff6b6b', '#ffd700', '#9370db', '#ff9f40', '#20b2aa', '#ff69b4'];
  let colorIndex = 0;
  
  // Get all investors who have any ownership stake up to today
  const today = new Date();
  const investors = new Set();
  
  state.investments.forEach(inv => {
    if (new Date(inv.date) <= today) {
      investors.add(inv.investor);
    }
  });
  
  // Draw each investor's ownership based on their percentage
  [...investors].forEach(name => {
    const percentage = getOwnershipPercentage(name);
    if (percentage > 0) {
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
  
  const todayValue = getCurrentValue(); // This already filters to today
  const totalInvestment = getTotalInvestmentToDate(); // New function to get investments up to today
  
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Investor</th>
        <th>Net Invested</th>
        <th>Ownership %</th>
        <th>Current Value</th>
        <th>Profit/Loss</th>
        <th>ROI</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector('tbody');
  
  // Add investor rows - only show investors with investments up to today
  const today = new Date();
  const investorDataToDate = {};
  
  // Calculate each investor's positions
  const investorData = {};  // Track all investor data
  
  state.investments.forEach(inv => {
    if (new Date(inv.date) <= today) {
      if (!investorData[inv.investor]) {
        investorData[inv.investor] = {
          totalInvested: 0,
          totalWithdrawn: 0,
          netInvested: 0
        };
      }
      
      if (inv.type === 'investment') {
        investorData[inv.investor].totalInvested += inv.amount;
        investorData[inv.investor].netInvested += inv.amount;
      } else if (inv.type === 'withdrawal') {
        investorData[inv.investor].totalWithdrawn += inv.amount;
        investorData[inv.investor].netInvested -= inv.amount;
      }
    }
  });
  
  Object.entries(investorData).forEach(([name, data]) => {
    // Only show investors who still have a position
    const percentage = getOwnershipPercentage(name);
    if (percentage > 0) {
      const currentValue = (percentage / 100) * todayValue;
      
      // Calculate total return (current value + withdrawals - investments)
      const totalReturn = currentValue + data.totalWithdrawn - data.totalInvested;
      
      // ROI is based on original investment, not net invested
      const roi = data.totalInvested > 0 ? (totalReturn / data.totalInvested) * 100 : 0;
      
      // Profit/Loss for display (based on net position)
      const profit = currentValue - data.netInvested;
      const profitClass = profit >= 0 ? 'gain' : 'loss';
      
      const row = document.createElement('tr');
      const roiDisplay = `${roi.toFixed(1)}%`;
      row.innerHTML = `
        <td>${name}</td>
        <td>${formatCurrency(data.netInvested)}</td>
        <td>${percentage.toFixed(1)}%</td>
        <td>${formatCurrency(currentValue)}</td>
        <td class="${profitClass}">${formatCurrency(profit)}</td>
        <td class="${profitClass}">${roiDisplay}</td>
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
      <strong>Total Investment:</strong> ${formatCurrency(totalInvestment)}
    </div>
    <div class="summary-item">
      <strong>Company Value:</strong> ${formatCurrency(todayValue)}
    </div>
    <div class="summary-item">
      <strong>Total Return:</strong> ${formatCurrency(todayValue - totalInvestment)}
    </div>
  `;
  list.appendChild(summary);
}

function updateTotal() {
  const todayValue = getCurrentValue();
  const totalInvestment = getTotalInvestment();
  
  document.getElementById('total').textContent = formatCurrency(todayValue).replace('$', '');
  document.getElementById('total-investment').textContent = formatCurrency(totalInvestment).replace('$', '');
}

function updateCalculatedOwnership() {
  const nameInput = document.getElementById('investor-name');
  const amountInput = document.getElementById('investment-amount');
  const calculatedOwnershipDiv = document.getElementById('calculated-ownership');
  
  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value) || 0;
  
  if (amount <= 0) {
    calculatedOwnershipDiv.textContent = 'Ownership: 0%';
    return;
  }
  
  // Calculate what ownership percentage this investment would give
  const totalInvestmentAfter = getTotalInvestment() + amount;
  const newOwnership = (amount / totalInvestmentAfter) * 100;
  
  // If investor already exists, show their new total ownership
  if (name && state.shareholders[name]) {
    // Calculate existing investment amount from transactions
    let existingInvestment = 0;
    state.investments.forEach(inv => {
      if (inv.investor === name) {
        if (inv.type === 'investment') {
          existingInvestment += inv.amount;
        } else if (inv.type === 'withdrawal') {
          existingInvestment -= inv.amount;
        }
      }
    });
    const totalInvestorAmount = existingInvestment + amount;
    const totalOwnership = (totalInvestorAmount / totalInvestmentAfter) * 100;
    calculatedOwnershipDiv.textContent = `New ownership: ${totalOwnership.toFixed(1)}% (was ${getOwnershipPercentage(name).toFixed(1)}%)`;
  } else {
    calculatedOwnershipDiv.textContent = `Will own: ${newOwnership.toFixed(1)}%`;
  }
}

function deleteTransaction(category, index) {
  const confirmMessage = category === 'investment' 
    ? 'Are you sure you want to delete this investment? This will affect ownership percentages.'
    : 'Are you sure you want to delete this transaction?';
  
  if (confirm(confirmMessage)) {
    if (category === 'investment') {
      const inv = state.investments[index];
      // Remove from investor's records
      if (inv.investor && state.shareholders[inv.investor]) {
        const shareholder = state.shareholders[inv.investor];
        shareholder.transactions = shareholder.transactions.filter(t => 
          !(t.date === inv.date && t.amount === inv.amount)
        );
        
        // Check if investor has any remaining investments
        let remainingInvestment = 0;
        state.investments.forEach((investment, i) => {
          if (i !== index && investment.investor === inv.investor) {
            if (investment.type === 'investment') {
              remainingInvestment += investment.amount;
            } else if (investment.type === 'withdrawal') {
              remainingInvestment -= investment.amount;
            }
          }
        });
        
        // Remove shareholder if no investment left
        if (remainingInvestment <= 0) {
          delete state.shareholders[inv.investor];
        }
      }
      state.investments.splice(index, 1);
    } else {
      state.transactions.splice(index, 1);
    }
    
    saveState();
    updateAll();
  }
}

function editTransaction(category, index) {
  const item = category === 'investment' ? state.investments[index] : state.transactions[index];
  
  // Create modal HTML
  const modalHtml = `
    <div id="edit-modal" class="modal">
      <div class="modal-content">
        <h2>Edit ${category === 'investment' ? 'Investment' : 'Transaction'}</h2>
        <div class="modal-form">
          ${category === 'investment' ? `
            <label>Investor: <input type="text" id="edit-investor" value="${item.investor}" /></label>
            <label>Amount: <input type="number" id="edit-amount" value="${item.amount}" step="0.01" /></label>
          ` : `
            <label>Type: 
              <select id="edit-direction">
                <option value="income" ${item.direction === 'income' ? 'selected' : ''}>Income</option>
                <option value="expense" ${item.direction === 'expense' ? 'selected' : ''}>Expense</option>
              </select>
            </label>
            <label>Amount: <input type="number" id="edit-amount" value="${Math.abs(item.amount)}" step="0.01" /></label>
            <label>Description: <input type="text" id="edit-description" value="${item.description}" /></label>
          `}
          <label>Date: <input type="datetime-local" id="edit-date" value="${new Date(item.date).toISOString().slice(0, 16)}" /></label>
        </div>
        <div class="modal-buttons">
          <button id="save-edit" class="primary-btn">Save</button>
          <button id="cancel-edit" class="secondary-btn">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = document.getElementById('edit-modal');
  
  // Save handler
  document.getElementById('save-edit').addEventListener('click', () => {
    if (category === 'investment') {
      const oldInvestor = item.investor;
      
      item.investor = document.getElementById('edit-investor').value;
      item.amount = parseFloat(document.getElementById('edit-amount').value);
      item.date = new Date(document.getElementById('edit-date').value).toISOString();
      
      // Update shareholder records if investor changed
      if (oldInvestor !== item.investor) {
        // Remove from old investor's transactions
        if (oldInvestor && state.shareholders[oldInvestor]) {
          state.shareholders[oldInvestor].transactions = 
            state.shareholders[oldInvestor].transactions.filter(t => t !== item);
          
          // Check if old investor has any remaining investments
          let remainingInvestment = 0;
          state.investments.forEach(inv => {
            if (inv.investor === oldInvestor) {
              if (inv.type === 'investment') {
                remainingInvestment += inv.amount;
              } else if (inv.type === 'withdrawal') {
                remainingInvestment -= inv.amount;
              }
            }
          });
          
          if (remainingInvestment <= 0) {
            delete state.shareholders[oldInvestor];
          }
        }
        
        // Add to new investor
        if (!state.shareholders[item.investor]) {
          state.shareholders[item.investor] = {
            transactions: []
          };
        }
        state.shareholders[item.investor].transactions.push(item);
      }
    } else {
      const direction = document.getElementById('edit-direction').value;
      const amount = parseFloat(document.getElementById('edit-amount').value);
      
      item.direction = direction;
      item.amount = direction === 'expense' ? -amount : amount;
      item.description = document.getElementById('edit-description').value;
      item.date = new Date(document.getElementById('edit-date').value).toISOString();
    }
    
    saveState();
    updateAll();
    modal.remove();
  });
  
  // Cancel handler
  document.getElementById('cancel-edit').addEventListener('click', () => {
    modal.remove();
  });
  
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  const date = new Date().toISOString().split('T')[0];
  link.download = `investment-data-${date}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function importData() {
  const fileInput = document.getElementById('import-file');
  fileInput.click();
}

function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      
      // Validate the imported data has the expected structure
      if (typeof importedData !== 'object' || 
          !importedData.hasOwnProperty('shareholders') ||
          !importedData.hasOwnProperty('transactions') ||
          !importedData.hasOwnProperty('investments')) {
        alert('Invalid data format. Please select a valid investment data file.');
        return;
      }
      
      if (confirm('This will replace all existing data. Are you sure you want to continue?')) {
        state = importedData;
        saveState();
        location.reload();
      }
    } catch (error) {
      alert('Error reading file. Please make sure it is a valid JSON file.');
      console.error('Import error:', error);
    }
  };
  
  reader.readAsText(file);
  // Reset the file input so the same file can be imported again if needed
  event.target.value = '';
}

function sanitizeData() {
  if (confirm('This will clean up old data formats and remove unnecessary stored values. Continue?')) {
    let changesMade = false;
    
    // Clean up withdrawal records - remove stored calculated values
    state.investments.forEach(inv => {
      if (inv.type === 'withdrawal') {
        // Remove old calculated fields that shouldn't be stored
        if (inv.companyValueBefore !== undefined) {
          delete inv.companyValueBefore;
          changesMade = true;
        }
        if (inv.ownershipBefore !== undefined) {
          delete inv.ownershipBefore;
          changesMade = true;
        }
        if (inv.investmentPortion !== undefined) {
          delete inv.investmentPortion;
          changesMade = true;
        }
      }
    });
    
    // Clean up shareholder records - remove investedAmount if it exists
    Object.values(state.shareholders).forEach(shareholder => {
      if (shareholder.investedAmount !== undefined) {
        delete shareholder.investedAmount;
        changesMade = true;
      }
    });
    
    if (changesMade) {
      saveState();
      alert('Data has been sanitized successfully. The page will reload.');
      location.reload();
    } else {
      alert('No data needed sanitizing.');
    }
  }
}

function resetData() {
  if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
    state = {
      shareholders: {},
      transactions: [],
      investments: []
    };
    saveState();
    location.reload();
  }
}

function drawSlider(ctx, padding, width, height, minDate, maxDate, dateRange) {
  // Calculate slider position based on selected date
  const sliderX = padding + ((selectedDate - minDate) / dateRange) * width;
  
  // Don't draw if slider is outside the visible range
  if (sliderX < padding || sliderX > padding + width) return;
  
  // Draw slider line
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sliderX, padding);
  ctx.lineTo(sliderX, padding + height);
  ctx.stroke();
  
  // Draw slider handle (circle at top)
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(sliderX, padding - 10, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw date label for slider
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  const dateStr = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  ctx.fillText(dateStr, sliderX, padding - 20);
  
  // Find value at selected date
  let valueAtDate = 0;
  for (let i = 0; i < chartDataPoints.length; i++) {
    if (chartDataPoints[i].date <= selectedDate.getTime()) {
      valueAtDate = chartDataPoints[i].value;
    } else {
      break;
    }
  }
  
  // Draw value label
  ctx.fillText(formatCurrency(valueAtDate), sliderX, padding - 32);
}

function setupChartInteraction(canvas, pointLocations, padding, width, height, minDate, maxDate, dateRange) {
  let isDragging = false;
  
  // Remove any existing tooltip first
  const existingTooltip = document.getElementById('chart-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }
  
  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.id = 'chart-tooltip';
  tooltip.style.cssText = `
    position: absolute;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    display: none;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    max-width: 250px;
  `;
  document.body.appendChild(tooltip);
  
  // Combined mouse handlers
  canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Check if clicking near the slider
    const sliderX = padding + ((selectedDate - minDate) / dateRange) * width;
    if (Math.abs(mouseX - sliderX) < 10 && mouseY >= padding - 16 && mouseY <= padding + height) {
      isDragging = true;
      canvas.style.cursor = 'grabbing';
    }
  };
  
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (isDragging) {
      // Update slider position
      const newX = Math.max(padding, Math.min(padding + width, mouseX));
      const percentage = (newX - padding) / width;
      selectedDate = new Date(minDate.getTime() + percentage * dateRange);
      
      // Update ownership structure for selected date
      updateOwnershipForDate(selectedDate);
      
      // Redraw only the chart content without resizing or re-adding event handlers
      redrawChartContent(canvas);
      
      // Hide tooltip while dragging
      tooltip.style.display = 'none';
    } else {
      // Check if hovering over slider
      const sliderX = padding + ((selectedDate - minDate) / dateRange) * width;
      if (Math.abs(mouseX - sliderX) < 10 && mouseY >= padding - 16 && mouseY <= padding + height) {
        canvas.style.cursor = 'grab';
        tooltip.style.display = 'none';
      } else {
        canvas.style.cursor = 'default';
        
        // Check if mouse is over any point for tooltip
        let hoveredPoint = null;
        for (const point of pointLocations) {
          const distance = Math.sqrt(
            Math.pow(mouseX - point.x, 2) + 
            Math.pow(mouseY - point.y, 2)
          );
          
          if (distance <= point.radius) {
            hoveredPoint = point;
            break;
          }
        }
        
        if (hoveredPoint && hoveredPoint.data.description) {
          // Show tooltip
          const data = hoveredPoint.data;
          const dateStr = data.dateObj ? 
            data.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) :
            'N/A';
          
          let amountStr = '';
          if (data.amount !== undefined) {
            const amountClass = data.amount >= 0 ? 'color: #27ae60;' : 'color: #e74c3c;';
            amountStr = `<div style="${amountClass}"><strong>${formatCurrency(Math.abs(data.amount))}</strong></div>`;
          }
          
          let ownershipStr = '';
          if (data.ownershipPercent !== undefined) {
            ownershipStr = `<div style="color: #ffd700; font-size: 11px;">Ownership: ${data.ownershipPercent.toFixed(1)}%</div>`;
          }
          
          const balanceLabel = currentInvestor !== 'all' ? 'Portfolio Value' : 'Balance';
          
          tooltip.innerHTML = `
            <div style="margin-bottom: 4px;"><strong>${data.description}</strong></div>
            <div style="color: #999; font-size: 11px;">${dateStr}</div>
            ${amountStr}
            ${ownershipStr}
            <div style="color: #999; font-size: 11px; margin-top: 4px;">${balanceLabel}: ${formatCurrency(data.value)}</div>
          `;
          
          // Position tooltip
          tooltip.style.display = 'block';
          const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
          const scrollY = window.pageYOffset || document.documentElement.scrollTop;
          
          tooltip.style.left = (rect.left + scrollX + hoveredPoint.x + 10) + 'px';
          tooltip.style.top = (rect.top + scrollY + hoveredPoint.y - 30) + 'px';
          
          // Adjust position if tooltip goes off screen
          const tooltipRect = tooltip.getBoundingClientRect();
          if (tooltipRect.right > window.innerWidth) {
            tooltip.style.left = (rect.left + scrollX + hoveredPoint.x - tooltipRect.width - 10) + 'px';
          }
          if (tooltipRect.top < 0) {
            tooltip.style.top = (rect.top + scrollY + hoveredPoint.y + 10) + 'px';
          }
          
          canvas.style.cursor = 'pointer';
        } else {
          tooltip.style.display = 'none';
        }
      }
    }
  };
  
  canvas.onmouseup = () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  };
  
  canvas.onmouseleave = () => {
    isDragging = false;
    canvas.style.cursor = 'default';
    tooltip.style.display = 'none';
  };
}

function updateOwnershipForDate(date) {
  // Update the ownership structure based on the selected date
  // Store the selected date for display purposes
  const dateElement = document.getElementById('shareholders-list');
  if (dateElement) {
    // Find existing date indicator or create one
    let dateIndicator = document.getElementById('ownership-date-indicator');
    if (!dateIndicator) {
      dateIndicator = document.createElement('div');
      dateIndicator.id = 'ownership-date-indicator';
      dateIndicator.style.cssText = `
        background: #ffd700;
        color: #000;
        padding: 5px 10px;
        border-radius: 4px;
        margin-bottom: 10px;
        font-weight: bold;
        text-align: center;
      `;
    }
    
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (!isToday) {
      dateIndicator.textContent = `Viewing ownership as of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      if (dateElement.firstChild) {
        dateElement.insertBefore(dateIndicator, dateElement.firstChild);
      } else {
        dateElement.appendChild(dateIndicator);
      }
    } else if (dateIndicator.parentNode) {
      dateIndicator.remove();
    }
  }
  
  // Update ownership displays with the selected date
  updateOwnershipChartForDate(date);
  updateShareholdersListForDate(date);
  updateTotalForDate(date);
}

function updateOwnershipChartForDate(date) {
  const canvas = document.getElementById('pieChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 10;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Calculate total investment up to the specified date
  let totalInvestment = 0;
  state.investments.forEach(inv => {
    if (new Date(inv.date) <= date) {
      if (inv.type === 'investment') {
        totalInvestment += inv.amount;
      } else if (inv.type === 'withdrawal') {
        totalInvestment -= inv.amount;
      }
    }
  });
  
  if (totalInvestment === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No investments yet', centerX, centerY);
    return;
  }
  
  let startAngle = -Math.PI / 2;
  const colors = ['#4a90e2', '#50c878', '#ff6b6b', '#ffd700', '#9370db', '#ff9f40', '#20b2aa', '#ff69b4'];
  let colorIndex = 0;
  
  // Get all investors who have any ownership stake
  const investors = new Set();
  state.investments.forEach(inv => {
    if (new Date(inv.date) <= date) {
      investors.add(inv.investor);
    }
  });
  
  // Draw each investor's ownership based on their percentage (not net invested)
  [...investors].forEach(name => {
    const percentage = getOwnershipPercentage(name, date);
    if (percentage > 0) {
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

function updateShareholdersListForDate(date) {
  const list = document.getElementById('shareholders-list');
  if (!list) return;
  
  // Preserve the date indicator if it exists
  const dateIndicator = document.getElementById('ownership-date-indicator');
  
  list.innerHTML = '<h3>Ownership Structure</h3>';
  
  // Re-add the date indicator if it existed
  if (dateIndicator) {
    list.appendChild(dateIndicator);
  }
  
  const targetValue = getCurrentValue(date);
  
  // Calculate investor data up to the specified date
  let totalInvestment = 0;
  const investorData = {};
  
  state.investments.forEach(inv => {
    if (new Date(inv.date) <= date) {
      if (!investorData[inv.investor]) {
        investorData[inv.investor] = {
          totalInvested: 0,
          totalWithdrawn: 0,
          netInvested: 0
        };
      }
      
      if (inv.type === 'investment') {
        totalInvestment += inv.amount;
        investorData[inv.investor].totalInvested += inv.amount;
        investorData[inv.investor].netInvested += inv.amount;
      } else if (inv.type === 'withdrawal') {
        totalInvestment -= inv.amount;
        investorData[inv.investor].totalWithdrawn += inv.amount;
        investorData[inv.investor].netInvested -= inv.amount;
      }
    }
  });
  
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Investor</th>
        <th>Net Invested</th>
        <th>Ownership %</th>
        <th>Current Value</th>
        <th>Profit/Loss</th>
        <th>ROI</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector('tbody');
  
  Object.entries(investorData).forEach(([name, data]) => {
    const percentage = getOwnershipPercentage(name, date);
    if (percentage > 0) {
      const currentValue = (percentage / 100) * targetValue;
      
      // Calculate total return (current value + withdrawals - investments)
      const totalReturn = currentValue + data.totalWithdrawn - data.totalInvested;
      
      // ROI is based on original investment
      const roi = data.totalInvested > 0 ? (totalReturn / data.totalInvested) * 100 : 0;
      
      // Profit/Loss for display
      const profit = currentValue - data.netInvested;
      const profitClass = profit >= 0 ? 'gain' : 'loss';
      
      const row = document.createElement('tr');
      const roiDisplay = `${roi.toFixed(1)}%`;
      row.innerHTML = `
        <td>${name}</td>
        <td>${formatCurrency(data.netInvested)}</td>
        <td>${percentage.toFixed(1)}%</td>
        <td>${formatCurrency(currentValue)}</td>
        <td class="${profitClass}">${formatCurrency(profit)}</td>
        <td class="${profitClass}">${roiDisplay}</td>
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
      <strong>Total Investment:</strong> ${formatCurrency(totalInvestment)}
    </div>
    <div class="summary-item">
      <strong>Company Value:</strong> ${formatCurrency(targetValue)}
    </div>
    <div class="summary-item">
      <strong>Total Return:</strong> ${formatCurrency(targetValue - totalInvestment)}
    </div>
  `;
  list.appendChild(summary);
}

function updateTotalForDate(date) {
  const targetValue = getCurrentValue(date);
  
  // Calculate total investment up to the specified date
  let totalInvestment = 0;
  state.investments.forEach(inv => {
    if (new Date(inv.date) <= date) {
      if (inv.type === 'investment') {
        totalInvestment += inv.amount;
      } else if (inv.type === 'withdrawal') {
        totalInvestment -= inv.amount;
      }
    }
  });
  
  document.getElementById('total').textContent = formatCurrency(targetValue).replace('$', '');
  document.getElementById('total-investment').textContent = formatCurrency(totalInvestment).replace('$', '');
}

function redrawChartContent(canvas) {
  // This function only redraws the visual content without resizing or re-adding event handlers
  if (!canvas || !chartDataPoints || chartDataPoints.length === 0) return;
  
  const ctx = canvas.getContext('2d');
  const padding = 50;
  const width = canvas.width - padding * 2;
  const height = canvas.height - padding - 20;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const dataPoints = chartDataPoints;
  const values = dataPoints.map(p => p.value);
  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(...values, 0);
  const valueRange = maxValue - minValue || 1;
  
  const dates = dataPoints.map(p => p.date);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const dateRange = maxDate - minDate || 1;
  
  // Draw axes
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, canvas.height - padding);
  ctx.lineTo(canvas.width - padding, canvas.height - padding);
  ctx.stroke();
  
  // Draw grid lines and Y-axis labels
  ctx.fillStyle = '#999';
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (height * i / 5);
    const value = maxValue - (valueRange * i / 5);
    
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvas.width - padding, y);
    ctx.stroke();
    
    let label;
    if (Math.abs(value) >= 1000000) {
      label = '$' + (value / 1000000).toFixed(1) + 'M';
    } else if (Math.abs(value) >= 1000) {
      label = '$' + Math.round(value / 1000) + 'K';
    } else {
      label = '$' + Math.round(value);
    }
    
    ctx.fillText(label, padding - 5, y + 3);
  }
  
  // Draw line
  ctx.strokeStyle = '#4a90e2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  dataPoints.forEach((point, index) => {
    const x = padding + ((point.date - minDate) / dateRange) * width;
    const y = padding + ((maxValue - point.value) / valueRange) * height;
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
  
  // Draw x-axis date labels
  ctx.fillStyle = '#999';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  
  const maxLabels = Math.floor(width / 80);
  const labelInterval = Math.max(1, Math.floor(dataPoints.length / maxLabels));
  
  dataPoints.forEach((point, index) => {
    if (index % labelInterval === 0 || index === dataPoints.length - 1) {
      const x = padding + ((point.date - minDate) / dateRange) * width;
      const dateObj = new Date(point.date);
      const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
      
      ctx.save();
      ctx.translate(x, canvas.height - 5);
      ctx.rotate(-Math.PI / 6);
      ctx.fillText(dateStr, 0, 0);
      ctx.restore();
    }
  });
  
  // Draw points with color coding
  dataPoints.forEach((point) => {
    const x = padding + ((point.date - minDate) / dateRange) * width;
    const y = padding + ((maxValue - point.value) / valueRange) * height;
    
    let pointColor = '#4a90e2';
    if (point.type) {
      if (point.type === 'expense' || point.type === 'withdrawal') {
        pointColor = '#e74c3c';
      } else if (point.type === 'income' || point.type === 'investment') {
        pointColor = '#27ae60';
      }
    }
    
    ctx.fillStyle = pointColor;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
  });
  
  // Draw slider
  drawSlider(ctx, padding, width, height, minDate, maxDate, dateRange);
  
  // Draw "Today" marker
  const today = new Date();
  if (today >= minDate && today <= maxDate) {
    const todayX = padding + ((today - minDate) / dateRange) * width;
    
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(todayX, padding);
    ctx.lineTo(todayX, canvas.height - padding);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Today', todayX, padding - 5);
  }
}

function drawLineChart(canvas, dataPoints, color = '#4a90e2') {
  if (!canvas || dataPoints.length === 0) return;
  
  const ctx = canvas.getContext('2d');
  const padding = 50; // Increased for x-axis labels
  const width = canvas.width - padding * 2;
  const height = canvas.height - padding - 20; // Extra space at bottom for dates
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const values = dataPoints.map(p => p.value);
  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(...values, 0);
  const valueRange = maxValue - minValue || 1;
  
  const dates = dataPoints.map(p => p.date);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const dateRange = maxDate - minDate || 1;
  
  // Draw axes
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, canvas.height - padding);
  ctx.lineTo(canvas.width - padding, canvas.height - padding);
  ctx.stroke();
  
  // Draw grid lines and Y-axis labels
  ctx.fillStyle = '#999';
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (height * i / 5);
    const value = maxValue - (valueRange * i / 5);
    
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvas.width - padding, y);
    ctx.stroke();
    
    // Format without decimals and with shorter notation for large numbers
    let label;
    if (Math.abs(value) >= 1000000) {
      label = '$' + (value / 1000000).toFixed(1) + 'M';
    } else if (Math.abs(value) >= 1000) {
      label = '$' + Math.round(value / 1000) + 'K';
    } else {
      label = '$' + Math.round(value);
    }
    
    ctx.fillText(label, padding - 5, y + 3);
  }
  
  // Draw line connecting all transaction points
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  dataPoints.forEach((point, index) => {
    const x = padding + ((point.date - minDate) / dateRange) * width;
    const y = padding + ((maxValue - point.value) / valueRange) * height;
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      // Draw line to this point
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
  
  // Draw x-axis date labels
  ctx.fillStyle = '#999';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  
  // Determine how many labels to show based on width
  const maxLabels = Math.floor(width / 80); // Show label every ~80px
  const labelInterval = Math.max(1, Math.floor(dataPoints.length / maxLabels));
  
  dataPoints.forEach((point, index) => {
    if (index % labelInterval === 0 || index === dataPoints.length - 1) {
      const x = padding + ((point.date - minDate) / dateRange) * width;
      const dateObj = new Date(point.date);
      const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
      
      ctx.save();
      ctx.translate(x, canvas.height - 5);
      ctx.rotate(-Math.PI / 6); // Rotate labels slightly for better fit
      ctx.fillText(dateStr, 0, 0);
      ctx.restore();
    }
  });
  
  // Store point locations for hover detection
  const pointLocations = [];
  
  // Draw points on top of the line with color coding
  dataPoints.forEach((point, index) => {
    const x = padding + ((point.date - minDate) / dateRange) * width;
    const y = padding + ((maxValue - point.value) / valueRange) * height;
    
    // Store point location for hover detection
    pointLocations.push({
      x: x,
      y: y,
      radius: 6,
      data: point
    });
    
    // Determine color based on transaction type
    let pointColor = '#4a90e2'; // Default blue
    if (point.type) {
      if (point.type === 'expense' || point.type === 'withdrawal') {
        pointColor = '#e74c3c'; // Red for expenses/withdrawals
      } else if (point.type === 'income' || point.type === 'investment') {
        pointColor = '#27ae60'; // Green for income/investments
      }
    }
    
    // Draw point
    ctx.fillStyle = pointColor;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Add a white border around points for better visibility
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
  });
  
  // Store data points globally for slider
  chartDataPoints = dataPoints;
  
  // Set slider to today or last data point when chart is drawn
  const today = new Date();
  if (dataPoints.length > 0) {
    const lastDataDate = new Date(dataPoints[dataPoints.length - 1].date);
    // Use today if it's within the range, otherwise use the last data point
    if (today >= minDate && today <= maxDate) {
      selectedDate = today;
    } else {
      selectedDate = lastDataDate;
    }
  } else {
    selectedDate = today;
  }
  
  // Draw slider line at selected date
  drawSlider(ctx, padding, width, height, minDate, maxDate, dateRange);
  
  // Add mouse move event for tooltips and slider
  setupChartInteraction(canvas, pointLocations, padding, width, height, minDate, maxDate, dateRange);
  
  // Draw "Today" marker
  if (today >= minDate && today <= maxDate) {
    const todayX = padding + ((today - minDate) / dateRange) * width;
    
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(todayX, padding);
    ctx.lineTo(todayX, canvas.height - padding);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Today', todayX, padding - 5);
  }
}

function updateValueChart() {
  const canvas = document.getElementById('valueChart');
  if (!canvas) return;
  
  // Always recalculate the proper width based on container
  const container = canvas.parentElement;
  const containerStyle = window.getComputedStyle(container);
  const containerPadding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
  let availableWidth = container.clientWidth - containerPadding;
  
  // If container width is too small, use a reasonable default
  if (availableWidth < 100) {
    availableWidth = window.innerWidth - 100; // Use most of window width minus some margin
  }
  
  // Only update canvas size if it's significantly different to avoid unnecessary redraws
  const currentWidth = canvas.width;
  const targetWidth = Math.min(availableWidth, window.innerWidth - 100);
  
  if (Math.abs(currentWidth - targetWidth) > 50 || currentWidth < 100) {
    canvas.width = targetWidth;
    canvas.height = 300;
  }
  
  // Draw the chart
  drawChart();
  
  function drawChart() {
    const dataPoints = [];
    let runningValue = 0;
    
    const allEvents = [];
    
    if (currentInvestor === 'all') {
      // Show company value for "All Investors" view
      // Add investments
      state.investments.forEach(inv => {
        allEvents.push({
          date: new Date(inv.date),
          amount: inv.type === 'investment' ? inv.amount : -inv.amount,
          type: inv.type,
          transactionType: inv.type,
          description: `${inv.investor} ${inv.type === 'investment' ? 'invested' : 'withdrew'} ${formatCurrency(Math.abs(inv.amount))}`
        });
      });
      
      // Add transactions
      state.transactions.forEach(trans => {
        allEvents.push({
          date: new Date(trans.date),
          amount: trans.amount,
          type: 'transaction',
          transactionType: trans.direction || (trans.amount >= 0 ? 'income' : 'expense'),
          description: trans.description
        });
      });
    } else {
      // Show individual investor's portfolio value
      // We need to track company value at each point to calculate portfolio value
      let companyValue = 0;
      
      // Combine all events to track company value and ownership changes
      const combinedEvents = [];
      
      // Add all investments (to track company value and ownership)
      state.investments.forEach(inv => {
        combinedEvents.push({
          date: new Date(inv.date),
          type: 'investment',
          investor: inv.investor,
          amount: inv.type === 'investment' ? inv.amount : -inv.amount,
          investmentType: inv.type
        });
      });
      
      // Add all transactions (to track company value changes)
      state.transactions.forEach(trans => {
        combinedEvents.push({
          date: new Date(trans.date),
          type: 'transaction',
          amount: trans.amount,
          direction: trans.direction,
          description: trans.description
        });
      });
      
      // Sort by date
      combinedEvents.sort((a, b) => a.date - b.date);
      
      // Process events to calculate portfolio value at each point
      combinedEvents.forEach(event => {
        // Update company value
        if (event.type === 'investment') {
          companyValue += event.amount;
          
          // Calculate ownership using the proper function
          const ownershipPercent = getOwnershipPercentage(currentInvestor, event.date);
          const portfolioValue = (ownershipPercent / 100) * companyValue;
          
          // Add event for this investor if it's their transaction
          if (event.investor === currentInvestor) {
            allEvents.push({
              date: event.date,
              amount: event.amount,
              type: event.investmentType,
              transactionType: event.investmentType,
              description: event.investmentType === 'investment' 
                ? `You invested ${formatCurrency(Math.abs(event.amount))} (${ownershipPercent.toFixed(1)}% ownership)`
                : `You withdrew ${formatCurrency(Math.abs(event.amount))} (${ownershipPercent.toFixed(1)}% ownership)`,
              ownershipPercent: ownershipPercent,
              portfolioValue: portfolioValue
            });
          } else if (ownershipPercent > 0) {
            // Add event showing portfolio value change due to other investor's action
            allEvents.push({
              date: event.date,
              amount: 0, // No direct cash impact
              type: 'valuation',
              transactionType: 'valuation',
              description: `${event.investor} ${event.investmentType === 'investment' ? 'invested' : 'withdrew'} (your ownership: ${ownershipPercent.toFixed(1)}%)`,
              ownershipPercent: ownershipPercent,
              portfolioValue: portfolioValue
            });
          }
        } else if (event.type === 'transaction') {
          companyValue += event.amount;
          
          // Calculate current ownership using the proper function
          const ownershipPercent = getOwnershipPercentage(currentInvestor, event.date);
          const portfolioValue = (ownershipPercent / 100) * companyValue;
          const impact = (ownershipPercent / 100) * event.amount;
          
          if (ownershipPercent > 0) {
            // Add transaction event showing impact on portfolio
            allEvents.push({
              date: event.date,
              amount: impact,
              type: 'transaction',
              transactionType: event.direction || (event.amount >= 0 ? 'income' : 'expense'),
              description: `${event.description} (${ownershipPercent.toFixed(1)}% = ${formatCurrency(impact)})`,
              ownershipPercent: ownershipPercent,
              portfolioValue: portfolioValue
            });
          }
        }
      });
    }
    
    // Helper function to get total investment as of a specific date
    function getTotalInvestmentAsOf(date) {
      let total = 0;
      state.investments.forEach(inv => {
        if (new Date(inv.date) <= date) {
          if (inv.type === 'investment') {
            total += inv.amount;
          } else if (inv.type === 'withdrawal') {
            total -= inv.amount;
          }
        }
      });
      return total;
    }
    
    // Sort by date
    allEvents.sort((a, b) => a.date - b.date);
    
    // Filter events based on selected time range
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date(); // End date is today for all ranges
    
    switch (chartTimeRange) {
      case '6M':
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 6);
        break;
      case '1Y':
        startDate = new Date(today);
        startDate.setFullYear(today.getFullYear() - 1);
        break;
      case 'YTD':
        startDate = new Date(today.getFullYear(), 0, 1); // January 1st of current year
        break;
      case 'ALL':
        startDate = new Date(0); // Show all data
        endDate = new Date(9999, 11, 31); // Far future date to include everything
        break;
    }
    
    // Filter events to only show those within the selected range
    const filteredEvents = chartTimeRange === 'ALL' ? allEvents : 
      allEvents.filter(event => event.date >= startDate && event.date <= endDate);
    
    // Calculate the starting value for the filtered range
    let startingValue = 0;
    if (chartTimeRange !== 'ALL' && allEvents.length > 0) {
      // Calculate value up to the start date
      allEvents.forEach(event => {
        if (event.date < startDate) {
          startingValue += event.amount;
        }
      });
    }
    
    // Create data points
    if (currentInvestor === 'all') {
      // For company view, show cumulative value
      if (filteredEvents.length > 0 || startingValue !== 0) {
        // Start with the value at the beginning of the time range
        runningValue = startingValue;
        
        // Add starting point
        if (filteredEvents.length > 0) {
          const firstDate = filteredEvents[0].date;
          dataPoints.push({
            date: Math.max(firstDate.getTime() - 86400000, startDate.getTime()),
            value: startingValue,
            type: 'start'
          });
        }
        
        // Add points for filtered events
        filteredEvents.forEach(event => {
          runningValue += event.amount;
          dataPoints.push({
            date: event.date.getTime(),
            value: runningValue,
            type: event.transactionType,
            description: event.description,
            amount: event.amount,
            dateObj: event.date
          });
        });
        
        // Add current point at today's date (or end date for ALL view)
        if (filteredEvents.length > 0) {
          const lastDate = filteredEvents[filteredEvents.length - 1].date;
          const finalDate = chartTimeRange === 'ALL' && lastDate > today ? lastDate : today;
          
          if (lastDate < finalDate) {
            dataPoints.push({
              date: finalDate.getTime(),
              value: runningValue,
              type: 'current'
            });
          }
        } else if (startingValue !== 0) {
          // If no events in range but we have a starting value, show a line at that value
          dataPoints.push({
            date: startDate.getTime(),
            value: startingValue,
            type: 'start'
          });
          dataPoints.push({
            date: today.getTime(),
            value: startingValue,
            type: 'current'
          });
        }
      }
    } else {
      // For individual investor view, show portfolio value at each point
      if (filteredEvents.length > 0) {
        // Calculate starting portfolio value
        let startingPortfolioValue = 0;
        if (chartTimeRange !== 'ALL' && allEvents.length > 0) {
          // Find the last portfolio value before the start date
          for (let i = allEvents.length - 1; i >= 0; i--) {
            if (allEvents[i].date < startDate && allEvents[i].portfolioValue !== undefined) {
              startingPortfolioValue = allEvents[i].portfolioValue;
              break;
            }
          }
        }
        
        // Add starting point if we have a starting value
        if (startingPortfolioValue > 0) {
          dataPoints.push({
            date: startDate.getTime(),
            value: startingPortfolioValue,
            type: 'start'
          });
        }
        
        // Add points for filtered events showing portfolio value
        filteredEvents.forEach(event => {
          if (event.portfolioValue !== undefined) {
            dataPoints.push({
              date: event.date.getTime(),
              value: event.portfolioValue,
              type: event.transactionType,
              description: event.description,
              amount: event.amount,
              dateObj: event.date,
              ownershipPercent: event.ownershipPercent
            });
          }
        });
        
        // Add current point if needed
        if (dataPoints.length > 0) {
          const lastDataPoint = dataPoints[dataPoints.length - 1];
          const finalDate = chartTimeRange === 'ALL' && lastDataPoint.dateObj > today ? lastDataPoint.dateObj : today;
          
          if (!lastDataPoint.dateObj || lastDataPoint.dateObj < finalDate) {
            // Calculate current portfolio value
            const currentOwnership = getOwnershipPercentage(currentInvestor) / 100;
            const currentCompanyValue = getCurrentValue();
            const currentPortfolioValue = currentOwnership * currentCompanyValue;
            
            if (currentPortfolioValue > 0) {
              dataPoints.push({
                date: finalDate.getTime(),
                value: currentPortfolioValue,
                type: 'current',
                ownershipPercent: currentOwnership * 100
              });
            }
          }
        }
      }
    }
    
    drawLineChart(canvas, dataPoints, '#4a90e2');
  }
}

function updateInvestorSelector() {
  const selector = document.getElementById('investor-view');
  if (!selector) return;
  
  const currentSelection = selector.value;
  
  selector.innerHTML = '<option value="all">All Investors</option>';
  
  // Calculate net investment for each shareholder
  const investorData = {};
  state.investments.forEach(inv => {
    if (!investorData[inv.investor]) {
      investorData[inv.investor] = 0;
    }
    if (inv.type === 'investment') {
      investorData[inv.investor] += inv.amount;
    } else if (inv.type === 'withdrawal') {
      investorData[inv.investor] -= inv.amount;
    }
  });
  
  // Add options for investors with positive net investment
  Object.entries(investorData).forEach(([name, netInvestment]) => {
    if (netInvestment > 0) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      selector.appendChild(option);
    }
  });
  
  if (currentSelection && Array.from(selector.options).some(opt => opt.value === currentSelection)) {
    selector.value = currentSelection;
  }
}

function updateTransactionHistory() {
  const historyDiv = document.getElementById('transaction-history');
  const historySection = document.getElementById('transaction-history-section');
  
  if (!historyDiv || !historySection) return;
  
  // Show transaction history for all views now
  historySection.style.display = 'block';
  historyDiv.innerHTML = '';
  
  const table = document.createElement('table');
  
  if (currentInvestor === 'all') {
    // Show all company transactions
    table.innerHTML = `
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Description</th>
          <th>Amount</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    const allEvents = [];
    
    // Add all investments with indices
    state.investments.forEach((inv, index) => {
      allEvents.push({
        date: new Date(inv.date),
        type: inv.type === 'investment' ? 'Investment' : 'Withdrawal',
        description: `${inv.investor} ${inv.type === 'investment' ? 'invested' : 'withdrew'}`,
        amount: inv.type === 'investment' ? inv.amount : -inv.amount,
        category: 'investment',
        index: index,
        data: inv
      });
    });
    
    // Add all transactions with indices
    state.transactions.forEach((trans, index) => {
      allEvents.push({
        date: new Date(trans.date),
        type: trans.direction === 'income' ? 'Income' : 'Expense',
        description: trans.description,
        amount: trans.amount,
        category: 'transaction',
        index: index,
        data: trans
      });
    });
    
    // Sort by date (newest first)
    allEvents.sort((a, b) => b.date - a.date);
    
    // Only show limited number of transactions initially
    const eventsToShow = allEvents.slice(0, transactionDisplayCount);
    const hasMore = allEvents.length > transactionDisplayCount;
    
    eventsToShow.forEach(event => {
      const row = document.createElement('tr');
      const amountClass = event.amount >= 0 ? 'gain' : 'loss';
      
      row.innerHTML = `
        <td>${event.date.toLocaleDateString()}</td>
        <td>${event.type}</td>
        <td>${event.description}</td>
        <td class="${amountClass}">${formatCurrency(event.amount)}</td>
        <td>
          <button class="action-btn edit-btn" data-category="${event.category}" data-index="${event.index}">Edit</button>
          <button class="action-btn delete-btn" data-category="${event.category}" data-index="${event.index}">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
    
    // Add load more button if there are more transactions
    if (hasMore) {
      const loadMoreRow = document.createElement('tr');
      loadMoreRow.innerHTML = `
        <td colspan="5" style="text-align: center; padding: 1rem;">
          <button id="load-more-transactions" class="primary-btn">
            Load More (${allEvents.length - transactionDisplayCount} more)
          </button>
        </td>
      `;
      tbody.appendChild(loadMoreRow);
    }
  } else {
    // Show investor-specific transactions
    table.innerHTML = `
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Description</th>
          <th>Company Amount</th>
          <th>Your Impact</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    const ownership = getOwnershipPercentage(currentInvestor) / 100;
    
    const allEvents = [];
    
    // Add their investments
    const investor = state.shareholders[currentInvestor];
    if (investor && investor.transactions) {
      investor.transactions.forEach(trans => {
        allEvents.push({
          date: new Date(trans.date),
          type: trans.type === 'investment' ? 'Investment' : 'Withdrawal',
          description: `${trans.type === 'investment' ? 'Invested in' : 'Withdrew from'} company`,
          amount: trans.amount,
          impact: trans.type === 'investment' ? trans.amount : -trans.amount
        });
      });
    }
    
    // Add company transactions
    state.transactions.forEach(trans => {
      const impact = trans.amount * ownership;
      allEvents.push({
        date: new Date(trans.date),
        type: trans.direction === 'income' ? 'Income' : 'Expense',
        description: trans.description,
        amount: trans.amount,
        impact: impact
      });
    });
    
    // Sort by date
    allEvents.sort((a, b) => b.date - a.date);
    
    // Apply pagination for investor view too
    const eventsToShow = allEvents.slice(0, transactionDisplayCount);
    const hasMore = allEvents.length > transactionDisplayCount;
    
    eventsToShow.forEach(event => {
      const row = document.createElement('tr');
      const impactClass = event.impact >= 0 ? 'gain' : 'loss';
      
      row.innerHTML = `
        <td>${event.date.toLocaleDateString()}</td>
        <td>${event.type}</td>
        <td>${event.description}</td>
        <td>${formatCurrency(Math.abs(event.amount))}</td>
        <td class="${impactClass}">${formatCurrency(event.impact)}</td>
      `;
      tbody.appendChild(row);
    });
    
    // Add load more button if there are more transactions
    if (hasMore) {
      const loadMoreRow = document.createElement('tr');
      loadMoreRow.innerHTML = `
        <td colspan="5" style="text-align: center; padding: 1rem;">
          <button id="load-more-transactions" class="primary-btn">
            Load More (${allEvents.length - transactionDisplayCount} more)
          </button>
        </td>
      `;
      tbody.appendChild(loadMoreRow);
    }
  }
  
  historyDiv.appendChild(table);
  
  // Add event listeners for edit and delete buttons
  historyDiv.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const category = e.target.dataset.category;
      const index = parseInt(e.target.dataset.index);
      deleteTransaction(category, index);
    });
  });
  
  historyDiv.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const category = e.target.dataset.category;
      const index = parseInt(e.target.dataset.index);
      editTransaction(category, index);
    });
  });
  
  // Add event listener for load more button
  const loadMoreBtn = document.getElementById('load-more-transactions');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      transactionDisplayCount += 15; // Show 15 more transactions
      updateTransactionHistory(); // Refresh the history with more items
    });
  }
}

function updateAll() {
  updateOwnershipChart();
  updateShareholdersList();
  updateTotal();
  updateCalculatedOwnership();
  updateInvestorSelector();
  updateValueChart();
  updateTransactionHistory();
}

// Make functions globally accessible
window.invest = invest;
window.withdraw = withdraw;
window.addTransaction = addTransaction;
window.resetData = resetData;
window.sanitizeData = sanitizeData;
window.exportData = exportData;
window.importData = importData;

function init() {
  const pieCanvas = document.getElementById('pieChart');
  if (pieCanvas) {
    pieCanvas.width = 300;
    pieCanvas.height = 300;
  }
  
  // Set default dates
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const nowString = now.toISOString().slice(0, 16);
  
  document.querySelectorAll('input[type="datetime-local"]').forEach(input => {
    input.value = nowString;
  });
  
  // Event listeners
  document.getElementById('invest')?.addEventListener('click', invest);
  document.getElementById('withdraw')?.addEventListener('click', withdraw);
  document.getElementById('add-transaction')?.addEventListener('click', addTransaction);
  document.getElementById('reset-data')?.addEventListener('click', resetData);
  document.getElementById('sanitize-data')?.addEventListener('click', sanitizeData);
  document.getElementById('export-data')?.addEventListener('click', exportData);
  document.getElementById('import-data')?.addEventListener('click', importData);
  document.getElementById('import-file')?.addEventListener('change', handleFileImport);
  
  document.getElementById('investment-amount')?.addEventListener('input', updateCalculatedOwnership);
  document.getElementById('investor-name')?.addEventListener('input', updateCalculatedOwnership);
  
  // Investor view selector
  document.getElementById('investor-view')?.addEventListener('change', (e) => {
    currentInvestor = e.target.value;
    transactionDisplayCount = 15; // Reset to initial count when switching views
    document.getElementById('chart-title').textContent = 
      currentInvestor === 'all' ? 'Company Value Over Time' : `${currentInvestor}'s Value Over Time`;
    updateValueChart();
    updateTransactionHistory();
  });
  
  // Time range selector
  document.querySelectorAll('.time-range-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active class from all buttons
      document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
      // Add active class to clicked button
      e.target.classList.add('active');
      // Update the time range
      chartTimeRange = e.target.dataset.range;
      // Redraw the chart
      updateValueChart();
    });
  });
  
  // Redraw chart on window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateValueChart();
    }, 250);
  });
  
  // Initial updates - delay chart rendering slightly to ensure DOM is ready
  updateOwnershipChart();
  updateShareholdersList();
  updateTotal();
  updateCalculatedOwnership();
  updateInvestorSelector();
  updateTransactionHistory();
  
  // Delay chart rendering to ensure container dimensions are available
  setTimeout(() => {
    // Force canvas to recalculate size on initial load
    const canvas = document.getElementById('valueChart');
    if (canvas) {
      canvas.width = 0; // Reset to force recalculation
    }
    updateValueChart();
  }, 100);
}

document.addEventListener('DOMContentLoaded', init);