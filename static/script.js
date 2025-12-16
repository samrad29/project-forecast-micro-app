let cashFlowChart = null;

// Initialize milestones
document.addEventListener('DOMContentLoaded', function() {
    const addMilestoneBtn = document.getElementById('add-milestone');
    addMilestoneBtn.addEventListener('click', addMilestoneRow);
    
    // Add initial milestone row
    addMilestoneRow();
    
    // Form submission
    document.getElementById('forecastForm').addEventListener('submit', handleFormSubmit);
});

function addMilestoneRow() {
    const container = document.getElementById('milestones-container');
    const row = document.createElement('div');
    row.className = 'milestone-entry';
    row.innerHTML = `
        <input type="number" class="milestone-month" placeholder="Month" min="0" step="1">
        <input type="number" class="milestone-percent" placeholder="% of contract" min="0" max="100" step="0.01">
        <button type="button" class="remove-milestone">Remove</button>
    `;
    container.appendChild(row);
    
    // Add remove functionality
    row.querySelector('.remove-milestone').addEventListener('click', function() {
        if (container.children.length > 1) {
            row.remove();
        } else {
            alert('You must have at least one milestone');
        }
    });
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    // Collect form data
    const formData = {
        contract_value: parseFloat(document.getElementById('contract_value').value),
        time_frame: parseInt(document.getElementById('time_frame').value),
        payment_lag: parseInt(document.getElementById('payment_lag').value),
        monthly_expense: parseFloat(document.getElementById('monthly_expense').value),
        monthly_burn: parseFloat(document.getElementById('monthly_burn').value),
        contingency_percent: parseFloat(document.getElementById('contingency_percent').value) / 100,
        upfront_cost: parseFloat(document.getElementById('upfront_cost').value),
        cash_floor: parseFloat(document.getElementById('cash_floor').value),
        scenario: document.getElementById('scenario').value
    };
    
    // Collect billing milestones
    const milestones = {};
    const milestoneRows = document.querySelectorAll('.milestone-entry');
    milestoneRows.forEach(row => {
        const month = row.querySelector('.milestone-month').value;
        const percent = row.querySelector('.milestone-percent').value;
        if (month !== '' && percent !== '') {
            milestones[month] = parseFloat(percent) / 100;
        }
    });
    
    if (Object.keys(milestones).length === 0) {
        alert('Please add at least one billing milestone');
        return;
    }
    
    formData.billing_milestones = milestones;
    
    // Show loading state
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.style.display = 'block';
    resultsSection.innerHTML = '<div class="loading">Generating forecast...</div>';
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Make API call
    fetch('/generate_forecast', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            inputs: formData,
            scenario: formData.scenario
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displayResults(data.forecast);
        } else {
            showError(data.message || 'An error occurred');
        }
    })
    .catch(error => {
        showError('Network error: ' + error.message);
    });
}

function displayResults(forecast) {
    const resultsSection = document.getElementById('resultsSection');
    
    // Restore results section structure
    resultsSection.innerHTML = `
        <h2>Forecast Results</h2>
        
        <div class="summary-cards">
            <div class="card">
                <div class="card-label">Verdict</div>
                <div class="card-value" id="verdict"></div>
            </div>
            <div class="card">
                <div class="card-label">Payback Period</div>
                <div class="card-value" id="payback"></div>
            </div>
            <div class="card">
                <div class="card-label">Gross Margin</div>
                <div class="card-value" id="grossMargin"></div>
            </div>
            <div class="card">
                <div class="card-label">Min Cash</div>
                <div class="card-value" id="minCash"></div>
            </div>
        </div>

        <div class="chart-container">
            <canvas id="cashFlowChart"></canvas>
        </div>

        <div class="table-container">
            <h3>Monthly Breakdown</h3>
            <table id="forecastTable">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Cash In</th>
                        <th>Cash Out</th>
                        <th>Net Cash</th>
                        <th>Cumulative Cash</th>
                    </tr>
                </thead>
                <tbody id="forecastTableBody">
                </tbody>
            </table>
        </div>
    `;
    
    // Update summary cards
    const verdict = forecast.verdict;
    const verdictElement = document.getElementById('verdict');
    verdictElement.textContent = verdict;
    verdictElement.className = `card-value verdict-${verdict.toLowerCase().replace(' ', '-')}`;
    
    document.getElementById('payback').textContent = 
        forecast.payback_period === 999 ? 'N/A' : `${forecast.payback_period} months`;
    
    document.getElementById('grossMargin').textContent = 
        (forecast.gross_margin * 100).toFixed(1) + '%';
    
    document.getElementById('minCash').textContent = 
        formatCurrency(forecast.min_net_cash);
    
    // Create chart
    createChart(forecast.forecast);
    
    // Populate table
    populateTable(forecast.forecast);
}

function createChart(forecastData) {
    const ctx = document.getElementById('cashFlowChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (cashFlowChart) {
        cashFlowChart.destroy();
    }
    
    const months = forecastData.map((_, i) => `Month ${i + 1}`);
    const cashIn = forecastData.map(d => d.cash_in);
    const cashOut = forecastData.map(d => d.cash_out);
    const cumulative = forecastData.map(d => d.cumulative_net_cash);
    
    cashFlowChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Cash In',
                    data: cashIn,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    tension: 0.4,
                    fill: false
                },
                {
                    label: 'Cash Out',
                    data: cashOut,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: false
                },
                {
                    label: 'Cumulative Cash',
                    data: cumulative,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function populateTable(forecastData) {
    const tbody = document.getElementById('forecastTableBody');
    tbody.innerHTML = '';
    
    forecastData.forEach((month, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${formatCurrency(month.cash_in)}</td>
            <td>${formatCurrency(month.cash_out)}</td>
            <td class="${month.net_cash >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(month.net_cash)}
            </td>
            <td class="${month.cumulative_net_cash >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(month.cumulative_net_cash)}
            </td>
        `;
        tbody.appendChild(row);
    });
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function showError(message) {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.innerHTML = `
        <div class="error">
            <strong>Error:</strong> ${message}
        </div>
    `;
}

