const express = require('express');
const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const { google } = require('googleapis');
dotenv.config();

const app = express();
app.use(express.json());

// Configuración
const QWEN_API_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const HISTORY_FILE = 'conversation_history.json';
const SESSION_FILE = 'session.json';
const CLIENTS_FILE = 'clients.json';
const CREDENTIALS_FILE = 'credentials.json';
const CALENDAR_ID = process.env.CALENDAR_ID; // ← Ahora viene de .env
const PORT = process.env.PORT || 10000;

// Cache en memoria
let lastQR = null;
let sessionData = null;
let conversationHistoryCache = {};
let clientsCache = { clients: [] };
let cachedCalendar = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

const context = `
    Hola, soy un asistente digital de ventas. ¡Estoy aquí para ayudarte!
    Si no te conozco, primero dime tu nombre y, si quieres, tu correo electrónico para registrarte.
   
    Eres un asistente de ventas. Tu trabajo es asistir a los clientes, evaluar si requieren atención  (cuando lo soliciten) y agendar citas.
    Para agendar citas, detecta cuando el cliente quiere una cita. Pide nombre (si no lo sé), fecha (DD/MM/YYYY) y hora (24h, ej. 14:00).
    Guarda las citas en Google Calendar y confirma con: "Tu cita está agendada para [fecha] a las [hora] a nombre de [nombre]. ¡Te esperamos!".
    Registra el número de teléfono del cliente y, si lo da, su correo en clients.json. Si ya lo conozco, usa su nombre en las respuestas.
    Sé amable, profesional y di que tus consejos son recomendaciones; si el cliente requiere de algun producto de inmediato puedes enviarle mensaje a un ejecutivo de ventas.
`;

async function loadHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, 'utf8');
        conversationHistoryCache = JSON.parse(data);
        return conversationHistoryCache;
    } catch (error) {
        return {};
    }
}

async function saveHistory(history) {
    try {
        conversationHistoryCache = history;
        await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Error al guardar el historial:', error.message);
    }
}

async function loadClients() {
    try {
        const data = await fs.readFile(CLIENTS_FILE, 'utf8');
        clientsCache = JSON.parse(data);
        return clientsCache;
    } catch (error) {
        return { clients: [] };
    }
}

async function saveClient(client) {
    try {
        const existingClientIndex = clientsCache.clients.findIndex(c => c.phone === client.phone);
        if (existingClientIndex !== -1) {
            clientsCache.clients[existingClientIndex] = { ...clientsCache.clients[existingClientIndex], ...client };
        } else {
            clientsCache.clients.push(client);
        }
        await fs.writeFile(CLIENTS_FILE, JSON.stringify(clientsCache, null, 2));
    } catch (error) {
        console.error('Error al guardar cliente:', error.message);
    }
}

async function loadSession() {
    try {
        const data = await fs.readFile(SESSION_FILE, 'utf8');
        sessionData = JSON.parse(data);
        return sessionData;
    } catch (error) {
        return null;
    }
}

async function saveSession(session) {
    try {
        if (!session) return;
        sessionData = session;
        await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2));
    } catch (error) {
        console.error('Error al guardar sesión:', error.message);
    }
}

function keepAlive() {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    setInterval(async () => {
        try {
            await axios.get(`${baseUrl}/ping`);
        } catch (error) {
            console.error('Error en el ping:', error.message);
        }
    }, 60 * 1000);
}

app.get('/', (req, res) => {
    res.send('Vet-Sales Assistant está activo. Usa <a href="/qr">/qr</a> para obtener el código QR de WhatsApp.');
});

app.get('/ping', (req, res) => {
    res.send('Pong');
});

app.get('/qr', (req, res) => {
    if (lastQR && lastQR !== 'undefined') {
        res.json({ qr: lastQR, message: 'Escanea este QR con WhatsApp' });
    } else {
        res.status(404).json({ error: 'No QR disponible. Revisa los logs.' });
    }
});

async function authenticateGoogle() {
    try {
        if (cachedCalendar) return cachedCalendar;

        const auth = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_FILE,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        cachedCalendar = google.calendar({ version: 'v3', auth });
        return cachedCalendar;
    } catch (error) {
        console.error('Error al autenticar con Google:', error.message);
        throw error;
    }
}

async function saveToGoogleCalendar(appointment) {
    try {
        const calendar = await authenticateGoogle();
        const event = {
            summary: `Cita veterinaria - ${appointment.name}`,
            description: `Cita agendada vía WhatsApp`,
            start: {
                dateTime: `${appointment.date.split('/').reverse().join('-')}T${appointment.time}:00-04:00`,
                timeZone: 'America/Santo_Domingo',
            },
            end: {
                dateTime: `${appointment.date.split('/').reverse().join('-')}T${appointment.time.split(':')[0]}:${Number(appointment.time.split(':')[1]) + 30}:00-04:00`,
                timeZone: 'America/Santo_Domingo',
            },
        };

        await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
        });
    } catch (error) {
        console.error('Error al crear evento en Google Calendar:', error.message);
    }
}

async function qwenRequest(messages, from) {
    try {
        const response = await axios.post(QWEN_API_URL, {
            model: 'qwen-turbo',
            messages
        }, {
            headers: {
                'Authorization': `Bearer ${QWEN_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        return response;
    } catch (error) {
        console.error('Error en qwenRequest:', error.message);
        throw error;
    }
}

async function initializeClient() {
    try {
        const client = new Client({
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            },
            session: sessionData || (await loadSession())
        });

        client.on('qr', (qr) => {
            if (!qr || qr === 'undefined') return;
            lastQR = qr;
            console.log('QR generado. Escanea con WhatsApp.');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', async () => {
            console.log('Cliente listo y conectado.');
            await saveSession({
                wid: client.info.wid,
                me: client.info.me,
                platform: client.info.platform,
                phone: client.info.phone
            });
            initAttempts = 0;
        });

        client.on('authenticated', async (session) => {
            await saveSession(session);
        });

        client.on('disconnected', (reason) => {
            console.log('Cliente desconectado:', reason);
            lastQR = null;
            sessionData = null;
            if (initAttempts < MAX_INIT_ATTEMPTS) {
                initAttempts++;
                setTimeout(() => initializeClient(), 15000);
            } else {
                process.exit(1);
            }
        });

        client.on('message', async (message) => {
            const from = message.from;
            let conversationHistory = conversationHistoryCache[from] ? { [from]: conversationHistoryCache[from] } : await loadHistory();
            const clientsData = clientsCache.clients.length ? clientsCache : await loadClients();
            const clientInfo = clientsData.clients.find(c => c.phone === from) || { phone: from };

            if (!conversationHistory[from]) {
                conversationHistory[from] = [{ role: 'system', content: context }];
            }

            let userMessage = message.body || '';

            conversationHistory[from].push({ role: 'user', content: userMessage });

            if (conversationHistory[from].length > 10) {
                conversationHistory[from] = conversationHistory[from].slice(-10);
            }

            try {
                const response = await qwenRequest(conversationHistory[from], from);
                const botResponse = response.data.choices[0].message.content;

                conversationHistory[from].push({ role: 'assistant', content: botResponse });

                // Extraer nombre si aparece
                const nameMatch = botResponse.match(/Hola, (.+?),/) || userMessage.match(/mi nombre es (.+?)(\s|$)/i);
                if (nameMatch) clientInfo.name = nameMatch[1];

                // Extraer correo si aparece
                const emailMatch = userMessage.match(/mi correo es (.+@.+\..+)/i);
                if (emailMatch) clientInfo.email = emailMatch[1];

                clientInfo.lastContact = new Date().toISOString();
                await saveClient(clientInfo);

                // Guardar cita en Google Calendar si se detecta
                if (botResponse.includes('Tu cita está agendada para')) {
                    const match = botResponse.match(/Tu cita está agendada para (\d{2}\/\d{2}\/\d{4}) a las (\d{2}:\d{2}) a nombre de (.+?)\./);
                    if (match) {
                        const [_, date, time, name] = match;
                        await saveToGoogleCalendar({ number: from, date, time, name });
                    }
                }

                await saveHistory(conversationHistory);
                await client.sendMessage(from, botResponse);
            } catch (error) {
                console.error('Error al procesar el mensaje:', error.message);
                await client.sendMessage(from, '¡Ups! Algo salió mal, intenta de nuevo.');
            }
        });

        await client.initialize();
    } catch (error) {
        console.error('Error al inicializar el cliente:', error.message);
        if (initAttempts < MAX_INIT_ATTEMPTS) {
            initAttempts++;
            setTimeout(initializeClient, 15000);
        } else {
            process.exit(1);
        }
    }
}

(async () => {
    await initializeClient();
})();

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    keepAlive();
});
