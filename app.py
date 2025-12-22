from flask import Flask, render_template, request, jsonify
import os
import json
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Database setup
DATABASE = 'projects.db'

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize the database with projects table"""
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date TEXT,
            contract_value REAL NOT NULL,
            time_frame INTEGER NOT NULL,
            payment_lag INTEGER NOT NULL,
            contingency_percent REAL NOT NULL,
            cash_floor REAL NOT NULL,
            phases TEXT NOT NULL,
            delays TEXT NOT NULL,
            unexpected_costs TEXT NOT NULL,
            billing_milestones TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Add start_date column if it doesn't exist (migration)
    try:
        conn.execute('ALTER TABLE projects ADD COLUMN start_date TEXT')
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.close()

# Initialize database on startup
init_db()


@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/generate_forecast', methods=['POST'])
def generate_forecast_route():
    """Generate forecast based on assumptions given"""
    try:
        # Get the assumptions from the request
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'No data provided'}), 400
        
        inputs = data.get('inputs')
        if not inputs:
            return jsonify({'success': False, 'message': 'No inputs provided'}), 400
        
        scenario = data.get('scenario', 'base')
        
        # Validate the inputs
        if not validate_inputs(inputs):
            return jsonify({'success': False, 'message': 'Invalid inputs provided'}), 400

        print("Inputs validated")
        parsed_inputs = parse_inputs(inputs)
        # Generate the forecast
        forecast_result = calculate_forecast(parsed_inputs)

        # Return the forecast
        return jsonify({'success': True, 'message':'Forecast generated successfully', 'forecast': forecast_result})
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

def validate_inputs(inputs):
    """Validate the inputs"""
    """Leaving this function empty for now"""
    return True

@app.route('/get_projects', methods=['GET'])
def get_projects():
    """Get all saved projects"""
    try:
        conn = get_db()
        projects = conn.execute('''
            SELECT id, name, start_date, contract_value, time_frame, payment_lag, 
                   contingency_percent, cash_floor, created_at, updated_at
            FROM projects
            ORDER BY created_at DESC
        ''').fetchall()
        conn.close()
        
        projects_list = []
        for project in projects:
            projects_list.append({
                'id': project['id'],
                'name': project['name'],
                'start_date': project['start_date'] or '',
                'contract_value': project['contract_value'],
                'time_frame': project['time_frame'],
                'payment_lag': project['payment_lag'],
                'contingency_percent': project['contingency_percent'],
                'cash_floor': project['cash_floor'],
                'created_at': project['created_at'],
                'updated_at': project['updated_at']
            })
        
        return jsonify({'success': True, 'projects': projects_list})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/get_project/<int:project_id>', methods=['GET'])
def get_project(project_id):
    """Get a specific project by ID with all its data"""
    try:
        conn = get_db()
        project = conn.execute('''
            SELECT id, name, start_date, contract_value, time_frame, payment_lag, 
                   contingency_percent, cash_floor, phases, delays, 
                   unexpected_costs, billing_milestones, created_at, updated_at
            FROM projects
            WHERE id = ?
        ''', (project_id,)).fetchone()
        conn.close()
        
        if not project:
            return jsonify({'success': False, 'message': 'Project not found'}), 404
        
        # Parse JSON strings back to dictionaries
        # Convert delay keys from strings to integers (as they were stored as strings)
        delays_parsed = json.loads(project['delays'])
        delays_converted = {}
        for key, value in delays_parsed.items():
            delays_converted[int(key)] = value
        
        project_data = {
            'id': project['id'],
            'name': project['name'],
            'start_date': project['start_date'] or '',
            'contract_value': project['contract_value'],
            'time_frame': project['time_frame'],
            'payment_lag': project['payment_lag'],
            'contingency_percent': project['contingency_percent'],
            'cash_floor': project['cash_floor'],
            'phases': json.loads(project['phases']),
            'delays': delays_converted,
            'unexpected_costs': json.loads(project['unexpected_costs']),
            'billing_milestones': json.loads(project['billing_milestones']),
            'created_at': project['created_at'],
            'updated_at': project['updated_at']
        }
        
        return jsonify({'success': True, 'project': project_data})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/create_project', methods=['POST'])
def create_project_route():
    """Create and save a project"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'No data provided'}), 400
        
        project_name = data.get('name', '')
        if not project_name:
            return jsonify({'success': False, 'message': 'Project name is required'}), 400
        
        inputs = data.get('inputs')
        if not inputs:
            return jsonify({'success': False, 'message': 'No inputs provided'}), 400
        if not validate_inputs(inputs):
            return jsonify({'success': False, 'message': 'Invalid inputs provided'}), 400
        
        parsed_inputs = parse_inputs(inputs)
        if not parsed_inputs or (isinstance(parsed_inputs, dict) and parsed_inputs.get('success') == False):
            return jsonify({'success': False, 'message': 'Failed to parse inputs'}), 400
        
        # Save the project to database
        project_id = save_project_to_db(project_name, parsed_inputs, inputs)
        
        return jsonify({
            'success': True, 
            'message': 'Project created successfully', 
            'project_id': project_id,
            'project_name': project_name
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# list of inputs used:
# Contract Value
# Project start date
# Project end date
# Monthly Expense/Burn
# Contingency % -- what is this?
# Payment lag -- what is this?
# Billing Milstones -- what is this?

def parse_inputs(inputs):
    """Parse the inputs"""
    try:
        # Parse the inputs
        # Setup - Convert all inputs to proper types
        time_frame = int(inputs['time_frame'])
        payment_lag = int(inputs['payment_lag'])
        contract_value = float(inputs['contract_value'])
        min_cash_allowed = float(inputs['cash_floor'])
        contingency_percent = float(inputs['contingency_percent'])

        print("Inputs converted")

        phases = inputs.get('phases', {})
        delays = inputs.get('delays', {})
        unexpected_costs = inputs.get('unexpected_costs', {})
        billing_milestones = inputs.get('billing_milestones', {})

        # Convert delay values to proper types
        delays_processed = {}
        for key, delay in delays.items():
            if key is not None and key != '':
                delays_processed[int(key)] = {
                    'length': int(delay.get('length', 0)),
                    'expense': float(delay.get('expense', 0))
                }
        print("Delays converted")

        # Convert phase values to proper types
        phases_processed = {}
        for phase_name, phase_data in phases.items():
            phases_processed[str(phase_name)] = {
                'length': int(phase_data.get('length', 0)),
                'expense': float(phase_data.get('expense', 0)),
                'overhead': float(phase_data.get('overhead', 0)),
                'upfront': float(phase_data.get('upfront', 0))
            }
        print("Phases converted")

        # Convert unexpected costs to proper types
        unexpected_costs_processed = {}
        for key, value in unexpected_costs.items():
            unexpected_costs_processed[str(key)] = float(value)
        print("Unexpected costs converted")
        # Convert billing milestones keys to strings (they come as strings from frontend)
        billing_milestones_processed = {}
        for key, value in billing_milestones.items():
            billing_milestones_processed[str(key)] = float(value)
        print("Billing milestones converted")

        phases = phases_processed
        delays = delays_processed
        unexpected_costs = unexpected_costs_processed
        billing_milestones = billing_milestones_processed

        return {
            'time_frame': time_frame,
            'payment_lag': payment_lag,
            'contract_value': contract_value,
            'min_cash_allowed': min_cash_allowed,
            'contingency_percent': contingency_percent,
            'phases': phases,
            'delays': delays,
            'unexpected_costs': unexpected_costs,
            'billing_milestones': billing_milestones
        }
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

def calculate_forecast(parsed_inputs):
    """Generate the forecast"""
    try:
        time_frame = parsed_inputs['time_frame']
        payment_lag = parsed_inputs['payment_lag']
        contract_value = parsed_inputs['contract_value']
        min_cash_allowed = parsed_inputs['min_cash_allowed']
        contingency_percent = parsed_inputs['contingency_percent']
        phases = parsed_inputs['phases']
        delays = parsed_inputs['delays']
        unexpected_costs = parsed_inputs['unexpected_costs']
        billing_milestones = parsed_inputs['billing_milestones']
        print("Inputs Setup Complete")

        min_net_cash = 0
        min_net_cash_month = 0
        verdict = 'Go'
        cumulative_net_cash = 0
        cumulative_expenses = 0
        payback_period = 999
        payback_found = False

        total_delays = sum(delay['length'] for delay in delays.values())
        cumulative_delays = 0
        current_delay = False
        delay_remaining = 0

        print("Total delays calculated")

        if not phases:
            return {'success': False, 'message': 'No phases provided'}
        
        current_phase = next(iter(phases))
        current_phase_remaining = int(phases[current_phase]['length']) - 1
        current_phase_expense = float(phases[current_phase]['expense'])
        current_phase_overhead = float(phases[current_phase]['overhead'])
        current_phase_upfront = float(phases[current_phase]['upfront'])
        phase_change = True
        cumulative_cash_out = 0
        delay_start = 0
        # Calculate the forecast
        forecast = []

        print("Setup Complete")
        for i in range(1, time_frame+payment_lag+total_delays+1):
            # Determine current delay
            # If the current month is a delay, set the current delay to true and decrement the delay remaining
            # If the delay remaining is 0, set the current delay to false
            if i in delays:
                cumulative_delays += int(delays[i]['length'])
                current_delay = True
                delay_remaining = int(delays[i]['length']) - 1
                delay_start = i
            elif current_delay and delay_remaining > 0:
                delay_remaining -= 1
            else:
                current_delay = False
                delay_remaining = 0
                delay_start = 0

            print("Delay Determined")

            # Determine current phase
            # If the current phase is not complete, decrement the remaining months and set the phase change to false
            if current_phase_remaining >= 0:
                if not current_delay:
                    current_phase_remaining -= 1
                phase_change = False
            else:
                # Get next phase (this is a simplified version - you may want to track phase order)
                phase_list = list(phases.keys())
                current_index = phase_list.index(current_phase) if current_phase in phase_list else 0
                next_index = (current_index + 1) % len(phase_list)
                if next_index == 0:
                    current_phase = None
                    current_phase_remaining = 99
                    phase_change = True
                    current_phase_expense = 0
                    current_phase_overhead = 0
                    current_phase_upfront = 0
                else: 
                    current_phase = phase_list[next_index]
                    current_phase_remaining = int(phases[current_phase]['length']) - 1
                    current_phase_expense = float(phases[current_phase]['expense'])
                    current_phase_overhead = float(phases[current_phase]['overhead'])
                    current_phase_upfront = float(phases[current_phase]['upfront'])
                    phase_change = True

            print("Phase Determined")

            # Check if current phase has unexpected costs
            if current_phase in unexpected_costs:
                unexpected_cost_percent = unexpected_costs[current_phase]
                unexpected_cost = current_phase_expense * unexpected_cost_percent
            else: 
                unexpected_cost = 0
            
            print("Unexpected Cost Determined")

            # Calculate the cash in and cash out
            # billing_milestones is a dict with month indices (0-based) and percentages
            if not current_delay:
                milestone_key = str(i - payment_lag - cumulative_delays) if i >= payment_lag + cumulative_delays else None
                milestone_percent = billing_milestones.get(milestone_key, 0) if milestone_key else 0
                cash_in = milestone_percent * contract_value
            else:
                cash_in = 0

            print("Cash In Determined")

            # During a delay, the cash out is just the delay expense plus overhead
            # Overhead does not apply to cumulative expense that is uses for gross margin calculation
            if current_delay:
                if delay_start in delays:
                    delay_expense = float(delays[delay_start]['expense'])
                    cumulative_expenses += delay_expense
                    cash_out = delay_expense + current_phase_overhead
            else:
                cumulative_expenses += current_phase_expense + (contingency_percent * current_phase_expense) + unexpected_cost
                cash_out = current_phase_expense + current_phase_overhead + (contingency_percent * current_phase_expense) + unexpected_cost

            print("Cash Out Determined")

            net_cash = cash_in - cash_out
            cumulative_net_cash += net_cash
            cumulative_cash_out += cash_out

            if phase_change or i == 1:
                net_cash -= current_phase_upfront
                cash_out += current_phase_upfront
                cumulative_net_cash -= current_phase_upfront
                cumulative_expenses -= current_phase_upfront
            forecast.append({
                'cash_in': cash_in,
                'cash_out': cash_out,
                'net_cash': net_cash,
                'cumulative_net_cash': cumulative_net_cash,
                'phase': current_phase,
            })
            print("Forecast Appended")

            # Set the minimum net cash and the minimum net cash month
            if i == 1:
                min_net_cash = cumulative_net_cash
            else:
                if cumulative_net_cash < min_net_cash:
                    min_net_cash = cumulative_net_cash
                    min_net_cash_month = i

            # If the cumulative net cash is less than the minimum cash allowed, the project is should be restructured
            if cumulative_net_cash < min_cash_allowed:
                verdict = 'Restructure'
            
            # If the cumulative net cash is greater than 0 and the payback period has not been found, set the payback period to the current month
            if cumulative_net_cash > 0 and payback_found == False:
                payback_period = i
                payback_found = True
                
        print("made it through loop")
        # If the contract value is less than the monthly expense multiplied by the time frame, the project is not profitable
        if contract_value < cumulative_cash_out:
            verdict = 'Not Profitable'

        # Calculate the gross margin and the margin with contingency
        gross_margin = (contract_value - cumulative_expenses) / contract_value

        print(forecast)

        return {
            'forecast': forecast,
            'verdict': verdict,
            'payback_period': payback_period,
            'gross_margin': gross_margin,
            'min_net_cash': min_net_cash,
            'min_net_cash_month': min_net_cash_month,
            'cumulative_net_cash': cumulative_net_cash
        }
    except Exception as e:
        print("Exception in generate_forecast: ", e)
        return jsonify({'success': False, 'message': str(e)}), 500

def save_project_to_db(project_name, parsed_inputs, original_inputs):
    """Save project to SQLite database"""
    try:
        conn = get_db()
        
        # Convert complex data structures to JSON strings for storage
        phases_json = json.dumps(parsed_inputs['phases'])
        delays_json = json.dumps({str(k): v for k, v in parsed_inputs['delays'].items()})
        unexpected_costs_json = json.dumps(parsed_inputs['unexpected_costs'])
        billing_milestones_json = json.dumps(parsed_inputs['billing_milestones'])
        
        start_date = original_inputs.get('start_date', '')
        
        cursor = conn.execute('''
            INSERT INTO projects (
                name, start_date, contract_value, time_frame, payment_lag, 
                contingency_percent, cash_floor, phases, delays, 
                unexpected_costs, billing_milestones
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            project_name,
            start_date,
            parsed_inputs['contract_value'],
            parsed_inputs['time_frame'],
            parsed_inputs['payment_lag'],
            parsed_inputs['contingency_percent'],
            parsed_inputs['min_cash_allowed'],
            phases_json,
            delays_json,
            unexpected_costs_json,
            billing_milestones_json
        ))
        
        project_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        print(f"Project '{project_name}' saved with ID: {project_id}")
        return project_id
    except Exception as e:
        print(f"Error saving project: {e}")
        raise

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
