from dotenv import load_dotenv
import os
import openai, re
import smtplib
from email.mime.text import MIMEText
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_cors import CORS
import random
import time
import json
from datetime import datetime, timedelta
import requests
import difflib


with open(os.path.join('data', 'places.json'), 'r', encoding='utf-8') as f:
    PLACES = json.load(f)

# === Load .env and API Keys ===
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
AZURE_API_KEY = os.getenv("AZURE_API_KEY")
AZURE_SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
MAIL_USER = os.getenv("MAIL_USER")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")

app = Flask(__name__)
CORS(app)
app.secret_key = 'your_secret_key'

# In-memory user store and verification codes
users = {}  # {email: {"username": ..., "password": ...}}
VERIFICATION_CODES = {}  # {email: {"code": "123456", "timestamp": 1717310000}}

def send_email(recipient, subject, body):
    smtp_server = "smtp.gmail.com"
    smtp_port = 587
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = MAIL_USER
    msg["To"] = recipient

    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(MAIL_USER, MAIL_PASSWORD)
        server.sendmail(MAIL_USER, recipient, msg.as_string())

def is_halal_question(message):
    return "halal" in message.lower()

def fuzzy_find_place(message, threshold=0.75):
    msg = message.lower()
    candidates = []
    for place in PLACES:
        # Fuzzy match on place name
        ratio = difflib.SequenceMatcher(None, place.get("name", "").lower(), msg).ratio()
        if ratio >= threshold or place.get("name", "").lower() in msg or msg in place.get("name", "").lower():
            return place
        # Fuzzy match on selected tags/keywords
        for key, value in place.items():
            if isinstance(value, bool) and value:
                if key.replace("_", " ") in msg or key in msg:
                    return place
                ratio = difflib.SequenceMatcher(None, key.replace("_", " "), msg).ratio()
                if ratio >= threshold:
                    return place
    return None

def check_halal_status(place):
    if place.get("alcohol") or place.get("pork"):
        reasons = []
        if place.get("alcohol"): reasons.append("alcohol")
        if place.get("pork"): reasons.append("pork")
        return f"No, this place is not halal because it serves {', '.join(reasons)}."
    return "Sorry, there is no halal status information available for this place."

def make_place_reply(place):
    lines = [f"{place['name']}: {place.get('description', '')}"]
    if "address" in place:
        lines.append(f"Address: {place['address']}")
    if "hours" in place:
        today = datetime.now().strftime("%a").lower()
        hour_info = place["hours"].get(today)
        if hour_info:
            lines.append(f"Today's hours: {hour_info}")
    feature_list = [k.replace("_", " ").capitalize() for k, v in place.items()
                    if isinstance(v, bool) and v and k not in ("restaurant", "cafe")]
    if feature_list:
        lines.append("Features: " + ", ".join(feature_list[:3]))
    if "menu" in place:
        lines.append(f"Menu: {place['menu']}")
    if "map_link" in place or "map link" in place:
        lines.append(f"Google Maps: {place.get('map_link', place.get('map link'))}")
    lines.append("Would you like to know more about this place or other options?")
    return "\n".join(lines)

def search_azure(query):
    url = f"{AZURE_SEARCH_ENDPOINT}/bing/v7.0/search"
    headers = {"Ocp-Apim-Subscription-Key": AZURE_API_KEY}
    params = {"q": query, "textDecorations": True, "textFormat": "HTML"}
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        data = response.json()
        if "webPages" in data and "value" in data["webPages"] and len(data["webPages"]["value"]) > 0:
            top_result = data["webPages"]["value"][0]
            return f"{top_result['name']}: {top_result['snippet']} ({top_result['url']})"
    return None

def get_today_status(place):
    import pytz
    tz = pytz.timezone("Asia/Kuching")
    now = datetime.now(tz)
    days = ['mon','tue','wed','thu','fri','sat','sun']
    today = days[now.weekday()]

    hours = place.get('hours', {})
    today_hours = hours.get(today)
    if not today_hours or today_hours.lower() == "closed":
        return ("closed", None, None)

    open_str, close_str = today_hours.split('-')
    open_hour, open_min = map(int, open_str.strip().split(':'))
    close_hour, close_min = map(int, close_str.strip().split(':'))

    open_time = now.replace(hour=open_hour, minute=open_min, second=0, microsecond=0)
    close_time = now.replace(hour=close_hour, minute=close_min, second=0, microsecond=0)
    # Handle after midnight closing (eg, close_time < open_time)
    if close_time <= open_time:
        close_time += timedelta(days=1)

    if now < open_time:
        diff = (open_time - now).total_seconds() // 60
        if diff < 60:
            return ("opensoon", int(diff), today_hours)
        else:
            return ("closed", None, today_hours)
    elif open_time <= now < close_time:
        diff = (close_time - now).total_seconds() // 60
        if diff < 60:
            return ("closingsoon", int(diff), today_hours)
        else:
            return ("open", None, today_hours)
    else:
        return ("closed", None, today_hours)

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    username = data.get('username')
    password = data.get('password')
    # Validation
    if not email or not username or not password:
        return jsonify({"success": False, "message": "Missing fields"}), 400
    if len(password) < 8:
        return jsonify({"success": False, "message": "Password must be at least 8 characters."}), 400
    if email in users:
        return jsonify({"success": False, "message": "Email already registered."}), 400
    # Register the user
    users[email] = {"username": username, "password": password}
    return jsonify({"success": True, "message": "Account created"})

@app.route('/api/login', methods=['POST'])
def api_login():
    # login logic here
    return jsonify(success=True)

@app.route('/api/send_verification', methods=['POST'])
def send_verification():
    data = request.get_json()
    email = data.get("email")
    if not email or '@' not in email:
        return jsonify({"success": False, "message": "Invalid email"}), 400
    if email not in users:
        return jsonify({"success": False, "message": "Email not registered."}), 404

    code = f"{random.randint(100000, 999999)}"
    VERIFICATION_CODES[email] = {
        "code": code,
        "timestamp": int(time.time())
    }
    try:
        send_email(
            recipient=email,
            subject="Your Verification Code",
            body=f"Your verification code is: {code}"
        )
    except Exception as e:
        # For production, consider logging this instead of printing
        print(f"Failed to send email: {e!r}")
        return jsonify({"success": False, "message": "Failed to send email."}), 500
    return jsonify({"success": True, "message": "Verification code sent"})

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_message = data.get('message', '')

    # 1. Halal question gets highest priority, dataset only
    if is_halal_question(user_message):
        place = fuzzy_find_place(user_message)
        if place:
            reply = check_halal_status(place)
            return jsonify({"reply": reply})
        else:
            return jsonify({"reply": "Sorry, I don't have halal status information for that place."})

    # 2. Try to find a matching place in your database (with fuzzy matching)
    place = fuzzy_find_place(user_message)
    if place:
        reply = make_place_reply(place)
        return jsonify({"reply": reply})

    # 3. Try Azure Search for anything not in your local dataset
    azure_answer = search_azure(user_message)
    if azure_answer:
        return jsonify({"reply": f"{azure_answer}\n(Source: web search)"})

    # 4. Final fallback: OpenAI GPT-4o
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a tourism assistant for Sibu, Malaysia. Answer clearly and briefly."},
                {"role": "user", "content": user_message}
            ],
            max_tokens=256,
            temperature=0.3,
        )
        answer = response.choices[0].message.content.strip()
        return jsonify({"reply": answer})
    except Exception as e:
        print("OpenAI error:", repr(e))
        return jsonify({"reply": "Sorry, I have no relevant information for your request and won't guess. Please try rephrasing or ask about another topic."})

@app.route('/api/verify_code', methods=['POST'])
def verify_code():
    data = request.get_json()
    email = data.get("email")
    code = data.get("code")
    info = VERIFICATION_CODES.get(email)
    now = int(time.time())
    if not info or not code:
        return jsonify({"success": False, "message": "Invalid or expired code"}), 400
    if now - info["timestamp"] > 60:
        VERIFICATION_CODES.pop(email, None)
        return jsonify({"success": False, "message": "Verification code expired"}), 400
    if code != info["code"]:
        return jsonify({"success": False, "message": "Incorrect code"}), 400
    # Mark this code as used (remove)
    VERIFICATION_CODES.pop(email, None)
    session["reset_email"] = email
    return jsonify({"success": True})
    
@app.route('/reset_pw', methods=['GET', 'POST'])
def reset_pw_page():
    if request.method == 'POST':
        new_pw = request.form.get('new_password')
        email = session.get("reset_email")
        if not email or not new_pw:
            return redirect(url_for('login_page'))
        if len(new_pw) < 8:
            return render_template('reset_pw.html', error="Password must be at least 8 characters.")
        users[email]['password'] = new_pw
        session.pop("reset_email", None)
        return redirect(url_for('login_page'))
    return render_template('reset_pw.html')

@app.route('/api/places')
def api_places():
    data_path = os.path.join('data', 'places.json')
    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return jsonify(data)

# Example main routes (fill in your own templates as needed)
@app.route('/')
def mainpage():
    return render_template('mainpage.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/signup')
def signup_page():
    return render_template('signup.html')

@app.route('/userpage')
def user_page():
    return render_template('userpage.html')

@app.route('/chatbot')
def chatbot_page():
    return render_template('chatbot.html')

@app.route('/place_detail/<slug>')
def place_detail(slug):
    def slugify(text):
        return (
            text.lower()
            .encode('ascii', 'ignore')
            .decode()
            .replace("'", "")
            .replace("&", "and")
            .replace("(", "").replace(")", "")
            .replace("/", "-")
            .replace(".", "")
            .replace(",", "")
            .replace(" ", "-")
        )
    # Find place with matching slug
    for place in PLACES:
        if slugify(place["name"]) == slug:
            status, minutes, today_hours = get_today_status(place)
            return render_template(
                'place_detail.html',
                place=place,
                today_status=status,
                today_minutes=minutes,
                today_hours=today_hours
            )
    return "Place not found", 404

CATEGORY_PAGES = {
    "cuisines": "cuisine",
    "shopping": "shopping",
    "attractions": "attractions",
    "entertainment": "entertainment",
    "transport": "transport",
    "services": "services",
    "religion": "religion",
    "accomodation": "accomodation"
}

@app.route('/<page>')
def section_page(page):
    if page in CATEGORY_PAGES:
        return render_template(
            'category_base.html',
            section_category=CATEGORY_PAGES[page],
            title=page.capitalize()
        )
    # fallback: 404 or other logic
    return "Page not found", 404


@app.route('/admin_login')
def admin_login_page():
    return render_template('admin_login.html')

@app.route('/admin/accounts')
def admin_accounts_page():
    return render_template('admin_accounts.html')

@app.route('/forgot_pw')
def forgot_pw_page():
    return render_template('forgot_pw.html')

@app.route('/account')
def account_page():
    return render_template('account.html')

if __name__ == '__main__':
    app.run(debug=True)
