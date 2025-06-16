import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()
MAIL_USER = os.getenv("MAIL_USER")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")

print("Loaded credentials:", MAIL_USER, MAIL_PASSWORD)

msg = MIMEText("Test email from SMTP setup.")
msg["Subject"] = "SMTP Test"
msg["From"] = MAIL_USER
msg["To"] = MAIL_USER

try:
    print("Connecting to smtp.gmail.com:587 ...")
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        print("Logging in...")
        server.login(MAIL_USER, MAIL_PASSWORD)
        print("Sending email...")
        server.sendmail(MAIL_USER, MAIL_USER, msg.as_string())
    print("Email sent successfully!")
except Exception as e:
    print("Failed to send email:", e)
