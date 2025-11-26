
import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import TripEditor from './components/TripEditor';
import TripViewer from './components/TripViewer';
import { auth, db } from './firebase';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { TripData } from './types';
import { Map, Plus, LogOut, Loader2, MapPin, Pencil, Trash2, Download, X, Share2, LogIn, User as UserIcon } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  
  const [view, setView] = useState<'LIST' | 'create' | 'EDIT' | 'VIEW'>('LIST');
  const [trips, setTrips] = useState<TripData[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);

  // Modal States
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthInitialized(true);
      // Close auth modal if user logs in successfully
      if (currentUser) setShowAuthModal(false);
    });

    // PWA Install Event Listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Fetch Trips whenever user state changes or view is LIST
  useEffect(() => {
    if (authInitialized && view === 'LIST') {
      fetchTrips();
    }
  }, [user, authInitialized, view]);

  const fetchTrips = async () => {
    try {
      let q;
      // If logged in, prioritize my trips? Or show all public trips?
      // Requirement: "Guest sees main screen".
      // Let's logic: If user is logged in, show THEIR trips (Personal Log).
      // If guest, show ALL trips (Public Feed).
      
      if (user) {
         q = query(
            collection(db, 'trips'),
            where('userId', '==', user.uid)
        );
      } else {
        // Guest view: Show all trips (limit to recent 20 for safety if needed, here fetching all)
        // Ideally should have an index on createdAt.
        // For now, fetching collection and sorting client-side to avoid "Index Required" error on fresh DBs.
        q = query(collection(db, 'trips'));
      }

      const querySnapshot = await getDocs(q);
      const fetchedTrips: TripData[] = [];
      querySnapshot.forEach((doc) => {
        fetchedTrips.push({ id: doc.id, ...doc.data() } as TripData);
      });
      
      // Sort client-side
      fetchedTrips.sort((a,b) => b.createdAt - a.createdAt);
      
      setTrips(fetchedTrips);
    } catch (error) {
      console.error("Error fetching trips:", error);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  const handleCreateTripClick = () => {
      if (user) {
          setView('create');
      } else {
          setShowAuthModal(true);
      }
  };

  const handleEditTrip = (e: React.MouseEvent, trip: TripData) => {
    e.stopPropagation();
    setSelectedTrip(trip);
    setView('EDIT');
  };

  const handleDeleteTrip = async (e: React.MouseEvent, tripId: string) => {
    e.stopPropagation();
    if (window.confirm("정말로 이 여행 기록을 삭제하시겠습니까? 복구할 수 없습니다.")) {
        try {
            await deleteDoc(doc(db, "trips", tripId));
            setTrips(trips.filter(t => t.id !== tripId));
            alert("삭제되었습니다.");
        } catch (error) {
            console.error("Error deleting trip:", error);
            alert("삭제 중 오류가 발생했습니다.");
        }
    }
  };

  const handleSignOut = async () => {
    if(window.confirm("로그아웃 하시겠습니까?")) {
        await signOut(auth);
        setView('LIST'); // Reset view
    }
  };

  const handleShareApp = async () => {
      const shareData = {
          title: 'TripFlow - 여행 지도',
          text: '나만의 다이나믹한 여행 지도를 만들어보세요!',
          url: window.location.href
      };

      if (navigator.share) {
          try {
              await navigator.share(shareData);
          } catch (err) {
              console.log('Share canceled');
          }
      } else {
          try {
              await navigator.clipboard.writeText(window.location.href);
              alert('주소가 클립보드에 복사되었습니다.');
          } catch (err) {
              alert('공유하기를 지원하지 않는 브라우저입니다.');
          }
      }
  };

  if (!authInitialized) return <div className="h-screen flex justify-center items-center bg-gray-50"><Loader2 className="animate-spin text-indigo-600" size={48} /></div>;

  // View Routing
  if (view === 'create') {
    return <TripEditor onFinish={() => setView('LIST')} />;
  }

  if (view === 'EDIT') {
      return <TripEditor onFinish={() => { setSelectedTrip(null); setView('LIST'); }} initialData={selectedTrip} />;
  }

  if (view === 'VIEW' && selectedTrip) {
    return <TripViewer trip={selectedTrip} onClose={() => { setSelectedTrip(null); setView('LIST'); }} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Auth Modal */}
      {showAuthModal && <Auth onClose={() => setShowAuthModal(false)} />}

      <header className="bg-white shadow-sm sticky top-0 z-40 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer group" onClick={() => setView('LIST')}>
            <div className="bg-indigo-600 p-1.5 rounded-lg text-white group-hover:bg-indigo-700 transition">
                <Map size={20} />
            </div>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">TripFlow</h1>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-4">
             {/* PWA Install Button (Only if prompt available) */}
             {showInstallBtn && (
                 <button 
                    onClick={handleInstallClick}
                    className="flex items-center text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition"
                 >
                    <Download size={14} className="mr-1"/> 앱 설치
                 </button>
             )}

             {/* Share Button */}
             <button 
                onClick={handleShareApp}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition"
                title="앱 공유하기"
             >
                <Share2 size={20} />
             </button>

             <div className="h-6 w-px bg-gray-200 mx-2"></div>

             {/* User Controls */}
             {user ? (
                 <div className="flex items-center gap-3">
                     <div className="hidden sm:flex flex-col items-end">
                        <span className="text-xs font-bold text-gray-700">{user.displayName || '여행자'}</span>
                        <span className="text-[10px] text-gray-400">{user.email}</span>
                     </div>
                     <button onClick={handleSignOut} className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-full transition" title="로그아웃">
                        <LogOut size={20} />
                     </button>
                 </div>
             ) : (
                 <button 
                    onClick={() => setShowAuthModal(true)}
                    className="flex items-center bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 transition shadow-lg shadow-gray-200"
                 >
                    <LogIn size={16} className="mr-2" /> 로그인
                 </button>
             )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                {user ? (
                    <>
                        <UserIcon size={24} className="mr-2 text-indigo-500"/> 나의 여행 기록
                    </>
                ) : (
                    <>
                        <MapPin size={24} className="mr-2 text-indigo-500"/> 공개된 여행들
                    </>
                )}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
                {user ? '내가 기록한 멋진 여행들을 확인하세요.' : '다른 여행자들의 발자취를 따라가보세요.'}
            </p>
          </div>
          
          <button 
            onClick={handleCreateTripClick}
            className="w-full sm:w-auto flex items-center justify-center bg-indigo-600 text-white px-5 py-3 rounded-xl hover:bg-indigo-700 transition shadow-lg hover:shadow-indigo-500/30 font-bold transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus size={20} className="mr-2" /> 여행 기록하기
          </button>
        </div>

        {trips.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300">
            <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Map size={32} className="text-gray-400" />
            </div>
            <h3 className="text-gray-800 font-bold text-lg mb-1">등록된 여행이 없습니다</h3>
            <p className="text-gray-500 mb-6">첫 번째 여행을 기록하고 추억을 남겨보세요!</p>
            <button 
                onClick={handleCreateTripClick}
                className="text-indigo-600 font-bold hover:underline"
            >
                지금 작성하기 &rarr;
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trips.map((trip) => (
              <div 
                key={trip.id} 
                onClick={() => { setSelectedTrip(trip); setView('VIEW'); }}
                className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden border border-gray-100 group relative flex flex-col h-full transform hover:-translate-y-1"
              >
                {/* Edit/Delete Controls - Only for Owner */}
                {user && user.uid === trip.userId && (
                    <div className="absolute top-3 right-3 z-10 flex space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                        <button 
                            onClick={(e) => handleEditTrip(e, trip)}
                            className="p-2 bg-white/90 hover:bg-white text-indigo-600 rounded-full shadow-lg backdrop-blur hover:text-indigo-700"
                            title="수정"
                        >
                            <Pencil size={16} />
                        </button>
                        <button 
                            onClick={(e) => trip.id && handleDeleteTrip(e, trip.id)}
                            className="p-2 bg-white/90 hover:bg-white text-red-500 rounded-full shadow-lg backdrop-blur hover:text-red-600"
                            title="삭제"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                )}

                <div className="h-52 overflow-hidden relative bg-gray-200">
                   <img 
                    src={trip.points[0]?.photoUrl || 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'} 
                    alt={trip.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
                    }}
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                   <div className="absolute bottom-0 left-0 p-5 text-white w-full">
                      <h3 className="text-xl font-bold leading-tight mb-1 shadow-black drop-shadow-md">{trip.title}</h3>
                      <div className="flex items-center text-xs opacity-90 font-medium">
                         <span className="bg-white/20 px-2 py-0.5 rounded backdrop-blur-sm mr-2">
                             {new Date(trip.createdAt).toLocaleDateString()}
                         </span>
                         {!user && <span className="text-white/70">by {trip.userId.slice(0,5)}...</span>}
                      </div>
                   </div>
                </div>
                
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center text-xs font-bold text-indigo-600 mb-3 bg-indigo-50 w-fit px-2 py-1 rounded">
                    <MapPin size={12} className="mr-1" />
                    {trip.points.length}개의 체크포인트
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4 flex-1">
                    {trip.points[0]?.description || '작성된 설명이 없습니다.'}
                  </p>
                  
                  <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center">
                    <div className="flex -space-x-2">
                         {/* Mini avatars of locations */}
                         {trip.points.slice(0,3).map((p, i) => (
                             <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 overflow-hidden">
                                 <img src={p.photoUrl} className="w-full h-full object-cover" alt="" />
                             </div>
                         ))}
                         {trip.points.length > 3 && (
                             <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[8px] text-gray-500 font-bold">
                                 +{trip.points.length - 3}
                             </div>
                         )}
                    </div>
                    <span className="text-indigo-600 text-sm font-bold group-hover:translate-x-1 transition-transform inline-flex items-center">
                        떠나기 &rarr;
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
