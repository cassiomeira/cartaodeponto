const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();

const db = admin.firestore();
const APP_ID = "cartao-de-ponto-5e801"; // ID fixo do app

// --- ENVIO MANUAL (v2) ---
exports.sendManualNotification = onCall({ cors: true }, async (request) => {
    const { userIds, title, body } = request.data;

    if (!userIds || !title || !body) {
        throw new HttpsError('invalid-argument', 'Faltam dados (userIds, title, body).');
    }

    const tokens = [];

    // Busca tokens dos usuários selecionados
    for (const uid of userIds) {
        const userDoc = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                tokens.push(...userData.fcmTokens);
            }
        }
    }

    if (tokens.length === 0) return { success: true, message: "Nenhum token encontrado para os usuários selecionados." };

    const uniqueTokens = [...new Set(tokens)];

    const message = {
        notification: { title, body },
        tokens: uniqueTokens
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        return { success: true, response };
    } catch (error) {
        console.error("Erro ao enviar notificação manual (DETALHES):", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        throw new HttpsError('internal', `Erro ao enviar notificação: ${error.message}`);
    }
});

// --- LÓGICA COMPARTILHADA DE VERIFICAÇÃO ---
async function runScheduleCheck() {
    const now = new Date();
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHour = localNow.getHours();
    const currentMinute = localNow.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    const dayOfWeek = localNow.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const year = localNow.getFullYear();
    const month = String(localNow.getMonth() + 1).padStart(2, '0');
    const day = String(localNow.getDate()).padStart(2, '0');
    const todayDateStr = `${year}-${month}-${day}`;

    console.log(`Verificando escalas para: ${todayDateStr} (${dayOfWeek}) às ${currentHour}:${currentMinute}`);

    // 1. Buscar Técnicos
    const usersSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('users')
        .where('role', '==', 'tech')
        .get();

    const users = [];
    usersSnapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));

    // 2. Buscar Admins (para alertas)
    const adminsSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('users')
        .where('role', '==', 'admin')
        .get();

    const adminTokens = [];
    adminsSnapshot.forEach(doc => {
        const d = doc.data();
        if (d.fcmTokens && Array.isArray(d.fcmTokens)) adminTokens.push(...d.fcmTokens);
    });
    const uniqueAdminTokens = [...new Set(adminTokens)];

    // 3. Buscar Configurações
    let delayWindow = 60; // Default
    let overtimeWindow = 120; // Default
    try {
        const settingsDoc = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('settings').doc('notifications').get();
        if (settingsDoc.exists) {
            const sData = settingsDoc.data();
            if (sData.delayWindow) delayWindow = Number(sData.delayWindow);
            if (sData.overtimeWindow) overtimeWindow = Number(sData.overtimeWindow);
        }
    } catch (e) {
        console.log("Erro ao buscar settings, usando defaults:", e);
    }

    console.log(`Usando janelas: Atraso=${delayWindow}min, HoraExtra=${overtimeWindow}min`);

    let notificationsSent = 0;

    for (const user of users) {
        if (!user.workSchedule || !user.workSchedule[dayOfWeek] || !user.workSchedule[dayOfWeek].active) {
            continue;
        }

        const schedule = user.workSchedule[dayOfWeek];
        const [startH, startM] = schedule.start.split(':').map(Number);
        const [endH, endM] = schedule.end.split(':').map(Number);

        const startTotalMinutes = startH * 60 + startM;
        const endTotalMinutes = endH * 60 + endM;

        // --- 0. VERIFICAÇÃO DE STATUS ESPECIAIS (Atestado, Férias, Folga) ---
        // Se o técnico está dispensado hoje, não deve receber notificações de atraso nem de hora extra.
        const specialSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('punches')
            .where('userEmail', '==', user.email)
            .where('type', 'in', ['atestado', 'ferias', 'folga'])
            .get();

        let hasSpecialStatus = false;
        specialSnapshot.forEach(doc => {
            const pData = doc.data();
            const pDate = pData.timestamp.toDate();
            if (pDate.getDate() === localNow.getDate() && pDate.getMonth() === localNow.getMonth()) {
                hasSpecialStatus = true;
            }
        });

        if (hasSpecialStatus) {
            console.log(`Usuário ${user.name} possui status especial hoje (Atestado/Férias/Folga). Pulando verificações.`);
            continue;
        }

        // --- VERIFICAÇÃO DE ATRASO (Entrada) ---
        if (currentTotalMinutes > (startTotalMinutes + 10) && currentTotalMinutes < (startTotalMinutes + delayWindow)) {
            const punchesSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('punches')
                .where('userEmail', '==', user.email)
                .where('type', '==', 'entrada')
                .get();

            let hasEntry = false;
            punchesSnapshot.forEach(doc => {
                const pData = doc.data();
                const pDate = pData.timestamp.toDate();
                if (pDate.getDate() === localNow.getDate() && pDate.getMonth() === localNow.getMonth()) {
                    hasEntry = true;
                }
            });

            if (!hasEntry) {
                console.log(`Usuário ${user.name} atrasado! Enviando alerta.`);

                // Notificar Técnico
                if (user.fcmTokens && user.fcmTokens.length > 0) {
                    await admin.messaging().sendEachForMulticast({
                        notification: {
                            title: "Atraso Registrado ⏰",
                            body: "Você ainda não registrou sua entrada hoje. Por favor, registre o ponto imediatamente."
                        },
                        tokens: user.fcmTokens
                    });
                    notificationsSent++;
                }

                // Notificar Admins
                if (uniqueAdminTokens.length > 0) {
                    await admin.messaging().sendEachForMulticast({
                        notification: {
                            title: "Alerta de Atraso ⚠️",
                            body: `O técnico ${user.name} está atrasado e ainda não registrou entrada.`
                        },
                        tokens: uniqueAdminTokens
                    });
                }
            }
        }

        // --- VERIFICAÇÃO DE SAÍDA (Hora Extra) ---
        if (currentTotalMinutes >= endTotalMinutes && currentTotalMinutes < (endTotalMinutes + overtimeWindow)) {

            // 0. Verifica se o usuário de fato entrou hoje
            // (Só cobra hora extra se iniciou a jornada)
            const entrySnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('punches')
                .where('userEmail', '==', user.email)
                .where('type', '==', 'entrada')
                .get();

            let hasEntry = false;
            entrySnapshot.forEach(doc => {
                const pData = doc.data();
                const pDate = pData.timestamp.toDate();
                if (pDate.getDate() === localNow.getDate() && pDate.getMonth() === localNow.getMonth()) {
                    hasEntry = true;
                }
            });

            if (!hasEntry) {
                // Se não entrou, não cobra saída/hora extra (provavelmente faltou ou esqueceu entrada - nesse caso o alerta de atraso já foi).
                continue;
            }

            // 1. Verifica se já saiu
            const exitSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('punches')
                .where('userEmail', '==', user.email)
                .where('type', '==', 'saida')
                .get();

            let hasExit = false;
            exitSnapshot.forEach(doc => {
                const pData = doc.data();
                const pDate = pData.timestamp.toDate();
                if (pDate.getDate() === localNow.getDate() && pDate.getMonth() === localNow.getMonth()) {
                    hasExit = true;
                }
            });

            if (!hasExit) {
                // 2. Verifica se já justificou a hora extra hoje
                const justifSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('punches')
                    .where('userEmail', '==', user.email)
                    .where('type', '==', 'justificativa_hora_extra')
                    .get();

                let hasJustification = false;
                justifSnapshot.forEach(doc => {
                    const pData = doc.data();
                    const pDate = pData.timestamp.toDate();
                    if (pDate.getDate() === localNow.getDate() && pDate.getMonth() === localNow.getMonth()) {
                        hasJustification = true;
                    }
                });

                if (hasJustification) {
                    console.log(`Usuário ${user.name} em hora extra, mas já justificado.`);
                    continue; // Pula notificações
                }

                console.log(`Usuário ${user.name} passou do horário. Enviando alerta de Hora Extra.`);

                // Notificar Técnico
                if (user.fcmTokens && user.fcmTokens.length > 0) {
                    await admin.messaging().sendEachForMulticast({
                        notification: {
                            title: "Fim de Expediente 🛑",
                            body: "Seu horário acabou. Se continuar trabalhando, confirme a Hora Extra."
                        },
                        data: {
                            action: "overtime_confirm"
                        },
                        tokens: user.fcmTokens
                    });
                    notificationsSent++;
                }

                // Notificar Admins
                if (uniqueAdminTokens.length > 0) {
                    await admin.messaging().sendEachForMulticast({
                        notification: {
                            title: "Alerta de Hora Extra ⏳",
                            body: `O técnico ${user.name} excedeu o horário de saída e ainda não encerrou.`
                        },
                        tokens: uniqueAdminTokens
                    });
                }
            }
        }
    }
    return { success: true, notificationsSent };
}

// --- VERIFICAÇÃO AGENDADA (v2) ---
exports.checkSchedules = onSchedule({
    schedule: "every 10 minutes",
    timeZone: "America/Sao_Paulo",
}, async (event) => {
    await runScheduleCheck();
});

// --- FORÇAR VERIFICAÇÃO (Manual) ---
exports.forceCheckSchedules = onCall({ cors: true }, async (request) => {
    return await runScheduleCheck();
});
