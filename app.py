from dotenv import load_dotenv
import os
import openai, re
import smtplib
from email.mime.text import MIMEText
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import random
import time
import json
from datetime import datetime, timedelta
import requests
import difflib
from flask_sqlalchemy import SQLAlchemy

# --- Load .env and API Keys ---
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
AZURE_API_KEY = os.getenv("AZURE_API_KEY")
AZURE_SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
MAIL_USER = os.getenv("MAIL_USER")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")

app = Flask(__name__)
CORS(app)
app.secret_key = 'your_secret_key'

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    username = db.Column(db.String(80), nullable=False)
    password = db.Column(db.String(120), nullable=False)
    profile_pic = db.Column(db.String(120), default='default.png')

with app.app_context():
    db.create_all()

VERIFICATION_CODES = {}

# --- Load places data ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PLACES_PATH = os.path.join(BASE_DIR, 'data', 'places.json')
with open(PLACES_PATH, 'r', encoding='utf-8') as f:
    PLACES = json.load(f)

def get_profile_pic_url():
    email = session.get("email")
    user = User.query.filter_by(email=email).first() if email else None
    filename = user.profile_pic if user and user.profile_pic else "default.png"
    if filename == "default.png":
        return url_for('static', filename='images/default.png')
    else:
        return url_for('static', filename=f'uploads/{filename}')

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
    for place in PLACES:
        ratio = difflib.SequenceMatcher(None, place.get("name", "").lower(), msg).ratio()
        if ratio >= threshold or place.get("name", "").lower() in msg or msg in place.get("name", "").lower():
            return place
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
    h = today_hours.strip().lower()
    if h in ["24 hours", "open 24 hours", "24h", "00:00-23:59", "00:00-00:00", "全天", "24小时"]:
        return ("open", None, today_hours)
    open_str, close_str = today_hours.split('-')
    open_hour, open_min = map(int, open_str.strip().split(':'))
    close_hour, close_min = map(int, close_str.strip().split(':'))
    open_time = now.replace(hour=open_hour, minute=open_min, second=0, microsecond=0)
    close_time = now.replace(hour=close_hour, minute=close_min, second=0, microsecond=0)
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

UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Account page (edit profile, password, email, profile pic, delete) ---
@app.route('/account', methods=['GET', 'POST'])
def account_page():
    email = session.get("email")
    if not email:
        return redirect(url_for("login_page"))
    user = User.query.filter_by(email=email).first()
    if not user:
        session.pop("email", None)
        return redirect(url_for("login_page"))
    msg = ""
    if request.method == "POST":
        try:
            # Edit username
            if 'username' in request.form:
                user.username = request.form.get("username", user.username)
                db.session.commit()
                msg = "Username updated."
            # Change email
            if 'new_email' in request.form:
                new_email = request.form.get("new_email").strip().lower()
                if new_email and new_email != email and not User.query.filter_by(email=new_email).first():
                    user.email = new_email
                    db.session.commit()
                    session["email"] = new_email
                    email = new_email
                    msg = "Email updated successfully."
                else:
                    msg = "Invalid or duplicate email."
            # Change password
            if 'new_password' in request.form:
                pw = request.form.get("new_password")
                if pw and is_secure_password(pw):
                    user.password = generate_password_hash(pw)
                    db.session.commit()
                    msg = "Password updated."
                else:
                    msg = "Password must be at least 8 characters and include both letters and numbers."
            # Upload profile picture
            if 'profile_pic' in request.files:
                file = request.files['profile_pic']
                if file and allowed_file(file.filename):
                    filename = secure_filename(f"{email}_{file.filename}")
                    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    user.profile_pic = filename
                    db.session.commit()
                    msg = "Profile picture updated."
            # Delete account
            if "delete_account" in request.form:
                db.session.delete(user)
                db.session.commit()
                session.pop("email", None)
                return redirect(url_for("mainpage"))
        except Exception as e:
            print("Account update error:", e)
            msg = f"Error: {e}"
    profile_pic_url = get_profile_pic_url()
    return render_template('account.html', user=user, profile_pic_url=profile_pic_url, msg=msg)
    
# --- Logout route ---
@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

# --- Chatbot page, with profile pic passed in ---
@app.route('/chatbot')
def chatbot_page():
    email = session.get("email")
    user = User.query.filter_by(email=email).first() if email else None
    profile_pic = user.profile_pic if user and user.profile_pic else "default.png"
    return render_template('chatbot.html', profile_pic_url=url_for('static', filename=f'uploads/{profile_pic}'))

# --- Registration/Login/Reset/Other APIs unchanged ---
def is_secure_password(pw):
    return (
        len(pw) >= 8 and
        re.search(r"[A-Za-z]", pw) and
        re.search(r"\d", pw)
    )

@app.route('/login_page')
def login_page():
    return render_template('login.html')

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    # Find user by email
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'success': False, 'message': 'Invalid email or password.'}), 401

    # Check hashed password
    if not check_password_hash(user.password, password):
        return jsonify({'success': False, 'message': 'Invalid email or password.'}), 401

    # Login successful: set session or return token as needed
    session['email'] = user.email  # or any other session management you want

    # Optionally, redirect after login (your frontend handles this)
    return jsonify({'success': True, 'redirect': '/userpage'})


@app.route('/register', methods=['GET', 'POST'])
def register_page():
    print("is_json:", request.is_json)
    print("content-type:", request.headers.get("Content-Type"))
    if request.method == 'POST':
        try:
            if request.is_json:
                data = request.get_json()
                email = data.get('email', '').strip().lower()
                username = data.get('username', '').strip()
                password = data.get('password', '')
            else:
                email = request.form.get('email', '').strip().lower()
                username = request.form.get('username', '').strip()
                password = request.form.get('password', '')

            if not email or not username or not password:
                msg = "Missing fields"
                if request.is_json:
                    return jsonify({"success": False, "message": msg})
                return render_template('signup.html', error=msg)

            if not is_secure_password(password):
                msg = "Password must be at least 8 characters and include both letters and numbers."
                if request.is_json:
                    return jsonify({"success": False, "message": msg})
                return render_template('signup.html', error=msg)

            if User.query.filter_by(email=email).first():
                msg = "Email already registered."
                if request.is_json:
                    return jsonify({"success": False, "message": msg})
                return render_template('signup.html', error=msg)

            hashed_pw = generate_password_hash(password)
            user = User(email=email, username=username, password=hashed_pw)
            db.session.add(user)
            db.session.commit()
            session['email'] = email

            if request.is_json:
                return jsonify({"success": True})
            return redirect(url_for('account_page'))

        except Exception as e:
            msg = f"Registration error: {e}"
            print(msg)
            if request.is_json:
                return jsonify({"success": False, "message": msg})
            return render_template('signup.html', error=msg)

    return render_template('signup.html')

@app.route('/api/send_verification', methods=['POST'])
def send_verification():
    data = request.get_json()
    email = data.get("email")
    if not email or '@' not in email:
        return jsonify({"success": False, "message": "Invalid email"}), 400
    user = User.query.filter_by(email=email).first()
    if not user:
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
        print(f"Failed to send email: {e!r}")
        return jsonify({"success": False, "message": "Failed to send email."}), 500
    return jsonify({"success": True, "message": "Verification code sent"})

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_message = data.get('message', '')
    if is_halal_question(user_message):
        place = fuzzy_find_place(user_message)
        if place:
            reply = check_halal_status(place)
            return jsonify({"reply": reply})
        else:
            return jsonify({"reply": "Sorry, I don't have halal status information for that place."})
    place = fuzzy_find_place(user_message)
    if place:
        reply = make_place_reply(place)
        return jsonify({"reply": reply})
    azure_answer = search_azure(user_message)
    if azure_answer:
        return jsonify({"reply": f"{azure_answer}\n(Source: web search)"})
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
        if not is_secure_password(new_pw):
            return render_template('reset_pw.html', error="Password must be at least 8 characters and include both letters and numbers.")
        user = User.query.filter_by(email=email).first()
        if not user:
            return redirect(url_for('login_page'))
        user.password = generate_password_hash(new_pw)
        db.session.commit()
        session.pop("reset_email", None)
        return redirect(url_for('login_page'))
    return render_template('reset_pw.html')

@app.route('/api/places')
def api_places():
    data_path = os.path.join('data', 'places.json')
    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return jsonify(data)

@app.route('/')
def mainpage():
    return render_template('mainpage.html', profile_pic_url=get_profile_pic_url())

@app.route('/signup')
def signup_page():
    return render_template('signup.html')

@app.route('/userpage')
def user_page():
    return render_template(
        'userpage.html',
        profile_pic_url=get_profile_pic_url()
    )

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
    for place in PLACES:
        if slugify(place["name"]) == slug:
            status, minutes, today_hours = get_today_status(place)
            return render_template(
                'place_detail.html',
                place=place,
                today_status=status,
                today_minutes=minutes,
                today_hours=today_hours,
                profile_pic_url=get_profile_pic_url()
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
            title=page.capitalize(),
            profile_pic_url=get_profile_pic_url()
        )
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

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 10000))  # Default for local, Render sets $PORT
    app.run(host='0.0.0.0', port=port)
