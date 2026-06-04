# Vet-AI Sales Assistant
AI-powered WhatsApp assistant specialized in veterinary services. It handles customer inquiries, qualifies leads, schedules appointments, and integrates with Google Calendar.

Built with `whatsapp-web.js`, Qwen LLM, and Google Calendar API. Designed as a practical solution that combines conversational AI with real business workflows (client management + appointment booking).

## ✨ Features

- **WhatsApp Integration** — Uses `whatsapp-web.js` with QR authentication and persistent sessions.
- **Conversational AI** — Powered by Qwen LLM for natural and context-aware responses.
- **Appointment Scheduling** — Automatically detects appointment requests and saves them to Google Calendar.
- **Client Management** — Stores client information (name, phone, email, last contact) in JSON.
- **Conversation History** — Maintains context per user across multiple messages.
- **QR Code Access** — Exposes an endpoint (`/qr`) to retrieve the WhatsApp QR code when needed.
- **Keep-Alive System** — Prevents the bot from sleeping on free hosting platforms (Render).

## 🛠️ Tech Stack

- **Backend:** Node.js + Express
- **WhatsApp:** whatsapp-web.js + qrcode-terminal
- **AI/LLM:** Qwen (DashScope)
- **Calendar:** Google Calendar API
- **Data Storage:** JSON files (`clients.json`, `conversation_history.json`, `session.json`)
- **Deployment:** Render.com

## 🚀 Quick Start (Local)

```bash
git clone https://github.com/v3rtigo75/vet-sales-assistant.git
cd vet-sales-assistant
npm install
cp .env.example .env
# Add your API keys in .env
npm start
```
Scan the QR code that appears in the terminal with WhatsApp.
🌐 Deployment on Render.com
This project is designed to run on Render.com. Because it uses whatsapp-web.js, it requires special attention to session persistence.
Important Notes for Deployment:

The bot uses a persistent session saved in session.json.
On free Render plans, the service can go to sleep. A keep-alive mechanism is included (/ping endpoint).
To get the QR code after deployment, access the /qr endpoint.
It is recommended to use a paid instance or a more stable hosting if you need high availability.


## 📄 Environment Variables

| Variable                | Description                          |
|-------------------------|--------------------------------------|
| `QWEN_API_KEY`          | DashScope API Key                    |
| `SENDGRID_API_KEY`      | SendGrid API Key                     |

## 📊 Project Highlights

📊 Project Highlights

Built a fully functional WhatsApp AI assistant tailored for veterinary services.
Integrated LLM (Qwen) with persistent conversation memory per user.
Connected WhatsApp automation with Google Calendar for real appointment booking.
Implemented client data persistence and session management.
Designed with production considerations (keep-alive, error handling, and reconnection logic).

## 👤 Author

**Rafael Horcasitas**  
Creative Technologist | AI & Immersive Experiences  
[LinkedIn](https://www.linkedin.com/in/rafael-homa) | [Portfolio](https://www.inv3rse.net/portfolio)
