
import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import TripEditor from './components/TripEditor';
import TripViewer from './components/TripViewer';
import InstallPrompt from './components/InstallPrompt';
import { auth, db } from './firebase';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { TripData } from './types';
import { Map, Plus, LogOut, Loader2, MapPin, Pencil, Trash2, Download, Share2, LogIn, User as UserIcon, Globe, Compass, AlertCircle, Lock, Sun, Moon, Mail, ExternalLink } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [view, setView] = useState<'LIST' | 'create' | 'EDIT' | 'VIEW'>('LIST');
  const [activeTab, setActiveTab] = useState<'MINE' | 'ALL'>('ALL'); 
  
  const [trips, setTrips] = useState<TripData[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const [pendingTripId, setPendingTripId] = useState<string | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthInitialized(true);
      if (currentUser) {
          setShowAuthModal(false);
          if (view === 'LIST' && activeTab === 'ALL') {
             setActiveTab('MINE'); 
          }
      } else {
          setActiveTab('ALL');
      }
    });

    const params = new URLSearchParams(window.location.search);
    const tid = params.get('tripId');
    if (tid) {
        setPendingTripId(tid);
        window.history.replaceState({}, '', window.location.pathname);
    }

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
      const loadPendingTrip = async () => {
          if (!pendingTripId || !authInitialized) return;
          try {
              const docRef = doc(db, 'trips', pendingTripId);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                  const tripData = { id: docSnap.id, ...docSnap.data() } as TripData;
                  if (tripData.visibility === 'PRIVATE' && (!user || user.uid !== tripData.userId)) {
                      alert("비공개 여행입니다.");
                      setPendingTripId(null);
                      return;
                  }
                  setSelectedTrip(tripData);
                  setView('VIEW');
              }
          } catch (e) { console.error(e); } finally { setPendingTripId(null); }
      };
      loadPendingTrip();
  }, [pendingTripId, authInitialized, user]);

  useEffect(() => {
    if (authInitialized && view === 'LIST') {
      fetchTrips();
    }
  }, [user, authInitialized, view, activeTab]);

  const fetchTrips = async () => {
    setIsLoadingTrips(true);
    setFetchError(null);
    try {
      let q;
      if (activeTab === 'MINE' && user) {
         q = query(collection(db, 'trips'), where('userId', '==', user.uid));
      } else {
         q = query(collection(db, 'trips'));
      }
      const querySnapshot = await getDocs(q);
      const fetchedTrips: TripData[] = [];
      querySnapshot.forEach((doc) => {
        fetchedTrips.push({ id: doc.id, ...doc.data() } as TripData);
      });
      let visibleTrips = activeTab === 'ALL' ? fetchedTrips.filter(t => t.visibility !== 'PRIVATE') : fetchedTrips;
      visibleTrips.sort((a,b) => b.createdAt - a.createdAt);
      setTrips(visibleTrips);
    } catch (error: any) {
      setFetchError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoadingTrips(false);
    }
  };

  const handleSignOut = async () => {
    if(window.confirm("로그아웃 하시겠습니까?")) {
        await signOut(auth);
        setView('LIST'); 
        setActiveTab('ALL');
    }
  };

  if (!authInitialized) return <div className={`h-screen flex justify-center items-center ${isDarkMode ? 'bg-slate-950' : 'bg-stone-50'}`}><Loader2 className="animate-spin text-indigo-600" size={48} /></div>;

  if (view === 'create') return <TripEditor onFinish={() => setView('LIST')} />;
  if (view === 'EDIT') return <TripEditor onFinish={() => { setSelectedTrip(null); setView('LIST'); }} initialData={selectedTrip} />;
  if (view === 'VIEW' && selectedTrip) return <TripViewer trip={selectedTrip} onClose={() => { setSelectedTrip(null); setView('LIST'); }} />;

  return (
    <div className={`min-h-screen transition-colors duration-500 flex flex-col ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-stone-50 text-gray-900'}`}>
      <InstallPrompt deferredPrompt={deferredPrompt} setDeferredPrompt={setDeferredPrompt} isIOS={isIOS} />
      {showAuthModal && <Auth onClose={() => setShowAuthModal(false)} />}

      <header className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-white/80 border-stone-200 shadow-sm'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer group" onClick={() => setView('LIST')}>
            <div className="bg-indigo-600 p-2 rounded-xl text-white group-hover:bg-indigo-700 transition-all transform group-hover:rotate-6">
                <Map size={22} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter italic">TripFlow</h1>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-4">
             {/* Theme Toggle */}
             <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`p-2 rounded-xl transition-all ${isDarkMode ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700' : 'bg-stone-100 text-indigo-600 hover:bg-stone-200'}`}
             >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
             </button>

             <button onClick={() => {
                 if(navigator.share) navigator.share({title: 'TripFlow', url: window.location.origin});
                 else { navigator.clipboard.writeText(window.location.origin); alert('복사되었습니다.'); }
             }} className={`p-2 rounded-xl transition-all ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-stone-500 hover:bg-stone-100'}`}>
                <Share2 size={20} />
             </button>

             <div className={`h-6 w-px mx-1 ${isDarkMode ? 'bg-slate-800' : 'bg-stone-200'}`}></div>

             {user ? (
                 <div className="flex items-center gap-3">
                     <button onClick={handleSignOut} className={`p-2 rounded-xl transition-all ${isDarkMode ? 'text-slate-400 hover:text-red-400 hover:bg-slate-800' : 'text-stone-400 hover:text-red-500 hover:bg-red-50'}`}>
                        <LogOut size={20} />
                     </button>
                 </div>
             ) : (
                 <button onClick={() => setShowAuthModal(true)} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20">
                    로그인
                 </button>
             )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow">
        <div className="flex flex-col sm:flex-row justify-between items-end mb-10 gap-6">
          <div className="max-w-xl">
            <h2 className="text-4xl font-black mb-3 leading-tight tracking-tight">
                {activeTab === 'MINE' ? '나만의 여행 서재' : '전 세계 여행자의 발자취'}
            </h2>
            <p className={`text-lg font-medium ${isDarkMode ? 'text-slate-400' : 'text-stone-500'}`}>
                {activeTab === 'MINE' ? '잊고 싶지 않은 소중한 순간들이 여기 모두 담겨있어요.' : '다른 사람들은 어떤 길을 걸었을까요? 새로운 영감을 얻어보세요.'}
            </p>
          </div>
          
          <button onClick={() => user ? setView('create') : setShowAuthModal(true)} className="group flex items-center bg-indigo-600 text-white px-8 py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-500/40 font-black text-lg transform hover:-translate-y-1 active:scale-95">
            <Plus size={24} className="mr-2 group-hover:rotate-90 transition-transform" /> 새로운 여정 시작
          </button>
        </div>

        <div className={`flex border-b mb-12 ${isDarkMode ? 'border-slate-800' : 'border-stone-200'}`}>
            <button onClick={() => setActiveTab('ALL')} className={`px-8 py-4 text-sm font-black flex items-center transition-all border-b-2 ${activeTab === 'ALL' ? 'text-indigo-600 border-indigo-600' : 'text-stone-400 border-transparent hover:text-stone-600'}`}>
                <Globe size={18} className="mr-2"/> 여행 둘러보기
            </button>
            {user && (
                <button onClick={() => setActiveTab('MINE')} className={`px-8 py-4 text-sm font-black flex items-center transition-all border-b-2 ${activeTab === 'MINE' ? 'text-indigo-600 border-indigo-600' : 'text-stone-400 border-transparent hover:text-stone-600'}`}>
                    <Compass size={18} className="mr-2"/> 나의 스크랩북
                </button>
            )}
        </div>

        {isLoadingTrips ? (
           <div className="flex justify-center py-24"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>
        ) : fetchError ? (
           <div className={`rounded-3xl p-12 text-center max-w-lg mx-auto border ${isDarkMode ? 'bg-red-950/20 border-red-900/50' : 'bg-red-50 border-red-100'}`}>
               <AlertCircle size={48} className="text-red-500 mx-auto mb-4"/>
               <h3 className="text-xl font-black mb-2">문제가 발생했습니다</h3>
               <p className="text-red-400 font-medium">{fetchError}</p>
           </div>
        ) : trips.length === 0 ? (
          <div className={`text-center py-24 rounded-3xl border-2 border-dashed transition-colors ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-stone-200'}`}>
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${isDarkMode ? 'bg-slate-800' : 'bg-stone-100'}`}><Map size={40} className="text-stone-400" /></div>
            <h3 className="text-2xl font-black mb-2">아직 지도가 비어있네요</h3>
            <p className="text-stone-500 mb-8 font-medium">당신만의 멋진 지도를 첫 번째로 그려보세요!</p>
            <button onClick={() => user ? setView('create') : setShowAuthModal(true)} className="text-indigo-600 font-black hover:underline text-lg">지금 바로 기록하기 &rarr;</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {trips.map((trip) => (
              <div 
                key={trip.id} 
                onClick={() => { setSelectedTrip(trip); setView('VIEW'); }}
                className={`group relative flex flex-col h-full rounded-[2.5rem] overflow-hidden transition-all duration-500 transform hover:-translate-y-2 border shadow-sm hover:shadow-2xl ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-stone-100'}`}
              >
                {user && user.uid === trip.userId && (
                    <div className="absolute top-5 right-5 z-20 flex space-x-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                        {trip.visibility === 'PRIVATE' && <div className="p-2.5 bg-black/60 text-white rounded-full backdrop-blur-md border border-white/20"><Lock size={16} /></div>}
                        <button onClick={(e) => { e.stopPropagation(); setSelectedTrip(trip); setView('EDIT'); }} className="p-2.5 bg-white text-indigo-600 rounded-full shadow-xl hover:scale-110 transition"><Pencil size={16} /></button>
                        <button onClick={async (e) => { 
                            e.stopPropagation(); 
                            if(window.confirm('삭제하시겠습니까?')) {
                                await deleteDoc(doc(db, "trips", trip.id!));
                                setTrips(prev => prev.filter(t => t.id !== trip.id));
                            }
                        }} className="p-2.5 bg-white text-red-500 rounded-full shadow-xl hover:scale-110 transition"><Trash2 size={16} /></button>
                    </div>
                )}

                <div className="h-64 overflow-hidden relative">
                   <img 
                    src={trip.thumbnailUrl || trip.points[0]?.photoUrl || 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80'} 
                    alt={trip.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                   <div className="absolute bottom-0 left-0 p-8 w-full">
                      <div className="flex items-center text-[10px] font-black tracking-widest uppercase text-indigo-400 mb-2">
                         <span className="bg-indigo-950/50 px-2 py-1 rounded backdrop-blur-sm border border-indigo-500/30">{new Date(trip.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h3 className="text-2xl font-black text-white leading-tight drop-shadow-lg group-hover:text-indigo-300 transition-colors">{trip.title}</h3>
                   </div>
                </div>
                
                <div className="p-8 flex-1 flex flex-col">
                  <div className={`inline-flex items-center text-xs font-black uppercase tracking-wider mb-4 px-3 py-1.5 rounded-full ${isDarkMode ? 'bg-slate-800 text-indigo-400' : 'bg-stone-100 text-indigo-600'}`}>
                    <MapPin size={14} className="mr-1.5" />
                    {trip.points.length} Checkpoints
                  </div>
                  <p className={`text-sm font-medium leading-relaxed line-clamp-2 mb-6 ${isDarkMode ? 'text-slate-400' : 'text-stone-500'}`}>
                    {trip.points[0]?.description || '기록된 이야기가 시작되는 곳입니다.'}
                  </p>
                  <div className={`mt-auto pt-6 border-t flex justify-between items-center ${isDarkMode ? 'border-slate-800' : 'border-stone-100'}`}>
                    <div className="flex -space-x-3">
                         {trip.points.slice(0,4).map((p, i) => (
                             <div key={i} className="w-9 h-9 rounded-full border-[3px] border-white dark:border-slate-900 bg-gray-200 overflow-hidden shadow-sm">
                                 <img src={p.photoUrl} className="w-full h-full object-cover" alt="" />
                             </div>
                         ))}
                    </div>
                    <span className="text-indigo-600 text-sm font-black group-hover:translate-x-2 transition-transform inline-flex items-center italic">Explore &rarr;</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer Section */}
      <footer className={`mt-20 py-16 border-t transition-colors duration-500 ${isDarkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-stone-100 border-stone-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-8">
                <div className="flex items-center space-x-2 opacity-60">
                    <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
                        <Map size={16} />
                    </div>
                    <span className="text-lg font-black tracking-tighter italic">TripFlow</span>
                </div>
                
                <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-4 text-sm font-bold tracking-tight">
                    <div className="flex items-center gap-2 group cursor-default">
                        <span className={`px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 text-[10px] uppercase font-black`}>Creator</span>
                        <span className={isDarkMode ? 'text-slate-300' : 'text-stone-700'}>GREAK80K</span>
                    </div>
                    <span className="hidden sm:inline opacity-20">|</span>
                    <a href="mailto:hwanace@naver.com" className={`flex items-center gap-1.5 transition-colors ${isDarkMode ? 'text-slate-400 hover:text-indigo-400' : 'text-stone-500 hover:text-indigo-600'}`}>
                        <Mail size={14} />
                        <span>hwanace@naver.com</span>
                    </a>
                    <span className="hidden sm:inline opacity-20">|</span>
                    <a href="https://ranihwanibaby.tistory.com/" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 transition-colors ${isDarkMode ? 'text-slate-400 hover:text-indigo-400' : 'text-stone-500 hover:text-indigo-600'}`}>
                        <ExternalLink size={14} />
                        <span>블로그</span>
                    </a>
                    <span className="hidden sm:inline opacity-20">|</span>
                    <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 transition-colors ${isDarkMode ? 'text-slate-400 hover:text-indigo-400' : 'text-stone-500 hover:text-indigo-600'}`}>
                        <ExternalLink size={14} />
                        <span>YOUTUBE</span>
                    </a>
                </div>
                
                <div className="text-center space-y-2">
                    <p className={`text-[11px] font-black uppercase tracking-[0.2em] opacity-30 ${isDarkMode ? 'text-slate-500' : 'text-stone-400'}`}>
                        Crafting your digital footprints, one map at a time.
                    </p>
                    <p className={`text-[10px] font-medium opacity-20 ${isDarkMode ? 'text-slate-500' : 'text-stone-400'}`}>
                        © 2024 TripFlow Journey. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
