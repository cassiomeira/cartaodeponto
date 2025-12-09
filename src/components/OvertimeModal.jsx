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
