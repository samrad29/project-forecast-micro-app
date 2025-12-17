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

        monthly_burn = inputs['monthly_burn']
        monthly_expense = inputs['monthly_expense']
        contingency_percent = inputs['contingency_percent']

        payment_lag = inputs['payment_lag']
        billing_milestones = inputs['billing_milestones']
        contract_value = inputs['contract_value']
        upfront_cost = inputs['upfront_cost']
        min_cash_allowed = inputs['cash_floor']

        if scenario == 'worst_case':
            monthly_expense = monthly_expense * 1.15
            payment_lag = payment_lag + 1
            time_frame = round(time_frame*1.15)
        
        if scenario == 'delayed':
            time_frame = round(time_frame*1.2)

        if scenario == 'over_budget':
            monthly_expense = monthly_expense * 1.2


        min_net_cash = 0
        min_net_cash_month = 0
        verdict = 'Go'
        cumulative_net_cash = 0
        payback_period = 999
        payback_found = False

        # Calculate the forecast
        forecast = []
        for i in range(1, time_frame+payment_lag+1):
            # Calculate the cash in and cash out
            # billing_milestones is a dict with month indices (0-based) and percentages
            milestone_key = str(i - payment_lag) if i >= payment_lag else None
            milestone_percent = billing_milestones.get(milestone_key, 0) if milestone_key else 0
            cash_in = milestone_percent * contract_value

            # If the month is after the time frame, the cash out is just the monthly burn
            if i > time_frame:
                cash_out = monthly_burn
            else:
                cash_out = monthly_burn + monthly_expense + (contingency_percent * monthly_expense)
            net_cash = cash_in - cash_out
            cumulative_net_cash += net_cash
            if i == 1:
                cash_out += upfront_cost
                cumulative_net_cash -= upfront_cost
            forecast.append({
                'cash_in': cash_in,
                'cash_out': cash_out,
                'net_cash': net_cash,
                'cumulative_net_cash': cumulative_net_cash,
            })

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
        
        # If the contract value is less than the monthly expense multiplied by the time frame, the project is not profitable
        if contract_value < contingency_percent*monthly_expense*time_frame:
            verdict = 'Not Profitable'

        # Calculate the gross margin and the margin with contingency
        gross_margin = (contract_value - (monthly_expense*time_frame)) / contract_value
        margin_w_contingency = (contract_value - (contingency_percent*monthly_expense*time_frame)) / contract_value

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
