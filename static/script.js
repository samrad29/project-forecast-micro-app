let cashFlowChart = null;
let currentFormData = null; // Store form data for saving projects

// Initialize milestones
document.addEventListener('DOMContentLoaded', function() {
    const addMilestoneBtn = document.getElementById('add-milestone');
    addMilestoneBtn.addEventListener('click', addMilestoneRow);
    
    // Add initial milestone row
    addMilestoneRow();
    
    // Add phase button
    const addPhaseBtn = document.getElementById('add-phase');
    if (addPhaseBtn) {
        addPhaseBtn.addEventListener('click', addPhaseRow);
    }
    
    // Add delay button
    const addDelayBtn = document.getElementById('add-delay');
    if (addDelayBtn) {
        addDelayBtn.addEventListener('click', addDelayRow);
    }
    
    // Add unexpected costs button
    const addUnexpectedCostsBtn = document.getElementById('add-unexpected-costs');
    if (addUnexpectedCostsBtn) {
        addUnexpectedCostsBtn.addEventListener('click', addUnexpectedCostsRow);
    }
    
    // Initialize remove buttons for existing entries
    initializeRemoveButtons();
    
    // Form submission
    document.getElementById('forecastForm').addEventListener('submit', handleFormSubmit);
    
    // Toggle form minimize/expand
    const toggleFormBtn = document.getElementById('toggleFormBtn');
    const formSection = document.getElementById('formSection');
    if (toggleFormBtn && formSection) {
        toggleFormBtn.addEventListener('click', function() {
            formSection.classList.toggle('minimized');
            toggleFormBtn.textContent = formSection.classList.contains('minimized') ? 'Expand' : 'Minimize';
        });
    }
    
    // Setup header navigation buttons
    setupNavigationButtons();
});

function setupNavigationButtons() {
    const projectsBtn = document.getElementById('projectsBtn');
    const overviewBtn = document.getElementById('overviewBtn');
    const calculatorBtn = document.getElementById('calculatorBtn');
    
    const projectsView = document.getElementById('projectsView');
    const overviewView = document.getElementById('overviewView');
    const calculatorView = document.getElementById('calculatorView');
    
    // Projects button
    if (projectsBtn) {
        projectsBtn.addEventListener('click', function() {
            switchView('projects');
        });
    }
    
    // Overview button
    if (overviewBtn) {
        overviewBtn.addEventListener('click', function() {
            switchView('overview');
        });
    }
    
    // Calculator button
    if (calculatorBtn) {
        calculatorBtn.addEventListener('click', function() {
            switchView('calculator');
        });
    }
}

function switchView(viewName) {
    // Hide all views
    document.getElementById('projectsView').style.display = 'none';
    document.getElementById('overviewView').style.display = 'none';
    document.getElementById('calculatorView').style.display = 'none';
    
    // Remove active class from all buttons
    document.getElementById('projectsBtn').classList.remove('active');
    document.getElementById('overviewBtn').classList.remove('active');
    document.getElementById('calculatorBtn').classList.remove('active');
    
    // Show selected view and activate button
    if (viewName === 'projects') {
        document.getElementById('projectsView').style.display = 'block';
        document.getElementById('projectsBtn').classList.add('active');
        loadProjects();
    } else if (viewName === 'overview') {
        document.getElementById('overviewView').style.display = 'block';
        document.getElementById('overviewBtn').classList.add('active');
    } else {
        document.getElementById('calculatorView').style.display = 'block';
        document.getElementById('calculatorBtn').classList.add('active');
    }
}

function loadProjects() {
    const container = document.getElementById('projectsTableContainer');
    container.innerHTML = '<div class="loading">Loading projects...</div>';
    
    fetch('/get_projects')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayProjects(data.projects);
            } else {
                container.innerHTML = `<div class="error">Error loading projects: ${data.message || 'Unknown error'}</div>`;
            }
        })
        .catch(error => {
            container.innerHTML = `<div class="error">Network error: ${error.message}</div>`;
        });
}

function loadProjectAndGenerateForecast(projectId) {
    // Show loading state
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.style.display = 'block';
    resultsSection.innerHTML = '<div class="loading">Loading project and generating forecast...</div>';
    
    // Minimize form section
    const formSection = document.getElementById('formSection');
    const toggleFormBtn = document.getElementById('toggleFormBtn');
    if (formSection) {
        formSection.classList.add('minimized');
    }
    if (toggleFormBtn) {
        toggleFormBtn.textContent = 'Expand';
    }
    
    // Switch to calculator view
    switchView('calculator');
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Fetch project data
    fetch(`/get_project/${projectId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const project = data.project;
                
                // Reconstruct form data structure from project data
                const formData = {
                    start_date: project.start_date || '',
                    contract_value: project.contract_value,
                    time_frame: project.time_frame,
                    payment_lag: project.payment_lag,
                    contingency_percent: project.contingency_percent,
                    cash_floor: project.cash_floor,
                    phases: project.phases,
                    delays: project.delays,
                    unexpected_costs: project.unexpected_costs,
                    billing_milestones: project.billing_milestones
                };
                
                // Store form data globally for saving projects
                currentFormData = formData;
                
                // Generate forecast
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
                .then(forecastData => {
                    if (forecastData.success) {
                        displayResults(forecastData.forecast);
                    } else {
                        showError(forecastData.message || 'An error occurred while generating forecast');
                    }
                })
                .catch(error => {
                    showError('Network error: ' + error.message);
                });
            } else {
                showError(data.message || 'Error loading project');
            }
        })
        .catch(error => {
            showError('Network error: ' + error.message);
        });
}

function displayProjects(projects) {
    const container = document.getElementById('projectsTableContainer');
    
    if (projects.length === 0) {
        container.innerHTML = '<p class="no-projects">No projects saved yet. Create a forecast and save it to see it here.</p>';
        return;
    }
    
    let html = `
        <table class="projects-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Start Date</th>
                    <th>Contract Value</th>
                    <th>Duration (months)</th>
                    <th>Payment Lag</th>
                    <th>Contingency %</th>
                    <th>Cash Floor</th>
                    <th>Created</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    projects.forEach(project => {
        const createdDate = new Date(project.created_at).toLocaleDateString();
        const startDate = project.start_date ? new Date(project.start_date).toLocaleDateString() : 'N/A';
        html += `
            <tr class="project-row" data-project-id="${project.id}">
                <td>${project.id}</td>
                <td>${project.name}</td>
                <td>${startDate}</td>
                <td>${formatCurrency(project.contract_value)}</td>
                <td>${project.time_frame}</td>
                <td>${project.payment_lag}</td>
                <td>${(project.contingency_percent * 100).toFixed(1)}%</td>
                <td>${formatCurrency(project.cash_floor)}</td>
                <td>${createdDate}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
    
    // Add click handlers to project rows
    const projectRows = container.querySelectorAll('.project-row');
    projectRows.forEach(row => {
        row.addEventListener('click', function() {
            const projectId = this.getAttribute('data-project-id');
            loadProjectAndGenerateForecast(projectId);
        });
    });
}

function initializeRemoveButtons() {
    // Initialize remove buttons for existing phase entries
    const phaseContainer = document.getElementById('phase_expense_container');
    if (phaseContainer) {
        phaseContainer.querySelectorAll('.remove-phase').forEach(btn => {
            btn.addEventListener('click', function() {
                const row = btn.closest('.phase-entry');
                if (phaseContainer.children.length > 1) {
                    row.remove();
                } else {
                    alert('You must have at least one phase');
                }
            });
        });
    }
    
    // Initialize remove buttons for existing delay entries
    const delayContainer = document.getElementById('delay-container');
    if (delayContainer) {
        delayContainer.querySelectorAll('.remove-delay').forEach(btn => {
            btn.addEventListener('click', function() {
                const row = btn.closest('.delay-entry');
                if (delayContainer.children.length > 1) {
                    row.remove();
                } else {
                    alert('You must have at least one delay entry');
                }
            });
        });
    }
    
    // Initialize remove buttons for existing unexpected cost entries
    const unexpectedCostsContainer = document.getElementById('unexpected-costs-container');
    if (unexpectedCostsContainer) {
        unexpectedCostsContainer.querySelectorAll('.remove-unexpected-costs').forEach(btn => {
            btn.addEventListener('click', function() {
                const row = btn.closest('.unexpected-costs-entry');
                if (unexpectedCostsContainer.children.length > 1) {
                    row.remove();
                } else {
                    alert('You must have at least one unexpected cost entry');
                }
            });
        });
    }
}

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

function addUnexpectedCostsRow() {
    const container = document.getElementById('unexpected-costs-container');
    const row = document.createElement('div');
    row.className = 'unexpected-costs-entry';
    row.innerHTML = `
        <input type="text" class="phase-name" placeholder="Phase Name">
        <input type="number" class="unexpected-costs-percent" placeholder="Unexpected Costs % per month" min="0" max="100" step="0.01">
        <button type="button" class="remove-unexpected-costs">Remove</button>
    `;
    container.appendChild(row);
    
    // Add remove functionality
    row.querySelector('.remove-unexpected-costs').addEventListener('click', function() {
        if (container.children.length > 1) {
            row.remove();
        } else {
            alert('You must have at least one unexpected cost entry');
        }
    });
}

function addDelayRow() {
    const container = document.getElementById('delay-container');
    const row = document.createElement('div');
    row.className = 'delay-entry';
    row.innerHTML = `
        <input type="text" class="delay-start-date" placeholder="Start Month">
        <input type="number" class="delay-length" placeholder="Delay Length (months)">
        <input type="number" class="delay-expense" placeholder="Delay Expense Monthly (excluding overhead)">
        <button type="button" class="remove-delay">Remove</button>
    `;
    container.appendChild(row);
    
    // Add remove functionality
    row.querySelector('.remove-delay').addEventListener('click', function() {
        if (container.children.length > 1) {
            row.remove();
        } else {
            alert('You must have at least one delay entry');
        }
    });
}

function addPhaseRow() {
    const container = document.getElementById('phase_expense_container');
    const row = document.createElement('div');
    row.className = 'phase-entry';
    row.innerHTML = `
        <input type="text" class="phase-name" placeholder="Phase Name">
        <input type="number" class="phase-length" placeholder="Phase Length (months)">
        <input type="number" class="phase-expense" placeholder="Phase Monthly Expense">
        <input type="number" class="phase-contingency" placeholder="Overhead">
        <input type="number" class="phase-upfront" placeholder="Upfront Cost">
        <button type="button" class="remove-phase">Remove</button>
    `;
    container.appendChild(row);
    
    // Add remove functionality
    row.querySelector('.remove-phase').addEventListener('click', function() {
        if (container.children.length > 1) {
            row.remove();
        } else {
            alert('You must have at least one phase');
        }
    });
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    // Collect form data
    let formData = {
        start_date: document.getElementById('start_date').value,
        contract_value: parseFloat(document.getElementById('contract_value').value),
        time_frame: parseInt(document.getElementById('time_frame').value),
        payment_lag: parseInt(document.getElementById('payment_lag').value),
        contingency_percent: parseFloat(document.getElementById('contingency_percent').value) / 100,
        cash_floor: parseFloat(document.getElementById('cash_floor').value)
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
    console.log(formData.billing_milestones);

    // Collect phase data
    const phases = {};
    const phaseRows = document.querySelectorAll('.phase-entry');
    phaseRows.forEach(row => {
        const phaseName = row.querySelector('.phase-name').value;
        const phaseLength = row.querySelector('.phase-length').value;
        const phaseExpense = row.querySelector('.phase-expense').value;
        const phaseOverhead = row.querySelector('.phase-contingency').value;
        const phaseUpfront = row.querySelector('.phase-upfront').value;
        phases[phaseName] = {
            length: phaseLength,
            expense: phaseExpense,
            overhead: phaseOverhead,
            upfront: phaseUpfront
        };
    });

    if (Object.keys(phases).length === 0) {
        alert('Please add at least one phase');
        return;
    }
    formData.phases = phases;

    // Collect delay data
    const delays = {};
    const delayRows = document.querySelectorAll('.delay-entry');
    delayRows.forEach(row => {
        const delayStartDate = row.querySelector('.delay-start-date').value;
        const delayLength = row.querySelector('.delay-length').value;
        const delayExpense = row.querySelector('.delay-expense').value;
        delays[delayStartDate] = {
            length: delayLength,
            expense: delayExpense
        };
    });
    if (Object.keys(delays).length > 0) {
        formData.delays = delays;
        console.log('Delays added');
    }

    // Collect unexpected costs data
    const unexpectedCosts = {};
    const unexpectedCostRows = document.querySelectorAll('.unexpected-costs-entry');
    unexpectedCostRows.forEach(row => {
        const unexpectedCostName = row.querySelector('.phase-name').value;
        const unexpectedCostPercent = row.querySelector('.unexpected-costs-percent').value;
        unexpectedCosts[unexpectedCostName] = unexpectedCostPercent / 100;
    });
    if (Object.keys(unexpectedCosts).length > 0) {
        formData.unexpected_costs = unexpectedCosts;
        console.log('Unexpected costs added');
    }
    
    // Store form data globally for saving projects
    currentFormData = formData;

    // Show loading state
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.style.display = 'block';
    resultsSection.innerHTML = '<div class="loading">Generating forecast...</div>';
    
    // Minimize form section after submission
    const formSection = document.getElementById('formSection');
    const toggleFormBtn = document.getElementById('toggleFormBtn');
    formSection.classList.add('minimized');
    if (toggleFormBtn) {
        toggleFormBtn.textContent = 'Expand';
    }
    
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
                        <th>Phase</th>
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
        
        <div class="save-project-container">
            <button type="button" id="saveProjectBtn" class="btn-primary">Save Project</button>
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
    
    // Setup save project button
    setupSaveProjectButton();
}

function setupSaveProjectButton() {
    const saveBtn = document.getElementById('saveProjectBtn');
    const modal = document.getElementById('saveProjectModal');
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelSaveBtn');
    const saveForm = document.getElementById('saveProjectForm');
    
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            modal.style.display = 'block';
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.style.display = 'none';
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            modal.style.display = 'none';
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Handle form submission
    if (saveForm) {
        saveForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveProject();
        });
    }
}

function saveProject() {
    const projectNameInput = document.getElementById('projectName');
    const projectName = projectNameInput.value.trim();
    const saveForm = document.getElementById('saveProjectForm');
    
    if (!projectName) {
        alert('Please enter a project name');
        return;
    }
    
    if (!currentFormData) {
        alert('No project data to save');
        return;
    }
    
    // Show loading state
    const saveBtn = saveForm.querySelector('button[type="submit"]');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    // Send save request
    fetch('/create_project', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: projectName,
            inputs: currentFormData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`Project "${projectName}" saved successfully!`);
            document.getElementById('saveProjectModal').style.display = 'none';
            saveForm.reset();
        } else {
            alert('Error saving project: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(error => {
        alert('Network error: ' + error.message);
    })
    .finally(() => {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    });
}

function createChart(forecastData) {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded');
        // Try to wait a bit and check again
        setTimeout(() => {
            if (typeof Chart !== 'undefined') {
                createChart(forecastData);
            } else {
                document.getElementById('cashFlowChart').parentElement.innerHTML = 
                    '<div class="error">Chart library failed to load. Please refresh the page or check your internet connection.</div>';
            }
        }, 500);
        return;
    }
    
    const canvas = document.getElementById('cashFlowChart');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
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
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.4,
                    fill: false,
                    borderWidth: 2
                },
                {
                    label: 'Cash Out',
                    data: cashOut,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: false,
                    borderWidth: 2
                },
                {
                    label: 'Cumulative Cash',
                    data: cumulative,
                    borderColor: '#ff8c00',
                    backgroundColor: 'rgba(255, 140, 0, 0.15)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
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
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
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
            <td>${month.phase}</td>
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

