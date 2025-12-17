from flask import Flask, render_template, request, jsonify
import os
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)


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

        # Generate the forecast
        forecast_result = calculate_forecast(inputs, scenario)

        # Return the forecast
        return jsonify({'success': True, 'message':'Forecast generated successfully', 'forecast': forecast_result})
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

def validate_inputs(inputs):
    """Validate the inputs"""
    """Leaving this function empty for now"""
    return True
# list of inputs used:
# Contract Value
# Project start date
# Project end date
# Monthly Expense/Burn
# Contingency % -- what is this?
# Payment lag -- what is this?
# Billing Milstones -- what is this?

def calculate_forecast(inputs, scenario):
    """Generate the forecast"""
    try:
        # Setup
        time_frame = inputs['time_frame']

        phases = inputs['phases']
        delays = inputs['delays']
        unexpected_costs = inputs['unexpected_costs']

        contingency_percent = inputs['contingency_percent']
        payment_lag = inputs['payment_lag']

        billing_milestones = inputs['billing_milestones']
        contract_value = inputs['contract_value']
        min_cash_allowed = inputs['cash_floor']


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

        current_phase = next(iter(phases))
        current_phase_remaining = phases[current_phase]['length'] - 1
        current_phase_expense = phases[current_phase]['expense']
        current_phase_overhead = phases[current_phase]['overhead']
        current_phase_upfront = phases[current_phase]['upfront']
        phase_change = True
        # Calculate the forecast
        forecast = []

        print("Setup Complete")
        for i in range(1, time_frame+payment_lag+total_delays+1):
            # Determine current delay
            # If the current month is a delay, set the current delay to true and decrement the delay remaining
            # If the delay remaining is 0, set the current delay to false
            if i in delays:
                cumulative_delays += delays[i]['length']
                current_delay = True
                delay_remaining = delays[i]['length'] - 1
            elif current_delay and delay_remaining > 0:
                delay_remaining -= 1
            else:
                current_delay = False
                delay_remaining = 0

            print("Delay Determined")

            # Determine current phase
            # If the current phase is not complete, decrement the remaining months and set the phase change to false
            if current_phase_remaining > 0:
                current_phase_remaining -= 1
                phase_change = False
            else:
                current_phase = next(iter(phases))
                current_phase_remaining = phases[current_phase]['length'] - 1
                current_phase_expense = phases[current_phase]['expense']
                current_phase_overhead = phases[current_phase]['overhead']
                current_phase_upfront = phases[current_phase]['upfront']
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

            # If the month is after the time frame, the cash out is just the monthly burn
            if i > time_frame:
                cash_out = monthly_burn
            # During a delay, the cash out is just the delay expense plus overhead
            # Overhead does not apply to cumulative expense that is uses for gross margin calculation
            elif current_delay:
                cumulative_expenses += delays[i]['expense']
                cash_out = delays[i]['expense'] + phases[i]['overhead']
            else:
                cumulative_expenses += current_phase_expense + (contingency_percent * current_phase_expense) + unexpected_cost
                cash_out = current_phase_expense + current_phase_overhead + (contingency_percent * current_phase_expense) + unexpected_cost

            print("Cash Out Determined")

            net_cash = cash_in - cash_out
            cumulative_net_cash += net_cash

            if phase_change:
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
        if contract_value < contingency_percent*monthly_expense*time_frame:
            verdict = 'Not Profitable'

        # Calculate the gross margin and the margin with contingency
        gross_margin = (contract_value - cumulative_expenses) / contract_value

        print(forecast)

        return {
            'forecast': forecast,
            'verdict': verdict,
            'payback_period': payback_period,
            'gross_margin': gross_margin,
            'margin_w_contingency': margin_w_contingency,
            'min_net_cash': min_net_cash,
            'min_net_cash_month': min_net_cash_month,
            'cumulative_net_cash': cumulative_net_cash
        }
    except Exception as e:
        print("Exception in generate_forecast: ", e)
        return jsonify({'success': False, 'message': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
