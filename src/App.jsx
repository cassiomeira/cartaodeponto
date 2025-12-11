import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  writeBatch,

  getDoc,
  arrayUnion
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  MapPin,
  Clock,
  Users,
  LayoutDashboard,
  LogOut,
  Coffee,
  AlertTriangle,
  CheckCircle,
  Map,
  UserCircle,
  Smartphone,
  Mail,
  ArrowRight,
  UserPlus,
  Lock,
  Download,
  FileSpreadsheet,
  MapPinOff,
  X,
  Globe,
  FileText,
  Calendar,
  Settings,
  Save,
  Trash2,
  BellRing,
  Loader2,
  Search
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { PushNotifications } from '@capacitor/push-notifications';

// Fix Leaflet marker icon issue
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// --- CONFIGURAÇÃO FIREBASE (CHAVES REAIS) ---
const firebaseConfig = {
  apiKey: "AIzaSyBM3h7T1Z_rSJfZRBhD71JHYJW7LweOHqc",
  authDomain: "cartao-de-ponto-5e801.firebaseapp.com",
  projectId: "cartao-de-ponto-5e801",
  storageBucket: "cartao-de-ponto-5e801.firebasestorage.app",
  messagingSenderId: "500861704454",
  appId: "1:500861704454:web:ac2fa633223078ff15e687",
  measurementId: "G-KTDZ3SR7FL"
};

// Inicializa o Firebase com suas chaves
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
let messaging;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.log("Messaging not supported (probably running in a non-browser env or during build)", e);
}

// ID fixo para o aplicativo (usado nas coleções do banco)
const appId = "cartao-de-ponto-5e801";

// --- UTILITÁRIOS ---
const formatTime = (date) => {
  if (!date) return '--:--';
  return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (date) => {
  if (!date) return '';
  // Se for string YYYY-MM-DD, formata manualmente para evitar timezone UTC
  if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  }
  return new Date(date).toLocaleDateString('pt-BR');
};

const formatDuration = (ms) => {
  if (!ms) return '0h 0m';
  const isNegative = ms < 0;
  const absMs = Math.abs(ms);
  const hours = Math.floor(absMs / 3600000);
  const minutes = Math.floor((absMs % 3600000) / 60000);
  return `${isNegative ? '-' : ''}${hours}h ${minutes}m`;
};

const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distância em metros
};

const LocationMarker = ({ position, setPosition, radius }) => {
  const map = useMapEvents({
    click(e) {
      setPosition({ ...position, lat: e.latlng.lat, lng: e.latlng.lng });
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return position ? (
    <>
      <Marker position={[position.lat, position.lng]} />
      <Circle center={[position.lat, position.lng]} radius={radius || 200} pathOptions={{ color: 'green', fillColor: 'green' }} />
    </>
  ) : null;
};

const getDateFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate(); // Firestore Timestamp
  if (timestamp instanceof Date) return timestamp; // JS Date
  if (typeof timestamp === 'string') return new Date(timestamp); // ISO String
  return null;
};

// --- COMPONENTES ---

// 1. Tela de Login / Cadastro com SENHA
const LoginScreen = ({ onLogin }) => {
  const [step, setStep] = useState('check_email'); // check_email, login_password, register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [foundUser, setFoundUser] = useState(null);

  const ADMIN_EMAIL = 'cassiomeiraelis@gmail.com'; // Super admin protegido

  const checkEmail = async (e) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Por favor, digite um e-mail válido.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const q = query(usersRef, where('email', '==', email.toLowerCase().trim()));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docData = querySnapshot.docs[0];
        setFoundUser({ id: docData.id, ...docData.data() });
        setStep('login_password');
      } else {
        setStep('register');
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao verificar e-mail. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginPassword = (e) => {
    e.preventDefault();
    if (!password) {
      setError('Digite sua senha.');
      return;
    }

    if (foundUser && foundUser.password === password) {
      onLogin(foundUser);
    } else {
      setError('Senha incorreta.');
    }
  };

  const handleConfirmOvertime = async (justification) => {
    if (!currentUserData || !currentUserData.id) return;

    try {
      setLoading(true);
      // 1. Registra a justificativa na coleção de 'overtime_logs' (nova coleção para auditoria)
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'overtime_logs'), {
        userId: currentUserData.id,
        userName: currentUserData.name,
        timestamp: serverTimestamp(),
        justification: justification,
        date: new Date().toISOString().split('T')[0]
      });

      // 2. Opcional: Atualizar o status do usuário ou adicionar flag no registro de ponto do dia
      // Por enquanto, apenas logamos.

      alert('Hora extra confirmada e justificada com sucesso!');
      setShowOvertimeModal(false);
    } catch (error) {
      console.error("Erro ao confirmar hora extra:", error);
      alert("Erro ao salvar justificativa. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !password.trim()) {
      setError('Preencha todos os campos.');
      return;
    }

    setLoading(true);
    try {
      const isAdmin = email.toLowerCase().trim() === ADMIN_EMAIL;
      const role = isAdmin ? 'admin' : 'tech';

      // VERIFICAÇÃO DUPLA: Garante que não cria duplicado
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const q = query(usersRef, where('email', '==', email.toLowerCase().trim()));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setError('Este e-mail já está cadastrado! Volte e faça login.');
        setLoading(false);
        return;
      }

      const newUser = {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        phone: phone.trim(),
        password: password.trim(),
        role: role,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), newUser);
      onLogin({ id: docRef.id, ...newUser });
    } catch (err) {
      console.error(err);
      setError('Erro ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

        <div className="text-center mb-8 mt-2">
          <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/30">
            <Clock className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ISP Ponto Digital</h1>
          <p className="text-slate-500">Acesso Seguro</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 border border-red-100 animate-pulse">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {step === 'check_email' && (
          <form onSubmit={checkEmail} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">E-mail Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-slate-400" size={20} />
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="seu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {loading ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <>Continuar <ArrowRight size={20} /></>}
            </button>
          </form>
        )}

        {step === 'login_password' && (
          <form onSubmit={handleLoginPassword} className="space-y-6 animate-in fade-in slide-in-from-right-8">
            <div className="text-center mb-2">
              <p className="text-sm text-slate-500">Bem-vindo de volta,</p>
              <p className="font-bold text-slate-800 text-lg">{foundUser?.name}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Sua Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-slate-400" size={20} />
                <input
                  type="password"
                  required
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-all shadow-lg"
            >
              Entrar no Sistema
            </button>
            <button type="button" onClick={() => { setStep('check_email'); setPassword(''); }} className="w-full text-sm text-slate-500 hover:text-slate-800">
              Trocar de conta
            </button>
          </form>
        )}

        {step === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in slide-in-from-right-8">
            <div className="text-center mb-2">
              <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full mb-2">
                Primeiro Acesso
              </span>
              <p className="text-sm text-slate-600">
                Defina sua senha para acessar como
                <strong className="text-slate-800"> {email === ADMIN_EMAIL ? 'Gestor' : 'Técnico'}</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">E-mail</label>
              <input type="text" value={email} disabled className="w-full px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-sm" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nome Completo</label>
              <input
                type="text" required
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ex: João Silva"
                value={name} onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Telefone</label>
              <input
                type="tel" required
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="(00) 00000-0000"
                value={phone} onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Crie uma Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input
                  type="password" required
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Mínimo 6 caracteres"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all shadow-lg mt-4"
            >
              {loading ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : 'Finalizar Cadastro'}
            </button>
            <button type="button" onClick={() => setStep('check_email')} className="w-full text-center text-xs text-slate-500 mt-2">Voltar</button>
          </form>
        )}
      </div>
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---
const OvertimeModal = ({ onClose, onConfirm, onClockOut }) => {
  const [justification, setJustification] = useState('');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[3000] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-amber-500 p-6 text-white text-center">
          <Clock size={48} className="mx-auto mb-2 opacity-90" />
          <h2 className="text-2xl font-bold">Fim de Expediente</h2>
          <p className="opacity-90 mt-1">Seu horário de trabalho encerrou.</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center text-slate-600">
            <p>Você ainda está trabalhando? Se sim, é necessário justificar a hora extra.</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Motivo da Hora Extra</label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Finalizando instalação no cliente X..."
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none resize-none h-32"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={onClockOut}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-colors flex flex-col items-center justify-center gap-1"
            >
              <LogOut size={20} />
              <span>Encerrar Agora</span>
            </button>
            <button
              onClick={() => onConfirm(justification)}
              disabled={!justification.trim()}
              className={`font-bold py-3 px-4 rounded-xl transition-colors flex flex-col items-center justify-center gap-1 text-white ${!justification.trim() ? 'bg-amber-300 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/30'}`}
            >
              <CheckCircle size={20} />
              <span>Confirmar Hora Extra</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 2. Visão do Técnico (Mobile First)
const TechnicianView = ({ user, currentUserData, onLogout }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Carregando...');
  const [todayPunches, setTodayPunches] = useState([]);
  const [lastPunch, setLastPunch] = useState(null);

  // Estados para justificativa de hora extra
  const [showJustificationModal, setShowJustificationModal] = useState(false);
  const [justification, setJustification] = useState('');
  const [pendingPunchData, setPendingPunchData] = useState(null);

  // Estados para Almoço Offline
  const [showOfflineLunchModal, setShowOfflineLunchModal] = useState(false);
  const [offlineLunchJustification, setOfflineLunchJustification] = useState('');

  // Estados para Hora Extra (Notificação)
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);

  // Ref para o watcher de GPS
  const watchIdRef = useRef(null);

  // Listener para Notificações (Unificado Web/Native via CustomEvent)
  useEffect(() => {
    const handlePush = (event) => {
      const payload = event.detail;
      console.log('Notificação recebida no TechnicianView:', payload);

      // Verifica se é ação de hora extra (pode vir em data ou notification.data dependendo da origem)
      const action = payload.data?.action || payload.action;

      if (action === 'overtime_confirm') {
        setShowOvertimeModal(true);
      } else {
        // Alerta padrão apenas se não for o modal
        // (Opcional: remover se o App já mostra alert global, mas aqui é específico do técnico)
        // alert(`🔔 ${payload.title || payload.notification?.title}\n${payload.body || payload.notification?.body}`);
      }
    };

    window.addEventListener('native-push-received', handlePush);
    return () => window.removeEventListener('native-push-received', handlePush);
  }, []);

  // RASTREAMENTO EM TEMPO REAL
  useEffect(() => {
    if (!currentUserData || !user) return;

    // Só rastreia se estiver "Trabalhando" (Entrada ou Volta Almoço) E se o rastreamento estiver ATIVADO para este usuário
    // Se trackingEnabled for undefined, assumimos TRUE (padrão)
    const isTrackingEnabled = currentUserData.trackingEnabled !== false;
    const isWorking = lastPunch && (lastPunch.type === 'entrada' || lastPunch.type === 'volta_almoco');

    if (isWorking && isTrackingEnabled) {

      // LÓGICA PARA NATIVE (APP ANDROID)
      if (Capacitor.isNativePlatform()) {
        const startNativeTracking = async () => {
          try {
            // Remove watcher anterior se existir
            if (watchIdRef.current) {
              await BackgroundGeolocation.removeWatcher({ id: watchIdRef.current });
            }

            // Adiciona novo watcher
            const watcherId = await BackgroundGeolocation.addWatcher(
              {
                backgroundMessage: "Rastreando localização para o ponto.",
                backgroundTitle: "Ponto Digital",
                requestPermissions: true,
                stale: false,
                distanceFilter: 10 // Atualiza a cada 10 metros
              },
              async (location, error) => {
                if (error) {
                  if (error.code === "NOT_AUTHORIZED") {
                    if (window.confirm(
                      "Este app precisa da sua localização 'O tempo todo' para funcionar em segundo plano. Deseja abrir as configurações?"
                    )) {
                      BackgroundGeolocation.openSettings();
                    }
                  }
                  return;
                }

                // Atualiza Firestore
                const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserData.id);
                await updateDoc(userRef, {
                  currentLocation: {
                    lat: location.latitude,
                    lng: location.longitude,
                    timestamp: serverTimestamp(),
                    accuracy: location.accuracy,
                    provider: 'background-gps'
                  },
                  lastSeen: serverTimestamp()
                });
              }
            );

            watchIdRef.current = watcherId;
          } catch (err) {
            console.error("Erro ao iniciar GPS nativo:", err);
          }
        };

        startNativeTracking();

      } else {
        // LÓGICA PARA WEB (NAVEGADOR)
        if (!navigator.geolocation) return;

        watchIdRef.current = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude, accuracy } = position.coords;

            const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserData.id);
            await updateDoc(userRef, {
              currentLocation: {
                lat: latitude,
                lng: longitude,
                timestamp: serverTimestamp(),
                accuracy: accuracy
              },
              lastSeen: serverTimestamp()
            });
          },
          (error) => {
            console.error("Erro no watchPosition:", error);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 20000
          }
        );
      }

    } else {
      // Se parou de trabalhar ou desativou rastreio, limpa o watcher
      if (watchIdRef.current) {
        if (Capacitor.isNativePlatform()) {
          BackgroundGeolocation.removeWatcher({ id: watchIdRef.current }).catch(console.error);
        } else {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = null;
      }
    }

    return () => {
      if (watchIdRef.current) {
        if (Capacitor.isNativePlatform()) {
          BackgroundGeolocation.removeWatcher({ id: watchIdRef.current }).catch(console.error);
        } else {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      }
    };
  }, [currentUserData, user, lastPunch]); // Listener do USUÁRIO ATUAL

  useEffect(() => {
    if (!currentUserData) return;

    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'punches'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPunches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const today = new Date().toDateString();
      const myPunchesToday = allPunches.filter(p => {
        const pDate = getDateFromTimestamp(p.timestamp);
        return (p.userEmail === currentUserData.email) && pDate && pDate.toDateString() === today;
      }).map(p => {
        // Verifica Geofencing
        let isOutOfRange = false;
        let distance = 0;
        if (p.location && currentUserData.allowedLocation) {
          // Assuming calculateDistance is defined elsewhere in the file or imported
          distance = calculateDistance(
            p.location.lat,
            p.location.lng,
            currentUserData.allowedLocation.lat,
            currentUserData.allowedLocation.lng
          );
          if (distance > (currentUserData.allowedLocation.radius || 200)) {
            isOutOfRange = true;
          }
        }
        return { ...p, isOutOfRange, distanceFromAllowed: distance };
      });

      setTodayPunches(myPunchesToday);
      if (myPunchesToday.length > 0) {
        setLastPunch(myPunchesToday[myPunchesToday.length - 1]);
      } else {
        setLastPunch(null);
      }
      if (status === 'Carregando...') setStatus('');
    });
    return () => unsubscribe();
  }, [currentUserData]);

  const handlePunch = async (type) => {
    setLoading(true);
    setStatus('Obtendo localização GPS...');

    if (!navigator.geolocation) {
      alert('Seu navegador não suporta geolocalização.');
      setLoading(false);
      return;
    }

    // VERIFICAÇÃO DE HORA EXTRA (apenas para saída)
    const userSchedule = currentUserData?.workSchedule || currentUserData?.schedule;
    if (type === 'saida' && userSchedule) {
      const now = new Date();
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
      const todaySchedule = userSchedule[dayOfWeek];

      if (todaySchedule && todaySchedule.active && todaySchedule.end) {
        const [scheduleHour, scheduleMinute] = todaySchedule.end.split(':').map(Number);
        const scheduledEnd = new Date(now);
        scheduledEnd.setHours(scheduleHour, scheduleMinute, 0, 0);

        // Tolerância de 10 minutos
        const toleranceMs = 10 * 60 * 1000;
        const diffMs = now - scheduledEnd;

        if (diffMs > toleranceMs) {
          // Está em hora extra! Pedir justificativa
          setLoading(false);
          setStatus('');
          setShowJustificationModal(true);
          setPendingPunchData({ type, requiresJustification: true });
          return; // Não continua o fluxo normal
        }
      }
    }

    // Continua o fluxo normal de registro
    proceedWithPunch(type, null);
  };

  const handleOfflineLunch = () => {
    if (!offlineLunchJustification.trim()) {
      alert('Por favor, informe onde você vai trabalhar/almoçar.');
      return;
    }
    setShowOfflineLunchModal(false);
    proceedWithPunch('lunch_offline', offlineLunchJustification);
    setOfflineLunchJustification('');
  };

  // Função separada para processar o punch (com ou sem justificativa)
  const proceedWithPunch = async (type, justificationText) => {
    setLoading(true);
    setStatus('Obtendo localização GPS...');

    if (!navigator.geolocation) {
      alert('Seu navegador não suporta geolocalização.');
      setLoading(false);
      return;
    }

    const savePunch = async (lat, lng, accuracy) => {
      try {
        setStatus('Salvando registro...');

        const userAgent = navigator?.userAgent || '';
        const deviceType = /Mobi|Android/i.test(userAgent) ? 'Mobile' : 'Desktop';

        const punchData = {
          userId: user.uid,
          userEmail: currentUserData.email || user.email || 'no-email',
          userName: currentUserData.name || 'Unknown',
          type: type,
          timestamp: serverTimestamp(),
          location: { lat, lng, accuracy },
          device: deviceType,
          ...(justificationText && { justification: justificationText })
        };

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'punches'), punchData);

        // Tenta atualizar status se tiver ID, mas não bloqueia se falhar
        if (currentUserData?.id) {
          updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserData.id), {
            lastAction: type,
            lastActionTime: serverTimestamp(),
            lastLocation: { lat, lng, accuracy }
          }).catch(e => console.warn("Update status falhou (não crítico):", e));
        }

        setStatus('Ponto registrado com sucesso!');
        setTimeout(() => setStatus(''), 2000);
      } catch (error) {
        console.error("Erro ao salvar:", error);
        alert(`Erro ao salvar registro: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    // Tenta obter GPS com alta precisão
    navigator.geolocation.getCurrentPosition(
      (position) => {
        savePunch(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
      },
      (error) => {
        console.error("Erro GPS:", error);
        setStatus('');
        setLoading(false);

        let msg = "Não foi possível obter sua localização.";
        if (error.code === 1) msg = "Permissão de localização foi BLOQUEADA.\n\nPara corrigir:\n1. Clique no cadeado 🔒 na barra de endereço (topo da tela).\n2. Ative a opção 'Localização'.\n3. Recarregue a página.";
        else if (error.code === 2) msg = "Sinal de GPS indisponível. Vá para uma área aberta.";
        else if (error.code === 3) msg = "O tempo para obter o GPS esgotou. Tente novamente.";

        alert(`ERRO: Localização Obrigatória!\n\n${msg}`);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  };

  const getNextAction = () => {
    if (!lastPunch) return 'entrada';

    // Se o último registro foi almoço offline ou automático, o próximo passo é encerrar o dia
    if (lastPunch.type === 'lunch_offline' || lastPunch.type === 'auto_lunch') return 'saida';

    if (lastPunch.type === 'entrada') {
      // Se já tiver almoço offline/auto registrado hoje, o próximo passo deve ser sair.
      const hasOfflineLunch = todayPunches.some(p => p.type === 'lunch_offline' || p.type === 'auto_lunch');
      if (hasOfflineLunch) return 'saida';

      return 'saida_almoco';
    }

    if (lastPunch.type === 'saida_almoco') return 'volta_almoco';
    if (lastPunch.type === 'volta_almoco') return 'saida';
    if (lastPunch.type === 'justificativa_hora_extra') return 'saida';
    if (lastPunch.type === 'saida') return 'extra_start';
    return 'entrada';
  };

  const nextAction = getNextAction();

  const ActionButton = ({ type, label, icon: Icon, colorClass, active }) => (
    <button
      onClick={() => active && handlePunch(type)}
      disabled={!active || loading}
      className={`w-full py-6 rounded-xl flex items-center justify-center gap-3 text-lg font-bold transition-all shadow-lg
        ${active ? `${colorClass} text-white transform hover:scale-[1.02] active:scale-[0.98]` : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'}`}
    >
      {loading && active ? <span className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" /> : <Icon size={28} />}
      {label}
    </button>
  );

  // Handlers para o Modal de Notificação de Hora Extra
  const handleJustifyOvertimeOnly = async (justificationText) => {
    if (!justificationText.trim()) return;

    // Salva punch especial para justificar e parar notificações
    await proceedWithPunch('justificativa_hora_extra', justificationText);
    setShowOvertimeModal(false);
  };

  const handleClockOutFromOvertime = () => {
    setShowOvertimeModal(false);
    handlePunch('saida');
  };


  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-blue-700 text-white p-6 rounded-b-3xl shadow-lg">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">Olá, {currentUserData.name.split(' ')[0]}</h2>
            <p className="text-blue-200 text-sm">Técnico de Campo</p>
          </div>
          <button onClick={onLogout} className="bg-blue-800 p-2 rounded-lg hover:bg-blue-600 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 flex items-center justify-between border border-white/20">
          <div>
            <p className="text-xs text-blue-200 uppercase tracking-wider">Status Atual</p>
            <p className="font-bold text-lg flex items-center gap-2">
              {lastPunch ? (
                <>
                  {lastPunch.type === 'entrada' && <span className="text-green-300">Em Trabalho</span>}
                  {lastPunch.type === 'saida_almoco' && <span className="text-yellow-300">Em Almoço</span>}
                  {lastPunch.type === 'volta_almoco' && <span className="text-green-300">Em Trabalho</span>}
                  {lastPunch.type === 'saida' && <span className="text-slate-300">Jornada Encerrada</span>}
                </>
              ) : 'Não Iniciado'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-200 uppercase tracking-wider">Último Reg.</p>
            <p className="font-bold text-xl">{lastPunch ? formatTime(lastPunch.timestamp?.toDate()) : '--:--'}</p>
          </div>
        </div>
      </header>

      <div className="p-6 -mt-4 space-y-4">
        {status && <div className="text-center text-sm font-medium text-blue-600 bg-blue-50 py-2 rounded-lg animate-pulse border border-blue-100">{status}</div>}

        {nextAction === 'finalizado' ? (
          <div className="bg-green-100 text-green-800 p-6 rounded-xl text-center border border-green-200 shadow-sm">
            <CheckCircle className="mx-auto w-12 h-12 mb-2 text-green-600" />
            <h3 className="font-bold text-lg">Jornada Finalizada</h3>
            <p>Bom descanso! Até amanhã.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {/* Se for extra_start, mostra aviso de finalizado mas permite iniciar novo */}
            {nextAction === 'extra_start' && (
              <div className="bg-green-50 text-green-800 p-4 rounded-xl text-center border border-green-200 shadow-sm mb-2">
                <h3 className="font-bold">Jornada Anterior Finalizada</h3>
                <p className="text-sm">Se necessário, inicie um turno extra abaixo.</p>
              </div>
            )}

            <ActionButton
              type="entrada"
              label={nextAction === 'extra_start' ? "Rompimento Misterioso" : "Iniciar Jornada"}
              icon={MapPin}
              colorClass={nextAction === 'extra_start' ? "bg-purple-600 hover:bg-purple-700" : "bg-green-600 hover:bg-green-700"}
              active={nextAction === 'entrada' || nextAction === 'extra_start'}
            />

            {nextAction === 'saida_almoco' ? (
              <div className="space-y-4">
                <ActionButton type="saida_almoco" label="Iniciar Almoço" icon={Coffee} colorClass="bg-yellow-500 hover:bg-yellow-600" active={true} />
                <button
                  onClick={() => setShowOfflineLunchModal(true)}
                  disabled={loading}
                  className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-4 px-6 rounded-2xl shadow-lg shadow-slate-600/30 transform transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <MapPinOff size={24} />
                  <span>Almoço Offline</span>
                </button>
              </div>
            ) : nextAction === 'volta_almoco' ? (
              <ActionButton type="volta_almoco" label="Volta Almoço" icon={CheckCircle} colorClass="bg-yellow-600 hover:bg-yellow-700" active={true} />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Fallback ou estado inativo */}
                <ActionButton type="saida_almoco" label="Saída Almoço" icon={Coffee} colorClass="bg-yellow-500 hover:bg-yellow-600" active={false} />
                <ActionButton type="volta_almoco" label="Volta Almoço" icon={CheckCircle} colorClass="bg-yellow-600 hover:bg-yellow-700" active={false} />
              </div>
            )}

            {/* Estado: Almoço Offline/Auto Ativo */}
            {(todayPunches.some(p => p.type === 'lunch_offline') || todayPunches.some(p => p.type === 'auto_lunch')) && (
              <div className="bg-gray-100 border-l-4 border-gray-500 p-4 rounded-r-xl mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-200 p-2 rounded-full">
                    <MapPinOff size={24} className="text-gray-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">
                      {todayPunches.some(p => p.type === 'auto_lunch') ? 'Almoço Automático Aplicado' : 'Almoço Offline Registrado'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {todayPunches.some(p => p.type === 'auto_lunch') ? 'Dedução automática por horário limite.' : 'Duração contabilizada: 1h fixa'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <ActionButton type="saida" label="Encerrar Dia" icon={LogOut} colorClass="bg-red-600 hover:bg-red-700" active={nextAction === 'saida'} />
          </div>
        )}
      </div>

      <div className="px-6">
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Clock size={18} /> Histórico de Hoje</h3>
        <div className="space-y-4 relative before:absolute before:left-[19px] before:top-2 before:bottom-4 before:w-0.5 before:bg-slate-200">
          {todayPunches.map((punch) => (
            <div key={punch.id} className="relative flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100 z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm ${punch.type.includes('entrada') || punch.type.includes('volta') ? 'bg-green-100 text-green-600' :
                punch.type.includes('almoco') ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'
                }`}>
                {punch.type === 'entrada' && <MapPin size={18} />}
                {punch.type.includes('almoco') && <Coffee size={18} />}
                {punch.type === 'saida' && <LogOut size={18} />}
              </div>
              <div className="flex-1">
                <p className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                  {punch.type === 'entrada' ? 'Entrada' :
                    punch.type === 'saida_almoco' ? 'Saída Almoço' :
                      punch.type === 'volta_almoco' ? 'Volta Almoço' :
                        punch.type === 'saida' ? 'Saída' :
                          punch.type === 'lunch_offline' ? 'Almoço Offline' :
                            punch.type === 'auto_lunch' ? 'Almoço Automático' :
                              punch.type === 'justificativa_hora_extra' ? 'Justificativa Extra' :
                                punch.type.replace('_', ' ')}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                  {punch.location ? (
                    <>
                      <Map size={12} />
                      <span>{punch.location.lat.toFixed(4)}, {punch.location.lng.toFixed(4)}</span>
                    </>
                  ) : (
                    <>
                      <MapPinOff size={12} />
                      <span>Sem localização</span>
                    </>
                  )}
                </div>
                {punch.justification && (
                  <div className="mt-2 bg-yellow-50 p-2 rounded border border-yellow-100 text-xs text-yellow-800">
                    <strong>Justificativa:</strong> {punch.justification}
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-700">{formatTime(punch.timestamp?.toDate())}</p>
              </div>
            </div>
          ))}
          {todayPunches.length === 0 && <p className="text-slate-400 text-center py-4 bg-white rounded-xl border border-dashed border-slate-200 text-sm">Nenhum registro hoje.</p>}
        </div>
      </div>



      {/* Modal de Almoço Offline */}
      {showOfflineLunchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-600 p-6 text-white">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <MapPinOff size={24} /> Almoço Offline
              </h3>
              <p className="text-slate-200 text-sm mt-1">
                Use esta opção se não puder bater o ponto de almoço normalmente.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r">
                <p className="text-sm text-yellow-800 font-medium">
                  Atenção: O sistema contabilizará automaticamente <strong>1 hora</strong> de intervalo, independente do tempo real.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Onde você vai trabalhar/almoçar? <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={offlineLunchJustification}
                  onChange={(e) => setOfflineLunchJustification(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-slate-500 outline-none resize-none h-32"
                  placeholder="Ex: Cliente X, Local sem sinal..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowOfflineLunchModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOfflineLunch}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-slate-600/30 transition-all active:scale-95"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Justificativa de Hora Extra */}
      {showJustificationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-yellow-500 p-6 text-white">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <AlertTriangle size={24} /> Hora Extra Detectada
              </h3>
              <p className="text-yellow-100 text-sm mt-1">
                Você excedeu seu horário de saída em mais de 10 minutos.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Justificativa Obrigatória <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-yellow-500 outline-none resize-none h-32"
                  placeholder="Descreva o motivo da hora extra..."
                />
              </div>
              <button
                onClick={() => {
                  if (!justification.trim()) {
                    alert('Por favor, escreva uma justificativa.');
                    return;
                  }
                  setShowJustificationModal(false);
                  proceedWithPunch(pendingPunchData.type, justification);
                  setJustification('');
                  setPendingPunchData(null);
                }}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-yellow-500/30 transition-all active:scale-95"
              >
                Confirmar e Encerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Notificação de Hora Extra (Vindo do Push) */}
      {showOvertimeModal && (
        <OvertimeModal
          onClose={() => setShowOvertimeModal(false)}
          onConfirm={handleJustifyOvertimeOnly}
          onClockOut={handleClockOutFromOvertime}
        />
      )}

    </div>
  );
};

// 3. Dashboard do Gestor (Completo)
const ManagerDashboard = ({ currentUserData, onLogout }) => {
  const [punches, setPunches] = useState([]);
  const [allUsers, setAllUsers] = useState([]); // Nova lista de usuários
  const [holidays, setHolidays] = useState([]); // Lista de feriados
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Estado para fechamento manual
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedUserToClose, setSelectedUserToClose] = useState(null);
  const [manualCloseTime, setManualCloseTime] = useState('18:00');
  const [processingClose, setProcessingClose] = useState(false);

  // Estado para Detalhes do Técnico (Escala)
  const [showTechModal, setShowTechModal] = useState(false);
  const [selectedTech, setSelectedTech] = useState(null);
  const [techSchedule, setTechSchedule] = useState({
    monday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
    tuesday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
    wednesday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
    thursday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
    friday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
    saturday: { active: true, start: '08:00', end: '12:00', lunchMinutes: 0 },
    sunday: { active: false, start: '', end: '', lunchMinutes: 0 }
  });


  const [techAutoLunch, setTechAutoLunch] = useState({ override: false, enabled: false, limitTime: '15:30', deductionMinutes: 60 });

  const openTechModal = (user) => {
    setSelectedTech(user);
    // Carrega escala existente ou usa padrão
    const existingSchedule = user.workSchedule || user.schedule;
    if (existingSchedule) {
      setTechSchedule(existingSchedule);
    } else {
      // Reset para padrão
      setTechSchedule({
        monday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
        tuesday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
        wednesday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
        thursday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
        friday: { active: true, start: '08:00', end: '18:00', lunchMinutes: 120 },
        saturday: { active: true, start: '08:00', end: '12:00', lunchMinutes: 0 },
        sunday: { active: false, start: '', end: '', lunchMinutes: 0 }
      });
    }

    // Carrega Auto Lunch do usuário
    if (user.autoLunch) {
      setTechAutoLunch(user.autoLunch);
    } else {
      setTechAutoLunch({ override: false, enabled: false, limitTime: '15:30', deductionMinutes: 60 });
    }

    setShowTechModal(true);
  };

  const saveTechSchedule = async () => {
    if (!selectedTech) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', selectedTech.id), {
        workSchedule: techSchedule,
        autoLunch: techAutoLunch
      });
      alert('Escala e configurações atualizadas com sucesso!');
      setShowTechModal(false);
    } catch (error) {
      console.error("Erro ao salvar escala:", error);
      alert("Erro ao salvar escala.");
    }
  };

  // Estado das abas
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'map' | 'admins'

  const ADMIN_EMAIL = 'cassiomeiraelis@gmail.com'; // Super admin protegido

  // Promover/Rebaixar Admin
  const toggleAdminRole = async (user) => {
    if (user.email === ADMIN_EMAIL) {
      alert('O super administrador não pode ser rebaixado.');
      return;
    }

    try {
      const newRole = user.role === 'admin' ? 'tech' : 'admin';
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), {
        role: newRole
      });
      alert(`Usuário ${newRole === 'admin' ? 'promovido para' : 'rebaixado para'} ${newRole === 'admin' ? 'Administrador' : 'Técnico'}.`);
    } catch (error) {
      console.error('Erro ao alterar role:', error);
      alert('Erro ao atualizar permissões.');
    }
  };

  // Alterar Credenciais (Senha e Email)
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // Estado para Modal de Rota
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [selectedRoutePunches, setSelectedRoutePunches] = useState([]);
  const [selectedRouteUser, setSelectedRouteUser] = useState(null);

  // Estado para Modal de Seleção de Local (Geofencing)
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedUserForLocation, setSelectedUserForLocation] = useState(null);
  const [tempLocation, setTempLocation] = useState(null); // { lat, lng, radius }

  const openPasswordModal = (user) => {
    setSelectedUserForPassword(user);
    setNewPassword('');
    setNewEmail(user.email || '');
    setShowPasswordModal(true);
  };

  const handleUpdateUserCredentials = async () => {
    if (!newPassword.trim() && !newEmail.trim()) return alert("Digite uma nova senha ou email.");
    if (!selectedUserForPassword) return;

    try {
      const updates = {};
      if (newPassword.trim()) updates.password = newPassword.trim();
      if (newEmail.trim()) updates.email = newEmail.trim();

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', selectedUserForPassword.id), updates);
      alert(`Dados de ${selectedUserForPassword.name} atualizados com sucesso!`);
      setShowPasswordModal(false);
    } catch (error) {
      console.error("Erro ao atualizar credenciais:", error);
      alert("Erro ao atualizar credenciais.");
    }
  };

  const openRouteModal = (punches, userName) => {
    // Filtra apenas punches com localização válida
    const validPunches = punches.filter(p => p.location && p.location.lat && p.location.lng);

    if (validPunches.length === 0) {
      alert("Nenhum registro de localização encontrado para este dia.");
      return;
    }

    setSelectedRoutePunches(validPunches);
    setSelectedRouteUser(userName);
    setShowRouteModal(true);
  };

  const openLocationPicker = (user) => {
    setSelectedUserForLocation(user);
    // Se já tiver local, usa. Se não, usa centro padrão (ex: Brasil ou última localização conhecida)
    setTempLocation(user.allowedLocation || { lat: -14.2350, lng: -51.9253, radius: 200 });
    setShowLocationPicker(true);
  };

  const handleSaveLocation = async () => {
    if (!selectedUserForLocation || !tempLocation) return;

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', selectedUserForLocation.id), {
        allowedLocation: tempLocation
      });
      alert(`Local de trabalho de ${selectedUserForLocation.name} definido com sucesso!`);
      setShowLocationPicker(false);
    } catch (error) {
      console.error("Erro ao salvar local:", error);
      alert("Erro ao salvar local de trabalho.");
    }
  };

  // Estado para Notificações
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationBody, setNotificationBody] = useState('');
  const [selectedUsersForNotification, setSelectedUsersForNotification] = useState([]);
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  const handleSendNotification = async () => {
    if (selectedUsersForNotification.length === 0 || !notificationTitle || !notificationBody) return;

    setIsSendingNotification(true);
    try {
      const sendManualNotification = httpsCallable(functions, 'sendManualNotification');
      const result = await sendManualNotification({
        userIds: selectedUsersForNotification,
        title: notificationTitle,
        body: notificationBody
      });

      if (result.data.success) {
        alert('Notificação enviada com sucesso!');
        setNotificationTitle('');
        setNotificationBody('');
        setSelectedUsersForNotification([]);
      } else {
        alert('Erro ao enviar notificação: ' + (result.data.message || 'Erro desconhecido'));
      }
    } catch (error) {
      console.error("Erro ao enviar notificação:", error);
      alert(`Erro ao enviar notificação:\nCódigo: ${error.code}\nMensagem: ${error.message}\n\nVerifique o console para mais detalhes.`);
    } finally {
      setIsSendingNotification(false);
    }
  };

  const handleForceCheck = async () => {
    if (!confirm('Deseja forçar a verificação de atrasos e horas extras agora? Isso enviará notificações para quem estiver irregular.')) return;

    setIsSendingNotification(true);
    try {
      // Use the imported httpsCallable directly
      const forceCheck = httpsCallable(functions, 'forceCheckSchedules');
      const result = await forceCheck();

      alert(`Verificação concluída!\nNotificações enviadas: ${result.data.notificationsSent}`);
    } catch (error) {
      console.error("Erro ao forçar verificação:", error);
      alert(`Erro ao verificar: ${error.message}`);
    } finally {
      setIsSendingNotification(false);
    }
  };


  const [delayWindow, setDelayWindow] = useState(60); // Default 60 min
  const [overtimeWindow, setOvertimeWindow] = useState(120); // Default 120 min

  // Estado para Almoço Automático Global
  const [autoLunchEnabled, setAutoLunchEnabled] = useState(false);
  const [autoLunchLimit, setAutoLunchLimit] = useState('15:30');
  const [autoLunchMinutes, setAutoLunchMinutes] = useState(60);

  // Estados de Filtro de Busca
  const [searchTerm, setSearchTerm] = useState('');
  const [reportSearchTerm, setReportSearchTerm] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'notifications'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          if (data.delayWindow) setDelayWindow(data.delayWindow);
          if (data.overtimeWindow) setOvertimeWindow(data.overtimeWindow);
          if (data.autoLunch) {
            setAutoLunchEnabled(data.autoLunch.enabled ?? false);
            setAutoLunchLimit(data.autoLunch.limitTime ?? '15:30');
            setAutoLunchMinutes(data.autoLunch.minutes ?? 60);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
      }
    };
    loadSettings();
  }, []);

  const saveNotificationSettings = async () => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'notifications'), {
        delayWindow,
        overtimeWindow,
        autoLunch: {
          enabled: autoLunchEnabled,
          limitTime: autoLunchLimit,
          minutes: autoLunchMinutes
        }
      }, { merge: true });
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      alert('Erro ao salvar configurações.');
    }
  };

  // --- EDIÇÃO DE PONTO (GESTOR) ---
  const [showEditPunchModal, setShowEditPunchModal] = useState(false);
  const [editingPunches, setEditingPunches] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [editingDate, setEditingDate] = useState(null);

  const openEditPunchModal = (user, dateStr, dailyPunches) => {
    setEditingUser(user);
    setEditingDate(dateStr);

    // Prepara os dados para edição
    // Se não houver punches, inicia vazio
    const formattedPunches = dailyPunches.map(p => ({
      id: p.id,
      type: p.type,
      time: formatTime(getDateFromTimestamp(p.timestamp)),
      original: p // Guarda referência para deletar se necessário
    })).sort((a, b) => a.time.localeCompare(b.time));

    setEditingPunches(formattedPunches);
    setShowEditPunchModal(true);
  };

  const handleAddPunchRow = () => {
    setEditingPunches([...editingPunches, { id: `temp_${Date.now()}`, type: 'entrada', time: '', isNew: true }]);
  };

  const handleRemovePunchRow = (index) => {
    const newPunches = [...editingPunches];
    newPunches.splice(index, 1);
    setEditingPunches(newPunches);
  };

  const handlePunchChange = (index, field, value) => {
    const newPunches = [...editingPunches];
    newPunches[index][field] = value;
    setEditingPunches(newPunches);
  };

  const savePunchEdits = async () => {
    if (!editingUser || !editingDate) return;

    // Validação básica
    for (const p of editingPunches) {
      if (!p.time) {
        alert("Todos os registros devem ter um horário.");
        return;
      }
    }

    // Validação de Email
    if (!editingUser.email) {
      alert("Erro: Usuário sem e-mail cadastrado. Não é possível editar.");
      return;
    }

    try {
      const batch = writeBatch(db);

      // Solução: Buscar no Firestore todos os punches desse usuário nessa data e deletar.
      const startOfDay = new Date(editingDate + 'T00:00:00');
      const endOfDay = new Date(editingDate + 'T23:59:59');

      // FIX: Usar o estado local 'punches' para filtrar os IDs a serem deletados.
      // Isso evita o erro de "Missing Index" no Firestore para queries compostas (email + timestamp).
      // Como já temos todos os punches carregados na memória, é seguro e mais rápido.
      const punchesToDelete = punches.filter(p => {
        if (p.userEmail !== editingUser.email) return false;
        if (!p.dateObj) return false;
        return p.dateObj >= startOfDay && p.dateObj <= endOfDay;
      });

      punchesToDelete.forEach(p => {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'punches', p.id);
        batch.delete(ref);
      });

      // 2. Criar os novos punches
      editingPunches.forEach(p => {
        const [hours, minutes] = p.time.split(':');
        // FIX: Criar data baseada no início do dia local para evitar problemas de timezone
        const dateObj = new Date(editingDate + 'T00:00:00');
        dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        const newPunchRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'punches'));
        batch.set(newPunchRef, {
          userEmail: editingUser.email,
          userName: editingUser.name,
          type: p.type,
          timestamp: dateObj,
          location: null, // Edição manual não tem GPS
          editedByAdmin: true,
          editedAt: serverTimestamp()
        });
      });

      await batch.commit();
      alert("Registros atualizados com sucesso!");
      setShowEditPunchModal(false);
    } catch (error) {
      console.error("Erro ao salvar edições:", error);
      alert(`Erro ao salvar edições: ${error.message}`);
    }
  };

  // --- FÉRIAS ---
  const [vacationDays, setVacationDays] = useState(30);
  const [showVacationInput, setShowVacationInput] = useState(false);

  const handleVacationRegistration = async () => {
    if (!editingUser || !editingDate) return;
    if (vacationDays < 1) return alert("Mínimo de 1 dia.");

    if (!window.confirm(`Registrar FÉRIAS para ${editingUser.name} iniciando em ${formatDate(editingDate)} por ${vacationDays} dias?\n\nISSO SUBSTITUIRÁ TODOS OS REGISTROS NESTE PERÍODO.`)) return;

    try {
      const batch = writeBatch(db);
      const startDate = new Date(editingDate + 'T00:00:00');

      // Loop pelos dias de férias
      for (let i = 0; i < vacationDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];

        const startOfDay = new Date(dateStr + 'T00:00:00');
        const endOfDay = new Date(dateStr + 'T23:59:59');

        // 1. Deletar registros existentes (precisamos buscar no banco pois podem ser dias futuros que não estão na memória)
        // Como o batch tem limite de 500, e férias podem ser 30 dias, e cada dia pode ter 4 punches... 30*4 = 120. OK.
        // Mas precisamos buscar os IDs primeiro.
        // Para simplificar e evitar muitas leituras, vamos fazer uma query para o range todo.
        // Mas queries em loop são ruins.

        // Melhor: Fazer uma query única para o período todo.
      }

      // Abordagem Otimizada (sem Index Composto):
      // 1. Buscar todos os punches do período (de TODOS os usuários)
      // O Firestore cria índices automáticos para campos individuais.
      // Consultar apenas por timestamp (range) funciona sem índice composto.
      // Depois filtramos por email no cliente.
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + vacationDays);

      const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'punches'),
        where('timestamp', '>=', startDate),
        where('timestamp', '<', endDate)
      );

      const snapshot = await getDocs(q);

      // Filtra em memória para deletar apenas os do usuário atual
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.userEmail === editingUser.email) {
          batch.delete(doc.ref);
        }
      });

      // 2. Criar novos punches de Férias
      for (let i = 0; i < vacationDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        // Pular Finais de Semana? Geralmente férias contam dias corridos.
        // O usuário pediu "quantos dias", então assume-se dias corridos.

        const newPunchRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'punches'));
        batch.set(newPunchRef, {
          userEmail: editingUser.email,
          userName: editingUser.name,
          type: 'ferias',
          timestamp: currentDate, // Meio dia ou 00:00? 00:00 ok.
          location: null,
          editedByAdmin: true,
          editedAt: serverTimestamp()
        });
      }

      await batch.commit();
      alert("Férias registradas com sucesso!");
      setShowEditPunchModal(false);
      setShowVacationInput(false);
    } catch (error) {
      console.error("Erro ao registrar férias:", error);
      alert(`Erro ao registrar férias: ${error.message}`);
    }
  };

  // Toggle Rastreamento
  const toggleTracking = async (user) => {
    try {
      // Se undefined, o padrão é true, então queremos setar para false.
      // Se false, clicar deve setar true.
      // Se true, clicar deve setar false.

      const nextState = user.trackingEnabled === false ? true : false;

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), {
        trackingEnabled: nextState
      });
    } catch (error) {
      console.error("Erro ao alterar rastreamento:", error);
      alert("Erro ao atualizar configuração.");
    }
  };

  // Deletar Técnico e seus dados
  const handleDeleteUser = async (user) => {
    const confirmDelete = window.confirm(
      `ATENÇÃO: Você está prestes a EXCLUIR permanentemente o técnico "${user.name}".\n\n` +
      `Isso irá remover:\n` +
      `• O cadastro do usuário\n` +
      `• TODOS os registros de ponto deste técnico\n` +
      `• Configurações de escala\n\n` +
      `Esta ação NÃO PODE SER DESFEITA!\n\n` +
      `Deseja realmente continuar?`
    );

    if (!confirmDelete) return;

    try {
      const batch = writeBatch(db);
      let userDocRef = null;
      let userEmail = user.email;

      // Se não tiver ID, buscar o usuário pelo nome ou email
      if (!user.id) {
        console.log("Buscando usuário órfão pelo nome:", user.name);
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
        const q = query(usersRef, where('name', '==', user.name));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          throw new Error("Usuário não encontrado no banco de dados.");
        }

        userDocRef = snapshot.docs[0].ref;
        userEmail = snapshot.docs[0].data().email || user.name; // Usa nome como fallback
        console.log("Usuário encontrado:", userDocRef.id);
      } else {
        userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id);
      }

      // 1. Deletar todos os punches do usuário
      const punchesQuery = userEmail
        ? query(
          collection(db, 'artifacts', appId, 'public', 'data', 'punches'),
          where('userEmail', '==', userEmail)
        )
        : query(
          collection(db, 'artifacts', appId, 'public', 'data', 'punches'),
          where('userName', '==', user.name)
        );

      const punchesSnapshot = await getDocs(punchesQuery);

      // Adicionar deleções ao batch
      punchesSnapshot.docs.forEach((punchDoc) => {
        batch.delete(punchDoc.ref);
      });

      // 2. Deletar o documento do usuário
      batch.delete(userDocRef);

      // Executar todas as deleções
      await batch.commit();

      alert(`Técnico "${user.name}" e ${punchesSnapshot.size} registro(s) de ponto foram excluídos com sucesso.`);
    } catch (error) {
      console.error('Erro ao deletar usuário:', error);
      alert(`Erro ao excluir técnico: ${error.message}`);
    }
  };

  // Estado para Edição de Cidade
  const [showCityModal, setShowCityModal] = useState(false);
  const [selectedUserForCity, setSelectedUserForCity] = useState(null);
  const [newCity, setNewCity] = useState('');

  // Estado para Ordenação do Dashboard
  const [sortBy, setSortBy] = useState('name'); // 'name', 'status', 'city'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'

  const handleUpdateCity = async () => {
    if (!selectedUserForCity) return;

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', selectedUserForCity.id), {
        city: newCity.trim()
      });
      setShowCityModal(false);
      setNewCity('');
      setSelectedUserForCity(null);
      alert("Cidade atualizada com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar cidade:", error);
      alert("Erro ao atualizar cidade.");
    }
  };

  const openCityModal = (user) => {
    setSelectedUserForCity(user);
    setNewCity(user.city || '');
    setShowCityModal(true);
  };

  // Buscar Usuários
  useEffect(() => {
    const qUsers = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
    const unsubscribe = onSnapshot(qUsers, (snapshot) => {
      const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllUsers(users); // Agora inclui todos os usuários (admin e tech)
    });
    return () => unsubscribe();
  }, []);

  // Buscar Pontos
  useEffect(() => {
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'punches'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), dateObj: getDateFromTimestamp(doc.data().timestamp) }));
      setPunches(data);
    }, (error) => console.error(error));
    return () => unsubscribe();
  }, []);

  // Buscar Feriados
  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'holidays'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHolidays(data);
    }, (error) => console.error("Erro ao buscar feriados:", error));
    return () => unsubscribe();
  }, []);

  // Importar Feriados Nacionais
  const importNationalHolidays = async () => {
    if (!window.confirm("Deseja importar os feriados nacionais de 2025 e 2026? Isso pode duplicar se já existirem.")) return;

    const nationalHolidays = [
      // 2025
      { date: '2025-01-01', name: 'Confraternização Universal' },
      { date: '2025-03-03', name: 'Carnaval (Segunda)' },
      { date: '2025-03-04', name: 'Carnaval (Terça)' },
      { date: '2025-04-18', name: 'Paixão de Cristo' },
      { date: '2025-04-21', name: 'Tiradentes' },
      { date: '2025-05-01', name: 'Dia do Trabalho' },
      { date: '2025-06-19', name: 'Corpus Christi' },
      { date: '2025-09-07', name: 'Independência do Brasil' },
      { date: '2025-10-12', name: 'Nossa Sra. Aparecida' },
      { date: '2025-11-02', name: 'Finados' },
      { date: '2025-11-15', name: 'Proclamação da República' },
      { date: '2025-11-20', name: 'Dia da Consciência Negra' },
      { date: '2025-12-25', name: 'Natal' },
      // 2026
      { date: '2026-01-01', name: 'Confraternização Universal' },
      { date: '2026-02-16', name: 'Carnaval (Segunda)' },
      { date: '2026-02-17', name: 'Carnaval (Terça)' },
      { date: '2026-04-03', name: 'Paixão de Cristo' },
      { date: '2026-04-21', name: 'Tiradentes' },
      { date: '2026-05-01', name: 'Dia do Trabalho' },
      { date: '2026-06-04', name: 'Corpus Christi' },
      { date: '2026-09-07', name: 'Independência do Brasil' },
      { date: '2026-10-12', name: 'Nossa Sra. Aparecida' },
      { date: '2026-11-02', name: 'Finados' },
      { date: '2026-11-15', name: 'Proclamação da República' },
      { date: '2026-11-20', name: 'Dia da Consciência Negra' },
      { date: '2026-12-25', name: 'Natal' }
    ];

    const batch = writeBatch(db);
    nationalHolidays.forEach(h => {
      const ref = doc(collection(db, 'artifacts', appId, 'public', 'data', 'holidays'));
      batch.set(ref, h);
    });

    try {
      await batch.commit();
      alert("Feriados importados com sucesso!");
    } catch (error) {
      console.error("Erro ao importar feriados:", error);
      alert("Erro ao importar feriados.");
    }
  };

  // Adicionar Feriado Manual
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const addHoliday = async () => {
    if (!newHolidayDate || !newHolidayName) return alert("Preencha data e nome.");
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'holidays'), {
        date: newHolidayDate,
        name: newHolidayName
      });
      setNewHolidayDate('');
      setNewHolidayName('');
    } catch (error) {
      alert("Erro ao adicionar feriado.");
    }
  };

  const deleteHoliday = async (id) => {
    if (!window.confirm("Excluir este feriado?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'holidays', id));
    } catch (error) {
      alert("Erro ao excluir feriado.");
    }
  };

  // EXPORTAR PARA EXCEL (CSV)
  const exportToCSV = () => {
    const filteredData = punches.filter(p => {
      if (!p.dateObj) return false;
      return p.dateObj.toISOString().split('T')[0] === selectedDate;
    });

    if (filteredData.length === 0) {
      alert("Não há dados para exportar nesta data.");
      return;
    }

    const headers = ["Nome", "Email", "Data", "Hora", "Tipo Registro", "Latitude", "Longitude", "Google Maps Link"];

    const rows = filteredData.map(p => {
      const date = formatDate(p.dateObj);
      const time = formatTime(p.dateObj);
      const mapsLink = p.location ? `https://www.google.com/maps/search/?api=1&query=${p.location.lat},${p.location.lng}` : 'Sem GPS';

      const getPunchLabel = (type) => {
        const types = {
          'entrada': 'ENTRADA',
          'saida_almoco': 'SAÍDA ALMOÇO',
          'volta_almoco': 'VOLTA ALMOÇO',
          'saida': 'SAÍDA',
          'lunch_offline': 'ALMOÇO OFFLINE',
          'auto_lunch': 'ALMOÇO AUTOMÁTICO',
          'justificativa_hora_extra': 'JUSTIFICATIVA',
          'atestado': 'ATESTADO',
          'folga': 'FOLGA',
          'ferias': 'FÉRIAS'
        };
        return types[type] || type.toUpperCase();
      };

      return [
        `"${p.userName || 'Desconhecido'}"`,
        `"${p.userEmail || '-'}"`,
        date,
        time,
        `"${getPunchLabel(p.type)}"`,
        p.location ? p.location.lat : '',
        p.location ? p.location.lng : '',
        `"${mapsLink}"`
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_ponto_${selectedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // FECHAMENTO MANUAL DE PONTO
  const handleManualClose = (userStat) => {
    setSelectedUserToClose(userStat);
    setManualCloseTime('18:00');
    setShowCloseModal(true);
  };

  const confirmManualClose = async () => {
    if (!selectedUserToClose) return;

    setProcessingClose(true);
    try {
      // Cria data combinando a data selecionada com a hora digitada (Formato ISO Local)
      const closeDate = new Date(`${selectedDate}T${manualCloseTime}:00`);

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'punches'), {
        userId: selectedUserToClose.punches[0]?.userId || 'manual_admin', // Tenta pegar ID do primeiro ponto ou usa genérico
        userEmail: selectedUserToClose.email,
        userName: selectedUserToClose.name,
        type: 'saida',
        timestamp: closeDate, // Salva como objeto Date (Firestore converte)
        location: null,
        device: 'Ajuste Manual Gestor'
      });

      setShowCloseModal(false);
      setSelectedUserToClose(null);
      alert('Dia encerrado com sucesso!');
    } catch (error) {
      console.error("Erro ao fechar dia:", error);
      alert("Erro ao encerrar dia.");
    } finally {
      setProcessingClose(false);
    }
  };

  const dailyStats = useMemo(() => {
    const statsMap = {};

    // Filtra apenas técnicos para o dashboard (exclui admins)
    const technicians = allUsers.filter(u => u.role === 'tech');

    technicians.forEach(user => {
      statsMap[user.email] = {
        name: user.name,
        email: user.email,
        punches: [],
        totalWorkedMs: 0,
        lunchDurationMs: 0,
        status: 'Offline',

        offlineLunch: null,
        city: user.city || 'Sem cidade'
      };
    });

    punches.forEach(p => {
      if (!p.dateObj) return;
      if (p.dateObj.toISOString().split('T')[0] !== selectedDate) return;

      const userKey = p.userEmail;

      // Encontra o usuário para verificar geofencing
      const userObj = allUsers.find(u => u.email === p.userEmail);

      if (userObj && userObj.role === 'tech') {
        // Verifica Geofencing
        let isOutOfRange = false;
        let distanceFromAllowed = 0;
        if (p.location && userObj.allowedLocation) {
          distanceFromAllowed = calculateDistance(
            p.location.lat,
            p.location.lng,
            userObj.allowedLocation.lat,
            userObj.allowedLocation.lng
          );
          if (distanceFromAllowed > (userObj.allowedLocation.radius || 200)) {
            isOutOfRange = true;
          }
        }

        const punchWithGeo = { ...p, isOutOfRange, distanceFromAllowed };

        if (statsMap[userKey]) {
          statsMap[userKey].punches.push(punchWithGeo);
        } else {
          // Fallback caso não tenha sido inicializado (ex: técnico deletado mas com pontos)
          statsMap[userKey] = {
            name: p.userName || 'Desconhecido',
            email: p.userEmail,
            punches: [punchWithGeo],
            totalWorkedMs: 0, lunchDurationMs: 0, status: 'Offline',
            lastAction: null, lastLocation: null, completed: false, offlineLunch: null,
            city: userObj.city || 'Sem cidade'
          };
        }
      }
    });

    const processedStats = Object.values(statsMap).map(userStat => {
      if (userStat.punches.length === 0) return userStat;

      userStat.punches.sort((a, b) => a.dateObj - b.dateObj);
      const p = userStat.punches;

      // Cálculo robusto para múltiplos turnos
      let lastWorkStart = null;
      let lastLunchStart = null;

      p.forEach(punch => {
        if (punch.type === 'entrada' || punch.type === 'volta_almoco') {
          // Início de trabalho
          // Se já tinha um workStart sem fechar, ignoramos (ou assumimos que o anterior fechou agora? Melhor ignorar para evitar duplicação)
          // Vamos assumir: Sempre que bate entrada/volta, começa a contar.
          if (!lastWorkStart) lastWorkStart = punch.dateObj;

          // Se estava em almoço, fecha o almoço
          if (lastLunchStart) {
            userStat.lunchDurationMs += (punch.dateObj - lastLunchStart);
            lastLunchStart = null;
          }
        } else if (punch.type === 'saida_almoco' || punch.type === 'saida') {
          // Fim de trabalho
          if (lastWorkStart) {
            userStat.totalWorkedMs += (punch.dateObj - lastWorkStart);
            lastWorkStart = null;
          }

          // Se for saída almoço, abre contador de almoço
          if (punch.type === 'saida_almoco') {
            lastLunchStart = punch.dateObj;
          }
        } else if (punch.type === 'lunch_offline' || punch.type === 'auto_lunch') {
          // Almoço offline ou automático, contabiliza duração customizada ou 1h fixa
          const duration = punch.durationMinutes ? (punch.durationMinutes * 60000) : 3600000;
          userStat.lunchDurationMs += duration;

          // Se estava trabalhando, fecha o período de trabalho
          if (lastWorkStart) {
            userStat.totalWorkedMs += (punch.dateObj - lastWorkStart);
            lastWorkStart = null;
          }
          // Armazena o punch de almoço offline para exibir comentário
          userStat.offlineLunch = punch;
          // Não inicia lastLunchStart, pois é um almoço "fora do ponto"
        }
      });

      const last = p[p.length - 1];
      userStat.lastAction = last.type;
      userStat.lastLocation = last.location;

      // Define status e soma tempos em aberto
      const now = new Date();
      // Ajuste: Se a data selecionada NÃO for hoje, não somamos o tempo "em aberto" até agora, pois o dia já acabou.
      // Mas o usuário pode estar vendo o dia de hoje.
      const isToday = selectedDate === now.toISOString().split('T')[0];

      if (lastWorkStart) {
        userStat.status = 'Trabalhando';
        if (isToday) userStat.totalWorkedMs += (now - lastWorkStart);
      } else if (lastLunchStart) {
        userStat.status = 'Em Almoço';
        if (isToday) userStat.lunchDurationMs += (now - lastLunchStart);
      } else {
        if (last.type === 'saida') {
          userStat.status = 'Finalizado';
          userStat.completed = true;
        } else if (last.type === 'lunch_offline' || last.type === 'auto_lunch') {
          // Se o último registro foi almoço offline/auto, ele tecnicamente já "voltou" do almoço (pois é instantâneo)
          // e está trabalhando até bater a saída.

          // Ajuste aqui: Se o último foi lunch_offline/auto, ele está trabalhando.
          userStat.status = 'Trabalhando';
          // E precisamos somar o tempo desde o registro do almoço offline até agora como trabalho
          if (isToday) userStat.totalWorkedMs += (now - last.dateObj);
        } else {
          userStat.status = 'Offline';
        }
      }

      return userStat;
    });



    // Ordenação
    processedStats.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      // Tratamento para strings (case insensitive)
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return processedStats;
  }, [punches, selectedDate, allUsers, sortBy, sortOrder]);

  // Estado para Relatórios
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportUser, setReportUser] = useState('');

  const reportUserObj = useMemo(() => allUsers.find(u => u.id === reportUser), [allUsers, reportUser]);

  // Função auxiliar para obter horas esperadas
  const getExpectedWorkHours = (dayOfWeek, user, date) => {
    // Verifica se é feriado
    const dateStr = date.toISOString().split('T')[0];
    const isHoliday = holidays.some(h => h.date === dateStr);
    if (isHoliday) return 0;

    // Se for ferias, a expectativa é 0 (será tratado no dailyStats, mas aqui ajuda se precisarmos)
    // Como não temos acesso aos punches aqui facilmente sem passar, mantemos a lógica no dailyStats.
    // Mas se quisermos ser precisos:
    // return 0; // Se tivermos certeza. Por enquanto, deixamos o dailyStats zerar.

    // Verifica se tem atestado neste dia (passado via argumento ou buscado nos punches)
    // Como essa função é usada dentro do loop de stats, podemos passar um flag ou verificar os punches do dia
    // Mas aqui só recebemos (dayOfWeek, user, date).
    // Melhor abordagem: A lógica de "Atestado" zera o saldo no cálculo do dailyStats, não necessariamente aqui.
    // MAS, para o saldo ficar 0 (Trabalhado 0 - Esperado 0), precisamos que o esperado seja 0.
    // Vamos ajustar o dailyStats para setar expectedMs = 0 se tiver atestado.

    // Mantemos a lógica padrão aqui.
    let expectedMs = 28800000; // 8 horas padrão (8 * 60 * 60 * 1000)

    if (user && user.workSchedule && user.workSchedule[dayOfWeek]) {
      const sched = user.workSchedule[dayOfWeek];
      if (sched.active) {
        const [sh, sm] = (sched.start || '08:00').split(':').map(Number);
        const [eh, em] = (sched.end || '18:00').split(':').map(Number);
        const lunchMins = sched.lunchMinutes || 0;
        expectedMs = ((eh * 60 + em) - (sh * 60 + sm) - lunchMins) * 60000;
      } else {
        expectedMs = 0; // Folga
      }
    } else if (dayOfWeek === 'saturday') {
      expectedMs = 14400000; // 4 horas padrão (08:00 às 12:00) para Sábado
    } else if (dayOfWeek === 'sunday') {
      expectedMs = 0; // Domingo é folga padrão
    }
    return expectedMs;
  };

  // Cálculo do Relatório Mensal
  const monthlyStats = useMemo(() => {
    if (!reportUser || !reportMonth) return [];

    const [year, month] = reportMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const stats = [];

    // Encontra o objeto user original para obter a escala de trabalho
    const reportUserObj = allUsers.find(u => u.id === reportUser);
    if (!reportUserObj) return [];

    // Filtra punches do usuário e mês selecionados
    const userPunches = punches.filter(p => {
      if (!p.timestamp) return false;
      const pDate = getDateFromTimestamp(p.timestamp);
      if (!pDate) return false;

      // Verifica se é do usuário selecionado (comparando email, que é o vínculo comum)
      const isUser = p.userEmail === reportUserObj.email;

      return isUser &&
        pDate.getMonth() === month - 1 &&
        pDate.getFullYear() === year;
    });

    // Gera estatísticas para cada dia do mês
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDayDate = new Date(year, month - 1, day);
      const dayPunches = userPunches.filter(p => {
        const pDate = getDateFromTimestamp(p.timestamp);
        return pDate.getDate() === day;
      }).sort((a, b) => getDateFromTimestamp(a.timestamp) - getDateFromTimestamp(b.timestamp));

      // Identifica horários
      const entry = dayPunches.find(p => p.type === 'entrada');
      const lunchOut = dayPunches.find(p => p.type === 'saida_almoco');
      const lunchBack = dayPunches.find(p => p.type === 'volta_almoco');
      const exit = dayPunches.findLast(p => p.type === 'saida');
      const offlineLunch = dayPunches.find(p => p.type === 'lunch_offline');
      const atestado = dayPunches.find(p => p.type === 'atestado');
      const ferias = dayPunches.find(p => p.type === 'ferias');
      const folga = dayPunches.find(p => p.type === 'folga');

      let workedMs = 0;
      let lunchMs = 0;

      if (atestado || ferias || folga) {
        // Se tem atestado, férias ou folga, tudo é zero
        workedMs = 0;
        lunchMs = 0;
      } else if (offlineLunch) {
        lunchMs = 3600000; // 1 hora fixa
        if (entry && exit) {
          const totalDuration = exit.timestamp.toDate() - entry.timestamp.toDate();
          workedMs = totalDuration - lunchMs;
        } else if (entry) {
          // Se ainda não saiu, calcula parcial até agora (opcional, mas mantendo simples: só calcula se tiver saída)
          // Para "Trabalhando", podemos estimar, mas o saldo real só fecha na saída.
          // Vamos manter 0 se não tiver saída para evitar confusão, ou calcular parcial se quiser.
          // O código original calculava parcial se 'exit' não existisse mas 'entry' sim?
          // O código original: if (entry && exit) ... else if (entry) ...
          // Vamos adaptar:
          const now = new Date();
          const end = exit ? exit.timestamp.toDate() : now;
          const totalDuration = end - entry.timestamp.toDate();
          workedMs = Math.max(0, totalDuration - lunchMs);
        }
      } else {
        // Cálculo Padrão
        if (lunchOut && lunchBack) {
          lunchMs = lunchBack.timestamp.toDate() - lunchOut.timestamp.toDate();
        }

        if (entry && lunchOut && lunchBack && exit) {
          workedMs = (lunchOut.timestamp.toDate() - entry.timestamp.toDate()) + (exit.timestamp.toDate() - lunchBack.timestamp.toDate());
        } else if (entry && lunchOut && lunchBack) {
          workedMs = (lunchOut.timestamp.toDate() - entry.timestamp.toDate()) + (new Date() - lunchBack.timestamp.toDate());
        } else if (entry && lunchOut) {
          workedMs = lunchOut.timestamp.toDate() - entry.timestamp.toDate();
        } else if (entry) {
          workedMs = new Date() - entry.timestamp.toDate();
        }
      }

      // Correção para não ficar negativo se o almoço offline for maior que o tempo total (ex: acabou de entrar)
      if (workedMs < 0) workedMs = 0;

      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][currentDayDate.getDay()];
      let expectedMs = getExpectedWorkHours(dayOfWeek, reportUserObj, currentDayDate);

      // Se for atestado, férias ou folga, a expectativa é 0
      if (atestado || ferias || folga) expectedMs = 0;

      const balanceMs = workedMs - expectedMs;

      stats.push({
        date: currentDayDate,
        dayOfWeek,
        entry,
        lunchOut,
        lunchBack,
        exit,
        offlineLunch, // Passa o objeto para exibir comentário
        workedMs,
        lunchMs,
        expectedMs,
        balanceMs,
        hasPunches: dayPunches.length > 0,
        punches: dayPunches // Adicionado para permitir edição
      });
    }

    return stats;
  }, [punches, reportMonth, reportUser, allUsers]);

  const activeTechs = dailyStats.filter(s => s.status === 'Trabalhando').length;
  const onLunch = dailyStats.filter(s => s.status === 'Em Almoço').length;
  const totalOvertime = dailyStats.filter(s => s.totalWorkedMs > 28800000).length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <nav className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex flex-col md:flex-row justify-between items-center shadow-sm gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <img src="/logo.jpg" alt="Netcar Logo" className="h-10 w-10 rounded-lg object-cover" />
          <div><h1 className="font-bold text-lg md:text-xl text-slate-800">Netcar Telecom - Gestão</h1><p className="text-xs text-slate-500">Controle de Frota e Ponto</p></div>
        </div>
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="text-right"><p className="text-sm font-bold text-slate-700">{currentUserData.name}</p><p className="text-xs text-slate-500">{currentUserData.email}</p></div>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-500 transition-colors"><LogOut size={20} /></button>
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Data de Análise</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-4 py-2 font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div className="flex gap-4">
            <button
              onClick={exportToCSV}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-colors"
            >
              <FileSpreadsheet size={20} /> Exportar Excel
            </button>
          </div>
        </div>

        {/* ABAS DE NAVEGAÇÃO */}
        <div className="flex gap-4 mb-6 border-b border-slate-200 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-3 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'dashboard' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2 whitespace-nowrap"><LayoutDashboard size={18} /> Visão Geral</div>
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`pb-3 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'map' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2 whitespace-nowrap"><Globe size={18} /> Mapa em Tempo Real</div>
          </button>
          <button
            onClick={() => setActiveTab('admins')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${activeTab === 'admins' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-blue-50'}`}
          >
            <Users size={20} />
            <span className="font-semibold">Administradores</span>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${activeTab === 'notifications' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-blue-50'}`}
          >
            <Mail size={20} />
            <span className="font-semibold">Notificações</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${activeTab === 'reports' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-blue-50'}`}
          >
            <div className="flex items-center gap-2 whitespace-nowrap"><FileText size={18} /> Relatórios</div>
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`pb-3 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'holidays' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2 whitespace-nowrap"><Calendar size={18} /> Feriados</div>
          </button>
        </div>


        {
          activeTab === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
                  <div className="bg-green-100 p-3 rounded-full text-green-600"><Users size={24} /></div>
                  <div><p className="text-2xl font-bold text-slate-800">{activeTechs}</p><p className="text-xs text-slate-500 font-bold uppercase">Ativos</p></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
                  <div className="bg-yellow-100 p-3 rounded-full text-yellow-600"><Coffee size={24} /></div>
                  <div><p className="text-2xl font-bold text-slate-800">{onLunch}</p><p className="text-xs text-slate-500 font-bold uppercase">Em Almoço</p></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
                  <div className="bg-red-100 p-3 rounded-full text-red-600"><AlertTriangle size={24} /></div>
                  <div><p className="text-2xl font-bold text-slate-800">{totalOvertime}</p><p className="text-xs text-slate-500 font-bold uppercase">Hora Extra</p></div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2"><UserCircle size={20} className="text-blue-600" /> Equipe Técnica ({dailyStats.length})</h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar técnico..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600 hidden md:inline-block">Atualizado em Tempo Real</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 font-semibold cursor-pointer hover:text-blue-600 transition-colors" onClick={() => { setSortBy('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                          Técnico {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-6 py-4 font-semibold cursor-pointer hover:text-blue-600 transition-colors" onClick={() => { setSortBy('city'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                          Cidade {sortBy === 'city' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-6 py-4 font-semibold cursor-pointer hover:text-blue-600 transition-colors" onClick={() => { setSortBy('status'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                          Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-6 py-4 font-semibold text-center">Horas Trab.</th>
                        <th className="px-6 py-4 font-semibold text-center">Almoço</th>
                        <th className="px-6 py-4 font-semibold text-center">Hora Extra</th>
                        <th className="px-6 py-4 font-semibold text-right">Localização</th>
                        <th className="px-6 py-4 font-semibold text-center">Rastreio</th>
                        <th className="px-6 py-4 font-semibold text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
                      {dailyStats
                        .filter(stat => (stat.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((stat, idx) => {
                          const hoursWorked = stat.totalWorkedMs / 3600000;
                          const isOvertime = hoursWorked > 8;
                          const lunchHours = stat.lunchDurationMs / 3600000;
                          const lunchAlert = stat.lunchDurationMs > 0 && (lunchHours < 1 || lunchHours > 2);

                          // Encontra o objeto user original para pegar o ID e trackingEnabled
                          const userObj = allUsers.find(u => u.email === stat.email);
                          const isTracking = userObj ? (userObj.trackingEnabled !== false) : true;

                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <button onClick={() => userObj && openTechModal(userObj)} className="text-left hover:bg-slate-100 p-1 -m-1 rounded transition-colors group">
                                  <div className="font-bold text-slate-800 group-hover:text-blue-600 flex items-center gap-2">
                                    {stat.name}
                                    <Settings size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                                  </div>
                                  <div className="text-xs text-slate-400">{stat.email || 'Sem e-mail'}</div>
                                </button>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 group">
                                  <span className="text-sm text-slate-600 font-medium">{stat.city}</span>
                                  {userObj && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openCityModal(userObj);
                                      }}
                                      className="text-slate-400 hover:text-blue-600 transition-colors"
                                      title="Editar Cidade"
                                    >
                                      <Settings size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stat.punches.some(p => p.type === 'atestado') ? 'bg-blue-100 text-blue-800' :
                                  stat.punches.some(p => p.type === 'ferias') ? 'bg-purple-100 text-purple-800' :
                                    stat.punches.some(p => p.type === 'folga') ? 'bg-teal-100 text-teal-800' :
                                      stat.status === 'Trabalhando' ? 'bg-green-100 text-green-800' :
                                        stat.status === 'Em Almoço' ? 'bg-yellow-100 text-yellow-800' :
                                          stat.status === 'Finalizado' ? 'bg-slate-100 text-slate-800' :
                                            stat.status === 'Offline' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-800'
                                  }`}>
                                  {stat.punches.some(p => p.type === 'atestado') ? 'Atestado' :
                                    stat.punches.some(p => p.type === 'ferias') ? 'Férias' :
                                      stat.punches.some(p => p.type === 'folga') ? 'Folga' : stat.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center font-mono">
                                {formatDuration(stat.totalWorkedMs)}
                                <div className="w-20 h-1.5 bg-slate-200 rounded-full mt-1 mx-auto overflow-hidden">
                                  <div className={`h-full rounded-full ${isOvertime ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min((hoursWorked / 8) * 100, 100)}%` }}></div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center font-mono">
                                <div className={`flex flex-col items-center justify-center gap-1 ${lunchAlert ? 'text-red-600 font-bold' : ''}`}>
                                  {stat.offlineLunch ? (
                                    <>
                                      <span className="font-bold text-slate-600">1h (Fixo)</span>
                                      {stat.offlineLunch.justification && (
                                        <span className="text-[10px] text-slate-500 max-w-[100px] truncate" title={stat.offlineLunch.justification}>
                                          {stat.offlineLunch.justification}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {stat.lunchDurationMs > 0 ? formatDuration(stat.lunchDurationMs) : '--'}
                                      {lunchAlert && <AlertTriangle size={14} />}
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                {isOvertime ? <span className="text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded border border-red-100">Sim ({formatDuration(stat.totalWorkedMs - 28800000)})</span> : <span className="text-slate-400">-</span>}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {stat.punches.some(p => p.location) ? (
                                  <div className="flex items-center justify-end gap-2">
                                    {stat.punches.some(p => p.isOutOfRange) && (
                                      <span title="Atenção: Registros fora do local permitido!" className="text-yellow-500 cursor-help">
                                        <AlertTriangle size={16} />
                                      </span>
                                    )}
                                    <button
                                      onClick={() => openRouteModal(stat.punches, stat.name)}
                                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline text-xs font-semibold"
                                    >
                                      <MapPin size={14} /> Ver Mapa
                                    </button>
                                  </div>
                                ) : <span className="text-slate-400 text-xs">Sem GPS</span>}
                              </td>
                              <td className="px-6 py-4 text-center">
                                {userObj && (
                                  <button
                                    onClick={() => toggleTracking(userObj)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isTracking ? 'bg-green-500' : 'bg-slate-300'}`}
                                  >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTracking ? 'translate-x-6' : 'translate-x-1'}`} />
                                  </button>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {(stat.status === 'Trabalhando' || stat.status === 'Em Almoço') && (
                                    <button
                                      onClick={() => handleManualClose(stat)}
                                      className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded-full font-bold transition-colors"
                                    >
                                      Encerrar Dia
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      // Se não tiver userObj, cria um objeto mínimo com os dados disponíveis
                                      const targetUser = userObj || {
                                        id: stat.email ? allUsers.find(u => u.email === stat.email)?.id : null,
                                        name: stat.name,
                                        email: stat.email || null
                                      };

                                      if (!targetUser.id && !targetUser.email) {
                                        alert('Não foi possível identificar este usuário. Use o script do console para deletar.');
                                        return;
                                      }

                                      handleDeleteUser(targetUser);
                                    }}
                                    className="text-xs bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-700 p-2 rounded-full font-bold transition-colors"
                                    title="Excluir técnico e todos os seus dados"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      {dailyStats.length === 0 && <tr><td colSpan="7" className="px-6 py-8 text-center text-slate-400">Nenhum técnico encontrado para esta data.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        }

        {activeTab === 'map' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[600px] relative z-0">
            <MapContainer center={[-14.2350, -51.9253]} zoom={4} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {allUsers.map(user => (
                user.currentLocation && (
                  <Marker key={user.id} position={[user.currentLocation.lat, user.currentLocation.lng]}>
                    <Popup>
                      <div className="text-center">
                        <strong className="block text-lg">{user.name}</strong>
                        <span className="text-xs text-slate-500">{user.email}</span>
                        <br />
                        <span className="text-xs text-slate-400">
                          Visto em: {user.lastSeen ? formatTime(user.lastSeen.toDate()) : 'Desconhecido'}
                        </span>
                      </div>
                    </Popup>
                  </Marker>
                )
              ))}
            </MapContainer>
            {allUsers.filter(u => u.currentLocation).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-[1000] pointer-events-none">
                <div className="bg-white p-4 rounded-lg shadow-lg text-center">
                  <p className="font-bold text-slate-700">Nenhum técnico online com GPS ativo.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><FileText size={20} className="text-indigo-600" /> Gerar Relatório Mensal</h2>
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Mês de Referência</label>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Colaborador</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Filtrar lista..."
                      value={reportSearchTerm}
                      onChange={(e) => setReportSearchTerm(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-t-lg px-4 py-2 font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none border-b-0"
                    />
                    <select
                      value={reportUser}
                      onChange={(e) => setReportUser(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-b-lg px-4 py-2 font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Selecione um técnico...</option>
                      {allUsers
                        .filter(u => u.role !== 'admin')
                        .filter(u => (u.name || '').toLowerCase().includes(reportSearchTerm.toLowerCase()))
                        .map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {reportUser && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700">Detalhamento de Ponto</h3>
                  <div className="text-sm text-slate-500">
                    Total Horas: <strong className="text-slate-800">{formatDuration(monthlyStats.reduce((acc, curr) => acc + curr.workedMs, 0))}</strong>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-3 font-semibold">Data</th>
                        <th className="px-4 py-3 font-semibold">Dia</th>
                        <th className="px-4 py-3 font-semibold text-center">Entrada</th>
                        <th className="px-4 py-3 font-semibold text-center">Saída Almoço</th>
                        <th className="px-4 py-3 font-semibold text-center">Volta Almoço</th>
                        <th className="px-4 py-3 font-semibold text-center">Saída</th>
                        <th className="px-4 py-3 font-semibold text-center">Almoço</th>
                        <th className="px-4 py-3 font-semibold text-center">Trabalhado</th>
                        <th className="px-4 py-3 font-semibold text-center">Saldo</th>
                        <th className="px-4 py-3 font-semibold text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
                      {monthlyStats.map((stat, idx) => {
                        const isWeekend = stat.dayOfWeek === 'saturday' || stat.dayOfWeek === 'sunday';
                        const isAbsent = !stat.hasPunches && !isWeekend;
                        const isAtestado = stat.punches.some(p => p.type === 'atestado');
                        const isFerias = stat.punches.some(p => p.type === 'ferias');
                        const isFolga = stat.punches.some(p => p.type === 'folga');

                        return (
                          <tr key={idx} className={`hover:bg-slate-50 transition-colors ${isAbsent ? 'bg-red-50/30' : ''} ${isWeekend ? 'bg-slate-50/50' : ''}`}>
                            <td className="px-4 py-3 font-mono text-xs">{formatDate(stat.date)}</td>
                            <td className="px-4 py-3 text-xs uppercase font-bold text-slate-500">
                              {stat.dayOfWeek === 'monday' ? 'Seg' :
                                stat.dayOfWeek === 'tuesday' ? 'Ter' :
                                  stat.dayOfWeek === 'wednesday' ? 'Qua' :
                                    stat.dayOfWeek === 'thursday' ? 'Qui' :
                                      stat.dayOfWeek === 'friday' ? 'Sex' :
                                        stat.dayOfWeek === 'saturday' ? 'Sáb' : 'Dom'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isAtestado ? <span className="text-xs font-bold text-blue-600">Atestado</span> : isFerias ? <span className="text-xs font-bold text-purple-600">Férias</span> : isFolga ? <span className="text-xs font-bold text-teal-600">Folga</span> : (stat.entry ? formatTime(getDateFromTimestamp(stat.entry.timestamp)) : '-')}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isAtestado ? <span className="text-xs font-bold text-blue-600">Atestado</span> : isFerias ? <span className="text-xs font-bold text-purple-600">Férias</span> : isFolga ? <span className="text-xs font-bold text-teal-600">Folga</span> : (stat.offlineLunch ? <span className="text-xs text-slate-400">Offline</span> : (stat.lunchOut ? formatTime(getDateFromTimestamp(stat.lunchOut.timestamp)) : '-'))}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isAtestado ? <span className="text-xs font-bold text-blue-600">Atestado</span> : isFerias ? <span className="text-xs font-bold text-purple-600">Férias</span> : isFolga ? <span className="text-xs font-bold text-teal-600">Folga</span> : (stat.offlineLunch ? <span className="text-xs text-slate-400">Offline</span> : (stat.lunchBack ? formatTime(getDateFromTimestamp(stat.lunchBack.timestamp)) : '-'))}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isAtestado ? <span className="text-xs font-bold text-blue-600">Atestado</span> : isFerias ? <span className="text-xs font-bold text-purple-600">Férias</span> : isFolga ? <span className="text-xs font-bold text-teal-600">Folga</span> : (
                                stat.exit ? (
                                  <div className="flex flex-col items-center">
                                    <span>{formatTime(getDateFromTimestamp(stat.exit.timestamp))}</span>
                                    {stat.exit.justification && (
                                      <span className="text-[10px] text-red-500 max-w-[100px] truncate" title={stat.exit.justification}>
                                        {stat.exit.justification}
                                      </span>
                                    )}
                                  </div>
                                ) : '-'
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-xs">
                              {stat.offlineLunch ? (
                                <div className="flex flex-col items-center">
                                  <span className="font-bold text-slate-600">1h (Fixo)</span>
                                  {stat.offlineLunch.justification && (
                                    <span className="text-[10px] text-slate-500 max-w-[100px] truncate" title={stat.offlineLunch.justification}>
                                      {stat.offlineLunch.justification}
                                    </span>
                                  )}
                                </div>
                              ) : (stat.lunchMs > 0 ? formatDuration(stat.lunchMs) : '-')}
                            </td>
                            <td className="px-4 py-3 text-center font-bold">{stat.workedMs > 0 ? formatDuration(stat.workedMs) : '-'}</td>
                            <td className="px-4 py-3 text-center">
                              {stat.balanceMs !== 0 ? (
                                <span className={`text-xs font-bold px-2 py-1 rounded ${stat.balanceMs > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {stat.balanceMs > 0 ? '+' : ''}{formatDuration(stat.balanceMs)}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => openEditPunchModal(reportUserObj, stat.date.toISOString().split('T')[0], stat.punches)}
                                className="text-slate-400 hover:text-indigo-600 p-1 rounded transition-colors"
                                title="Editar Ponto"
                              >
                                <Settings size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const totalBalanceMs = monthlyStats.reduce((acc, curr) => acc + curr.balanceMs, 0);
                        const isPositive = totalBalanceMs >= 0;
                        return (
                          <tr className="bg-slate-100 border-t-2 border-slate-200 font-bold">
                            <td colSpan="8" className="px-4 py-3 text-right text-slate-700 uppercase text-xs tracking-wider">Saldo Total:</td>
                            <td colSpan="2" className={`px-4 py-3 text-center ${isPositive ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                              {isPositive ? '+' : '-'}{formatDuration(Math.abs(totalBalanceMs))}
                            </td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
              </div>
            )
            }
          </div>
        )
        }

        {activeTab === 'holidays' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg text-slate-700 flex items-center gap-2"><Calendar size={20} /> Gestão de Feriados</h3>
              <button
                onClick={importNationalHolidays}
                className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                Importar Feriados Nacionais
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">Data</label>
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-[2]">
                <label className="block text-xs font-bold text-slate-500 mb-1">Nome do Feriado</label>
                <input
                  type="text"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="Ex: Aniversário da Cidade"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={addHoliday}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors h-[38px]"
              >
                Adicionar
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 font-semibold">Data</th>
                    <th className="px-4 py-3 font-semibold">Nome</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
                  {holidays.sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono">{formatDate(new Date(h.date + 'T12:00:00'))}</td>
                      <td className="px-4 py-3 font-bold">{h.name}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deleteHoliday(h.id)} className="text-red-500 hover:text-red-700 p-1">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {holidays.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-4 py-8 text-center text-slate-400">
                        Nenhum feriado cadastrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
        }

        {activeTab === 'notifications' && (
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-100 rounded-xl">
                <Mail className="text-indigo-600" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Enviar Notificações</h2>
                <p className="text-sm text-slate-500">Envie mensagens para os técnicos via aplicativo.</p>
              </div>
              <button
                onClick={handleForceCheck}
                disabled={isSendingNotification}
                className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors font-medium flex items-center gap-2"
              >
                {isSendingNotification ? <Loader2 className="animate-spin" size={18} /> : <BellRing size={18} />}
                Forçar Verificação Automática
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Configurações de Janela de Tempo */}
              <div className="col-span-1 lg:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3">
                  <Settings size={18} /> Configuração de Janelas de Verificação
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Janela de Atraso (minutos após início)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={delayWindow}
                        onChange={(e) => setDelayWindow(Number(e.target.value))}
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Ex: 60"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Tempo após o início do expediente para verificar atrasos.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Janela de Hora Extra (minutos após fim)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={overtimeWindow}
                        onChange={(e) => setOvertimeWindow(Number(e.target.value))}
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Ex: 120"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Tempo após o fim do expediente para verificar horas extras.</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={saveNotificationSettings}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                  >
                    Salvar Configurações
                  </button>
                </div>
              </div>

              {/* Configuração de Almoço Automático (Global) */}
              <div className="col-span-1 lg:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3">
                  <Coffee size={18} /> Configuração de Almoço Automático
                </h3>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="autoLunchEnabled"
                      checked={autoLunchEnabled}
                      onChange={(e) => setAutoLunchEnabled(e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="autoLunchEnabled" className="text-sm font-medium text-slate-700 cursor-pointer">
                      Habilitar Dedução Automática
                    </label>
                  </div>
                </div>

                {autoLunchEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Horário Limite</label>
                      <input
                        type="time"
                        value={autoLunchLimit}
                        onChange={(e) => setAutoLunchLimit(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">Se não marcar almoço até este horário, o sistema deduz automaticamente.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Dedução (Minutos)</label>
                      <select
                        value={autoLunchMinutes}
                        onChange={(e) => setAutoLunchMinutes(Number(e.target.value))}
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value={60}>1 Hora (60 min)</option>
                        <option value={120}>2 Horas (120 min)</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">Tempo descontado da jornada.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Seleção de Usuários */}
              <div className="space-y-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <Users size={18} /> Destinatários
                </h3>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 max-h-[400px] overflow-y-auto">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUsersForNotification(allUsers.filter(u => u.role === 'tech').map(u => u.id));
                        } else {
                          setSelectedUsersForNotification([]);
                        }
                      }}
                      checked={selectedUsersForNotification.length === allUsers.filter(u => u.role === 'tech').length && allUsers.filter(u => u.role === 'tech').length > 0}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-700">Selecionar Todos</span>
                  </div>

                  <div className="space-y-2">
                    {allUsers.filter(u => u.role === 'tech').map(user => (
                      <label key={user.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-100 hover:border-indigo-200 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedUsersForNotification.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsersForNotification([...selectedUsersForNotification, user.id]);
                            } else {
                              setSelectedUsersForNotification(selectedUsersForNotification.filter(id => id !== user.id));
                            }
                          }}
                          className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-slate-800">{user.name}</div>
                          <div className="text-xs text-slate-500">{user.email}</div>
                        </div>
                        {user.fcmTokens && user.fcmTokens.length > 0 ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
                            <Smartphone size={12} /> App Ativo
                          </span>
                        ) : (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">
                            Sem App
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="text-sm text-slate-500 text-right">
                  {selectedUsersForNotification.length} usuários selecionados
                </div>
              </div>

              {/* Composição da Mensagem */}
              <div className="space-y-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <FileText size={18} /> Mensagem
                </h3>
                <div className="space-y-4 bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Título</label>
                    <input
                      type="text"
                      value={notificationTitle}
                      onChange={(e) => setNotificationTitle(e.target.value)}
                      placeholder="Ex: Aviso Importante"
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Conteúdo</label>
                    <textarea
                      value={notificationBody}
                      onChange={(e) => setNotificationBody(e.target.value)}
                      placeholder="Digite sua mensagem aqui..."
                      rows={6}
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    />
                  </div>
                  <button
                    onClick={handleSendNotification}
                    disabled={selectedUsersForNotification.length === 0 || !notificationTitle || !notificationBody || isSendingNotification}
                    className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${selectedUsersForNotification.length === 0 || !notificationTitle || !notificationBody || isSendingNotification ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}
                  >
                    {isSendingNotification ? (
                      <>Enviando...</>
                    ) : (
                      <><ArrowRight size={20} /> Enviar Notificação</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admins' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-700 flex items-center gap-2"><Users size={20} className="text-indigo-600" /> Gestão de Usuários</h3>
              <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">Total: {allUsers.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 font-semibold">Usuário</th>
                    <th className="px-6 py-4 font-semibold">Cidade</th>
                    <th className="px-6 py-4 font-semibold">Função</th>
                    <th className="px-6 py-4 font-semibold text-center">Rastreamento</th>
                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
                  {allUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{user.name}</div>
                        <div className="text-xs text-slate-400">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 group">
                          <span className="text-sm text-slate-600">{user.city || 'Sem cidade'}</span>
                          <button
                            onClick={() => openCityModal(user)}
                            className="text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"
                            title="Editar Cidade"
                          >
                            <Settings size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'}`}>
                          {user.role === 'admin' ? 'Administrador' : 'Técnico'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleTracking(user)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${user.trackingEnabled !== false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                        >
                          {user.trackingEnabled !== false ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openPasswordModal(user)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Trocar Senha"
                          >
                            <Lock size={18} />
                          </button>
                          <button
                            onClick={() => openLocationPicker(user)}
                            className={`p-2 rounded-lg transition-colors ${user.allowedLocation ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                            title={user.allowedLocation ? "Local Configurado (Clique para alterar)" : "Configurar Local de Trabalho"}
                          >
                            <MapPin size={18} />
                          </button>
                          <button
                            onClick={() => openTechModal(user)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Configurar Escala e Almoço"
                          >
                            <Calendar size={18} />
                          </button>
                          <button
                            onClick={() => toggleAdminRole(user)}
                            className={`p-2 rounded-lg transition-colors ${user.role === 'admin' ? 'text-purple-600 hover:bg-purple-50' : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50'}`}
                            title={user.role === 'admin' ? 'Rebaixar para Técnico' : 'Promover para Admin'}
                          >
                            <UserPlus size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir Usuário"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* MODAL DETALHES TÉCNICO (ESCALA) */}
        {
          showTechModal && selectedTech && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 my-8">
                <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
                  <div>
                    <h3 className="font-bold text-xl flex items-center gap-2"><Settings size={24} /> Configuração de Escala</h3>
                    <p className="text-indigo-100 text-sm mt-1">Defina a jornada de trabalho para <strong>{selectedTech.name}</strong></p>
                  </div>
                  <button onClick={() => setShowTechModal(false)} className="hover:bg-indigo-700 p-2 rounded-lg transition-colors"><X size={24} /></button>
                </div>

                <div className="p-6 max-h-[70vh] overflow-y-auto">
                  <div className="space-y-4">
                    {/* Configuração de Auto Lunch (Override) */}
                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          id="techOverrideConfirm"
                          checked={techAutoLunch.override}
                          onChange={(e) => setTechAutoLunch(prev => ({ ...prev, override: e.target.checked }))}
                          className="w-4 h-4 text-orange-600 focus:ring-orange-500 rounded"
                        />
                        <label htmlFor="techOverrideConfirm" className="font-bold text-orange-800 text-sm">
                          Sobrescrever Regra Global de Almoço
                        </label>
                      </div>

                      {techAutoLunch.override && (
                        <div className="pl-6 space-y-3 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="techAutoLunchEnabled"
                              checked={techAutoLunch.enabled}
                              onChange={(e) => setTechAutoLunch(prev => ({ ...prev, enabled: e.target.checked }))}
                              className="w-4 h-4 text-orange-600 focus:ring-orange-500 rounded"
                            />
                            <label htmlFor="techAutoLunchEnabled" className="text-sm font-medium text-slate-700">Habilitar Dedução</label>
                          </div>

                          {techAutoLunch.enabled && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Horário Limite</label>
                                <input
                                  type="time"
                                  value={techAutoLunch.limitTime}
                                  onChange={(e) => setTechAutoLunch(prev => ({ ...prev, limitTime: e.target.value }))}
                                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Dedução (Min)</label>
                                <select
                                  value={techAutoLunch.deductionMinutes}
                                  onChange={(e) => setTechAutoLunch(prev => ({ ...prev, deductionMinutes: Number(e.target.value) }))}
                                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                                >
                                  <option value={60}>60 min</option>
                                  <option value={120}>120 min</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                      const dayLabels = { monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo' };
                      const config = techSchedule[day];

                      return (
                        <div key={day} className={`p-4 rounded-lg border ${config.active ? 'border-indigo-100 bg-indigo-50/30' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={config.active}
                                onChange={(e) => setTechSchedule(prev => ({ ...prev, [day]: { ...prev[day], active: e.target.checked } }))}
                                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className={`font-bold ${config.active ? 'text-indigo-900' : 'text-slate-500'}`}>{dayLabels[day]}</span>
                            </div>
                            {!config.active && <span className="text-xs font-bold text-slate-400 uppercase bg-slate-200 px-2 py-1 rounded">Folga</span>}
                          </div>

                          {config.active && (
                            <div className="grid grid-cols-3 gap-4 pl-8">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Entrada</label>
                                <input
                                  type="time"
                                  value={config.start}
                                  onChange={(e) => setTechSchedule(prev => ({ ...prev, [day]: { ...prev[day], start: e.target.value } }))}
                                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Saída</label>
                                <input
                                  type="time"
                                  value={config.end}
                                  onChange={(e) => setTechSchedule(prev => ({ ...prev, [day]: { ...prev[day], end: e.target.value } }))}
                                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Almoço (min)</label>
                                <input
                                  type="number"
                                  value={config.lunchMinutes}
                                  onChange={(e) => setTechSchedule(prev => ({ ...prev, [day]: { ...prev[day], lunchMinutes: parseInt(e.target.value) || 0 } }))}
                                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                  <button onClick={() => setShowTechModal(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                  <button onClick={saveTechSchedule} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-sm transition-colors flex items-center gap-2">
                    <Save size={18} /> Salvar Escala
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {/* MODAL DE FECHAMENTO MANUAL */}
        {
          showCloseModal && selectedUserToClose && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
                <div className="bg-red-600 p-4 flex justify-between items-center text-white">
                  <h3 className="font-bold flex items-center gap-2"><AlertTriangle size={20} /> Encerrar Dia Manualmente</h3>
                  <button onClick={() => setShowCloseModal(false)} className="hover:bg-red-700 p-1 rounded"><X size={20} /></button>
                </div>
                <div className="p-6">
                  <p className="text-slate-600 mb-4 text-sm">
                    Você está encerrando o dia de <strong>{selectedUserToClose.name}</strong> na data <strong>{formatDate(selectedDate)}</strong>.
                  </p>

                  <label className="block text-sm font-bold text-slate-700 mb-2">Horário de Saída</label>
                  <input
                    type="time"
                    value={manualCloseTime}
                    onChange={(e) => setManualCloseTime(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg font-mono mb-6 focus:ring-2 focus:ring-red-500 outline-none"
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCloseModal(false)}
                      className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmManualClose}
                      disabled={processingClose}
                      className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {processingClose ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : 'Confirmar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        }
        {/* MODAL DE EDIÇÃO DE PONTO */}
        {
          showEditPunchModal && editingUser && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
                <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                  <h3 className="font-bold flex items-center gap-2"><Settings size={20} /> Editar Ponto - {formatDate(editingDate)}</h3>
                  <button onClick={() => setShowEditPunchModal(false)} className="hover:bg-indigo-700 p-1 rounded"><X size={20} /></button>
                </div>
                <div className="p-6">
                  <p className="text-slate-600 mb-4 text-sm">
                    Editando registros de <strong>{editingUser.name}</strong>.
                    <br />
                    <span className="text-xs text-red-500 font-bold">Atenção: As alterações são irreversíveis.</span>
                  </p>

                  <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto pr-2">
                    {editingPunches.map((punch, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                        <input
                          type="time"
                          value={punch.time}
                          onChange={(e) => handlePunchChange(idx, 'time', e.target.value)}
                          className="border border-slate-300 rounded px-2 py-1 text-sm font-mono"
                          disabled={punch.type === 'atestado' || punch.type === 'folga'}
                        />
                        <select
                          value={punch.type}
                          onChange={(e) => handlePunchChange(idx, 'type', e.target.value)}
                          className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm"
                        >
                          <option value="entrada">Entrada</option>
                          <option value="saida_almoco">Saída Almoço</option>
                          <option value="volta_almoco">Volta Almoço</option>
                          <option value="saida">Saída</option>
                          <option value="lunch_offline">Almoço Offline</option>
                          <option value="atestado">Atestado Médico</option>
                          <option value="folga">Folga</option>
                        </select>
                        <button
                          onClick={() => handleRemovePunchRow(idx)}
                          className="text-red-500 hover:bg-red-50 p-1 rounded"
                          title="Remover"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {editingPunches.length === 0 && <p className="text-center text-slate-400 text-sm py-4">Nenhum registro.</p>}
                  </div>

                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={handleAddPunchRow}
                      className="flex-1 py-2 border-2 border-dashed border-slate-300 text-slate-500 rounded-lg hover:border-indigo-500 hover:text-indigo-600 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <Clock size={16} /> Adicionar Registro
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Isso removerá todos os registros do dia e marcará como Atestado. Continuar?")) {
                          setEditingPunches([{ id: `temp_${Date.now()}`, type: 'atestado', time: '00:00', isNew: true }]);
                        }
                      }}
                      className="flex-1 py-2 border-2 border-dashed border-blue-300 text-blue-500 rounded-lg hover:border-blue-500 hover:text-blue-600 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <FileText size={16} /> Registrar Atestado
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Isso removerá todos os registros do dia e marcará como Folga. Continuar?")) {
                          setEditingPunches([{ id: `temp_${Date.now()}`, type: 'folga', time: '00:00', isNew: true }]);
                        }
                      }}
                      className="flex-1 py-2 border-2 border-dashed border-teal-300 text-teal-500 rounded-lg hover:border-teal-500 hover:text-teal-600 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <Coffee size={16} /> Registrar Folga
                    </button>
                  </div>

                  {/* SEÇÃO DE FÉRIAS */}
                  <div className="mb-6 border-t border-slate-100 pt-4">
                    {!showVacationInput ? (
                      <button
                        onClick={() => setShowVacationInput(true)}
                        className="w-full py-2 border-2 border-dashed border-purple-300 text-purple-500 rounded-lg hover:border-purple-500 hover:text-purple-600 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <Calendar size={16} /> Registrar Férias (Lote)
                      </button>
                    ) : (
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 animate-in fade-in slide-in-from-top-2">
                        <h4 className="font-bold text-purple-800 mb-2 text-sm flex items-center gap-2"><Calendar size={16} /> Registrar Férias</h4>
                        <p className="text-xs text-purple-600 mb-3">Iniciando em <strong>{formatDate(editingDate)}</strong></p>

                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-purple-700 mb-1">Qtd. Dias</label>
                            <input
                              type="number"
                              min="1"
                              max="60"
                              value={vacationDays}
                              onChange={(e) => setVacationDays(parseInt(e.target.value) || 0)}
                              className="w-full border border-purple-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                          </div>
                          <button
                            onClick={handleVacationRegistration}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold text-sm h-[38px]"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setShowVacationInput(false)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-2 rounded-lg font-bold text-sm h-[38px]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowEditPunchModal(false)}
                      className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={savePunchEdits}
                      className="flex-1 py-3 bg-indigo-600 text-white font-bold hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
                    >
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        }
        {/* Modal de Edição de Cidade */}
        {showCityModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-indigo-600 p-6 text-white flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <MapPin size={24} /> Editar Cidade
                </h3>
                <button onClick={() => setShowCityModal(false)} className="text-white/80 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Defina a cidade para o técnico <strong>{selectedUserForCity?.name}</strong>.
                </p>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Cidade</label>
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Ex: São Paulo"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCityModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleUpdateCity}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Alteração de Credenciais (Senha e Email) */}
        {showPasswordModal && selectedUserForPassword && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-slate-800 p-6 text-white flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Lock size={24} /> Gerenciar Credenciais
                </h3>
                <button onClick={() => setShowPasswordModal(false)} className="text-white/80 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Alterando dados de acesso para <strong>{selectedUserForPassword.name}</strong>.
                </p>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">E-mail de Acesso</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="novo.email@empresa.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Nova Senha</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Deixe vazio para manter a atual"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Mínimo de 6 caracteres recomendado.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowPasswordModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleUpdateUserCredentials}
                    className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-95"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE ROTA DIÁRIA */}
        {showRouteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Rota Diária: {selectedRouteUser}</h3>
                  <p className="text-sm text-slate-500">Visualizando {selectedRoutePunches.length} registros de localização</p>
                </div>
                <button
                  onClick={() => setShowRouteModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="relative bg-slate-100 h-[600px] w-full">
                <MapContainer
                  key={selectedRouteUser} // Força re-render ao mudar de usuário
                  bounds={selectedRoutePunches.map(p => [p.location.lat, p.location.lng])}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {selectedRoutePunches.map((punch, idx) => (
                    <Marker key={punch.id || idx} position={[punch.location.lat, punch.location.lng]}>
                      <Popup>
                        <div className="text-center min-w-[150px]">
                          <strong className="block text-lg capitalize mb-1">
                            {punch.type === 'entrada' ? 'Entrada' :
                              punch.type === 'saida_almoco' ? 'Saída Almoço' :
                                punch.type === 'volta_almoco' ? 'Volta Almoço' :
                                  punch.type === 'saida' ? 'Saída' : punch.type}
                          </strong>
                          <span className="text-sm font-mono bg-slate-100 px-2 py-1 rounded block mb-2">
                            {formatTime(punch.timestamp.toDate())}
                          </span>
                          {punch.justification && (
                            <p className="text-xs text-slate-500 italic border-t border-slate-200 pt-2 mt-2">
                              "{punch.justification}"
                            </p>
                          )}
                          <div className="text-[10px] text-slate-400 mt-2">
                            Precisão: {Math.round(punch.location.accuracy || 0)}m
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE SELEÇÃO DE LOCAL (GEOFENCING) */}
        {showLocationPicker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Definir Local de Trabalho: {selectedUserForLocation?.name}</h3>
                  <p className="text-sm text-slate-500">Clique no mapa para definir o centro da área permitida.</p>
                </div>
                <button
                  onClick={() => setShowLocationPicker(false)}
                  className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-4 bg-white border-b border-slate-100 flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Raio Permitido (metros)</label>
                  <input
                    type="number"
                    value={tempLocation?.radius || 200}
                    onChange={(e) => setTempLocation({ ...tempLocation, radius: Number(e.target.value) })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleSaveLocation}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg shadow transition-colors flex items-center gap-2"
                >
                  <Save size={18} /> Salvar Local
                </button>
              </div>

              <div className="relative bg-slate-100 h-[500px] w-full">
                <MapContainer
                  center={[tempLocation?.lat || -14.2350, tempLocation?.lng || -51.9253]}
                  zoom={15}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationMarker
                    position={tempLocation}
                    setPosition={setTempLocation}
                    radius={tempLocation?.radius}
                  />
                </MapContainer>
              </div>
            </div>
          </div>
        )}
      </main >
    </div >
  );
};

// 4. Componente Principal (App)
export default function App() {
  const [user, setUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // 1. Tenta recuperar sessão persistente do localStorage
      const savedUserId = localStorage.getItem('ponto_app_user_id');

      if (savedUserId) {
        try {
          const userDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', savedUserId));
          if (userDoc.exists()) {
            setCurrentUserData({ id: userDoc.id, ...userDoc.data() });
          } else {
            localStorage.removeItem('ponto_app_user_id'); // Limpa se usuário não existir mais
          }
        } catch (error) {
          console.error("Erro ao recuperar sessão:", error);
        }
      }

      // 2. Inicializa Auth do Firebase (para anônimo/custom token)
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try { await signInWithCustomToken(auth, __initial_auth_token); }
        catch (e) { await signInAnonymously(auth); }
      } else { await signInAnonymously(auth); }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthInitialized(true);
    });
    return () => unsubscribe();
  }, []);

  const [notificationsBlocked, setNotificationsBlocked] = useState(false);

  // --- NOTIFICAÇÕES (FCM) ---
  useEffect(() => {
    const setupNotifications = async () => {
      if (!user || !currentUserData) return;

      try {
        if (Capacitor.isNativePlatform()) {
          // --- LÓGICA NATIVA (ANDROID/IOS) ---
          const permStatus = await PushNotifications.checkPermissions();

          let permission = permStatus.receive;
          if (permission === 'prompt') {
            permission = (await PushNotifications.requestPermissions()).receive;
          }

          if (permission !== 'granted') {
            // Se for técnico, bloqueia
            if (currentUserData.role !== 'admin') {
              setNotificationsBlocked(true);
            }
          } else {
            setNotificationsBlocked(false);
            await PushNotifications.register();

            // Listener para obter o token
            await PushNotifications.addListener('registration', async (token) => {
              console.log('Push Registration Token:', token.value);
              const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserData.id);
              await updateDoc(userRef, {
                fcmTokens: arrayUnion(token.value)
              });
            });

            await PushNotifications.addListener('registrationError', (err) => {
              console.error('Push Registration Error:', err);
            });

            // Listener para notificações recebidas (Foreground)
            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
              console.log('Push Received:', notification);
              // Verifica se é ação de hora extra
              if (notification.data && notification.data.action === 'overtime_confirm') {
                // O listener no TechnicianView vai pegar isso?
                // Não, precisamos disparar um evento ou usar um estado global.
                // Mas como o TechnicianView também tem acesso ao messaging, vamos tentar manter simples.
                // Para native, o 'messaging' do firebase-js-sdk pode não disparar.
                // Vamos usar um CustomEvent para comunicar com o TechnicianView
                window.dispatchEvent(new CustomEvent('native-push-received', { detail: notification }));
              } else {
                alert(`🔔 ${notification.title}\n${notification.body}`);
              }
            });

            // Listener para clique na notificação
            await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
              console.log('Push Action Performed:', notification);
              if (notification.notification.data && notification.notification.data.action === 'overtime_confirm') {
                window.dispatchEvent(new CustomEvent('native-push-received', { detail: notification.notification }));
              }
            });
          }
        } else {
          // --- LÓGICA WEB (PWA) ---
          if (messaging) {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
              if (currentUserData.role !== 'admin') {
                setNotificationsBlocked(true);
              }
            } else {
              setNotificationsBlocked(false);
              const token = await getToken(messaging).catch(e => console.log("Erro ao obter token Web:", e));
              if (token) {
                const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserData.id);
                await updateDoc(userRef, {
                  fcmTokens: arrayUnion(token)
                });
              }
            }
            // Listener Web
            onMessage(messaging, (payload) => {
              console.log('Mensagem recebida (Web):', payload);
              // Dispara evento compatível
              const notificationData = {
                title: payload.notification.title,
                body: payload.notification.body,
                data: payload.data
              };
              window.dispatchEvent(new CustomEvent('native-push-received', { detail: notificationData }));
            });
          }
        }
      } catch (err) {
        console.error('Erro ao configurar notificações:', err);
      }
    };

    setupNotifications();
  }, [user, currentUserData]);

  const handleLogin = (data) => {
    setCurrentUserData(data);
    localStorage.setItem('ponto_app_user_id', data.id);
  };

  const handleLogout = () => {
    setCurrentUserData(null);
    localStorage.removeItem('ponto_app_user_id');
  };

  if (!authInitialized) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>;

  if (!currentUserData) return <LoginScreen onLogin={handleLogin} />;

  // TELA DE BLOQUEIO DE NOTIFICAÇÕES
  if (notificationsBlocked && currentUserData.role !== 'admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
        <div className="bg-red-500/20 p-6 rounded-full mb-6">
          <BellOff size={64} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-4">Notificações Necessárias</h1>
        <p className="text-slate-300 mb-8 max-w-md">
          Para garantir que você receba avisos importantes sobre seu ponto e horas extras, é obrigatório permitir as notificações.
        </p>
        <button
          onClick={async () => {
            // Tenta solicitar novamente ou abrir configs
            if (Capacitor.isNativePlatform()) {
              // Tenta solicitar
              try {
                const perm = await PushNotifications.requestPermissions();
                if (perm.receive === 'granted') {
                  window.location.reload();
                } else {
                  alert("Você precisa ir nas Configurações do seu celular > Aplicativos > Ponto Digital > Notificações e ativar.");
                }
              } catch (e) {
                alert("Abra as configurações do app e ative as notificações.");
              }
            } else {
              Notification.requestPermission().then(p => {
                if (p === 'granted') window.location.reload();
                else alert("Ative as notificações no cadeado ao lado da URL.");
              });
            }
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl transition-all active:scale-95"
        >
          Ativar Notificações
        </button>
      </div>
    );
  }

  if (currentUserData.role === 'admin') return <ManagerDashboard user={user} currentUserData={currentUserData} onLogout={handleLogout} />;
  return <TechnicianView user={user} currentUserData={currentUserData} onLogout={handleLogout} />;
}