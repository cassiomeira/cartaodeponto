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
  getDoc
} from 'firebase/firestore';
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
  Trash2
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';

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
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
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

  // Ref para o watcher de GPS
  const watchIdRef = useRef(null);

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
    if (type === 'saida' && currentUserData?.schedule) {
      const now = new Date();
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
      const todaySchedule = currentUserData.schedule[dayOfWeek];

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
    if (lastPunch.type === 'entrada') return 'saida_almoco';
    if (lastPunch.type === 'saida_almoco') return 'volta_almoco';
    if (lastPunch.type === 'volta_almoco') return 'saida';
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

            <div className="grid grid-cols-2 gap-4">
              <ActionButton type="saida_almoco" label="Saída Almoço" icon={Coffee} colorClass="bg-yellow-500 hover:bg-yellow-600" active={nextAction === 'saida_almoco'} />
              <ActionButton type="volta_almoco" label="Volta Almoço" icon={CheckCircle} colorClass="bg-yellow-600 hover:bg-yellow-700" active={nextAction === 'volta_almoco'} />
            </div>
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
                <p className="font-bold text-slate-800 text-sm uppercase tracking-wide">{punch.type.replace('_', ' ')}</p>
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

      {/* MODAL DE JUSTIFICATIVA DE HORA EXTRA */}
      {showJustificationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-yellow-500 p-4 flex justify-between items-center text-white">
              <h3 className="font-bold flex items-center gap-2"><AlertTriangle size={20} /> Hora Extra Detectada</h3>
              <button onClick={() => {
                setShowJustificationModal(false);
                setPendingPunchData(null);
                setJustification('');
              }} className="hover:bg-yellow-600 p-1 rounded"><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-slate-600 mb-4 text-sm">
                Você está encerrando o dia <strong>após o horário agendado</strong> (tolerância de 10 min excedida).
                <br /><br />
                <strong>É obrigatório justificar o motivo:</strong>
              </p>

              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ex: Finalizando chamado urgente no cliente X..."
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm mb-6 focus:ring-2 focus:ring-yellow-500 outline-none h-32 resize-none"
              />

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

    </div>
  );
};

// 3. Dashboard do Gestor (Completo)
const ManagerDashboard = ({ currentUserData, onLogout }) => {
  const [punches, setPunches] = useState([]);
  const [allUsers, setAllUsers] = useState([]); // Nova lista de usuários
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

  const openTechModal = (user) => {
    setSelectedTech(user);
    // Carrega escala existente ou usa padrão
    if (user.workSchedule) {
      setTechSchedule(user.workSchedule);
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
    setShowTechModal(true);
  };

  const saveTechSchedule = async () => {
    if (!selectedTech) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', selectedTech.id), {
        workSchedule: techSchedule
      });
      alert('Escala atualizada com sucesso!');
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

      return [
        `"${p.userName || 'Desconhecido'}"`,
        `"${p.userEmail || '-'}"`,
        date,
        time,
        `"${p.type.toUpperCase()}"`,
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
        lastAction: null,
        lastLocation: null,
        completed: false
      };
    });

    punches.forEach(p => {
      if (!p.dateObj) return;
      if (p.dateObj.toISOString().split('T')[0] !== selectedDate) return;

      const userKey = p.userEmail;

      if (statsMap[userKey]) {
        statsMap[userKey].punches.push(p);
      } else {
        // Só adiciona se for de um técnico (não admin)
        const userObj = allUsers.find(u => u.email === p.userEmail);
        if (userObj && userObj.role === 'tech') {
          if (p.userEmail) {
            statsMap[userKey] = {
              name: p.userName || 'Desconhecido',
              email: p.userEmail,
              punches: [p],
              totalWorkedMs: 0, lunchDurationMs: 0, status: 'Offline',
              lastAction: null, lastLocation: null, completed: false
            };
          }
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
        } else {
          userStat.status = 'Offline'; // Caso estranho
        }
      }

      return userStat;
    });

    return processedStats;
  }, [punches, selectedDate, allUsers]);

  // Estado para Relatórios
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportUser, setReportUser] = useState('');

  // Cálculo do Relatório Mensal
  const monthlyStats = useMemo(() => {
    if (!reportUser || !reportMonth) return [];

    const [year, month] = reportMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const stats = [];

    // Encontra o usuário selecionado para obter o email
    const targetUser = allUsers.find(u => u.id === reportUser);
    if (!targetUser) return [];

    // Filtra punches do usuário e mês selecionados
    const userPunches = punches.filter(p => {
      if (!p.timestamp) return false;
      const pDate = getDateFromTimestamp(p.timestamp);
      if (!pDate) return false;

      // Verifica se é do usuário selecionado (comparando email, que é o vínculo comum)
      const isUser = p.userEmail === targetUser.email;

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

      // Cálculos de tempo
      let workedMs = 0;
      let lunchMs = 0;

      if (entry && exit) {
        const start = getDateFromTimestamp(entry.timestamp);
        const end = getDateFromTimestamp(exit.timestamp);
        workedMs = end - start;

        if (lunchOut && lunchBack) {
          const lStart = getDateFromTimestamp(lunchOut.timestamp);
          const lEnd = getDateFromTimestamp(lunchBack.timestamp);
          lunchMs = lEnd - lStart;
          workedMs -= lunchMs; // Subtrai almoço do total
        }
      } else if (dayPunches.length > 0) {
        // Cálculo parcial se tiver punches soltos (opcional, mas bom para mostrar algo)
        // Simplificação: se tiver entrada e saída de almoço, conta esse trecho
        if (entry && lunchOut) {
          workedMs += getDateFromTimestamp(lunchOut.timestamp) - getDateFromTimestamp(entry.timestamp);
        }
        if (lunchBack && exit) {
          workedMs += getDateFromTimestamp(exit.timestamp) - getDateFromTimestamp(lunchBack.timestamp);
        }
      }

      // Busca configuração de escala do usuário para o dia da semana
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][currentDayDate.getDay()];
      const targetUser = allUsers.find(u => u.id === reportUser || u.email === reportUser);
      let expectedMs = 28800000; // 8 horas padrão

      if (targetUser && targetUser.schedule && targetUser.schedule[dayOfWeek]) {
        const sched = targetUser.schedule[dayOfWeek];
        if (sched.active) {
          const [sh, sm] = (sched.start || '08:00').split(':').map(Number);
          const [eh, em] = (sched.end || '18:00').split(':').map(Number);
          const lunchMins = sched.lunchMinutes || 0;
          expectedMs = ((eh * 60 + em) - (sh * 60 + sm) - lunchMins) * 60000;
        } else {
          expectedMs = 0; // Folga
        }
      }

      // Se for fim de semana e não tiver escala definida, assume folga (0 horas)
      if (!targetUser?.schedule && (dayOfWeek === 'saturday' || dayOfWeek === 'sunday')) {
        expectedMs = 0;
      }

      const balanceMs = workedMs - expectedMs;

      stats.push({
        date: currentDayDate,
        dayOfWeek,
        entry,
        lunchOut,
        lunchBack,
        exit,
        workedMs,
        lunchMs,
        expectedMs,
        balanceMs,
        hasPunches: dayPunches.length > 0
      });
    }

    return stats;
  }, [punches, reportMonth, reportUser, allUsers]);

  const activeTechs = dailyStats.filter(s => s.status === 'Trabalhando').length;
  const onLunch = dailyStats.filter(s => s.status === 'Em Almoço').length;
  const totalOvertime = dailyStats.filter(s => s.totalWorkedMs > 28800000).length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2 rounded-lg"><LayoutDashboard size={24} /></div>
          <div><h1 className="font-bold text-xl text-slate-800">Painel de Gestão ISP</h1><p className="text-xs text-slate-500">Controle de Frota e Ponto</p></div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right"><p className="text-sm font-bold text-slate-700">{currentUserData.name}</p><p className="text-xs text-slate-500">{currentUserData.email}</p></div>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-500 transition-colors"><LogOut size={20} /></button>
        </div>
      </nav>

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Data de Análise</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-4 py-2 font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
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
        <div className="flex gap-4 mb-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-3 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'dashboard' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2"><LayoutDashboard size={18} /> Visão Geral</div>
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`pb-3 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'map' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2"><Globe size={18} /> Mapa em Tempo Real</div>
          </button>
          {/* Temporariamente desabilitado para debug
          <button
            onClick={() => setActiveTab('admins')}
            className={`pb-3 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'admins' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
          </button>
          */}
          <button
            onClick={() => setActiveTab('reports')}
            className={`pb-3 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'reports' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2"><FileText size={18} /> Relatórios</div>
          </button>
        </div>


        {
          activeTab === 'dashboard' ? (
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
                  <h3 className="font-bold text-slate-700 flex items-center gap-2"><UserCircle size={20} className="text-indigo-600" /> Equipe Técnica ({dailyStats.length})</h3>
                  <span className="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">Atualizado em Tempo Real</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 font-semibold">Técnico</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold text-center">Horas Trab.</th>
                        <th className="px-6 py-4 font-semibold text-center">Almoço</th>
                        <th className="px-6 py-4 font-semibold text-center">Hora Extra</th>
                        <th className="px-6 py-4 font-semibold text-right">Localização</th>
                        <th className="px-6 py-4 font-semibold text-center">Rastreio</th>
                        <th className="px-6 py-4 font-semibold text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
                      {dailyStats.map((stat, idx) => {
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
                                <div className="font-bold text-slate-800 group-hover:text-indigo-600 flex items-center gap-2">
                                  {stat.name}
                                  <Settings size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                                </div>
                                <div className="text-xs text-slate-400">{stat.email || 'Sem e-mail'}</div>
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stat.status === 'Trabalhando' ? 'bg-green-100 text-green-800' : stat.status === 'Em Almoço' ? 'bg-yellow-100 text-yellow-800' : stat.status === 'Finalizado' ? 'bg-slate-100 text-slate-800' : stat.status === 'Offline' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-800'}`}>{stat.status}</span>
                            </td>
                            <td className="px-6 py-4 text-center font-mono">
                              {formatDuration(stat.totalWorkedMs)}
                              <div className="w-20 h-1.5 bg-slate-200 rounded-full mt-1 mx-auto overflow-hidden">
                                <div className={`h-full rounded-full ${isOvertime ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min((hoursWorked / 8) * 100, 100)}%` }}></div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center font-mono">
                              <div className={`flex items-center justify-center gap-1 ${lunchAlert ? 'text-red-600 font-bold' : ''}`}>
                                {stat.lunchDurationMs > 0 ? formatDuration(stat.lunchDurationMs) : '--'}
                                {lunchAlert && <AlertTriangle size={14} />}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {isOvertime ? <span className="text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded border border-red-100">Sim ({formatDuration(stat.totalWorkedMs - 28800000)})</span> : <span className="text-slate-400">-</span>}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {stat.lastLocation ? (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${stat.lastLocation.lat},${stat.lastLocation.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline text-xs font-semibold">
                                  <MapPin size={14} /> Ver Mapa
                                </a>
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
          ) : activeTab === 'reports' ? (
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
                    <select
                      value={reportUser}
                      onChange={(e) => setReportUser(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">Selecione um técnico...</option>
                      {allUsers.filter(u => u.role !== 'admin').map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
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
                        </tr>
                      </thead>
                      <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
                        {monthlyStats.map((stat, idx) => {
                          const isWeekend = stat.dayOfWeek === 'saturday' || stat.dayOfWeek === 'sunday';
                          const isAbsent = !stat.hasPunches && !isWeekend;

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
                              <td className="px-4 py-3 text-center">{stat.entry ? formatTime(getDateFromTimestamp(stat.entry.timestamp)) : '-'}</td>
                              <td className="px-4 py-3 text-center">{stat.lunchOut ? formatTime(getDateFromTimestamp(stat.lunchOut.timestamp)) : '-'}</td>
                              <td className="px-4 py-3 text-center">{stat.lunchBack ? formatTime(getDateFromTimestamp(stat.lunchBack.timestamp)) : '-'}</td>
                              <td className="px-4 py-3 text-center">{stat.exit ? formatTime(getDateFromTimestamp(stat.exit.timestamp)) : '-'}</td>
                              <td className="px-4 py-3 text-center text-xs">{stat.lunchMs > 0 ? formatDuration(stat.lunchMs) : '-'}</td>
                              <td className="px-4 py-3 text-center font-bold">{stat.workedMs > 0 ? formatDuration(stat.workedMs) : '-'}</td>
                              <td className="px-4 py-3 text-center">
                                {stat.balanceMs !== 0 ? (
                                  <span className={`text-xs font-bold px-2 py-1 rounded ${stat.balanceMs > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {stat.balanceMs > 0 ? '+' : ''}{formatDuration(stat.balanceMs)}
                                  </span>
                                ) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
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
          )
        }

        {/* ADMIN TAB - Temporariamente desabilitado para debug
        {activeTab === 'admins' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            Admin content here
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

  if (currentUserData.role === 'admin') return <ManagerDashboard user={user} currentUserData={currentUserData} onLogout={handleLogout} />;
  return <TechnicianView user={user} currentUserData={currentUserData} onLogout={handleLogout} />;
}