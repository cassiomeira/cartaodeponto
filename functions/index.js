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

    const todayStart = new Date(localNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(localNow);
    todayEnd.setHours(23, 59, 59, 999);

    for (const user of users) {
        if (!user.workSchedule || !user.workSchedule[dayOfWeek] || !user.workSchedule[dayOfWeek].active) {
            continue;
        }

        const schedule = user.workSchedule[dayOfWeek];
        const [startH, startM] = schedule.start.split(':').map(Number);
        const [endH, endM] = schedule.end.split(':').map(Number);

        const startTotalMinutes = startH * 60 + startM;
        const endTotalMinutes = endH * 60 + endM;

        // Uma única query por técnico: todos os punches de hoje
        const todayPunchesSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('punches')
            .where('userEmail', '==', user.email)
            .where('timestamp', '>=', todayStart)
            .where('timestamp', '<=', todayEnd)
            .get();

        const todayTypes = new Set();
        todayPunchesSnapshot.forEach(doc => {
            todayTypes.add(doc.data().type);
        });

        // --- 0. VERIFICAÇÃO DE STATUS ESPECIAIS (Atestado, Férias, Folga) ---
        const hasSpecialStatus = todayTypes.has('atestado') || todayTypes.has('ferias') || todayTypes.has('folga');

        if (hasSpecialStatus) {
            console.log(`Usuário ${user.name} possui status especial hoje (Atestado/Férias/Folga). Pulando verificações.`);
            continue;
        }

        const hasEntry = todayTypes.has('entrada');
        const hasExit = todayTypes.has('saida');
        const hasJustification = todayTypes.has('justificativa_hora_extra');

        // --- VERIFICAÇÃO DE ATRASO (Entrada) ---
        if (currentTotalMinutes > (startTotalMinutes + 10) && currentTotalMinutes < (startTotalMinutes + delayWindow)) {
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
            if (!hasEntry) {
                continue;
            }

            if (!hasExit) {
                if (hasJustification) {
                    console.log(`Usuário ${user.name} em hora extra, mas já justificado.`);
                    continue;
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

// --- VERIFICAÇÃO AUTOMÁTICA DE ALMOÇO (v1) ---
async function runAutoLunchCheck() {
    console.log("Iniciando verificação automática de almoço...");
    const now = new Date();
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHour = localNow.getHours();
    const currentMinute = localNow.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    // Data String (YYYY-MM-DD)
    const year = localNow.getFullYear();
    const month = String(localNow.getMonth() + 1).padStart(2, '0');
    const day = String(localNow.getDate()).padStart(2, '0');
    // Obs: O banco usa timestamp, mas precisamos comparar o dia.

    let processedCount = 0;

    // 1. Buscar Configurações Globais
    let globalAutoLunch = { enabled: false, limitTime: '15:30', minutes: 60 };
    try {
        const settingsDoc = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('settings').doc('notifications').get();
        if (settingsDoc.exists) {
            const sData = settingsDoc.data();
            if (sData.autoLunch) {
                globalAutoLunch = {
                    enabled: sData.autoLunch.enabled ?? false,
                    limitTime: sData.autoLunch.limitTime ?? '15:30',
                    minutes: sData.autoLunch.minutes ?? 60
                };
            }
        }
    } catch (e) {
        console.error("Erro ao buscar settings de almoço:", e);
    }

    // 2. Buscar Técnicos
    const usersSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('users')
        .where('role', '==', 'tech')
        .get();

    for (const docUser of usersSnapshot.docs) {
        const user = { id: docUser.id, ...docUser.data() };

        // Determinar configurações efetivas (Override vs Global)
        let settings = { ...globalAutoLunch };
        if (user.autoLunch && user.autoLunch.override) {
            settings = {
                enabled: user.autoLunch.enabled,
                limitTime: user.autoLunch.limitTime,
                minutes: user.autoLunch.deductionMinutes
            };
        }

        if (!settings.enabled) continue;

        // Parse Limite
        const [limH, limM] = settings.limitTime.split(':').map(Number);
        const limitTotalMinutes = limH * 60 + limM;

        if (currentTotalMinutes > limitTotalMinutes) {
            // Verificar Punches de Hoje (filtrado por data no Firestore)
            const dayStart = new Date(localNow);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(localNow);
            dayEnd.setHours(23, 59, 59, 999);

            const punchesSnapshot = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('punches')
                .where('userEmail', '==', user.email)
                .where('timestamp', '>=', dayStart)
                .where('timestamp', '<=', dayEnd)
                .get();

            const todayPunches = [];
            let hasEntry = false;
            let hasExit = false;
            let hasLunch = false;

            punchesSnapshot.forEach(pDoc => {
                const pData = pDoc.data();
                todayPunches.push({ id: pDoc.id, ...pData });
                if (pData.type === 'entrada') hasEntry = true;
                if (pData.type === 'saida') hasExit = true;
                if (pData.type === 'saida_almoco' || pData.type === 'lunch_offline' || pData.type === 'auto_lunch') hasLunch = true;
            });

            // Lógica:
            // - Tem Entrada
            // - NÃO tem Saída (se já saiu, assumimos que o dia acabou e não mexemos, ou se quiser deduzir pós-saida, seria outra lógica. O user pediu pra mudar o botão de ação, então implica que o user inda está trabalhando)
            // - NÃO tem Almoço
            if (hasEntry && !hasExit && !hasLunch) {
                console.log(`Aplicando Almoço Automático para ${user.name} (${settings.minutes} min).`);

                // Inserir Punch
                await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('punches').add({
                    userEmail: user.email,
                    userName: user.name,
                    userId: user.id,
                    type: 'auto_lunch',
                    durationMinutes: settings.minutes, // Campo customizado usado no frontend
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    device: 'Sistema Automático',
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                });

                // Opcional: Notificar User
                if (user.fcmTokens && user.fcmTokens.length > 0) {
                    await admin.messaging().sendEachForMulticast({
                        notification: {
                            title: "Almoço Automático 🥪",
                            body: `O sistema registrou um intervalo de ${settings.minutes}min pois você excedeu o horário limite.`
                        },
                        tokens: user.fcmTokens
                    });
                }

                processedCount++;
            }
        }
    }

    return { success: true, processed: processedCount };
}

// --- AGENDAMENTO ALMOÇO (a cada 15 min) ---
exports.checkAutoLunch = onSchedule({
    schedule: "every 15 minutes",
    timeZone: "America/Sao_Paulo",
}, async (event) => {
    await runAutoLunchCheck();
});

// --- FORÇAR ALMOÇO (Manual) ---
exports.forceCheckAutoLunch = onCall({ cors: true }, async (request) => {
    return await runAutoLunchCheck();
});
